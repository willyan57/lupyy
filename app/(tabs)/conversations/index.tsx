import {
  Conversation,
  ConversationType,
  fetchConversationsByType,
} from "@/lib/conversations";
import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type ProfileSummary = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type ConversationWithProfile = Conversation & {
  otherProfile?: ProfileSummary;
};

export default function ConversationsScreen() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ConversationType>("friend");

  const [friendConversations, setFriendConversations] = useState<
    ConversationWithProfile[]
  >([]);
  const [crushConversations, setCrushConversations] = useState<
    ConversationWithProfile[]
  >([]);

  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  const refreshUnreadCountsForLists = async (
    friendsList?: ConversationWithProfile[],
    crushList?: ConversationWithProfile[]
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
    (data as { conversation_id: string; unread: number }[]).forEach((row) => {
      map[row.conversation_id] = row.unread;
    });
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

    if (error) {
      await refreshUnreadCountsForLists();
    } else {
      await refreshUnreadCountsForLists();
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      setCurrentUserId(data.user.id);
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [friends, crushes] = await Promise.all([
          fetchConversationsByType({
            currentUserId,
            conversationType: "friend",
          }),
          fetchConversationsByType({
            currentUserId,
            conversationType: "crush",
          }),
        ]);

        const allOtherIds = Array.from(
          new Set(
            [...friends, ...crushes].map((c) =>
              c.user1 === currentUserId ? c.user2 : c.user1
            )
          )
        ).filter(Boolean) as string[];

        let profilesMap: Record<string, ProfileSummary> = {};

        if (allOtherIds.length > 0) {
          const { data: profiles, error } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .in("id", allOtherIds);

          if (!error && profiles) {
            profilesMap = (profiles as ProfileSummary[]).reduce(
              (acc: Record<string, ProfileSummary>, p: ProfileSummary) => {
                acc[p.id] = p;
                return acc;
              },
              {} as Record<string, ProfileSummary>
            );
          }
        }

        const mapWithProfile = (
          list: Conversation[]
        ): ConversationWithProfile[] =>
          list.map((c) => {
            const otherId = c.user1 === currentUserId ? c.user2 : c.user1;
            return {
              ...c,
              otherProfile: profilesMap[otherId],
            };
          });

        const friendsWithProfile = mapWithProfile(friends);
        const crushesWithProfile = mapWithProfile(crushes);

        setFriendConversations(friendsWithProfile);
        setCrushConversations(crushesWithProfile);

        await refreshUnreadCountsForLists(
          friendsWithProfile,
          crushesWithProfile
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUserId]);

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

  const data =
    activeTab === "friend" ? friendConversations : crushConversations;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredData = normalizedSearch
    ? data.filter((item) => {
        const name =
          item.otherProfile?.username ||
          item.otherProfile?.full_name ||
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

  const renderItem = ({ item }: { item: ConversationWithProfile }) => {
    const name =
      item.otherProfile?.username ||
      item.otherProfile?.full_name ||
      "Usuário";
    const preview = item.last_message || "Comece a conversa";
    const unreadCount = unreadMap[item.id] || 0;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handleOpenConversation(item.id)}
      >
        {item.otherProfile?.avatar_url ? (
          <Image
            source={{ uri: item.otherProfile.avatar_url }}
            style={styles.avatarImage}
          />
        ) : (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>
              {name.substring(0, 1).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.rowText}>
          <Text style={styles.rowName}>{name}</Text>
          <Text style={styles.rowPreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>

        <View style={styles.badgeWrapper}>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          )}

          {item.conversation_type === "crush" && (
            <Text style={styles.crushBadge}>💘</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!currentUserId) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "friend" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("friend")}
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
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {friendUnreadTotal > 9 ? "9+" : friendUnreadTotal}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "crush" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("crush")}
        >
          <View style={styles.tabLabelWrapper}>
            <Text
              style={[
                styles.tabText,
                activeTab === "crush" && styles.tabTextActive,
              ]}
            >
              Crushes
            </Text>
            {crushUnreadTotal > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {crushUnreadTotal > 9 ? "9+" : crushUnreadTotal}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>


      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar conversas..."
          placeholderTextColor="#777"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator />
        </View>
      ) : filteredData.length === 0 ? (
        <View style={styles.emptyArea}>
          <Text style={styles.emptyText}>
            Nenhuma conversa ainda em{" "}
            {activeTab === "friend" ? "Mensagens" : "Crushes"}.
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
    backgroundColor: "#02010A",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#FF4D6D",
    borderColor: "#FF4D6D",
  },
  tabLabelWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabText: {
    color: "#ccc",
    fontSize: 14,
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#fff",
  },
  tabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
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
  emptyText: {
    color: "#888",
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: "#0b0b13",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#232336",
    color: "#fff",
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#333",
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarLetter: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 18,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  rowPreview: {
    color: "#aaa",
    fontSize: 13,
  },
  badgeWrapper: {
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unreadBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  crushBadge: {
    fontSize: 18,
  },
});
