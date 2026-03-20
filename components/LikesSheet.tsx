// components/LikesSheet.tsx
// Premium bottom-sheet mostrando quem curtiu um post (estilo Instagram)
import Colors from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    FlatList,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

type LikeUser = {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Props = {
  visible: boolean;
  postId: number | string | null;
  onClose: () => void;
  /** Callback quando o usuário clica em "Conectar" — abre o FollowModal para esse userId */
  onConnect?: (userId: string) => void;
};

export default function LikesSheet({ visible, postId, onClose, onConnect }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<LikeUser[]>([]);
  const [filtered, setFiltered] = useState<LikeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      setCurrentUserId(data?.user?.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("likes")
      .select(`
        user_id,
        profiles (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: LikeUser[] = (data as any[]).map((row) => ({
        user_id: row.user_id,
        username: row.profiles?.username ?? "user",
        full_name: row.profiles?.full_name ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
      }));
      setUsers(mapped);
      setFiltered(mapped);
    }

    setLoading(false);
  }, [postId]);

  useEffect(() => {
    if (visible && postId) {
      setSearch("");
      load();
    }
    if (!visible) {
      setUsers([]);
      setFiltered([]);
    }
  }, [visible, postId, load]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(users);
    } else {
      const q = search.toLowerCase();
      setFiltered(
        users.filter(
          (u) =>
            u.username.toLowerCase().includes(q) ||
            (u.full_name?.toLowerCase().includes(q) ?? false)
        )
      );
    }
  }, [search, users]);

  const handlePressUser = (userId: string) => {
    onClose();
    setTimeout(() => {
      router.push({ pathname: "/profile", params: { userId } } as any);
    }, 200);
  };

  const renderItem = ({ item }: { item: LikeUser }) => {
    const isMe = item.user_id === currentUserId;
    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.userInfo}
          activeOpacity={0.7}
          onPress={() => handlePressUser(item.user_id)}
        >
          {item.avatar_url ? (
            <ExpoImage
              source={{ uri: item.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(item.username?.[0] ?? "U").toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.nameCol}>
            <Text style={styles.username} numberOfLines={1}>
              {item.username}
            </Text>
            {item.full_name ? (
              <Text style={styles.fullName} numberOfLines={1}>
                {item.full_name}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {!isMe && onConnect && (
          <TouchableOpacity
            style={styles.connectBtn}
            activeOpacity={0.8}
            onPress={() => onConnect(item.user_id)}
          >
            <Text style={styles.connectText}>Conectar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderSkeleton = () => (
    <View style={{ paddingHorizontal: 16 }}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={[styles.avatar, styles.skeleton]} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.skeleton, { width: 120, height: 12, borderRadius: 6 }]} />
            <View style={[styles.skeleton, { width: 80, height: 10, borderRadius: 5 }]} />
          </View>
          <View style={[styles.skeleton, { width: 80, height: 32, borderRadius: 8 }]} />
        </View>
      ))}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdropPress} onPress={onClose} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Curtidas e reações</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Pesquisar"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>

          {/* List */}
          {loading ? (
            renderSkeleton()
          ) : filtered.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>💜</Text>
              <Text style={styles.emptyText}>
                {users.length === 0
                  ? "Nenhuma curtida ainda"
                  : "Nenhum resultado encontrado"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.user_id}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    minHeight: 300,
    paddingBottom: Platform.OS === "ios" ? 34 : 12,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    opacity: 0.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    padding: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.border,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  avatarInitial: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  nameCol: {
    flex: 1,
  },
  username: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  fullName: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  connectBtn: {
    backgroundColor: "#6C63FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  skeleton: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 40,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});
