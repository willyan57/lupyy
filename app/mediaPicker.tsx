// app/mediaPicker.tsx
import Colors from "@/constants/Colors";
import { useTheme } from "@/contexts/ThemeContext";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type CaptureMode = "post" | "story" | "reel";

type Params = {
  mode?: string;
  filter?: string;
};

type SimpleAsset = {
  id: string;
  uri: string;
  mediaType: "image" | "video";
  width: number | null;
  height: number | null;
  duration: number | null;
};

export default function MediaPickerScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();

  const isWeb = Platform.OS === "web";
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [assets, setAssets] = useState<SimpleAsset[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const captureMode: CaptureMode =
    params.mode === "story" || params.mode === "reel" ? (params.mode as CaptureMode) : "post";

  useEffect(() => {
    if (!permission) {
      requestPermission();
      return;
    }
    if (!permission.granted) return;

    let cancelled = false;
    async function loadAlbums() {
      try {
        setLoadingAlbums(true);
        const all = await MediaLibrary.getAlbumsAsync({});

        if (cancelled) return;

        setAlbums(all);
      } finally {
        if (!cancelled) setLoadingAlbums(false);
      }
    }

    loadAlbums();

    return () => {
      cancelled = true;
    };
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission || !permission.granted) return;
    if (!activeAlbumId) return;

    let cancelled = false;

    async function loadAssets() {
      try {
        setLoadingAssets(true);
        const album = albums.find((a) => a.id === activeAlbumId);
        if (!album) return;

        const page = await MediaLibrary.getAssetsAsync({
          album,
          mediaType: ["photo", "video"],
          first: 200,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });

        if (cancelled) return;

        const mapped: SimpleAsset[] = page.assets.map((a) => ({
          id: a.id,
          uri: a.uri,
          mediaType: a.mediaType === "video" ? "video" : "image",
          width: a.width ?? null,
          height: a.height ?? null,
          duration: a.duration ?? null,
        }));

        setAssets(mapped);
        setSelectedIds([]);
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    }

    loadAssets();

    return () => {
      cancelled = true;
    };
  }, [activeAlbumId, albums, permission]);

  const hasSelection = selectedIds.length > 0;

  const orderedAlbums = useMemo(() => {
    if (albums.length === 0) return [];
    const current = albums.find((a) => a.id === activeAlbumId);
    const rest = albums.filter((a) => a.id !== activeAlbumId);
    return current ? [current, ...rest] : albums;
  }, [albums, activeAlbumId]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  function handleClose() {
    router.back();
  }

  function handleConfirm() {
    if (!hasSelection) return;

    const selectedAssets = assets.filter((a) => selectedIds.includes(a.id));
    if (selectedAssets.length === 0) return;

    const payload = selectedAssets.map((a) => ({
      uri: a.uri,
      kind: a.mediaType,
      width: a.width,
      height: a.height,
      duration: a.duration,
    }));

    const payloadStr = JSON.stringify(payload);

    router.push({
      pathname: "/new" as any,
      params: {
        source: "gallery",
        mode: captureMode,
        filter: typeof params.filter === "string" ? params.filter : undefined,
        payload: payloadStr,
      },
    });
  }

  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    if (isWeb) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
          <View style={styles.center}>
            <Text style={styles.permissionText}>
              No navegador, use o botão "Escolher da galeria" na tela Criar conteúdo.
            </Text>
            <TouchableOpacity
              onPress={() =>
                router.replace({
                  pathname: "/new" as any,
                  params: { source: "gallery" } as any,
                })
              }
              activeOpacity={0.8}
              style={styles.permissionButton}
            >
              <Text style={styles.permissionButtonText}>Ir para Criar conteúdo</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.center}>
          <Text style={styles.permissionText}>
            Precisamos da sua permissão para acessar a galeria.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            activeOpacity={0.8}
            style={styles.permissionButton}
          >
            <Text style={styles.permissionButtonText}>Permitir acesso</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} activeOpacity={0.8}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Galeria ({captureMode === "story" ? "Story" : "Post"})
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.albumsRow}>
        {loadingAlbums ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            horizontal
            data={orderedAlbums}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const active = item.id === activeAlbumId;
              return (
                <TouchableOpacity
                  onPress={() => setActiveAlbumId(item.id)}
                  activeOpacity={0.8}
                  style={[
                    styles.albumChip,
                    {
                      backgroundColor: active
                        ? theme.colors.primary
                        : theme.colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.albumChipText,
                      {
                        color: active ? "#fff" : theme.colors.text,
                      },
                    ]}
                  >
                    {item.title || "Álbum"}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      <View style={styles.gridWrapper}>
        {loadingAssets ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : assets.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: theme.colors.textMuted }}>
              Nenhuma mídia encontrada neste álbum.
            </Text>
          </View>
        ) : (
          <FlatList
            data={assets}
            numColumns={3}
            keyExtractor={(item) => item.id}
            columnWrapperStyle={{ gap: 2 }}
            contentContainerStyle={{ gap: 2 }}
            renderItem={({ item }) => {
              const selectedIndex = selectedIds.indexOf(item.id);
              const selected = selectedIndex !== -1;

              return (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => toggleSelect(item.id)}
                  style={styles.assetItem}
                >
                  <Image source={{ uri: item.uri }} style={styles.assetImage} />
                  {item.mediaType === "video" && (
                    <View style={styles.badgeVideo}>
                      <Text style={styles.badgeVideoText}>Vídeo</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.selectionOverlay,
                      { opacity: selected ? 0.4 : 0 },
                    ]}
                  />
                  <View
                    style={[
                      styles.selectionBadge,
                      {
                        borderColor: selected ? theme.colors.primary : "#fff",
                        backgroundColor: selected
                          ? theme.colors.primary
                          : "rgba(0,0,0,0.35)",
                      },
                    ]}
                  >
                    {selected ? (
                      <Text style={styles.selectionBadgeText}>
                        {selectedIndex + 1}
                      </Text>
                    ) : (
                      <View style={styles.selectionBadgeEmptyDot} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      <View style={styles.footer}>
        <Text style={{ color: theme.colors.textMuted }}>
          {hasSelection
            ? `${selectedIds.length} selecionado(s)`
            : "Selecione até 10 itens da câmera"}
        </Text>
        <TouchableOpacity
          onPress={handleConfirm}
          activeOpacity={0.9}
          disabled={!hasSelection}
          style={[
            styles.confirmButton,
            {
              backgroundColor: hasSelection
                ? theme.colors.primary
                : theme.colors.surface,
              opacity: hasSelection ? 1 : 0.5,
            },
          ]}
        >
          <Text style={styles.confirmButtonText}>
            Avançar
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  closeText: {
    color: "#fff",
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  albumsRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  albumChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  albumChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  gridWrapper: {
    flex: 1,
  },
  assetItem: {
    flex: 1 / 3,
    aspectRatio: 1,
    position: "relative",
  },
  assetImage: {
    width: "100%",
    height: "100%",
  },
  badgeVideo: {
    position: "absolute",
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  badgeVideoText: {
    color: "#fff",
    fontSize: 10,
  },
  selectionOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
  },
  selectionBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  selectionBadgeEmptyDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  confirmButton: {
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  permissionText: {
    color: Colors.text,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  permissionButton: {
    backgroundColor: Colors.brandStart,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
});
