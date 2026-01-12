// app/capture.tsx
import Colors from "@/constants/Colors";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");
const isWeb = Platform.OS === "web";

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
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<any>(null);


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
    if (isWeb) {
      handleOpenGallery();
      return;
    }

    if (!cameraRef.current || loadingCapture) return;

    if (mode === "reel") {
      if (recording) {
        if (cameraRef.current) {
          cameraRef.current.stopRecording();
        }
        return;
      }
      let timeoutId: any;
      try {
        setRecording(true);
        setRecordSeconds(0);
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
        }
        recordTimerRef.current = setInterval(() => {
          setRecordSeconds((prev) => prev + 1);
        }, 1000);

        const recordPromise = cameraRef.current.recordAsync(
          {
            maxDuration: 60,
            quality: "1080p",
          } as any
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("timeout")), 61000);
        });

        const video: any = await Promise.race([recordPromise, timeoutPromise]);
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
      } catch (e) {
        Alert.alert(
          "Erro na gravação",
          "Não foi possível gravar o vídeo. Tente novamente."
        );
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecording(false);
        setRecordSeconds(0);
      }
      return;
    }

    try {
      setLoadingCapture(true);
      let timeoutId: any;

      const shotPromise = cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), 10000);
      });

      const photo: any = await Promise.race([shotPromise, timeoutPromise]);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

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
    } catch (e) {
      setLoadingCapture(false);
      Alert.alert(
        "Erro na captura",
        "Não foi possível tirar a foto. Tente novamente."
      );
    }
  };

  const handleShotLongPress = async () => {
    if (isWeb) {
      return;
    }

    if (!cameraRef.current || mode !== "story" || recording) return;

    let timeoutId: any;
    try {
      setRecording(true);
      setRecordSeconds(0);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);

      const recordPromise = cameraRef.current.recordAsync(
        {
          maxDuration: 30,
          quality: "1080p",
        } as any
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), 31000);
      });

      const video: any = await Promise.race([recordPromise, timeoutPromise]);
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
    } catch (e) {
      Alert.alert(
        "Erro na gravação",
        "Não foi possível gravar o vídeo. Tente novamente."
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setRecording(false);
      setRecordSeconds(0);
    }
  };

  const handleOpenGallery = () => {
    if (isWeb) {
      router.push({
        pathname: "/new" as any,
        params: {
          source: "gallery",
        },
      });
    } else {
      router.push({
        pathname: "/mediaPicker" as any,
        params: {
          mode,
          filter,
        },
      });
    }
  };

  const formatRecordTime = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    const mm = m < 10 ? `0${m}` : String(m);
    const ss = s < 10 ? `0${s}` : String(s);
    return `${mm}:${ss}`;
  };

  const renderModeLabel = (value: CaptureMode, label: string) => {
    const active = mode === value;
    const disabled = recording;
    return (
      <TouchableOpacity
        key={value}
        onPress={disabled ? undefined : () => setMode(value)}
        activeOpacity={disabled ? 1 : 0.8}
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
      {isWeb ? (
        <View style={styles.cameraPlaceholder} />
      ) : (
        <CameraView
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          style={styles.camera}
          facing={facing}
          enableTorch={flashOn}
          mode={mode === "reel" ? "video" : "picture"}
        />
      )}

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
          {recording && (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>
                REC {formatRecordTime(recordSeconds)}
              </Text>
            </View>
          )}
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
            activeOpacity={recording ? 1 : 0.8}
            onPress={recording ? undefined : handleOpenGallery}
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
  cameraPlaceholder: {
    width,
    height,
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "#000",
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
    gap: 12,
  },
  recBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#ff3355",
    marginRight: 6,
  },
  recText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
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