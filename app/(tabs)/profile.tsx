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
  PanResponder,
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
import ThemeSelector from "@/components/ThemeSelector";
import { useTheme } from "@/contexts/ThemeContext";
import { ConversationType, getOrCreateConversation } from "@/lib/conversations";
import {
  BADGE_CONFIG,
  type Badge,
  type BoostInfo,
  LEVEL_CONFIG,
  type ProfileViewStats,
  type UserLevelInfo,
  activateBoost,
  getActiveBoost,
  getProfileViewStats,
  getUserLevelAndBadges,
  getXpProgress,
  registerProfileView
} from "@/lib/engagement";
import {
  type Highlight,
  fetchHighlightItems,
  fetchPostViewCounts,
  fetchUserHighlights
} from "@/lib/profileHighlights";
import { setFollowInterestType } from "@/lib/social";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";

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

  const swipeThreshold = 60;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const { dx } = gestureState;
        if (dx > swipeThreshold) {
          if (!isDesktopWeb) {
            router.replace("/(tabs)/search");
          }
        }
      },
    }),
  ).current;

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

  const isOwnProfile = !!authUserId && userId === authUserId;
  const isViewingOther = !!routeUserId && routeUserId !== authUserId;

  const bioTags = extractTagsFromBio(bio);

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
    if (boostLoading || boostInfo) return;
    try {
      setBoostLoading(true);
      const result = await activateBoost("standard", 60);
      if (result) {
        setBoostInfo({
          user_id: authUserId || "",
          boost_type: "standard",
          started_at: new Date().toISOString(),
          expires_at: result.expires_at,
          seconds_remaining: 3600,
        });
        Alert.alert("🔥 Boost ativado!", "Seu perfil ficará em destaque por 1 hora.");
      }
    } catch (err: any) {
      if (err?.message?.includes("BOOST_ALREADY_ACTIVE")) {
        Alert.alert("Boost ativo", "Você já tem um boost rodando!");
      } else {
        Alert.alert("Erro", "Não foi possível ativar o boost.");
      }
    } finally {
      setBoostLoading(false);
    }
  }, [boostLoading, boostInfo, authUserId]);

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
        const [lvl, pvs, boost] = await Promise.all([
          getUserLevelAndBadges(targetUserId),
          getProfileViewStats(targetUserId),
          getActiveBoost(targetUserId),
        ]);
        setLevelInfo(lvl);
        setProfileViewStats(pvs);
        setBoostInfo(boost);
      } catch {
        setLevelInfo(null);
        setProfileViewStats(null);
        setBoostInfo(null);
      }

      // Register profile view if viewing someone else's profile
      if (u.id && targetUserId !== u.id) {
        registerProfileView(targetUserId).catch(() => {});
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

  const renderItem = useCallback(
    ({ item, index }: { item: UiPost; index: number }) => {
      const isVideo = item.media_type === "video";
      const hasThumb = (item as any)._hasThumb !== false;

      return (
        <TouchableOpacity style={styles.cell} activeOpacity={0.8} onPress={() => openPostFromGrid(index)}>
          {isVideo && !hasThumb ? (
            // Video without thumbnail — show gradient placeholder with play icon
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
        </TouchableOpacity>
      );
    },
    [openPostFromGrid, theme],
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
    // duração opcional; se quiser customizar no futuro, basta adicionar em cada row
    duration: undefined,
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

              <TouchableOpacity style={[styles.actionButton, { borderColor: theme.colors.border }]} activeOpacity={0.8}>
                <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>{t("profile.showMyId")}</Text>
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
            {/* Profile views mini stat */}
            {profileViewStats && (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <Text style={{ fontSize: 14, marginRight: 4 }}>👀</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                  {profileViewStats.views_24h} visitas hoje · {profileViewStats.views_7d} esta semana
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── BOOST BUTTON ── */}
        {isOwnProfile && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={boostInfo ? undefined : handleActivateBoost}
            disabled={boostLoading}
            style={{
              marginHorizontal: 16, marginBottom: 12, borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={boostInfo ? ["#F59E0B", "#EF4444"] : ["#8B5CF6", "#EC4899"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: 12, paddingHorizontal: 16,
                alignItems: "center", justifyContent: "center",
                flexDirection: "row",
              }}
            >
              {boostLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : boostInfo ? (
                <>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                    🔥 Boost ativo — {boostCountdown || "..."}
                  </Text>
                </>
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  🔥 Destacar meu perfil
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
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
    <SafeAreaView
      {...(!isDesktopWeb ? (panResponder as any).panHandlers : {})}
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
        </>
      )}
    </SafeAreaView>
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
