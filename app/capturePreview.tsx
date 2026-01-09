import Colors from "@/constants/Colors";
import { OffscreenLutRenderer } from "@/lib/gl/OffscreenLutRenderer";
import { uploadStoryMediaFromUri } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");

type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";

const FILTERS: { id: FilterId; name: string; overlay?: string; blur?: number; vignette?: boolean; glow?: boolean }[] = [
  { id: "none", name: "Normal" },
  { id: "warm", name: "Quente", overlay: "rgba(255,140,90,0.18)", glow: true },
  { id: "cool", name: "Frio", overlay: "rgba(70,150,255,0.18)", glow: true },
  { id: "pink", name: "Rosé", overlay: "rgba(255,80,160,0.16)", glow: true },
  { id: "gold", name: "Dourado", overlay: "rgba(255,220,120,0.16)", glow: true, vignette: true },
  { id: "night", name: "Night", overlay: "rgba(0,0,0,0.28)", blur: 18, vignette: true },
];

const ITEM_W = 92;

export default function CapturePreview() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const uri = useMemo(() => String(params.uri ?? ""), [params.uri]);
  const mediaType = useMemo(() => (String(params.mediaType ?? "image") as "image" | "video"), [params.mediaType]);
  const mode = useMemo(() => (String(params.mode ?? "post") as CaptureMode), [params.mode]);
  const nonce = useMemo(() => String(params.nonce ?? ""), [params.nonce]);

  const initialFilter = useMemo(() => (String(params.filter ?? "none") as FilterId), [params.filter]);
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilter = useMemo(() => FILTERS.find((f) => f.id === filter) ?? FILTERS[0], [filter]);
  const filterIndex = useMemo(() => Math.max(0, FILTERS.findIndex((f) => f.id === filter)), [filter]);

  const transition = useRef(new Animated.Value(1)).current;
  const [prevOverlay, setPrevOverlay] = useState<string | null>(null);
  const [nextOverlay, setNextOverlay] = useState<string | null>(null);

  const blurOpacity = useRef(new Animated.Value(0)).current;
  const [blurIntensity, setBlurIntensity] = useState(0);

  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelScale = useRef(new Animated.Value(0.96)).current;
  const hideLabelRef = useRef<any>(null);

  const listRef = useRef<FlatList<any> | null>(null);
  const syncScrollRef = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // força re-render limpo quando troca de mídia/filtro; evita tela preta em alguns Android
    setMediaLoaded(false);
  }, [uri, nonce, mediaType]);

  useEffect(() => {
    const next = activeFilter.overlay ?? null;
    const prev = nextOverlay ?? prevOverlay ?? null;

    setPrevOverlay(prev);
    setNextOverlay(next);

    transition.stopAnimation();
    transition.setValue(0);
    Animated.timing(transition, { toValue: 1, duration: 220, useNativeDriver: true }).start();

    const b = activeFilter.blur ?? 0;
    setBlurIntensity(b);
    blurOpacity.stopAnimation();
    blurOpacity.setValue(0);
    if (b > 0) Animated.timing(blurOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();

    if (hideLabelRef.current) clearTimeout(hideLabelRef.current);
    labelOpacity.stopAnimation();
    labelScale.stopAnimation();
    labelOpacity.setValue(0);
    labelScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(labelOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(labelScale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 0 }),
    ]).start();
    hideLabelRef.current = setTimeout(() => {
      Animated.timing(labelOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }, 900);
  }, [activeFilter.id]);

  useEffect(() => {
    if (syncScrollRef.current) return;
    listRef.current?.scrollToOffset({ offset: filterIndex * ITEM_W, animated: true });
  }, [filterIndex]);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    };
    loadUser();
  }, []);

  // Sempre que trocar a mídia (camera/galeria), reinicia o loader.
  useEffect(() => {
    setMediaLoaded(false);
  }, [uri, nonce]);

  const handleBack = () => router.back();

  const performSendWithUri = async (finalUri: string) => {
    if (!uri) return;

    if (mode === "story") {
      try {
        setSending(true);
        const uploaded = await uploadStoryMediaFromUri(finalUri, mediaType, filter);
        if (!uploaded) {
          setSending(false);
          return;
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const { error: dbError } = await supabase.from("stories").insert({
          user_id: userId,
          media_type: mediaType,
          media_path: uploaded.fileName,
          expires_at: expiresAt,
          filter,
        });

        const ok = !dbError;
        setSending(false);
        if (ok) router.replace("/feed");
      } catch {
        setSending(false);
      }
      return;
    }

    router.push({
      pathname: "/new" as any,
      params: { source: "camera", uri: finalUri, mediaType, filter },
    });
  };

  const handleSend = () => {
    if (!uri || sending || exporting) return;

    if (mediaType === "image" && filter !== "none") {
      setExporting(true);
      return;
    }

    void performSendWithUri(uri);
  };

  const label = mode === "story" ? "Publicar Story" : "Continuar";

  const onCarouselMomentumEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / ITEM_W);
    const safe = Math.max(0, Math.min(FILTERS.length - 1, idx));
    syncScrollRef.current = true;
    setFilter(FILTERS[safe].id);
    setTimeout(() => (syncScrollRef.current = false), 0);
  };

  const renderFilterItem = ({ item }: { item: any }) => {
    const active = item.id === filter;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setFilter(item.id)}
        style={[styles.carouselItem, active && styles.carouselItemActive]}
      >
        <View style={[styles.carouselThumb, { backgroundColor: item.overlay ?? "rgba(255,255,255,0.18)" }]} />
        <Text style={[styles.carouselText, active && styles.carouselTextActive]} numberOfLines={1}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const prevOpacity = transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const nextOpacity = transition;

  return (
    <View style={styles.container}>
      {exporting && mediaType === "image" && uri ? (
        <OffscreenLutRenderer
          sourceUri={uri}
          filter={filter}
          onFinish={(processedUri) => {
            setExporting(false);
            const finalUri = processedUri || uri;
            void performSendWithUri(finalUri);
          }}
        />
      ) : null}

      {mediaType === "image" ? (
        <Image
          key={`${uri}::${nonce}::${filter}`}
          source={{ uri }}
          style={styles.preview}
          resizeMode="cover"
          onLoadEnd={() => setMediaLoaded(true)}
        />
      ) : (
        <Video
          key={`${uri}::${nonce}`}
          source={{ uri }}
          style={styles.preview}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          onLoad={() => setMediaLoaded(true)}
        />
      )}

      {prevOverlay && (
        <Animated.View pointerEvents="none" style={[styles.filterOverlay, { backgroundColor: prevOverlay, opacity: prevOpacity }]} />
      )}
      {nextOverlay && (
        <Animated.View pointerEvents="none" style={[styles.filterOverlay, { backgroundColor: nextOverlay, opacity: nextOpacity }]} />
      )}

      {blurIntensity > 0 && (
        <Animated.View pointerEvents="none" style={[styles.blurWrap, { opacity: blurOpacity }]}>
          <BlurView intensity={blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}

      {activeFilter.vignette && (
        <View pointerEvents="none" style={styles.vignetteWrap}>
          <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]} style={styles.vTop} />
          <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]} style={styles.vBottom} />
          <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]} style={styles.vLeft} />
          <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]} style={styles.vRight} />
        </View>
      )}

      {activeFilter.glow && (
        <View pointerEvents="none" style={styles.glowWrap}>
          <LinearGradient colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]} style={styles.glowTop} />
        </View>
      )}

      <Animated.View pointerEvents="none" style={[styles.filterLabel, { opacity: labelOpacity, transform: [{ scale: labelScale }] }]}>
        <Text style={styles.filterLabelText}>{activeFilter.name}</Text>
      </Animated.View>

      <LinearGradient colors={["rgba(0,0,0,0.75)", "rgba(0,0,0,0.0)"]} style={styles.topGradient} />
      <LinearGradient colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.85)"]} style={styles.bottomGradient} />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.85}>
          <Text style={styles.topIcon}>←</Text>
        </TouchableOpacity>

        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>{mode === "story" ? "Story" : mode === "reel" ? "Reel" : "Post"}</Text>
        </View>

        <TouchableOpacity onPress={() => setFiltersOpen(true)} activeOpacity={0.85} style={styles.topRight}>
          <Text style={styles.topRightIcon}>✦</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.85} style={styles.bottomBtnGhost}>
          <Text style={styles.bottomBtnGhostText}>Refazer</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSend} activeOpacity={0.85} style={styles.bottomBtnPrimary} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.bottomBtnPrimaryText}>{label}</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.carouselWrap}>
        <FlatList
          ref={(r) => {
            listRef.current = r;
          }}
          data={FILTERS}
          keyExtractor={(i) => i.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_W}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: (width - ITEM_W) / 2 }}
          renderItem={renderFilterItem}
          onMomentumScrollEnd={onCarouselMomentumEnd}
          getItemLayout={(_, index) => ({ length: ITEM_W, offset: ITEM_W * index, index })}
        />
      </View>

      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filtros</Text>

            <View style={styles.filtersGrid}>
              {FILTERS.map((f) => {
                const active = f.id === filter;
                return (
                  <TouchableOpacity
                    key={f.id}
                    activeOpacity={0.9}
                    onPress={() => setFilter(f.id)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <View style={[styles.filterThumb, { backgroundColor: f.overlay ?? "rgba(255,255,255,0.18)" }]} />
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity activeOpacity={0.9} onPress={() => setFiltersOpen(false)} style={styles.sheetDone}>
              <Text style={styles.sheetDoneText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  preview: { width, height, position: "absolute", top: 0, left: 0 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  filterOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  blurWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  vignetteWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  vTop: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  vBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 200, transform: [{ rotate: "180deg" }] },
  vLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: 140, transform: [{ rotate: "90deg" }] },
  vRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: 140, transform: [{ rotate: "-90deg" }] },
  glowWrap: { position: "absolute", top: 0, left: 0, right: 0, height: 220 },
  glowTop: { position: "absolute", top: 0, left: 0, right: 0, height: 220 },
  filterLabel: {
    position: "absolute",
    top: height * 0.18,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterLabelText: { color: "#fff", fontWeight: "900", letterSpacing: 0.3 },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: height * 0.25 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: height * 0.42 },
  topBar: { position: "absolute", top: 26, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topIcon: { color: "#fff", fontSize: 26, fontWeight: "700" },
  topBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)" },
  topBadgeText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  topRight: { width: 40, alignItems: "flex-end" },
  topRightIcon: { color: "#fff", fontSize: 22 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingBottom: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  bottomBtnGhost: { flex: 1, height: 52, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  bottomBtnGhostText: { color: "#fff", fontWeight: "800" },
  bottomBtnPrimary: { flex: 1, height: 52, borderRadius: 16, backgroundColor: "rgba(255,51,85,0.95)", alignItems: "center", justifyContent: "center" },
  bottomBtnPrimaryText: { color: "#fff", fontWeight: "900", letterSpacing: 0.4 },
  carouselWrap: { position: "absolute", left: 0, right: 0, bottom: 96, height: 86 },
  carouselItem: { width: ITEM_W, alignItems: "center", justifyContent: "center", paddingTop: 10, paddingBottom: 12, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.38)" },
  carouselItemActive: { backgroundColor: "rgba(255,51,85,0.16)", borderWidth: 1, borderColor: "rgba(255,51,85,0.45)" },
  carouselThumb: { width: 46, height: 46, borderRadius: 14, marginBottom: 8 },
  carouselText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 12, maxWidth: 80, textAlign: "center" },
  carouselTextActive: { color: "#fff" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: "rgba(18,18,18,0.98)" },
  sheetHandle: { width: 46, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginBottom: 10 },
  sheetTitle: { color: "#fff", fontWeight: "900", fontSize: 16, marginBottom: 14, alignSelf: "center" },
  filtersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  filterChip: { width: (width - 18 * 2 - 10 * 2) / 3, paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  filterChipActive: { backgroundColor: "rgba(255,51,85,0.18)", borderColor: "rgba(255,51,85,0.45)" },
  filterThumb: { width: 46, height: 46, borderRadius: 14, marginBottom: 8 },
  filterChipText: { color: "rgba(255,255,255,0.82)", fontWeight: "800", fontSize: 12 },
  filterChipTextActive: { color: "#fff" },
  sheetDone: { marginTop: 16, height: 52, borderRadius: 16, backgroundColor: "rgba(255,51,85,0.95)", alignItems: "center", justifyContent: "center" },
  sheetDoneText: { color: "#fff", fontWeight: "900", letterSpacing: 0.4 },
});