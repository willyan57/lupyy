import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
// @ts-ignore - resolved in Expo project
import StoryStickers, { type StickerData } from "./StoryStickers";
import StoryViewersSheet from "./StoryViewersSheet";

const isDuplicateInsertError = (error: any) =>
  error?.code === "23505" || String(error?.message ?? "").toLowerCase().includes("duplicate");

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
  location?: string | null;
  caption?: string | null;
  text_overlays?: any;
  draw_paths?: any;
  close_friends_only?: boolean;
};

/** Group of stories from one user — used for swipe between users */
export type StoryUserGroup = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  items: StoryItem[];
};

type StoryViewerProps = {
  visible: boolean;
  /** Flat list of stories (legacy) */
  items: StoryItem[];
  /** Grouped by user for horizontal swipe (optional, preferred) */
  userGroups?: StoryUserGroup[];
  startIndex?: number;
  /** Index of the user group to start from (when using userGroups) */
  startUserIndex?: number;
  onClose: () => void;
  onReply?: (text: string, storyId: string | number) => void;
  onPressUser?: (userId: string) => void;
  onDeleted?: (storyId: string | number) => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const STORY_DURATION_DEFAULT = 8;
const SWIPE_THRESHOLD = SCREEN_W * 0.25;
const SWIPE_VELOCITY = 0.3;

// All supported filters with their visual overlays
type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night" |
  "cinematic_gold" | "blue_teal" | "pastel_dream" | "tokyo_night" | "desert_warm" |
  "vintage_film" | "sakura" | "neon_glow" | "miami_vibes" | "deep_contrast" |
  "moody_forest" | "winter_lowsat" | "summer_pop" | "aqua_fresh" | "pink_rose" |
  "sepia_clean" | "urban_grit" | "cream_tone";

const FILTERS: Record<string, { overlay?: string; blur?: number; vignette?: boolean; glow?: boolean }> = {
  none: {},
  warm: { overlay: "rgba(255,140,90,0.12)", glow: true },
  cool: { overlay: "rgba(70,150,255,0.12)", glow: true },
  pink: { overlay: "rgba(255,80,160,0.10)", glow: true },
  gold: { overlay: "rgba(255,220,120,0.10)", glow: true, vignette: true },
  night: { overlay: "rgba(0,0,0,0.18)", vignette: true },
  cinematic_gold: { overlay: "rgba(255,215,170,0.10)", vignette: true },
  blue_teal: { overlay: "rgba(90,170,255,0.12)" },
  pastel_dream: { overlay: "rgba(255,220,245,0.12)", glow: true },
  tokyo_night: { overlay: "rgba(80,60,140,0.16)", vignette: true },
  desert_warm: { overlay: "rgba(255,190,120,0.12)" },
  vintage_film: { overlay: "rgba(240,210,180,0.12)", vignette: true },
  sakura: { overlay: "rgba(255,170,210,0.12)", glow: true },
  neon_glow: { overlay: "rgba(170,120,255,0.14)", vignette: true },
  miami_vibes: { overlay: "rgba(255,210,150,0.14)", glow: true },
  deep_contrast: { overlay: "rgba(10,10,10,0.16)", vignette: true },
  moody_forest: { overlay: "rgba(40,80,40,0.16)", vignette: true },
  winter_lowsat: { overlay: "rgba(190,210,230,0.12)" },
  summer_pop: { overlay: "rgba(255,210,120,0.12)", glow: true },
  aqua_fresh: { overlay: "rgba(120,210,255,0.14)" },
  pink_rose: { overlay: "rgba(255,170,200,0.14)", glow: true },
  sepia_clean: { overlay: "rgba(210,170,130,0.14)", vignette: true },
  urban_grit: { overlay: "rgba(40,40,40,0.16)", vignette: true },
  cream_tone: { overlay: "rgba(245,220,190,0.14)", glow: true },
};

const getFilter = (id?: string | null) => FILTERS[id ?? "none"] ?? FILTERS.none;
let storyStickersRpcAvailable = true;

function isMissingRpcError(error: any): boolean {
  const msg = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "").toLowerCase();
  return (
    code === "pgrst202" ||
    msg.includes("could not find the function") ||
    msg.includes("get_story_stickers")
  );
}

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
  count, currentIndex, paused, durationMs, onFinish, fillColor = "#fff",
}: {
  count: number; currentIndex: number; paused: boolean;
  durationMs: number; onFinish: () => void; fillColor?: string;
}) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    progressAnim.setValue(0);
    elapsedRef.current = 0;
    startTimeRef.current = Date.now();
    animRef.current = Animated.timing(progressAnim, {
      toValue: 1, duration: durationMs, useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => { if (finished) onFinish(); });
    return () => { animRef.current?.stop(); };
  }, [currentIndex, durationMs]);

  useEffect(() => {
    if (paused) {
      elapsedRef.current += Date.now() - startTimeRef.current;
      animRef.current?.stop();
    } else {
      const remaining = Math.max(durationMs - elapsedRef.current, 100);
      startTimeRef.current = Date.now();
      animRef.current = Animated.timing(progressAnim, {
        toValue: 1, duration: remaining, useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => { if (finished) onFinish(); });
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
              idx < currentIndex ? { width: "100%" }
                : idx === currentIndex ? { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }
                : { width: "0%" },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const pStyles = StyleSheet.create({
  barRow: { flexDirection: "row", gap: 3, paddingHorizontal: 8, paddingTop: Platform.select({ ios: 54, android: 38, default: 16 }) },
  barTrack: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
});

/* ─── Main StoryViewer ─── */
export default function StoryViewer({
  visible, items, userGroups, startIndex = 0, startUserIndex = 0,
  onClose, onReply, onPressUser, onDeleted,
}: StoryViewerProps) {
  const { theme } = useTheme();

  // ─── User group navigation state ───
  const [currentUserIdx, setCurrentUserIdx] = useState(startUserIndex);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showHeart, setShowHeart] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [viewsCount, setViewsCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);
  const viewedStoryIdsRef = useRef<Set<number>>(new Set());
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [stickers, setStickers] = useState<StickerData[]>([]);

  // ─── Swipe animation ───
  const swipeX = useRef(new Animated.Value(0)).current;
  const isSwipingRef = useRef(false);

  // Determine active items — from groups or flat list
  const hasGroups = !!userGroups && userGroups.length > 0;
  const activeGroup = hasGroups ? userGroups![Math.min(currentUserIdx, userGroups!.length - 1)] : null;
  const activeItems = activeGroup ? activeGroup.items : items;
  const total = activeItems.length;
  const totalUsers = hasGroups ? userGroups!.length : 1;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => {
      if (data?.user) setAuthUserId(data.user.id);
    }).catch(() => {});
  }, []);

  // ─── Horizontal swipe PanResponder (swipe between users) ───
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_: any, g: any) => {
      if (!hasGroups || viewersSheetOpen || showOptionsMenu) return false;
      return Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
    },
    onPanResponderGrant: () => {
      isSwipingRef.current = true;
      setPaused(true);
    },
    onPanResponderMove: (_: any, g: any) => {
      // Clamp movement
      const clampedDx = Math.max(-SCREEN_W * 0.5, Math.min(SCREEN_W * 0.5, g.dx));
      swipeX.setValue(clampedDx);
    },
    onPanResponderRelease: (_: any, g: any) => {
      isSwipingRef.current = false;
      const shouldSwipeLeft = (g.dx < -SWIPE_THRESHOLD || g.vx < -SWIPE_VELOCITY) && currentUserIdx < totalUsers - 1;
      const shouldSwipeRight = (g.dx > SWIPE_THRESHOLD || g.vx > SWIPE_VELOCITY) && currentUserIdx > 0;

      if (shouldSwipeLeft) {
        Animated.timing(swipeX, { toValue: -SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
          setCurrentUserIdx(prev => Math.min(prev + 1, totalUsers - 1));
          setCurrentIndex(0);
          setLiked(false);
          swipeX.setValue(0);
          setPaused(false);
        });
      } else if (shouldSwipeRight) {
        Animated.timing(swipeX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
          setCurrentUserIdx(prev => Math.max(prev - 1, 0));
          setCurrentIndex(0);
          setLiked(false);
          swipeX.setValue(0);
          setPaused(false);
        });
      } else {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, speed: 20 }).start(() => {
          setPaused(false);
        });
      }
    },
  }), [hasGroups, viewersSheetOpen, showOptionsMenu, currentUserIdx, totalUsers]);

  const goNext = useCallback(() => {
    if (total === 0) return;
    if (currentIndex + 1 < total) {
      setCurrentIndex(p => p + 1);
      setLiked(false);
    } else if (hasGroups && currentUserIdx + 1 < totalUsers) {
      // Auto-advance to next user
      setCurrentUserIdx(prev => prev + 1);
      setCurrentIndex(0);
      setLiked(false);
    } else {
      onClose();
    }
  }, [currentIndex, total, onClose, hasGroups, currentUserIdx, totalUsers]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(p => Math.max(0, p - 1));
      setLiked(false);
    } else if (hasGroups && currentUserIdx > 0) {
      // Go to previous user's last story
      const prevUser = userGroups![currentUserIdx - 1];
      setCurrentUserIdx(prev => prev - 1);
      setCurrentIndex(prevUser.items.length - 1);
      setLiked(false);
    }
  }, [currentIndex, hasGroups, currentUserIdx, userGroups]);

  useEffect(() => {
    if (!visible) return;
    const safeUserIdx = hasGroups ? Math.min(startUserIndex, totalUsers - 1) : 0;
    setCurrentUserIdx(safeUserIdx);
    const safeIndex = typeof startIndex === "number" && startIndex >= 0 && startIndex < total ? startIndex : 0;
    setCurrentIndex(safeIndex);
    setPaused(false); setLiked(false); setReplyText(""); setViewersSheetOpen(false); setShowOptionsMenu(false);
    swipeX.setValue(0);
  }, [visible, startIndex, startUserIndex, total, totalUsers, hasGroups]);

  // Load stickers for current story
  useEffect(() => {
    if (!visible || total === 0 || currentIndex >= total) return;
    if (!storyStickersRpcAvailable) { setStickers([]); return; }
    const current = activeItems[currentIndex];
    if (!current) return;
    const storyId = Number(current.id);
    if (!Number.isFinite(storyId) || storyId <= 0) return;

    supabase.rpc("get_story_stickers", { _story_id: storyId })
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          if (isMissingRpcError(error)) storyStickersRpcAvailable = false;
          setStickers([]);
          return;
        }
        if (data) setStickers(data as StickerData[]);
        else setStickers([]);
      })
      .catch(() => setStickers([]));
  }, [visible, currentIndex, currentUserIdx, activeItems, total]);

  const fetchCounts = useCallback((storyId: number) => {
    Promise.all([
      supabase.from("story_view_counts").select("views_count").eq("story_id", storyId).maybeSingle(),
      supabase.from("story_like_counts").select("likes_count").eq("story_id", storyId).maybeSingle(),
    ]).then(([viewsRes, likesRes]: [any, any]) => {
      setViewsCount(viewsRes.data?.views_count ?? 0);
      setLikesCount(likesRes.data?.likes_count ?? 0);
    }).catch(() => {});
  }, []);

  const registerView = useCallback(async (storyId: number, viewerId: string) => {
    if (!Number.isFinite(storyId) || storyId <= 0 || !viewerId) return;
    if (viewedStoryIdsRef.current.has(storyId)) return;

    const { error: rpcError } = await supabase.rpc("register_story_view", { _story_id: storyId });
    if (rpcError) {
      const { error: insertError } = await supabase.from("story_views").insert({ story_id: storyId, viewer_id: viewerId } as any);
      if (insertError && String(insertError.message ?? "").includes('column "user_id"')) {
        await supabase.from("story_views").insert({ story_id: storyId, viewer_id: viewerId, user_id: viewerId } as any);
      } else if (insertError && !isDuplicateInsertError(insertError)) {
        console.warn("story view failed:", insertError.message);
        return;
      }
    }
    viewedStoryIdsRef.current.add(storyId);
  }, []);

  useEffect(() => {
    if (!visible || total === 0 || currentIndex < 0 || currentIndex >= total) return;
    const current = activeItems[currentIndex];
    if (!current || !authUserId) return;
    const storyId = Number(current.id);
    const isOwner = current.user_id === authUserId;

    if (!isOwner && Number.isFinite(storyId) && storyId > 0) {
      registerView(storyId, authUserId).catch(() => {});
    }

    if (isOwner) {
      fetchCounts(storyId);
      const channel = supabase.channel(`story-eng-${storyId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "story_views", filter: `story_id=eq.${storyId}` }, () => fetchCounts(storyId))
        .on("postgres_changes", { event: "*", schema: "public", table: "story_likes", filter: `story_id=eq.${storyId}` }, () => fetchCounts(storyId))
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }

    if (!isOwner) {
      supabase.from("story_likes").select("id").eq("story_id", storyId).eq("user_id", authUserId).maybeSingle()
        .then(({ data }: { data: any }) => { setLiked(!!data); }).catch(() => {});
    }
  }, [visible, currentIndex, currentUserIdx, authUserId, activeItems, total, fetchCounts, registerView]);

  if (!visible || total === 0 || currentIndex < 0 || currentIndex >= total) return null;

  const current = activeItems[currentIndex];
  const isOwner = !!authUserId && current?.user_id === authUserId;
  const headerName = current?.userName || current?.username || activeGroup?.username || "Story";
  const headerAvatar: string | null = current?.userAvatarUrl || current?.avatar_url || activeGroup?.avatarUrl || null;
  const headerTime = formatStoryTime(current?.createdAt || current?.created_at || null);
  const durationSec = typeof current.duration === "number" && current.duration > 0 ? current.duration : STORY_DURATION_DEFAULT;
  const f = getFilter(current?.filter);
  const isCloseFriendsStory = !!current?.close_friends_only;
  const rawTextOverlays = current?.text_overlays as any;
  const storyTextOverlays = (() => {
    if (!rawTextOverlays) return [] as any[];
    if (Array.isArray(rawTextOverlays)) return rawTextOverlays;
    if (typeof rawTextOverlays === "string") {
      try {
        const parsed = JSON.parse(rawTextOverlays);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  })();

  const handlePress = (evt: any) => {
    if (viewersSheetOpen || showOptionsMenu || isSwipingRef.current) return;
    const x = evt.nativeEvent.locationX;
    if (x < SCREEN_W * 0.3) goPrev();
    else goNext();
  };

  const handleLongPress = () => { if (!viewersSheetOpen) setPaused(true); };
  const handlePressOut = () => { if (!viewersSheetOpen && !isSwipingRef.current) setPaused(false); };

  const handleDoubleTap = async () => {
    setLiked(true); setShowHeart(true); heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.2, useNativeDriver: true, speed: 20 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 20 }),
      Animated.delay(600),
      Animated.timing(heartScale, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowHeart(false));

    if (authUserId && current) {
      const storyId = Number(current.id);
      registerView(storyId, authUserId).catch(() => {});
      supabase.from("story_likes").insert({ story_id: storyId, user_id: authUserId }).then(() => {
        fetchCounts(storyId);
        if (current.user_id && current.user_id !== authUserId) {
          supabase.rpc("create_notification", {
            _recipient_id: current.user_id, _actor_id: authUserId, _type: "story_like", _story_id: storyId,
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  };

  const handleToggleLike = async () => {
    if (!authUserId || !current) return;
    const storyId = Number(current.id);
    if (liked) { setLiked(false); supabase.from("story_likes").delete().eq("story_id", storyId).eq("user_id", authUserId).catch(() => {}); }
    else handleDoubleTap();
  };

  const handleSendReply = () => {
    const text = replyText.trim();
    if (!text) return;
    onReply?.(text, current.id);
    setReplyText("");
  };

  // ─── DELETE story ───
  const handleDeleteStory = async () => {
    if (!isOwner) return;
    const storyId = Number(current.id);
    const doDelete = async () => {
      try {
        const { error } = await supabase.rpc("delete_own_story", { _story_id: storyId }).then((r: any) => r);
        if (error) { Alert.alert("Erro", "Não foi possível excluir o story."); return; }
        onDeleted?.(current.id);
        if (currentIndex + 1 < total) goNext();
        else onClose();
      } catch {
        Alert.alert("Erro", "Não foi possível excluir o story.");
      }
    };
    if (Platform.OS === "web") {
      if (confirm("Excluir este story?")) doDelete();
    } else {
      Alert.alert("Excluir Story", "Tem certeza que deseja excluir?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Excluir", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  // ─── SHARE story ───
  const handleShareStory = async () => {
    if (!authUserId) return;
    const storyId = Number(current.id);
    try {
      await supabase.rpc("share_story", { _story_id: storyId, _share_type: "dm" });
      Alert.alert("Compartilhado!", "Story compartilhado com sucesso.");
    } catch {
      Alert.alert("Erro", "Falha ao compartilhar.");
    }
  };

  // ─── MUTE stories ───
  const handleMuteUser = async () => {
    if (!current?.user_id || !authUserId) return;
    try {
      const { data: nowMuted } = await supabase.rpc("toggle_mute_stories", { _target_user_id: current.user_id });
      setIsMuted(!!nowMuted);
      Alert.alert(nowMuted ? "Silenciado" : "Desilenciado", nowMuted ? "Você não verá mais os stories desta pessoa." : "Stories desta pessoa voltarão a aparecer.");
    } catch {
      Alert.alert("Erro", "Falha ao silenciar.");
    }
  };

  // ─── OPTIONS MENU ───
  const showOptions = () => {
    setPaused(true);
    if (Platform.OS === "ios") {
      const options = isOwner
        ? ["Excluir Story", "Adicionar ao Destaque", "Compartilhar", "Cancelar"]
        : ["Compartilhar", `${isMuted ? "Desilenciar" : "Silenciar"} stories`, "Cancelar"];
      const destructiveIndex = isOwner ? 0 : undefined;
      const cancelIndex = options.length - 1;
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (index) => {
          if (isOwner) {
            if (index === 0) handleDeleteStory();
            else if (index === 1) handleAddToHighlight();
            else if (index === 2) handleShareStory();
          } else {
            if (index === 0) handleShareStory();
            else if (index === 1) handleMuteUser();
          }
          setPaused(false);
        }
      );
    } else {
      setShowOptionsMenu(true);
    }
  };

  // ─── ADD TO HIGHLIGHT ───
  const handleAddToHighlight = async () => {
    if (!isOwner || !authUserId) return;
    try {
      let { data: highlights } = await supabase.from("story_highlights").select("id, title").eq("user_id", authUserId).order("position").limit(5);
      if (!highlights || highlights.length === 0) {
        const { data: newH } = await supabase.from("story_highlights").insert({ user_id: authUserId, title: "Destaque" }).select("id").single();
        if (newH) {
          await supabase.rpc("add_story_to_highlight", { _story_id: Number(current.id), _highlight_id: newH.id });
          Alert.alert("✓", "Adicionado ao destaque!");
        }
      } else {
        await supabase.rpc("add_story_to_highlight", { _story_id: Number(current.id), _highlight_id: highlights[0].id });
        Alert.alert("✓", `Adicionado a "${highlights[0].title}"!`);
      }
    } catch {
      Alert.alert("Erro", "Falha ao adicionar ao destaque.");
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <Animated.View
        style={[s.container, { transform: [{ translateX: swipeX }] }]}
        {...panResponder.panHandlers}
      >
        {/* Full-screen media */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressOut={handlePressOut}
          delayLongPress={200}
        >
          <View style={StyleSheet.absoluteFill}>
            {current.media_type === "image" ? (
              <Image source={{ uri: current.media_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <StoryVideo uri={current.media_url} playing={!paused} />
            )}

            {/* Filter overlays — light since image is already baked with LUT */}
            {f && f.overlay && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
            )}
            {f?.glow && (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <LinearGradient colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.0)"]}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160 }} />
              </View>
            )}
            {f?.vignette && (
              <>
                <LinearGradient colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0)"]}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: 200 }} />
                <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.5)"]}
                  style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 240 }} />
              </>
            )}
          </View>
        </Pressable>

        {/* Interactive Stickers */}
        <StoryStickers stickers={stickers} isOwner={isOwner} />

        <LinearGradient colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]} style={s.topGradient} pointerEvents="none" />
        <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.5)"]} style={s.bottomGradient} pointerEvents="none" />

        {/* Progress + Header */}
        <View style={s.topOverlay} pointerEvents="box-none">
          <ProgressBar count={total} currentIndex={currentIndex} paused={paused}
            durationMs={durationSec * 1000} onFinish={goNext} fillColor={isCloseFriendsStory ? "#5dcd5b" : (theme.colors.primary || "#fff")} />

          <View style={s.header}>
            <TouchableOpacity style={s.headerLeft} activeOpacity={0.8}
              onPress={() => { if (current?.user_id) { onClose(); onPressUser?.(current.user_id); } }}>
              {/* Avatar with close friends green ring */}
              {isCloseFriendsStory ? (
                <View style={s.closeFriendRing}>
                  {headerAvatar ? (
                    <Image source={{ uri: headerAvatar }} style={s.avatarInRing} contentFit="cover" />
                  ) : (
                    <View style={[s.avatarInRing, s.avatarPlaceholder]}>
                      <Text style={s.avatarInitial}>{(headerName || "S").charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              ) : headerAvatar ? (
                <Image source={{ uri: headerAvatar }} style={s.avatar} contentFit="cover" />
              ) : (
                <View style={[s.avatar, s.avatarPlaceholder]}>
                  <Text style={s.avatarInitial}>{(headerName || "S").charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={s.headerTextCol}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={s.headerName} numberOfLines={1}>{headerName}</Text>
                  {isCloseFriendsStory && (
                    <View style={s.closeFriendBadge}>
                      <Text style={{ fontSize: 8, color: "#fff", fontWeight: "800" }}>⭐</Text>
                    </View>
                  )}
                </View>
                <View style={s.headerMetaRow}>
                  {!!headerTime && <Text style={s.headerTime}>{headerTime}</Text>}
                  {!!current?.location && <Text style={s.headerLocation}>📍 {current.location}</Text>}
                </View>
              </View>
            </TouchableOpacity>

            <View style={s.headerRight}>
              {paused && !viewersSheetOpen && (
                <View style={s.pausedBadge}><Text style={s.pausedText}>⏸</Text></View>
              )}
              <TouchableOpacity style={s.optionsBtn} onPress={showOptions} activeOpacity={0.7}>
                <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* User position dots (for multi-user swipe) */}
          {hasGroups && totalUsers > 1 && (
            <View style={s.userDotsRow}>
              {userGroups!.map((_, idx) => (
                <View key={idx} style={[s.userDot, idx === currentUserIdx && s.userDotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* Caption overlay */}
        {!!current?.caption && (
          <View style={s.captionOverlay} pointerEvents="none">
            <Text style={s.captionText} numberOfLines={3}>{current.caption}</Text>
          </View>
        )}
        {storyTextOverlays.map((t: any, idx: number) => (
          <View
            key={`story-text-${idx}`}
            pointerEvents="none"
            style={[
              s.storyTextOverlay,
              {
                left: Number(t?.x ?? 0),
                top: Number(t?.y ?? 0),
                backgroundColor: t?.bg && t.bg !== "transparent" ? t.bg : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: t?.color || "#fff",
                fontSize: Number(t?.fontSize ?? 28),
                fontWeight: (t?.fontWeight || "700") as any,
                textAlign: (t?.align || "center") as any,
              }}
            >
              {String(t?.text ?? "")}
            </Text>
          </View>
        ))}

        {/* Heart animation */}
        {showHeart && (
          <Animated.View style={[s.heartOverlay, { transform: [{ scale: heartScale }] }]} pointerEvents="none">
            <Ionicons name="heart" size={80} color="#ff3b5c" />
          </Animated.View>
        )}

        {/* Bottom bar — Instagram style */}
        <View style={s.bottomBar} pointerEvents="box-none">
          {isOwner ? (
            /* Owner: just show view count + likes — all actions in "..." menu */
            <View style={s.ownerBottomRow}>
              <TouchableOpacity style={s.viewCountRow} activeOpacity={0.7} onPress={() => { setPaused(true); setViewersSheetOpen(true); }}>
                <Ionicons name="eye-outline" size={20} color="#fff" />
                <Text style={s.viewCountText}>{viewsCount}</Text>
                <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <View style={s.ownerStatsRow}>
                <Ionicons name="heart" size={16} color="#ff3b5c" />
                <Text style={s.ownerStatText}>{likesCount}</Text>
              </View>
            </View>
          ) : (
            /* Viewer: reply input + like + share — Instagram layout */
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
              <TouchableOpacity style={[s.actionBtn, liked && { backgroundColor: "rgba(255,59,92,0.2)" }]}
                onPress={handleToggleLike} activeOpacity={0.7}>
                <Ionicons name={liked ? "heart" : "heart-outline"} size={24} color={liked ? "#ff3b5c" : "#fff"} />
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} activeOpacity={0.7} onPress={handleShareStory}>
                <Ionicons name="paper-plane-outline" size={22} color="#fff" />
              </TouchableOpacity>
              {replyText.trim().length > 0 && (
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: "rgba(0,149,246,0.3)" }]} activeOpacity={0.7} onPress={handleSendReply}>
                  <Ionicons name="send" size={20} color="#0095f6" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Android options menu */}
        {showOptionsMenu && Platform.OS !== "ios" && (
          <Pressable style={s.optionsOverlay} onPress={() => { setShowOptionsMenu(false); setPaused(false); }}>
            <View style={s.optionsSheet}>
              {isOwner ? (
                <>
                  <TouchableOpacity style={s.optionRow} onPress={() => { setShowOptionsMenu(false); handleDeleteStory(); }}>
                    <Ionicons name="trash-outline" size={20} color="#ff3b5c" />
                    <Text style={[s.optionText, { color: "#ff3b5c" }]}>Excluir Story</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.optionRow} onPress={() => { setShowOptionsMenu(false); handleAddToHighlight(); }}>
                    <Ionicons name="bookmark-outline" size={20} color="#fff" />
                    <Text style={s.optionText}>Adicionar ao Destaque</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.optionRow} onPress={() => { setShowOptionsMenu(false); handleShareStory(); }}>
                    <Ionicons name="paper-plane-outline" size={20} color="#fff" />
                    <Text style={s.optionText}>Compartilhar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={s.optionRow} onPress={() => { setShowOptionsMenu(false); handleShareStory(); }}>
                    <Ionicons name="paper-plane-outline" size={20} color="#fff" />
                    <Text style={s.optionText}>Compartilhar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.optionRow} onPress={() => { setShowOptionsMenu(false); handleMuteUser(); }}>
                    <Ionicons name={isMuted ? "volume-high-outline" : "volume-mute-outline"} size={20} color="#fff" />
                    <Text style={s.optionText}>{isMuted ? "Desilenciar" : "Silenciar"} stories</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Pressable>
        )}

        {/* Viewers Sheet */}
        <StoryViewersSheet
          visible={viewersSheetOpen}
          storyId={current.id}
          viewsCount={viewsCount}
          likesCount={likesCount}
          onClose={() => { setViewersSheetOpen(false); setPaused(false); }}
          onPressUser={(userId) => { setViewersSheetOpen(false); setPaused(false); onClose(); onPressUser?.(userId); }}
        />
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 160, zIndex: 5 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 200, zIndex: 5 },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" },
  avatarPlaceholder: { backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontWeight: "800", fontSize: 15 },
  // Close friends green ring avatar
  closeFriendRing: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2.5, borderColor: "#5dcd5b",
    alignItems: "center", justifyContent: "center",
  },
  avatarInRing: { width: 34, height: 34, borderRadius: 17 },
  closeFriendBadge: {
    backgroundColor: "#27ae60", borderRadius: 6,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  headerTextCol: { marginLeft: 10, flex: 1 },
  headerName: { color: "#fff", fontSize: 14, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  headerMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 1 },
  headerTime: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "500" },
  headerLocation: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "500" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  pausedBadge: { backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  pausedText: { color: "#fff", fontSize: 12 },
  optionsBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  // User dots for multi-user navigation
  userDotsRow: { flexDirection: "row", justifyContent: "center", gap: 4, paddingTop: 4 },
  userDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  userDotActive: { backgroundColor: "#fff", width: 16 },
  captionOverlay: { position: "absolute", bottom: 120, left: 16, right: 60, zIndex: 8 },
  captionText: { color: "#fff", fontSize: 15, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  storyTextOverlay: { position: "absolute", maxWidth: SCREEN_W - 24, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, zIndex: 8 },
  heartOverlay: { position: "absolute", top: "50%" as any, left: "50%" as any, marginLeft: -40, marginTop: -40, zIndex: 20 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: 12, paddingBottom: Platform.select({ ios: 44, android: 32, default: 24 }) },
  ownerBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  viewCountRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 24 },
  viewCountText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  ownerStatsRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 24 },
  ownerStatText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  replyInput: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 16, color: "#fff", fontSize: 14, fontWeight: "500" },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  optionsOverlay: { ...StyleSheet.absoluteFillObject as any, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", zIndex: 30 },
  optionsSheet: { backgroundColor: "rgba(30,30,30,0.98)", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 12, paddingHorizontal: 16, paddingBottom: 40 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  optionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
