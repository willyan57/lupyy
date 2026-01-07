import CommentsSheet from "@/components/CommentsSheet";
import FullscreenViewer, { ViewerItem } from "@/components/FullscreenViewer";
import { PostCard } from "@/components/PostCard";
import SkeletonPost from "@/components/SkeletonPost";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { useIsFocused } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  PanResponder,
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
};

type Counter = {
  likes: number;
  comments: number;
  reposts: number;
  liked?: boolean;
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

  const [posts, setPosts] = useState<UiPost[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | number | null>(
    null
  );
  const [viewerIndex, setViewerIndex] = useState(0);

  const [counts, setCounts] = useState<Record<string | number, Counter>>({});

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<number | null>(null);

  const resumeViewerAfterCommentsRef = useRef(false);
  const resumeViewerIndexRef = useRef(0);

  const [currentIndex, setCurrentIndex] = useState(0);

  // STORIES VIEWER
  const [authUserId, setAuthUserId] = useState<string | null>(null);

    const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [storyViewerItems, setStoryViewerItems] = useState<StoryItem[]>([]);
  const [storyViewerStartIndex, setStoryViewerStartIndex] = useState(0);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([
    { id: "me", label: "Seu story", initials: "W", hasUnseen: true, isCurrentUser: true },
  ]);
  const [storiesByUser, setStoriesByUser] = useState<Record<string, StoryItem[]>>({});

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
          if (Platform.OS !== "web") {
            router.push("/capture");
          }
        } else if (dx < -swipeThreshold) {
          if (Platform.OS !== "web") {
            router.replace("/(tabs)/tribes");
          }
        }
      },
    })
  ).current;

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    [authUserId]
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: any) => {
      if (viewableItems?.length > 0) {
        const idx = viewableItems[0].index ?? 0;
        if (typeof idx === "number") {
          setCurrentIndex(idx);
        }
      }
    }
  );

  const inflight = useRef<{ canceled?: boolean }>({ canceled: false });
  const pageRef = useRef(0);
  const loadingRef = useRef(false);

  const mapRows = useCallback(async (rows: DbPost[]) => {
    const promises = rows.map(async (p) => {
      const [media_url, thumb_url] = await Promise.all([
        toSigned(p.image_path),
        p.media_type === "video"
          ? toSigned(p.thumbnail_path)
          : Promise.resolve(null),
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
      .in(
        "post_id",
        ids.map((id) => id)
      );

    if (qErr) throw qErr;

    const res: Record<string | number, Counter> = {};
    (data || []).forEach((r: any) => {
      const key: string | number = r.post_id;
      res[key] = {
        likes: r.likes_count ?? 0,
        comments: r.comments_count ?? 0,
        reposts: r.reposts_count ?? 0,
      };
    });
    return res;
  }, []);

  const endGuard = useRef(false);
  const onEndReached = useCallback(() => {
    if (endGuard.current || !hasMore || loading) return;
    endGuard.current = true;
    loadPage().finally(() => {
      setTimeout(() => {
        endGuard.current = false;
      }, 300);
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

        const {
          data: rows,
          error: qErr,
          count,
        } = await supabase
          .from(POSTS_TABLE)
          .select(
            `
            id,
            user_id,
            media_type,
            image_path,
            thumbnail_path,
            caption,
            width,
            height,
            duration,
            created_at,
            profiles (
              username,
              avatar_url
            )
          `,
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range(from, to);

        if (qErr) throw qErr;

        const mapped = await mapRows((rows ?? []) as DbPost[]);
        if (inflight.current.canceled) return;

        setPosts((prev) => (reset ? mapped : [...prev, ...mapped]));

        const ids = mapped.map((p) => p.id);
        const bulk = await fetchCountsBulk(ids);
        if (inflight.current.canceled) return;

        setCounts((prev) => {
          const base = reset ? ({} as Record<string | number, Counter>) : {
              ...prev,
            };
          for (const id of ids) {
            base[id] = {
              likes: bulk[id]?.likes ?? base[id]?.likes ?? 0,
              comments: bulk[id]?.comments ?? base[id]?.comments ?? 0,
              reposts: bulk[id]?.reposts ?? base[id]?.reposts ?? 0,
              liked: base[id]?.liked ?? false,
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
    [mapRows, fetchCountsBulk]
  );
  
  const loadStoriesFeed = useCallback(
    async (uid?: string) => {
      try {
        const { data: rows, error: storiesError } = await supabase
          .from("view_active_stories")
          .select("*")
          .order("created_at", { ascending: false });

        if (storiesError) {
          console.log("loadStoriesFeed error details", storiesError);
          return;
        }

        if (!rows || rows.length === 0) {
          setStoriesByUser({});
          setStoryUsers([
            {
              id: "me",
              label: "Seu story",
              initials: "W",
              hasUnseen: true,
              isCurrentUser: true,
            },
          ]);
          return;
        }

        const grouped: Record<string, StoryItem[]> = {};
        const usersMap: Record<string, StoryUser> = {};

        (rows as any[]).forEach((row) => {
          let url: string | null | undefined = row.media_url;

          if (!url && row.media_path) {
            const { data: publicData } = supabase.storage
              .from("stories")
              .getPublicUrl(row.media_path as string);
            url = publicData?.publicUrl ?? "";
          }

          if (!url) return;

          const item: StoryItem = {
            id: row.id,
            media_type: row.media_type,
            media_url: url,
            duration: null,
          };

          const userId = String(row.user_id);
          if (!grouped[userId]) grouped[userId] = [];
          grouped[userId].push(item);

          if (!usersMap[userId]) {
            const isMe = authUserId && userId === authUserId;
            const username: string = row.username ?? "user";
            const label = isMe ? "Seu story" : username;
            const initials =
              username && username.length > 0
                ? username[0].toUpperCase()
                : "S";

            const avatarUrl: string | null = row.avatar_url ?? null;

            usersMap[userId] = {
              id: userId,
              label,
              initials,
              avatarUrl: avatarUrl ?? undefined,
              hasUnseen: true,
              isCurrentUser: !!isMe,
            };
          }
        });

        const allUsers = Object.values(usersMap);
        const meUser = allUsers.find((u) => u.isCurrentUser);
        const otherUsers = allUsers.filter((u) => !u.isCurrentUser);
        const orderedUsers = meUser ? [meUser, ...otherUsers] : otherUsers;

        setStoriesByUser(grouped);
        setStoryUsers(orderedUsers);
      } catch (e) {
        console.log("loadStoriesFeed error", e);
      }
    },
    [authUserId]
  );

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data, error }: { data: any; error: any }) => {
        if (!error && data?.user) {
          setAuthUserId(data.user.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authUserId) {
      loadStoriesFeed();
    }
  }, [authUserId, loadStoriesFeed]);

  useEffect(() => {
    inflight.current.canceled = false;
    loadPage({ reset: true });
    return () => {
      inflight.current.canceled = true;
    };
  }, [loadPage]);

  useEffect(() => {
    const ids = posts.map((p) => p.id);

    const refreshCounts = () =>
      fetchCountsBulk(ids).then((bulk) =>
        setCounts((prev) => ({
          ...prev,
          ...Object.fromEntries(
            ids.map((id) => [id, { ...prev[id], ...bulk[id] }])
          ),
        }))
      );

    const chLikes = supabase
      .channel("realtime:likes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "likes" },
        refreshCounts
      );

    const chComments = supabase
      .channel("realtime:comments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        refreshCounts
      );

    chLikes.subscribe();
    chComments.subscribe();

    return () => {
      supabase.removeChannel(chLikes);
      supabase.removeChannel(chComments);
    };
  }, [posts, fetchCountsBulk]);

  const toggleLike = useCallback(
    async (postId: number | string) => {
      const cur = counts[postId] ?? {
        likes: 0,
        comments: 0,
        reposts: 0,
        liked: false,
      };
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
      if (Platform.OS === "web" && viewerOpen) {
        resumeViewerAfterCommentsRef.current = true;
        resumeViewerIndexRef.current = viewerIndex;
        setViewerOpen(false);
        setTimeout(() => {
          setCommentsPostId(postId);
          setCommentsOpen(true);
        }, 30);
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
      if (Platform.OS === "web" && resumeViewerAfterCommentsRef.current) {
        resumeViewerAfterCommentsRef.current = false;
        setViewerIndex(resumeViewerIndexRef.current);
        setViewerOpen(true);
      }
    }, 30);
  }, []);

const viewerItems: ViewerItem[] = posts.map((p) => ({
    id: p.id,
    media_type: p.media_type,
    media_url: p.media_url,
    thumb_url: p.thumb_url ?? undefined,
    username: p.username ?? undefined,
    caption: p.caption ?? undefined,
  }));

  const videoAutoplayEnabled = isFocused && !viewerOpen && !storyViewerVisible;

  const sharePost = async (postId: number | string) => {
    try {
      await Share.share({
        message: `Check out my post on Lupyy (id: ${postId})`,
      });
    } catch {}
  };

  const listContentStyle =
    Platform.OS === "web" ? styles.listContentWeb : styles.listContentMobile;

  const handlePressStory = useCallback(
    (user: StoryUser) => {
      const key = String(user.id);
      const items = storiesByUser[key];
      if (!items || !items.length) {
        return;
      }
      setStoryViewerItems(items);
      setStoryViewerStartIndex(0);
      setStoryViewerVisible(true);
    },
    [storiesByUser]
  );

  return (
    <SafeAreaView
      {...(Platform.OS !== "web" ? (panResponder as any).panHandlers : {})}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "left", "right"]}
    >
      {!!error && (
        <View
          style={[
            styles.errorBar,
            { backgroundColor: theme.colors.danger ?? "#b00020" },
          ]}
        >
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
        </View>
      )}

      <FlatList
        data={posts}
        keyExtractor={(it) => String(it.id)}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <Text style={styles.logoText}>Lupyy</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    router.push("/capture");
                  } else {
                    router.push("/new");
                  }
                }}
              >
                <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            <StoriesBar data={storyUsers} onPressStory={handlePressStory} />
          </View>
        }
        renderItem={({ item, index }) => (
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
            onPressMedia={() => {
              setViewerIndex(index);
              setViewerPostId(item.id);
              setViewerOpen(true);
            }}
            onPressUser={() => {
              router.push({
                pathname: "/profile",
                params: { userId: item.user_id },
              });
            }}
            onLike={() => toggleLike(item.id)}
            onComment={() => openComments(item.id as number)}
            onRepost={() => {}}
            onShare={() => sharePost(item.id)}
          />
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
          loading && page > 0 ? (
            <ActivityIndicator style={{ margin: 16 }} />
          ) : null
        }
      />

      <FullscreenViewer
        visible={viewerOpen}
        items={viewerItems}
        startIndex={viewerIndex}
        onClose={() => {
          setViewerOpen(false);
        }}
        getCounts={(id) => {
          const c = counts[id as number];
          return {
            likes: c?.likes ?? 0,
            comments: c?.comments ?? 0,
            reposts: c?.reposts ?? 0,
            liked: !!c?.liked,
          };
        }}
        onLike={(id) => toggleLike(id)}
        onComment={(id) => openComments(id as number)}
        onRepost={() => {}}
        onShare={(id) => sharePost(id)}
      />

      {/* StoryViewer já encaixado, mas ainda sem stories */}
      <StoryViewer
        visible={storyViewerVisible}
        items={storyViewerItems}
        startIndex={storyViewerStartIndex}
        onClose={() => setStoryViewerVisible(false)}
      />

      <CommentsSheet
        visible={commentsOpen}
        postId={commentsPostId}
        onClose={closeComments}
      />
    </SafeAreaView>
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
  logoText: {
    fontSize: 22,
    fontWeight: "800",
  },

  listContentWeb: {
    paddingTop: 6,
    paddingBottom: 24,
    alignItems: "center",
  },
  listContentMobile: {
    paddingTop: 6,
    paddingBottom: 24,
  },

  mute: {
    position: "absolute",
    top: 54,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  muteText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  errorBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: 8,
    zIndex: 10,
  },
  errorText: { color: "white", fontWeight: "700" },
});
