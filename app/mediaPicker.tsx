import Colors from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const COLS = 3;
const GAP = 2;
const TILE = Math.floor((width - GAP * (COLS - 1)) / COLS);

type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";

type PickerParams = {
  mode?: CaptureMode;
  filter?: FilterId;
};

type Item = {
  id: string;
  uri: string;
  mediaType: "photo" | "video";
  width: number;
  height: number;
  duration?: number;
};

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MediaPicker() {
  const router = useRouter();
  const params = useLocalSearchParams<PickerParams>();
  const mode = (params.mode ?? "post") as CaptureMode;
  const filter = (params.filter ?? "none") as FilterId;

  const [hasPermission, setHasPermission] = useState<boolean>(Platform.OS === "web");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<MediaLibrary.Album | null>(null);
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const endCursorRef = useRef<string | null>(null);
  const hasNextPageRef = useRef(true);

  const canShowLibraryGrid = Platform.OS !== "web";

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") return;
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  useEffect(() => {
    if (!hasPermission) return;
    if (Platform.OS === "web") return;
    (async () => {
      try {
        const list = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
        setAlbums(list);
      } catch {}
    })();
  }, [hasPermission, selectedAlbum]);


  const title = useMemo(() => {
    if (mode === "story") return "Story";
    if (mode === "reel") return "Reel";
    return "Post";
  }, [mode]);

  const loadMore = async (reset = false) => {
    if (!canShowLibraryGrid) return;
    if (!hasPermission) return;
    if (loading) return;
    if (!hasNextPageRef.current && !reset) return;

    try {
      setLoading(true);

      if (reset) {
        endCursorRef.current = null;
        hasNextPageRef.current = true;
        setItems([]);
        setSelected(null);
      }

      const res = await MediaLibrary.getAssetsAsync({
        first: 60,
        after: reset ? undefined : endCursorRef.current ?? undefined,
        sortBy: [MediaLibrary.SortBy.creationTime],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        album: selectedAlbum ?? undefined,
      });

      endCursorRef.current = res.endCursor ?? null;
      hasNextPageRef.current = !!res.hasNextPage;

      const mapped: Item[] = res.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        mediaType: a.mediaType === MediaLibrary.MediaType.video ? "video" : "photo",
        width: a.width ?? 0,
        height: a.height ?? 0,
        duration: a.duration ?? undefined,
      }));

      setItems((prev) => {
        const next = reset ? mapped : [...prev, ...mapped];
        if (!selected && next.length > 0) setSelected(next[0]);
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canShowLibraryGrid) return;
    if (!hasPermission) return;
    loadMore(true);
  }, [hasPermission]);

  const pickWebOrFallback = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 1,
      allowsMultipleSelection: false,
    });

    if (res.canceled) return;

    const a = res.assets?.[0];
    if (!a?.uri) return;

    const mediaType = a.type === "video" ? "video" : "image";

    router.push({
      pathname: "/capturePreview" as any,
      params: { uri: a.uri, mediaType, mode, filter },
    });
  };

  const handleUse = () => {
    if (!selected) return;
    const mediaType = selected.mediaType === "video" ? "video" : "image";
    router.push({
      pathname: "/capturePreview" as any,
      params: { uri: selected.uri, mediaType, mode, filter },
    });
  };

  const handleBack = () => router.back();

  const renderTile = ({ item }: { item: Item }) => {
    const isActive = selected?.id === item.id;
    return (
      <Pressable onPress={() => setSelected(item)} style={[styles.tile, isActive && styles.tileActive]}>
        <Image source={{ uri: item.uri }} style={styles.tileImg} />
        {item.mediaType === "video" && (
          <View style={styles.videoBadge}>
            <Ionicons name="videocam" size={14} color="#fff" />
            <Text style={styles.videoBadgeText}>{formatDuration(item.duration)}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["rgba(0,0,0,0.92)", "rgba(0,0,0,0.65)"]} style={styles.topBarBg} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.centerBlock}>
          <TouchableOpacity
            onPress={() => setAlbumsOpen(true)}
            activeOpacity={0.85}
            style={styles.albumBtn}
            disabled={Platform.OS === "web"}
          >
            <Text style={styles.albumTitle}>{selectedAlbum?.title ?? "Recentes"}</Text>
            {Platform.OS === "web" ? null : <Ionicons name="chevron-down" size={16} color="#fff" style={{ opacity: 0.9, marginLeft: 6 }} />}
          </TouchableOpacity>
          <Text style={styles.modeText}>{title}</Text>
        </View>
        <TouchableOpacity onPress={handleUse} activeOpacity={0.85} style={styles.useBtn} disabled={!selected}>
          <Text style={styles.useBtnText}>Usar</Text>
        </TouchableOpacity>
      </View>

      {!canShowLibraryGrid && (
        <View style={styles.webWrap}>
          <Text style={styles.webTitle}>Escolha uma mídia</Text>
          <Text style={styles.webSub}>No navegador, a seleção é feita pelo picker do sistema.</Text>
          <TouchableOpacity activeOpacity={0.9} onPress={pickWebOrFallback} style={styles.webPickBtn}>
            <Text style={styles.webPickBtnText}>Escolher da galeria</Text>
          </TouchableOpacity>
        </View>
      )}

      {canShowLibraryGrid && !hasPermission && (
        <View style={styles.permissionWrap}>
          <Text style={styles.permissionTitle}>Permissão necessária</Text>
          <Text style={styles.permissionSub}>Permita acesso às suas fotos e vídeos para abrir a galeria.</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={async () => {
              const { status } = await MediaLibrary.requestPermissionsAsync();
              setHasPermission(status === "granted");
            }}
            style={styles.permissionBtn}
          >
            <Text style={styles.permissionBtnText}>Permitir</Text>
          </TouchableOpacity>
        </View>
      )}

      {canShowLibraryGrid && hasPermission && (
        <>
          <View style={styles.previewWrap}>
            {selected ? (
              <Image source={{ uri: selected.uri }} style={styles.previewImg} />
            ) : (
              <View style={styles.previewEmpty}>
                <ActivityIndicator color="#fff" />
              </View>
            )}

            <LinearGradient colors={["rgba(0,0,0,0.75)", "rgba(0,0,0,0)"]} style={styles.previewTopShade} />
            <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]} style={styles.previewBottomShade} />

            <View style={styles.previewMeta}>
              <Text style={styles.previewMetaText}>
                {selected?.mediaType === "video" ? "Vídeo" : "Foto"} • {filter.toUpperCase()}
              </Text>
              <Text style={styles.previewMetaHint}>Você poderá aplicar o filtro no próximo passo.</Text>
            </View>
          </View>

          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={renderTile}
            numColumns={COLS}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={{ gap: GAP, paddingBottom: 18 }}
            onEndReachedThreshold={0.5}
            onEndReached={() => loadMore(false)}
            ListFooterComponent={loading ? <View style={styles.footer}><ActivityIndicator /></View> : <View style={styles.footer} />}
          />
        </>
      )}

      <Modal
        transparent
        visible={albumsOpen}
        animationType="fade"
        onRequestClose={() => setAlbumsOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAlbumsOpen(false)}>
          <Pressable style={styles.albumSheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Escolher álbum</Text>

            <FlatList
              data={[({ id: "__recent__", title: "Recentes", assetCount: 0 } as any), ...albums]}
              keyExtractor={(a: any) => a.id}
              renderItem={({ item }: any) => {
                const isRecent = item.id === "__recent__";
                const active = isRecent ? !selectedAlbum : selectedAlbum?.id === item.id;

                return (
                  <TouchableOpacity
                    style={[styles.albumItem, active && styles.albumItemActive]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedAlbum(isRecent ? null : item);
                      setAlbumsOpen(false);
                    }}
                  >
                    <Text style={styles.albumItemTitle}>{isRecent ? "Recentes" : item.title}</Text>
                    {isRecent ? null : <Text style={styles.albumCount}>{item.assetCount ?? 0}</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBarBg: { position: "absolute", top: 0, left: 0, right: 0, height: 110 },
  topBar: {
    paddingTop: 44,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  title: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },
  useBtn: { paddingHorizontal: 14, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,51,85,0.95)" },
  useBtnText: { color: "#fff", fontWeight: "900" },

  previewWrap: { height: Math.floor(width * 0.92), backgroundColor: "rgba(0,0,0,0.6)" },
  previewImg: { width: "100%", height: "100%", resizeMode: "cover" },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  previewTopShade: { position: "absolute", top: 0, left: 0, right: 0, height: 70 },
  previewBottomShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  previewMeta: { position: "absolute", left: 14, right: 14, bottom: 14 },
  previewMetaText: { color: "#fff", fontWeight: "900" },
  previewMetaHint: { color: "rgba(255,255,255,0.75)", marginTop: 4, fontWeight: "600" },

  tile: { width: TILE, height: TILE, backgroundColor: "rgba(255,255,255,0.06)" },
  tileImg: { width: "100%", height: "100%" },
  tileActive: { borderWidth: 2, borderColor: "rgba(255,51,85,0.9)" },

  videoBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  videoBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  footer: { paddingVertical: 12 },

  permissionWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  permissionTitle: { color: "#fff", fontWeight: "900", fontSize: 18, marginBottom: 8 },
  permissionSub: { color: "rgba(255,255,255,0.78)", textAlign: "center", marginBottom: 14, fontWeight: "600" },
  permissionBtn: { height: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,51,85,0.95)" },
  permissionBtnText: { color: "#fff", fontWeight: "900" },

  webWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26 },
  webTitle: { color: "#fff", fontWeight: "900", fontSize: 18, marginBottom: 8 },
  webSub: { color: "rgba(255,255,255,0.78)", textAlign: "center", marginBottom: 16, fontWeight: "600" },
  webPickBtn: { height: 52, paddingHorizontal: 18, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,51,85,0.95)" },
  webPickBtnText: { color: "#fff", fontWeight: "900" },

  centerBlock: { alignItems: "center" },
  albumBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.35)" },
  albumTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  modeText: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  albumSheet: { backgroundColor: "#0b0b0d", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10, paddingBottom: 18, paddingHorizontal: 14, maxHeight: "65%" },
  sheetHandle: { alignSelf: "center", width: 44, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 10 },
  sheetTitle: { color: "#fff", fontWeight: "900", fontSize: 14, textAlign: "center", marginBottom: 10, opacity: 0.9 },

  albumItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  albumItemActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  albumItemTitle: { color: "#fff", fontSize: 14, fontWeight: "800", flex: 1 },
  albumCount: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "800", marginLeft: 10 },
});
