// app/(tabs)/profile.tsx
import StoryViewer, { type StoryItem } from "@/components/StoryViewer";
import Colors from "@/constants/Colors";
import { useTranslation } from "@/lib/i18n";
import { uploadStory } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "@react-navigation/native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
  ActivityIndicator,
  Alert, Animated, Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import CommentsSheet from "@/components/CommentsSheet";
import FollowModal from "@/components/FollowModal";
import FullscreenViewer, { ViewerItem } from "@/components/FullscreenViewer";
import MatchCelebration from "@/components/MatchCelebration";
import PeopleListSheet from "@/components/PeopleListSheet";
import ProfileHighlightEditor from "@/components/ProfileHighlightEditor";
import ReportModal from "@/components/ReportModal";
import SwipeableTabScreen from "@/components/SwipeableTabScreen";
import ThemeSelector from "@/components/ThemeSelector";
import { useTheme } from "@/contexts/ThemeContext";
import { ConversationType, getOrCreateConversation } from "@/lib/conversations";
import type { ProfileVisitor } from "@/lib/engagement";
import {
  BADGE_CONFIG,
  type Badge,
  type BoostInfo,
  LEVEL_CONFIG,
  type PostBoostInfo,
  type ProfileViewStats,
  type UserLevelInfo,
  boostPost,
  cancelPostBoost,
  getActiveBoost,
  getMyBoostedPosts,
  getProfileViewStats,
  getProfileVisitors,
  getUserLevelAndBadges,
  getXpProgress,
  registerProfileView
} from "@/lib/engagement";
import { type BlockedUser, blockUser, getBlockedUsers, isUserBlocked, unblockUser, unblockUser as unblockUserMod } from "@/lib/moderation";
import {
  type Highlight,
  fetchHighlightItems,
  fetchPostViewCounts,
  fetchUserHighlights
} from "@/lib/profileHighlights";
import { setFollowInterestType } from "@/lib/social";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";
import { type SettingKey, type TextSettingKey, type UserSettings, getOrCreateUserSettings, updateFilteredWords, updateUserSetting, updateUserSettingText } from "@/lib/userSettings";

type DbPost = {
  id: number;
  user_id: string;
  media_type: "image" | "video";
  image_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  created_at: string;
};

type UiPost = DbPost & {
  image_url: string;
  media_url: string;
};

type InterestType = "friend" | "crush" | "silent_crush" | "super_crush";
type RelationshipStatus = "single" | "committed" | "other";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  relationship_status?: RelationshipStatus | null;
  relationship_status_changed_at?: string | null;
  gender?: string | null;
  partner_id?: string | null;
};

type StoryRow = {
  id: number;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  created_at: string;
};

type SocialStatsRow = {
  user_id: string;
  followers_count: number | null;
  following_count: number | null;
  crush_count: number | null;
};

type GradientButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

type Counter = {
  likes: number;
  comments: number;
  reposts: number;
  liked?: boolean;
};

const PAGE = 24;
const GAP = 2;
const GRID_MAX_WIDTH = 935;
const WINDOW_WIDTH = Dimensions.get("window").width;
const ITEM = (Math.min(WINDOW_WIDTH, GRID_MAX_WIDTH) - GAP * 2) / 3;

function GradientButton({ title, onPress, disabled, style }: GradientButtonProps) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={disabled ? undefined : onPress} disabled={disabled} style={style}>
      <LinearGradient
        colors={[Colors.brandStart, Colors.brandEnd]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.btn, { opacity: disabled ? 0.6 : 1 }]}
      >
        <Text style={styles.btnText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

async function pathToUsableUrl(path: string) {
  // Always use signed URLs for reliability (bucket may be private)
  const signed = await supabase.storage.from("posts").createSignedUrl(path, 60 * 60);
  if (!signed.error && signed.data?.signedUrl) {
    return signed.data.signedUrl;
  }
  // Fallback to public URL
  const pub = supabase.storage.from("posts").getPublicUrl(path);
  return pub.data.publicUrl;
}

function formatVisitTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? "ontem" : `${days}d`;
}

function extractTagsFromBio(bio: string) {
  const tags = (bio || "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.startsWith("#"))
    .map((w) => w.replace(/^#+/, "").replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((w) => !!w);

  const unique: string[] = [];
  for (const t of tags) {
    const key = t.toLowerCase();
    if (!unique.some((x) => x.toLowerCase() === key)) unique.push(t);
    if (unique.length >= 3) break;
  }
  return unique;
}

function gridPath(p: DbPost) {
  return p.media_type === "video" && p.thumbnail_path ? p.thumbnail_path : p.image_path;
}

export default function Profile() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const { theme } = useTheme();
  const { t } = useTranslation();


  const routeUserId = typeof params.userId === "string" ? params.userId : null;

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [username, setUsername] = useState<string>("Me");
  const [fullName, setFullName] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [draftUsername, setDraftUsername] = useState<string>("");
  const [draftFullName, setDraftFullName] = useState<string>("");
  const [draftBio, setDraftBio] = useState<string>("");
  const [draftRelationshipStatus, setDraftRelationshipStatus] = useState<RelationshipStatus | null>(null);
  const [draftGender, setDraftGender] = useState<string>("");
  const [cooldownWarning, setCooldownWarning] = useState<string | null>(null);
  const [draftPartnerId, setDraftPartnerId] = useState<string | null>(null);
  const [partnerSearchQuery, setPartnerSearchQuery] = useState("");
  const [partnerSearchResults, setPartnerSearchResults] = useState<ProfileRow[]>([]);
  const [partnerProfile, setPartnerProfile] = useState<ProfileRow | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMessage, setUsernameMessage] = useState<string>("");
  const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameShakeAnim = useRef(new Animated.Value(0)).current;

  const [editing, setEditing] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const [posts, setPosts] = useState<UiPost[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<"grid" | "reels" | "tagged">("grid");

  const [loadingHeader, setLoadingHeader] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [highlightCover, setHighlightCover] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightEditorVisible, setHighlightEditorVisible] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [highlightViewerOpen, setHighlightViewerOpen] = useState(false);
  const [highlightViewerItems, setHighlightViewerItems] = useState<StoryItem[]>([]);
  const [viewCounts, setViewCounts] = useState<Record<number, number>>({});

  const loadingRef = useRef(false);
  const pageRef = useRef(0);

  const [counts, setCounts] = useState<Record<number, Counter>>({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<number | null>(null);
  const IS_WEB = Platform.OS === "web";
  const isMobileWeb = useIsMobileWeb(900);
  const isDesktopWeb = IS_WEB && !isMobileWeb;
  const isMobileLayout = !isDesktopWeb;

  const resumeViewerAfterCommentsRef = useRef(false);
  const resumeViewerIndexRef = useRef(0);

  const [webComments, setWebComments] = useState<any[]>([]);
  const [webCommentsLoading, setWebCommentsLoading] = useState(false);
  const [webCommentText, setWebCommentText] = useState("");

  const [stories, setStories] = useState<StoryRow[]>([]);
  const [, setLoadingStories] = useState(false);
  const [storiesViewerOpen, setStoriesViewerOpen] = useState(false);
  const [storiesViewerIndex, setStoriesViewerIndex] = useState(0);

  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus | null>(null);
  const [myRelationshipStatus, setMyRelationshipStatus] = useState<RelationshipStatus | null>(null);
  const [relationshipStatusChangedAt, setRelationshipStatusChangedAt] = useState<string | null>(null);
  const [gender, setGender] = useState<string>("");

  const getCooldownTimeLeft = useCallback((): string | null => {
    if (!relationshipStatusChangedAt) return null;
    const changedDate = new Date(relationshipStatusChangedAt).getTime();
    const now = Date.now();
    const hoursSince = (now - changedDate) / (1000 * 60 * 60);
    if (hoursSince >= 24) return null;
    const hoursLeft = Math.ceil(24 - hoursSince);
    const minutesLeft = Math.ceil((24 - hoursSince) * 60);
    return hoursLeft >= 1 ? `${hoursLeft}h` : `${minutesLeft} minuto${minutesLeft !== 1 ? "s" : ""}`;
  }, [relationshipStatusChangedAt]);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const triggerUsernameShake = useCallback(() => {
    usernameShakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(usernameShakeAnim, { toValue: 8, duration: 40, useNativeDriver: true }),
      Animated.timing(usernameShakeAnim, { toValue: -8, duration: 40, useNativeDriver: true }),
      Animated.timing(usernameShakeAnim, { toValue: 6, duration: 40, useNativeDriver: true }),
      Animated.timing(usernameShakeAnim, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(usernameShakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [usernameShakeAnim]);

  const handleUsernameChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9._]/g, "");
    setDraftUsername(cleaned);

    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);

    if (!cleaned || cleaned.length < 3) {
      setUsernameStatus(cleaned.length > 0 ? "invalid" : "idle");
      setUsernameMessage(cleaned.length > 0 ? t("profile.usernameMinChars") : "");
      return;
    }

    // Same as current username — no check needed
    if (cleaned === username?.toLowerCase()) {
      setUsernameStatus("available");
      setUsernameMessage(t("profile.usernameCurrentOk"));
      return;
    }

    setUsernameStatus("checking");
    setUsernameMessage(t("profile.usernameChecking"));

    usernameCheckTimer.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("check_username_available", {
          _username: cleaned,
          _user_id: userId || "",
        });
        if (error) throw error;
        if (data === true) {
          setUsernameStatus("available");
          setUsernameMessage(t("profile.usernameAvailable"));
        } else {
          setUsernameStatus("taken");
          setUsernameMessage(t("profile.usernameTaken"));
          triggerUsernameShake();
        }
      } catch {
        // Fallback: direct query
        try {
          const { data: rows } = await supabase
            .from("profiles")
            .select("id")
            .ilike("username", cleaned)
            .neq("id", userId || "")
            .limit(1);
          if (rows && rows.length > 0) {
            setUsernameStatus("taken");
            setUsernameMessage(t("profile.usernameTaken"));
            triggerUsernameShake();
          } else {
            setUsernameStatus("available");
            setUsernameMessage(t("profile.usernameAvailable"));
          }
        } catch {
          setUsernameStatus("idle");
          setUsernameMessage("");
        }
      }
    }, 450);
  }, [userId, username, triggerUsernameShake]);

  const isUsernameSaveBlocked = usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking";

  const handleRelationshipPillPress = useCallback(
    (value: RelationshipStatus) => {
      if (value === draftRelationshipStatus) return;
      const timeLeft = getCooldownTimeLeft();
      if (timeLeft) {
        setCooldownWarning(`⏳ Aguarde mais ${timeLeft} para alterar seu status novamente.`);
        triggerShake();
        return;
      }
      setCooldownWarning(null);
      setDraftRelationshipStatus(value);
    },
    [draftRelationshipStatus, getCooldownTimeLeft, triggerShake],
  );
  const [settingsSubScreen, setSettingsSubScreen] = useState<string | null>(null);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);

  const [currentInterestType, setCurrentInterestType] = useState<InterestType | null>(null);
  const [theirInterestType, setTheirInterestType] = useState<InterestType | null>(null);

  const [isFollowModalVisible, setFollowModalVisible] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const [silentModalVisible, setSilentModalVisible] = useState(false);
  const [silentModalTitle, setSilentModalTitle] = useState("");
  const [silentModalMessage, setSilentModalMessage] = useState("");

  const [matchCelebrationVisible, setMatchCelebrationVisible] = useState(false);
  const [matchedUserName, setMatchedUserName] = useState("");

  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false);

  const [peopleSheetVisible, setPeopleSheetVisible] = useState(false);
  const [peopleSheetMode, setPeopleSheetMode] = useState<"followers" | "following" | "interested">("followers");

  // ── Engagement state ──
  const [levelInfo, setLevelInfo] = useState<UserLevelInfo | null>(null);
  const [boostInfo, setBoostInfo] = useState<BoostInfo | null>(null);
  const [profileViewStats, setProfileViewStats] = useState<ProfileViewStats | null>(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostCountdown, setBoostCountdown] = useState<string | null>(null);
  const [visitorsModalVisible, setVisitorsModalVisible] = useState(false);
  const [visitors, setVisitors] = useState<ProfileVisitor[]>([]);
  const [boostedPostIds, setBoostedPostIds] = useState<Set<number>>(new Set());
  const [promoteModalVisible, setPromoteModalVisible] = useState(false);
  const [promotePostId, setPromotePostId] = useState<number | null>(null);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [visitorsLoading, setVisitorsLoading] = useState(false);

  // ── Moderation state ──
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [isTargetBlocked, setIsTargetBlocked] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  // ── User Settings state ──
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [settingsDeepScreen, setSettingsDeepScreen] = useState<string | null>(null);
  const [filteredWordsInput, setFilteredWordsInput] = useState("");
  const [closeFriendsList, setCloseFriendsList] = useState<any[]>([]);
  const [restrictedList, setRestrictedList] = useState<any[]>([]);
  const [hiddenStoryList, setHiddenStoryList] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [savedCollections, setSavedCollections] = useState<any[]>([]);
  const [deepListLoading, setDeepListLoading] = useState(false);
  const [deepSearchQuery, setDeepSearchQuery] = useState("");
  const [deepSearchResults, setDeepSearchResults] = useState<any[]>([]);
  const [deepSearchLoading, setDeepSearchLoading] = useState(false);
  const deepSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwnProfile = !!authUserId && userId === authUserId;
  const isViewingOther = !!routeUserId && routeUserId !== authUserId;

  const bioTags = extractTagsFromBio(bio);

  // ── Feedback phrase based on metrics ──
  const feedbackPhrase = (() => {
    if (!isOwnProfile || !levelInfo || !profileViewStats) return null;
    const v24 = profileViewStats.views_24h ?? 0;
    const v7d = profileViewStats.views_7d ?? 0;
    const likes = levelInfo.total_likes_received ?? 0;
    const crushes = levelInfo.total_crushes_received ?? 0;
    const followers = levelInfo.total_followers ?? 0;

    if (v24 > 15 && crushes > 3) return { text: "🔥 Seu perfil está em alta! Muita gente interessada.", color: "#F59E0B" };
    if (crushes >= 10) return { text: "💘 Você é muito desejado(a)! Crushes não param.", color: "#FF1493" };
    if (v24 >= 20) return { text: "🚀 Seu perfil está explodindo hoje!", color: "#EF4444" };
    if (v24 >= 10) return { text: "👀 Muita gente curiosa sobre você hoje!", color: "#8B5CF6" };
    if (likes >= 50) return { text: "⭐ Suas fotos estão fazendo sucesso!", color: "#F59E0B" };
    if (followers >= 20) return { text: "🧲 Você está atraindo muitos seguidores!", color: "#EC4899" };
    if (v7d >= 30) return { text: "📈 Semana forte! Seu perfil está em alta.", color: "#06B6D4" };
    if (v24 >= 3) return { text: "✨ Alguém está de olho em você...", color: "#A78BFA" };
    return null;
  })();

  // ── Load visitors ──
  const loadVisitors = useCallback(async () => {
    setVisitorsLoading(true);
    try {
      const v = await getProfileVisitors(20);
      setVisitors(v);
    } catch {
      setVisitors([]);
    } finally {
      setVisitorsLoading(false);
    }
  }, []);

  const openVisitorsModal = useCallback(() => {
    setVisitorsModalVisible(true);
    loadVisitors();
  }, [loadVisitors]);

  // ── Boost countdown timer (updates every 15s to avoid excessive re-renders) ──
  useEffect(() => {
    if (!boostInfo) { setBoostCountdown(null); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(boostInfo.expires_at).getTime() - Date.now()) / 1000));
      if (remaining <= 0) { setBoostCountdown(null); setBoostInfo(null); return; }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      setBoostCountdown(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [boostInfo]);

  const handleActivateBoost = useCallback(async () => {
    // Legacy — kept for backward compat
  }, []);

  const handlePromotePost = useCallback(async () => {
    if (!promotePostId || promoteLoading) return;
    try {
      setPromoteLoading(true);
      await boostPost(promotePostId, "standard", 24);
      setBoostedPostIds((prev) => new Set([...prev, promotePostId]));
      setPromoteModalVisible(false);
      Alert.alert("✨ Post promovido!", "Seu post ficará em destaque no feed por 24 horas.");
    } catch (err: any) {
      if (err?.message?.includes("POST_ALREADY_BOOSTED")) {
        Alert.alert("Já promovido", "Este post já está em destaque.");
      } else if (err?.message?.includes("MAX_BOOSTS_REACHED")) {
        Alert.alert("Limite atingido", "Você pode promover até 3 posts simultaneamente.");
      } else {
        Alert.alert("Erro", "Não foi possível promover o post.");
      }
    } finally {
      setPromoteLoading(false);
    }
  }, [promotePostId, promoteLoading]);

  const handleCancelBoost = useCallback(async (postId: number) => {
    try {
      await cancelPostBoost(postId);
      setBoostedPostIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
      Alert.alert("Promoção cancelada", "O post não será mais destacado.");
    } catch {
      Alert.alert("Erro", "Não foi possível cancelar a promoção.");
    }
  }, []);

  const openPromoteModal = useCallback((postId: number) => {
    if (boostedPostIds.has(postId)) {
      Alert.alert(
        "Post em destaque",
        "Este post já está promovido. Deseja cancelar?",
        [
          { text: "Manter", style: "cancel" },
          { text: "Cancelar promoção", style: "destructive", onPress: () => handleCancelBoost(postId) },
        ]
      );
    } else {
      setPromotePostId(postId);
      setPromoteModalVisible(true);
    }
  }, [boostedPostIds, handleCancelBoost]);

  useEffect(() => {
    setPosts([]);
    setCounts({});
    setHasMore(true);
    pageRef.current = 0;
  }, [userId]);

  useEffect(() => {
    setPosts([]);
    setCounts({});
    setHasMore(true);
    pageRef.current = 0;
  }, [routeUserId]);

  const loadStories = useCallback(async (uid: string) => {
    try {
      setLoadingStories(true);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("view_active_stories")
        .select("*")
        .eq("user_id", uid)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data || []) as any[];

      const mapped: StoryRow[] = rows
        .map((row) => {
          let url: string | null | undefined = row.media_url;

          // media_url from view_active_stories is actually media_path — resolve to public URL
          if (url && !url.startsWith("http")) {
            const { data: publicData } = supabase.storage.from("stories").getPublicUrl(url);
            url = publicData?.publicUrl ?? url;
          }

          if (!url && row.media_path) {
            const { data: publicData } = supabase.storage.from("stories").getPublicUrl(row.media_path as string);
            url = publicData?.publicUrl ?? "";
          }

          if (!url) return null;

          return {
            id: row.id,
            user_id: row.user_id,
            media_type: row.media_type,
            media_url: url,
            created_at: row.created_at,
          } as StoryRow;
        })
        .filter((s): s is StoryRow => !!s);

      setStories(mapped);
    } catch (e) {
      console.log("loadStories error", e);
    } finally {
      setLoadingStories(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      setLoadingHeader(true);

      const result = await supabase.auth.getUser();
      const data = result.data;
      const error = result.error;

      if (error || !data?.user) {
        router.replace("/");
        return;
      }

      const u = data.user;
      setAuthUserId(u.id);
      setAuthEmail(u.email ?? null);

      const targetUserId = routeUserId || u.id;
      setUserId(targetUserId);

      const fallbackUsername =
        (!routeUserId && (u.user_metadata?.username || (u.email ? u.email.split("@")[0] : "Me"))) || "user";

      let relStatus: RelationshipStatus | null = null;

      try {
        const { data: row, error: profileErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", targetUserId)
          .maybeSingle();

        if (!profileErr && row) {
          const r = row as ProfileRow;
          setProfileRow(r);
          const uName = r.username || fallbackUsername;
          const fName = r.full_name || "";
          const bioText = r.bio || "";
          setUsername(uName);
          setFullName(fName);
          setBio(bioText);
          setAvatarUrl(r.avatar_url);
          setDraftUsername(uName);
          setDraftFullName(fName);
          setDraftBio(bioText);
          relStatus = r.relationship_status ?? null;
          const changedAt = r.relationship_status_changed_at || null;
          setRelationshipStatusChangedAt(changedAt);
          const g = r.gender || "";
          setGender(g);
          setDraftGender(g);
          setDraftRelationshipStatus(relStatus);
          setDraftPartnerId(r.partner_id ?? null);

          // Carregar perfil do parceiro se existir
          if (r.partner_id) {
            const { data: partnerData } = await supabase
              .from("profiles")
              .select("id, username, full_name, avatar_url")
              .eq("id", r.partner_id)
              .maybeSingle();
            if (partnerData) setPartnerProfile(partnerData as ProfileRow);
          } else {
            setPartnerProfile(null);
          }
        } else {
          setProfileRow(null);
          setUsername(fallbackUsername);
          setFullName("");
          setBio("");
          setAvatarUrl(null);
          setDraftUsername(fallbackUsername);
          setDraftFullName("");
          setDraftBio("");
          setDraftRelationshipStatus(null);
          setDraftGender("");
          relStatus = null;
        }
      } catch {
        setProfileRow(null);
        setUsername(fallbackUsername);
        setFullName("");
        setBio("");
        setAvatarUrl(null);
        setDraftUsername(fallbackUsername);
        setDraftFullName("");
        setDraftBio("");
        relStatus = null;
      }

      setRelationshipStatus(relStatus);

      try {
        const { data: stats, error: statsError } = await supabase
          .from("profile_social_stats")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle();
        if (!statsError && stats) {
          const s = stats as SocialStatsRow;
          setFollowersCount(s.followers_count ?? 0);
          setFollowingCount(s.following_count ?? 0);
          setInterestedCount(s.crush_count ?? 0);
        } else {
          setFollowersCount(0);
          setFollowingCount(0);
          setInterestedCount(0);
        }
      } catch {
        setFollowersCount(0);
        setFollowingCount(0);
        setInterestedCount(0);
      }

      if (u.id && targetUserId !== u.id) {
        // Load MY OWN relationship status + partner_id for crush blocking
        try {
          const { data: myProfile } = await supabase
            .from("profiles")
            .select("relationship_status, partner_id")
            .eq("id", u.id)
            .maybeSingle();
          if (myProfile) {
            setMyRelationshipStatus((myProfile as any).relationship_status ?? null);
            setDraftPartnerId((myProfile as any).partner_id ?? null);
          }
        } catch {}

        try {
          const { data: followRow, error: followErr } = await supabase
            .from("follows")
            .select("interest_type")
            .eq("follower_id", u.id)
            .eq("following_id", targetUserId)
            .maybeSingle();
          if (!followErr && followRow) {
            const fr = followRow as { interest_type: InterestType };
            setCurrentInterestType(fr.interest_type);
          } else {
            setCurrentInterestType(null);
          }

          const { data: reverseRow, error: reverseErr } = await supabase
            .from("follows")
            .select("interest_type")
            .eq("follower_id", targetUserId)
            .eq("following_id", u.id)
            .maybeSingle();

          if (!reverseErr && reverseRow) {
            const rr = reverseRow as { interest_type: InterestType };
            setTheirInterestType(rr.interest_type);
          } else {
            setTheirInterestType(null);
          }
        } catch {
          setCurrentInterestType(null);
          setTheirInterestType(null);
        }
      } else {
        // Own profile — my status IS the loaded status
        setMyRelationshipStatus(relStatus);
        setCurrentInterestType(null);
        setTheirInterestType(null);
      }

      await loadStories(targetUserId);

      // Load highlights
      try {
        const hl = await fetchUserHighlights(targetUserId);
        setHighlights(hl);
      } catch { setHighlights([]); }

      // ── Load engagement data ──
      try {
        const [lvl, pvs, boost, myBoosts] = await Promise.all([
          getUserLevelAndBadges(targetUserId),
          getProfileViewStats(targetUserId),
          getActiveBoost(targetUserId),
          isOwnProfile ? getMyBoostedPosts() : Promise.resolve([]),
        ]);
        setLevelInfo(lvl);
        setProfileViewStats(pvs);
        setBoostInfo(boost);
        if (myBoosts.length > 0) {
          setBoostedPostIds(new Set(myBoosts.map((b: PostBoostInfo) => b.post_id)));
        }
      } catch {
        setLevelInfo(null);
        setProfileViewStats(null);
        setBoostInfo(null);
      }

      // Register profile view & check block status if viewing someone else
      if (u.id && targetUserId !== u.id) {
        registerProfileView(targetUserId).catch(() => {});
        isUserBlocked(u.id, targetUserId).then(setIsTargetBlocked).catch(() => {});
      }
    } finally {
      setLoadingHeader(false);
    }
  }, [router, routeUserId, loadStories]);

  const fetchCountsBulk = useCallback(async (ids: number[]) => {
    if (!ids.length) return {};
    const { data, error } = await supabase.from("post_counts").select("*").in("post_id", ids);

    if (error) throw error;

    const res: Record<number, Counter> = {};
    (data || []).forEach((r: any) => {
      res[r.post_id] = {
        likes: r.likes_count ?? 0,
        comments: r.comments_count ?? 0,
        reposts: r.reposts_count ?? 0,
      };
    });
    return res;
  }, []);

  const loadPage = useCallback(
    async (opts?: { reset?: boolean }) => {
      if (!userId) return;
      if (loadingRef.current) return;

      const reset = !!opts?.reset;
      if (reset) {
        pageRef.current = 0;
        setHasMore(true);
      }

      const curPage = pageRef.current;
      const from = curPage * PAGE;
      const to = from + PAGE - 1;

      try {
        loadingRef.current = true;
        setLoadingPosts(true);

        const {
          data: rows,
          error,
          count,
        } = await supabase
          .from("posts")
          .select("id, user_id, media_type, image_path, thumbnail_path, caption, width, height, duration, created_at", { count: "exact" })
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) throw error;

        const mapped = await Promise.all(
          (rows ?? []).map(async (p: DbPost) => {
            const gridUrl = await pathToUsableUrl(gridPath(p));
            const mediaUrl = await pathToUsableUrl(p.image_path);
            return {
              ...p,
              image_url: gridUrl,
              media_url: mediaUrl,
              _hasThumb: p.media_type !== "video" || !!p.thumbnail_path,
            } as UiPost;
          }),
        );

        setPosts((prev) => (reset ? mapped : [...prev, ...mapped]));

        // Fetch view counts for video posts
        const videoIds = mapped.filter((p) => p.media_type === "video").map((p) => p.id);
        if (videoIds.length > 0) {
          try {
            const vc = await fetchPostViewCounts(videoIds);
            setViewCounts((prev) => ({ ...prev, ...vc }));
          } catch {}
        }

        const ids = mapped.map((p) => p.id);
        if (ids.length) {
          try {
            const bulk = await fetchCountsBulk(ids);
            setCounts((prev) => {
              const base = reset ? ({} as Record<number, Counter>) : { ...prev };
              ids.forEach((id) => {
                base[id] = {
                  likes: bulk[id]?.likes ?? base[id]?.likes ?? 0,
                  comments: bulk[id]?.comments ?? base[id]?.comments ?? 0,
                  reposts: bulk[id]?.reposts ?? base[id]?.reposts ?? 0,
                  liked: base[id]?.liked ?? false,
                };
              });
              return base;
            });
          } catch {}
        }

        const total = count ?? 0;
        const reachedEnd = to >= total - 1 || mapped.length < PAGE;
        setHasMore(!reachedEnd);

        if (!reachedEnd) {
          const nextPage = curPage + 1;
          pageRef.current = nextPage;
        }
      } catch (e: any) {
        Alert.alert(t("alert.errorLoadPosts"), e?.message ?? t("alert.tryAgain"));
      } finally {
        loadingRef.current = false;
        setLoadingPosts(false);
        setRefreshing(false);
      }
    },
    [userId, fetchCountsBulk],
  );

  const handleChangeAvatar = useCallback(async () => {
    if (!userId || !isOwnProfile) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("alert.permissionRequired"), t("alert.photoAccessNeeded"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    try {
      const picked = result.assets[0] as any;
      const uri = picked.uri as string;

      let ext = "jpg";
      const mime = (picked.mimeType as string) || "image/jpeg";
      if (mime.includes("png")) ext = "png";
      else if (mime.includes("webp")) ext = "webp";
      else if (mime.includes("jpeg")) ext = "jpg";

      const fileName = `avatar-${userId}-${Date.now()}.${ext}`;

      let uploadBody: any;
      let contentType = mime;

      if (Platform.OS === "web") {
        const response = await fetch(uri);
        const blob: Blob = await response.blob();
        uploadBody = blob;
        contentType = blob.type || mime;
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const binaryString = (global as any).atob ? (global as any).atob(base64) : atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        uploadBody = bytes.buffer;
      }

      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, uploadBody, {
        upsert: true,
        contentType,
      });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
      let publicUrl = data.publicUrl;

      if (publicUrl) {
        publicUrl = `${publicUrl}?t=${Date.now()}`;
      }

      setAvatarUrl(publicUrl);

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (profileError) throw profileError;
    } catch (e: any) {
      console.error("Erro ao atualizar avatar:", e);
      Alert.alert(t("alert.errorUpdatePhoto"), e?.message ?? String(e));
    }
  }, [userId, isOwnProfile]);

  const handlePickHighlight = useCallback(() => {
    // Open the highlight editor to create a new highlight from archived stories
    setEditingHighlight(null);
    setHighlightEditorVisible(true);
  }, []);

  const handleOpenHighlight = useCallback(async (hl: Highlight) => {
    // Fetch highlight items and open the story viewer
    const items = await fetchHighlightItems(hl.id);
    if (items.length === 0) {
      Alert.alert(t("alert.highlightEmpty"), t("alert.highlightEmptyMsg"));
      return;
    }
    const storyItems: StoryItem[] = items.map((i) => {
      let url = i.media_url;
      // media_url from DB is a storage path — convert to public URL if needed
      if (url && !url.startsWith("http")) {
        const { data } = supabase.storage.from("stories").getPublicUrl(url);
        url = data?.publicUrl || url;
      }
      return {
        id: i.story_id,
        media_type: i.media_type as "image" | "video",
        media_url: url,
        filter: i.filter,
        createdAt: i.story_created_at,
      };
    });
    setHighlightViewerItems(storyItems);
    setHighlightViewerOpen(true);
  }, []);

  const handleEditHighlight = useCallback((hl: Highlight) => {
    setEditingHighlight(hl);
    setHighlightEditorVisible(true);
  }, []);

  const handleHighlightSaved = useCallback(async () => {
    if (!userId) return;
    const hl = await fetchUserHighlights(userId);
    setHighlights(hl);
  }, [userId]);

  const handleSaveProfile = useCallback(async () => {
    if (!userId || !isOwnProfile) return;
    if (!draftUsername.trim()) {
      Alert.alert(t("alert.usernameRequired"), t("alert.usernameRequiredMsg"));
      return;
    }
    if (isUsernameSaveBlocked) {
      triggerUsernameShake();
      return;
    }

    const statusChanged = draftRelationshipStatus !== relationshipStatus;

    // Cooldown de 24h para qualquer mudança de status de relacionamento
    if (statusChanged && relationshipStatusChangedAt) {
      const changedDate = new Date(relationshipStatusChangedAt).getTime();
      const now = Date.now();
      const hoursSince = (now - changedDate) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        const minutesLeft = Math.ceil((24 - hoursSince) * 60);
        const timeLabel = hoursLeft >= 1 ? `${hoursLeft}h` : `${minutesLeft} minuto${minutesLeft !== 1 ? "s" : ""}`;
        Alert.alert(
          t("alert.waitMoment"),
          `Você alterou seu status de relacionamento recentemente. Aguarde mais ${timeLabel} para poder alterar novamente.`,
        );
        return;
      }
    }

    const changedAt = statusChanged ? new Date().toISOString() : relationshipStatusChangedAt;

    try {
      setSavingProfile(true);
      const usernameClean = draftUsername.trim().toLowerCase();
      const fullNameClean = draftFullName.trim();
      const bioClean = draftBio.trim();

      const updatePayload: any = {
        username: usernameClean,
        full_name: fullNameClean || null,
        bio: bioClean || null,
        avatar_url: avatarUrl,
        relationship_status: draftRelationshipStatus || null,
        gender: draftGender.trim() || null,
        partner_id: draftPartnerId || null,
      };

      if (statusChanged) {
        updatePayload.relationship_status_changed_at = changedAt;
      }

      const { data: updatedRow, error: updateError } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId)
        .select("*")
        .maybeSingle();

      let savedRow = updatedRow as ProfileRow | null;

      if (updateError) {
        throw updateError;
      }

      if (!savedRow) {
        const { data: insertedRow, error: insertError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: userId,
              ...updatePayload,
            },
            { onConflict: "id" },
          )
          .select("*")
          .single();

        if (insertError) throw insertError;
        savedRow = insertedRow as ProfileRow;
      }

      const nextStatus = savedRow.relationship_status ?? null;
      const nextGender = savedRow.gender ?? "";
      const nextChangedAt = savedRow.relationship_status_changed_at ?? changedAt ?? null;

      setProfileRow(savedRow);
      setUsername(savedRow.username || usernameClean);
      setFullName(savedRow.full_name || fullNameClean);
      setBio(savedRow.bio || bioClean);
      setRelationshipStatus(nextStatus);
      setMyRelationshipStatus(nextStatus);
      setRelationshipStatusChangedAt(nextChangedAt);
      setGender(nextGender);
      setDraftGender(nextGender);
      setDraftRelationshipStatus(nextStatus);
      setDraftPartnerId(savedRow.partner_id ?? null);
      setEditing(false);
      Alert.alert(t("alert.profileUpdated"), t("alert.profileUpdatedMsg"));
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.includes("profiles_username_lower_unique") || msg.includes("duplicate key") || msg.includes("unique")) {
        setUsernameStatus("taken");
        setUsernameMessage(t("profile.usernameTaken"));
        triggerUsernameShake();
        Alert.alert(t("alert.usernameUnavailable"), t("alert.usernameUnavailableMsg"));
      } else {
        Alert.alert(t("alert.errorUpdateProfile"), msg);
      }
    } finally {
      setSavingProfile(false);
    }
  }, [
    userId,
    isOwnProfile,
    draftUsername,
    draftFullName,
    draftBio,
    draftRelationshipStatus,
    draftGender,
    draftPartnerId,
    avatarUrl,
    relationshipStatus,
    relationshipStatusChangedAt,
    isUsernameSaveBlocked,
    triggerUsernameShake,
  ]);

  const signOut = useCallback(async () => {
    try {
      try {
        supabase.getChannels().forEach((ch: RealtimeChannel) => supabase.removeChannel(ch));
      } catch {}

      const { error } = await supabase.auth.signOut();
      if (error) {
        console.log("signOut error:", error);
      }

      router.replace("/");
    } catch (e) {
      console.log("signOut catch:", e);
      router.replace("/");
    }
  }, [router]);

  const toggleLike = useCallback(
    async (postId: number) => {
      const cur =
        counts[postId] ??
        ({
          likes: 0,
          comments: 0,
          reposts: 0,
          liked: false,
        } as Counter);

      const nextLiked = !cur.liked;
      const delta = nextLiked ? 1 : -1;

      setCounts((prev) => ({
        ...prev,
        [postId]: {
          ...cur,
          liked: nextLiked,
          likes: Math.max(0, cur.likes + delta),
        },
      }));

      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;

      try {
        if (nextLiked) {
          const { error: insErr } = await supabase.from("likes").insert({ post_id: postId, user_id: u.user.id });
          if (insErr) throw insErr;
        } else {
          const { error: delErr } = await supabase
            .from("likes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", u.user.id);
          if (delErr) throw delErr;
        }
      } catch {
        setCounts((prev) => ({ ...prev, [postId]: cur }));
      }
    },
    [counts],
  );

  const openComments = useCallback(
    (postId: number) => {
      // On web, React Native Modal layering can prevent opening a 2nd modal over the fullscreen viewer.
      // So we temporarily close the viewer, open comments, and then restore the viewer when comments close.
      if (IS_WEB && viewerOpen) {
        resumeViewerAfterCommentsRef.current = true;
        resumeViewerIndexRef.current = viewerIndex;
        setViewerOpen(false);
        setTimeout(() => {
          setCommentsPostId(postId);
          setCommentsOpen(true);
        }, 0);
        return;
      }

      setCommentsPostId(postId);
      setCommentsOpen(true);
    },
    [IS_WEB, viewerOpen, viewerIndex],
  );

  const closeComments = useCallback(() => {
    setCommentsOpen(false);

    if (IS_WEB && resumeViewerAfterCommentsRef.current) {
      resumeViewerAfterCommentsRef.current = false;
      const idx = resumeViewerIndexRef.current;
      setTimeout(() => {
        setViewerIndex(idx);
        setViewerOpen(true);
      }, 0);
    }
  }, [IS_WEB]);

  useEffect(() => {
    if (!IS_WEB) return;
    if (!commentsOpen || commentsPostId == null) return;

    let cancelled = false;

    (async () => {
      try {
        setWebCommentsLoading(true);
        const { data, error } = await supabase
          .from("comments")
          .select("id,user_id,content,created_at,profiles:profiles(username,full_name)")
          .eq("post_id", commentsPostId)
          .order("created_at", { ascending: true });

        if (!cancelled) {
          if (!error && data) setWebComments(data as any[]);
          else setWebComments([]);
        }
      } catch {
        if (!cancelled) setWebComments([]);
      } finally {
        if (!cancelled) setWebCommentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [IS_WEB, commentsOpen, commentsPostId]);
  const sharePost = useCallback(async (postId: number) => {
    try {
      await Share.share({
        message: `Veja meu post no Lupyy (id: ${postId})`,
      });
    } catch {}
  }, []);

  const deletePost = useCallback(
    async (postId: number, skipConfirm?: boolean) => {
      if (!authUserId) return;

      const target = posts.find((p) => p.id === postId);
      if (!target) return;

      let ok = true;
      if (!skipConfirm) {
        ok = await new Promise<boolean>((resolve) => {
          Alert.alert(t("alert.deletePost"), t("alert.deletePostMsg"), [
            { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: t("common.delete"), style: "destructive", onPress: () => resolve(true) },
          ]);
        });
      }

      if (!ok) return;

      try {
        await supabase.from("likes").delete().eq("post_id", postId);
      } catch {}
      try {
        await supabase.from("comments").delete().eq("post_id", postId);
      } catch {}
      try {
        await supabase.from("reposts").delete().eq("post_id", postId);
      } catch {}

      {
        const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", authUserId);

        if (error) {
          Alert.alert(t("common.error"), error.message || t("alert.errorDeletePost"));
          return;
        }
      }

      {
        const paths = [target.image_path, target.thumbnail_path].filter(Boolean) as string[];
        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage.from("posts").remove(paths);
          if (storageError) {
            // não bloqueia a exclusão do post no banco, mas avisa no console
            console.log("Storage remove error:", storageError);
          }
        }
      }

      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setCounts((prev) => {
        const next: any = { ...prev };
        delete next[postId];
        return next;
      });
      setViewerOpen(false);
    },
    [authUserId, posts],
  );

  const openPostFromGrid = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);

  const openStory = useCallback((index: number) => {
    setStoriesViewerIndex(index);
    setStoriesViewerOpen(true);
  }, []);

  const handleAddStory = useCallback(async () => {
    if (!authUserId) return;
    const uploaded = await uploadStory();
    if (!uploaded) return;

    try {
      const { data, error } = await supabase
        .from("stories")
        .insert({
          user_id: authUserId,
          media_url: uploaded.publicUrl,
          media_type: uploaded.type,
        })
        .select("*")
        .single();
      if (error) throw error;
      setStories((prev) => [data as StoryRow, ...prev]);
    } catch (e: any) {
      Alert.alert(t("alert.errorSendStory"), e?.message ?? String(e));
    }
  }, [authUserId]);

  const handleToggleFollowButton = useCallback(async () => {
    if (!authUserId || !userId || authUserId === userId) return;

    if (!currentInterestType) {
      setFollowModalVisible(true);
      return;
    }

    try {
      setLoadingFollow(true);

      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", authUserId)
        .eq("following_id", userId);

      if (error) throw error;

      setCurrentInterestType(null);

      try {
        const { data: stats, error: statsError } = await supabase
          .from("profile_social_stats")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (!statsError && stats) {
          const s = stats as SocialStatsRow;
          setFollowersCount(s.followers_count ?? 0);
          setFollowingCount(s.following_count ?? 0);
          setInterestedCount(s.crush_count ?? 0);
        }
      } catch {}
    } catch (e: any) {
      Alert.alert(t("alert.errorUnfollow"), e?.message ?? t("alert.errorUnfollowMsg"));
    } finally {
      setLoadingFollow(false);
    }
  }, [authUserId, userId, currentInterestType]);

  const handleSelectInterest = useCallback(
    async (interestType: InterestType) => {
      if (!authUserId || !userId || authUserId === userId) return;
      try {
        setLoadingFollow(true);

        const result = await setFollowInterestType(authUserId, userId, interestType);

        setCurrentInterestType(result.interestType);
        setFollowModalVisible(false);

        // Refresh social stats
        try {
          const { data: stats, error: statsError } = await supabase
            .from("profile_social_stats")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

          if (!statsError && stats) {
            const s = stats as SocialStatsRow;
            setFollowersCount(s.followers_count ?? 0);
            setFollowingCount(s.following_count ?? 0);
            setInterestedCount(s.crush_count ?? 0);
          }
        } catch {}

        // 🎉 Match detected — show premium celebration for ANY mutual crush
        if (result.isNewMatch) {
          setMatchedUserName(fullName || username || "");
          setMatchCelebrationVisible(true);
          return; // skip the simple modal
        }

        // Non-match silent crush — show subtle confirmation
        if (interestType === "silent_crush") {
          setSilentModalTitle(t("alert.silentCrushTitle"));
          setSilentModalMessage(t("alert.silentCrushMsg"));
          setSilentModalVisible(true);
        }

        // Non-match crush — show confirmation
        if (interestType === "crush") {
          setSilentModalTitle("💘 Crush enviado!");
          setSilentModalMessage(t("alert.silentCrushWaitMsg"));
          setSilentModalVisible(true);
        }
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg === "CRUSH_BLOCKED_SELF_COMMITTED") {
          Alert.alert(t("alert.crushBlockedSelf"), t("alert.crushBlockedSelfMsg"));
        } else if (msg === "CRUSH_BLOCKED_TARGET_COMMITTED") {
          Alert.alert(
            t("alert.crushBlockedTarget"),
            t("alert.crushBlockedTargetMsg"),
          );
        } else {
          Alert.alert(t("alert.errorFollow"), msg || t("alert.errorFollowMsg"));
        }
      } finally {
        setLoadingFollow(false);
      }
    },
    [authUserId, userId, fullName, username],
  );

  const openPeopleSheet = useCallback(
    (mode: "followers" | "following" | "interested") => {
      if (!userId) return;

      if (mode === "interested" && !isOwnProfile) {
        Alert.alert(t("alert.reservedArea"), t("alert.reservedAreaMsg"));
        return;
      }

      setPeopleSheetMode(mode);
      setPeopleSheetVisible(true);
    },
    [userId, isOwnProfile],
  );

  const handlePressUser = useCallback(
    (targetId: string) => {
      if (!targetId) return;
      if (targetId === authUserId) {
        router.replace("/profile");
      } else {
        setPosts([]);
        setCounts({});
        setHasMore(true);
        pageRef.current = 0;
        router.push(`/profile?userId=${targetId}`);
      }
    },
    [authUserId, router],
  );

  const isMutualFriend = currentInterestType === "friend" && theirInterestType === "friend";

  const isCrushMatch =
    (currentInterestType === "crush" || currentInterestType === "silent_crush") &&
    (theirInterestType === "crush" || theirInterestType === "silent_crush");

  const viewerIsCommitted = myRelationshipStatus === "committed" || myRelationshipStatus === "other";
  const targetIsCommitted = relationshipStatus === "committed" || relationshipStatus === "other";

  // Checar se são parceiros vinculados (usado pelo FollowModal)
  const areLinkedPartners = !!(
    profileRow?.partner_id &&
    profileRow.partner_id === authUserId &&
    draftPartnerId === userId
  );

  const canOpenCrushConversation = isCrushMatch && !viewerIsCommitted && !targetIsCommitted;
  const canOpenConversation = isMutualFriend || canOpenCrushConversation || (currentInterestType === "friend");

  const openConversation = useCallback(
    async (conversationType: ConversationType) => {
      if (!authUserId || !userId) return;
      if (conversationType === "crush" && (viewerIsCommitted || targetIsCommitted)) {
        Alert.alert(
          t("alert.conversationBlocked"),
          t("alert.conversationBlockedMsg"),
        );
        return;
      }

      try {
        const conversation = await getOrCreateConversation({
          currentUserId: authUserId,
          otherUserId: userId,
          conversationType,
        });

        // Reactivate exactly like the working version
        await supabase
          .from("conversation_deletions")
          .delete()
          .eq("conversation_id", conversation.id)
          .eq("user_id", authUserId);

        router.push({
          pathname: "/conversations/[id]",
          params: {
            id: conversation.id,
            type: conversation.conversation_type === "crush" ? "crush" : conversationType,
          },
        });
      } catch (e: any) {
        Alert.alert(t("alert.errorOpenConversation"), e?.message ?? t("alert.errorOpenConversationMsg"));
      }
    },
    [authUserId, userId, router, viewerIsCommitted, targetIsCommitted],
  );

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useFocusEffect(
    useCallback(() => {
      bootstrap();
    }, [bootstrap]),
  );

  useEffect(() => {
    if (userId) {
      setRefreshing(true);
      loadPage({ reset: true });
      loadStories(userId);
    }
  }, [userId, loadPage, loadStories]);

  // ── Load user settings when settings panel opens ──
  useEffect(() => {
    if (settingsVisible && !userSettings && !settingsLoading) {
      setSettingsLoading(true);
      getOrCreateUserSettings().then((s) => {
        if (s) setUserSettings(s);
        setSettingsLoading(false);
      });
    }
  }, [settingsVisible]);

  // ── Load blocked users when blocked sub-screen opens ──
  useEffect(() => {
    if (settingsSubScreen === "blocked") {
      setBlockedLoading(true);
      getBlockedUsers().then((users) => {
        setBlockedUsers(users);
        setBlockedLoading(false);
      });
    }
  }, [settingsSubScreen]);

  const handleToggleSetting = useCallback(async (key: SettingKey) => {
    if (!userSettings) return;
    const newVal = !(userSettings[key] as boolean);
    setUserSettings((prev) => prev ? { ...prev, [key]: newVal } : prev);
    const ok = await updateUserSetting(key, newVal);
    if (!ok) {
      setUserSettings((prev) => prev ? { ...prev, [key]: !newVal } : prev);
      Alert.alert("Erro", "Não foi possível salvar a configuração.");
    }
  }, [userSettings]);

  const handleUnblockFromSettings = useCallback(async (user: BlockedUser) => {
    Alert.alert(
      "Desbloquear",
      `Desbloquear @${user.username ?? "usuário"}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desbloquear",
          style: "destructive",
          onPress: async () => {
            setUnblockingId(user.blocked_id);
            const res = await unblockUserMod(user.blocked_id);
            setUnblockingId(null);
            if (res.ok) {
              setBlockedUsers((prev) => prev.filter((u) => u.blocked_id !== user.blocked_id));
            } else {
              Alert.alert("Erro", "Não foi possível desbloquear.");
            }
          },
        },
      ]
    );
  }, []);

  const handleTextSetting = useCallback(async (key: TextSettingKey, value: string) => {
    // Store previous value before optimistic update
    const previousValue = userSettings?.[key] ?? "everyone";
    setUserSettings((prev) => prev ? { ...prev, [key]: value } : prev);
    const ok = await updateUserSettingText(key, value);
    if (!ok) {
      // Revert using the captured previous value (not stale closure)
      setUserSettings((prev) => prev ? { ...prev, [key]: previousValue } : prev);
      Alert.alert("Erro", "Não foi possível salvar a configuração. Tente novamente.");
    }
  }, [userSettings]);

  const loadDeepScreenData = useCallback(async (screen: string) => {
    setDeepListLoading(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user?.id) return;
      if (screen === "close_friends_list") {
        const { data } = await supabase.from("close_friends").select("friend_id, created_at").eq("user_id", me.user.id);
        if (data && data.length > 0) {
          const ids = data.map((r: any) => r.friend_id);
          const { data: profiles } = await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", ids);
          setCloseFriendsList(profiles || []);
        } else { setCloseFriendsList([]); }
      } else if (screen === "restricted_list") {
        const { data } = await supabase.from("restricted_accounts").select("restricted_id, created_at").eq("user_id", me.user.id);
        if (data && data.length > 0) {
          const ids = data.map((r: any) => r.restricted_id);
          const { data: profiles } = await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", ids);
          setRestrictedList(profiles || []);
        } else { setRestrictedList([]); }
      } else if (screen === "hidden_stories") {
        const { data } = await supabase.from("hidden_story_users").select("hidden_user_id, created_at").eq("user_id", me.user.id);
        if (data && data.length > 0) {
          const ids = data.map((r: any) => r.hidden_user_id);
          const { data: profiles } = await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", ids);
          setHiddenStoryList(profiles || []);
        } else { setHiddenStoryList([]); }
      } else if (screen === "saved_all") {
        const { data } = await supabase.from("saved_posts").select("post_id, created_at").eq("user_id", me.user.id).order("created_at", { ascending: false }).limit(50);
        setSavedPosts(data || []);
      } else if (screen === "saved_collections") {
        const { data } = await supabase.from("saved_collections").select("*").eq("user_id", me.user.id).order("created_at", { ascending: false });
        setSavedCollections(data || []);
      }
    } catch { /* silent */ } finally { setDeepListLoading(false); }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: UiPost; index: number }) => {
      const isVideo = item.media_type === "video";
      const hasThumb = (item as any)._hasThumb !== false;
      const isBoosted = boostedPostIds.has(Number(item.id));

      return (
        <TouchableOpacity
          style={styles.cell}
          activeOpacity={0.8}
          onPress={() => openPostFromGrid(index)}
          onLongPress={isOwnProfile ? () => openPromoteModal(Number(item.id)) : undefined}
        >
          {isVideo && !hasThumb ? (
            <LinearGradient
              colors={[theme.colors.surface, theme.colors.backgroundAlt || theme.colors.background]}
              style={[styles.item, { alignItems: "center", justifyContent: "center" }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 18, marginLeft: 2 }}>▶</Text>
              </View>
            </LinearGradient>
          ) : (
            <ExpoImage source={{ uri: item.image_url }} style={styles.item} contentFit="cover" cachePolicy="disk" />
          )}
          {isVideo && (
            <View style={styles.playBadge}>
              <Text style={styles.playText}>▶︎</Text>
            </View>
          )}
          {isBoosted && (
            <View style={{
              position: "absolute", top: 4, right: 4,
              backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4,
              paddingHorizontal: 5, paddingVertical: 2,
            }}>
              <Text style={{ color: "#F59E0B", fontSize: 9, fontWeight: "700" }}>⚡</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [openPostFromGrid, theme, boostedPostIds, isOwnProfile, openPromoteModal],
  );

  // Render for videos/reels tab — with view count overlay
  const renderReelItem = useCallback(
    ({ item, index }: { item: UiPost; index: number }) => {
      const hasThumb = (item as any)._hasThumb !== false;
      const views = viewCounts[item.id] ?? 0;

      // Find the index in currentPosts for the viewer
      const realIndex = posts.filter((p) => p.media_type === "video").indexOf(item);

      return (
        <TouchableOpacity
          style={[styles.cell, { height: ITEM * 1.4 }]}
          activeOpacity={0.8}
          onPress={() => {
            const videoIndex = reelsPosts.indexOf(item);
            if (videoIndex >= 0) {
              setViewerIndex(videoIndex);
              setViewerOpen(true);
            }
          }}
        >
          {!hasThumb ? (
            <LinearGradient
              colors={[theme.colors.surface, theme.colors.backgroundAlt || theme.colors.background]}
              style={[styles.item, { alignItems: "center", justifyContent: "center" }]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 18, marginLeft: 2 }}>▶</Text>
              </View>
            </LinearGradient>
          ) : (
            <ExpoImage source={{ uri: item.image_url }} style={styles.item} contentFit="cover" cachePolicy="disk" />
          )}
          {/* Gradient overlay at bottom */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.6)"]}
            style={styles.reelOverlay}
          >
            <View style={styles.reelOverlayContent}>
              <Text style={styles.reelViewsText}>▶ {views > 0 ? views.toLocaleString("pt-BR") : "—"}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    },
    [viewCounts, posts, openPostFromGrid],
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPage({ reset: true });
    if (userId) loadStories(userId);
  }, [loadPage, userId, loadStories]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingRef.current) {
      loadPage();
    }
  }, [hasMore, loadPage]);

  const postsCount = posts.length;

  const gridPosts = posts;
  const reelsPosts = posts.filter((p) => {
    if (p.media_type === "video") return true;
    // Detect videos by URL pattern (some DB entries may not have media_type set correctly)
    const url = (p.media_url || p.image_url || "").toLowerCase();
    return url.includes(".mp4") || url.includes("video%2F") || url.includes("/video/");
  });
  const taggedPosts: UiPost[] = [];
  const currentPosts = activeTab === "grid" ? gridPosts : activeTab === "reels" ? reelsPosts : taggedPosts;

  const viewerItems: ViewerItem[] = currentPosts.map((p) => {
    const mediaUrlCandidate = p.media_url || p.image_url;
    const imageUrlCandidate = p.image_url || p.media_url;

    const urlToCheck = (mediaUrlCandidate || imageUrlCandidate || "").toLowerCase();
    const looksLikeVideo = p.media_type === "video" || urlToCheck.includes(".mp4") || urlToCheck.includes("video%2F");

    const mediaType: ViewerItem["media_type"] = looksLikeVideo ? "video" : "image";

    const mediaUrl = looksLikeVideo ? mediaUrlCandidate : imageUrlCandidate;
    const thumbUrl = looksLikeVideo ? imageUrlCandidate : undefined;

    return {
      id: p.id,
      media_type: mediaType,
      media_url: mediaUrl,
      thumb_url: thumbUrl,
      username: username,
      caption: p.caption ?? undefined,
      user_id: p.user_id,
    };
  });

  const storyViewerItems: StoryItem[] = stories.map((s) => ({
    id: s.id,
    media_type: s.media_type,
    media_url: s.media_url,
    duration: undefined,
    user_id: s.user_id,
    userName: username ?? "user",
    userAvatarUrl: avatarUrl ?? undefined,
    createdAt: s.created_at,
  }));

  // ── RELATIONSHIP STATUS OPTIONS ──
  const relationshipOptions: { value: RelationshipStatus; label: string; icon: string }[] = [
    { value: "single", label: t("profile.statusSingle"), icon: "💚" },
    { value: "committed", label: t("profile.statusCommitted"), icon: "💜" },
    { value: "other", label: t("profile.statusMarried"), icon: "💍" },
  ];

  const committedJokes = [
    "Essa pessoa já está enforcada 😅",
    "Tente novamente amanhã 😂",
    "Coração indisponível no momento 💍",
    "Esse crush tá com dono(a) 🔒",
    "Tá reservado(a)! Volta depois 😜",
  ];

  const isCommitted = relationshipStatus === "committed" || relationshipStatus === "other";

  // ── GENDER OPTIONS ──
  const genderOptions = [t("profile.genderMale"), t("profile.genderFemale"), t("profile.genderNonBinary"), t("profile.genderPreferNotSay")];

  // ── SETTINGS SCREEN ──
  if (settingsVisible) {
    // ── SETTINGS SUB-SCREEN (dedicated fullscreen) ──
    if (settingsSubScreen) {
      const subScreenInfo: Record<string, { emoji: string; title: string; desc: string }> = {
        privacy: {
          emoji: "🔒",
          title: t("settings.accountPrivacy"),
          desc: t("settings.privacyDesc"),
        },
        notifications: {
          emoji: "🔔",
          title: t("settings.notifications"),
          desc: t("settings.notificationsDesc"),
        },
        security: {
          emoji: "🛡️",
          title: t("settings.security"),
          desc: t("settings.securityDesc"),
        },
        messages_settings: {
          emoji: "💬",
          title: t("settings.messagesReplies"),
          desc: t("settings.messagesDesc"),
        },
        tags: {
          emoji: "🏷️",
          title: t("settings.tagsMentions"),
          desc: t("settings.tagsDesc"),
        },
        comments: {
          emoji: "💭",
          title: t("settings.comments"),
          desc: t("settings.commentsDesc"),
        },
        blocked: {
          emoji: "🚫",
          title: t("settings.blocked"),
          desc: t("settings.blockedDesc"),
        },
        restricted: {
          emoji: "⚠️",
          title: t("settings.restricted"),
          desc: t("settings.restrictedDesc"),
        },
        close_friends: {
          emoji: "⭐",
          title: t("settings.closeFriends"),
          desc: t("settings.closeFriendsDesc"),
        },
        tribes: {
          emoji: "👥",
          title: t("settings.tribes"),
          desc: t("settings.tribesDesc"),
        },
        discovery: {
          emoji: "🎯",
          title: t("settings.discoveryPrefs"),
          desc: t("settings.discoveryDesc"),
        },
        saved: {
          emoji: "🔖",
          title: t("settings.savedItems"),
          desc: t("settings.savedDesc"),
        },
        archived: {
          emoji: "📦",
          title: t("settings.archivedItems"),
          desc: t("settings.archivedDesc"),
        },
        activity: {
          emoji: "📊",
          title: t("settings.yourActivity"),
          desc: t("settings.activityDesc"),
        },
        appearance: {
          emoji: "🎨",
          title: t("settings.appearance"),
          desc: t("settings.appearanceDesc"),
        },
        time_mgmt: {
          emoji: "⏱️",
          title: t("settings.timeManagement"),
          desc: t("settings.timeDesc"),
        },
        help: {
          emoji: "❓",
          title: t("settings.helpSupport"),
          desc: t("settings.helpDesc"),
        },
        privacy_policy: {
          emoji: "📋",
          title: t("settings.privacyPolicy"),
          desc: t("settings.privacyPolicyDesc"),
        },
        terms: {
          emoji: "📜",
          title: t("settings.termsOfUse"),
          desc: t("settings.termsDesc"),
        },
      };

      const info = subScreenInfo[settingsSubScreen] || {
        emoji: "⚙️",
        title: t("settings.comingSoon"),
        desc: t("settings.comingSoonDesc"),
      };

      // Special sub-screens with real content
      if (settingsSubScreen === "blocked") {
        const resolveBlockedAvatar = (url: string | null) => {
          if (!url) return null;
          if (url.startsWith("http")) return url;
          return supabase.storage.from("avatars").getPublicUrl(url).data?.publicUrl || null;
        };

        return (
          <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
            <View style={styles.settingsHeader}>
              <TouchableOpacity
                onPress={() => setSettingsSubScreen(null)}
                activeOpacity={0.7}
                style={styles.settingsBackBtn}
              >
                <Text style={[styles.settingsBackIcon, { color: theme.colors.text }]}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.settingsTitle, { color: theme.colors.text }]}>{info.title}</Text>
              <View style={{ width: 40 }} />
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 16, lineHeight: 20 }}>
                Gerencie as contas que você bloqueou. Pessoas bloqueadas não podem ver seu perfil ou enviar mensagens.
              </Text>
              {blockedLoading ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <ActivityIndicator color={theme.colors.primary || Colors.brandStart} />
                </View>
              ) : blockedUsers.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>🛡️</Text>
                  <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: "700", marginBottom: 6 }}>Nenhuma conta bloqueada</Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
                    Quando você bloquear alguém, a pessoa aparecerá aqui.
                  </Text>
                </View>
              ) : (
                blockedUsers.map((user) => {
                  const avatarUri = resolveBlockedAvatar(user.avatar_url);
                  const isUnblocking = unblockingId === user.blocked_id;
                  return (
                    <View key={user.block_id} style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.colors.border,
                    }}>
                      {avatarUri ? (
                        <ExpoImage source={{ uri: avatarUri }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
                      ) : (
                        <LinearGradient
                          colors={[Colors.brandStart, Colors.brandEnd]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" }}
                        >
                          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
                            {(user.username || "?")?.[0]?.toUpperCase()}
                          </Text>
                        </LinearGradient>
                      )}
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>
                          @{user.username ?? "usuário"}
                        </Text>
                        {user.full_name && (
                          <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                            {user.full_name}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleUnblockFromSettings(user)}
                        disabled={isUnblocking}
                        style={{
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: 10,
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                        }}
                      >
                        {isUnblocking ? (
                          <ActivityIndicator size="small" color={theme.colors.text} />
                        ) : (
                          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "600" }}>Desbloquear</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        );
      }

      if (settingsSubScreen === "appearance") {
        return (
          <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
            <View style={styles.settingsHeader}>
              <TouchableOpacity
                onPress={() => setSettingsSubScreen(null)}
                activeOpacity={0.7}
                style={styles.settingsBackBtn}
              >
                <Text style={[styles.settingsBackIcon, { color: theme.colors.text }]}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.settingsTitle, { color: theme.colors.text }]}>{info.title}</Text>
              <View style={{ width: 40 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 14, marginBottom: 16, lineHeight: 20 }}>
                {t("settings.appearanceDesc")}
              </Text>
              <ThemeSelector />
            </ScrollView>
          </SafeAreaView>
        );
      }

      // ── PREMIUM SUB-SCREENS WITH TOGGLE ITEMS ──
      type SettingsItem = {
        icon: string; label: string; desc: string;
        type: "toggle" | "nav" | "info" | "radio";
        settingKey?: SettingKey;
        value?: boolean;
        deepScreen?: string;
        radioKey?: TextSettingKey;
        radioValue?: string;
        radioOptions?: { label: string; value: string }[];
      };

      // ── Deep screen header helper ──
      const renderDeepHeader = (title: string, onBack: () => void) => (
        <View style={styles.settingsHeader}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.settingsBackBtn}>
            <Text style={[styles.settingsBackIcon, { color: theme.colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.settingsTitle, { color: theme.colors.text }]}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>
      );

      // ── Radio selector deep screen ──
      const renderRadioDeepScreen = (title: string, desc: string, radioKey: TextSettingKey, options: { label: string; value: string; desc?: string }[]) => {
        const currentVal = userSettings?.[radioKey] || "everyone";
        return (
          <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
            {renderDeepHeader(title, () => setSettingsDeepScreen(null))}
            <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 16, lineHeight: 20 }}>{desc}</Text>
              {options.map((opt) => {
                const selected = currentVal === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleTextSetting(radioKey, opt.value)}
                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "600" }}>{opt.label}</Text>
                      {opt.desc && <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>{opt.desc}</Text>}
                    </View>
                    <View style={{
                      width: 22, height: 22, borderRadius: 11,
                      borderWidth: 2, borderColor: selected ? "#4CD964" : theme.colors.border,
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#4CD964" }} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        );
      };

      // ── People list deep screen with search+add (close friends, restricted, hidden stories) ──
      const handleDeepSearch = (text: string) => {
        setDeepSearchQuery(text);
        if (text.trim().length < 2) { setDeepSearchResults([]); return; }
        if (deepSearchTimer.current) clearTimeout(deepSearchTimer.current);
        deepSearchTimer.current = setTimeout(async () => {
          setDeepSearchLoading(true);
          try {
            const { data } = await supabase
              .from("profiles")
              .select("id, username, full_name, avatar_url")
              .or(`username.ilike.%${text.trim()}%,full_name.ilike.%${text.trim()}%`)
              .limit(15);
            setDeepSearchResults(data || []);
          } catch { setDeepSearchResults([]); }
          finally { setDeepSearchLoading(false); }
        }, 300);
      };

      const renderPeopleListDeepScreen = (
        title: string, desc: string, list: any[], emptyText: string,
        onRemove?: (id: string) => void,
        onAdd?: (person: any) => Promise<void>,
        addLabel?: string,
      ) => {
        const resolveAvatar = (url: string | null) => {
          if (!url) return null;
          if (url.startsWith("http")) return url;
          return supabase.storage.from("avatars").getPublicUrl(url).data?.publicUrl || null;
        };
        const listIds = new Set(list.map((p: any) => p.id));

        return (
          <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
            {renderDeepHeader(title, () => { setSettingsDeepScreen(null); setDeepSearchQuery(""); setDeepSearchResults([]); })}
            <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={{ color: theme.colors.textMuted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 12, lineHeight: 20 }}>{desc}</Text>

              {/* Search bar to add people */}
              {onAdd && (
                <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 10 : 8 }}>
                    <Text style={{ fontSize: 14, marginRight: 8, color: theme.colors.textMuted }}>🔍</Text>
                    <TextInput
                      value={deepSearchQuery}
                      onChangeText={handleDeepSearch}
                      placeholder="Buscar pessoa para adicionar..."
                      placeholderTextColor={theme.colors.textMuted}
                      style={{ flex: 1, fontSize: 14, color: theme.colors.text }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {deepSearchQuery.length > 0 && (
                      <Pressable onPress={() => { setDeepSearchQuery(""); setDeepSearchResults([]); }} hitSlop={10}>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>✕</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Search results */}
                  {deepSearchLoading && <ActivityIndicator size="small" color={theme.colors.primary || "#4CD964"} style={{ marginTop: 12 }} />}
                  {deepSearchResults.length > 0 && (
                    <View style={{ marginTop: 8, backgroundColor: theme.colors.surface, borderRadius: 12, overflow: "hidden" }}>
                      {deepSearchResults.filter((p: any) => p.id !== authUserId && !listIds.has(p.id)).map((person: any) => {
                        const av = resolveAvatar(person.avatar_url);
                        return (
                          <View key={person.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
                            {av ? (
                              <ExpoImage source={{ uri: av }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} />
                            ) : (
                              <View style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ color: theme.colors.textMuted, fontSize: 15 }}>{(person.username || "?")[0]?.toUpperCase()}</Text>
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "700" }}>@{person.username || "user"}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={async () => {
                                await onAdd(person);
                                setDeepSearchQuery("");
                                setDeepSearchResults([]);
                              }}
                              style={{ backgroundColor: "#4CD964", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                            >
                              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{addLabel || "Adicionar"}</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {deepListLoading ? (
                <ActivityIndicator size="large" color={theme.colors.primary || "#4CD964"} style={{ marginTop: 40 }} />
              ) : list.length === 0 && deepSearchQuery.length === 0 ? (
                <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 40 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>✨</Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 22 }}>{emptyText}</Text>
                </View>
              ) : (
                list.map((person: any) => {
                  const av = resolveAvatar(person.avatar_url);
                  return (
                    <View key={person.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
                      {av ? (
                        <ExpoImage source={{ uri: av }} style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }} />
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: theme.colors.textMuted, fontSize: 18 }}>{(person.username || person.full_name || "?")[0]?.toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>@{person.username || "user"}</Text>
                        {person.full_name && <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{person.full_name}</Text>}
                      </View>
                      {onRemove && (
                        <TouchableOpacity
                          onPress={() => onRemove(person.id)}
                          style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 }}
                        >
                          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "600" }}>Remover</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        );
      };

      // ── Info page deep screen ──
      const renderInfoDeepScreen = (title: string, sections: { icon: string; label: string; value?: string; desc?: string }[]) => (
        <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
          {renderDeepHeader(title, () => setSettingsDeepScreen(null))}
          <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {sections.map((s, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
                <Text style={{ fontSize: 22, marginRight: 14, width: 30, textAlign: "center" }}>{s.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "600" }}>{s.label}</Text>
                  {s.desc && <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{s.desc}</Text>}
                </View>
                {s.value && <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{s.value}</Text>}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      );

      // ── DEEP SCREEN ROUTING ──
      if (settingsDeepScreen) {
        // Radio selectors
        if (settingsDeepScreen === "allow_messages_from") {
          return renderRadioDeepScreen("Permitir mensagens de", "Escolha quem pode enviar mensagens diretas para você.", "allow_messages_from", [
            { label: "Todos", value: "everyone", desc: "Qualquer pessoa pode enviar mensagens." },
            { label: "Seguidores", value: "followers", desc: "Apenas seus seguidores podem enviar mensagens." },
            { label: "Ninguém", value: "nobody", desc: "Ninguém pode enviar novas mensagens." },
          ]);
        }
        if (settingsDeepScreen === "allow_tags_from") {
          return renderRadioDeepScreen("Permitir marcações de", "Escolha quem pode marcar você em publicações.", "allow_tags_from", [
            { label: "Todos", value: "everyone", desc: "Qualquer pessoa pode marcar você." },
            { label: "Pessoas que sigo", value: "following", desc: "Apenas contas que você segue." },
            { label: "Ninguém", value: "nobody", desc: "Ninguém pode marcar você." },
          ]);
        }
        if (settingsDeepScreen === "allow_mentions_from") {
          return renderRadioDeepScreen("Permitir menções de", "Escolha quem pode mencionar você com @.", "allow_mentions_from", [
            { label: "Todos", value: "everyone", desc: "Qualquer pessoa pode mencionar você." },
            { label: "Pessoas que sigo", value: "following", desc: "Apenas contas que você segue." },
            { label: "Ninguém", value: "nobody", desc: "Ninguém pode mencionar você." },
          ]);
        }
        if (settingsDeepScreen === "allow_comments_from") {
          return renderRadioDeepScreen("Permitir comentários de", "Controle quem pode comentar nas suas publicações.", "allow_comments_from", [
            { label: "Todos", value: "everyone", desc: "Qualquer pessoa pode comentar." },
            { label: "Seguidores", value: "followers", desc: "Apenas seus seguidores." },
            { label: "Pessoas que sigo", value: "following", desc: "Apenas contas que você segue." },
            { label: "Desativado", value: "disabled", desc: "Ninguém pode comentar." },
          ]);
        }

        // Hidden stories
        if (settingsDeepScreen === "hidden_stories") {
          return renderPeopleListDeepScreen(
            "Ocultar stories de", "Escolha pessoas cujos stories não aparecerão para você. Elas não serão notificadas.", hiddenStoryList,
            "Você não ocultou stories de ninguém. Use a busca acima para encontrar pessoas.",
            async (id) => {
              const { data: me } = await supabase.auth.getUser();
              if (!me?.user?.id) return;
              await supabase.from("hidden_story_users").delete().eq("user_id", me.user.id).eq("hidden_user_id", id);
              setHiddenStoryList((prev) => prev.filter((p: any) => p.id !== id));
            },
            async (person) => {
              const { data: me } = await supabase.auth.getUser();
              if (!me?.user?.id) return;
              await supabase.from("hidden_story_users").insert({ user_id: me.user.id, hidden_user_id: person.id });
              setHiddenStoryList((prev) => [...prev, person]);
            },
            "Ocultar",
          );
        }

        // Close friends
        if (settingsDeepScreen === "close_friends_list") {
          return renderPeopleListDeepScreen(
            "Amigos próximos", "Compartilhe stories exclusivos apenas com estas pessoas. Use a busca para adicionar.", closeFriendsList,
            "Sua lista de amigos próximos está vazia. Use a busca acima para adicionar pessoas.",
            async (id) => {
              const { data: me } = await supabase.auth.getUser();
              if (!me?.user?.id) return;
              await supabase.from("close_friends").delete().eq("user_id", me.user.id).eq("friend_id", id);
              setCloseFriendsList((prev) => prev.filter((p: any) => p.id !== id));
            },
            async (person) => {
              const { data: me } = await supabase.auth.getUser();
              if (!me?.user?.id) return;
              await supabase.from("close_friends").insert({ user_id: me.user.id, friend_id: person.id });
              setCloseFriendsList((prev) => [...prev, person]);
            },
            "Adicionar",
          );
        }

        // Restricted accounts
        if (settingsDeepScreen === "restricted_list") {
          return renderPeopleListDeepScreen(
            "Contas restritas", "Contas restritas não sabem que foram limitadas. Comentários delas só ficam visíveis para elas. Use a busca para adicionar.", restrictedList,
            "Nenhuma conta restrita. Use a busca acima para restringir alguém.",
            async (id) => {
              const { data: me } = await supabase.auth.getUser();
              if (!me?.user?.id) return;
              await supabase.from("restricted_accounts").delete().eq("user_id", me.user.id).eq("restricted_id", id);
              setRestrictedList((prev) => prev.filter((p: any) => p.id !== id));
            },
            async (person) => {
              const { data: me } = await supabase.auth.getUser();
              if (!me?.user?.id) return;
              await supabase.from("restricted_accounts").insert({ user_id: me.user.id, restricted_id: person.id });
              setRestrictedList((prev) => [...prev, person]);
            },
            "Restringir",
          );
        }

        // Filtered words
        if (settingsDeepScreen === "filtered_words") {
          const words = userSettings?.filtered_words || [];
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Filtro de palavras", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, paddingVertical: 16, lineHeight: 20 }}>
                  Comentários contendo essas palavras serão ocultados automaticamente.
                </Text>
                <View style={{ flexDirection: "row", marginBottom: 16 }}>
                  <TextInput
                    value={filteredWordsInput}
                    onChangeText={setFilteredWordsInput}
                    placeholder="Adicionar palavra..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: theme.colors.text, fontSize: 14, marginRight: 8 }}
                  />
                  <TouchableOpacity
                    onPress={async () => {
                      const word = filteredWordsInput.trim();
                      if (!word) return;
                      const updated = [...words, word];
                      setUserSettings((prev) => prev ? { ...prev, filtered_words: updated } : prev);
                      setFilteredWordsInput("");
                      await updateFilteredWords(updated);
                    }}
                    style={{ backgroundColor: "#4CD964", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>+</Text>
                  </TouchableOpacity>
                </View>
                {words.length === 0 ? (
                  <View style={{ alignItems: "center", paddingTop: 40 }}>
                    <Text style={{ fontSize: 36, marginBottom: 8 }}>🔇</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Nenhuma palavra filtrada ainda.</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {words.map((w, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={async () => {
                          const updated = words.filter((_, i) => i !== idx);
                          setUserSettings((prev) => prev ? { ...prev, filtered_words: updated } : prev);
                          await updateFilteredWords(updated);
                        }}
                        style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }}
                      >
                        <Text style={{ color: theme.colors.text, fontSize: 13, marginRight: 6 }}>{w}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Change password
        if (settingsDeepScreen === "change_password") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Alterar senha", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 20 }}>
                  Sua senha deve ter pelo menos 8 caracteres, incluindo letras e números.
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    if (!authEmail) { Alert.alert("Erro", "E-mail não encontrado."); return; }
                    const { error } = await supabase.auth.resetPasswordForEmail(authEmail);
                    if (error) { Alert.alert("Erro", error.message); } else { Alert.alert("Enviado", "Um link para redefinir sua senha foi enviado para " + authEmail); }
                  }}
                  style={{ backgroundColor: "#4CD964", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Enviar link de redefinição</Text>
                </TouchableOpacity>
                <Text style={{ color: theme.colors.textMuted, fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 18 }}>
                  Enviaremos um e-mail para {authEmail || "seu endereço"} com um link seguro.
                </Text>
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Connected devices
        if (settingsDeepScreen === "devices") {
          return renderInfoDeepScreen("Dispositivos conectados", [
            { icon: "📱", label: "Este dispositivo", value: Platform.OS === "web" ? "Web" : Platform.OS === "ios" ? "iOS" : "Android", desc: "Ativo agora" },
            { icon: "ℹ️", label: "Segurança", desc: "Se você notar algum dispositivo desconhecido, altere sua senha imediatamente." },
          ]);
        }

        // Lupyy emails
        if (settingsDeepScreen === "lupyy_emails") {
          return renderInfoDeepScreen("E-mails do Lupyy", [
            { icon: "✅", label: "E-mails de segurança", desc: "Alertas sobre login em novos dispositivos e alterações de senha." },
            { icon: "📧", label: "E-mails do Lupyy", desc: "Atualizações e novidades da plataforma." },
            { icon: "ℹ️", label: "Dica", desc: "Nunca compartilhe links de e-mails de segurança com outras pessoas." },
          ]);
        }

        // Download data
        if (settingsDeepScreen === "download_data") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Baixar seus dados", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 20 }}>
                  Solicite uma cópia de todas as suas informações, incluindo fotos, vídeos, comentários e dados do perfil.
                </Text>
                <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20 }}>
                  <Text style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>📦</Text>
                  <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>Seus dados</Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
                    Quando a cópia estiver pronta, enviaremos uma notificação. O processo pode levar até 48 horas.
                  </Text>
                  <TouchableOpacity
                    onPress={() => Alert.alert("Solicitado", "Sua solicitação foi registrada. Você receberá uma notificação quando estiver pronta.")}
                    style={{ backgroundColor: "#4CD964", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                  >
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Solicitar download</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Delete account
        if (settingsDeepScreen === "delete_account") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Excluir conta", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 }}>
                <View style={{ backgroundColor: "rgba(255,59,48,0.1)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
                  <Text style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</Text>
                  <Text style={{ color: "#FF3B30", fontSize: 16, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>Ação irreversível</Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 }}>
                    Ao excluir sua conta, todos os seus dados serão permanentemente removidos, incluindo perfil, fotos, vídeos, comentários, curtidas e seguidores.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert("Excluir conta", "Tem certeza? Esta ação não pode ser desfeita.", [
                      { text: "Cancelar", style: "cancel" },
                      { text: "Excluir permanentemente", style: "destructive", onPress: async () => {
                        try {
                          // Mark account for deletion via RPC (admin.deleteUser não funciona no client)
                          const { error } = await supabase.rpc("request_account_deletion");
                          if (error) {
                            console.log("RPC deletion error:", error);
                          }
                          await supabase.auth.signOut();
                          Alert.alert("Conta excluída", "Sua conta será removida em até 30 dias.");
                          router.replace("/login" as any);
                        } catch (err) {
                          console.log("Delete account error:", err);
                          // Even if RPC doesn't exist, sign out
                          await supabase.auth.signOut();
                          Alert.alert("Conta marcada para exclusão", "Sua conta será processada em até 30 dias.");
                          router.replace("/login" as any);
                        }
                      }},
                    ]);
                  }}
                  style={{ backgroundColor: "#FF3B30", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Excluir minha conta</Text>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Interests
        if (settingsDeepScreen === "interests") {
          const interestOptions = [
            { emoji: "🎵", label: "Música" }, { emoji: "🎮", label: "Games" },
            { emoji: "📸", label: "Fotografia" }, { emoji: "💪", label: "Fitness" },
            { emoji: "🎨", label: "Arte" }, { emoji: "✈️", label: "Viagem" },
            { emoji: "🍕", label: "Gastronomia" }, { emoji: "📚", label: "Leitura" },
            { emoji: "🎬", label: "Cinema" }, { emoji: "⚽", label: "Esportes" },
            { emoji: "🐾", label: "Pets" }, { emoji: "💻", label: "Tecnologia" },
          ];
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Interesses", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
                  Selecione tópicos de interesse para personalizar seu feed e recomendações.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {interestOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      onPress={() => {}}
                      style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border }}
                    >
                      <Text style={{ fontSize: 18, marginRight: 6 }}>{opt.emoji}</Text>
                      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "600" }}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Location
        if (settingsDeepScreen === "location") {
          return renderInfoDeepScreen("Localização", [
            { icon: "📍", label: "Serviços de localização", desc: "O Lupyy pode usar sua localização para o recurso 'Pessoas próximas' e tags de local em publicações." },
            { icon: "🔒", label: "Privacidade", desc: "Sua localização exata nunca é compartilhada com outros usuários." },
            { icon: "⚙️", label: "Gerenciar permissões", desc: "Para alterar as permissões de localização, acesse as configurações do seu dispositivo." },
          ]);
        }

        // Daily reminder
        if (settingsDeepScreen === "daily_reminder") {
          const reminderOptions = [
            { label: "15 minutos", value: 15 }, { label: "30 minutos", value: 30 },
            { label: "45 minutos", value: 45 }, { label: "1 hora", value: 60 },
            { label: "2 horas", value: 120 }, { label: "Desativado", value: 0 },
          ];
          const current = userSettings?.daily_reminder_minutes;
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Lembrete diário", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 16, lineHeight: 20 }}>
                  Defina um limite de tempo diário. Você receberá um aviso quando atingir o limite.
                </Text>
                {reminderOptions.map((opt) => {
                  const selected = (opt.value === 0 && !current) || current === opt.value;
                  return (
                    <Pressable key={opt.value} onPress={async () => {
                      const val = opt.value === 0 ? null : opt.value;
                      setUserSettings((prev) => prev ? { ...prev, daily_reminder_minutes: val } : prev);
                      try {
                        const { data: me } = await supabase.auth.getUser();
                        if (me?.user?.id) await supabase.from("user_settings").update({ daily_reminder_minutes: val }).eq("user_id", me.user.id);
                      } catch {}
                    }} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
                      <Text style={{ flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: "600" }}>{opt.label}</Text>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? "#4CD964" : theme.colors.border, alignItems: "center", justifyContent: "center" }}>
                        {selected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#4CD964" }} />}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Quiet mode
        if (settingsDeepScreen === "quiet_mode") {
          return renderInfoDeepScreen("Modo silencioso", [
            { icon: "🌙", label: "Horário silencioso", desc: "Durante o modo silencioso, você não receberá notificações push. As notificações ficam salvas para quando você voltar." },
            { icon: "⏰", label: "Horário padrão", desc: "22:00 às 07:00 (pode ser personalizado nas configurações do dispositivo)." },
            { icon: "💤", label: "Status", desc: "Seus contatos verão que você está no modo silencioso." },
          ]);
        }

        // Saved posts
        if (settingsDeepScreen === "saved_all") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Publicações salvas", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
                {deepListLoading ? (
                  <ActivityIndicator size="large" color={theme.colors.primary || "#4CD964"} style={{ marginTop: 40 }} />
                ) : savedPosts.length === 0 ? (
                  <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 40 }}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>🔖</Text>
                    <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Nada salvo ainda</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
                      Salve publicações tocando no ícone de marcador para encontrá-las aqui.
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: theme.colors.textMuted, textAlign: "center", paddingTop: 20 }}>{savedPosts.length} publicações salvas</Text>
                )}
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Saved collections
        if (settingsDeepScreen === "saved_collections") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Coleções", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 20, paddingTop: 16 }}>
                {deepListLoading ? (
                  <ActivityIndicator size="large" color={theme.colors.primary || "#4CD964"} style={{ marginTop: 40 }} />
                ) : savedCollections.length === 0 ? (
                  <View style={{ alignItems: "center", paddingTop: 60 }}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>📂</Text>
                    <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Nenhuma coleção</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
                      Crie coleções para organizar suas publicações salvas.
                    </Text>
                  </View>
                ) : (
                  savedCollections.map((col: any) => (
                    <View key={col.id} style={{ backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "700" }}>{col.name}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </SafeAreaView>
          );
        }

        // Archived posts
        if (settingsDeepScreen === "archived_posts") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Publicações arquivadas", () => setSettingsDeepScreen(null))}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📷</Text>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Nenhuma publicação arquivada</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
                  Publicações arquivadas ficam ocultas do seu perfil mas podem ser restauradas a qualquer momento.
                </Text>
              </View>
            </SafeAreaView>
          );
        }

        // Archived stories
        if (settingsDeepScreen === "archived_stories") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Stories arquivados", () => setSettingsDeepScreen(null))}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>⏰</Text>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Stories arquivados</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
                  Seus stories expirados são salvos automaticamente aqui.
                </Text>
              </View>
            </SafeAreaView>
          );
        }

        // Activity screens
        if (settingsDeepScreen === "time_usage") {
          return renderInfoDeepScreen("Tempo no Lupyy", [
            { icon: "📊", label: "Hoje", value: "—", desc: "Tempo total de uso hoje." },
            { icon: "📈", label: "Esta semana", value: "—", desc: "Média diária de uso." },
            { icon: "📉", label: "Semana passada", value: "—", desc: "Comparativo com a semana anterior." },
          ]);
        }
        if (settingsDeepScreen === "recent_likes") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Curtidas recentes", () => setSettingsDeepScreen(null))}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>❤️</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center" }}>Suas curtidas recentes aparecerão aqui.</Text>
              </View>
            </SafeAreaView>
          );
        }
        if (settingsDeepScreen === "recent_comments") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Comentários recentes", () => setSettingsDeepScreen(null))}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center" }}>Seus comentários recentes aparecerão aqui.</Text>
              </View>
            </SafeAreaView>
          );
        }
        if (settingsDeepScreen === "recent_searches") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Pesquisas recentes", () => setSettingsDeepScreen(null))}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center" }}>Seu histórico de pesquisa aparecerá aqui.</Text>
              </View>
            </SafeAreaView>
          );
        }
        if (settingsDeepScreen === "visited_links") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Links visitados", () => setSettingsDeepScreen(null))}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🔗</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center" }}>Links abertos recentemente aparecerão aqui.</Text>
              </View>
            </SafeAreaView>
          );
        }

        // Help screens
        if (settingsDeepScreen === "help_center") {
          return renderInfoDeepScreen("Central de ajuda", [
            { icon: "❓", label: "Perguntas frequentes", desc: "Respostas para as dúvidas mais comuns sobre o Lupyy." },
            { icon: "🔐", label: "Segurança da conta", desc: "Como proteger sua conta e recuperar acesso." },
            { icon: "📸", label: "Publicações e stories", desc: "Como criar, editar e compartilhar conteúdo." },
            { icon: "💬", label: "Mensagens e chat", desc: "Problemas com mensagens e conversas." },
            { icon: "👥", label: "Tribos", desc: "Como participar e gerenciar comunidades." },
          ]);
        }
        if (settingsDeepScreen === "report_bug") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Reportar problema", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
                  Descreva o problema que você encontrou. Nossa equipe analisará o mais rápido possível.
                </Text>
                <TextInput
                  placeholder="Descreva o problema..."
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  numberOfLines={6}
                  style={{ backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, color: theme.colors.text, fontSize: 14, textAlignVertical: "top", minHeight: 120, marginBottom: 16 }}
                />
                <TouchableOpacity
                  onPress={() => { Alert.alert("Enviado", "Obrigado pelo relatório! Nossa equipe analisará em breve."); setSettingsDeepScreen(null); }}
                  style={{ backgroundColor: "#4CD964", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Enviar relatório</Text>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          );
        }
        if (settingsDeepScreen === "suggest_feature") {
          return (
            <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
              {renderDeepHeader("Sugestão de recurso", () => setSettingsDeepScreen(null))}
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
                  Tem uma ideia para melhorar o Lupyy? Adoramos ouvir nossos usuários!
                </Text>
                <TextInput
                  placeholder="Sua sugestão..."
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  numberOfLines={6}
                  style={{ backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, color: theme.colors.text, fontSize: 14, textAlignVertical: "top", minHeight: 120, marginBottom: 16 }}
                />
                <TouchableOpacity
                  onPress={() => { Alert.alert("Obrigado!", "Sua sugestão foi registrada."); setSettingsDeepScreen(null); }}
                  style={{ backgroundColor: "#4CD964", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Enviar sugestão</Text>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          );
        }
        if (settingsDeepScreen === "app_info") {
          return renderInfoDeepScreen("Informações do app", [
            { icon: "📱", label: "Versão", value: "1.0.0" },
            { icon: "🖥️", label: "Plataforma", value: Platform.OS === "web" ? "Web" : Platform.OS },
            { icon: "🔗", label: "Build", value: "2024.03.31" },
            { icon: "🌐", label: "Servidor", value: "Online", desc: "Todos os serviços estão operando normalmente." },
          ]);
        }
        if (settingsDeepScreen === "contact") {
          return renderInfoDeepScreen("Contato", [
            { icon: "📧", label: "E-mail", value: "suporte@lupyy.app", desc: "Para dúvidas e suporte técnico." },
            { icon: "🐦", label: "Redes sociais", desc: "Siga-nos para novidades e atualizações." },
            { icon: "📋", label: "Termos de uso", desc: "Leia nossos termos e políticas." },
            { icon: "🔒", label: "Política de privacidade", desc: "Saiba como protegemos seus dados." },
          ]);
        }

        // Fallback deep screen
        return (
          <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
            {renderDeepHeader("Configuração", () => setSettingsDeepScreen(null))}
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔧</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Em breve.</Text>
            </View>
          </SafeAreaView>
        );
      }

      // ── RENDER SETTINGS SUB PAGE (with nav → deep screen support) ──
      const renderSettingsSubPage = (title: string, description: string, items: SettingsItem[]) => (
        <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
          {renderDeepHeader(title, () => setSettingsSubScreen(null))}
          <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: theme.colors.textMuted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 16, lineHeight: 20 }}>
              {description}
            </Text>
            {items.map((item, idx) => {
              const isToggle = item.type === "toggle";
              const toggleValue = isToggle && item.settingKey && userSettings
                ? !!(userSettings[item.settingKey] as boolean)
                : !!item.value;

              return (
                <Pressable
                  key={idx}
                  onPress={
                    isToggle && item.settingKey
                      ? () => handleToggleSetting(item.settingKey!)
                      : item.type === "nav" && item.deepScreen
                        ? () => {
                            setSettingsDeepScreen(item.deepScreen!);
                            if (["close_friends_list", "restricted_list", "hidden_stories", "saved_all", "saved_collections"].includes(item.deepScreen!)) {
                              loadDeepScreenData(item.deepScreen!);
                            }
                          }
                        : undefined
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    borderBottomWidth: 0.5,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: 22, marginRight: 14, width: 30, textAlign: "center" }}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "600" }}>{item.label}</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{item.desc}</Text>
                  </View>
                  {isToggle && (
                    <View style={{
                      width: 48, height: 28, borderRadius: 14,
                      backgroundColor: toggleValue ? "#4CD964" : theme.colors.border,
                      justifyContent: "center",
                      paddingHorizontal: 2,
                    }}>
                      <Animated.View style={{
                        width: 24, height: 24, borderRadius: 12,
                        backgroundColor: "#fff",
                        alignSelf: toggleValue ? "flex-end" : "flex-start",
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.2,
                        shadowRadius: 2,
                        elevation: 3,
                      }} />
                    </View>
                  )}
                  {item.type === "nav" && (
                    <Text style={{ color: theme.colors.textMuted, fontSize: 18 }}>›</Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      );

      // Privacy sub-screen
      if (settingsSubScreen === "privacy") {
        return renderSettingsSubPage(
          info.title,
          "Controle quem pode ver seu perfil, stories e atividades.",
          [
            { icon: "🔒", label: "Conta privada", desc: "Somente seguidores aprovados podem ver suas fotos e vídeos.", type: "toggle", settingKey: "is_private_account" },
            { icon: "📊", label: "Status de atividade", desc: "Permitir que as contas que você segue vejam quando esteve ativo pela última vez.", type: "toggle", settingKey: "show_activity_status" },
            { icon: "👁️", label: "Visualização de Stories", desc: "Ocultar seu story de pessoas específicas.", type: "nav", deepScreen: "hidden_stories" },
            { icon: "💬", label: "Permitir mensagens de", desc: "Todos · Seguidores · Ninguém", type: "nav", deepScreen: "allow_messages_from" },
            { icon: "🔗", label: "Compartilhamento de stories", desc: "Permitir que pessoas compartilhem seus stories como mensagens.", type: "toggle", settingKey: "allow_story_sharing" },
            { icon: "📍", label: "Localização", desc: "Gerenciar permissões de localização no app.", type: "nav", deepScreen: "location" },
          ]
        );
      }

      // Security sub-screen
      if (settingsSubScreen === "security") {
        return renderSettingsSubPage(
          info.title,
          "Proteja sua conta com verificação em duas etapas e gerencie dispositivos conectados.",
          [
            { icon: "🔐", label: "Autenticação em duas etapas", desc: "Adicione uma camada extra de segurança à sua conta.", type: "toggle", settingKey: "two_factor_enabled" },
            { icon: "🔑", label: "Alterar senha", desc: "Atualize sua senha regularmente para manter sua conta segura.", type: "nav", deepScreen: "change_password" },
            { icon: "📱", label: "Dispositivos conectados", desc: "Veja os dispositivos que estão ativos na sua conta.", type: "nav", deepScreen: "devices" },
            { icon: "📧", label: "E-mails do Lupyy", desc: "Veja os e-mails de segurança enviados pelo Lupyy.", type: "nav", deepScreen: "lupyy_emails" },
            { icon: "📥", label: "Baixar seus dados", desc: "Solicite uma cópia de todas as suas informações.", type: "nav", deepScreen: "download_data" },
            { icon: "🗑️", label: "Excluir conta", desc: "Exclua permanentemente sua conta e todos os dados.", type: "nav", deepScreen: "delete_account" },
          ]
        );
      }

      // Messages settings sub-screen
      if (settingsSubScreen === "messages_settings") {
        return renderSettingsSubPage(
          info.title,
          "Configure como as pessoas podem enviar mensagens para você.",
          [
            { icon: "✉️", label: "Permitir solicitações de mensagens", desc: "Receba mensagens de pessoas que você não segue.", type: "toggle", settingKey: "allow_message_requests" },
            { icon: "✅", label: "Confirmações de leitura", desc: "Mostrar quando você visualizou uma mensagem.", type: "toggle", settingKey: "show_read_receipts" },
            { icon: "⌨️", label: "Indicador de digitação", desc: "Mostrar quando você está digitando.", type: "toggle", settingKey: "show_typing_indicator" },
            { icon: "🔔", label: "Notificações de mensagens", desc: "Receba alertas quando receber novas mensagens.", type: "toggle", settingKey: "message_notifications" },
            { icon: "📸", label: "Fotos/vídeos temporários", desc: "Permitir receber mídia que desaparece após visualização.", type: "toggle", settingKey: "allow_ephemeral_media" },
          ]
        );
      }

      // Tags & mentions sub-screen
      if (settingsSubScreen === "tags") {
        return renderSettingsSubPage(
          info.title,
          "Gerencie como as pessoas podem marcar e mencionar você.",
          [
            { icon: "🏷️", label: "Permitir marcações de", desc: "Todos · Pessoas que sigo · Ninguém", type: "nav", deepScreen: "allow_tags_from" },
            { icon: "📢", label: "Permitir menções de", desc: "Todos · Pessoas que sigo · Ninguém", type: "nav", deepScreen: "allow_mentions_from" },
            { icon: "✅", label: "Aprovar marcações manualmente", desc: "Aprovar marcações antes de aparecerem no seu perfil.", type: "toggle", settingKey: "approve_tags_manually" },
            { icon: "🔔", label: "Notificações de menções", desc: "Receba alertas quando alguém mencionar você.", type: "toggle", settingKey: "mention_notifications" },
          ]
        );
      }

      // Comments sub-screen
      if (settingsSubScreen === "comments") {
        return renderSettingsSubPage(
          info.title,
          "Controle quem pode comentar nas suas publicações.",
          [
            { icon: "💬", label: "Permitir comentários de", desc: "Todos · Seguidores · Pessoas que sigo · Desativado", type: "nav", deepScreen: "allow_comments_from" },
            { icon: "🚫", label: "Filtro de comentários ofensivos", desc: "Ocultar automaticamente comentários que possam ser ofensivos.", type: "toggle", settingKey: "filter_offensive_comments" },
            { icon: "📝", label: "Filtro manual de palavras", desc: "Ocultar comentários que contenham palavras ou frases específicas.", type: "nav", deepScreen: "filtered_words" },
            { icon: "📌", label: "Fixar comentários", desc: "Destaque os melhores comentários no topo.", type: "info" },
          ]
        );
      }

      // Discovery preferences sub-screen
      if (settingsSubScreen === "discovery") {
        return renderSettingsSubPage(
          info.title,
          "Personalize como você aparece e o que descobre no Lupyy.",
          [
            { icon: "🌐", label: "Aparecer nas sugestões", desc: "Seu perfil pode ser sugerido para outros usuários.", type: "toggle", settingKey: "appear_in_suggestions" },
            { icon: "🎯", label: "Interesses", desc: "Selecione tópicos de interesse para personalizar seu feed.", type: "nav", deepScreen: "interests" },
            { icon: "📍", label: "Pessoas próximas", desc: "Descubra pessoas na sua região.", type: "toggle", settingKey: "nearby_people" },
            { icon: "🔄", label: "Conteúdo semelhante", desc: "Ver publicações baseadas no que você curtiu.", type: "toggle", settingKey: "similar_content" },
          ]
        );
      }

      // Close friends sub-screen
      if (settingsSubScreen === "close_friends") {
        return renderSettingsSubPage(
          info.title,
          "Compartilhe stories exclusivos com sua lista de amigos próximos.",
          [
            { icon: "⭐", label: "Gerenciar lista", desc: "Adicione ou remova pessoas da sua lista de amigos próximos.", type: "nav", deepScreen: "close_friends_list" },
            { icon: "💚", label: "Anel verde nos stories", desc: "Amigos próximos veem um anel verde em vez do padrão.", type: "info" },
            { icon: "🔒", label: "Privacidade da lista", desc: "Sua lista de amigos próximos é sempre privada.", type: "info" },
          ]
        );
      }

      // Restricted sub-screen
      if (settingsSubScreen === "restricted") {
        return renderSettingsSubPage(
          info.title,
          "Contas restritas não sabem que foram limitadas. Seus comentários só ficam visíveis para elas.",
          [
            { icon: "⚠️", label: "Contas restritas", desc: "Gerencie as contas que você restringiu.", type: "nav", deepScreen: "restricted_list" },
            { icon: "💬", label: "Comentários limitados", desc: "Comentários de contas restritas ficam visíveis apenas para elas.", type: "info" },
            { icon: "📩", label: "Mensagens em solicitações", desc: "Mensagens de contas restritas vão para solicitações.", type: "info" },
          ]
        );
      }

      // Saved items sub-screen
      if (settingsSubScreen === "saved") {
        return renderSettingsSubPage(
          info.title,
          "Acesse suas publicações salvas e organize em coleções.",
          [
            { icon: "📂", label: "Todas as publicações salvas", desc: "Veja tudo que você salvou em um só lugar.", type: "nav", deepScreen: "saved_all" },
            { icon: "➕", label: "Nova coleção", desc: "Organize seus itens salvos em coleções temáticas.", type: "nav", deepScreen: "saved_collections" },
            { icon: "🔒", label: "Privacidade", desc: "Somente você pode ver o que foi salvo.", type: "info" },
          ]
        );
      }

      // Archived items sub-screen
      if (settingsSubScreen === "archived") {
        return renderSettingsSubPage(
          info.title,
          "Veja suas publicações e stories arquivados.",
          [
            { icon: "📷", label: "Publicações arquivadas", desc: "Posts que você removeu do perfil mas não excluiu.", type: "nav", deepScreen: "archived_posts" },
            { icon: "⏰", label: "Stories arquivados", desc: "Seus stories expirados ficam salvos automaticamente.", type: "nav", deepScreen: "archived_stories" },
            { icon: "🔄", label: "Restaurar publicação", desc: "Devolva publicações arquivadas ao seu perfil.", type: "info" },
          ]
        );
      }

      // Activity sub-screen
      if (settingsSubScreen === "activity") {
        return renderSettingsSubPage(
          info.title,
          "Veja como você tem usado o Lupyy e gerencie seu tempo.",
          [
            { icon: "📊", label: "Tempo no Lupyy", desc: "Veja quanto tempo você passou no app hoje e esta semana.", type: "nav", deepScreen: "time_usage" },
            { icon: "❤️", label: "Curtidas recentes", desc: "Veja todas as publicações que você curtiu.", type: "nav", deepScreen: "recent_likes" },
            { icon: "💬", label: "Comentários recentes", desc: "Reveja os comentários que você fez.", type: "nav", deepScreen: "recent_comments" },
            { icon: "🔍", label: "Pesquisas recentes", desc: "Gerencie seu histórico de pesquisa.", type: "nav", deepScreen: "recent_searches" },
            { icon: "🔗", label: "Links visitados", desc: "Veja os links que você abriu recentemente.", type: "nav", deepScreen: "visited_links" },
          ]
        );
      }

      // Time management sub-screen
      if (settingsSubScreen === "time_mgmt") {
        return renderSettingsSubPage(
          info.title,
          "Defina limites de uso para manter um equilíbrio saudável.",
          [
            { icon: "⏱️", label: "Lembrete diário", desc: "Defina um limite de tempo e receba um aviso.", type: "nav", deepScreen: "daily_reminder" },
            { icon: "🌙", label: "Modo silencioso", desc: "Silencie notificações em horários específicos.", type: "nav", deepScreen: "quiet_mode" },
            { icon: "📵", label: "Pausar notificações", desc: "Desative todas as notificações temporariamente.", type: "toggle", settingKey: "pause_notifications" },
          ]
        );
      }

      // Help & support sub-screen
      if (settingsSubScreen === "help") {
        return renderSettingsSubPage(
          info.title,
          "Precisa de ajuda? Estamos aqui para você.",
          [
            { icon: "📋", label: "Central de ajuda", desc: "Respostas para perguntas frequentes.", type: "nav", deepScreen: "help_center" },
            { icon: "🐛", label: "Reportar problema", desc: "Algo não está funcionando? Nos avise.", type: "nav", deepScreen: "report_bug" },
            { icon: "💡", label: "Sugestão de recurso", desc: "Sugira melhorias para o Lupyy.", type: "nav", deepScreen: "suggest_feature" },
            { icon: "📱", label: "Informações do app", desc: "Versão, status do servidor e dados técnicos.", type: "nav", deepScreen: "app_info" },
            { icon: "📧", label: "Contato", desc: "Entre em contato com nossa equipe de suporte.", type: "nav", deepScreen: "contact" },
          ]
        );
      }

      // Generic fallback for any remaining sub-screens
      return (
        <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
          {renderDeepHeader(info.title, () => setSettingsSubScreen(null))}
          <View style={styles.subScreenContent}>
            <Text style={styles.subScreenEmoji}>{info.emoji}</Text>
            <Text style={[styles.subScreenTitle, { color: theme.colors.text }]}>{info.title}</Text>
            <Text style={[styles.subScreenDesc, { color: theme.colors.textMuted }]}>{info.desc}</Text>
          </View>
        </SafeAreaView>
      );
    }

    const settingsSections = [
      {
        title: t("settings.yourAccount"),
        items: [
          {
            icon: "👤",
            label: t("settings.editProfile"),
            onPress: () => {
              setSettingsVisible(false);
              setUsernameStatus("idle");
              setUsernameMessage("");
              setEditing(true);
            },
          },
          { icon: "🔒", label: t("settings.accountPrivacy"), onPress: () => setSettingsSubScreen("privacy") },
          { icon: "🔔", label: t("settings.notifications"), onPress: () => { setSettingsVisible(false); router.push("/notifications"); } },
          { icon: "🛡️", label: t("settings.security"), onPress: () => setSettingsSubScreen("security") },
        ],
      },
      {
        title: t("settings.howPeopleInteract"),
        items: [
          { icon: "💬", label: t("settings.messagesReplies"), onPress: () => setSettingsSubScreen("messages_settings") },
          { icon: "🏷️", label: t("settings.tagsMentions"), onPress: () => setSettingsSubScreen("tags") },
          { icon: "💭", label: t("settings.comments"), onPress: () => setSettingsSubScreen("comments") },
          { icon: "🚫", label: t("settings.blocked"), onPress: () => setSettingsSubScreen("blocked") },
          { icon: "⚠️", label: t("settings.restricted"), onPress: () => setSettingsSubScreen("restricted") },
        ],
      },
      {
        title: t("settings.socialLupyy"),
        items: [
          {
            icon: "💘",
            label: t("settings.crushes"),
            onPress: () => {
              if (isCommitted && isOwnProfile) {
                Alert.alert(t("alert.crushesBlocked"), t("alert.crushesBlockedMsg"));
                return;
              }
              openPeopleSheet("interested");
            },
          },
          { icon: "⭐", label: t("settings.closeFriends"), onPress: () => setSettingsSubScreen("close_friends") },
          { icon: "👥", label: t("settings.tribes"), onPress: () => { setSettingsVisible(false); router.push("/tribes"); } },
          { icon: "🎯", label: t("settings.discoveryPrefs"), onPress: () => setSettingsSubScreen("discovery") },
        ],
      },
      {
        title: t("settings.content"),
        items: [
          { icon: "🔖", label: t("settings.savedItems"), onPress: () => setSettingsSubScreen("saved") },
          { icon: "📦", label: t("settings.archivedItems"), onPress: () => setSettingsSubScreen("archived") },
          { icon: "📊", label: t("settings.yourActivity"), onPress: () => setSettingsSubScreen("activity") },
        ],
      },
      {
        title: t("settings.app"),
        items: [
          { icon: "🎨", label: t("settings.appearance"), onPress: () => setSettingsSubScreen("appearance") },
          { icon: "⏱️", label: t("settings.timeManagement"), onPress: () => setSettingsSubScreen("time_mgmt") },
          { icon: "❓", label: t("settings.helpSupport"), onPress: () => setSettingsSubScreen("help") },
          { icon: "📋", label: t("settings.privacyPolicy"), onPress: () => { setSettingsVisible(false); router.push("/privacy"); } },
          { icon: "📜", label: t("settings.termsOfUse"), onPress: () => { setSettingsVisible(false); router.push("/terms"); } },
        ],
      },
    ];

    return (
      <>
        <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
          {/* Header */}
          <View style={styles.settingsHeader}>
            <TouchableOpacity
              onPress={() => setSettingsVisible(false)}
              activeOpacity={0.7}
              style={styles.settingsBackBtn}
            >
              <Text style={[styles.settingsBackIcon, { color: theme.colors.text }]}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.settingsTitle, { color: theme.colors.text }]}>{t("settings.title")}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search */}
          <View style={styles.settingsSearchWrap}>
            <View style={[styles.settingsSearchBox, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.settingsSearchIcon, { color: theme.colors.textMuted }]}>🔍</Text>
              <Text style={[styles.settingsSearchPlaceholder, { color: theme.colors.textMuted }]}>{t("settings.search")}</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
            {settingsSections.map((section, sIdx) => (
              <View key={sIdx} style={styles.settingsSection}>
                <Text style={[styles.settingsSectionTitle, { color: theme.colors.primary || "#a855f7" }]}>
                  {section.title}
                </Text>
                {section.items.map((item, iIdx) => (
                  <TouchableOpacity
                    key={iIdx}
                    style={[styles.settingsRow, { borderBottomColor: "rgba(255,255,255,0.06)" }]}
                    activeOpacity={0.6}
                    onPress={item.onPress}
                  >
                    <Text style={styles.settingsRowIcon}>{item.icon}</Text>
                    <Text style={[styles.settingsRowLabel, { color: theme.colors.text }]}>{item.label}</Text>
                    <Text style={[styles.settingsRowChevron, { color: theme.colors.textMuted }]}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}

            {/* Sair */}
            <View style={styles.settingsSection}>
              <TouchableOpacity
                style={[styles.settingsRow, { borderBottomColor: "transparent" }]}
                activeOpacity={0.6}
                onPress={() => {
                  setSettingsVisible(false);
                  signOut();
                }}
              >
                <Text style={styles.settingsRowIcon}>🚪</Text>
                <Text style={[styles.settingsRowLabel, { color: "#ff6b6b" }]}>{t("settings.logout")}</Text>
                <Text style={[styles.settingsRowChevron, { color: "#ff6b6b" }]}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 80 }} />
          </ScrollView>
        </SafeAreaView>

        {/* Modals rendered on top of settings */}
        <PeopleListSheet
          visible={peopleSheetVisible}
          mode={peopleSheetMode}
          profileId={userId ?? ""}
          isOwnProfile={isOwnProfile}
          myRelationshipStatus={myRelationshipStatus}
          onClose={() => setPeopleSheetVisible(false)}
          onOpenProfile={(targetId) => {
            setPeopleSheetVisible(false);
            setSettingsVisible(false);
            handlePressUser(targetId);
          }}
        />
      </>
    );
  }

  // ── EDIT PROFILE FULLSCREEN ──
  if (editing) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={styles.settingsHeader}>
          <TouchableOpacity
            onPress={() => {
              setDraftUsername(username);
              setDraftFullName(fullName);
              setDraftBio(bio);
              setDraftRelationshipStatus(relationshipStatus);
              setDraftGender(gender);
              setEditing(false);
            }}
            activeOpacity={0.7}
            style={styles.settingsBackBtn}
          >
            <Text style={[styles.settingsBackIcon, { color: theme.colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.settingsTitle, { color: theme.colors.text }]}>{t("profile.editProfile")}</Text>
          <TouchableOpacity
            onPress={handleSaveProfile}
            disabled={savingProfile || isUsernameSaveBlocked}
            activeOpacity={0.7}
            style={[styles.editSaveHeaderBtn, (savingProfile || isUsernameSaveBlocked) && { opacity: 0.4 }]}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color={theme.colors.primary || "#a855f7"} />
            ) : (
              <Text style={[styles.editSaveHeaderText, { color: theme.colors.primary || "#a855f7" }]}>{t("common.save")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.editPremiumScroll} showsVerticalScrollIndicator={false}>
          {/* Avatar Section */}
          <View style={styles.editAvatarSection}>
            <TouchableOpacity onPress={handleChangeAvatar} activeOpacity={0.8} style={styles.editAvatarBtn}>
              {avatarUrl ? (
                <ExpoImage
                  source={{ uri: avatarUrl }}
                  style={styles.editAvatarImg}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <LinearGradient
                  colors={[Colors.brandStart, Colors.brandEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.editAvatarImg}
                >
                  <Text style={styles.avatarInitials}>{username?.[0]?.toUpperCase() || "L"}</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleChangeAvatar} activeOpacity={0.7}>
              <Text style={[styles.editAvatarLabel, { color: theme.colors.primary || "#a855f7" }]}>
                {t("profile.editPhotoAvatar")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <View style={styles.editFieldsWrap}>
            {/* Nome */}
            <View
              style={[styles.editFieldBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <Text style={[styles.editFieldLabel, { color: theme.colors.textMuted }]}>{t("profile.name")}</Text>
              <TextInput
                value={draftFullName}
                onChangeText={setDraftFullName}
                placeholder={t("profile.namePlaceholder")}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.editFieldInput, { color: theme.colors.text }]}
              />
            </View>

            {/* Username */}
            <Animated.View
              style={[
                styles.editFieldBox,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor:
                    usernameStatus === "taken" || usernameStatus === "invalid"
                      ? "#ef4444"
                      : usernameStatus === "available"
                        ? "#22c55e"
                        : theme.colors.border,
                  borderWidth: usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "available" ? 1.5 : 1,
                  transform: [{ translateX: usernameShakeAnim }],
                },
              ]}
            >
              <Text style={[styles.editFieldLabel, { color: theme.colors.textMuted }]}>{t("profile.username")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 15, fontWeight: "500", marginRight: 2 }}>@</Text>
                <TextInput
                  value={draftUsername}
                  onChangeText={handleUsernameChange}
                  placeholder="username"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.editFieldInput, { color: theme.colors.text, flex: 1 }]}
                />
                {usernameStatus === "checking" && (
                  <ActivityIndicator size="small" color={theme.colors.textMuted} style={{ marginLeft: 8 }} />
                )}
              </View>
            </Animated.View>
            {usernameMessage ? (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "500",
                  marginTop: -6,
                  marginLeft: 4,
                  color:
                    usernameStatus === "taken" || usernameStatus === "invalid"
                      ? "#ef4444"
                      : usernameStatus === "available"
                        ? "#22c55e"
                        : theme.colors.textMuted,
                }}
              >
                {usernameMessage}
              </Text>
            ) : null}

            {/* Bio */}
            <View
              style={[
                styles.editFieldBox,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, minHeight: 100 },
              ]}
            >
              <Text style={[styles.editFieldLabel, { color: theme.colors.textMuted }]}>{t("profile.bio")}</Text>
              <TextInput
                value={draftBio}
                onChangeText={setDraftBio}
                placeholder={t("profile.bioPlaceholder")}
                placeholderTextColor={theme.colors.textMuted}
                multiline
                style={[styles.editFieldInput, { color: theme.colors.text, minHeight: 60, textAlignVertical: "top" }]}
              />
            </View>

            {/* Gênero */}
            <View
              style={[styles.editFieldBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <Text style={[styles.editFieldLabel, { color: theme.colors.textMuted }]}>{t("profile.gender")}</Text>
              <View style={styles.editGenderRow}>
                {genderOptions.map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setDraftGender(g)}
                    activeOpacity={0.7}
                    style={[
                      styles.editGenderPill,
                      {
                        borderColor: draftGender === g ? theme.colors.primary || "#a855f7" : theme.colors.border,
                        backgroundColor: draftGender === g ? "rgba(168,85,247,0.15)" : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.editGenderText,
                        { color: draftGender === g ? theme.colors.primary || "#a855f7" : theme.colors.text },
                      ]}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Status de relacionamento */}
            <View
              style={[styles.editFieldBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <Text style={[styles.editFieldLabel, { color: theme.colors.textMuted }]}>{t("profile.relationshipStatus")}</Text>
              <Animated.View style={[styles.editGenderRow, { transform: [{ translateX: shakeAnim }] }]}>
                {relationshipOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => handleRelationshipPillPress(opt.value)}
                    activeOpacity={0.7}
                    style={[
                      styles.editGenderPill,
                      {
                        borderColor:
                          draftRelationshipStatus === opt.value
                            ? theme.colors.primary || "#a855f7"
                            : theme.colors.border,
                        backgroundColor:
                          draftRelationshipStatus === opt.value ? "rgba(168,85,247,0.15)" : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.editGenderText,
                        {
                          color:
                            draftRelationshipStatus === opt.value
                              ? theme.colors.primary || "#a855f7"
                              : theme.colors.text,
                        },
                      ]}
                    >
                      {opt.icon} {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
              {cooldownWarning && <Text style={[styles.editFieldHint, { color: "#f59e0b" }]}>{cooldownWarning}</Text>}
              {(draftRelationshipStatus === "committed" || draftRelationshipStatus === "other") && (
                <Text style={[styles.editFieldHint, { color: theme.colors.textMuted }]}>
                  {t("profile.relationshipWarning")}
                </Text>
              )}
            </View>

            {/* Parceiro vinculado — só aparece quando comprometido */}
            {(draftRelationshipStatus === "committed" || draftRelationshipStatus === "other") && (
              <View
                style={[
                  styles.editFieldBox,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.editFieldLabel, { color: theme.colors.textMuted }]}>{t("profile.partnerLabel")}</Text>
                <Text style={[styles.editFieldHint, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                  {t("profile.partnerHint")}
                </Text>

                {partnerProfile ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "rgba(168,85,247,0.1)",
                      borderRadius: 14,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <ExpoImage
                      source={{ uri: partnerProfile.avatar_url || undefined }}
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#333", marginRight: 10 }}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: "600", fontSize: 14 }}>
                        {partnerProfile.full_name || partnerProfile.username || t("profile.partnerDefault")}
                      </Text>
                      {partnerProfile.username && (
                        <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>@{partnerProfile.username}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setDraftPartnerId(null);
                        setPartnerProfile(null);
                        setPartnerSearchQuery("");
                      }}
                      style={{ padding: 6 }}
                    >
                      <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "600" }}>{t("profile.partnerRemove")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      placeholder={t("profile.partnerSearch")}
                      placeholderTextColor={theme.colors.textMuted}
                      value={partnerSearchQuery}
                      onChangeText={async (text) => {
                        setPartnerSearchQuery(text);
                        if (text.trim().length < 2) {
                          setPartnerSearchResults([]);
                          return;
                        }
                        const { data } = await supabase
                          .from("profiles")
                          .select("id, username, full_name, avatar_url")
                          .neq("id", userId!)
                          .ilike("username", `%${text.trim()}%`)
                          .limit(5);
                        if (data) setPartnerSearchResults(data as ProfileRow[]);
                      }}
                      style={[styles.editFieldInput, { color: theme.colors.text }]}
                    />
                    {partnerSearchResults.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => {
                          setDraftPartnerId(p.id);
                          setPartnerProfile(p);
                          setPartnerSearchQuery("");
                          setPartnerSearchResults([]);
                        }}
                        style={{ flexDirection: "row", alignItems: "center", padding: 8, borderRadius: 10 }}
                      >
                        <ExpoImage
                          source={{ uri: p.avatar_url || undefined }}
                          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#333", marginRight: 8 }}
                          contentFit="cover"
                        />
                        <View>
                          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "500" }}>
                            {p.full_name || p.username}
                          </Text>
                          {p.username && (
                            <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>@{p.username}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Estilo visual */}
            <View
              style={[styles.editFieldBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <Text style={[styles.editFieldLabel, { color: theme.colors.textMuted }]}>{t("profile.visualStyle")}</Text>
              <View style={styles.editThemeBox}>
                <ThemeSelector />
              </View>
            </View>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const ListHeader = () => {
    const followLabel =
      currentInterestType === "friend"
        ? t("profile.friends")
        : currentInterestType === "crush"
          ? "Crush"
          : currentInterestType === "silent_crush"
            ? t("profile.silentCrush")
            : t("profile.connect");

    const hasCrushConversation = isCrushMatch;
    const hasFriendConversation = isMutualFriend;

    const hasStories = stories.length > 0;

    return (
      <View style={styles.mainColumn}>
        <View style={styles.topBar}>
          {isViewingOther ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (authUserId) {
                  router.replace("/profile");
                } else {
                  router.replace("/");
                }
              }}
            >
              <Text style={[styles.topIcon, { color: theme.colors.text }]}>←</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={isOwnProfile ? 0.8 : 1}
              onPress={isOwnProfile ? handleAddStory : undefined}
            >
              <Text style={[styles.topIcon, { color: theme.colors.text }]}>＋</Text>
            </TouchableOpacity>
          )}
          <View style={styles.topCenter}>
            <Text style={[styles.topUsername, { color: theme.colors.text }]} numberOfLines={1}>
              {username}
            </Text>
            <Text style={[styles.topChevron, { color: theme.colors.text }]}>▾</Text>
          </View>
          <View style={styles.topActions}>
            {isOwnProfile && (
              <TouchableOpacity
                onPress={() => setSettingsVisible(true)}
                activeOpacity={0.8}
                style={[styles.logoutButton, { borderColor: theme.colors.border }]}
              >
                <Text style={[styles.logoutIcon, { color: theme.colors.text }]}>⎋</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[styles.header, isMobileLayout && styles.headerMobile]}>
          <TouchableOpacity
            style={[styles.avatarWrapper, isMobileLayout && styles.avatarWrapperMobile]}
            onPress={() => {
              if (hasStories) {
                openStory(0);
              } else if (isOwnProfile) {
                handleChangeAvatar();
              }
            }}
            onLongPress={isOwnProfile ? handleChangeAvatar : undefined}
            activeOpacity={0.8}
          >
            {hasStories ? (
              <LinearGradient
                colors={[Colors.brandStart, Colors.brandEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarStoryRing}
              >
                {avatarUrl ? (
                  <ExpoImage
                    source={{ uri: avatarUrl }}
                    style={styles.avatarInRing}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={styles.avatarInRing}>
                    <Text style={styles.avatarInitials}>{username?.[0]?.toUpperCase() || "L"}</Text>
                  </View>
                )}
              </LinearGradient>
            ) : avatarUrl ? (
              <ExpoImage source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" cachePolicy="disk" />
            ) : (
              <LinearGradient
                colors={[Colors.brandStart, Colors.brandEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarInitials}>{username?.[0]?.toUpperCase() || "L"}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>

          {Platform.OS === "web" && bioTags.length > 0 && (
            <View style={styles.tagsRow}>
              {bioTags.map((t) => (
                <View
                  key={t}
                  style={[
                    styles.tagPill,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.tagText, { color: theme.colors.textMuted }]}>#{t}</Text>
                </View>
              ))}
            </View>
          )}

          {Platform.OS !== "web" && bioTags.length > 0 && (
            <View style={styles.tagsRow}>
              {bioTags.map((t) => (
                <View
                  key={t}
                  style={[
                    styles.tagPill,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.tagText, { color: theme.colors.textMuted }]}>#{t}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>{postsCount}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t("profile.posts")}</Text>
            </View>
            <TouchableOpacity style={styles.statItem} activeOpacity={0.8} onPress={() => openPeopleSheet("followers")}>
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>{followersCount}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t("profile.followers")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statItem} activeOpacity={0.8} onPress={() => openPeopleSheet("following")}>
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>{followingCount}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t("profile.following")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.8}
              onPress={() => {
                if (isCommitted && isOwnProfile) {
                  Alert.alert(
                    t("alert.crushesBlocked"),
                    t("alert.crushesBlockedFullMsg"),
                  );
                  return;
                }
                openPeopleSheet("interested");
              }}
            >
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>
                {isCommitted && isOwnProfile ? "🔒" : interestedCount}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{t("profile.crush")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── COMMITTED BADGE ── */}
        {isCommitted && (
          <View style={[styles.committedBadgeRow]}>
            <View
              style={[
                styles.committedBadge,
                { backgroundColor: "rgba(168,85,247,0.12)", borderColor: "rgba(168,85,247,0.3)" },
              ]}
            >
              <Text style={styles.committedBadgeText}>
                {relationshipStatus === "other" ? `💍 ${t("profile.statusMarried")}` : `💜 ${t("profile.committedBadge")}`}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.bioSection, isMobileLayout && styles.bioSectionMobile]}>
          {fullName ? <Text style={[styles.fullName, { color: theme.colors.text }]}>{fullName}</Text> : null}
          {bio ? (
            <Text style={[styles.bioText, { color: theme.colors.text }]}>{bio}</Text>
          ) : authEmail && isOwnProfile ? (
            <Text style={[styles.bioPlaceholder, { color: theme.colors.textMuted }]}>{authEmail}</Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          {isOwnProfile ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: theme.colors.border }, !isOwnProfile && { opacity: 0.5 }]}
                activeOpacity={0.8}
                onPress={() => {
                  if (isOwnProfile) setEditing(true);
                }}
                disabled={!isOwnProfile}
              >
                <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>{t("profile.adjustVibe")}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionButton, { borderColor: theme.colors.border }]} activeOpacity={0.8}>
                <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>{t("profile.showMyId")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallActionButton, { borderColor: theme.colors.border }]}
                activeOpacity={0.8}
                onPress={isOwnProfile ? handleAddStory : undefined}
              >
                <Text style={[styles.smallActionButtonText, { color: theme.colors.text }]}>＋</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: theme.colors.border }]}
                activeOpacity={0.8}
                onPress={handleToggleFollowButton}
                disabled={loadingFollow}
              >
                <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>
                  {loadingFollow ? t("profile.loading") : followLabel}
                </Text>
              </TouchableOpacity>

              {canOpenConversation && (
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor: theme.colors.border }]}
                  activeOpacity={0.8}
                  onPress={() => openConversation(hasCrushConversation ? "crush" : "friend" as ConversationType)}
                >
                  <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>
                    {t("profile.message")}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.smallActionButton, { borderColor: theme.colors.border }]}
                activeOpacity={0.8}
                onPress={() => setActionSheetVisible(true)}
              >
                <Text style={[styles.smallActionButtonText, { color: theme.colors.text }]}>⋯</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── LEVEL, BADGES & BOOST ── */}
        {levelInfo && (
          <View style={[styles.panelCard, { backgroundColor: theme.colors.surface }]}>
            {/* Level + XP bar */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 22, marginRight: 6 }}>
                {LEVEL_CONFIG[levelInfo.level]?.emoji || "🌱"}
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "700", fontSize: 16, marginRight: 8 }}>
                Nível {levelInfo.level} — {levelInfo.level_name}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                {levelInfo.xp} XP
              </Text>
            </View>
            {/* XP Progress bar */}
            {(() => {
              const prog = getXpProgress(levelInfo.xp, levelInfo.level);
              return (
                <View style={{ marginBottom: 10 }}>
                  <View style={{
                    height: 8, borderRadius: 4, backgroundColor: theme.colors.border,
                    overflow: "hidden",
                  }}>
                    <LinearGradient
                      colors={[Colors.brandStart, Colors.brandEnd]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ height: "100%", width: `${prog.percent}%`, borderRadius: 4 }}
                    />
                  </View>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 3 }}>
                    {prog.current}/{prog.needed} XP para o próximo nível
                  </Text>
                </View>
              );
            })()}
            {/* Badges */}
            {levelInfo.badges && levelInfo.badges.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {levelInfo.badges.map((b: Badge, i: number) => {
                  const cfg = BADGE_CONFIG[b.badge_type];
                  if (!cfg) return null;
                  return (
                    <View key={i} style={{
                      flexDirection: "row", alignItems: "center",
                      paddingHorizontal: 10, paddingVertical: 4,
                      borderRadius: 12, backgroundColor: cfg.color + "20",
                      borderWidth: 1, borderColor: cfg.color + "40",
                    }}>
                      <Text style={{ fontSize: 14, marginRight: 4 }}>{cfg.emoji}</Text>
                      <Text style={{ color: cfg.color, fontSize: 12, fontWeight: "600" }}>{cfg.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}
            {/* Profile views mini stat — clickable to open visitors */}
            {profileViewStats && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={isOwnProfile ? openVisitorsModal : undefined}
                style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}
              >
                <Text style={{ fontSize: 14, marginRight: 4 }}>👀</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                  {profileViewStats.views_24h} visitas hoje · {profileViewStats.views_7d} esta semana
                </Text>
                {isOwnProfile && (
                  <Text style={{ color: theme.colors.primary, fontSize: 12, marginLeft: 6, fontWeight: "600" }}>Ver →</Text>
                )}
              </TouchableOpacity>
            )}
            {/* Feedback phrase */}
            {feedbackPhrase && (
              <View style={{
                marginTop: 8, paddingHorizontal: 12, paddingVertical: 8,
                borderRadius: 10, backgroundColor: feedbackPhrase.color + "15",
                borderWidth: 1, borderColor: feedbackPhrase.color + "30",
              }}>
                <Text style={{ color: feedbackPhrase.color, fontSize: 13, fontWeight: "700" }}>
                  {feedbackPhrase.text}
                </Text>
              </View>
            )}
          </View>
        )}





        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.highlightsRow}
        >
          {/* "Novo" button — only for own profile */}
          {isOwnProfile && (
            <TouchableOpacity style={styles.highlightItem} onPress={handlePickHighlight} activeOpacity={0.8}>
              <View style={[styles.highlightCircle, { borderColor: theme.colors.border }]}>
                <Text style={[styles.highlightPlus, { color: theme.colors.text }]}>＋</Text>
              </View>
              <Text style={[styles.highlightLabel, { color: theme.colors.textMuted }]}>{t("profile.new")}</Text>
            </TouchableOpacity>
          )}

          {/* Existing highlights */}
          {highlights.map((hl) => (
            <TouchableOpacity
              key={hl.id}
              style={styles.highlightItem}
              activeOpacity={0.8}
              onPress={() => handleOpenHighlight(hl)}
              onLongPress={isOwnProfile ? () => handleEditHighlight(hl) : undefined}
            >
              <View style={[styles.highlightCircle, { borderColor: theme.colors.border }]}>
                {hl.cover_url ? (
                  <ExpoImage
                    source={{ uri: hl.cover_url.startsWith("http") ? hl.cover_url : supabase.storage.from("stories").getPublicUrl(hl.cover_url).data.publicUrl }}
                    style={styles.highlightImage}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <LinearGradient
                    colors={[Colors.brandStart, Colors.brandEnd]}
                    style={[styles.highlightImage, { alignItems: "center", justifyContent: "center" }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
                      {hl.title?.[0]?.toUpperCase() || "D"}
                    </Text>
                  </LinearGradient>
                )}
              </View>
              <Text
                style={[styles.highlightLabel, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {hl.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.tabsRow, { borderTopColor: theme.colors.border }]}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === "grid" && styles.tabItemActive]}
            onPress={() => setActiveTab("grid")}
          >
            <Text
              style={[
                styles.tabIcon,
                { color: theme.colors.textMuted },
                activeTab === "grid" && {
                  ...styles.tabIconActive,
                  color: theme.colors.text,
                },
              ]}
            >
              ⬚
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === "reels" && styles.tabItemActive]}
            onPress={() => setActiveTab("reels")}
          >
            <Text
              style={[
                styles.tabIcon,
                { color: theme.colors.textMuted },
                activeTab === "reels" && {
                  ...styles.tabIconActive,
                  color: theme.colors.text,
                },
              ]}
            >
              ▶
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === "tagged" && styles.tabItemActive]}
            onPress={() => setActiveTab("tagged")}
          >
            <Text
              style={[
                styles.tabIcon,
                { color: theme.colors.textMuted },
                activeTab === "tagged" && {
                  ...styles.tabIconActive,
                  color: theme.colors.text,
                },
              ]}
            >
              👤
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const isLoadingInitial = loadingHeader && posts.length === 0;

  return (
    <SwipeableTabScreen
      leftTarget={{ route: "/(tabs)/search", icon: "search-outline", label: "Pesquisar" }}
    >
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      {isLoadingInitial ? (
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator />
          <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>{t("profile.loadingProfile")}</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={currentPosts}
            keyExtractor={(it) => String(it.id)}
            numColumns={activeTab === "reels" ? 2 : 3}
            key={activeTab === "reels" ? "reels-2col" : "grid-3col"}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={styles.list}
            renderItem={activeTab === "reels" ? renderReelItem : renderItem}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.brandStart}
                colors={[Colors.brandStart, Colors.brandEnd]}
                progressBackgroundColor={theme.colors.surface}
              />
            }
            onEndReachedThreshold={0.25}
            onEndReached={handleEndReached}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={
              loadingPosts && currentPosts.length > 0 ? (
                <View style={{ height: 56, justifyContent: "center" }}>
                  <ActivityIndicator />
                </View>
              ) : null
            }
            ListEmptyComponent={
              !loadingPosts ? (
                <View style={{ padding: 24 }}>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      textAlign: "center",
                    }}
                  >
                    {isOwnProfile
                      ? activeTab === "reels"
                        ? t("profile.noReelsOwn")
                        : t("profile.noPostsOwn")
                      : t("profile.noPostsOther")}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponentStyle={{ paddingBottom: 24 }}
          />

          <FullscreenViewer
            key={`profile-viewer-${activeTab}-${currentPosts.length}-${viewerIndex}-${viewerOpen ? "open" : "closed"}`}
            visible={viewerOpen}
            items={viewerItems}
            startIndex={viewerIndex}
            onClose={() => setViewerOpen(false)}
            getCounts={(id) => {
              const c = counts[id as number];
              return {
                likes: c?.likes ?? 0,
                comments: c?.comments ?? 0,
                reposts: c?.reposts ?? 0,
                liked: !!c?.liked,
              };
            }}
            onLike={(id) => toggleLike(id as number)}
            onComment={(id) => openComments(id as number)}
            onRepost={() => {}}
            onShare={(id) => sharePost(id as number)}
            currentUserId={authUserId}
            onDeletePost={(id) => deletePost(Number(id), true)}
            onPressUser={handlePressUser}
          />

          <StoryViewer
            visible={storiesViewerOpen}
            items={storyViewerItems}
            startIndex={storiesViewerIndex}
            onClose={() => setStoriesViewerOpen(false)}
          />

          {!IS_WEB && <CommentsSheet visible={commentsOpen} postId={commentsPostId} onClose={closeComments} />}

          {/* ── PROMOTE POST MODAL ── */}
          <Modal
            visible={promoteModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setPromoteModalVisible(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}
              onPress={() => setPromoteModalVisible(false)}
            >
              <Pressable
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 16,
                  padding: 24,
                  width: "85%",
                  maxWidth: 360,
                }}
                onPress={() => {}}
              >
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>
                  Promover publicação
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
                  Seu post será exibido no topo do feed de todos os usuários por 24 horas. Máximo de 3 posts simultâneos.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePromotePost}
                  disabled={promoteLoading}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  {promoteLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                      ⚡ Promover por 24h
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setPromoteModalVisible(false)}
                  style={{
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.textMuted, fontWeight: "600", fontSize: 14 }}>Cancelar</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          {IS_WEB && commentsOpen && commentsPostId != null && (
            <View style={styles.webOverlay}>
              <Pressable style={styles.webOverlayBg} onPress={closeComments} />
              <View style={[styles.webCard, { borderColor: theme.colors.border }]}>
                <View style={styles.webCardHeader}>
                  <Text style={[styles.webCardTitle, { color: theme.colors.text }]}>Comentários</Text>
                  <TouchableOpacity
                    onPress={closeComments}
                    style={[styles.webCloseBtn, { borderColor: theme.colors.border }]}
                  >
                    <Text style={[styles.webCloseText, { color: theme.colors.text }]}>×</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.webCardBody} contentContainerStyle={styles.webCardBodyContent}>
                  {webCommentsLoading ? (
                    <Text style={[styles.webHint, { color: theme.colors.textMuted }]}>{t("comments.loading")}</Text>
                  ) : webComments.length === 0 ? (
                    <Text style={[styles.webHint, { color: theme.colors.textMuted }]}>{t("comments.beFirst")}</Text>
                  ) : (
                    webComments.map((c: any) => (
                      <View key={String(c.id)} style={[styles.webCommentRow, { borderColor: theme.colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.webCommentUser, { color: theme.colors.text }]}>
                            {c?.profiles?.username || c?.profiles?.full_name || t("comments.user")}
                          </Text>
                          <Text style={[styles.webCommentText, { color: theme.colors.text }]}>{c.content}</Text>
                        </View>
                        {c.user_id === authUserId && (
                          <TouchableOpacity
                            onPress={async () => {
                              try {
                                await supabase.from("comments").delete().eq("id", c.id).eq("user_id", authUserId);
                                setWebComments((prev) => prev.filter((x: any) => x.id !== c.id));
                              } catch {}
                            }}
                            style={styles.webDeleteBtn}
                          >
                            <Text style={styles.webDeleteText}>Delete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>

                <View style={[styles.webComposer, { borderColor: theme.colors.border }]}>
                  <TextInput
                    value={webCommentText}
                    onChangeText={setWebCommentText}
                    placeholder={t("comments.addPlaceholder")}
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.webInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
                  />
                  <TouchableOpacity
                    onPress={async () => {
                      const content = webCommentText.trim();
                      if (!content || !authUserId) return;
                      setWebCommentText("");
                      try {
                        const { data } = await supabase
                          .from("comments")
                          .insert({ post_id: commentsPostId, user_id: authUserId, content })
                          .select("id,user_id,content,created_at,profiles:profiles(username,full_name)")
                          .single();
                        if (data) setWebComments((prev) => [...prev, data as any]);
                      } catch {}
                    }}
                    style={styles.webSendBtn}
                  >
                    <Text style={styles.webSendText}>{t("comments.send")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <Modal
            transparent
            visible={silentModalVisible}
            animationType="fade"
            onRequestClose={() => setSilentModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setSilentModalVisible(false)}>
              <Pressable style={styles.modalCard} onPress={() => {}}>
                <Text style={styles.modalTitle}>{silentModalTitle}</Text>
                <Text style={styles.modalMessage}>{silentModalMessage}</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSilentModalVisible(false)}
                  style={[styles.modalPrimaryBtn, { backgroundColor: theme.colors.primary }]}
                >
                  <Text style={styles.modalPrimaryText}>Ok</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Logout modal removed — settings screen handles this now */}

          <FollowModal
            visible={isFollowModalVisible}
            onClose={() => setFollowModalVisible(false)}
            onSelect={handleSelectInterest}
            myRelationshipStatus={myRelationshipStatus || "single"}
            targetRelationshipStatus={relationshipStatus || "single"}
            existingInterestType={currentInterestType}
            loading={loadingFollow}
            areLinkedPartners={areLinkedPartners}
            hadCrushHistory={
              !!(theirInterestType === "crush" || theirInterestType === "silent_crush") &&
              !currentInterestType?.includes("crush")
            }
          />

          <PeopleListSheet
            visible={peopleSheetVisible}
            mode={peopleSheetMode}
            profileId={userId ?? ""}
            isOwnProfile={isOwnProfile}
            myRelationshipStatus={myRelationshipStatus}
            onClose={() => setPeopleSheetVisible(false)}
            onOpenProfile={(targetId) => {
              setPeopleSheetVisible(false);
              handlePressUser(targetId);
            }}
          />

          <MatchCelebration
            visible={matchCelebrationVisible}
            matchedUserName={matchedUserName}
            onClose={() => setMatchCelebrationVisible(false)}
            onSendMessage={() => {
              setMatchCelebrationVisible(false);
              openConversation("crush");
            }}
          />

          {/* ── ACTION SHEET MODAL (block/report) ── */}
          <Modal
            visible={actionSheetVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setActionSheetVisible(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
              onPress={() => setActionSheetVisible(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  paddingBottom: Platform.OS === "ios" ? 34 : 16,
                  paddingTop: 8,
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center", marginBottom: 16 }} />
                <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 12 }}>
                  @{username ?? "usuário"}
                </Text>

                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 20 }}
                  onPress={async () => {
                    if (!userId) return;
                    setActionSheetVisible(false);
                    setBlockingUser(true);
                    if (isTargetBlocked) {
                      const res = await unblockUser(userId);
                      if (res.ok) setIsTargetBlocked(false);
                    } else {
                      const res = await blockUser(userId);
                      if (res.ok) {
                        setIsTargetBlocked(true);
                        Alert.alert("Bloqueado", `@${username ?? "usuário"} foi bloqueado.`);
                      }
                    }
                    setBlockingUser(false);
                  }}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{isTargetBlocked ? "✅" : "🚫"}</Text>
                  <Text style={{ color: "#ef4444", fontSize: 16, fontWeight: "600" }}>
                    {isTargetBlocked ? "Desbloquear" : "Bloquear"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 20 }}
                  onPress={() => {
                    setActionSheetVisible(false);
                    setReportModalVisible(true);
                  }}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>⚠️</Text>
                  <Text style={{ color: "#ef4444", fontSize: 16, fontWeight: "600" }}>Denunciar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ alignItems: "center", paddingVertical: 14, paddingHorizontal: 20, marginTop: 4 }}
                  onPress={() => setActionSheetVisible(false)}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 16 }}>Cancelar</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          {!isOwnProfile && userId && (
            <ReportModal
              visible={reportModalVisible}
              onClose={() => setReportModalVisible(false)}
              targetUserId={userId}
              onReported={() => {
                Alert.alert("Obrigado", "Sua denúncia foi enviada com sucesso.");
              }}
            />
          )}

          {/* ── HIGHLIGHT EDITOR ── */}
          {isOwnProfile && (
            <ProfileHighlightEditor
              visible={highlightEditorVisible}
              userId={authUserId ?? ""}
              highlight={editingHighlight}
              onClose={() => {
                setHighlightEditorVisible(false);
                setEditingHighlight(null);
              }}
              onSaved={handleHighlightSaved}
            />
          )}

          {/* ── HIGHLIGHT VIEWER (Story format) ── */}
          <StoryViewer
            visible={highlightViewerOpen}
            items={highlightViewerItems}
            startIndex={0}
            onClose={() => setHighlightViewerOpen(false)}
          />

          {/* ── VISITORS MODAL ── */}
          <Modal
            visible={visitorsModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setVisitorsModalVisible(false)}
          >
            <View style={{
              flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
              justifyContent: "flex-end",
            }}>
              <View style={{
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                maxHeight: "70%", paddingBottom: Platform.select({ ios: 34, default: 16 }),
              }}>
                {/* Handle */}
                <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 6 }}>
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
                </View>
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: "800" }}>👀 Quem visitou seu perfil</Text>
                  <TouchableOpacity onPress={() => setVisitorsModalVisible(false)}>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                </View>

                {visitorsLoading ? (
                  <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 40 }} />
                ) : visitors.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>👻</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Nenhuma visita recente</Text>
                  </View>
                ) : (
                  <ScrollView style={{ paddingHorizontal: 16 }}>
                    {visitors.map((v, i) => {
                      const isPremium = false; // TODO: check premium status
                      const blurred = !isPremium && i >= 3;
                      return (
                        <View
                          key={v.viewer_id + i}
                          style={{
                            flexDirection: "row", alignItems: "center",
                            paddingVertical: 12,
                            borderBottomWidth: i < visitors.length - 1 ? 1 : 0,
                            borderBottomColor: theme.colors.border,
                            opacity: blurred ? 0.4 : 1,
                          }}
                        >
                          {v.viewer_avatar_url ? (
                            <ExpoImage
                              source={{ uri: v.viewer_avatar_url }}
                              style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={{
                              width: 44, height: 44, borderRadius: 22, marginRight: 12,
                              backgroundColor: theme.colors.backgroundAlt || theme.colors.border,
                              alignItems: "center", justifyContent: "center",
                            }}>
                              <Text style={{ fontSize: 18 }}>👤</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={{
                              color: theme.colors.text, fontWeight: "700", fontSize: 15,
                              ...(blurred ? { letterSpacing: 4 } : {}),
                            }}>
                              {blurred ? "••••••••" : (v.viewer_username || v.viewer_full_name || "Usuário")}
                            </Text>
                            <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}>
                              {blurred ? "🔒 Premium para ver" : `${v.visit_count}x · ${formatVisitTime(v.last_visited_at)}`}
                            </Text>
                          </View>
                          {blurred && (
                            <View style={{
                              backgroundColor: theme.colors.primary + "20",
                              borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
                            }}>
                              <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "700" }}>PRO</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {!false /* !isPremium */ && visitors.length > 3 && (
                      <TouchableOpacity
                        style={{
                          marginTop: 16, marginBottom: 8, paddingVertical: 14,
                          borderRadius: 12, alignItems: "center",
                          backgroundColor: theme.colors.primary,
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                          ✨ Desbloquear todos com Premium
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
    </SwipeableTabScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  mainColumn: Platform.select({
    web: {
      width: "100%",
      maxWidth: GRID_MAX_WIDTH,
      alignSelf: "center",
    },
    default: {
      width: "100%",
    },
  }),
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: 8,
  },
  editScrollContent: {
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 4 : 14,
    paddingBottom: 4,
    justifyContent: "space-between",
  },
  topCenter: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  topUsername: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
    maxWidth: 180,
  },
  topChevron: {
    color: Colors.text,
    marginLeft: 4,
    fontSize: 14,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topIcon: {
    color: Colors.text,
    fontSize: 18,
  },
  logoutButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  logoutIcon: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  headerMobile: {
    flexDirection: "column",
    alignItems: "center",
  },

  avatarWrapper: {
    width: 86,
    height: 86,
    borderRadius: 999,
    marginRight: 24,
    overflow: "hidden",
  },
  avatarWrapperMobile: {
    marginRight: 0,
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },

  tagPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },

  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarStoryRing: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInRing: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#05050A",
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  statsRow: {
    flexDirection: "row",
    flex: 1,
    justifyContent: "space-between",
  },
  statsRowMobile: {
    flex: 0,
    width: "100%",
    justifyContent: "center",
    gap: 28,
    paddingHorizontal: 22,
  },

  statItem: {
    alignItems: "center",
    minWidth: 64,
  },
  statNumber: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  bioSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bioSectionMobile: {
    alignItems: "center",
  },

  fullName: {
    color: Colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  bioText: {
    color: Colors.text,
    marginTop: 2,
    fontSize: 13,
  },
  bioPlaceholder: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  editCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  editTitle: {
    color: Colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 8,
  },
  editLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 6,
    marginBottom: 2,
  },
  editInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.text,
    backgroundColor: Colors.background,
    fontSize: 13,
  },
  editInputMultiline: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  editThemeBox: {
    marginTop: 6,
    marginBottom: 6,
  },

  editButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  editButton: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  editCancelButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  editSaveButton: {
    backgroundColor: Colors.brandStart,
  },
  editCancelText: {
    color: Colors.text,
    fontWeight: "600",
    fontSize: 13,
  },
  editSaveText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 6,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    color: Colors.text,
    fontWeight: "600",
    fontSize: 13,
  },
  smallActionButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  smallActionButtonText: {
    color: Colors.text,
    fontWeight: "700",
    fontSize: 18,
  },
  storiesRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  storiesScroll: {
    paddingRight: 16,
  },
  storyItem: {
    marginRight: 12,
    alignItems: "center",
  },
  storyCircle: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  storyImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  storyLabel: {
    marginTop: 4,
    fontSize: 11,
  },
  panelCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  panelTitle: {
    fontWeight: "700",
    fontSize: 14,
  },
  panelSubtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  themeSection: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  highlightsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 16,
  },
  highlightItem: {
    alignItems: "center",
  },
  highlightCircle: {
    width: 64,
    height: 64,
    borderRadius: 64,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  highlightImage: {
    width: "100%",
    height: "100%",
  },
  highlightPlus: {
    fontSize: 24,
    fontWeight: "700",
  },
  highlightLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  tabsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  tabItem: {
    paddingVertical: 8,
    width: "33%",
    alignItems: "center",
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderColor: Colors.text,
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.4,
  },
  tabIconActive: {
    opacity: 1,
    fontWeight: "700",
  },
  list: Platform.select({
    web: {
      gap: GAP,
      paddingBottom: 120,
      alignSelf: "center",
      maxWidth: GRID_MAX_WIDTH,
      width: "100%",
    },
    default: {
      gap: GAP,
      paddingBottom: 120,
      paddingHorizontal: 1,
    },
  }),
  cell: {
    width: ITEM,
    height: ITEM,
    position: "relative",
  },
  item: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.border,
  },
  playBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  playText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  // ── REELS/VIDEO TAB STYLES ──
  reelOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingBottom: 6,
    paddingTop: 20,
  },
  reelOverlayContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  reelViewsText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "700",
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,10,20,0.92)",
  },
  actionSheetCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,10,20,0.92)",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  modalMessage: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalPrimaryBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryText: {
    color: "#0b0616",
    fontWeight: "900",
    fontSize: 14,
  },
  sheetAction: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  sheetActionText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center",
  },
  sheetCancel: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  sheetCancelText: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center",
  },

  // Web-only comments overlay (used while fullscreen viewer is temporarily closed)
  webOverlay: {
    position: "fixed" as any,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    justifyContent: "center",
    alignItems: "center",
  },
  webOverlayBg: {
    position: "absolute" as any,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  webCard: {
    width: "85%" as any,
    maxWidth: 680,
    height: "72%" as any,
    maxHeight: 640,
    borderWidth: 1,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(10,10,16,0.92)",
    backdropFilter: "blur(12px)" as any,
  },
  webCardHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  webCardTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  webCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  webCloseText: {
    fontSize: 26,
    fontWeight: "900",
    marginTop: -2,
  },
  webCardBody: {
    flex: 1,
  },
  webCardBodyContent: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  webHint: {
    fontSize: 14,
    fontWeight: "700",
    opacity: 0.9,
  },
  webCommentRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  webCommentUser: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 6,
  },
  webCommentText: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  webDeleteBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,80,80,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.35)",
  },
  webDeleteText: {
    color: "rgba(255,120,120,0.95)",
    fontWeight: "900",
    fontSize: 13,
  },
  webComposer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  webInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  webSendBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "rgba(140,100,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  webSendText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },

  // ── SETTINGS STYLES ──
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  settingsBackBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsBackIcon: {
    fontSize: 24,
    fontWeight: "700",
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: "800",
    flex: 1,
    textAlign: "center",
  },
  settingsSearchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  settingsSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  settingsSearchIcon: {
    fontSize: 14,
  },
  settingsSearchPlaceholder: {
    fontSize: 15,
    fontWeight: "500",
  },
  settingsScroll: {
    paddingBottom: 40,
  },
  settingsSection: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  settingsSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 16,
    letterSpacing: 0.3,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 14,
  },
  settingsRowIcon: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
  },
  settingsRowLabel: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  settingsRowChevron: {
    fontSize: 22,
    fontWeight: "300",
  },

  // ── EDIT PROFILE PREMIUM STYLES ──
  editSaveHeaderBtn: {
    width: 60,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  editSaveHeaderText: {
    fontSize: 15,
    fontWeight: "700",
  },
  editPremiumScroll: {
    paddingBottom: 40,
  },
  editAvatarSection: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 10,
  },
  editAvatarBtn: {
    width: 96,
    height: 96,
    borderRadius: 999,
    overflow: "hidden",
  },
  editAvatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  editAvatarLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  editFieldsWrap: {
    paddingHorizontal: 16,
    gap: 12,
  },
  editFieldBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  editFieldInput: {
    fontSize: 15,
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  editFieldHint: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
    lineHeight: 16,
  },
  editGenderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  editGenderPill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editGenderText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // ── COMMITTED BADGE ──
  committedBadgeRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  committedBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  committedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c084fc",
  },
  // ── SETTINGS SUB-SCREEN ──
  subScreenContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  subScreenEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  subScreenTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  subScreenDesc: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
});
