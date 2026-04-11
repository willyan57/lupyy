import SwipeableTabScreen from "@/components/SwipeableTabScreen";
import { CrossPlatformVideo } from "@/components/CrossPlatformVideo";
import FullscreenViewer, { type ViewerItem } from "@/components/FullscreenViewer";
import Colors from "@/constants/Colors";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useIsFocused } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Href, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type ExplorePost = {
  id: number;
  image_path: string;
  media_type: "image" | "video";
  thumbnail_path: string | null;
  image_url?: string;
  /** URL do ficheiro principal (imagem ou vídeo) para viewer / preview */
  full_media_url?: string;
  caption?: string | null;
  user_id: string;
  likes_count?: number;
  comments_count?: number;
  /** Resolvido para URL http(s) — para avatar no viewer */
  author_avatar_url?: string | null;
  author_username?: string | null;
};

type TribePreview = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  members_count: number;
  category?: string | null;
};

type SuggestedProfile = Profile & {
  isFollowing?: boolean;
};

const GAP = 2;
const WINDOW_WIDTH = Dimensions.get("window").width;
const GRID_MAX = 935;
const COL3 = (Math.min(WINDOW_WIDTH, GRID_MAX) - GAP * 2) / 3;

/** Máx. vídeos em loop no grid (performance APK). */
const MAX_VIDEO_AUTOPLAY = 9;

function resolveAvatarUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
  return data?.publicUrl || null;
}

function getTribeCoverUri(raw: string | null): string | null {
  if (!raw) return null;
  const v = String(raw);
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  const { data } = supabase.storage.from("tribes").getPublicUrl(v);
  return data?.publicUrl ?? null;
}

/** Use signed URLs for posts (bucket may be private) */
async function resolvePostUrlSigned(path: string | null | undefined): Promise<string> {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const cleanPath = path.replace(/^posts\//, "");
  try {
    const signed = await supabase.storage.from("posts").createSignedUrl(cleanPath, 3600);
    if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl;
  } catch {}
  const { data } = supabase.storage.from("posts").getPublicUrl(cleanPath);
  return data?.publicUrl || "";
}

async function mergeAuthorProfilesIntoPosts(posts: ExplorePost[]): Promise<ExplorePost[]> {
  const uids = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
  if (uids.length === 0) return posts;
  const { data: profs } = await supabase.from("profiles").select("id, username, avatar_url").in("id", uids);
  const map = new Map<string, { id: string; username: string | null; avatar_url: string | null }>(
    (profs ?? []).map((r: { id: string; username: string | null; avatar_url: string | null }) => [r.id, r])
  );
  return posts.map((p) => {
    const pr = map.get(p.user_id);
    return {
      ...p,
      author_username: pr?.username ?? null,
      author_avatar_url: resolveAvatarUrl(pr?.avatar_url ?? null),
    };
  });
}

/** Mapeia linhas do Supabase + contagens + perfis dos autores (nome/avatar no viewer). */
async function buildExplorePostsFromRawRows(rows: any[]): Promise<ExplorePost[]> {
  if (!rows.length) return [];
  const ids = rows.map((r: { id: number }) => r.id);
  const likesMap: Record<number, number> = {};
  const commentsMap: Record<number, number> = {};
  try {
    const { data: countRows } = await supabase
      .from("post_counts")
      .select("post_id, likes_count, comments_count")
      .in("post_id", ids);
    (countRows || []).forEach((r: { post_id: number; likes_count?: number | null; comments_count?: number | null }) => {
      likesMap[r.post_id] = r.likes_count ?? 0;
      commentsMap[r.post_id] = r.comments_count ?? 0;
    });
  } catch {
    /* post_counts opcional */
  }
  const mapped = await Promise.all(
    rows.map(async (p: any) => {
      const thumbPath = p.media_type === "video" && p.thumbnail_path ? p.thumbnail_path : p.image_path;
      const gridUrl = await resolvePostUrlSigned(thumbPath);
      const fullMedia = await resolvePostUrlSigned(p.image_path);
      return {
        id: p.id,
        image_path: p.image_path,
        media_type: p.media_type as "image" | "video",
        thumbnail_path: p.thumbnail_path,
        image_url: gridUrl,
        full_media_url: fullMedia,
        caption: p.caption ?? null,
        user_id: p.user_id,
        likes_count: likesMap[p.id] ?? 0,
        comments_count: commentsMap[p.id] ?? 0,
      } as ExplorePost;
    })
  );
  const ok = mapped.filter((p) => p.image_url && p.image_url.length > 0);
  return mergeAuthorProfilesIntoPosts(ok);
}

type ChipKey =
  | "trending"
  | "tribes_nav"
  | "music"
  | "games"
  | "photo"
  | "fitness"
  | "art"
  | "travel";

const CHIPS: { key: ChipKey; emoji: string; label: string }[] = [
  { key: "trending", emoji: "🔥", label: "Em alta" },
  { key: "tribes_nav", emoji: "👥", label: "Tribos" },
  { key: "music", emoji: "🎵", label: "Música" },
  { key: "games", emoji: "🎮", label: "Games" },
  { key: "photo", emoji: "📸", label: "Fotografia" },
  { key: "fitness", emoji: "💪", label: "Fitness" },
  { key: "art", emoji: "🎨", label: "Arte" },
  { key: "travel", emoji: "✈️", label: "Viagem" },
];

function captionMatchesChip(caption: string | null | undefined, key: ChipKey): boolean {
  if (!caption || key === "trending" || key === "tribes_nav") return true;
  const c = caption.toLowerCase();
  switch (key) {
    case "music":
      return /música|musica|music|#music|#música|🎵/.test(c);
    case "games":
      return /game|jogos|gaming|#games|🎮|esports|e-sports/.test(c);
    case "photo":
      return /foto|photo|fotografia|photography|#photo|📸|camera/.test(c);
    case "fitness":
      return /fitness|treino|academia|gym|workout|#fit/.test(c);
    case "art":
      return /arte|art|draw|desenho|paint|#art/.test(c);
    case "travel":
      return /viagem|travel|trip|#travel|✈️/.test(c);
    default:
      return true;
  }
}

function tribeMatchesChip(category: string | null | undefined, key: ChipKey): boolean {
  if (!category || key === "trending") return true;
  if (key === "tribes_nav") return true;
  const t = category.toLowerCase();
  switch (key) {
    case "music":
      return t.includes("música") || t.includes("music");
    case "games":
      return t.includes("game") || t.includes("e-sport");
    case "photo":
      return t.includes("foto") || t.includes("photo");
    case "fitness":
      return t.includes("fitness") || t.includes("treino");
    case "art":
      return t.includes("arte") || t.includes("art");
    case "travel":
      return t.includes("viagem") || t.includes("travel");
    default:
      return true;
  }
}

function ExploreGridCell({
  post,
  width,
  height,
  videoIndex,
  isTabFocused,
  onOpen,
}: {
  post: ExplorePost;
  width: number;
  height: number;
  videoIndex: number;
  isTabFocused: boolean;
  onOpen: () => void;
}) {
  const playVideo =
    post.media_type === "video" &&
    !!post.full_media_url &&
    videoIndex < MAX_VIDEO_AUTOPLAY &&
    isTabFocused;

  return (
    <Pressable onPress={onOpen} style={{ width, height, position: "relative", overflow: "hidden", backgroundColor: "#0a0a0a" }}>
      {post.media_type === "video" && post.full_media_url && playVideo ? (
        <CrossPlatformVideo
          uri={post.full_media_url}
          playing={playVideo}
          muted
          posterUri={post.image_url ?? undefined}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          allowsFullscreen={false}
        />
      ) : post.image_url ? (
        <ExpoImage source={{ uri: post.image_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <LinearGradient colors={["#1a1a2e", "#12121a"]} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#666", fontSize: 22 }}>📷</Text>
        </LinearGradient>
      )}
      {post.media_type === "video" && (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function SearchScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const isTabFocused = useIsFocused();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<Profile[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const [explorePosts, setExplorePosts] = useState<ExplorePost[]>([]);
  const [exploreLoading, setExploreLoading] = useState(true);
  const [trendingTribes, setTrendingTribes] = useState<TribePreview[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<SuggestedProfile[]>([]);
  const [possibleCrushes, setPossibleCrushes] = useState<Profile[]>([]);

  const [activeChip, setActiveChip] = useState<ChipKey>("trending");

  /** Índice do post aberto no viewer (null = fechado). */
  const [viewerAnchorPostId, setViewerAnchorPostId] = useState<number | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const exploreOffsetRef = useRef(0);
  const loadMoreExploreLock = useRef(false);

  const loadExploreContent = async () => {
    setExploreLoading(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      const myId = me?.user?.id;

      let followingIds: string[] = [];
      if (myId) {
        const { data: followsData } = await supabase.from("follows").select("following_id").eq("follower_id", myId);
        followingIds = (followsData || []).map((f: { following_id: string }) => f.following_id);
      }

      const [postsRes, tribesRes, profilesRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id, image_path, media_type, thumbnail_path, user_id, caption, created_at")
          .order("created_at", { ascending: false })
          .limit(48),
        supabase
          .from("tribes")
          .select("id, name, description, category, cover_url, members_count")
          .order("members_count", { ascending: false })
          .limit(12),
        supabase.from("profiles").select("id, username, full_name, avatar_url").not("username", "is", null).limit(36),
      ]);

      if (postsRes.error) {
        console.warn("search posts:", postsRes.error.message);
        setExplorePosts([]);
        exploreOffsetRef.current = 0;
      } else if (postsRes.data?.length) {
        exploreOffsetRef.current = postsRes.data.length;
        const built = await buildExplorePostsFromRawRows(postsRes.data);
        built.sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0));
        setExplorePosts(built);
      } else {
        setExplorePosts([]);
        exploreOffsetRef.current = 0;
      }

      if (tribesRes.error) {
        console.warn("search tribes:", tribesRes.error.message);
        setTrendingTribes([]);
      } else if (tribesRes.data) {
        setTrendingTribes(tribesRes.data as TribePreview[]);
      }

      if (profilesRes.data && myId) {
        const notFollowing = profilesRes.data.filter((p: Profile) => p.id !== myId && !followingIds.includes(p.id));
        setSuggestedProfiles(notFollowing.slice(0, 12) as SuggestedProfile[]);
        const shuffled = [...notFollowing].sort(() => Math.random() - 0.5);
        setPossibleCrushes(shuffled.slice(0, 10) as Profile[]);
      } else if (profilesRes.data) {
        setSuggestedProfiles(profilesRes.data.slice(0, 12) as SuggestedProfile[]);
      }
    } catch (e) {
      console.warn("loadExploreContent", e);
    } finally {
      setExploreLoading(false);
    }
  };

  const loadMoreExplorePosts = useCallback(async () => {
    if (loadMoreExploreLock.current) return;
    loadMoreExploreLock.current = true;
    try {
      const from = exploreOffsetRef.current;
      const { data, error } = await supabase
        .from("posts")
        .select("id, image_path, media_type, thumbnail_path, user_id, caption, created_at")
        .order("created_at", { ascending: false })
        .range(from, from + 47);
      if (error || !data?.length) return;
      const built = await buildExplorePostsFromRawRows(data);
      setExplorePosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const added = built.filter((p) => !seen.has(p.id));
        if (added.length === 0) return prev;
        return [...prev, ...added];
      });
      exploreOffsetRef.current += data.length;
    } catch (e) {
      console.warn("loadMoreExplorePosts", e);
    } finally {
      loadMoreExploreLock.current = false;
    }
  }, []);

  useEffect(() => {
    loadExploreContent();
  }, []);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then((res: Awaited<ReturnType<typeof supabase.auth.getUser>>) => setAuthUserId(res.data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setAuthUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const filteredExplorePosts = useMemo(() => {
    if (activeChip === "trending" || activeChip === "tribes_nav") return explorePosts;
    return explorePosts.filter((p) => captionMatchesChip(p.caption, activeChip));
  }, [explorePosts, activeChip]);

  const exploreViewerItems = useMemo((): ViewerItem[] => {
    return filteredExplorePosts.map((p) => {
      const uname = p.author_username?.trim();
      const displayName = uname ? `@${uname.replace(/^@/, "")}` : undefined;
      return {
        id: p.id,
        media_type: p.media_type,
        media_url: p.full_media_url || p.image_url || "",
        thumb_url: p.media_type === "video" ? p.image_url ?? null : null,
        user_id: p.user_id,
        username: displayName,
        avatar_url: p.author_avatar_url ?? undefined,
        caption: p.caption ?? null,
      };
    });
  }, [filteredExplorePosts]);

  const viewerStartIndex = useMemo(() => {
    if (viewerAnchorPostId == null) return 0;
    const i = filteredExplorePosts.findIndex((p) => p.id === viewerAnchorPostId);
    return i >= 0 ? i : 0;
  }, [viewerAnchorPostId, filteredExplorePosts]);

  const getViewerCounts = useCallback(
    (id: string | number) => {
      const p = explorePosts.find((x) => x.id === id);
      return {
        likes: p?.likes_count ?? 0,
        comments: p?.comments_count ?? 0,
        reposts: 0,
        liked: false,
      };
    },
    [explorePosts]
  );

  useEffect(() => {
    if (viewerAnchorPostId == null) return;
    if (!filteredExplorePosts.some((p) => p.id === viewerAnchorPostId)) {
      setViewerAnchorPostId(null);
    }
  }, [filteredExplorePosts, viewerAnchorPostId]);

  const filteredTribes = useMemo(() => {
    if (activeChip === "trending" || activeChip === "tribes_nav") return trendingTribes;
    return trendingTribes.filter((t) => tribeMatchesChip(t.category ?? null, activeChip));
  }, [trendingTribes, activeChip]);

  /** Índice entre vídeos (0…n) para limitar autoplay aos primeiros N. */
  const videoIndexInList = useMemo(() => {
    const map = new Map<number, number>();
    let v = 0;
    for (const p of filteredExplorePosts) {
      if (p.media_type === "video") {
        map.set(p.id, v);
        v++;
      }
    }
    return map;
  }, [filteredExplorePosts]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    const value = text.trim();
    if (value.length < 2) {
      setResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .or(`username.ilike.%${value}%,full_name.ilike.%${value}%`)
          .limit(30);
        if (!error && data) setResults(data as Profile[]);
        else setResults([]);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  function openProfile(profile: Profile) {
    Keyboard.dismiss();
    setSearchFocused(false);
    setRecentSearches((prev) => {
      const filtered = prev.filter((p) => p.id !== profile.id);
      return [profile, ...filtered].slice(0, 10);
    });
    router.push({
      pathname: "/profile",
      params: { userId: profile.id, profileId: profile.id, id: profile.id },
    } as Href);
  }

  function removeRecent(id: string) {
    setRecentSearches((prev) => prev.filter((p) => p.id !== id));
  }

  const openExploreViewer = useCallback((post: ExplorePost) => {
    if (!filteredExplorePosts.some((p) => p.id === post.id)) return;
    setViewerAnchorPostId(post.id);
  }, [filteredExplorePosts]);

  const hasQuery = query.trim().length >= 2;
  const showSearchOverlay = searchFocused || hasQuery;

  const handleChipPress = (key: ChipKey) => {
    if (key === "tribes_nav") {
      router.push("/(tabs)/tribes" as Href);
      return;
    }
    setActiveChip(key);
  };

  const renderExploreGrid = () => {
    if (filteredExplorePosts.length === 0) return null;

    const rows: React.ReactElement[] = [];
    let i = 0;

    while (i < filteredExplorePosts.length) {
      const rowIndex = Math.floor(i / 6);
      const isSpecialRow = rowIndex % 2 === 1;

      if (isSpecialRow && i + 3 <= filteredExplorePosts.length) {
        const large = filteredExplorePosts[i];
        const small1 = filteredExplorePosts[i + 1];
        const small2 = filteredExplorePosts[i + 2];
        const isLeft = rowIndex % 4 === 1;

        const renderImg = (post: ExplorePost, w: number, h: number) => {
          const vIdx = post.media_type === "video" ? (videoIndexInList.get(post.id) ?? 0) : 999;
          return (
            <ExploreGridCell
              key={post.id}
              post={post}
              width={w}
              height={h}
              videoIndex={vIdx}
              isTabFocused={isTabFocused}
              onOpen={() => openExploreViewer(post)}
            />
          );
        };

        rows.push(
          <View key={`row-${i}`} style={{ flexDirection: "row", gap: GAP }}>
            {isLeft ? (
              <>
                {renderImg(large, COL3 * 2 + GAP, COL3 * 2 + GAP)}
                <View style={{ gap: GAP }}>
                  {renderImg(small1, COL3, COL3)}
                  {renderImg(small2, COL3, COL3)}
                </View>
              </>
            ) : (
              <>
                <View style={{ gap: GAP }}>
                  {renderImg(small1, COL3, COL3)}
                  {renderImg(small2, COL3, COL3)}
                </View>
                {renderImg(large, COL3 * 2 + GAP, COL3 * 2 + GAP)}
              </>
            )}
          </View>
        );
        i += 3;
      } else {
        const items = filteredExplorePosts.slice(i, i + 3);
        rows.push(
          <View key={`row-${i}`} style={{ flexDirection: "row", gap: GAP }}>
            {items.map((post) => {
              const vIdx = post.media_type === "video" ? (videoIndexInList.get(post.id) ?? 0) : 999;
              return (
                <ExploreGridCell
                  key={post.id}
                  post={post}
                  width={COL3}
                  height={COL3}
                  videoIndex={vIdx}
                  isTabFocused={isTabFocused}
                  onOpen={() => openExploreViewer(post)}
                />
              );
            })}
          </View>
        );
        i += 3;
      }
    }

    return <View style={{ gap: GAP }}>{rows}</View>;
  };

  const renderProfileCard = (profile: Profile, showCrushLabel?: boolean) => (
    <Pressable
      key={profile.id}
      onPress={() => openProfile(profile)}
      style={[styles.suggestedCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      {resolveAvatarUrl(profile.avatar_url) ? (
        <ExpoImage source={{ uri: resolveAvatarUrl(profile.avatar_url)! }} style={styles.suggestedAvatar} contentFit="cover" />
      ) : (
        <LinearGradient
          colors={[Colors.brandStart, Colors.brandEnd]}
          style={[styles.suggestedAvatar, { alignItems: "center", justifyContent: "center" }]}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>{(profile.username || "?")?.[0]?.toUpperCase()}</Text>
        </LinearGradient>
      )}
      <Text style={[styles.suggestedName, { color: theme.colors.text }]} numberOfLines={1}>
        @{profile.username || "user"}
      </Text>
      {profile.full_name ? (
        <Text style={[styles.suggestedFull, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {profile.full_name}
        </Text>
      ) : null}
      {showCrushLabel ? (
        <LinearGradient colors={["#FF6B6B", "#FF8E53"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.crushBtn}>
          <Text style={styles.crushBtnText}>💘 Conectar</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.followBtn, { borderColor: theme.colors.primary || Colors.brandStart }]}>
          <Text style={[styles.followBtnText, { color: theme.colors.primary || Colors.brandStart }]}>Seguir</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <SwipeableTabScreen
      leftTarget={{ route: "/(tabs)/conversations", icon: "chatbubble-outline", label: "Mensagens" }}
      rightTarget={{ route: "/(tabs)/profile", icon: "person-outline", label: "Perfil" }}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.searchHeader}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: theme.colors.surface,
                borderColor: searchFocused ? theme.colors.primary || Colors.brandStart : "transparent",
              },
            ]}
          >
            <Text style={[styles.searchIcon, { color: theme.colors.textMuted }]}>🔍</Text>
            <TextInput
              value={query}
              onChangeText={handleSearch}
              placeholder="Pesquisar"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { color: theme.colors.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onFocus={() => setSearchFocused(true)}
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => {
                  setQuery("");
                  setResults([]);
                }}
                hitSlop={10}
                style={styles.clearBtn}
              >
                <Text style={[styles.clearText, { color: theme.colors.textMuted }]}>✕</Text>
              </Pressable>
            )}
          </View>
          {searchFocused && (
            <Pressable
              onPress={() => {
                setSearchFocused(false);
                setQuery("");
                setResults([]);
                Keyboard.dismiss();
              }}
              style={styles.cancelBtn}
            >
              <Text style={[styles.cancelText, { color: theme.colors.primary || Colors.brandStart }]}>Cancelar</Text>
            </Pressable>
          )}
        </View>

        {showSearchOverlay ? (
          <View style={{ flex: 1 }}>
            {loading && (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.brandStart} />
              </View>
            )}

            {!loading && hasQuery && results.length === 0 && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Nenhum resultado para "{query.trim()}"</Text>
              </View>
            )}

            {hasQuery && results.length > 0 && (
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => openProfile(item)}
                    style={({ pressed }) => [styles.profileRow, { backgroundColor: pressed ? theme.colors.surface : "transparent" }]}
                  >
                    <View style={styles.avatarContainer}>
                      {resolveAvatarUrl(item.avatar_url) ? (
                        <ExpoImage source={{ uri: resolveAvatarUrl(item.avatar_url)! }} style={styles.avatar} contentFit="cover" cachePolicy="disk" />
                      ) : (
                        <LinearGradient colors={[Colors.brandStart, Colors.brandEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                          <Text style={styles.avatarInitial}>{(item.username || item.full_name || "?")?.[0]?.toUpperCase()}</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <View style={styles.profileInfo}>
                      <Text style={[styles.username, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.username || "usuário"}
                      </Text>
                      {item.full_name && (
                        <Text style={[styles.fullName, { color: theme.colors.textMuted }]} numberOfLines={1}>
                          {item.full_name}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                )}
              />
            )}

            {!hasQuery && recentSearches.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recentes</Text>
                  <Pressable onPress={() => setRecentSearches([])}>
                    <Text style={[styles.sectionAction, { color: theme.colors.primary || Colors.brandStart }]}>Limpar tudo</Text>
                  </Pressable>
                </View>
                {recentSearches.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openProfile(item)}
                    style={({ pressed }) => [styles.profileRow, { backgroundColor: pressed ? theme.colors.surface : "transparent" }]}
                  >
                    <View style={styles.avatarContainer}>
                      {resolveAvatarUrl(item.avatar_url) ? (
                        <ExpoImage source={{ uri: resolveAvatarUrl(item.avatar_url)! }} style={styles.avatar} contentFit="cover" />
                      ) : (
                        <LinearGradient colors={[Colors.brandStart, Colors.brandEnd]} style={styles.avatar}>
                          <Text style={styles.avatarInitial}>{(item.username || "?")?.[0]?.toUpperCase()}</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <View style={styles.profileInfo}>
                      <Text style={[styles.username, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.username || "usuário"}
                      </Text>
                      {item.full_name && (
                        <Text style={[styles.fullName, { color: theme.colors.textMuted }]} numberOfLines={1}>
                          {item.full_name}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={() => removeRecent(item.id)} hitSlop={12} style={styles.removeBtn}>
                      <Text style={[styles.removeText, { color: theme.colors.textMuted }]}>✕</Text>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}

            {!hasQuery && recentSearches.length === 0 && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Pesquise por nome ou @username</Text>
              </View>
            )}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {CHIPS.map((cat) => {
                const active = activeChip === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => handleChipPress(cat.key)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? (theme.colors.primary || Colors.brandStart) + "22" : theme.colors.surface,
                        borderColor: active ? theme.colors.primary || Colors.brandStart : theme.colors.border,
                        borderWidth: active ? 1.5 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                    <Text style={[styles.chipLabel, { color: theme.colors.text, fontWeight: active ? "800" : "600" }]}>{cat.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filteredTribes.length > 0 && (
              <View style={styles.tribesSection}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Tribos populares</Text>
                  <Pressable onPress={() => router.push("/(tabs)/tribes" as Href)}>
                    <Text style={[styles.sectionAction, { color: theme.colors.primary || Colors.brandStart }]}>Ver todas</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                  {filteredTribes.map((tribe) => {
                    const tribeCover = getTribeCoverUri(tribe.cover_url);
                    return (
                      <Pressable
                        key={tribe.id}
                        onPress={() => router.push({ pathname: "/tribes/[id]", params: { id: tribe.id } } as Href)}
                        style={[styles.tribeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                      >
                        {tribeCover ? (
                          <ExpoImage source={{ uri: tribeCover }} style={styles.tribeAvatar} contentFit="cover" />
                        ) : (
                          <LinearGradient
                            colors={[Colors.brandStart, Colors.brandEnd]}
                            style={[styles.tribeAvatar, { alignItems: "center", justifyContent: "center" }]}
                          >
                            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>{tribe.name?.[0]?.toUpperCase() || "T"}</Text>
                          </LinearGradient>
                        )}
                        <Text style={[styles.tribeName, { color: theme.colors.text }]} numberOfLines={1}>
                          {tribe.name}
                        </Text>
                        {tribe.category ? (
                          <Text style={[styles.tribeCategory, { color: theme.colors.textMuted }]} numberOfLines={1}>
                            {tribe.category}
                          </Text>
                        ) : null}
                        <Text style={[styles.tribeMembers, { color: theme.colors.textMuted }]}>
                          {tribe.members_count ?? 0} membros
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {suggestedProfiles.length > 0 && (
              <View style={styles.suggestedSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text, paddingHorizontal: 16, marginBottom: 8 }]}>Sugestões para você</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                  {suggestedProfiles.map((profile) => renderProfileCard(profile, false))}
                </ScrollView>
              </View>
            )}

            {possibleCrushes.length > 0 && (
              <View style={styles.suggestedSection}>
                <View style={styles.sectionHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 16 }}>💘</Text>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Possíveis crushes</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                  {possibleCrushes.map((profile) => renderProfileCard(profile, true))}
                </ScrollView>
              </View>
            )}

            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 8 }]}>Explorar</Text>
            </View>

            {exploreLoading ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator color={Colors.brandStart} size="large" />
              </View>
            ) : filteredExplorePosts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>📷</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  {activeChip === "trending" ? "Nenhum conteúdo para explorar ainda" : "Nada nesta categoria — experimenta outro filtro"}
                </Text>
              </View>
            ) : (
              <View style={{ alignSelf: "center", maxWidth: GRID_MAX, width: "100%" }}>{renderExploreGrid()}</View>
            )}
          </ScrollView>
        )}
      </View>

      <FullscreenViewer
        visible={viewerAnchorPostId !== null}
        items={exploreViewerItems}
        startIndex={viewerStartIndex}
        onClose={() => setViewerAnchorPostId(null)}
        getCounts={getViewerCounts}
        currentUserId={authUserId}
        onLoadMore={loadMoreExplorePosts}
        onPressUser={(uid) => {
          setViewerAnchorPostId(null);
          setTimeout(() => router.push({ pathname: "/profile", params: { userId: uid } } as Href), 120);
        }}
      />
    </SwipeableTabScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Platform.OS === "web" ? 16 : 12,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  input: { flex: 1, fontSize: 15, fontWeight: "400" },
  clearBtn: { padding: 4, marginLeft: 6 },
  clearText: { fontSize: 16, fontWeight: "600" },
  cancelBtn: { paddingVertical: 8 },
  cancelText: { fontSize: 15, fontWeight: "600" },
  loadingWrap: { paddingVertical: 24, alignItems: "center" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  listContent: { paddingHorizontal: Platform.OS === "web" ? 12 : 6, paddingBottom: 40 },
  sectionWrap: { paddingHorizontal: Platform.OS === "web" ? 16 : 12, paddingTop: 8 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  sectionAction: { fontSize: 14, fontWeight: "600" },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 2,
  },
  avatarContainer: { marginRight: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
  },
  avatarInitial: { color: "#fff", fontSize: 18, fontWeight: "700" },
  profileInfo: { flex: 1, justifyContent: "center" },
  username: { fontSize: 15, fontWeight: "700" },
  fullName: { fontSize: 13, marginTop: 2, fontWeight: "400" },
  removeBtn: { padding: 8 },
  removeText: { fontSize: 14, fontWeight: "600" },
  chipsRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 5,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 12 },
  tribesSection: { marginTop: 4 },
  tribeCard: {
    width: 128,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 8,
  },
  tribeAvatar: {
    width: "100%",
    height: 76,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
  },
  tribeName: { fontSize: 13, fontWeight: "700", paddingHorizontal: 8, paddingTop: 6 },
  tribeCategory: { fontSize: 10, fontWeight: "500", paddingHorizontal: 8, paddingTop: 2 },
  tribeMembers: { fontSize: 10, paddingHorizontal: 8, paddingTop: 2 },
  suggestedSection: { marginTop: 14 },
  suggestedCard: {
    width: 112,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  suggestedAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  suggestedName: { fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "center", maxWidth: 100 },
  suggestedFull: { fontSize: 10, marginTop: 2, textAlign: "center", maxWidth: 100 },
  followBtn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  followBtnText: { fontSize: 11, fontWeight: "700" },
  crushBtn: { marginTop: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  crushBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  videoBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  videoBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
