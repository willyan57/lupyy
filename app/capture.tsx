// app/capture.tsx
import Colors from "@/constants/Colors";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
type AspectRatio = "4:5" | "1:1" | "9:16" | "16:9";

const ASPECT_RATIOS: { key: AspectRatio; label: string; ratio: number }[] = [
  { key: "4:5", label: "4:5", ratio: 4 / 5 },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "9:16", label: "9:16", ratio: 9 / 16 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
];

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

  // Novos estados
  const [showGrid, setShowGrid] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0); // 0 = desligado, 3 ou 10
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [exposure, setExposure] = useState(0); // -1 a 1
  const [showExposure, setShowExposure] = useState(false);
  const exposureTrackRef = useRef<View>(null);
  const [exposureTrackY, setExposureTrackY] = useState(0);
  const [exposureTrackH, setExposureTrackH] = useState(0);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const countdownOpacity = useRef(new Animated.Value(0)).current;
  const countdownScale = useRef(new Animated.Value(0.5)).current;

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
          Precisamos da sua permissao para usar a camera.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={styles.permissionButton}
          activeOpacity={0.8}
        >
          <Text style={styles.permissionButtonText}>Permitir camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleFacing = () => {
    Animated.sequence([
      Animated.timing(flipAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(flipAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const toggleFlash = () => {
    setFlashOn((prev) => !prev);
  };

  const cycleTimer = () => {
    setTimerSeconds((prev) => {
      if (prev === 0) return 3;
      if (prev === 3) return 10;
      return 0;
    });
  };

  const toggleGrid = () => {
    setShowGrid((prev) => !prev);
  };

  const handleClose = () => {
    router.replace("/feed");
  };

  const startTimerThenCapture = () => {
    if (timerSeconds === 0) {
      executeCapture();
      return;
    }

    let count = timerSeconds;
    setTimerCountdown(count);

    // Animacao do countdown
    const tick = () => {
      countdownOpacity.setValue(1);
      countdownScale.setValue(0.5);
      Animated.parallel([
        Animated.timing(countdownScale, {
          toValue: 1.5,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(countdownOpacity, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();
    };

    tick();
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        setTimerCountdown(null);
        executeCapture();
      } else {
        setTimerCountdown(count);
        tick();
      }
    }, 1000);
  };

  const executeCapture = async () => {
    if (!cameraRef.current || loadingCapture) return;

    try {
      setLoadingCapture(true);
      let timeoutId: any;

      const shotPromise = cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
        exif: true,
      } as any);

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), 10000);
      });

      const photo: any = await Promise.race([shotPromise, timeoutPromise]);

      if (timeoutId) clearTimeout(timeoutId);

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
      Alert.alert("Erro na captura", "Nao foi possivel tirar a foto. Tente novamente.");
    }
  };

  const handleShotPress = async () => {
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
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        recordTimerRef.current = setInterval(() => {
          setRecordSeconds((prev) => prev + 1);
        }, 1000);

        const recordPromise = cameraRef.current.recordAsync({
          maxDuration: 60,
          quality: "1080p",
        } as any);

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
        Alert.alert("Erro na gravacao", "Nao foi possivel gravar o video. Tente novamente.");
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecording(false);
        setRecordSeconds(0);
      }
      return;
    }

    // Foto com timer
    startTimerThenCapture();
  };

  const handleShotLongPress = async () => {
    if (isWeb) return;
    if (!cameraRef.current || mode !== "story" || recording) return;

    let timeoutId: any;
    try {
      setRecording(true);
      setRecordSeconds(0);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);

      const recordPromise = cameraRef.current.recordAsync({
        maxDuration: 30,
        quality: "1080p",
      } as any);

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
      Alert.alert("Erro na gravacao", "Nao foi possivel gravar o video.");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setRecording(false);
      setRecordSeconds(0);
    }
  };

  const handleOpenGallery = () => {
    router.push({
      pathname: "/mediaPicker" as any,
      params: { mode, filter },
    });
  };

  const formatRecordTime = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
  };

  const handleExposureGesture = (evt: any) => {
    if (!exposureTrackH) return;
    const pageY =
      evt?.nativeEvent?.pageY ??
      evt?.nativeEvent?.changedTouches?.[0]?.pageY ??
      evt?.nativeEvent?.touches?.[0]?.pageY;
    if (typeof pageY !== "number") return;
    const relativeY = pageY - exposureTrackY;
    const ratio = 1.0 - relativeY / exposureTrackH; // invertido: cima = claro
    const clamped = Math.max(-1, Math.min(1, (ratio - 0.5) * 2));
    setExposure(Math.round(clamped * 100) / 100);
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
        {active && <View style={styles.modeActiveDot} />}
      </TouchableOpacity>
    );
  };

  // Camera preview dimensions based on aspect ratio
  const currentAR = ASPECT_RATIOS.find((a) => a.key === aspectRatio) || ASPECT_RATIOS[0];
  const cameraWidth = width;
  const cameraHeight = Math.min(height, cameraWidth / currentAR.ratio);

  const flipRotation = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.cameraWrap,
          {
            width: cameraWidth,
            height: cameraHeight,
            transform: [{ rotateY: flipRotation }],
          },
        ]}
      >
        <CameraView
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          style={StyleSheet.absoluteFill}
          facing={facing}
          enableTorch={flashOn}
          mode={mode === "reel" ? "video" : "picture"}
        />
      </Animated.View>

      {/* Grid overlay (regra dos tercos) */}
      {showGrid && (
        <View style={[styles.gridOverlay, { width: cameraWidth, height: cameraHeight }]} pointerEvents="none">
          <View style={[styles.gridLineH, { top: "33.33%" }]} />
          <View style={[styles.gridLineH, { top: "66.66%" }]} />
          <View style={[styles.gridLineV, { left: "33.33%" }]} />
          <View style={[styles.gridLineV, { left: "66.66%" }]} />
        </View>
      )}

      {/* Timer countdown */}
      {timerCountdown !== null && (
        <Animated.View
          style={[
            styles.countdownOverlay,
            {
              opacity: countdownOpacity,
              transform: [{ scale: countdownScale }],
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.countdownText}>{timerCountdown}</Text>
        </Animated.View>
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0.0)"]}
        style={styles.topGradient}
      />

      <LinearGradient
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.85)"]}
        style={styles.bottomGradient}
      />

      {/* Top bar */}
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

      {/* Right tools */}
      <View style={styles.rightTools}>
        <TouchableOpacity onPress={toggleFacing} activeOpacity={0.8}>
          <View style={styles.toolCircle}>
            <Text style={styles.toolIcon}>↺</Text>
          </View>
          <Text style={styles.toolLabel}>Girar</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleFlash} activeOpacity={0.8}>
          <View style={[styles.toolCircle, flashOn && styles.toolCircleActive]}>
            <Text style={styles.toolIcon}>{flashOn ? "⚡" : "⚡︎"}</Text>
          </View>
          <Text style={styles.toolLabel}>{flashOn ? "On" : "Off"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={cycleTimer} activeOpacity={0.8}>
          <View style={[styles.toolCircle, timerSeconds > 0 && styles.toolCircleActive]}>
            <Text style={styles.toolIcon}>⏱</Text>
          </View>
          <Text style={styles.toolLabel}>
            {timerSeconds === 0 ? "Timer" : `${timerSeconds}s`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleGrid} activeOpacity={0.8}>
          <View style={[styles.toolCircle, showGrid && styles.toolCircleActive]}>
            <Text style={styles.toolIcon}>⊞</Text>
          </View>
          <Text style={styles.toolLabel}>Grid</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowAspectMenu((prev) => !prev)}
          activeOpacity={0.8}
        >
          <View style={styles.toolCircle}>
            <Text style={styles.toolIcon}>⬒</Text>
          </View>
          <Text style={styles.toolLabel}>{aspectRatio}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowExposure((prev) => !prev)}
          activeOpacity={0.8}
        >
          <View style={styles.toolCircle}>
            <Text style={styles.toolIcon}>☀</Text>
          </View>
          <Text style={styles.toolLabel}>Exposicao</Text>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8}>
          <View style={styles.toolCircle}>
            <Text style={styles.toolIcon}>✦</Text>
          </View>
          <Text style={styles.toolLabel}>Filtros</Text>
        </TouchableOpacity>
      </View>

      {/* Aspect ratio menu */}
      {showAspectMenu && (
        <View style={styles.aspectMenu}>
          {ASPECT_RATIOS.map((ar) => (
            <TouchableOpacity
              key={ar.key}
              onPress={() => {
                setAspectRatio(ar.key);
                setShowAspectMenu(false);
              }}
              style={[
                styles.aspectChip,
                aspectRatio === ar.key && styles.aspectChipActive,
              ]}
            >
              <Text
                style={[
                  styles.aspectChipText,
                  aspectRatio === ar.key && styles.aspectChipTextActive,
                ]}
              >
                {ar.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Exposure slider (vertical) */}
      {showExposure && (
        <View style={styles.exposureWrap}>
          <Text style={styles.exposureLabel}>+</Text>
          <View
            style={styles.exposureTrack}
            ref={exposureTrackRef}
            onLayout={() => {
              exposureTrackRef.current?.measureInWindow((_x, y, _w, h) => {
                setExposureTrackY(y);
                setExposureTrackH(h);
              });
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleExposureGesture}
            onResponderMove={handleExposureGesture}
          >
            <View
              style={[
                styles.exposureThumb,
                {
                  top: `${(1.0 - (exposure + 1) / 2) * 100}%`,
                },
              ]}
            />
            <View style={styles.exposureCenter} />
          </View>
          <Text style={styles.exposureLabel}>−</Text>
          <Text style={styles.exposureValue}>{exposure > 0 ? "+" : ""}{exposure.toFixed(1)}</Text>
        </View>
      )}

      {/* Bottom */}
      <View style={styles.bottomContent}>
        <View style={styles.modesRow}>
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
                recording && { backgroundColor: "#ff3355", borderRadius: 12 },
              ]}
            >
              {loadingCapture && <ActivityIndicator color="#fff" />}
            </View>
          </TouchableOpacity>

          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>Voce</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
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
    right: 12,
    top: height * 0.14,
    alignItems: "center",
    gap: 16,
  },
  toolCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolCircleActive: {
    backgroundColor: "rgba(255,51,85,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,51,85,0.6)",
  },
  toolIcon: {
    color: "#fff",
    fontSize: 20,
  },
  toolLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  // Grid
  gridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  // Timer countdown
  countdownOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  countdownText: {
    color: "#fff",
    fontSize: 120,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  // Aspect ratio menu
  aspectMenu: {
    position: "absolute",
    right: 70,
    top: height * 0.34,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 16,
    padding: 8,
    gap: 4,
  },
  aspectChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  aspectChipActive: {
    backgroundColor: "rgba(255,51,85,0.25)",
  },
  aspectChipText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "700",
  },
  aspectChipTextActive: {
    color: "#fff",
  },
  // Exposure slider
  exposureWrap: {
    position: "absolute",
    right: 70,
    top: height * 0.2,
    height: height * 0.35,
    alignItems: "center",
    gap: 6,
  },
  exposureTrack: {
    flex: 1,
    width: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    position: "relative",
  },
  exposureThumb: {
    position: "absolute",
    left: -10,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    transform: [{ translateY: -12 }],
  },
  exposureCenter: {
    position: "absolute",
    top: "50%",
    left: -3,
    width: 10,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  exposureLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    fontWeight: "700",
  },
  exposureValue: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  // Bottom
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
    alignItems: "center",
  },
  modeText: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "600",
  },
  modeTextActive: {
    color: "#fff",
  },
  modeActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#fff",
    marginTop: 4,
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
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.4)",
  },
  shotInner: {
    width: 72,
    height: 72,
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
