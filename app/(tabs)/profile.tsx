// app/(tabs)/profile.tsx
import StoryViewer, { type StoryItem } from "@/components/StoryViewer";
import Colors from "@/constants/Colors";
import { uploadStory } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
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
  Alert,
  Dimensions,
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
  View,
} from "react-native";

import CommentsSheet from "@/components/CommentsSheet";
import FollowModal from "@/components/FollowModal";
import FullscreenViewer, { ViewerItem } from "@/components/FullscreenViewer";
import PeopleListSheet from "@/components/PeopleListSheet";
import ThemeSelector from "@/components/ThemeSelector";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ConversationType,
  getOrCreateConversation,
} from "@/lib/conversations";
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

type InterestType = "friend" | "crush" | "silent_crush";
type RelationshipStatus = "single" | "committed" | "other";

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  relationship_status?: RelationshipStatus | null;
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

function GradientButton({
  title,
  onPress,
  disabled,
  style,
}: GradientButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={style}
    >
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
  const signed = await supabase.storage
    .from("posts")
    .createSignedUrl(path, 60 * 60);
  if (!signed.error && signed.data?.signedUrl) {
    const url = signed.data.signedUrl;
    ExpoImage.prefetch(url).catch(() => {});
    return url;
  }
  const pub = supabase.storage.from("posts").getPublicUrl(path);
  const url = pub.data.publicUrl;
  ExpoImage.prefetch(url).catch(() => {});
  return url;
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
  return p.media_type === "video" && p.thumbnail_path
    ? p.thumbnail_path
    : p.image_path;
}

export default function Profile() {
const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const { theme } = useTheme();

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
    })
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

  const [editing, setEditing] = useState(false);

  const [posts, setPosts] = useState<UiPost[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<"grid" | "reels" | "tagged">(
    "grid"
  );

  const [loadingHeader, setLoadingHeader] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [highlightCover, setHighlightCover] = useState<string | null>(null);

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

  const [relationshipStatus, setRelationshipStatus] =
    useState<RelationshipStatus | null>(null);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);

  const [currentInterestType, setCurrentInterestType] =
    useState<InterestType | null>(null);
  const [theirInterestType, setTheirInterestType] =
    useState<InterestType | null>(null);

  const [isFollowModalVisible, setFollowModalVisible] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const [silentModalVisible, setSilentModalVisible] = useState(false);
  const [silentModalTitle, setSilentModalTitle] = useState("");
  const [silentModalMessage, setSilentModalMessage] = useState("");

  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false);

  const [peopleSheetVisible, setPeopleSheetVisible] = useState(false);
  const [peopleSheetMode, setPeopleSheetMode] =
    useState<"followers" | "following" | "interested">("followers");

  const isOwnProfile = !!authUserId && userId === authUserId;
  const isViewingOther = !!routeUserId && routeUserId !== authUserId;

  const bioTags = extractTagsFromBio(bio);

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
            const { data: publicData } = supabase.storage
              .from("stories")
              .getPublicUrl(row.media_path as string);
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
        (!routeUserId &&
          (u.user_metadata?.username ||
            (u.email ? u.email.split("@")[0] : "Me"))) ||
        "user";

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
        } else {
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
        setCurrentInterestType(null);
        setTheirInterestType(null);
      }

      await loadStories(targetUserId);
    } finally {
      setLoadingHeader(false);
    }
  }, [router, routeUserId, loadStories]);

  const fetchCountsBulk = useCallback(async (ids: number[]) => {
    if (!ids.length) return {};
    const { data, error } = await supabase
      .from("post_counts")
      .select("*")
      .in("post_id", ids);

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

        const { data: rows, error, count } = await supabase
          .from("posts_view")
          .select("*", { count: "exact" })
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
            } as UiPost;
          })
        );

        setPosts((prev) => (reset ? mapped : [...prev, ...mapped]));

        const ids = mapped.map((p) => p.id);
        if (ids.length) {
          try {
            const bulk = await fetchCountsBulk(ids);
            setCounts((prev) => {
              const base = reset
                ? ({} as Record<number, Counter>)
                : { ...prev };
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
        Alert.alert("Erro ao carregar posts", e?.message ?? "Tente novamente.");
      } finally {
        loadingRef.current = false;
        setLoadingPosts(false);
        setRefreshing(false);
      }
    },
    [userId, fetchCountsBulk]
  );

const handleChangeAvatar = useCallback(async () => {
  if (!userId || !isOwnProfile) return;

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permissão necessária",
      "Precisamos de acesso às suas fotos para alterar o avatar."
    );
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

      const binaryString =
        (global as any).atob ? (global as any).atob(base64) : atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      uploadBody = bytes.buffer;
    }

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, uploadBody, {
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
    Alert.alert("Erro ao atualizar foto", e?.message ?? String(e));
  }
}, [userId, isOwnProfile]);

  const handlePickHighlight = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permissão necessária",
        "Precisamos de acesso às suas fotos para criar destaques."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setHighlightCover(asset.uri);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!userId || !isOwnProfile) return;
    if (!draftUsername.trim()) {
      Alert.alert("Username obrigatório", "Defina um username.");
      return;
    }

    try {
      setSavingProfile(true);
      const usernameClean = draftUsername.trim();
      const fullNameClean = draftFullName.trim();
      const bioClean = draftBio.trim();

      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            username: usernameClean,
            full_name: fullNameClean || null,
            bio: bioClean || null,
            avatar_url: avatarUrl,
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();

      if (error) throw error;

      const r = data as ProfileRow;
      setProfileRow(r);
      setUsername(usernameClean);
      setFullName(fullNameClean);
      setBio(bioClean);
      setEditing(false);
      Alert.alert("Perfil atualizado", "Seu perfil foi salvo com sucesso.");
    } catch (e: any) {
      Alert.alert("Erro ao atualizar perfil", e?.message ?? String(e));
    } finally {
      setSavingProfile(false);
    }
  }, [
    userId,
    draftUsername,
    draftFullName,
    draftBio,
    avatarUrl,
    isOwnProfile,
  ]);

  const signOut = useCallback(async () => {
    try {
      try {
        supabase
          .getChannels()
          .forEach((ch: RealtimeChannel) => supabase.removeChannel(ch));
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
          const { error: insErr } = await supabase
            .from("likes")
            .insert({ post_id: postId, user_id: u.user.id });
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
    [counts]
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
    [IS_WEB, viewerOpen, viewerIndex]
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
          Alert.alert(
            "Apagar postagem",
            "Essa ação é permanente. Quer apagar esta postagem?",
            [
              { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
              { text: "Apagar", style: "destructive", onPress: () => resolve(true) },
            ]
          );
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
        const { error } = await supabase
          .from("posts")
          .delete()
          .eq("id", postId)
          .eq("user_id", authUserId);

        if (error) {
          Alert.alert("Erro", error.message || "Não foi possível apagar a postagem.");
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
    [authUserId, posts]
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
      Alert.alert("Erro ao enviar story", e?.message ?? e?.message ?? String(e));
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
      Alert.alert(
        "Erro ao deixar de seguir",
        e?.message ?? "Não foi possível deixar de seguir."
      );
    } finally {
      setLoadingFollow(false);
    }
  }, [authUserId, userId, currentInterestType]);

  const handleSelectInterest = useCallback(
    async (interestType: InterestType) => {
      if (!authUserId || !userId || authUserId === userId) return;
      try {
        setLoadingFollow(true);

        const { data, error } = await supabase
          .from("follows")
          .upsert(
            {
              follower_id: authUserId,
              following_id: userId,
              interest_type: interestType,
            },
            { onConflict: "follower_id,following_id" }
          )
          .select("interest_type")
          .single();

        if (error) throw error;

        const fr = data as { interest_type: InterestType };
        setCurrentInterestType(fr.interest_type);
        setFollowModalVisible(false);

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

        if (interestType === "silent_crush") {
          setSilentModalTitle("Shhh…");
          setSilentModalMessage(
            "Crush silencioso enviado. Se for recíproco, a faísca aparece 😉"
          );
          setSilentModalVisible(true);

          try {
            const { data: reciprocal, error: reciprocalErr } = await supabase
              .from("follows")
              .select("id")
              .eq("follower_id", userId)
              .eq("following_id", authUserId)
              .eq("interest_type", "silent_crush")
              .maybeSingle();

            if (!reciprocalErr && reciprocal) {
              setSilentModalTitle("✨ SPARK!");
              setSilentModalMessage(
                "A faísca bateu — vocês se escolheram no silencioso. Que comecem os papos."
              );
              setSilentModalVisible(true);
            }
          } catch {}
        }
      } catch (e: any) {
        Alert.alert(
          "Erro ao seguir",
          e?.message ?? "Não foi possível salvar sua escolha."
        );
      } finally {
        setLoadingFollow(false);
      }
    },
    [authUserId, userId]
  );

  const openPeopleSheet = useCallback(
    (mode: "followers" | "following" | "interested") => {
      if (!userId) return;

      if (mode === "interested" && !isOwnProfile) {
        Alert.alert(
          "Área reservada",
          "Só o dono do perfil pode ver quem está interessado 😉"
        );
        return;
      }

      setPeopleSheetMode(mode);
      setPeopleSheetVisible(true);
    },
    [userId, isOwnProfile]
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
    [authUserId, router]
  );

  const isMutualFriend =
    currentInterestType === "friend" && theirInterestType === "friend";

  const isCrushMatch =
    (currentInterestType === "crush" ||
      currentInterestType === "silent_crush") &&
    (theirInterestType === "crush" || theirInterestType === "silent_crush");

  const canOpenConversation = isMutualFriend || isCrushMatch;

  const openConversation = useCallback(
    async (conversationType: ConversationType) => {
      if (!authUserId || !userId) return;
      try {
        const conversation = await getOrCreateConversation({
          currentUserId: authUserId,
          otherUserId: userId,
          conversationType,
        });

        router.push({
          pathname: "/conversations/[id]",
          params: { id: conversation.id, type: conversationType },
        });
      } catch (e: any) {
        Alert.alert(
          "Erro ao abrir conversa",
          e?.message ?? "Não foi possível abrir a conversa."
        );
      }
    },
    [authUserId, userId, router]
  );

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (userId) {
      setRefreshing(true);
      loadPage({ reset: true });
      loadStories(userId);
    }
  }, [userId, loadPage, loadStories]);

  const renderItem = useCallback(
    ({ item, index }: { item: UiPost; index: number }) => (
      <TouchableOpacity
        style={styles.cell}
        activeOpacity={0.8}
        onPress={() => openPostFromGrid(index)}
      >
        <ExpoImage
          source={{ uri: item.image_url }}
          style={styles.item}
          contentFit="cover"
          cachePolicy="disk"
        />
        {item.media_type === "video" && (
          <View style={styles.playBadge}>
            <Text style={styles.playText}>▶︎</Text>
          </View>
        )}
      </TouchableOpacity>
    ),
    [openPostFromGrid]
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
  const reelsPosts = posts.filter((p) => p.media_type === "video");
  const taggedPosts: UiPost[] = [];
  const currentPosts =
    activeTab === "grid"
      ? gridPosts
      : activeTab === "reels"
      ? reelsPosts
      : taggedPosts;

  const viewerItems: ViewerItem[] = currentPosts.map((p) => {
    const mediaUrlCandidate = p.media_url || p.image_url;
    const imageUrlCandidate = p.image_url || p.media_url;

    const urlToCheck = (mediaUrlCandidate || imageUrlCandidate || "").toLowerCase();
    const looksLikeVideo =
      p.media_type === "video" ||
      urlToCheck.includes(".mp4") ||
      urlToCheck.includes("video%2F");

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

  if (editing) {
    return (
      <SafeAreaView
        {...(!isDesktopWeb ? (panResponder as any).panHandlers : {})}
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
      >
        <ScrollView contentContainerStyle={styles.editScrollContent}>
          <View style={styles.mainColumn}>
            <View style={styles.topBar}>
              <TouchableOpacity
                onPress={() => {
                  setDraftUsername(username);
                  setDraftFullName(fullName);
                  setDraftBio(bio);
                  setEditing(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.topIcon, { color: theme.colors.text }]}>
                  ←
                </Text>
              </TouchableOpacity>
              <View style={styles.topCenter}>
                <Text
                  style={[styles.topUsername, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  Ajustar vibe
                </Text>
              </View>
              <View style={styles.topActions}>
                {isOwnProfile && (
                  <TouchableOpacity
                    onPress={() => setLogoutSheetVisible(true)}
                    activeOpacity={0.8}
                    style={styles.logoutButton}
                  >
                    <Text
                      style={[
                        styles.logoutIcon,
                        { color: theme.colors.text },
                      ]}
                    >
                      ⎋
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.header}>
  <TouchableOpacity
    style={styles.avatarWrapper}
    onPress={() => {
      const hasStories = stories.length > 0;
      if (hasStories) {
        openStory(0);
      } else if (isOwnProfile) {
        handleChangeAvatar();
      }
    }}
    onLongPress={isOwnProfile ? handleChangeAvatar : undefined}
    activeOpacity={0.8}
  >
    {avatarUrl ? (
      <ExpoImage
        source={{ uri: avatarUrl }}
        style={styles.avatar}
        contentFit="cover"
        cachePolicy="disk"
      />
    ) : (
      <LinearGradient
        colors={[Colors.brandStart, Colors.brandEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatar}
      >
        <Text style={styles.avatarInitials}>
          {username?.[0]?.toUpperCase() || "L"}
        </Text>
      </LinearGradient>
    )}
  </TouchableOpacity>

              <View style={[styles.statsRow, isMobileLayout && styles.statsRowMobile]}>
                <View style={styles.statItem}>
                  <Text
                    style={[styles.statNumber, { color: theme.colors.text }]}
                  >
                    {postsCount}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Drops
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text
                    style={[styles.statNumber, { color: theme.colors.text }]}
                  >
                    {followersCount}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Conexões
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text
                    style={[styles.statNumber, { color: theme.colors.text }]}
                  >
                    {followingCount}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Círculos
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text
                    style={[styles.statNumber, { color: theme.colors.text }]}
                  >
                    {interestedCount}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Sparks
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.bioSection}>
              {fullName ? (
                <Text style={[styles.fullName, { color: theme.colors.text }, isMobileLayout && { textAlign: "center" }]}>
                  {fullName}
                </Text>
              ) : null}
              {bio ? (
                <Text style={[styles.bioText, { color: theme.colors.text }, isMobileLayout && { textAlign: "center" }]}>
                  {bio}
                </Text>
              ) : authEmail && isOwnProfile ? (
                <Text
                  style={[
                    styles.bioPlaceholder,
                    { color: theme.colors.textMuted },
                    Platform.OS !== "web" && { textAlign: "center" },
                  ]}
                >
                  {authEmail}
                </Text>
              ) : null}
            </View>

            <View
              style={[
                styles.editCard,
                { marginTop: 12, backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={[styles.editTitle, { color: theme.colors.text }]}>
                Ajustar vibe
              </Text>

              <Text
                style={[styles.editLabel, { color: theme.colors.textMuted }]}
              >
                Username
              </Text>
              <TextInput
                value={draftUsername}
                onChangeText={setDraftUsername}
                placeholder="username"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                style={[
                  styles.editInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}
              />

              <Text
                style={[styles.editLabel, { color: theme.colors.textMuted }]}
              >
                Nome
              </Text>
              <TextInput
                value={draftFullName}
                onChangeText={setDraftFullName}
                placeholder="Seu nome"
                placeholderTextColor={Colors.textMuted}
                style={[
                  styles.editInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}
              />

              <Text
                style={[styles.editLabel, { color: theme.colors.textMuted }]}
              >
                Bio
              </Text>
              <TextInput
                value={draftBio}
                onChangeText={setDraftBio}
                placeholder="Fale um pouco sobre você"
                placeholderTextColor={Colors.textMuted}
                multiline
                style={[
                  styles.editInput,
                  styles.editInputMultiline,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}
              />


              <Text
                style={[styles.editLabel, { color: theme.colors.textMuted }]}
              >
                Estilo visual
              </Text>
              <View style={styles.editThemeBox}>
                <ThemeSelector />
              </View>


              <View style={styles.editButtonsRow}>
                <TouchableOpacity
                  style={[
                    styles.editButton,
                    styles.editCancelButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.background,
                    },
                  ]}
                  onPress={() => {
                    setDraftUsername(username);
                    setDraftFullName(fullName);
                    setDraftBio(bio);
                    setEditing(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.editCancelText,
                      { color: theme.colors.text },
                    ]}
                  >
                    Cancelar
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.editButton, styles.editSaveButton]}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                  activeOpacity={0.8}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.editSaveText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const ListHeader = () => {
    const followLabel =
      currentInterestType === "friend"
        ? "Amigos"
        : currentInterestType === "crush"
        ? "Crush"
        : currentInterestType === "silent_crush"
        ? "Crush silencioso"
        : "Conectar";

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
              <Text style={[styles.topIcon, { color: theme.colors.text }]}>
                ←
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={isOwnProfile ? 0.8 : 1}
              onPress={isOwnProfile ? handleAddStory : undefined}
            >
              <Text style={[styles.topIcon, { color: theme.colors.text }]}>
                ＋
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.topCenter}>
            <Text
              style={[styles.topUsername, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {username}
            </Text>
            <Text style={[styles.topChevron, { color: theme.colors.text }]}>
              ▾
            </Text>
          </View>
          <View style={styles.topActions}>
            <Text style={[styles.topIcon, { color: theme.colors.text }]}>
              ◎
            </Text>
            {isOwnProfile && (
              <TouchableOpacity
                onPress={() => setLogoutSheetVisible(true)}
                activeOpacity={0.8}
                style={[
                  styles.logoutButton,
                  { borderColor: theme.colors.border },
                ]}
              >
                <Text
                  style={[styles.logoutIcon, { color: theme.colors.text }]}
                >
                  ⎋
                </Text>
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
                    <Text style={styles.avatarInitials}>
                      {username?.[0]?.toUpperCase() || "L"}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            ) : avatarUrl ? (
              <ExpoImage
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <LinearGradient
                colors={[Colors.brandStart, Colors.brandEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarInitials}>
                  {username?.[0]?.toUpperCase() || "L"}
                </Text>
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
                  <Text
                    style={[
                      styles.tagText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    #{t}
                  </Text>
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
                  <Text
                    style={[
                      styles.tagText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    #{t}
                  </Text>
                </View>
              ))}
            </View>
          )}


          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>
                {postsCount}
              </Text>
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Drops
              </Text>
            </View>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.8}
              onPress={() => openPeopleSheet("followers")}
            >
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>
                {followersCount}
              </Text>
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Conexões
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.8}
              onPress={() => openPeopleSheet("following")}
            >
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>
                {followingCount}
              </Text>
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Círculos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.8}
              onPress={() => openPeopleSheet("interested")}
            >
              <Text style={[styles.statNumber, { color: theme.colors.text }]}>
                {interestedCount}
              </Text>
              <Text
                style={[styles.statLabel, { color: theme.colors.textMuted }]}
              >
                Sparks
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.bioSection, isMobileLayout && styles.bioSectionMobile]}>
          {fullName ? (
            <Text style={[styles.fullName, { color: theme.colors.text }]}>
              {fullName}
            </Text>
          ) : null}
          {bio ? (
            <Text style={[styles.bioText, { color: theme.colors.text }]}>
              {bio}
            </Text>
          ) : authEmail && isOwnProfile ? (
            <Text
              style={[
                styles.bioPlaceholder,
                { color: theme.colors.textMuted },
              ]}
            >
              {authEmail}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          {isOwnProfile ? (
            <>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { borderColor: theme.colors.border },
                  !isOwnProfile && { opacity: 0.5 },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  if (isOwnProfile) setEditing(true);
                }}
                disabled={!isOwnProfile}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  Ajustar vibe
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { borderColor: theme.colors.border },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  Mostrar meu ID
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallActionButton,
                  { borderColor: theme.colors.border },
                ]}
                activeOpacity={0.8}
                onPress={isOwnProfile ? handleAddStory : undefined}
              >
                <Text
                  style={[
                    styles.smallActionButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  ＋
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { borderColor: theme.colors.border },
                ]}
                activeOpacity={0.8}
                onPress={handleToggleFollowButton}
                disabled={loadingFollow}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  {loadingFollow ? "Carregando..." : followLabel}
                </Text>
              </TouchableOpacity>

              {canOpenConversation && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { borderColor: theme.colors.border },
                  ]}
                  activeOpacity={0.8}
                  onPress={() =>
                    openConversation(
                      hasCrushConversation ? "crush" : ("friend" as ConversationType)
                    )
                  }
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { color: theme.colors.text },
                    ]}
                  >
                    {hasCrushConversation ? "Mensagem" : "Mensagem"}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { borderColor: theme.colors.border },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: theme.colors.text },
                  ]}
                >
                  Mostrar meu ID
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <View
          style={[
            styles.panelCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={[styles.panelTitle, { color: theme.colors.text }]}>
            "Radar"
          </Text>
          <Text
            style={[
              styles.panelSubtitle,
              { color: theme.colors.textMuted },
            ]}
          >
            Insights e desempenho em breve aqui.
          </Text>
        </View>

        <View style={styles.highlightsRow}>
          <TouchableOpacity
            style={styles.highlightItem}
            onPress={handlePickHighlight}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.highlightCircle,
                { borderColor: theme.colors.border },
              ]}
            >
              {highlightCover ? (
                <ExpoImage
                  source={{ uri: highlightCover }}
                  style={styles.highlightImage}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <Text
                  style={[styles.highlightPlus, { color: theme.colors.text }]}
                >
                  ＋
                </Text>
              )}
            </View>
            <Text
              style={[styles.highlightLabel, { color: theme.colors.text }]}
            >
              Novo
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.tabsRow,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === "grid" && styles.tabItemActive,
            ]}
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
            style={[
              styles.tabItem,
              activeTab === "reels" && styles.tabItemActive,
            ]}
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
            style={[
              styles.tabItem,
              activeTab === "tagged" && styles.tabItemActive,
            ]}
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
        <View
          style={[
            styles.center,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <ActivityIndicator />
          <Text
            style={[styles.loadingText, { color: theme.colors.textMuted }]}
          >
            Carregando perfil…
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={currentPosts}
            keyExtractor={(it) => String(it.id)}
            numColumns={3}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
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
                        ? "Você ainda não publicou nenhum vídeo."
                        : "Você ainda não publicou nada."
                      : "Nenhuma publicação ainda."}
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

          {!IS_WEB && (
            <CommentsSheet visible={commentsOpen} postId={commentsPostId} onClose={closeComments} />
          )}

          {IS_WEB && commentsOpen && commentsPostId != null && (
            <View style={styles.webOverlay}>
              <Pressable style={styles.webOverlayBg} onPress={closeComments} />
              <View style={[styles.webCard, { borderColor: theme.colors.border }]}>
                <View style={styles.webCardHeader}>
                  <Text style={[styles.webCardTitle, { color: theme.colors.text }]}>Comentários</Text>
                  <TouchableOpacity onPress={closeComments} style={[styles.webCloseBtn, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.webCloseText, { color: theme.colors.text }]}>×</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.webCardBody} contentContainerStyle={styles.webCardBodyContent}>
                  {webCommentsLoading ? (
                    <Text style={[styles.webHint, { color: theme.colors.textMuted }]}>Carregando...</Text>
                  ) : webComments.length === 0 ? (
                    <Text style={[styles.webHint, { color: theme.colors.textMuted }]}>Seja o primeiro a comentar.</Text>
                  ) : (
                    webComments.map((c: any) => (
                      <View key={String(c.id)} style={[styles.webCommentRow, { borderColor: theme.colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.webCommentUser, { color: theme.colors.text }]}>
                            {c?.profiles?.username || c?.profiles?.full_name || "usuário"}
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
                    placeholder="Adicionar comentário..."
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
                    <Text style={styles.webSendText}>Enviar</Text>
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
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setSilentModalVisible(false)}
            >
              <Pressable style={styles.modalCard} onPress={() => {}}>
                <Text style={styles.modalTitle}>{silentModalTitle}</Text>
                <Text style={styles.modalMessage}>{silentModalMessage}</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSilentModalVisible(false)}
                  style={[
                    styles.modalPrimaryBtn,
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text style={styles.modalPrimaryText}>Ok</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            transparent
            visible={logoutSheetVisible}
            animationType="fade"
            onRequestClose={() => setLogoutSheetVisible(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setLogoutSheetVisible(false)}
            >
              <Pressable style={styles.actionSheetCard} onPress={() => {}}>
                <Text style={styles.modalTitle}>Conta</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLogoutSheetVisible(false);
                    Alert.alert("Em breve", "Configurações estarão disponíveis.");
                  }}
                  style={[styles.sheetAction, { borderColor: theme.colors.border }]}
                >
                  <Text style={styles.sheetActionText}>Configurações</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLogoutSheetVisible(false);
                    Alert.alert("Em breve", "Troca de conta estará disponível.");
                  }}
                  style={[styles.sheetAction, { borderColor: theme.colors.border }]}
                >
                  <Text style={styles.sheetActionText}>Trocar conta</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLogoutSheetVisible(false);
                    signOut();
                  }}
                  style={[
                    styles.sheetAction,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <Text style={[styles.sheetActionText, { color: "#ff6b6b" }]}>
                    Sair
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setLogoutSheetVisible(false)}
                  style={[styles.sheetCancel, { borderColor: theme.colors.border }]}
                >
                  <Text style={styles.sheetCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          <FollowModal
            visible={isFollowModalVisible}
            onClose={() => setFollowModalVisible(false)}
            onSelect={handleSelectInterest}
            relationshipStatus={relationshipStatus || "single"}
            existingInterestType={currentInterestType}
            loading={loadingFollow}
          />

          <PeopleListSheet
            visible={peopleSheetVisible}
            mode={peopleSheetMode}
            profileId={userId ?? ""}
            isOwnProfile={isOwnProfile}
            onClose={() => setPeopleSheetVisible(false)}
            onOpenProfile={(targetId) => {
              setPeopleSheetVisible(false);
              handlePressUser(targetId);
            }}
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
    paddingTop: 8,
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
});
