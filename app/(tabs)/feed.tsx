import CommentsSheet from "@/components/CommentsSheet";
import FollowModal from "@/components/FollowModal";
import FullscreenViewer, { ViewerItem } from "@/components/FullscreenViewer";
import LikesSheet from "@/components/LikesSheet";
import { PostCard } from "@/components/PostCard";
import SkeletonPost from "@/components/SkeletonPost";
import { useTheme } from "@/contexts/ThemeContext";
import { getFollowState, setFollowInterestType, type InterestType } from "@/lib/social";
import { supabase } from "@/lib/supabase";
import { useIsMobileWeb } from "@/lib/useIsMobileWeb";
import { useIsFocused } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import StoriesBar, { StoryUser } from "@/components/StoriesBar";
import StoryViewer, { StoryItem } from "@/components/StoryViewer";
import SwipeableTabScreen from "@/components/SwipeableTabScreen";
import { Ionicons } from "@expo/vector-icons";

const POSTS_TABLE = "posts" as const;
const PAGE = 6;

type DbPost = {
  id: number | string;
  user_id: string;
  media_type: "image" | "video";
  image_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  created_at: string;
  profiles?: {
    username: string | null;
    avatar_url: string | null;
  } | null;
};

type UiPost = DbPost & {
  media_url: string;
  thumb_url: string | null;
  username?: string | null;
  avatar_url?: string | null;
  isBoosted?: boolean;
};

type Counter = {
  likes: number;
  comments: number;
  reposts: number;
  liked: boolean;
};

async function toSigned(path: string | null) {
  if (!path) return null;
  const signed = await supabase.storage
    .from("posts")
    .createSignedUrl(path, 60 * 60);

  let url: string;
  if (!signed.error && signed.data?.signedUrl) {
    url = signed.data.signedUrl;
  } else {
    url = supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;
  }
  ExpoImage.prefetch(url).catch(() => {});
  return url;
}

export default function Feed() {
  const { theme } = useTheme();
  const router = useRouter();
  const isFocused = useIsFocused();
  const isMobileWeb = useIsMobileWeb(900);
  const isDesktopWeb = Platform.OS === "web" && !isMobileWeb;

  const [posts, setPosts] = useState<UiPost[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [muted, setMuted] = useState(Platform.OS === "web");
  const [error, setError] = useState<string | null>(null);
  const [boostedPostIds, setBoostedPostIds] = useState<Set<number>>(new Set());

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | number | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [counts, setCounts] = useState<Record<string | number, Counter>>({});

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<number | null>(null);

  // Likes sheet
  const [likesSheetOpen, setLikesSheetOpen] = useState(false);
  const [likesSheetPostId, setLikesSheetPostId] = useState<number | string | null>(null);

  // Follow modal (from likes sheet "Conectar")
  const [followModalVisible, setFollowModalVisible] = useState(false);
  const [followModalTargetId, setFollowModalTargetId] = useState<string | null>(null);
  const [followModalLoading, setFollowModalLoading] = useState(false);
  const [followModalExisting, setFollowModalExisting] = useState<InterestType | null>(null);

  const resumeViewerAfterCommentsRef = useRef(false);
  const resumeViewerIndexRef = useRef(0);

  const [currentIndex, setCurrentIndex] = useState(0);

  // STORIES
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [storyViewerItems, setStoryViewerItems] = useState<StoryItem[]>([]);
  const [storyViewerStartIndex, setStoryViewerStartIndex] = useState(0);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([
    { id: "me", label: "Seu story", initials: "W", hasUnseen: true, isCurrentUser: true },
  ]);
  const [storiesByUser, setStoriesByUser] = useState<Record<string, StoryItem[]>>({});


  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    [authUserId]
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems?.length > 0) {
      const idx = viewableItems[0].index ?? 0;
      if (typeof idx === "number") setCurrentIndex(idx);
    }
  });

  const inflight = useRef<{ canceled?: boolean }>({ canceled: false });
  const pageRef = useRef(0);
  const loadingRef = useRef(false);

  const mapRows = useCallback(async (rows: DbPost[]) => {
    const promises = rows.map(async (p) => {
      const [media_url, thumb_url] = await Promise.all([
        toSigned(p.image_path),
        p.media_type === "video" ? toSigned(p.thumbnail_path) : Promise.resolve(null),
      ]);
      return {
        ...p,
        id: p.id,
        media_url: media_url!,
        thumb_url,
        username: p.profiles?.username || "user",
        avatar_url: p.profiles?.avatar_url ?? null,
      } as UiPost;
    });
    return Promise.all(promises);
  }, []);

  const fetchCountsBulk = useCallback(async (ids: (number | string)[]) => {
    if (!ids.length) return {};
    const { data, error: qErr } = await supabase
      .from("post_counts")
      .select("*")
      .in("post_id", ids.map((id) => id));

    if (qErr) throw qErr;

    const res: Record<string | number, Counter> = {};
    (data || []).forEach((r: any) => {
      const key: string | number = r.post_id;
      res[key] = {
        likes: r.likes_count ?? 0,
        comments: r.comments_count ?? 0,
        reposts: r.reposts_count ?? 0,
        liked: false, // será preenchido por fetchMyLikes
      };
    });
    return res;
  }, []);

  /**
   * ★ CORREÇÃO PRINCIPAL: buscar quais posts o usuário logado já curtiu
   */
  const fetchMyLikes = useCallback(async (ids: (number | string)[], userId: string) => {
    if (!ids.length || !userId) return new Set<string | number>();
    const { data } = await supabase
      .from("likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", ids);

    const set = new Set<string | number>();
    (data ?? []).forEach((r: any) => set.add(r.post_id));
    return set;
  }, []);

  const endGuard = useRef(false);
  const onEndReached = useCallback(() => {
    if (endGuard.current || !hasMore || loading) return;
    endGuard.current = true;
    loadPage().finally(() => {
      setTimeout(() => { endGuard.current = false; }, 300);
    });
  }, [hasMore, loading]);

  const loadPage = useCallback(
    async (opts?: { reset?: boolean }) => {
      const reset = !!opts?.reset;
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      if (reset) {
        setInitialLoading(true);
        pageRef.current = 0;
        setPage(0);
      }
      setError(null);

      try {
        const curPage = reset ? 0 : pageRef.current;
        const from = curPage * PAGE;
        const to = from + PAGE - 1;

        // Fetch boosted post IDs in parallel with posts (only on first page)
        const boostedPromise = reset || curPage === 0
          ? supabase.from("active_boosted_posts").select("post_id")
          : Promise.resolve({ data: null });

        const { data: rows, error: qErr, count } = await supabase
          .from(POSTS_TABLE)
          .select(
            `id, user_id, media_type, image_path, thumbnail_path, caption, width, height, duration, created_at,
            profiles ( username, avatar_url )`,
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range(from, to);

        if (qErr) throw qErr;

        // Process boosted posts
        const boostedResult = await boostedPromise;
        const currentBoosted = boostedResult.data
          ? new Set((boostedResult.data as any[]).map((r: any) => Number(r.post_id)))
          : boostedPostIds;

        if (boostedResult.data) {
          setBoostedPostIds(currentBoosted);
        }

        const mapped = await mapRows((rows ?? []) as DbPost[]);
        if (inflight.current.canceled) return;

        // Mark boosted posts
        mapped.forEach((p) => {
          p.isBoosted = currentBoosted.has(Number(p.id));
        });

        // Sort: boosted posts first (only on first page)
        if (reset || curPage === 0) {
          mapped.sort((a, b) => {
            if (a.isBoosted && !b.isBoosted) return -1;
            if (!a.isBoosted && b.isBoosted) return 1;
            return 0;
          });
        }

        setPosts((prev) => (reset ? mapped : [...prev, ...mapped]));

        const ids = mapped.map((p) => p.id);
        const bulk = await fetchCountsBulk(ids);
        if (inflight.current.canceled) return;

        // ★ Buscar likes do usuário logado
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        let myLikedSet = new Set<string | number>();
        if (uid) {
          myLikedSet = await fetchMyLikes(ids, uid);
        }

        setCounts((prev) => {
          const base = reset ? ({} as Record<string | number, Counter>) : { ...prev };
          for (const id of ids) {
            base[id] = {
              likes: bulk[id]?.likes ?? base[id]?.likes ?? 0,
              comments: bulk[id]?.comments ?? base[id]?.comments ?? 0,
              reposts: bulk[id]?.reposts ?? base[id]?.reposts ?? 0,
              liked: myLikedSet.has(id) || (base[id]?.liked ?? false),
            };
          }
          return base;
        });

        const total = count ?? 0;
        const reachedEnd = to >= total - 1 || mapped.length < PAGE;
        setHasMore(!reachedEnd);

        if (!reachedEnd) {
          const nextPage = curPage + 1;
          pageRef.current = nextPage;
          setPage(nextPage);
        }
      } catch (e: any) {
        if (!inflight.current.canceled) {
          setError(e?.message ?? "Failed to load feed.");
        }
      } finally {
        if (!inflight.current.canceled) {
          loadingRef.current = false;
          setLoading(false);
          setInitialLoading(false);
        }
      }
    },
    [mapRows, fetchCountsBulk, fetchMyLikes]
  );

  // ── Stories ──
  const loadStoriesFeed = useCallback(
    async (uid?: string) => {
      try {
        // Fetch current user's profile for avatar (always needed for "Seu story")
        let myAvatarUrl: string | undefined;
        let myUsername: string = "user";
        if (authUserId) {
          const { data: myProfile } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", authUserId)
            .maybeSingle();
          if (myProfile) {
            myUsername = myProfile.username ?? "user";
            let av = myProfile.avatar_url ?? null;
            if (av && !av.startsWith("http")) {
              const { data: pubData } = supabase.storage.from("avatars").getPublicUrl(av);
              av = pubData?.publicUrl ?? av;
            }
            myAvatarUrl = av ?? undefined;
          }
        }

        const { data: rows, error: storiesError } = await supabase
          .from("view_active_stories")
          .select("*")
          .order("created_at", { ascending: false });

        if (storiesError) return;
        if (!rows || rows.length === 0) {
          setStoriesByUser({});
          setStoryUsers([{
            id: authUserId ?? "me",
            label: "Seu story",
            initials: myUsername[0]?.toUpperCase() ?? "S",
            avatarUrl: myAvatarUrl,
            hasUnseen: true,
            isCurrentUser: true,
          }]);
          return;
        }

        const { data: metaRows } = await supabase.from("view_stories_bar").select("*");
        const metaByUserId: Record<string, any> = {};
        (metaRows ?? []).forEach((mr: any) => { metaByUserId[String(mr.user_id)] = mr; });

        const grouped: Record<string, StoryItem[]> = {};
        const usersMap: Record<string, StoryUser> = {};

        (rows as any[]).forEach((row) => {
          let url: string | null | undefined = row.media_url;
          if (!url && row.media_path) {
            const { data: publicData } = supabase.storage.from("stories").getPublicUrl(row.media_path as string);
            url = publicData?.publicUrl ?? "";
          }
          if (!url) return;

          // Resolve avatar URL if it's a storage path
          let avatarUrl: string | null = row.avatar_url ?? null;
          if (avatarUrl && !avatarUrl.startsWith("http")) {
            const { data: pubData } = supabase.storage.from("avatars").getPublicUrl(avatarUrl);
            avatarUrl = pubData?.publicUrl ?? avatarUrl;
          }

          const item: StoryItem = {
            id: row.id,
            media_type: row.media_type,
            media_url: url,
            duration: null,
            userName: row.username ?? "user",
            userAvatarUrl: avatarUrl,
            createdAt: row.created_at ?? null,
            user_id: row.user_id ?? null,
          };

          const userId = String(row.user_id);
          if (!grouped[userId]) grouped[userId] = [];
          grouped[userId].push(item);

          if (!usersMap[userId]) {
            const isMe = authUserId && userId === authUserId;
            const username: string = row.username ?? "user";
            const label = isMe ? "Seu story" : username;
            const initials = username?.[0]?.toUpperCase() ?? "S";
            // For current user, prefer the pre-fetched avatar
            let finalAvatarUrl: string | undefined;
            if (isMe && myAvatarUrl) {
              finalAvatarUrl = myAvatarUrl;
            } else {
              let barAvatarUrl: string | null = row.avatar_url ?? null;
              if (barAvatarUrl && !barAvatarUrl.startsWith("http")) {
                const { data: pubData } = supabase.storage.from("avatars").getPublicUrl(barAvatarUrl);
                barAvatarUrl = pubData?.publicUrl ?? barAvatarUrl;
              }
              finalAvatarUrl = barAvatarUrl ?? undefined;
            }
            const meta = metaByUserId[userId];
            const hasUnseen = meta?.has_unseen ?? true;
            const seen = meta?.seen ?? !hasUnseen;
            const isCurrentUser = meta?.is_current_user ?? !!isMe;

            usersMap[userId] = {
              id: userId, label, initials,
              avatarUrl: finalAvatarUrl,
              hasUnseen, seen, isCurrentUser,
            };
          }
        });

        const allUsers = Object.values(usersMap);
        const meUser = allUsers.find((u) => u.isCurrentUser);
        const otherUsers = allUsers.filter((u) => !u.isCurrentUser);
        setStoriesByUser(grouped);
        setStoryUsers(meUser ? [meUser, ...otherUsers] : otherUsers);
      } catch {}
    },
    [authUserId]
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }: any) => {
      if (!error && data?.user) setAuthUserId(data.user.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (authUserId) loadStoriesFeed();
  }, [authUserId, loadStoriesFeed]);

  useEffect(() => {
    inflight.current.canceled = false;
    loadPage({ reset: true });
    return () => { inflight.current.canceled = true; };
  }, [loadPage]);

  // Realtime likes/comments — also refetch likedByMe
  useEffect(() => {
    const ids = posts.map((p) => p.id);

    const refreshCounts = async () => {
      const bulk = await fetchCountsBulk(ids);
      let myLikedSet = new Set<string | number>();
      if (authUserId) {
        myLikedSet = await fetchMyLikes(ids, authUserId);
      }
      setCounts((prev) => ({
        ...prev,
        ...Object.fromEntries(
          ids.map((id) => [
            id,
            {
              likes: bulk[id]?.likes ?? prev[id]?.likes ?? 0,
              comments: bulk[id]?.comments ?? prev[id]?.comments ?? 0,
              reposts: bulk[id]?.reposts ?? prev[id]?.reposts ?? 0,
              liked: myLikedSet.has(id),
            },
          ])
        ),
      }));
    };

    const chLikes = supabase
      .channel("realtime:likes")
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, refreshCounts);

    const chComments = supabase
      .channel("realtime:comments")
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, refreshCounts);

    chLikes.subscribe();
    chComments.subscribe();

    return () => {
      supabase.removeChannel(chLikes);
      supabase.removeChannel(chComments);
    };
  }, [posts, fetchCountsBulk, fetchMyLikes, authUserId]);

  const toggleLike = useCallback(
    async (postId: number | string) => {
      const cur = counts[postId] ?? { likes: 0, comments: 0, reposts: 0, liked: false };
      const nextLiked = !cur.liked;
      const delta = nextLiked ? 1 : -1;

      // Optimistic
      setCounts((prev) => ({
        ...prev,
        [postId]: { ...cur, liked: nextLiked, likes: Math.max(0, cur.likes + delta) },
      }));

      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;

      try {
        if (nextLiked) {
          const { error: insErr } = await supabase
            .from("likes")
            .insert({ post_id: postId, user_id: u.user.id });
          if (insErr) throw insErr;

          // ── Push notification para o dono do post ──
          const post = posts.find((p) => p.id === postId);
          if (post && post.user_id !== u.user.id) {
            const myUsername = u.user.user_metadata?.username ?? "Alguém";
            supabase.functions.invoke("send-push", {
              body: {
                recipientId: post.user_id,
                title: "LUPYY",
                body: `${myUsername} curtiu sua publicação ❤️`,
                data: { type: "like", postId },
              },
            }).catch(() => {});
          }
        } else {
          const { error: delErr } = await supabase
            .from("likes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", u.user.id);
          if (delErr) throw delErr;
        }
      } catch {
        // Revert
        setCounts((prev) => ({ ...prev, [postId]: cur }));
      }
    },
    [counts, posts]
  );

  const openComments = useCallback(
    (postId: number) => {
      if (isDesktopWeb && viewerOpen) {
        resumeViewerAfterCommentsRef.current = true;
        resumeViewerIndexRef.current = viewerIndex;
        setViewerOpen(false);
        setTimeout(() => { setCommentsPostId(postId); setCommentsOpen(true); }, 30);
        return;
      }
      setCommentsPostId(postId);
      setCommentsOpen(true);
    },
    [viewerOpen, viewerIndex]
  );

  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setTimeout(() => {
      setCommentsPostId(null);
      if (isDesktopWeb && resumeViewerAfterCommentsRef.current) {
        resumeViewerAfterCommentsRef.current = false;
        setViewerIndex(resumeViewerIndexRef.current);
        setViewerOpen(true);
      }
    }, 30);
  }, []);

  // ── Likes sheet ──
  const openLikesSheet = useCallback((postId: number | string) => {
    setLikesSheetPostId(postId);
    setLikesSheetOpen(true);
  }, []);

  const closeLikesSheet = useCallback(() => {
    setLikesSheetOpen(false);
    setTimeout(() => setLikesSheetPostId(null), 200);
  }, []);

  // ── Follow modal from likes sheet ──
  const handleConnectFromLikes = useCallback(async (targetUserId: string) => {
    // Close likes sheet, open follow modal
    closeLikesSheet();
    setFollowModalTargetId(targetUserId);

    // Fetch existing follow state
    if (authUserId) {
      const state = await getFollowState(authUserId, targetUserId);
      setFollowModalExisting(state.interestType);
    }

    setFollowModalVisible(true);
  }, [authUserId, closeLikesSheet]);

  const handleFollowSelect = useCallback(async (interestType: InterestType) => {
    if (!authUserId || !followModalTargetId) return;
    setFollowModalLoading(true);
    try {
      await setFollowInterestType(authUserId, followModalTargetId, interestType);
      setFollowModalVisible(false);
    } catch {}
    setFollowModalLoading(false);
  }, [authUserId, followModalTargetId]);

  const viewerItems: ViewerItem[] = posts.map((p) => ({
    id: p.id,
    media_type: p.media_type,
    media_url: p.media_url,
    thumb_url: p.thumb_url ?? undefined,
    username: p.username ?? undefined,
    caption: p.caption ?? undefined,
    user_id: p.user_id ?? undefined,
    avatar_url: p.avatar_url ?? undefined,
  }));

  const videoAutoplayEnabled = isFocused && !viewerOpen && !storyViewerVisible;

  const sharePost = async (postId: number | string) => {
    try { await Share.share({ message: `Check out my post on Lupyy (id: ${postId})` }); } catch {}
  };

  const listContentStyle = isDesktopWeb ? styles.listContentWeb : styles.listContentMobile;

  const handlePressStory = useCallback(
    (user: StoryUser) => {
      const items = storiesByUser[String(user.id)];
      if (!items?.length) return;
      setStoryViewerItems(items);
      setStoryViewerStartIndex(0);
      setStoryViewerVisible(true);
    },
    [storiesByUser]
  );

  return (
    <SwipeableTabScreen
      leftTarget={{ route: "/capture", icon: "camera-outline", label: "Câmera", push: true }}
      rightTarget={{ route: "/(tabs)/tribes", icon: "people-outline", label: "Tribos" }}
    >
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "left", "right"]}
    >
      {!!error && (
        <View style={[styles.errorBar, { backgroundColor: theme.colors.danger ?? "#b00020" }]}>
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
        </View>
      )}

      <FlatList
        data={posts}
        keyExtractor={(it) => String(it.id)}
        ListHeaderComponent={
           <View>
            {!isDesktopWeb && (
              <View style={styles.topBar}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push("/capture")}
                >
                  <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.logoText, { color: theme.colors.text }]}>Lupyy</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push("/notifications")}
                >
                  <Ionicons name="heart-outline" size={26} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
            )}
            <StoriesBar data={storyUsers} onPressStory={handlePressStory} />
          </View>
        }
        renderItem={({ item, index }) => (
          <View>
            <PostCard
              id={item.id}
              media_type={item.media_type}
              media_url={item.media_url}
              thumb_url={item.thumb_url ?? undefined}
              username={item.username}
              created_at={item.created_at}
              caption={item.caption ?? undefined}
              avatarUrl={item.avatar_url ?? null}
              isVisible={videoAutoplayEnabled && index === currentIndex}
              muted={muted}
              likesCount={counts[item.id]?.likes ?? 0}
              commentsCount={counts[item.id]?.comments ?? 0}
              repostsCount={counts[item.id]?.reposts ?? 0}
              liked={!!counts[item.id]?.liked}
              isBoosted={item.isBoosted}
              onPressMedia={() => {
                setViewerIndex(index);
                setViewerPostId(item.id);
                setViewerOpen(true);
              }}
              onPressUser={() => {
                router.push({ pathname: "/profile", params: { userId: item.user_id } });
              }}
              onLike={() => toggleLike(item.id)}
              onComment={() => openComments(item.id as number)}
              onRepost={() => {}}
              onShare={() => sharePost(item.id)}
              onPressLikesCount={() => openLikesSheet(item.id)}
              onToggleMute={() => setMuted((m) => !m)}
            />
          </View>
        )}
        ListEmptyComponent={
          initialLoading ? (
            <View style={{ paddingTop: 8 }}>
              <SkeletonPost />
              <SkeletonPost />
              <SkeletonPost />
            </View>
          ) : null
        }
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfig}
        onEndReachedThreshold={0.35}
        onEndReached={onEndReached}
        removeClippedSubviews
        contentContainerStyle={listContentStyle}
        refreshControl={
          <RefreshControl
            refreshing={loading && page === 0}
            onRefresh={() => {
              loadPage({ reset: true });
              loadStoriesFeed();
            }}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
        ListFooterComponent={
          loading && page > 0 ? <ActivityIndicator style={{ margin: 16 }} /> : null
        }
      />

      <FullscreenViewer
        visible={viewerOpen}
        items={viewerItems}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
        getCounts={(id) => {
          const c = counts[id as number];
          return { likes: c?.likes ?? 0, comments: c?.comments ?? 0, reposts: c?.reposts ?? 0, liked: !!c?.liked };
        }}
        onLike={(id) => toggleLike(id)}
        onComment={(id) => openComments(id as number)}
        onRepost={() => {}}
        onShare={(id) => sharePost(id)}
      />

      <StoryViewer
        visible={storyViewerVisible}
        items={storyViewerItems}
        startIndex={storyViewerStartIndex}
        onClose={() => setStoryViewerVisible(false)}
        onPressUser={(userId) => {
          setStoryViewerVisible(false);
          router.push({ pathname: "/user/[id]", params: { id: userId } });
        }}
      />

      <CommentsSheet
        visible={commentsOpen}
        postId={commentsPostId}
        onClose={closeComments}
      />

      <LikesSheet
        visible={likesSheetOpen}
        postId={likesSheetPostId}
        onClose={closeLikesSheet}
        onConnect={handleConnectFromLikes}
      />

      <FollowModal
        visible={followModalVisible}
        onClose={() => setFollowModalVisible(false)}
        onSelect={handleFollowSelect}
        existingInterestType={followModalExisting}
        loading={followModalLoading}
      />
    </SafeAreaView>
    </SwipeableTabScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  logoText: { fontSize: 22, fontWeight: "800" },
  listContentWeb: { paddingTop: 6, paddingBottom: 24, alignItems: "center" },
  listContentMobile: { paddingTop: 6, paddingBottom: 24 },
  mute: {
    position: "absolute",
    top: 54, right: 12,
    borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  muteText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  errorBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    padding: 8, zIndex: 10,
  },
  errorText: { color: "white", fontWeight: "700" },
});
