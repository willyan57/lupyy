import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import StoryViewersSheet from "./StoryViewersSheet";

export type StoryItem = {
  id: string | number;
  media_type: "image" | "video";
  media_url: string;
  filter?: string | null;
  duration?: number | null;
  userName?: string | null;
  userAvatarUrl?: string | null;
  createdAt?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  user_id?: string | null;
};

type StoryViewerProps = {
  visible: boolean;
  items: StoryItem[];
  startIndex?: number;
  onClose: () => void;
  onReply?: (text: string, storyId: string | number) => void;
  onPressUser?: (userId: string) => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const STORY_DURATION_DEFAULT = 8;

type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";

const FILTERS: { id: FilterId; overlay?: string; blur?: number; vignette?: boolean; glow?: boolean }[] = [
  { id: "none" },
  { id: "warm", overlay: "rgba(255,140,90,0.18)", glow: true },
  { id: "cool", overlay: "rgba(70,150,255,0.18)", glow: true },
  { id: "pink", overlay: "rgba(255,80,160,0.16)", glow: true },
  { id: "gold", overlay: "rgba(255,220,120,0.16)", glow: true, vignette: true },
  { id: "night", overlay: "rgba(0,0,0,0.28)", blur: 18, vignette: true },
];

const getFilter = (id?: string | null) =>
  FILTERS.find((f) => f.id === (id as FilterId)) ?? FILTERS[0];

const formatStoryTime = (createdAt?: string | null): string => {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "agora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ontem";
  return `${diffD} d`;
};

/* ─── Video Sub-component ─── */
function StoryVideo({ uri, playing }: { uri: string; playing: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = Platform.OS === "web";
  });

  useEffect(() => {
    if (!player) return;
    if (playing) player.play();
    else player.pause();
    return () => { try { player.pause(); } catch {} };
  }, [playing, player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}

/* ─── Animated Progress Bar ─── */
function ProgressBar({
  count,
  currentIndex,
  paused,
  durationMs,
  onFinish,
  fillColor = "#fff",
}: {
  count: number;
  currentIndex: number;
  paused: boolean;
  durationMs: number;
  onFinish: () => void;
  fillColor?: string;
}) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    progressAnim.setValue(0);
    elapsedRef.current = 0;
    startTimeRef.current = Date.now();

    const remaining = durationMs;
    animRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => {
      animRef.current?.stop();
    };
  }, [currentIndex, durationMs]);

  useEffect(() => {
    if (paused) {
      elapsedRef.current += Date.now() - startTimeRef.current;
      animRef.current?.stop();
    } else {
      const remaining = Math.max(durationMs - elapsedRef.current, 100);
      startTimeRef.current = Date.now();
      animRef.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration: remaining,
        useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => {
        if (finished) onFinish();
      });
    }
  }, [paused]);

  return (
    <View style={pStyles.barRow}>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={pStyles.barTrack}>
          <Animated.View
            style={[
              pStyles.barFill,
              { backgroundColor: fillColor },
              idx < currentIndex
                ? { width: "100%" }
                : idx === currentIndex
                ? {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  }
                : { width: "0%" },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const pStyles = StyleSheet.create({
  barRow: {
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 8,
    paddingTop: Platform.select({ ios: 54, android: 38, default: 16 }),
  },
  barTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
});

/* ─── Main StoryViewer ─── */
export default function StoryViewer({
  visible,
  items,
  startIndex = 0,
  onClose,
  onReply,
  onPressUser,
}: StoryViewerProps) {
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showHeart, setShowHeart] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;

  // Auth + ownership
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [viewsCount, setViewsCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);
  const countsRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const total = items.length;

  // Get auth user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      if (data?.user) setAuthUserId(data.user.id);
    }).catch(() => {});
  }, []);

  const goNext = useCallback(() => {
    if (total === 0) return;
    if (currentIndex + 1 < total) {
      setCurrentIndex((prev) => prev + 1);
      setLiked(false);
    } else {
      onClose();
    }
  }, [currentIndex, total, onClose]);

  const goPrev = useCallback(() => {
    if (total === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      setLiked(false);
    }
  }, [currentIndex, total]);

  // Reset when opening
  useEffect(() => {
    if (!visible) return;
    const safeIndex =
      typeof startIndex === "number" && startIndex >= 0 && startIndex < total
        ? startIndex
        : 0;
    setCurrentIndex(safeIndex);
    setPaused(false);
    setLiked(false);
    setReplyText("");
    setViewersSheetOpen(false);
  }, [visible, startIndex, total]);

  // Helper to fetch counts
  const fetchCounts = useCallback((storyId: number) => {
    Promise.all([
      supabase.from("story_view_counts").select("views_count").eq("story_id", storyId).maybeSingle(),
      supabase.from("story_like_counts").select("likes_count").eq("story_id", storyId).maybeSingle(),
    ]).then(([viewsRes, likesRes]: [any, any]) => {
      setViewsCount(viewsRes.data?.views_count ?? 0);
      setLikesCount(likesRes.data?.likes_count ?? 0);
    }).catch(() => {});
  }, []);

  // Register view + fetch counts when story changes
  useEffect(() => {
    if (!visible || total === 0 || currentIndex < 0 || currentIndex >= total) return;
    const current = items[currentIndex];
    if (!current || !authUserId) return;

    const storyId = Number(current.id);
    const isOwner = current.user_id === authUserId;

    // Register view if not owner
    if (!isOwner && Number.isFinite(storyId) && storyId > 0) {
      supabase.rpc("register_story_view", { _story_id: storyId })
        .then((res: any) => {
          // If RPC fails, try direct insert as fallback
          if (res.error) {
            console.warn("register_story_view RPC failed:", res.error.message);
            supabase
              .from("story_views")
              .insert({ story_id: storyId, viewer_id: authUserId })
              .then(() => {})
              .catch(() => {});
          }
        })
        .catch(() => {
          // Fallback: direct insert
          supabase
            .from("story_views")
            .insert({ story_id: storyId, viewer_id: authUserId })
            .then(() => {})
            .catch(() => {});
        });
    }

    // Fetch counts (for owner display)
    if (isOwner) {
      fetchCounts(storyId);

      // Real-time: subscribe to story_views and story_likes changes
      const channel = supabase
        .channel(`story-engagement-${storyId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "story_views", filter: `story_id=eq.${storyId}` }, () => {
          fetchCounts(storyId);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "story_likes", filter: `story_id=eq.${storyId}` }, () => {
          fetchCounts(storyId);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    // Check if user already liked this story
    if (!isOwner) {
      supabase
        .from("story_likes")
        .select("id")
        .eq("story_id", storyId)
        .eq("user_id", authUserId)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          setLiked(!!data);
        }).catch(() => {});
    }
  }, [visible, currentIndex, authUserId, items, total, fetchCounts]);

  if (!visible || total === 0 || currentIndex < 0 || currentIndex >= total) {
    return null;
  }

  const current = items[currentIndex];
  const isOwner = !!authUserId && current?.user_id === authUserId;

  const headerName = current?.userName || current?.username || "Story";
  const headerAvatar: string | null = current?.userAvatarUrl || current?.avatar_url || null;
  const headerTime = formatStoryTime(current?.createdAt || current?.created_at || null);

  const durationSec =
    typeof current.duration === "number" && current.duration > 0
      ? current.duration
      : STORY_DURATION_DEFAULT;

  const handlePress = (evt: any) => {
    if (viewersSheetOpen) return;
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_W * 0.3) {
      goPrev();
    } else {
      goNext();
    }
  };

  const handleLongPress = () => {
    if (viewersSheetOpen) return;
    setPaused(true);
  };
  const handlePressOut = () => {
    if (viewersSheetOpen) return;
    setPaused(false);
  };

  const handleDoubleTap = async () => {
    setLiked(true);
    setShowHeart(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.2, useNativeDriver: true, speed: 20 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 20 }),
      Animated.delay(600),
      Animated.timing(heartScale, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowHeart(false));

    // Persist like + send notification
    if (authUserId && current) {
      const storyId = Number(current.id);
      const storyOwnerId = current.user_id;
      supabase
        .from("story_likes")
        .insert({ story_id: storyId, user_id: authUserId })
        .then(() => {
          // Create notification for story owner
          if (storyOwnerId && storyOwnerId !== authUserId) {
            supabase.rpc("create_notification", {
              _recipient_id: storyOwnerId,
              _actor_id: authUserId,
              _type: "story_like",
              _story_id: storyId,
            }).then(() => {}).catch(() => {});
          }
        })
        .catch(() => {});
    }
  };

  const handleToggleLike = async () => {
    if (!authUserId || !current) return;
    const storyId = Number(current.id);

    if (liked) {
      setLiked(false);
      supabase.from("story_likes").delete().eq("story_id", storyId).eq("user_id", authUserId).then(() => {}).catch(() => {});
    } else {
      handleDoubleTap();
    }
  };

  const handleSendReply = () => {
    const text = replyText.trim();
    if (!text) return;
    onReply?.(text, current.id);
    setReplyText("");
  };

  const handleOpenViewers = () => {
    setPaused(true);
    setViewersSheetOpen(true);
  };

  const handleCloseViewers = () => {
    setViewersSheetOpen(false);
    setPaused(false);
  };

  const f = getFilter(current?.filter);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      <View style={s.container}>
        {/* ── Full-screen media ── */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressOut={handlePressOut}
          delayLongPress={200}
        >
          <View style={StyleSheet.absoluteFill}>
            {current.media_type === "image" ? (
              <Image
                source={{ uri: current.media_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <StoryVideo uri={current.media_url} playing={!paused} />
            )}

            {/* Filter overlays */}
            {f && f.id !== "none" && (
              <>
                {f.blur ? (
                  <BlurView intensity={f.blur} tint="dark" style={StyleSheet.absoluteFill} />
                ) : null}
                {f.overlay ? (
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
                ) : null}
                {f.glow ? (
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <LinearGradient
                      colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0.0)"]}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160 }}
                    />
                  </View>
                ) : null}
                {f.vignette ? (
                  <>
                    <LinearGradient
                      colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, height: 220 }}
                    />
                    <LinearGradient
                      colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
                      style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 260 }}
                    />
                  </>
                ) : null}
              </>
            )}
          </View>
        </Pressable>

        {/* ── Top gradient ── */}
        <LinearGradient
          colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]}
          style={s.topGradient}
          pointerEvents="none"
        />

        {/* ── Bottom gradient ── */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.5)"]}
          style={s.bottomGradient}
          pointerEvents="none"
        />

        {/* ── Progress bars + Header ── */}
        <View style={s.topOverlay} pointerEvents="box-none">
          <ProgressBar
            count={total}
            currentIndex={currentIndex}
            paused={paused}
            durationMs={durationSec * 1000}
            onFinish={goNext}
            fillColor={theme.colors.primary || "#fff"}
          />

          <View style={s.header}>
            <View style={s.headerLeft}>
              {headerAvatar ? (
                <Image
                  source={{ uri: headerAvatar }}
                  style={s.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[s.avatar, s.avatarPlaceholder]}>
                  <Text style={s.avatarInitial}>
                    {(headerName || "S").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={s.headerTextCol}>
                <Text style={s.headerName} numberOfLines={1}>
                  {headerName}
                </Text>
                {!!headerTime && (
                  <Text style={s.headerTime}>{headerTime}</Text>
                )}
              </View>
            </View>

            <View style={s.headerRight}>
              {paused && !viewersSheetOpen && (
                <View style={s.pausedBadge}>
                  <Text style={s.pausedText}>⏸</Text>
                </View>
              )}
              <TouchableOpacity
                style={s.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Heart animation ── */}
        {showHeart && (
          <Animated.View
            style={[s.heartOverlay, { transform: [{ scale: heartScale }] }]}
            pointerEvents="none"
          >
            <Ionicons name="heart" size={80} color="#ff3b5c" />
          </Animated.View>
        )}

        {/* ── Bottom bar ── */}
        <View style={s.bottomBar} pointerEvents="box-none">
          {isOwner ? (
            /* Owner sees view count button */
            <TouchableOpacity
              style={s.viewCountRow}
              activeOpacity={0.7}
              onPress={handleOpenViewers}
            >
              <Ionicons name="eye-outline" size={20} color="#fff" />
              <Text style={s.viewCountText}>
                {viewsCount} {viewsCount === 1 ? "visualização" : "visualizações"}
              </Text>
              <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          ) : (
            /* Other users see reply + like */
            <View style={s.replyRow}>
              <TextInput
                style={s.replyInput}
                placeholder="Enviar mensagem..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={replyText}
                onChangeText={setReplyText}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                onSubmitEditing={handleSendReply}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[s.actionBtn, liked && { backgroundColor: "rgba(255,59,92,0.2)" }]}
                onPress={handleToggleLike}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={24}
                  color={liked ? "#ff3b5c" : "#fff"}
                />
              </TouchableOpacity>
              {replyText.trim().length > 0 && (
                <TouchableOpacity style={s.actionBtn} activeOpacity={0.7} onPress={handleSendReply}>
                  <Ionicons name="paper-plane-outline" size={22} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── Viewers Sheet (inside story, not external) ── */}
        <StoryViewersSheet
          visible={viewersSheetOpen}
          storyId={current.id}
          viewsCount={viewsCount}
          likesCount={likesCount}
          onClose={handleCloseViewers}
          onPressUser={(userId) => {
            handleCloseViewers();
            onClose();
            onPressUser?.(userId);
          }}
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 5,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 5,
  },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  avatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  headerTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  headerName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerTime: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pausedBadge: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pausedText: {
    color: "#fff",
    fontSize: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heartOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -40,
    marginTop: -40,
    zIndex: 20,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingBottom: Platform.select({ ios: 40, android: 20, default: 16 }),
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  replyInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 16,
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewCountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    alignSelf: "center",
  },
  viewCountText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
