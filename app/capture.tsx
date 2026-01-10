import Colors from "@/constants/Colors";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");

type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "warm" | "cool" | "night" | "pink" | "gold";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "none", label: "Normal" },
  { id: "warm", label: "Quente" },
  { id: "cool", label: "Frio" },
  { id: "pink", label: "Rosé" },
  { id: "gold", label: "Dourado" },
  { id: "night", label: "Night" },
];

export default function CaptureScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<CameraType>("back");
  const [flashOn, setFlashOn] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("story");
  const [filter, setFilter] = useState<FilterId>("none");
  const [recording, setRecording] = useState(false);
  const [loadingCapture, setLoadingCapture] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Precisamos da sua permissão para usar a câmera.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={styles.permissionButton}
          activeOpacity={0.8}
        >
          <Text style={styles.permissionButtonText}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const toggleFlash = () => {
    setFlashOn((prev) => !prev);
  };

  const handleClose = () => {
    router.replace("/feed");
  };

  const handleShotPress = async () => {
    if (!cameraRef.current || loadingCapture || recording) return;

    if (mode === "reel") {
      if (recording) {
        cameraRef.current.stopRecording();
        return;
      }
      try {
        setRecording(true);
        const video = await cameraRef.current.recordAsync({
          maxDuration: 60,
          quality: "1080p",
        } as any);
        setRecording(false);
        if (video?.uri) {
          router.push({
            pathname: "/capturePreview" as any,
            params: {
              uri: video.uri,
              mediaType: "video",
              mode,
              filter,
              nonce: String(Date.now()),
            },
          });
        }
      } catch {
        setRecording(false);
      }
      return;
    }

    try {
      setLoadingCapture(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      setLoadingCapture(false);
      if (photo?.uri) {
        router.push({
          pathname: "/capturePreview" as any,
          params: {
            uri: photo.uri,
            mediaType: "image",
            mode,
            filter,
            nonce: String(Date.now()),
          },
        });
      }
    } catch {
      setLoadingCapture(false);
    }
  };

  const handleShotLongPress = async () => {
    if (!cameraRef.current || mode !== "story" || recording) return;

    try {
      setRecording(true);
      const video = await cameraRef.current.recordAsync({
        maxDuration: 30,
        quality: "1080p",
      } as any);
      setRecording(false);
      if (video?.uri) {
        router.push({
          pathname: "/capturePreview" as any,
          params: {
            uri: video.uri,
            mediaType: "video",
            mode,
            filter,
            nonce: String(Date.now()),
          },
        });
      }
    } catch {
      setRecording(false);
    }
  };

  const handleOpenGallery = () => {
    router.push({
      pathname: "/mediaPicker" as any,
      params: {
        mode,
        filter,
      },
    });
  };

  const renderModeLabel = (value: CaptureMode, label: string) => {
    const active = mode === value;
    return (
      <TouchableOpacity
        key={value}
        onPress={() => setMode(value)}
        activeOpacity={0.8}
        style={styles.modeItem}
      >
        <Text style={[styles.modeText, active && styles.modeTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderFilterChip = (item: { id: FilterId; label: string }) => {
    const active = filter === item.id;
    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => setFilter(item.id)}
        activeOpacity={0.9}
        style={[styles.filterChip, active && styles.filterChipActive]}
      >
        <Text
          style={[styles.filterChipText, active && styles.filterChipTextActive]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const leftMenuItems = [
    { key: "criar", label: "Criar" },
    { key: "boomerang", label: "Boomerang" },
    { key: "layout", label: "Layout" },
    { key: "handsfree", label: "Mãos livres" },
    { key: "fechar", label: "Fechar" },
  ] as const;

  return (
    <View style={styles.container}>
      <CameraView
        ref={(ref) => {
          cameraRef.current = ref;
        }}
        style={styles.camera}
        facing={facing}
        enableTorch={flashOn}
        mode={mode === "reel" ? "video" : "picture"}
      />

      <LinearGradient
        colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0.0)"]}
        style={styles.topGradient}
      />

      <LinearGradient
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.9)"]}
        style={styles.bottomGradient}
      />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleClose} activeOpacity={0.8}>
          <Text style={styles.topIcon}>✕</Text>
        </TouchableOpacity>

        <View style={styles.soundBadge}>
          <Text style={styles.soundIcon}>♪</Text>
          <Text style={styles.soundText}>Adicionar som</Text>
        </View>

        <View style={styles.topRightIcons}>
          <Text style={styles.smallIcon}>⚙︎</Text>
        </View>
      </View>

      <View style={styles.leftMenu}>
        <View style={styles.leftMenuInner}>
          {leftMenuItems.map((item, index) => {
            const isTop = index === 0;
            const isBottom = index === leftMenuItems.length - 1;
            const isActive = item.key === "criar";
            const onPress = item.key === "fechar" ? handleClose : undefined;

            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.9}
                onPress={onPress}
                style={[
                  styles.leftMenuItem,
                  isTop && styles.leftMenuItemTop,
                  isBottom && styles.leftMenuItemBottom,
                  isActive && styles.leftMenuItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.leftMenuText,
                    isActive && styles.leftMenuTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.rightTools}>
        <TouchableOpacity onPress={toggleFacing} activeOpacity={0.8}>
          <Text style={styles.toolIcon}>↺</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleFlash} activeOpacity={0.8}>
          <Text style={styles.toolIcon}>{flashOn ? "⚡" : "⚡︎"}</Text>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8}>
          <Text style={styles.toolIcon}>⏱</Text>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8}>
          <Text style={styles.toolIcon}>✦</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomContent}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map(renderFilterChip)}
        </ScrollView>

        <View style={styles.modesRow}>
          {renderModeLabel("post", "Post")}
          {renderModeLabel("story", "Story")}
          {renderModeLabel("reel", "Reel")}
        </View>

        <View style={styles.captureRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenGallery}
            style={styles.thumbPlaceholder}
          >
            <Text style={styles.thumbText}>Galeria</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleShotPress}
            onLongPress={handleShotLongPress}
            onPressOut={() => {
              if (mode === "story" && recording && cameraRef.current) {
                cameraRef.current.stopRecording();
              }
            }}
            delayLongPress={200}
            style={styles.shotOuter}
          >
            <View
              style={[
                styles.shotInner,
                recording && { backgroundColor: "#ff3355" },
              ]}
            >
              {loadingCapture && <ActivityIndicator color="#fff" />}
            </View>
          </TouchableOpacity>

          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>Você</Text>
          </View>
        </View>

        <View style={styles.bottomTabsRow}>
          <Text style={styles.bottomTabText}>POST</Text>
          <Text style={styles.bottomTabText}>STORY</Text>
          <Text style={styles.bottomTabText}>REEL</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  camera: {
    width,
    height,
    position: "absolute",
    top: 0,
    left: 0,
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.25,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.35,
  },
  topBar: {
    position: "absolute",
    top: 26,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIcon: {
    color: "#fff",
    fontSize: 26,
  },
  soundBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  soundIcon: {
    color: "#fff",
    fontSize: 16,
    marginRight: 6,
  },
  soundText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  topRightIcons: {
    flexDirection: "row",
    alignItems: "center",
  },
  smallIcon: {
    color: "#fff",
    fontSize: 18,
  },
  leftMenu: {
    position: "absolute",
    left: 12,
    top: height * 0.18,
    bottom: height * 0.25,
    justifyContent: "center",
  },
  leftMenuInner: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  leftMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  leftMenuItemTop: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  leftMenuItemBottom: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomWidth: 0,
  },
  leftMenuItemActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  leftMenuText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: "600",
  },
  leftMenuTextActive: {
    color: "#fff",
    fontWeight: "800",
  },
  rightTools: {
    position: "absolute",
    right: 16,
    top: height * 0.25,
    alignItems: "center",
    gap: 22,
  },
  toolIcon: {
    color: "#fff",
    fontSize: 24,
  },
  bottomContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 26,
    paddingHorizontal: 20,
  },
  filtersRow: {
    paddingHorizontal: 4,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(0,0,0,0.5)",
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "#fff",
  },
  filterChipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#fff",
    fontWeight: "800",
  },
  modesRow: {
    flexDirection: "row",
    alignSelf: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modeItem: {
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  modeText: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "600",
  },
  modeTextActive: {
    color: "#fff",
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  thumbPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: {
    color: "#fff",
    fontSize: 11,
    textAlign: "center",
  },
  shotOuter: {
    width: 96,
    height: 96,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  shotInner: {
    width: 76,
    height: 76,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 11,
  },
  bottomTabsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    marginTop: 4,
  },
  bottomTabText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  permissionText: {
    color: Colors.text,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  permissionButton: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: Colors.border,
  },
  permissionButtonText: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    color: Colors.text,
    fontWeight: "600",
  },
});
