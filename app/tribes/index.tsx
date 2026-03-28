
import SwipeableTabScreen from "@/components/SwipeableTabScreen";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Tribe = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_url: string | null;
  members_count: number;
  is_public: boolean;
  created_at: string;
  owner_id: string;
};

const getCoverUri = (raw: string | null) => {
  if (!raw) return null;
  const v = String(raw);
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  const { data } = supabase.storage.from("tribes").getPublicUrl(v);
  return data?.publicUrl ?? null;
};

const CATEGORY_EMOJIS: Record<string, string> = {
  "Fitness & Treino": "💪",
  "Programação": "💻",
  "Games & E-Sports": "🎮",
  "Música": "🎵",
  "Fotografia": "📷",
  "Viagens": "✈️",
  "Startups & Negócios": "🚀",
  "Inteligência Artificial": "🤖",
};

export default function TribesScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isLargeWeb = width >= 1024;

  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [allTribes, setAllTribes] = useState<Tribe[]>([]);
  const [myTribeIds, setMyTribeIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id ?? null;
    if (mountedRef.current) setUserId(uid);

    const { data: tribesData } = await supabase
      .from("tribes")
      .select("id,name,description,category,cover_url,members_count,is_public,created_at,owner_id")
      .order("members_count", { ascending: false })
      .limit(80);

    let enrichedTribes = (tribesData ?? []) as Tribe[];
    if (enrichedTribes.length) {
      const tribeIds = enrichedTribes.map((t) => t.id);
      const { data: memberRows } = await supabase.from("tribe_members").select("tribe_id").in("tribe_id", tribeIds);
      const counts: Record<string, number> = {};
      for (const r of memberRows ?? []) {
        const k = String((r as any).tribe_id);
        counts[k] = (counts[k] ?? 0) + 1;
      }
      enrichedTribes = enrichedTribes
        .map((t) => ({ ...t, members_count: counts[String(t.id)] ?? t.members_count ?? 0 }))
        .sort((a, b) => (b.members_count ?? 0) - (a.members_count ?? 0));
    }
    if (mountedRef.current) setAllTribes(enrichedTribes);

    if (uid) {
      const { data: memberships } = await supabase.from("tribe_members").select("tribe_id").eq("user_id", uid);
      if (mountedRef.current) {
        setMyTribeIds(new Set((memberships ?? []).map((m: any) => String(m.tribe_id))));
      }
    } else if (mountedRef.current) {
      setMyTribeIds(new Set());
    }
    if (mountedRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    allTribes.forEach((t) => {
      const c = (t.category || "").trim();
      if (!c) return;
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 16);
  }, [allTribes]);

  const filteredTribes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTribes.filter((t) => {
      const matchesText = !q || t.name.toLowerCase().includes(q) || (t.category ?? "").toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
      const matchesCat = !selectedCategory || (t.category ?? "") === selectedCategory;
      return matchesText && matchesCat;
    });
  }, [allTribes, query, selectedCategory]);

  const trendingTribes = useMemo(() => filteredTribes.slice(0, 8), [filteredTribes]);

  const myTribes = useMemo(() => {
    const list = filteredTribes.filter((t) => myTribeIds.has(t.id));
    list.sort((a, b) => (b.members_count ?? 0) - (a.members_count ?? 0));
    return list.slice(0, 20);
  }, [filteredTribes, myTribeIds]);

  const openTribe = (tribeId: string) => router.push(`/tribes/${tribeId}` as any);
  const goCreate = () => router.push("/tribes/new" as any);

  const renderTrendingCard = ({ item }: { item: Tribe }) => {
    const uri = getCoverUri(item.cover_url);
    const emoji = CATEGORY_EMOJIS[item.category ?? ""] ?? "🏷️";
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openTribe(item.id)}
        style={[
          s.trendingCard,
          { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
          Platform.OS === "web" ? ({ cursor: "pointer", touchAction: "manipulation" } as any) : null,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={s.trendingCover} />
        ) : (
          <View style={[s.trendingCoverFallback, { backgroundColor: theme.colors.primary + "22" }]}>
            <Text style={{ fontSize: 26 }}>{emoji}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[s.cardTitle, { color: theme.colors.text }]}>{item.name}</Text>
          {!!item.description && (
            <Text numberOfLines={2} style={[s.cardSub, { color: theme.colors.textMuted }]}>{item.description}</Text>
          )}
          <View style={s.cardBottom}>
            <View style={s.membersBadge}>
              <Ionicons name="people" size={12} color={theme.colors.textMuted} />
              <Text style={[s.membersText, { color: theme.colors.textMuted }]}>{item.members_count ?? 0}</Text>
            </View>
            {!!item.category && (
              <View style={[s.catBadge, { backgroundColor: theme.colors.primary + "18" }]}>
                <Text style={[s.catBadgeText, { color: theme.colors.primary }]}>{item.category}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMyRow = ({ item }: { item: Tribe }) => {
    const uri = getCoverUri(item.cover_url);
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openTribe(item.id)}
        style={[
          s.myRow,
          { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
          Platform.OS === "web" ? ({ cursor: "pointer", touchAction: "pan-y" } as any) : null,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={s.myRowCover} />
        ) : (
          <View style={[s.myRowCoverFallback, { backgroundColor: theme.colors.primary + "18" }]}>
            <Ionicons name="people" size={18} color={theme.colors.primary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[s.cardTitle, { color: theme.colors.text }]}>{item.name}</Text>
          {!!item.description && (
            <Text numberOfLines={1} style={[s.cardSub, { color: theme.colors.textMuted }]}>{item.description}</Text>
          )}
        </View>
        <View style={s.membersBadge}>
          <Ionicons name="people" size={12} color={theme.colors.textMuted} />
          <Text style={[s.membersText, { color: theme.colors.textMuted }]}>{item.members_count ?? 0}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SwipeableTabScreen
      leftTarget={{ route: "/(tabs)/feed", icon: "home-outline", label: "Feed" }}
      rightTarget={{ route: "/(tabs)/conversations", icon: "chatbubble-outline", label: "Mensagens" }}
    >
    <SafeAreaView style={[s.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[s.container, { paddingHorizontal: isLargeWeb ? 24 : 16, paddingBottom: 40 }]}
        // Fix: allow scroll when touching elements on mobile web
        {...(Platform.OS === "web" ? { style: { touchAction: "pan-y" } as any } : {})}
      >
        {/* Header */}
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: theme.colors.text }]}>Tribos</Text>
            <Text style={[s.subtitle, { color: theme.colors.textMuted }]}>Encontre sua galera. Crie sua comunidade.</Text>
          </View>
          <TouchableOpacity activeOpacity={0.9} onPress={goCreate} style={[s.createBtn, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.createBtnText}>Criar tribo</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[s.searchBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar tribos por nome ou categoria..."
            placeholderTextColor={theme.colors.textMuted}
            style={[s.searchInput, { color: theme.colors.text }]}
          />
        </View>

        {loading ? (
          <View style={s.centeredBlock}>
            <ActivityIndicator />
            <Text style={[s.loadingText, { color: theme.colors.textMuted }]}>Carregando tribos...</Text>
          </View>
        ) : (
          <>
            {/* Trending */}
            <View style={s.sectionHeader}>
              <Ionicons name="flame" size={18} color={theme.colors.primary} />
              <Text style={[s.sectionTitle, { color: theme.colors.text }]}>Em alta</Text>
            </View>
            <View style={Platform.OS === "web" ? { overflow: "auto" as any, WebkitOverflowScrolling: "touch" } as any : undefined}>
              <FlatList
                data={trendingTribes}
                keyExtractor={(item) => item.id}
                renderItem={renderTrendingCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 8, paddingRight: 16 }}
                {...(Platform.OS === "web" ? { style: { touchAction: "pan-x pan-y" } as any } : {})}
                nestedScrollEnabled
              />
            </View>

            {/* My tribes */}
            <View style={[s.sectionHeader, { marginTop: 20 }]}> 
              <Ionicons name="shield-checkmark" size={18} color={theme.colors.primary} />
              <Text style={[s.sectionTitle, { color: theme.colors.text }]}>Minhas tribos</Text>
            </View>
            {myTribes.length === 0 ? (
              <View style={[s.emptyCard, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <View style={[s.emptyIconWrap, { backgroundColor: theme.colors.primary + "18" }]}>
                  <Ionicons name="people-outline" size={28} color={theme.colors.primary} />
                </View>
                <Text style={[s.emptyTitle, { color: theme.colors.text }]}>Você ainda não entrou em nenhuma tribo</Text>
                <Text style={[s.emptySub, { color: theme.colors.textMuted }]}> 
                  Explore abaixo por categoria, ou crie a sua e chame seus amigos.
                </Text>
              </View>
            ) : (
              <View style={{ paddingVertical: 4 }}>
                {myTribes.map((item) => (
                  <View key={item.id}>{renderMyRow({ item })}</View>
                ))}
              </View>
            )}

            {/* Categories */}
            <View style={[s.sectionHeader, { marginTop: 20 }]}>
              <Ionicons name="compass" size={18} color={theme.colors.primary} />
              <Text style={[s.sectionTitle, { color: theme.colors.text }]}>Explorar por categoria</Text>
            </View>
            <View style={s.chipsRow}>
              {categories.map((c) => {
                const active = selectedCategory === c;
                return (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.85}
                    onPress={() => setSelectedCategory(active ? null : c)}
                    style={[
                      s.chip,
                      {
                        backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      },
                      Platform.OS === "web" ? ({ touchAction: "pan-y" } as any) : null,
                    ]}
                  >
                    <Text style={[s.chipText, { color: active ? "#fff" : theme.colors.text }]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Filtered results */}
            {selectedCategory && (
              <View style={{ marginTop: 12 }}>
                <Text style={[s.resultsCount, { color: theme.colors.textMuted }]}>
                  {filteredTribes.length} tribo{filteredTribes.length !== 1 ? "s" : ""} em "{selectedCategory}"
                </Text>
                <View style={{ paddingVertical: 4 }}>
                  {filteredTribes.slice(0, 20).map((item) => (
                    <View key={item.id}>{renderMyRow({ item })}</View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
    </SwipeableTabScreen>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingTop: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  title: { fontSize: 30, fontWeight: "800" },
  subtitle: { marginTop: 3, fontSize: 14 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999 },
  createBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  searchBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 12 : 10, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, fontSize: 15 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  centeredBlock: { marginTop: 24, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, fontSize: 13 },

  // Trending card
  trendingCard: { width: 280, borderRadius: 18, borderWidth: 1, padding: 12, marginRight: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  trendingCover: { width: 56, height: 56, borderRadius: 14 },
  trendingCoverFallback: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardSub: { marginTop: 3, fontSize: 12, lineHeight: 16 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  membersBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  membersText: { fontSize: 12, fontWeight: "600" },
  catBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  catBadgeText: { fontSize: 10, fontWeight: "700" },

  // My tribes row
  myRow: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 },
  myRowCover: { width: 42, height: 42, borderRadius: 12 },
  myRowCoverFallback: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // Categories
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  chipText: { fontWeight: "700", fontSize: 13 },

  // Empty state
  emptyCard: { borderRadius: 18, borderWidth: 1, padding: 20, marginTop: 8, alignItems: "center" },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptySub: { marginTop: 6, fontSize: 13, lineHeight: 18, textAlign: "center" },

  resultsCount: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
});
