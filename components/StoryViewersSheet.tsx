import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

export type StoryViewer = {
  viewer_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  viewed_at: string;
  has_liked: boolean;
};

type Props = {
  visible: boolean;
  storyId: string | number | null;
  viewsCount: number;
  likesCount: number;
  onClose: () => void;
  onPressUser?: (userId: string) => void;
};

const formatTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
};

export default function StoryViewersSheet({
  visible,
  storyId,
  viewsCount,
  likesCount,
  onClose,
  onPressUser,
}: Props) {
  const { theme } = useTheme();
  const router = useRouter();
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"viewers" | "likes">("viewers");

  const load = useCallback(async () => {
    if (!storyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_story_viewers", {
        _story_id: Number(storyId),
        _limit: 100,
      });
      if (!error && data) {
        setViewers(data as StoryViewer[]);
      }
    } catch {}
    setLoading(false);
  }, [storyId]);

  useEffect(() => {
    if (visible && storyId) {
      load();
      setTab("viewers");
    }
  }, [visible, storyId, load]);

  if (!visible) return null;

  const filteredViewers =
    tab === "likes" ? viewers.filter((v) => v.has_liked) : viewers;

  const handlePressUser = (userId: string) => {
    onClose();
    if (onPressUser) {
      onPressUser(userId);
    } else {
      router.push({ pathname: "/profile", params: { userId } });
    }
  };

  const renderItem = ({ item }: { item: StoryViewer }) => {
    const displayName = item.full_name || item.username || "Usuário";
    const initial = (item.username || item.full_name || "U")[0].toUpperCase();

    return (
      <TouchableOpacity
        style={styles.viewerRow}
        activeOpacity={0.7}
        onPress={() => handlePressUser(item.viewer_id)}
      >
        <View style={styles.viewerLeft}>
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              style={styles.viewerAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.viewerAvatar, styles.viewerAvatarPlaceholder]}>
              <Text style={styles.viewerInitial}>{initial}</Text>
            </View>
          )}
          <View style={styles.viewerTextCol}>
            <Text style={styles.viewerUsername} numberOfLines={1}>
              {item.username || "user"}
            </Text>
            {item.full_name && (
              <Text style={styles.viewerFullName} numberOfLines={1}>
                {item.full_name}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.viewerRight}>
          {item.has_liked && (
            <Ionicons name="heart" size={16} color="#ff3b5c" style={{ marginRight: 8 }} />
          )}
          <Text style={styles.viewerTime}>{formatTime(item.viewed_at)}</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header with counts */}
        <View style={styles.header}>
          <View style={styles.countsRow}>
            <TouchableOpacity
              style={[
                styles.countTab,
                tab === "viewers" && styles.countTabActive,
              ]}
              onPress={() => setTab("viewers")}
              activeOpacity={0.7}
            >
              <Ionicons
                name="eye-outline"
                size={20}
                color={tab === "viewers" ? "#fff" : "rgba(255,255,255,0.5)"}
              />
              <Text
                style={[
                  styles.countText,
                  tab === "viewers" && styles.countTextActive,
                ]}
              >
                {viewsCount}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.countTab,
                tab === "likes" && styles.countTabActive,
              ]}
              onPress={() => setTab("likes")}
              activeOpacity={0.7}
            >
              <Ionicons
                name="heart"
                size={18}
                color={tab === "likes" ? "#ff3b5c" : "rgba(255,255,255,0.5)"}
              />
              <Text
                style={[
                  styles.countText,
                  tab === "likes" && styles.countTextActive,
                ]}
              >
                {likesCount}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Label */}
        <Text style={styles.sectionLabel}>
          {tab === "viewers"
            ? "Pessoas que viram seu story"
            : "Pessoas que curtiram"}
        </Text>

        {/* List */}
        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
          </View>
        ) : filteredViewers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name={tab === "viewers" ? "eye-off-outline" : "heart-dislike-outline"}
              size={40}
              color="rgba(255,255,255,0.25)"
            />
            <Text style={styles.emptyText}>
              {tab === "viewers"
                ? "Ninguém viu ainda"
                : "Nenhuma curtida ainda"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredViewers}
            keyExtractor={(item) => item.viewer_id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    zIndex: 50,
  },
  sheet: {
    backgroundColor: "rgba(28,28,30,0.97)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "65%",
    minHeight: 280,
    paddingBottom: Platform.select({ ios: 34, android: 20, default: 16 }),
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countsRow: {
    flexDirection: "row",
    gap: 16,
  },
  countTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  countTabActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  countText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontWeight: "700",
  },
  countTextActive: {
    color: "#fff",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  divider: {
    height: 0.5,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 16,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: {
    flex: 1,
  },
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  viewerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  viewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  viewerAvatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerInitial: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  viewerTextCol: {
    marginLeft: 12,
    flex: 1,
  },
  viewerUsername: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  viewerFullName: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  viewerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewerTime: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "500",
    marginRight: 4,
  },
  loaderContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
    fontWeight: "500",
  },
});
