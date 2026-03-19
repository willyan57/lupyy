// app/(tabs)/conversations/index.tsx
import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type RpcConversation = {
  id: string;
  conversation_type: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string | null;
  other_user_id: string | null;
  other_user_username: string | null;
  other_user_full_name: string | null;
  other_user_avatar: string | null;
};

export default function ConversationsScreen() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"friend" | "crush">("friend");

  const [friendConversations, setFriendConversations] = useState<RpcConversation[]>([]);
  const [crushConversations, setCrushConversations] = useState<RpcConversation[]>([]);

  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  // ── Relationship status lock ──
  const [myRelationshipStatus, setMyRelationshipStatus] = useState<string | null>(null);
  const isCrushLocked = myRelationshipStatus === "committed" || myRelationshipStatus === "dating" || myRelationshipStatus === "married";

  // ── Animated badge scale ──
  const badgeScale = useRef(new Animated.Value(1)).current;

  const animateBadge = useCallback(() => {
    Animated.sequence([
      Animated.timing(badgeScale, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(badgeScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [badgeScale]);

  const refreshUnreadCountsForLists = async (
    friendsList?: RpcConversation[],
    crushList?: RpcConversation[]
  ) => {
    const baseFriends = friendsList ?? friendConversations;
    const baseCrushes = crushList ?? crushConversations;

    const allIds = [...baseFriends, ...baseCrushes].map((c) => c.id);
    if (allIds.length === 0) {
      setUnreadMap({});
      return;
    }

    const { data, error } = await supabase
      .from("unread_counts")
      .select("conversation_id, unread")
      .in("conversation_id", allIds);

    if (error || !data) return;

    const map: Record<string, number> = {};
    (data as { conversation_id: string; unread: number }[]).forEach((row: any) => {
      map[row.conversation_id] = row.unread;
    });

    const prevTotal = Object.values(unreadMap).reduce((s, v) => s + v, 0);
    const newTotal = Object.values(map).reduce((s, v) => s + v, 0);
    if (newTotal > prevTotal) animateBadge();

    setUnreadMap(map);
  };

  const markConversationAsRead = async (conversationId: string) => {
    setUnreadMap((prev) => ({
      ...prev,
      [conversationId]: 0,
    }));

    const { error } = await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conversationId);

    await refreshUnreadCountsForLists();
  };

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      setCurrentUserId(data.user.id);

      // Fetch relationship status
      const { data: profile } = await supabase
        .from("profiles")
        .select("relationship_status")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.relationship_status) {
        setMyRelationshipStatus(profile.relationship_status);
      }
    };
    loadUser();
  }, []);

  const loadConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_user_conversations_full");

      if (error || !data) {
        console.error("RPC error:", error);
        return;
      }

      const all = data as RpcConversation[];
      const friends = all.filter((c) => c.conversation_type === "friend");
      const crushes = all.filter((c) => c.conversation_type === "crush");

      setFriendConversations(friends);
      setCrushConversations(crushes);

      await refreshUnreadCountsForLists(friends, crushes);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ── Refresh on screen focus ──
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  useEffect(() => {
    const channel = supabase
      .channel("messages-unread-listener")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          refreshUnreadCountsForLists();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => {
          refreshUnreadCountsForLists();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [friendConversations.length, crushConversations.length]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.replace("/(tabs)/feed");
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => {
        subscription.remove();
      };
    }, [router])
  );

  // ── Delete conversation ──
  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      if (!currentUserId) return;
      Alert.alert(
        "Excluir conversa",
        "Tem certeza? A conversa será removida da sua lista.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Excluir",
            style: "destructive",
            onPress: async () => {
              await supabase
                .from("conversation_deletions")
                .upsert(
                  {
                    conversation_id: conversationId,
                    user_id: currentUserId,
                    deleted_at: new Date().toISOString(),
                  },
                  { onConflict: "conversation_id,user_id" }
                );

              // Remove from local state immediately
              setFriendConversations((prev) =>
                prev.filter((c) => c.id !== conversationId)
              );
              setCrushConversations((prev) =>
                prev.filter((c) => c.id !== conversationId)
              );
            },
          },
        ]
      );
    },
    [currentUserId]
  );

  const data =
    activeTab === "friend" ? friendConversations : crushConversations;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredData = normalizedSearch
    ? data.filter((item) => {
        const name =
          item.other_user_full_name ||
          item.other_user_username ||
          "Usuário";
        const preview = item.last_message || "";
        const n = name.toLowerCase();
        const p = preview.toLowerCase();
        return n.includes(normalizedSearch) || p.includes(normalizedSearch);
      })
    : data;

  const friendUnreadTotal = friendConversations.reduce(
    (sum, c) => sum + (unreadMap[c.id] || 0),
    0
  );
  const crushUnreadTotal = crushConversations.reduce(
    (sum, c) => sum + (unreadMap[c.id] || 0),
    0
  );

  const handleOpenConversation = (conversationId: string) => {
    markConversationAsRead(conversationId);
    router.push({
      pathname: "/conversations/[id]",
      params: { id: conversationId, type: activeTab },
    });
  };

  // ── Format relative time ──
  function formatRelativeTime(dateStr?: string | null) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "agora";
      if (diffMin < 60) return `${diffMin}m`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `${diffH}h`;
      const diffD = Math.floor(diffH / 24);
      if (diffD < 7) return `${diffD}d`;
      return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
    } catch {
      return "";
    }
  }

  const renderItem = ({ item }: { item: RpcConversation }) => {
    const name =
      item.other_user_full_name?.trim() ||
      item.other_user_username?.trim() ||
      "Usuário";
    const preview = item.last_message || "Comece a conversa";
    const unreadCount = unreadMap[item.id] || 0;
    const timeStr = formatRelativeTime(item.last_message_at);

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handleOpenConversation(item.id)}
        onLongPress={() => handleDeleteConversation(item.id)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {item.other_user_avatar ? (
            <Image
              source={{ uri: item.other_user_avatar }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>
                {name.substring(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          {item.conversation_type === "crush" && (
            <View style={styles.crushIndicator}>
              <Text style={{ fontSize: 10 }}>💘</Text>
            </View>
          )}
        </View>

        {/* Text */}
        <View style={styles.rowText}>
          <View style={styles.rowTopLine}>
            <Text
              style={[
                styles.rowName,
                unreadCount > 0 && styles.rowNameUnread,
              ]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text style={styles.rowTime}>{timeStr}</Text>
          </View>
          <Text
            style={[
              styles.rowPreview,
              unreadCount > 0 && styles.rowPreviewUnread,
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
        </View>

        {/* Badge */}
        {unreadCount > 0 && (
          <Animated.View
            style={[styles.unreadBadge, { transform: [{ scale: badgeScale }] }]}
          >
            <Text style={styles.unreadBadgeText}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Text>
          </Animated.View>
        )}
      </TouchableOpacity>
    );
  };

  if (!currentUserId) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#888" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "friend" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("friend")}
          activeOpacity={0.8}
        >
          <View style={styles.tabLabelWrapper}>
            <Text
              style={[
                styles.tabText,
                activeTab === "friend" && styles.tabTextActive,
              ]}
            >
              Mensagens
            </Text>
            {friendUnreadTotal > 0 && (
              <Animated.View
                style={[
                  styles.tabBadge,
                  activeTab !== "friend" && styles.tabBadgeInactive,
                  { transform: [{ scale: badgeScale }] },
                ]}
              >
                <Text style={styles.tabBadgeText}>
                  {friendUnreadTotal > 9 ? "9+" : friendUnreadTotal}
                </Text>
              </Animated.View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "crush" && styles.tabButtonActive,
            isCrushLocked && styles.tabButtonLocked,
          ]}
          onPress={() => {
            if (isCrushLocked) return;
            setActiveTab("crush");
          }}
          activeOpacity={isCrushLocked ? 1 : 0.8}
        >
          <View style={styles.tabLabelWrapper}>
            <Text
              style={[
                styles.tabText,
                activeTab === "crush" && styles.tabTextActive,
                isCrushLocked && { color: "#555" },
              ]}
            >
              {isCrushLocked ? "Crushes 🔒" : "Crushes 💘"}
            </Text>
            {!isCrushLocked && crushUnreadTotal > 0 && (
              <Animated.View
                style={[
                  styles.tabBadge,
                  activeTab !== "crush" && styles.tabBadgeCrush,
                  { transform: [{ scale: badgeScale }] },
                ]}
              >
                <Text style={styles.tabBadgeText}>
                  {crushUnreadTotal > 9 ? "9+" : crushUnreadTotal}
                </Text>
              </Animated.View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar conversas..."
          placeholderTextColor="#555"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* ── Crush locked overlay ── */}
      {activeTab === "crush" && isCrushLocked ? (
        <View style={styles.emptyArea}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>🔒</Text>
          <Text style={[styles.emptyText, { fontSize: 17 }]}>
            Crushes bloqueados
          </Text>
          <Text style={[styles.emptySubtext, { marginTop: 8, maxWidth: 280, textAlign: "center" }]}>
            Enquanto seu status for comprometido, as conversas de crush ficam ocultas. Mude para Solteiro para desbloquear.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color="#888" />
        </View>
      ) : filteredData.length === 0 ? (
        <View style={styles.emptyArea}>
          <Text style={styles.emptyEmoji}>
            {activeTab === "friend" ? "💬" : "💘"}
          </Text>
          <Text style={styles.emptyText}>
            Nenhuma conversa em{" "}
            {activeTab === "friend" ? "Mensagens" : "Crushes"}
          </Text>
          <Text style={styles.emptySubtext}>
            Suas conversas aparecerão aqui
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06060e",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1e1e30",
    alignItems: "center",
    backgroundColor: "#0c0c16",
  },
  tabButtonActive: {
    backgroundColor: "#FF4D6D",
    borderColor: "#FF4D6D",
    shadowColor: "#FF4D6D",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tabButtonLocked: {
    opacity: 0.45,
    borderColor: "#2a2a3a",
  },
  tabLabelWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#fff",
  },
  tabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeInactive: {
    backgroundColor: "#FF4D6D",
  },
  tabBadgeCrush: {
    backgroundColor: "#FF4D6D",
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  loadingArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: "#777",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    color: "#555",
    textAlign: "center",
    fontSize: 13,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: "#0c0c16",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1e1e30",
    color: "#fff",
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginVertical: 2,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#1a1a28",
    borderWidth: 1.5,
    borderColor: "#2a2a3a",
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#1e1e30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#2a2a3a",
  },
  avatarLetter: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 20,
  },
  crushIndicator: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#06060e",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  rowName: {
    color: "#ddd",
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  rowNameUnread: {
    color: "#fff",
    fontWeight: "700",
  },
  rowTime: {
    color: "#555",
    fontSize: 11,
    marginLeft: 8,
  },
  rowPreview: {
    color: "#666",
    fontSize: 13,
  },
  rowPreviewUnread: {
    color: "#aaa",
    fontWeight: "500",
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    shadowColor: "#FF4D6D",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});
