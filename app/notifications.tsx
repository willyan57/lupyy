// app/notifications.tsx — Instagram-style unified notifications
import { useTheme } from "@/contexts/ThemeContext";
import { getFollowState } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Types ──────────────────────────────────────────────

type Notification = {
  id: string;
  actor_id: string;
  type: string;
  post_id: number | null;
  story_id: number | null;
  comment_id: number | null;
  metadata: any;
  is_read: boolean;
  created_at: string;
  actor_username: string | null;
  actor_full_name: string | null;
  actor_avatar_url: string | null;
  // local state
  follow_state?: "following" | "not_following" | "loading";
};

type TimeGroup = {
  label: string;
  data: Notification[];
};

// ─── Helpers ────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}sem`;
}

function groupByTime(items: Notification[]): TimeGroup[] {
  const now = Date.now();
  const today: Notification[] = [];
  const thisWeek: Notification[] = [];
  const thisMonth: Notification[] = [];
  const older: Notification[] = [];

  for (const item of items) {
    const diff = now - new Date(item.created_at).getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    if (days < 1) today.push(item);
    else if (days < 7) thisWeek.push(item);
    else if (days < 30) thisMonth.push(item);
    else older.push(item);
  }

  const groups: TimeGroup[] = [];
  if (today.length) groups.push({ label: "Hoje", data: today });
  if (thisWeek.length) groups.push({ label: "Esta semana", data: thisWeek });
  if (thisMonth.length) groups.push({ label: "Este mês", data: thisMonth });
  if (older.length) groups.push({ label: "Anteriores", data: older });
  return groups;
}

function getNotificationMessage(n: Notification): string {
  switch (n.type) {
    case "like":
      return "curtiu sua publicação.";
    case "comment":
      return "comentou na sua publicação.";
    case "follow":
      return "começou a seguir você.";
    case "crush":
      return "marcou você como crush! 💘";
    case "silent_crush":
      return "tem interesse em você.";
    case "super_crush":
      return "usou um Super Crush em você! 🚀";
    case "story_like":
      return "curtiu seu story.";
    case "comment_like":
      return "curtiu seu comentário.";
    case "mention":
      return "mencionou você.";
    case "status_change":
      return "ficou disponível! 👀";
    case "profile_view":
      return "👀 Alguém visitou seu perfil";
    case "profile_trending":
      return "🔥 Seu perfil está em alta hoje!";
    case "mystery_interest":
      return "💫 Alguém está interessado em você...";
    case "level_up":
      return "🎉 Você subiu de nível!";
    case "new_badge":
      return "🏆 Você ganhou uma nova conquista!";
    case "match":
      return "💘 É um match! O interesse é mútuo!";
    default:
      return "interagiu com você.";
  }
}

function getNotificationEmoji(type: string): string {
  switch (type) {
    case "like": return "❤️";
    case "comment": return "💬";
    case "follow": return "👤";
    case "crush": return "💘";
    case "silent_crush": return "🤫";
    case "super_crush": return "🚀";
    case "story_like": return "🔥";
    case "comment_like": return "💜";
    case "mention": return "@";
    case "status_change": return "👀";
    case "profile_view": return "👀";
    case "profile_trending": return "🔥";
    case "mystery_interest": return "💫";
    case "level_up": return "⬆️";
    case "new_badge": return "🏆";
    case "match": return "💘";
    default: return "🔔";
  }
}

// ─── Component ──────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_user_notifications", {
        _limit: 80,
        _offset: 0,
      });

      if (error) {
        console.error("Erro ao buscar notificações:", error);
        // Fallback: try old table
        await fetchLegacyNotifications();
        return;
      }

      if (!data || data.length === 0) {
        setNotifications([]);
        return;
      }

      // Check follow state for follow-type notifications
      const { data: { user } } = await supabase.auth.getUser();
      const enriched: Notification[] = data.map((n: any) => ({
        ...n,
        follow_state: "not_following" as const,
      }));

      // Batch check follow states for follow/crush notifications
      if (user) {
        const followTypeNotifs = enriched.filter(
          (n) => n.type === "follow" || n.type === "crush"
        );
        await Promise.all(
          followTypeNotifs.map(async (n) => {
            try {
              const state = await getFollowState(user.id, n.actor_id);
              n.follow_state = state.exists ? "following" : "not_following";
            } catch {}
          })
        );
      }

      setNotifications(enriched);

      // Mark all as read
      await supabase.rpc("mark_notifications_read").catch(() => {});
    } catch (err) {
      console.error("Erro notificações:", err);
      await fetchLegacyNotifications();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fallback for old status_change_notifications table
  const fetchLegacyNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("status_change_notifications")
        .select("*")
        .eq("notified_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!data || data.length === 0) {
        setNotifications([]);
        return;
      }

      const userIds = [...new Set(data.map((n: any) => n.changed_user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const mapped: Notification[] = data.map((n: any) => {
        const profile = profileMap.get(n.changed_user_id) as any;
        return {
          id: n.id,
          actor_id: n.changed_user_id,
          type: "status_change",
          post_id: null,
          story_id: null,
          comment_id: null,
          metadata: { old_status: n.old_status, new_status: n.new_status },
          is_read: n.is_read,
          created_at: n.created_at,
          actor_username: profile?.username ?? null,
          actor_full_name: profile?.full_name ?? null,
          actor_avatar_url: profile?.avatar_url ?? null,
          follow_state: "not_following" as const,
        };
      });

      setNotifications(mapped);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchNotifications();
    }, [fetchNotifications])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handlePress = (n: Notification) => {
    if (n.post_id) {
      // Navigate to feed (could deep-link to post in the future)
      router.push({ pathname: "/profile", params: { userId: n.actor_id } });
    } else {
      router.push({ pathname: "/profile", params: { userId: n.actor_id } });
    }
  };

  const handleFollowBack = async (n: Notification, index: number) => {
    const updated = [...notifications];
    updated[index] = { ...n, follow_state: "loading" };
    setNotifications(updated);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("follows").upsert({
        follower_id: user.id,
        following_id: n.actor_id,
        interest_type: "friend",
      });

      const updated2 = [...notifications];
      updated2[index] = { ...n, follow_state: "following" };
      setNotifications(updated2);
    } catch {
      const updated2 = [...notifications];
      updated2[index] = { ...n, follow_state: "not_following" };
      setNotifications(updated2);
    }
  };

  // ─── Render ─────────────────────────────────────────

  const groups = groupByTime(notifications);

  const renderNotification = (item: Notification, flatIndex: number) => {
    const displayName = item.actor_full_name || item.actor_username || "Alguém";
    const showFollowBtn = (item.type === "follow" || item.type === "crush") && item.follow_state !== "following";

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card,
          !item.is_read && { backgroundColor: `${theme.colors.primary}10` },
        ]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {item.actor_avatar_url ? (
            <Image source={{ uri: item.actor_avatar_url }} style={[styles.avatar, { borderColor: theme.colors.primary }]} />
          ) : (
            <View style={[styles.avatarPlaceholder, { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}20` }]}>
              <Text style={[styles.avatarInitial, { color: theme.colors.primary }]}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.emojiOverlay, { backgroundColor: theme.colors.background }]}>
            <Text style={styles.emoji}>{getNotificationEmoji(item.type)}</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={2}>
            <Text style={[styles.nameText, { color: theme.colors.primary }]}>{displayName}</Text>
            {" "}{getNotificationMessage(item)}
          </Text>
          <Text style={[styles.timeText, { color: theme.colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
        </View>

        {/* Follow back button */}
        {showFollowBtn && (
          <TouchableOpacity
            style={[
              styles.followBtn,
              item.follow_state === "loading" && styles.followBtnLoading,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => handleFollowBack(item, flatIndex)}
            disabled={item.follow_state === "loading"}
          >
            {item.follow_state === "loading" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.followBtnText}>Seguir de volta</Text>
            )}
          </TouchableOpacity>
        )}

        {item.follow_state === "following" && (item.type === "follow" || item.type === "crush") && (
          <View style={[styles.followingBadge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.followingText, { color: theme.colors.textMuted }]}>Seguindo</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🔔</Text>
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Nenhuma notificação</Text>
      <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
        Quando alguém curtir, comentar ou seguir você, aparecerá aqui.
      </Text>
    </View>
  );

  // Flatten groups into a single list with section headers
  const flatData: Array<{ type: "header"; label: string } | { type: "item"; notification: Notification; flatIndex: number }> = [];
  let flatIdx = 0;
  for (const group of groups) {
    flatData.push({ type: "header", label: group.label });
    for (const item of group.data) {
      flatData.push({ type: "item", notification: item, flatIndex: flatIdx++ });
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: theme.colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Notificações</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item, i) => item.type === "header" ? `h-${item.label}` : `n-${(item as any).notification.id}`}
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionHeaderText, { color: theme.colors.text }]}>{item.label}</Text>
                </View>
              );
            }
            return renderNotification(item.notification, item.flatIndex);
          }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: {
    fontSize: 22,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "700",
  },
  emojiOverlay: {
    position: "absolute",
    bottom: -2,
    right: -4,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  nameText: {
    fontWeight: "700",
  },
  timeText: {
    fontSize: 12,
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
    minWidth: 100,
    alignItems: "center",
  },
  followBtnLoading: {
    opacity: 0.7,
  },
  followBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  followingBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
  },
  followingText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
