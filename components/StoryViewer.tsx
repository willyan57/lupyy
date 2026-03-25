import { useTheme } from "@/contexts/ThemeContext";
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
};

type StoryViewerProps = {
  visible: boolean;
  items: StoryItem[];
  startIndex?: number;
  onClose: () => void;
  onReply?: (text: string, storyId: string | number) => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const STORY_DURATION_DEFAULT = 8; // 8s default like IG

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
    // Reset progress for new story
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
      // Pause: stop animation and record elapsed
      elapsedRef.current += Date.now() - startTimeRef.current;
      animRef.current?.stop();
    } else {
      // Resume: continue from where we left off
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
}: StoryViewerProps) {
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showHeart, setShowHeart] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;

  const total = items.length;

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
  }, [visible, startIndex, total]);

  if (!visible || total === 0 || currentIndex < 0 || currentIndex >= total) {
    return null;
  }

  const current = items[currentIndex];

  const headerName = current?.userName || current?.username || "Story";
  const headerAvatar: string | null = current?.userAvatarUrl || current?.avatar_url || null;
  const headerTime = formatStoryTime(current?.createdAt || current?.created_at || null);

  const durationSec =
    typeof current.duration === "number" && current.duration > 0
      ? current.duration
      : STORY_DURATION_DEFAULT;

  const handlePress = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_W * 0.3) {
      goPrev();
    } else {
      goNext();
    }
  };

  const handleLongPress = () => setPaused(true);
  const handlePressOut = () => setPaused(false);

  const handleDoubleTap = () => {
    setLiked(true);
    setShowHeart(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.2, useNativeDriver: true, speed: 20 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 20 }),
      Animated.delay(600),
      Animated.timing(heartScale, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowHeart(false));
  };

  const handleSendReply = () => {
    const text = replyText.trim();
    if (!text) return;
    onReply?.(text, current.id);
    setReplyText("");
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

        {/* ── Top gradient for readability ── */}
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

        {/* ── Progress bars ── */}
        <View style={s.topOverlay} pointerEvents="box-none">
          <ProgressBar
            count={total}
            currentIndex={currentIndex}
            paused={paused}
            durationMs={durationSec * 1000}
            onFinish={goNext}
            fillColor={theme.colors.primary || "#fff"}
          />

          {/* ── Header: avatar, name, time, close ── */}
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
              {paused && (
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

        {/* ── Heart animation on double tap ── */}
        {showHeart && (
          <Animated.View
            style={[s.heartOverlay, { transform: [{ scale: heartScale }] }]}
            pointerEvents="none"
          >
            <Ionicons name="heart" size={80} color="#ff3b5c" />
          </Animated.View>
        )}

        {/* ── Bottom: reply + actions ── */}
        <View style={s.bottomBar} pointerEvents="box-none">
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
              onPress={() => {
                if (!liked) handleDoubleTap();
                else setLiked(false);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={24}
                color={liked ? "#ff3b5c" : "#fff"}
              />
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} activeOpacity={0.7}>
              <Ionicons name="paper-plane-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
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
});
