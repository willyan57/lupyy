import SwipeableTabScreen from "@/components/SwipeableTabScreen";
import Colors from "@/constants/Colors";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Href, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  user_id: string;
  username?: string;
  avatar_url?: string;
  likes_count?: number;
  comments_count?: number;
};

type TribePreview = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count?: number;
  category?: string;
};

type SuggestedProfile = Profile & {
  isFollowing?: boolean;
};

const GAP = 2;
const WINDOW_WIDTH = Dimensions.get("window").width;
const GRID_MAX = 935;
const COL3 = (Math.min(WINDOW_WIDTH, GRID_MAX) - GAP * 2) / 3;

function resolveAvatarUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
  return data?.publicUrl || null;
}

/** Use signed URLs for posts (bucket may be private) */
async function resolvePostUrlSigned(path: string | null | undefined): Promise<string> {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const cleanPath = path.replace(/^posts\//, "");
  // Try signed URL first
  try {
    const signed = await supabase.storage.from("posts").createSignedUrl(cleanPath, 3600);
    if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl;
  } catch {}
  // Fallback to public URL
  const { data } = supabase.storage.from("posts").getPublicUrl(cleanPath);
  return data?.publicUrl || "";
}

export default function SearchScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<Profile[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // Explore state
  const [explorePosts, setExplorePosts] = useState<ExplorePost[]>([]);
  const [exploreLoading, setExploreLoading] = useState(true);
  const [trendingTribes, setTrendingTribes] = useState<TribePreview[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<SuggestedProfile[]>([]);
  const [possibleCrushes, setPossibleCrushes] = useState<Profile[]>([]);

  // Load explore content on mount
  useEffect(() => {
    loadExploreContent();
  }, []);

  const loadExploreContent = async () => {
    setExploreLoading(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      const myId = me?.user?.id;

      // Get following IDs to filter suggestions
      let followingIds: string[] = [];
      if (myId) {
        const { data: followsData } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", myId);
        followingIds = (followsData || []).map((f: any) => f.following_id);
      }

      const [postsRes, tribesRes, profilesRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id, image_path, media_type, thumbnail_path, user_id")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("tribes")
          .select("id, name, description, avatar_url, category")
          .limit(8),
        supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .not("username", "is", null)
          .limit(30),
      ]);

      // Resolve post URLs with signed URLs (handles private buckets)
      if (postsRes.data) {
        const mapped = await Promise.all(
          postsRes.data.map(async (p: any) => {
            const imgPath = p.media_type === "video" && p.thumbnail_path ? p.thumbnail_path : p.image_path;
            const url = await resolvePostUrlSigned(imgPath);
            return { ...p, image_url: url };
          })
        );
        setExplorePosts(mapped.filter((p: any) => p.image_url && p.image_url.length > 0));
      }

      if (tribesRes.data) {
        setTrendingTribes(tribesRes.data as TribePreview[]);
      }

      if (profilesRes.data && myId) {
        // Filter out self and already-followed users for suggestions
        const notFollowing = profilesRes.data.filter(
          (p: any) => p.id !== myId && !followingIds.includes(p.id)
        );
        setSuggestedProfiles(notFollowing.slice(0, 10) as SuggestedProfile[]);

        // Possible crushes: profiles matching some criteria (similar interests, mutual connections)
        // For now, use profiles the user doesn't follow, ordered differently
        const crushCandidates = profilesRes.data.filter(
          (p: any) => p.id !== myId && !followingIds.includes(p.id)
        );
        // Shuffle for variety
        const shuffled = [...crushCandidates].sort(() => Math.random() - 0.5);
        setPossibleCrushes(shuffled.slice(0, 8) as Profile[]);
      } else if (profilesRes.data) {
        setSuggestedProfiles(profilesRes.data.slice(0, 10) as SuggestedProfile[]);
      }
    } catch {
      // silent
    } finally {
      setExploreLoading(false);
    }
  };

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

  const hasQuery = query.trim().length >= 2;
  const showSearchOverlay = searchFocused || hasQuery;

  // ── CATEGORY CHIPS ──
  const categories = [
    { emoji: "🔥", label: "Em alta" },
    { emoji: "👥", label: "Tribos" },
    { emoji: "🎵", label: "Música" },
    { emoji: "🎮", label: "Games" },
    { emoji: "📸", label: "Fotografia" },
    { emoji: "💪", label: "Fitness" },
    { emoji: "🎨", label: "Arte" },
    { emoji: "✈️", label: "Viagem" },
  ];

  // ── EXPLORE GRID (Instagram-style mixed sizes) ──
  const renderExploreGrid = () => {
    if (explorePosts.length === 0) return null;

    const rows: React.ReactElement[] = [];
    let i = 0;

    while (i < explorePosts.length) {
      const rowIndex = Math.floor(i / 6);
      const isSpecialRow = rowIndex % 2 === 1;

      if (isSpecialRow && i + 3 <= explorePosts.length) {
        const large = explorePosts[i];
        const small1 = explorePosts[i + 1];
        const small2 = explorePosts[i + 2];
        const isLeft = rowIndex % 4 === 1;

        const renderImg = (post: ExplorePost, w: number, h: number) => (
          <Pressable
            key={post.id}
            onPress={() => router.push({ pathname: "/profile", params: { userId: post.user_id } } as Href)}
            style={{ width: w, height: h, position: "relative" }}
          >
            {post.image_url ? (
              <ExpoImage source={{ uri: post.image_url }} style={{ width: "100%", height: "100%", backgroundColor: theme.colors.surface }} contentFit="cover" />
            ) : (
              <LinearGradient colors={[theme.colors.surface, theme.colors.backgroundAlt || theme.colors.background]} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 24 }}>📷</Text>
              </LinearGradient>
            )}
            {post.media_type === "video" && (
              <View style={styles.videoBadge}>
                <Text style={styles.videoBadgeText}>▶</Text>
              </View>
            )}
          </Pressable>
        );

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
        const items = explorePosts.slice(i, i + 3);
        rows.push(
          <View key={`row-${i}`} style={{ flexDirection: "row", gap: GAP }}>
            {items.map((post) => (
              <Pressable key={post.id} onPress={() => router.push({ pathname: "/profile", params: { userId: post.user_id } } as Href)} style={{ width: COL3, height: COL3, position: "relative" }}>
                {post.image_url ? (
                  <ExpoImage source={{ uri: post.image_url }} style={{ width: "100%", height: "100%", backgroundColor: theme.colors.surface }} contentFit="cover" />
                ) : (
                  <LinearGradient colors={[theme.colors.surface, theme.colors.backgroundAlt || theme.colors.background]} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 24 }}>📷</Text>
                  </LinearGradient>
                )}
                {post.media_type === "video" && (
                  <View style={styles.videoBadge}>
                    <Text style={styles.videoBadgeText}>▶</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        );
        i += 3;
      }
    }

    return <View style={{ gap: GAP }}>{rows}</View>;
  };

  // ── Profile card renderer ──
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
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>
            {(profile.username || "?")?.[0]?.toUpperCase()}
          </Text>
        </LinearGradient>
      )}
      <Text style={[styles.suggestedName, { color: theme.colors.text }]} numberOfLines={1}>
        {profile.username || "usuário"}
      </Text>
      {profile.full_name && (
        <Text style={[styles.suggestedFull, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {profile.full_name}
        </Text>
      )}
      {showCrushLabel ? (
        <LinearGradient
          colors={["#FF6B6B", "#FF8E53"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.crushBtn}
        >
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
        {/* ── SEARCH BAR ── */}
        <View style={styles.searchHeader}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: theme.colors.surface,
                borderColor: searchFocused ? (theme.colors.primary || Colors.brandStart) : "transparent",
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

        {/* ── SEARCH OVERLAY ── */}
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
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  Nenhum resultado para "{query.trim()}"
                </Text>
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
                    style={({ pressed }) => [
                      styles.profileRow,
                      { backgroundColor: pressed ? theme.colors.surface : "transparent" },
                    ]}
                  >
                    <View style={styles.avatarContainer}>
                      {resolveAvatarUrl(item.avatar_url) ? (
                        <ExpoImage
                          source={{ uri: resolveAvatarUrl(item.avatar_url)! }}
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
                          <Text style={styles.avatarInitial}>
                            {(item.username || item.full_name || "?")?.[0]?.toUpperCase()}
                          </Text>
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

            {/* Recent Searches */}
            {!hasQuery && recentSearches.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recentes</Text>
                  <Pressable onPress={() => setRecentSearches([])}>
                    <Text style={[styles.sectionAction, { color: theme.colors.primary || Colors.brandStart }]}>
                      Limpar tudo
                    </Text>
                  </Pressable>
                </View>
                {recentSearches.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openProfile(item)}
                    style={({ pressed }) => [
                      styles.profileRow,
                      { backgroundColor: pressed ? theme.colors.surface : "transparent" },
                    ]}
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

            {/* Empty state */}
            {!hasQuery && recentSearches.length === 0 && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  Pesquise por nome ou @username
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* ── EXPLORE CONTENT ── */
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Category chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {categories.map((cat, idx) => (
                <Pressable
                  key={idx}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                  <Text style={[styles.chipLabel, { color: theme.colors.text }]}>{cat.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Trending Tribes */}
            {trendingTribes.length > 0 && (
              <View style={styles.tribesSection}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Tribos populares</Text>
                  <Pressable onPress={() => router.push("/(tabs)/tribes" as Href)}>
                    <Text style={[styles.sectionAction, { color: theme.colors.primary || Colors.brandStart }]}>Ver todas</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                  {trendingTribes.map((tribe) => {
                    const tribeAvatar = tribe.avatar_url
                      ? (tribe.avatar_url.startsWith("http") ? tribe.avatar_url : supabase.storage.from("tribes").getPublicUrl(tribe.avatar_url).data?.publicUrl)
                      : null;
                    return (
                      <Pressable
                        key={tribe.id}
                        onPress={() => router.push({ pathname: "/tribes/[id]", params: { id: tribe.id } } as Href)}
                        style={[styles.tribeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                      >
                        {tribeAvatar ? (
                          <ExpoImage source={{ uri: tribeAvatar }} style={styles.tribeAvatar} contentFit="cover" />
                        ) : (
                          <LinearGradient
                            colors={[Colors.brandStart, Colors.brandEnd]}
                            style={[styles.tribeAvatar, { alignItems: "center", justifyContent: "center" }]}
                          >
                            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>
                              {tribe.name?.[0]?.toUpperCase() || "T"}
                            </Text>
                          </LinearGradient>
                        )}
                        <Text style={[styles.tribeName, { color: theme.colors.text }]} numberOfLines={1}>
                          {tribe.name}
                        </Text>
                        {tribe.category && (
                          <Text style={[styles.tribeCategory, { color: theme.colors.textMuted }]} numberOfLines={1}>
                            {tribe.category}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Suggested Profiles (only not-followed) */}
            {suggestedProfiles.length > 0 && (
              <View style={styles.suggestedSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text, paddingHorizontal: 16, marginBottom: 10 }]}>
                  Sugestões para você
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                  {suggestedProfiles.map((profile) => renderProfileCard(profile, false))}
                </ScrollView>
              </View>
            )}

            {/* Possible Crushes */}
            {possibleCrushes.length > 0 && (
              <View style={styles.suggestedSection}>
                <View style={styles.sectionHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 18 }}>💘</Text>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Possíveis crushes</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                  {possibleCrushes.map((profile) => renderProfileCard(profile, true))}
                </ScrollView>
              </View>
            )}

            {/* Explore Grid */}
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 10 }]}>
                Explorar
              </Text>
            </View>

            {exploreLoading ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator color={Colors.brandStart} size="large" />
              </View>
            ) : explorePosts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>📷</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  Nenhum conteúdo para explorar ainda
                </Text>
              </View>
            ) : (
              <View style={{ alignSelf: "center", maxWidth: GRID_MAX, width: "100%" }}>
                {renderExploreGrid()}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </SwipeableTabScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
  },
  clearBtn: {
    padding: 4,
    marginLeft: 6,
  },
  clearText: {
    fontSize: 16,
    fontWeight: "600",
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  listContent: {
    paddingHorizontal: Platform.OS === "web" ? 12 : 6,
    paddingBottom: 40,
  },
  sectionWrap: {
    paddingHorizontal: Platform.OS === "web" ? 16 : 12,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  sectionAction: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Profile row
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 2,
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  profileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  username: {
    fontSize: 15,
    fontWeight: "700",
  },
  fullName: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: "400",
  },
  removeBtn: {
    padding: 8,
  },
  removeText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Category chips
  chipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Tribes
  tribesSection: {
    marginTop: 8,
  },
  tribeCard: {
    width: 140,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 12,
  },
  tribeAvatar: {
    width: "100%",
    height: 90,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  tribeName: {
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  tribeCategory: {
    fontSize: 11,
    fontWeight: "500",
    paddingHorizontal: 10,
    paddingTop: 2,
  },

  // Suggested profiles
  suggestedSection: {
    marginTop: 16,
  },
  suggestedCard: {
    width: 150,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  suggestedAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  suggestedName: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  suggestedFull: {
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  followBtn: {
    marginTop: 10,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  crushBtn: {
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  crushBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // Video badge
  videoBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  videoBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
