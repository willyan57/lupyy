// app/(tabs)/conversations/index.tsx
import { getOrCreateConversation } from "@/lib/conversations";
import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,

  Animated,
  BackHandler,
  FlatList,
  Image,
  Modal,
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

type FollowerRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
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

  // ── New conversation modal ──
  const [showNewChat, setShowNewChat] = useState(false);
  const [followerSearch, setFollowerSearch] = useState("");
  const [followers, setFollowers] = useState<FollowerRow[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [creatingChat, setCreatingChat] = useState<string | null>(null);

  // ── Delete confirmation modal ──
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Relationship status lock ──
  const [myRelationshipStatus, setMyRelationshipStatus] = useState<string | null>(null);
  const isCrushLocked = myRelationshipStatus === "committed" || myRelationshipStatus === "other";

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

    await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conversationId);

    await refreshUnreadCountsForLists();
  };

  const loadViewerContext = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const viewerId = data.user.id;
    setCurrentUserId(viewerId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("relationship_status")
      .eq("id", viewerId)
      .maybeSingle();

    setMyRelationshipStatus((profile as any)?.relationship_status ?? null);
    return viewerId;
  }, []);

  const loadConversations = useCallback(async (viewerId?: string | null) => {
    const activeUserId = viewerId ?? currentUserId;
    if (!activeUserId) return;
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

  // ── Load followers/following for new chat ──
  const loadFollowers = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingFollowers(true);
    try {
      // Get mutual connections: people I follow + people who follow me
      const [{ data: following }, { data: myFollowers }] = await Promise.all([
        supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", currentUserId),
        supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", currentUserId),
      ]);

      const userIds = new Set<string>();
      following?.forEach((f: any) => userIds.add(f.following_id));
      myFollowers?.forEach((f: any) => userIds.add(f.follower_id));
      userIds.delete(currentUserId);

      if (userIds.size === 0) {
        setFollowers([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", Array.from(userIds))
        .order("full_name", { ascending: true });

      setFollowers((profiles as FollowerRow[]) ?? []);
    } finally {
      setLoadingFollowers(false);
    }
  }, [currentUserId]);

  const reactivateConversationForUser = useCallback(
    async (conversationId: string, userId: string) => {
      const { data: existingDeletion, error: lookupError } = await supabase
        .from("conversation_deletions")
        .select("deleted_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existingDeletion?.deleted_at) return;

      const { error: rpcError } = await supabase.rpc("reactivate_conversation", {
        _conversation_id: conversationId,
        _user_id: userId,
      });

      if (!rpcError) return;

      const { error: updateError } = await supabase
        .from("conversation_deletions")
        .update({ deleted_at: null })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      if (updateError) throw updateError;
    },
    []
  );

  const handleStartConversation = async (otherUserId: string) => {
    if (!currentUserId) return;
    setCreatingChat(otherUserId);
    try {
      const pair =
        currentUserId < otherUserId
          ? { user1: currentUserId, user2: otherUserId }
          : { user1: otherUserId, user2: currentUserId };

      const { data: existingConversation } = await supabase
        .from("conversations")
        .select("id, conversation_type")
        .eq("user1", pair.user1)
        .eq("user2", pair.user2)
        .maybeSingle();

      const conversationType =
        (existingConversation as { conversation_type?: string | null } | null)
          ?.conversation_type === "crush"
          ? "crush"
          : "friend";

      const conversation = await getOrCreateConversation({
        currentUserId,
        otherUserId,
        conversationType,
      });

      if (!conversation?.id) {
        console.warn("Erro: Não foi possível criar a conversa.");
        return;
      }

      await reactivateConversationForUser(conversation.id, currentUserId);

      setShowNewChat(false);
      setFollowerSearch("");

      router.push({
        pathname: "/conversations/[id]",
        params: {
          id: conversation.id,
          type: conversation.conversation_type === "crush" ? "crush" : "friend",
        },
      });

      void loadConversations(currentUserId);
    } catch (e: any) {
      console.error("handleStartConversation error:", e);
      const message = e?.message ?? "Não foi possível iniciar a conversa.";
      console.error("Erro:", message);
    } finally {
      setCreatingChat(null);
    }
  };

  useEffect(() => {
    (async () => {
      const viewerId = await loadViewerContext();
      if (viewerId) {
        await loadConversations(viewerId);
      }
    })();
  }, [loadViewerContext, loadConversations]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      (async () => {
        const viewerId = await loadViewerContext();
        if (isActive && viewerId) {
          await loadConversations(viewerId);
        }
      })();

      return () => {
        isActive = false;
      };
    }, [loadViewerContext, loadConversations])
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
  const confirmDeleteConversation = useCallback(
    async () => {
      if (!currentUserId || !deleteTarget) return;
      const deletedAt = new Date().toISOString();

      await supabase
        .from("conversation_deletions")
        .upsert(
          {
            conversation_id: deleteTarget,
            user_id: currentUserId,
            deleted_at: deletedAt,
            messages_hidden_before: deletedAt,
          },
          { onConflict: "conversation_id,user_id" }
        );

      setFriendConversations((prev) =>
        prev.filter((c) => c.id !== deleteTarget)
      );
      setCrushConversations((prev) =>
        prev.filter((c) => c.id !== deleteTarget)
      );
      setDeleteTarget(null);
    },
    [currentUserId, deleteTarget]
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

  // ── Filtered followers for new chat modal ──
  const normalizedFollowerSearch = followerSearch.trim().toLowerCase();
  const filteredFollowers = normalizedFollowerSearch
    ? followers.filter((f) => {
        const name = (f.full_name || "").toLowerCase();
        const uname = (f.username || "").toLowerCase();
        return name.includes(normalizedFollowerSearch) || uname.includes(normalizedFollowerSearch);
      })
    : followers;

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
        onLongPress={() => setDeleteTarget(item.id)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
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

        <View style={styles.rowActions}>
          {unreadCount > 0 && (
            <Animated.View
              style={[styles.unreadBadge, { transform: [{ scale: badgeScale }] }]}
            >
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </Animated.View>
          )}

          <TouchableOpacity
            style={styles.rowMenuButton}
            activeOpacity={0.7}
            onPress={() => setDeleteTarget(item.id)}
          >
            <Text style={styles.rowMenuIcon}>⋯</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFollowerItem = ({ item }: { item: FollowerRow }) => {
    const name = item.full_name?.trim() || item.username?.trim() || "Usuário";
    const isCreating = creatingChat === item.id;

    return (
      <TouchableOpacity
        style={styles.followerRow}
        onPress={() => handleStartConversation(item.id)}
        activeOpacity={0.7}
        disabled={!!creatingChat}
      >
        <View style={styles.avatarContainer}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>
                {name.substring(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.followerInfo}>
          <Text style={styles.followerName} numberOfLines={1}>{name}</Text>
          {item.username && (
            <Text style={styles.followerUsername} numberOfLines={1}>@{item.username}</Text>
          )}
        </View>
        {isCreating ? (
          <ActivityIndicator size="small" color="#FF4D6D" />
        ) : (
          <View style={styles.chatIconBtn}>
            <Text style={{ fontSize: 18 }}>💬</Text>
          </View>
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
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mensagens</Text>
        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={() => {
            setShowNewChat(true);
            loadFollowers();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.newChatBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

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
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar conversas..."
            placeholderTextColor="#555"
            value={search}
            onChangeText={setSearch}
          />
        </View>
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
          <TouchableOpacity
            style={styles.emptyNewChatBtn}
            onPress={() => {
              setShowNewChat(true);
              loadFollowers();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyNewChatBtnText}>Iniciar conversa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* ── New Chat Modal ── */}
      <Modal
        visible={showNewChat}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNewChat(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.modalHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova conversa</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowNewChat(false);
                  setFollowerSearch("");
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.modalSearchContainer}>
              <View style={styles.searchInputWrapper}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar por nome ou username..."
                  placeholderTextColor="#555"
                  value={followerSearch}
                  onChangeText={setFollowerSearch}
                  autoFocus
                />
              </View>
            </View>

            <Text style={styles.modalSubtitle}>Suas conexões</Text>

            {/* List */}
            {loadingFollowers ? (
              <View style={styles.modalLoadingArea}>
                {/* Skeleton */}
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={styles.skeletonRow}>
                    <View style={styles.skeletonAvatar} />
                    <View style={{ flex: 1 }}>
                      <View style={[styles.skeletonLine, { width: "60%" }]} />
                      <View style={[styles.skeletonLine, { width: "40%", marginTop: 6 }]} />
                    </View>
                  </View>
                ))}
              </View>
            ) : filteredFollowers.length === 0 ? (
              <View style={styles.modalEmptyArea}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>👥</Text>
                <Text style={styles.emptyText}>
                  {followerSearch ? "Nenhuma pessoa encontrada" : "Nenhuma conexão ainda"}
                </Text>
                <Text style={styles.emptySubtext}>
                  {followerSearch
                    ? "Tente outro nome ou username"
                    : "Siga pessoas para começar a conversar"}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredFollowers}
                keyExtractor={(item) => item.id}
                renderItem={renderFollowerItem}
                contentContainerStyle={{ paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <TouchableOpacity
          style={styles.deleteOverlay}
          activeOpacity={1}
          onPress={() => setDeleteTarget(null)}
        >
          <View style={styles.deleteSheet}>
            <Text style={styles.deleteTitle}>Excluir conversa</Text>
            <Text style={styles.deleteMessage}>
              Tem certeza? A conversa será removida da sua lista.
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setDeleteTarget(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={confirmDeleteConversation}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteConfirmText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06060e",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  newChatBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF4D6D",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  newChatBtnText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: -1,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
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
  emptyNewChatBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#FF4D6D",
    shadowColor: "#FF4D6D",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyNewChatBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0c0c16",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1e1e30",
    paddingHorizontal: 14,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
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
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#1a1a28",
    borderWidth: 2,
    borderColor: "#2a2a3a",
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#1e1e30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#06060e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#1e1e30",
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
  rowActions: {
    alignItems: "center",
    gap: 8,
    marginLeft: 10,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
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
  rowMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#11111c",
    borderWidth: 1,
    borderColor: "#1e1e30",
    alignItems: "center",
    justifyContent: "center",
  },
  rowMenuIcon: {
    color: "#aaa",
    fontSize: 18,
    fontWeight: "700",
    marginTop: -2,
  },
  // ── Modal styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0c0c16",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    minHeight: "60%",
    paddingBottom: 30,
    borderTopWidth: 1,
    borderColor: "#1e1e30",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  modalClose: {
    color: "#888",
    fontSize: 22,
    padding: 4,
  },
  modalSearchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalSubtitle: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  modalLoadingArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  modalEmptyArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  followerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  followerInfo: {
    flex: 1,
  },
  followerName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  followerUsername: {
    color: "#666",
    fontSize: 13,
    marginTop: 1,
  },
  chatIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1a1a28",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  // ── Skeleton ──
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 12,
  },
  skeletonAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#1a1a28",
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1a1a28",
  },
  // ── Delete confirmation modal styles ──
  deleteOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  deleteSheet: {
    backgroundColor: "#16162a",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  deleteTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  deleteMessage: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteActions: {
    flexDirection: "row",
    gap: 12,
  },
  deleteCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1e1e30",
    alignItems: "center",
  },
  deleteCancelText: {
    color: "#ccc",
    fontSize: 15,
    fontWeight: "600",
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#e53e3e",
    alignItems: "center",
  },
  deleteConfirmText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
