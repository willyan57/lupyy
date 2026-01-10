// app/capture.tsx
import Colors from "@/constants/Colors";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");

type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "warm" | "cool" | "night" | "pink" | "gold";

export default function CaptureScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<CameraType>("back");
  const [flashOn, setFlashOn] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("post");
  const [filter] = useState<FilterId>("none");
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

        const video = await cameraRef.current?.recordAsync(
          {
            maxDuration: 60,
            quality: "1080p",
          } as any
        );
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
      const video = await cameraRef.current.recordAsync(
        {
          maxDuration: 30,
          quality: "1080p",
        } as any
      );
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
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.85)"]}
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
          <Text style={styles.smallIcon}>⧉</Text>
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
        <View className="modesRow" style={styles.modesRow}>
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
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  modesRow: {
    flexDirection: "row",
    alignSelf: "center",
    marginBottom: 16,
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
    marginBottom: 18,
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
  },
  permissionButtonText: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.brandStart,
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});