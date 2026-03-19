// app/capture.tsx — Premium Instagram-style Camera
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");
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

const GALLERY_THUMB = (W - 4) / 4; // 4 columns, 1px gap

// ──────────────────────────────────────────────
export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // Camera state
  const [facing, setFacing] = useState<CameraType>("back");
  const [flashOn, setFlashOn] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("story");
  const [filter] = useState<FilterId>("none");
  const [recording, setRecording] = useState(false);
  const [loadingCapture, setLoadingCapture] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<any>(null);

  // Pro controls
  const [showGrid, setShowGrid] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [exposure, setExposure] = useState(0);
  const [showExposure, setShowExposure] = useState(false);
  const exposureTrackRef = useRef<any>(null);
  const [exposureTrackY, setExposureTrackY] = useState(0);
  const [exposureTrackH, setExposureTrackH] = useState(0);

  // Right tools expand/collapse
  const [toolsExpanded, setToolsExpanded] = useState(false);

  // Gallery state (Post mode bottom gallery)
  const [galleryAssets, setGalleryAssets] = useState<MediaLibrary.Asset[]>([]);
  const [galleryAlbums, setGalleryAlbums] = useState<MediaLibrary.Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>("Recentes");
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [selectedGalleryUri, setSelectedGalleryUri] = useState<string | null>(null);
  const [galleryPermission, setGalleryPermission] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(false); // full screen gallery

  // Animations
  const flipAnim = useRef(new Animated.Value(0)).current;
  const countdownOpacity = useRef(new Animated.Value(0)).current;
  const countdownScale = useRef(new Animated.Value(0.5)).current;
  const shotScale = useRef(new Animated.Value(1)).current;

  const cameraRef = useRef<any>(null);

  // ── Permissions ──
  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    (async () => {
      if (isWeb) return;
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        setGalleryPermission(true);
        loadGalleryAssets();
        loadAlbums();
      }
    })();
  }, []);

  const loadGalleryAssets = async (albumId?: string) => {
    try {
      const opts: MediaLibrary.AssetsOptions = {
        first: 50,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      };
      if (albumId) opts.album = albumId;
      const result = await MediaLibrary.getAssetsAsync(opts);
      setGalleryAssets(result.assets);
      if (result.assets.length > 0 && !selectedGalleryUri) {
        setSelectedGalleryUri(result.assets[0].uri);
      }
    } catch (_) {}
  };

  const loadAlbums = async () => {
    try {
      const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      setGalleryAlbums(albums.filter((a) => a.assetCount > 0));
    } catch (_) {}
  };

  const selectAlbum = (album: MediaLibrary.Album | null) => {
    setSelectedAlbum(album ? album.title : "Recentes");
    setShowAlbumPicker(false);
    loadGalleryAssets(album?.id);
  };

  // ── Permission screens ──
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Precisamos da sua permissão para usar a câmera.
        </Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton} activeOpacity={0.8}>
          <Text style={styles.permissionButtonText}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Handlers ──
  const toggleFacing = () => {
    Animated.sequence([
      Animated.timing(flipAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start();
    setFacing((c) => (c === "back" ? "front" : "back"));
  };

  const toggleFlash = () => setFlashOn((p) => !p);

  const cycleTimer = () => {
    setTimerSeconds((p) => (p === 0 ? 3 : p === 3 ? 10 : 0));
  };

  const toggleGrid = () => setShowGrid((p) => !p);

  const handleClose = () => router.replace("/feed");

  const getPreviewRotationFromExif = (photo: any) => {
    const rawOrientation =
      photo?.exif?.Orientation ??
      photo?.exif?.orientation ??
      photo?.exif?.TIFF?.Orientation ??
      null;

    switch (Number(rawOrientation)) {
      case 3:
        return "180";
      case 6:
        return "90";
      case 8:
        return "-90";
      default:
        return "0";
    }
  };

  const startTimerThenCapture = () => {
    if (timerSeconds === 0) { executeCapture(); return; }
    let count = timerSeconds;
    setTimerCountdown(count);
    const tick = () => {
      countdownOpacity.setValue(1);
      countdownScale.setValue(0.5);
      Animated.parallel([
        Animated.timing(countdownScale, { toValue: 1.5, duration: 800, useNativeDriver: true }),
        Animated.timing(countdownOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]).start();
    };
    tick();
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) { clearInterval(interval); setTimerCountdown(null); executeCapture(); }
      else { setTimerCountdown(count); tick(); }
    }, 1000);
  };

  const executeCapture = async () => {
    if (!cameraRef.current || loadingCapture) return;
    try {
      setLoadingCapture(true);
      const photo: any = await Promise.race([
        cameraRef.current.takePictureAsync({
          quality: Platform.OS === "web" ? 0.92 : 1,
          skipProcessing: Platform.OS === "web",
          exif: Platform.OS !== "web",
        } as any),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
      ]);

      if (photo?.uri) {
        let previewUri = photo.uri;
        let previewWidth = Number(photo?.width ?? 0);
        let previewHeight = Number(photo?.height ?? 0);

        if (Platform.OS !== "web") {
          try {
            const ImageManipulator = await import("expo-image-manipulator");
            const normalized = await ImageManipulator.manipulateAsync(
              photo.uri,
              [{ rotate: 0 }],
              {
                compress: 1,
                format: ImageManipulator.SaveFormat.JPEG,
              }
            );

            if (normalized?.uri) {
              previewUri = normalized.uri;
              previewWidth = Number(normalized?.width ?? previewWidth);
              previewHeight = Number(normalized?.height ?? previewHeight);
            }
          } catch (normalizationError) {
            console.warn("Falha ao normalizar foto capturada:", normalizationError);
          }
        }

        setLoadingCapture(false);
        router.push({
          pathname: "/capturePreview" as any,
          params: {
            uri: previewUri,
            mediaType: "image",
            mode,
            filter,
            facing,
            aspectRatio,
            width: previewWidth > 0 ? String(previewWidth) : undefined,
            height: previewHeight > 0 ? String(previewHeight) : undefined,
            nonce: String(Date.now()),
          },
        });
        return;
      }

      setLoadingCapture(false);
    } catch {
      setLoadingCapture(false);
      Alert.alert("Erro na captura", "Não foi possível tirar a foto.");
    }
  };

  const startRecording = async (maxDuration: number) => {
    if (!cameraRef.current || recording) return;
    try {
      setRecording(true);
      setRecordSeconds(0);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => setRecordSeconds((p) => p + 1), 1000);

      // Animate shot button
      Animated.spring(shotScale, { toValue: 1.2, useNativeDriver: true }).start();

      const video: any = await Promise.race([
        cameraRef.current.recordAsync({ maxDuration, quality: "1080p" } as any),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), (maxDuration + 1) * 1000)),
      ]);
      if (video?.uri) {
        router.push({
          pathname: "/capturePreview" as any,
          params: { uri: video.uri, mediaType: "video", mode, filter, nonce: String(Date.now()) },
        });
      }
    } catch {
      Alert.alert("Erro na gravação", "Não foi possível gravar o vídeo.");
    } finally {
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setRecording(false);
      setRecordSeconds(0);
      Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const stopRecording = () => {
    if (cameraRef.current && recording) {
      cameraRef.current.stopRecording();
    }
  };

  const handleShotPress = () => {
    if (!cameraRef.current || loadingCapture) return;
    if (mode === "reel") {
      if (recording) { stopRecording(); return; }
      startRecording(60);
      return;
    }
    if (mode === "story") {
      // Short press = photo, long press = video (handled separately)
      startTimerThenCapture();
      return;
    }
    // Post mode
    if (selectedGalleryUri) {
      router.push({
        pathname: "/capturePreview" as any,
        params: { uri: selectedGalleryUri, mediaType: "image", mode, filter, nonce: String(Date.now()) },
      });
      return;
    }
    startTimerThenCapture();
  };

  const handleShotLongPress = () => {
    if (isWeb || !cameraRef.current || recording) return;
    if (mode === "story") {
      startRecording(30);
    }
  };

  const handleShotPressOut = () => {
    if (mode === "story" && recording) stopRecording();
  };

  const handleOpenGallery = () => {
    router.push({ pathname: "/mediaPicker" as any, params: { mode, filter } });
  };

  const formatRecordTime = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
  };

  const handleExposureGesture = (evt: any) => {
    if (!exposureTrackH) return;
    const pageY = evt?.nativeEvent?.pageY ?? evt?.nativeEvent?.changedTouches?.[0]?.pageY;
    if (typeof pageY !== "number") return;
    const relativeY = pageY - exposureTrackY;
    const ratio = 1.0 - relativeY / exposureTrackH;
    const clamped = Math.max(-1, Math.min(1, (ratio - 0.5) * 2));
    setExposure(Math.round(clamped * 100) / 100);
  };

  // ── Computed ──
  const isPostMode = mode === "post";
  const isVideoMode = mode === "reel" || (mode === "story" && recording);
  const showGallery = isPostMode && galleryPermission && !isWeb;

  // Aspect ratio applied to camera view
  const selectedAR = ASPECT_RATIOS.find((ar) => ar.key === aspectRatio) ?? ASPECT_RATIOS[2]; // default 9:16
  const cameraHeight = showGallery
    ? (galleryExpanded ? H * 0.35 : H * 0.55)
    : Math.min(H, W / selectedAR.ratio);
  const cameraWidth = showGallery ? W : Math.min(W, cameraHeight * selectedAR.ratio);

  const flipRotation = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  // Primary right tools (always visible)
  const primaryTools = [
    { key: "flash", icon: flashOn ? "⚡" : "⚡︎", label: flashOn ? "On" : "Off", onPress: toggleFlash, active: flashOn },
  ];

  // Secondary tools (expand with +)
  const secondaryTools = [
    { key: "timer", icon: "⏱", label: timerSeconds === 0 ? "Timer" : `${timerSeconds}s`, onPress: cycleTimer, active: timerSeconds > 0 },
    { key: "grid", icon: "⊞", label: "Grid", onPress: toggleGrid, active: showGrid },
    { key: "aspect", icon: "⬒", label: aspectRatio, onPress: () => setShowAspectMenu((p) => !p) },
    { key: "exposure", icon: "☀", label: "Exposição", onPress: () => setShowExposure((p) => !p) },
  ];

  // ── Render ──
  return (
    <View style={styles.container}>
      {/* Camera preview */}
      <Animated.View
        style={[
          styles.cameraWrap,
          {
            width: cameraWidth,
            height: cameraHeight,
            alignSelf: "center",
            transform: [{ rotateY: flipRotation }],
          },
        ]}
      >
        <CameraView
          ref={(ref: any) => { cameraRef.current = ref; }}
          style={StyleSheet.absoluteFill}
          facing={facing}
          enableTorch={flashOn && facing === "back"}
          mode={(mode as string) === "reel" || isVideoMode ? "video" : "picture"}
        />
      </Animated.View>

      {/* Grid overlay */}
      {showGrid && (
        <View style={[styles.gridOverlay, { width: W, height: cameraHeight }]} pointerEvents="none">
          <View style={[styles.gridLineH, { top: "33.33%" }]} />
          <View style={[styles.gridLineH, { top: "66.66%" }]} />
          <View style={[styles.gridLineV, { left: "33.33%" }]} />
          <View style={[styles.gridLineV, { left: "66.66%" }]} />
        </View>
      )}

      {/* Timer countdown overlay */}
      {timerCountdown !== null && (
        <Animated.View
          style={[styles.countdownOverlay, { opacity: countdownOpacity, transform: [{ scale: countdownScale }] }]}
          pointerEvents="none"
        >
          <Text style={styles.countdownText}>{timerCountdown}</Text>
        </Animated.View>
      )}

      {/* Top gradient */}
      <LinearGradient colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0)"]} style={styles.topGradient} />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleClose} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.topIcon}>✕</Text>
        </TouchableOpacity>

        {!isPostMode && (
          <TouchableOpacity activeOpacity={0.7} style={styles.soundBadge}>
            <Text style={styles.soundIcon}>♪</Text>
            <Text style={styles.soundText}>Adicionar som</Text>
          </TouchableOpacity>
        )}

        {isPostMode && (
          <Text style={styles.headerTitle}>Novo post</Text>
        )}

        {recording && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC {formatRecordTime(recordSeconds)}</Text>
          </View>
        )}

        {isPostMode ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => {
            if (selectedGalleryUri) {
              router.push({
                pathname: "/capturePreview" as any,
                params: { uri: selectedGalleryUri, mediaType: "image", mode, filter, nonce: String(Date.now()) },
              });
            }
          }}>
            <Text style={styles.nextText}>Avançar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={styles.topIcon}>⚙</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* ── Right side tools ── */}
      {!isPostMode && (
        <View style={styles.rightTools}>
          {primaryTools.map((t) => (
            <TouchableOpacity key={t.key} onPress={t.onPress} activeOpacity={0.7}>
              <View style={[styles.toolCircle, t.active && styles.toolCircleActive]}>
                <Text style={styles.toolIcon}>{t.icon}</Text>
              </View>
              <Text style={styles.toolLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}

          {toolsExpanded && secondaryTools.map((t) => (
            <TouchableOpacity key={t.key} onPress={t.onPress} activeOpacity={0.7}>
              <View style={[styles.toolCircle, t.active && styles.toolCircleActive]}>
                <Text style={styles.toolIcon}>{t.icon}</Text>
              </View>
              <Text style={styles.toolLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}

          {/* Expand/Collapse "+" button */}
          <TouchableOpacity onPress={() => setToolsExpanded((p) => !p)} activeOpacity={0.7}>
            <View style={styles.toolCircle}>
              <Text style={[styles.toolIcon, { fontSize: 22 }]}>
                {toolsExpanded ? "−" : "+"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Aspect ratio popup */}
      {showAspectMenu && (
        <View style={styles.aspectMenu}>
          {ASPECT_RATIOS.map((ar) => (
            <TouchableOpacity
              key={ar.key}
              onPress={() => { setAspectRatio(ar.key); setShowAspectMenu(false); }}
              style={[styles.aspectChip, aspectRatio === ar.key && styles.aspectChipActive]}
            >
              <Text style={[styles.aspectChipText, aspectRatio === ar.key && styles.aspectChipTextActive]}>
                {ar.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Exposure slider */}
      {showExposure && (
        <View style={styles.exposureWrap}>
          <Text style={styles.exposureLabel}>+</Text>
          <View
            style={styles.exposureTrack}
            ref={exposureTrackRef}
            onLayout={() => {
              exposureTrackRef.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
                setExposureTrackY(y);
                setExposureTrackH(h);
              });
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleExposureGesture}
            onResponderMove={handleExposureGesture}
          >
            <View style={[styles.exposureThumb, { top: `${(1.0 - (exposure + 1) / 2) * 100}%` }]} />
            <View style={styles.exposureCenter} />
          </View>
          <Text style={styles.exposureLabel}>−</Text>
          <Text style={styles.exposureValue}>{exposure > 0 ? "+" : ""}{exposure.toFixed(1)}</Text>
        </View>
      )}

      {/* ── Bottom section ── */}
      {!isPostMode ? (
        /* Story/Reel bottom */
        <View style={[styles.bottomStory, { paddingBottom: (Platform.OS === "android" ? Math.max(insets.bottom, 18) + 20 : insets.bottom + 10) }]}>
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.8)"]} style={styles.bottomGradientInner} />

          {/* Shot button + gallery + flip */}
          <View style={styles.captureRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleOpenGallery}
              style={styles.galleryThumb}
            >
              {galleryAssets[0] ? (
                <Image source={{ uri: galleryAssets[0].uri }} style={styles.galleryThumbImg} />
              ) : (
                <Text style={styles.galleryThumbIcon}>🖼</Text>
              )}
            </TouchableOpacity>

            <Animated.View style={{ transform: [{ scale: shotScale }] }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleShotPress}
                onLongPress={handleShotLongPress}
                onPressOut={handleShotPressOut}
                delayLongPress={200}
                style={[styles.shotOuter, recording && styles.shotOuterRecording]}
              >
                <View style={[styles.shotInner, recording && styles.shotInnerRecording]}>
                  {loadingCapture && <ActivityIndicator color="#000" />}
                </View>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity onPress={toggleFacing} activeOpacity={0.7} style={styles.bottomFlipBtn}>
              <Text style={styles.bottomFlipIcon}>↺</Text>
            </TouchableOpacity>
          </View>

          {/* Mode tabs */}
          <View style={styles.modesRow}>
            {(["post", "story", "reel"] as CaptureMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={recording ? undefined : () => setMode(m)}
                activeOpacity={recording ? 1 : 0.7}
                style={styles.modeItem}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                  {m === "post" ? "POST" : m === "story" ? "STORY" : "REEL"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        /* Post mode — Instagram-style gallery bottom */
        <View style={[styles.bottomPost, galleryExpanded && styles.bottomPostExpanded]}>
          {/* Selected image preview (small, on top of gallery) */}
          {!galleryExpanded && selectedGalleryUri && (
            <View style={styles.selectedPreviewRow}>
              <TouchableOpacity
                onPress={() => setGalleryExpanded(true)}
                activeOpacity={0.7}
                style={styles.expandBtn}
              >
                <Text style={styles.expandIcon}>⌃</Text>
              </TouchableOpacity>
            </View>
          )}

          {galleryExpanded && (
            <View style={styles.selectedPreviewRow}>
              <TouchableOpacity
                onPress={() => setGalleryExpanded(false)}
                activeOpacity={0.7}
                style={styles.expandBtn}
              >
                <Text style={[styles.expandIcon, { transform: [{ rotate: "180deg" }] }]}>⌃</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Album selector */}
          <View style={styles.albumRow}>
            <TouchableOpacity
              onPress={() => setShowAlbumPicker((p) => !p)}
              activeOpacity={0.7}
              style={styles.albumSelector}
            >
              <Text style={styles.albumText}>{selectedAlbum}</Text>
              <Text style={styles.albumArrow}>ˇ</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} style={styles.selectMultiBtn}>
              <Text style={styles.selectMultiIcon}>⧉</Text>
              <Text style={styles.selectMultiText}>Selecionar</Text>
            </TouchableOpacity>
          </View>

          {/* Album picker dropdown */}
          {showAlbumPicker && (
            <ScrollView style={styles.albumDropdown} nestedScrollEnabled>
              <TouchableOpacity onPress={() => selectAlbum(null)} style={styles.albumDropdownItem}>
                <Text style={[styles.albumDropdownText, selectedAlbum === "Recentes" && { color: "#3897f0" }]}>
                  Recentes
                </Text>
              </TouchableOpacity>
              {galleryAlbums.map((a) => (
                <TouchableOpacity key={a.id} onPress={() => selectAlbum(a)} style={styles.albumDropdownItem}>
                  <Text style={[styles.albumDropdownText, selectedAlbum === a.title && { color: "#3897f0" }]}>
                    {a.title} ({a.assetCount})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Gallery grid */}
          <FlatList
            data={galleryAssets}
            numColumns={4}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.galleryGrid}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedGalleryUri(item.uri)}
                style={[
                  styles.galleryItem,
                  selectedGalleryUri === item.uri && styles.galleryItemSelected,
                ]}
              >
                <Image source={{ uri: item.uri }} style={styles.galleryItemImg} />
                {item.mediaType === "video" && (
                  <View style={styles.videoOverlay}>
                    <Text style={styles.videoDuration}>
                      {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, "0")}
                    </Text>
                  </View>
                )}
                {selectedGalleryUri === item.uri && (
                  <View style={styles.galleryCheckOverlay}>
                    <View style={styles.galleryCheck}>
                      <Text style={styles.galleryCheckText}>✓</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />

          {/* Bottom mode tabs (Post mode) */}
          <View style={[styles.postModesRow, { paddingBottom: (Platform.OS === "android" ? Math.max(insets.bottom, 18) + 12 : insets.bottom + 8) }]}>
            <TouchableOpacity onPress={handleOpenGallery} activeOpacity={0.7} style={styles.postGalleryBtn}>
              <Text style={styles.postGalleryIcon}>🖼</Text>
            </TouchableOpacity>
            {(["post", "story", "reel"] as CaptureMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                activeOpacity={0.7}
                style={styles.modeItem}
              >
                <Text style={[styles.modeTextPost, mode === m && styles.modeTextPostActive]}>
                  {m.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={toggleFacing} activeOpacity={0.7}>
              <Text style={styles.postFlipIcon}>↺</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // Camera
  cameraWrap: { position: "absolute", top: 0, left: 0, overflow: "hidden", borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },

  // Gradients
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  bottomGradientInner: { position: "absolute", bottom: 0, left: 0, right: 0, height: 220 },

  // Top bar
  topBar: { position: "absolute", top: Platform.OS === "ios" ? 54 : 36, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 10 },
  topIcon: { color: "#fff", fontSize: 26, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  nextText: { color: "#3897f0", fontSize: 17, fontWeight: "700" },
  soundBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)" },
  soundIcon: { color: "#fff", fontSize: 14, marginRight: 5 },
  soundText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  recBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(255,30,50,0.85)" },
  recDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: "#fff", marginRight: 5 },
  recText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Right tools
  rightTools: { position: "absolute", right: 14, top: Platform.OS === "ios" ? 110 : 90, alignItems: "center", gap: 14, zIndex: 5 },
  toolCircle: { width: 42, height: 42, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  toolCircleActive: { backgroundColor: "rgba(255,51,85,0.3)", borderWidth: 1.5, borderColor: "rgba(255,51,85,0.6)" },
  toolIcon: { color: "#fff", fontSize: 18 },
  toolLabel: { color: "rgba(255,255,255,0.75)", fontSize: 9, fontWeight: "600", textAlign: "center", marginTop: 2 },

  // Grid
  gridOverlay: { position: "absolute", top: 0, left: 0, zIndex: 2 },
  gridLineH: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.3)" },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.3)" },

  // Countdown
  countdownOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 20 },
  countdownText: { color: "#fff", fontSize: 120, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 20 },

  // Aspect menu
  aspectMenu: { position: "absolute", right: 68, top: H * 0.28, backgroundColor: "rgba(0,0,0,0.85)", borderRadius: 14, padding: 6, gap: 2, zIndex: 15 },
  aspectChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  aspectChipActive: { backgroundColor: "rgba(255,51,85,0.25)" },
  aspectChipText: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "700" },
  aspectChipTextActive: { color: "#fff" },

  // Exposure
  exposureWrap: { position: "absolute", right: 68, top: H * 0.2, height: H * 0.28, alignItems: "center", gap: 4, zIndex: 15 },
  exposureTrack: { flex: 1, width: 3, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.2)", position: "relative" },
  exposureThumb: { position: "absolute", left: -10, width: 22, height: 22, borderRadius: 99, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4, transform: [{ translateY: -11 }] },
  exposureCenter: { position: "absolute", top: "50%", left: -3, width: 9, height: 2, backgroundColor: "rgba(255,255,255,0.4)" },
  exposureLabel: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "700" },
  exposureValue: { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: 2 },

  // ── Bottom: Story/Reel mode ──
  bottomStory: { position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: 24 },
  captureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingHorizontal: 30, marginBottom: 18 },
  galleryThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  galleryThumbImg: { width: 48, height: 48, borderRadius: 12 },
  galleryThumbIcon: { fontSize: 22 },

  shotOuter: { width: 80, height: 80, borderRadius: 99, alignItems: "center", justifyContent: "center", borderWidth: 3.5, borderColor: "rgba(255,255,255,0.9)" },
  shotOuterRecording: { borderColor: "#ff3355" },
  shotInner: { width: 64, height: 64, borderRadius: 99, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  shotInnerRecording: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#ff3355" },

  bottomFlipBtn: { width: 48, height: 48, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  bottomFlipIcon: { color: "#fff", fontSize: 22 },

  modesRow: { flexDirection: "row", justifyContent: "center", gap: 6, paddingTop: 4, paddingBottom: 2 },
  modeItem: { paddingHorizontal: 14, paddingVertical: 6 },
  modeText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  modeTextActive: { color: "#fff" },

  // ── Bottom: Post mode (gallery) ──
  bottomPost: { position: "absolute", left: 0, right: 0, bottom: 0, top: H * 0.55, backgroundColor: "#000" },
  bottomPostExpanded: { top: H * 0.35 },

  selectedPreviewRow: { alignItems: "center", paddingVertical: 4 },
  expandBtn: { padding: 6 },
  expandIcon: { color: "rgba(255,255,255,0.6)", fontSize: 18, fontWeight: "700" },

  albumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  albumSelector: { flexDirection: "row", alignItems: "center", gap: 6 },
  albumText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  albumArrow: { color: "rgba(255,255,255,0.6)", fontSize: 18, fontWeight: "700" },
  selectMultiBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, gap: 6 },
  selectMultiIcon: { color: "#fff", fontSize: 14 },
  selectMultiText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  albumDropdown: { position: "absolute", top: 80, left: 16, right: 16, maxHeight: 200, backgroundColor: "rgba(30,30,30,0.97)", borderRadius: 14, padding: 8, zIndex: 20 },
  albumDropdownItem: { paddingVertical: 10, paddingHorizontal: 12 },
  albumDropdownText: { color: "#fff", fontSize: 15 },

  galleryGrid: { paddingHorizontal: 1 },
  galleryItem: { width: GALLERY_THUMB, height: GALLERY_THUMB, margin: 0.5 },
  galleryItemSelected: { opacity: 0.7 },
  galleryItemImg: { width: "100%", height: "100%", borderRadius: 2 },
  videoOverlay: { position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  videoDuration: { color: "#fff", fontSize: 10, fontWeight: "600" },
  galleryCheckOverlay: { position: "absolute", top: 6, right: 6 },
  galleryCheck: { width: 22, height: 22, borderRadius: 99, backgroundColor: "#3897f0", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#fff" },
  galleryCheckText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  postModesRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", paddingTop: 10, paddingBottom: 12, paddingHorizontal: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.1)" },
  postGalleryBtn: { padding: 8 },
  postGalleryIcon: { fontSize: 20 },
  modeTextPost: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "700", letterSpacing: 0.5, paddingHorizontal: 10, paddingVertical: 6 },
  modeTextPostActive: { color: "#fff" },
  postFlipIcon: { color: "#fff", fontSize: 22, padding: 8 },

  // Permission
  permissionContainer: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  permissionText: { color: "#fff", fontSize: 15, textAlign: "center", marginBottom: 20, lineHeight: 22 },
  permissionButton: { borderRadius: 99, overflow: "hidden", backgroundColor: "#3897f0", paddingHorizontal: 24, paddingVertical: 12 },
  permissionButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
