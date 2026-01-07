
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
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
      const { data: memberRows } = await supabase
        .from("tribe_members")
        .select("tribe_id")
        .in("tribe_id", tribeIds);

      const counts: Record<string, number> = {};
      for (const r of memberRows ?? []) {
        const k = String((r as any).tribe_id);
        counts[k] = (counts[k] ?? 0) + 1;
      }

      enrichedTribes = enrichedTribes
        .map((t) => ({
          ...t,
          members_count: counts[String(t.id)] ?? t.members_count ?? 0,
        }))
        .sort((a, b) => (b.members_count ?? 0) - (a.members_count ?? 0));
    }

    if (mountedRef.current) setAllTribes(enrichedTribes);

    if (uid) {
      const { data: memberships } = await supabase
        .from("tribe_members")
        .select("tribe_id")
        .eq("user_id", uid);

      if (mountedRef.current) {
        const setIds = new Set<string>((memberships ?? []).map((m: any) => String(m.tribe_id)));
        setMyTribeIds(setIds);
      }
    } else if (mountedRef.current) {
      setMyTribeIds(new Set());
    }

    if (mountedRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    allTribes.forEach((t) => {
      const c = (t.category || "").trim();
      if (!c) return;
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
      .slice(0, 12);
  }, [allTribes]);

  const filteredTribes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTribes.filter((t) => {
      const matchesText =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q);
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

  const openTribe = (tribeId: string) => {
    router.push(`/tribes/${tribeId}` as any);
  };

  const goCreate = () => {
    router.push("/tribes/new" as any);
  };

  const renderTrendingCard = ({ item }: { item: Tribe }) => {
    const uri = getCoverUri(item.cover_url);
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openTribe(item.id)}
        style={[
          styles.trendingCard,
          { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.trendingCover} />
        ) : (
          <View style={[styles.trendingCover, { backgroundColor: theme.colors.surface }]} />
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.colors.text }]}>
            {item.name}
          </Text>
          {!!item.description && (
            <Text numberOfLines={2} style={[styles.cardSub, { color: theme.colors.textMuted }]}>
              {item.description}
            </Text>
          )}
          <View style={styles.rowSpaceBetween}>
            <Text style={[styles.cardMeta, { color: theme.colors.textMuted }]}>{item.members_count ?? 0} membros</Text>
            {!!item.category && <Text style={[styles.cardMeta, { color: theme.colors.textMuted }]}>{item.category}</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMyRow = ({ item }: { item: Tribe }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => openTribe(item.id)}
      style={[
        styles.myRow,
        { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.colors.text }]}>
          {item.name}
        </Text>
        {!!item.description && (
          <Text numberOfLines={2} style={[styles.cardSub, { color: theme.colors.textMuted }]}>
            {item.description}
          </Text>
        )}
      </View>
      <Text style={[styles.cardMeta, { color: theme.colors.textMuted }]}>{item.members_count ?? 0} membros</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: isLargeWeb ? 24 : 16, paddingBottom: 24 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.colors.text }]}>Tribos</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Onde os iguais se encontram.</Text>
          </View>
          <TouchableOpacity activeOpacity={0.9} onPress={goCreate} style={[styles.createBtn, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.createBtnText, { color: "#fff" }]}>Criar tribo</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar tribos por nome ou categoria..." placeholderTextColor={theme.colors.textMuted} style={[styles.searchInput, { color: theme.colors.text }]} />
        </View>

        {loading ? (
          <View style={styles.centeredBlock}>
            <ActivityIndicator />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Carregando tribos...</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Em alta</Text>
            <FlatList data={trendingTribes} keyExtractor={(item) => item.id} renderItem={renderTrendingCard} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }} />

            <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 16 }]}>Minhas tribos</Text>
            {myTribes.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Você ainda não entrou em nenhuma tribo.</Text>
                <Text style={[styles.emptySub, { color: theme.colors.textMuted }]}>Explore abaixo por categoria, ou crie a sua e chame seus amigos.</Text>
              </View>
            ) : (
              <FlatList data={myTribes} keyExtractor={(item) => item.id} renderItem={renderMyRow} scrollEnabled={false} contentContainerStyle={{ paddingVertical: 8 }} />
            )}

            <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 16 }]}>Explorar por categorias</Text>
            <View style={styles.chipsRow}>
              {categories.map((c) => {
                const active = selectedCategory === c;
                return (
                  <TouchableOpacity key={c} activeOpacity={0.9} onPress={() => setSelectedCategory(active ? null : c)} style={[styles.chip, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                    <Text style={[styles.chipText, { color: active ? "#fff" : theme.colors.text }]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingTop: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 34, fontWeight: "800", color: "#fff" },
  subtitle: { marginTop: 4, fontSize: 14, color: "#A1A1AA" },
  createBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  createBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  searchBox: { marginTop: 14, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 12 : 10 },
  searchInput: { color: "#fff", fontSize: 15 },
  sectionTitle: { marginTop: 18, fontSize: 20, fontWeight: "800", color: "#fff" },
  centeredBlock: { marginTop: 24, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: "#A1A1AA" },
  trendingCard: { width: 280, borderRadius: 18, borderWidth: 1, padding: 14, marginRight: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  trendingCover: { width: 54, height: 54, borderRadius: 14 },
  myRow: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowSpaceBetween: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  cardSub: { marginTop: 6, fontSize: 13, color: "#A1A1AA", lineHeight: 18 },
  cardMeta: { marginTop: 8, fontSize: 12, color: "#9CA3AF" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  chipText: { fontWeight: "800", fontSize: 13 },
  emptyCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginTop: 8 },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: "#fff" },
  emptySub: { marginTop: 6, fontSize: 13, color: "#A1A1AA", lineHeight: 18 },
});
