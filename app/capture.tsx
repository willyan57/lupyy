// app/capture.tsx — Premium Instagram-style Camera with Layout Collage, Video, Live Filters, AR & Effects
import FaceAROverlay from "@/components/FaceAROverlay";
import { LIVE_FILTERS, type LiveFilterDef } from "@/components/LiveFilterCarousel";
import type { AREffectId } from "@/lib/ar/faceDetection";
import { EFFECTS, getEffectCSSFilter, type EffectId } from "@/lib/gl/webglEffects";
import { getPreviewTintLayers } from "@/lib/livePreviewTint";
import { createVideoRecorder, type VideoRecorderInstance } from "@/lib/videoRecorder";
import { saveCollageDraft } from "@/lib/captureDraftStore";
import { useFocusEffect } from "@react-navigation/native";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const isCapacitor = isWeb && (
  typeof (window as any)?.Capacitor !== "undefined" ||
  typeof (window as any)?.AndroidBridge !== "undefined" ||
  document?.URL?.startsWith("http://localhost") ||
  navigator?.userAgent?.includes("Capacitor")
);

type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "warm" | "cool" | "night" | "pink" | "gold";
type CollageLayout = "none" | "2x1" | "1x2" | "2x2" | "3x1" | "1x3";

const GALLERY_THUMB = (W - 4) / 4;

/* ── Layout definitions with slot geometry (fraction of container) ── */
type SlotGeo = { x: number; y: number; w: number; h: number };

const COLLAGE_CONFIGS: Record<CollageLayout, { label: string; icon: string; slots: SlotGeo[] }> = {
  none: { label: "Normal", icon: "▣", slots: [{ x: 0, y: 0, w: 1, h: 1 }] },
  "2x1": {
    label: "2 Lado",
    icon: "▥",
    slots: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  "1x2": {
    label: "2 Cima",
    icon: "▤",
    slots: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  "2x2": {
    label: "4 Grid",
    icon: "⊞",
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  "3x1": {
    label: "3 Faixas H",
    icon: "≡",
    slots: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  "1x3": {
    label: "3 Faixas V",
    icon: "☰",
    slots: [
      { x: 0, y: 0, w: 1, h: 1 / 3 },
      { x: 0, y: 1 / 3, w: 1, h: 1 / 3 },
      { x: 0, y: 2 / 3, w: 1, h: 1 / 3 },
    ],
  },
};

const LAYOUT_KEYS: CollageLayout[] = ["none", "2x1", "1x2", "2x2", "3x1", "1x3"];

export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<CameraType>("back");
  const [flashOn, setFlashOn] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("story");
  const [filter] = useState<FilterId>("none");
  const [recording, setRecording] = useState(false);
  const [recordLocked, setRecordLocked] = useState(false);
  const [loadingCapture, setLoadingCapture] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<any>(null);

  // ── Live filter (Instagram-style, applied before capture) ──
  const [liveFilter, setLiveFilter] = useState<LiveFilterDef>(LIVE_FILTERS[0]);

  // ── AR Face effects ──
  const [arEffect, setArEffect] = useState<AREffectId>("none");
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  // ── WebGL Effects ──
  const [activeEffect, setActiveEffect] = useState<EffectId>("none");
  const [showEffectsPicker, setShowEffectsPicker] = useState(false);

  // ── Video Recorder (MediaRecorder API for APK) ──
  const videoRecorderRef = useRef<VideoRecorderInstance | null>(null);
  const prewarmedRecorderRef = useRef<VideoRecorderInstance | null>(null);

  const [showGrid, setShowGrid] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);

  // Collage state
  const [collageLayout, setCollageLayout] = useState<CollageLayout>("none");
  const [collagePhotos, setCollagePhotos] = useState<(string | null)[]>([]);
  const [showCollageMenu, setShowCollageMenu] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null); // which slot is being filled
  const [slotActionModal, setSlotActionModal] = useState<number | null>(null); // show camera/gallery picker for slot
  const [showCollageConfirm, setShowCollageConfirm] = useState(false);
  const [collageConfirmUris, setCollageConfirmUris] = useState<string[]>([]);
  const isCollageMode = collageLayout !== "none";
  const collageConfig = COLLAGE_CONFIGS[collageLayout];

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);

  const [galleryAssets, setGalleryAssets] = useState<MediaLibrary.Asset[]>([]);
  const [galleryAlbums, setGalleryAlbums] = useState<MediaLibrary.Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>("Recentes");
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [selectedGalleryUri, setSelectedGalleryUri] = useState<string | null>(null);
  const [galleryPermission, setGalleryPermission] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const countdownOpacity = useRef(new Animated.Value(0)).current;
  const countdownScale = useRef(new Animated.Value(0.5)).current;
  const shotScale = useRef(new Animated.Value(1)).current;
  const recordPulse = useRef(new Animated.Value(1)).current;

  const cameraRef = useRef<any>(null);

  const getActiveCameraStream = useCallback((): MediaStream | null => {
    if (!isWeb) return null;
    try {
      const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
      const bestVideo = videos
        .map((v) => ({
          el: v,
          area: (v.videoWidth || v.clientWidth || 0) * (v.videoHeight || v.clientHeight || 0),
        }))
        .sort((a, b) => b.area - a.area)[0]?.el;
      const srcObj = bestVideo?.srcObject;
      return srcObj instanceof MediaStream ? srcObj : null;
    } catch {
      return null;
    }
  }, []);

  const getActiveCameraVideo = useCallback((): HTMLVideoElement | null => {
    if (!isWeb) return null;
    try {
      const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
      const bestVideo = videos
        .map((v) => ({
          el: v,
          area: (v.videoWidth || v.clientWidth || 0) * (v.videoHeight || v.clientHeight || 0),
        }))
        .sort((a, b) => b.area - a.area)[0]?.el;
      return bestVideo ?? null;
    } catch {
      return null;
    }
  }, []);

  const capturePreviewMediaParams = {
    liveFilter: liveFilter.id !== "none" ? liveFilter.id : undefined,
    liveFilterCSS: liveFilter.cssFilter !== "none" ? liveFilter.cssFilter : undefined,
    activeEffect: activeEffect !== "none" ? activeEffect : undefined,
    arEffect: arEffect !== "none" ? arEffect : undefined,
  };
  const capturePreviewMediaParamsRef = useRef(capturePreviewMediaParams);
  capturePreviewMediaParamsRef.current = capturePreviewMediaParams;

  useFocusEffect(
    useCallback(() => {
      setCameraReady(false);
      setCameraKey((k) => k + 1);
    }, [])
  );

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

  // Prewarm MediaRecorder only when the CameraView <video> already has a MediaStream.
  // Never call getUserMedia here — a second stream freezes/blocks the preview on mobile web & desktop.
  useEffect(() => {
    if (!(isWeb || isCapacitor) || !cameraReady || recording) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 24;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const tryPrewarm = async () => {
      if (cancelled || prewarmedRecorderRef.current || recording) return;
      const existingStream = getActiveCameraStream();
      if (!existingStream) {
        attempts += 1;
        return;
      }

      const recorder = await createVideoRecorder({
        maxDuration: mode === "story" ? 30 : 60,
        quality: "720p",
        facingMode: facing === "front" ? "user" : "environment",
        existingStream,
        onStart: () => {},
        onTick: (s) => setRecordSeconds(s),
        onComplete: (uri) => {
          setRecording(false);
          setRecordLocked(false);
          setRecordSeconds(0);
          Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
          videoRecorderRef.current = null;
          router.push({
            pathname: "/capturePreview" as any,
            params: {
              uri,
              mediaType: "video",
              mode,
              filter,
              facing,
              nonce: String(Date.now()),
              ...capturePreviewMediaParamsRef.current,
            },
          });
        },
        onError: () => {
          setRecording(false);
          setRecordLocked(false);
          setRecordSeconds(0);
          Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
          videoRecorderRef.current = null;
        },
      });
      if (!cancelled && recorder) {
        prewarmedRecorderRef.current = recorder;
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
      }
    };

    const timer = setTimeout(tryPrewarm, 300);
    pollId = setInterval(() => {
      if (cancelled || prewarmedRecorderRef.current || attempts >= maxAttempts) {
        if (pollId) clearInterval(pollId);
        pollId = null;
        return;
      }
      void tryPrewarm();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (pollId) clearInterval(pollId);
      if (!recording && prewarmedRecorderRef.current) {
        prewarmedRecorderRef.current.destroy();
        prewarmedRecorderRef.current = null;
      }
    };
  }, [cameraReady, facing, mode, recording, getActiveCameraStream, router, filter, shotScale]);

  // Web/APK: bind the actual camera <video> element for AR detection.
  useEffect(() => {
    if (!isWeb || arEffect === "none") {
      cameraVideoRef.current = null;
      return;
    }

    let cancelled = false;
    const bindVideo = () => {
      if (cancelled) return;
      try {
        const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
        if (!videos.length) return;
        const best = videos
          .map((v) => ({
            el: v,
            area: (v.videoWidth || v.clientWidth || 0) * (v.videoHeight || v.clientHeight || 0),
          }))
          .sort((a, b) => b.area - a.area)[0]?.el;
        if (best) cameraVideoRef.current = best;
      } catch {}
    };

    bindVideo();
    const interval = setInterval(bindVideo, 450);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [arEffect, cameraKey]);

  // Initialize collage photos array when layout changes
  useEffect(() => {
    if (isCollageMode) {
      setCollagePhotos(new Array(collageConfig.slots.length).fill(null));
      setActiveSlot(null);
    } else {
      setCollagePhotos([]);
      setActiveSlot(null);
    }
  }, [collageLayout]);

  // Recording pulse animation
  useEffect(() => {
    if (recording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recordPulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(recordPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      recordPulse.setValue(1);
    }
  }, [recording]);

  // Unmount cleanup: must run every render (same order as other hooks) — never place after permission early-returns.
  useEffect(() => {
    return () => {
      if (prewarmedRecorderRef.current) {
        prewarmedRecorderRef.current.destroy();
        prewarmedRecorderRef.current = null;
      }
    };
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

  const toggleFacing = () => {
    Animated.sequence([
      Animated.timing(flipAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(flipAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start();
    setFacing((c) => (c === "back" ? "front" : "back"));
  };

  const toggleFlash = () => setFlashOn((p) => !p);
  const cycleTimer = () => setTimerSeconds((p) => (p === 0 ? 3 : p === 3 ? 10 : 0));
  const toggleGrid = () => setShowGrid((p) => !p);
  const handleClose = () => router.replace("/feed");

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

  /* ── Capture a photo for a collage slot (via camera) ── */
  const captureForSlot = async (slotIndex: number) => {
    // Web/APK: prefer device camera picker for reliable "tirar na hora"
    if (isWeb) {
      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          allowsEditing: false,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          const newPhotos = [...collagePhotos];
          newPhotos[slotIndex] = result.assets[0].uri;
          setCollagePhotos(newPhotos);
          const nextEmpty = newPhotos.findIndex((p) => !p);
          setSlotActionModal(nextEmpty >= 0 ? nextEmpty : null);
        } else {
          setSlotActionModal(null);
        }
      } catch {
        pickGalleryForSlot(slotIndex);
      }
      return;
    }
    if (!cameraRef.current || !cameraReady) {
      pickGalleryForSlot(slotIndex);
      return;
    }
    try {
      setLoadingCapture(true);
      setActiveSlot(slotIndex);
      const photo: any = await Promise.race([
        cameraRef.current.takePictureAsync({
          quality: 1,
          skipProcessing: false,
        } as any),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
      ]);
      if (photo?.uri) {
        let finalUri = photo.uri;
        try {
          const IM = await import("expo-image-manipulator");
          const norm = await IM.manipulateAsync(photo.uri, [{ rotate: 0 }], { compress: 1, format: IM.SaveFormat.JPEG });
          if (norm?.uri) finalUri = norm.uri;
        } catch {}
        const newPhotos = [...collagePhotos];
        newPhotos[slotIndex] = finalUri;
        setCollagePhotos(newPhotos);
        const nextEmpty = newPhotos.findIndex((p) => !p);
        if (nextEmpty >= 0) setSlotActionModal(nextEmpty);
      }
    } catch {
      // If camera fails, fall back to gallery
      pickGalleryForSlot(slotIndex);
    } finally {
      setLoadingCapture(false);
      setActiveSlot(null);
    }
  };

  /* ── Pick from gallery for a collage slot ── */
  const pickGalleryForSlot = async (slotIndex: number) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const newPhotos = [...collagePhotos];
        newPhotos[slotIndex] = result.assets[0].uri;
        setCollagePhotos(newPhotos);
        const nextEmpty = newPhotos.findIndex((p) => !p);
        setSlotActionModal(nextEmpty >= 0 ? nextEmpty : null);
        return;
      }
    } catch {}
    setSlotActionModal(null);
  };

  /* ── Check if collage is complete & navigate ── */
  const collageAllFilled = isCollageMode && collagePhotos.every((p) => p !== null);

  const handleCollageNext = () => {
    if (!collageAllFilled) return;
    setCollageConfirmUris(collagePhotos.filter(Boolean) as string[]);
    setShowCollageConfirm(true);
  };

  const confirmCollageAndProceed = () => {
    const uris = collageConfirmUris.length > 0 ? collageConfirmUris : (collagePhotos.filter(Boolean) as string[]);
    if (!uris.length) return;
    const collageDraftId = saveCollageDraft(uris);
    router.push({
      pathname: "/capturePreview" as any,
      params: {
        uri: uris[0],
        collageDraftId,
        collageLayout,
        mediaType: "image",
        mode,
        filter,
        facing,
        nonce: String(Date.now()),
        ...capturePreviewMediaParams,
      },
    });
    setCollagePhotos(new Array(collageConfig.slots.length).fill(null));
    setShowCollageConfirm(false);
  };

  const executeCapture = async () => {
    if (!cameraRef.current || loadingCapture || !cameraReady) return;
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
              { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
            );
            if (normalized?.uri) {
              previewUri = normalized.uri;
              previewWidth = Number(normalized?.width ?? previewWidth);
              previewHeight = Number(normalized?.height ?? previewHeight);
            }
          } catch (e) {
            console.warn("Falha ao normalizar:", e);
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
            aspectRatio: "9:16",
            ...capturePreviewMediaParams,
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
    if (recording) return;

    // On Web/Capacitor: use MediaRecorder API (reliable in WebView)
    if (isWeb || isCapacitor) {
      try {
        setRecording(true);
        setRecordSeconds(0);
        Animated.spring(shotScale, { toValue: 1.2, useNativeDriver: true }).start();

        if (prewarmedRecorderRef.current) {
          videoRecorderRef.current = prewarmedRecorderRef.current;
          prewarmedRecorderRef.current.start();
          return;
        }

        const existingStream = getActiveCameraStream();

        const recorder = await createVideoRecorder({
          maxDuration,
          quality: "720p",
          facingMode: facing === "front" ? "user" : "environment",
          existingStream,
          onStart: () => {},
          onTick: (s) => setRecordSeconds(s),
          onComplete: (uri) => {
            setRecording(false);
            setRecordLocked(false);
            setRecordSeconds(0);
            Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
            videoRecorderRef.current = null;
            router.push({
              pathname: "/capturePreview" as any,
              params: {
                uri,
                mediaType: "video",
                mode,
                filter,
                facing,
                nonce: String(Date.now()),
                ...capturePreviewMediaParamsRef.current,
              },
            });
          },
          onError: (err) => {
            setRecording(false);
            setRecordLocked(false);
            setRecordSeconds(0);
            Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
            videoRecorderRef.current = null;
            Alert.alert("Erro na gravação", String(err || "Não foi possível gravar no APK."));
          },
        });

        if (recorder) {
          videoRecorderRef.current = recorder;
          recorder.start();
        } else {
          setRecording(false);
          Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
        }
      } catch (err: any) {
        setRecording(false);
        Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
        Alert.alert("Erro", String(err?.message || err || "Falha ao iniciar gravação"));
      }
      return;
    }

    // Native: use CameraView.recordAsync
    if (!cameraRef.current) return;
    try {
      setRecording(true);
      setRecordSeconds(0);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => setRecordSeconds((p) => p + 1), 1000);

      Animated.spring(shotScale, { toValue: 1.2, useNativeDriver: true }).start();

      const video: any = await cameraRef.current.recordAsync({
        maxDuration,
        quality: "1080p",
      } as any);

      if (video?.uri) {
        router.push({
          pathname: "/capturePreview" as any,
          params: {
            uri: video.uri,
            mediaType: "video",
            mode,
            filter,
            facing,
            nonce: String(Date.now()),
            ...capturePreviewMediaParamsRef.current,
          },
        });
      }
    } catch (err: any) {
      const msg = String(err?.message || err).toLowerCase();
      if (!msg.includes("stop") && !msg.includes("cancel") && !msg.includes("not supported")) {
        Alert.alert("Erro na gravação", "Não foi possível gravar o vídeo.");
      }
    } finally {
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setRecording(false);
      setRecordLocked(false);
      setRecordSeconds(0);
      Animated.spring(shotScale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const stopRecording = () => {
    // Web/Capacitor: use MediaRecorder stop
    if (videoRecorderRef.current) {
      videoRecorderRef.current.stop();
      return;
    }
    // Native: use CameraView
    if (cameraRef.current && recording) {
      try { cameraRef.current.stopRecording(); } catch {}
    }
  };

  const handleShotPress = () => {
    if (!cameraRef.current || loadingCapture || !cameraReady) return;
    if (mode === "reel") {
      if (recording) { stopRecording(); return; }
      startRecording(60);
      return;
    }
    if (mode === "story") {
      startTimerThenCapture();
      return;
    }
    if (selectedGalleryUri) {
      router.push({
        pathname: "/capturePreview" as any,
        params: {
          uri: selectedGalleryUri,
          mediaType: "image",
          mode,
          filter,
          facing,
          nonce: String(Date.now()),
          ...capturePreviewMediaParams,
        },
      });
      return;
    }
    startTimerThenCapture();
  };

  const handleShotLongPress = () => {
    if (!cameraRef.current || recording) return;
    if (mode === "story" || mode === "post") {
      // On web/Capacitor, recordAsync may not be supported — try anyway
      startRecording(mode === "story" ? 30 : 60);
    }
  };

  const handleShotPressOut = () => {
    if ((mode === "story" || mode === "post") && recording && !recordLocked) stopRecording();
  };

  const handleOpenGallery = () => {
    router.push({ pathname: "/mediaPicker" as any, params: { mode, filter } });
  };

  const formatRecordTime = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
  };

  const isPostMode = mode === "post";
  const isVideoMode = mode === "reel" || (mode === "story" && recording);
  const showGallery = isPostMode && galleryPermission && !isWeb;

  const cameraHeight = isCollageMode
    ? H * 0.75
    : showGallery
      ? (galleryExpanded ? H * 0.35 : H * 0.55)
      : H;
  const cameraWidth = W;

  const flipRotation = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  // Compute combined CSS filter for live preview
  const liveCSSFilter = (() => {
    let f = liveFilter.cssFilter !== "none" ? liveFilter.cssFilter : "";
    const effectCSS = getEffectCSSFilter(activeEffect);
    if (effectCSS) f = f ? `${f} ${effectCSS}` : effectCSS;
    return f || undefined;
  })();
  const liveCameraWebFilterStyle = isWeb && liveCSSFilter
    ? ({ filter: liveCSSFilter, WebkitFilter: liveCSSFilter } as any)
    : undefined;
  const shouldUseTintOverlay = !isWeb;
  const previewTintLayers = getPreviewTintLayers({
    isWeb,
    isCapacitor,
    liveFilter,
    activeEffect,
  });

  // Force CSS filter on the real camera <video> element (important for WebView/Capacitor).
  useEffect(() => {
    if (!isWeb) return;
    let cancelled = false;
    let tries = 0;
    const maxTries = 24;
    const apply = () => {
      if (cancelled) return;
      const v = getActiveCameraVideo();
      if (!v) return;
      const css = liveCSSFilter || "none";
      try {
        (v.style as any).filter = css;
        (v.style as any).webkitFilter = css;
      } catch {}
    };
    apply();
    const id = setInterval(() => {
      tries += 1;
      apply();
      if (tries >= maxTries) clearInterval(id);
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
      const v = getActiveCameraVideo();
      if (v) {
        try {
          (v.style as any).filter = "none";
          (v.style as any).webkitFilter = "none";
        } catch {}
      }
    };
  }, [getActiveCameraVideo, liveCSSFilter, cameraKey]);

  const rightTools = [
    { key: "flash", icon: flashOn ? "⚡" : "⚡︎", label: flashOn ? "On" : "Off", onPress: toggleFlash, active: flashOn },
    { key: "timer", icon: "⏱", label: timerSeconds === 0 ? "Timer" : `${timerSeconds}s`, onPress: cycleTimer, active: timerSeconds > 0 },
    { key: "grid", icon: "⊞", label: "Grid", onPress: toggleGrid, active: showGrid },
    { key: "effects", icon: "✦", label: "Efeitos", onPress: () => { setShowEffectsPicker(p => !p); }, active: activeEffect !== "none" },
    { key: "collage", icon: "⊡", label: "Layout", onPress: () => setShowCollageMenu(p => !p), active: isCollageMode },
  ];

  /* ── Collage split-screen view ── */
  const renderCollageView = () => {
    const containerH = cameraHeight;
    const containerW = W;
    const gap = 3;

    return (
      <View style={[styles.collageContainer, { width: containerW, height: containerH }]}>
        {collageConfig.slots.map((slot, idx) => {
          const photo = collagePhotos[idx];
          const isActive = activeSlot === idx;
          const slotW = slot.w * containerW - gap;
          const slotH = slot.h * containerH - gap;
          const slotX = slot.x * containerW + gap / 2;
          const slotY = slot.y * containerH + gap / 2;

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.85}
              onPress={() => {
                if (photo) {
                  // Already has photo — show option to retake/replace
                  setSlotActionModal(idx);
                } else {
                  setSlotActionModal(idx);
                }
              }}
              style={[
                styles.collageSlot,
                {
                  position: "absolute",
                  left: slotX,
                  top: slotY,
                  width: slotW,
                  height: slotH,
                  borderRadius: 8,
                  overflow: "hidden",
                },
              ]}
            >
              {photo ? (
                <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={styles.emptySlot}>
                  {isActive && loadingCapture ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <View style={styles.slotPlusCircle}>
                        <Text style={styles.slotPlusIcon}>+</Text>
                      </View>
                      <Text style={styles.slotHint}>Toque para{"\n"}adicionar</Text>
                    </>
                  )}
                </View>
              )}
              {/* Slot number badge */}
              <View style={styles.slotBadge}>
                <Text style={styles.slotBadgeText}>{idx + 1}</Text>
              </View>
              {/* Retake icon if filled */}
              {photo && (
                <View style={styles.slotRetake}>
                  <Text style={styles.slotRetakeIcon}>↺</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Camera preview (hidden when in collage mode, camera still mounted for capture) */}
      {!isCollageMode && (
        <Animated.View
          style={[
            styles.cameraWrap,
            {
              width: cameraWidth,
              height: cameraHeight,
              alignSelf: "center",
              transform: [{ rotateY: flipRotation }],
            },
            liveCameraWebFilterStyle,
          ]}
        >
          <CameraView
            key={`cam-${cameraKey}`}
            ref={(ref: any) => { cameraRef.current = ref; }}
            style={[StyleSheet.absoluteFill, liveCameraWebFilterStyle]}
            facing={facing}
            enableTorch={flashOn && facing === "back"}
            mode={isVideoMode ? "video" : "picture"}
            onCameraReady={() => setCameraReady(true)}
          />
          {/* Native APK / Capacitor: CSS filter does not affect the camera surface — use tint layers */}
          {shouldUseTintOverlay && previewTintLayers.map((layer, i) => (
            <View
              key={`preview-tint-${i}`}
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: layer.color, opacity: layer.opacity, zIndex: 2 + i },
              ]}
            />
          ))}
          {/* AR Face overlay */}
          {isWeb && arEffect !== "none" && (
            <FaceAROverlay
              videoRef={cameraVideoRef}
              activeEffect={arEffect}
              onEffectChange={setArEffect}
              showPicker={false}
              canvasWidth={cameraWidth}
              canvasHeight={cameraHeight}
            />
          )}
        </Animated.View>
      )}

      {/* Hidden camera for collage capture */}
      {isCollageMode && (
        <CameraView
          key={`cam-collage-${cameraKey}`}
          ref={(ref: any) => { cameraRef.current = ref; }}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          facing={facing}
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
        />
      )}

      {/* Collage split-screen grid */}
      {isCollageMode && renderCollageView()}

      {/* Grid overlay */}
      {showGrid && !isCollageMode && (
        <View style={[styles.gridOverlay, { width: W, height: cameraHeight }]} pointerEvents="none">
          <View style={[styles.gridLineH, { top: "33.33%" }]} />
          <View style={[styles.gridLineH, { top: "66.66%" }]} />
          <View style={[styles.gridLineV, { left: "33.33%" }]} />
          <View style={[styles.gridLineV, { left: "66.66%" }]} />
        </View>
      )}

      {/* Timer countdown */}
      {timerCountdown !== null && (
        <Animated.View
          style={[styles.countdownOverlay, { opacity: countdownOpacity, transform: [{ scale: countdownScale }] }]}
          pointerEvents="none"
        >
          <Text style={styles.countdownText}>{timerCountdown}</Text>
        </Animated.View>
      )}

      <LinearGradient colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0)"]} style={styles.topGradient} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleClose} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.topIcon}>✕</Text>
        </TouchableOpacity>

        {isCollageMode && (
          <View style={styles.collageTitleBadge}>
            <Text style={styles.collageTitleText}>Layout</Text>
            <Text style={styles.collageTitleCount}>
              {collagePhotos.filter(Boolean).length}/{collageConfig.slots.length}
            </Text>
          </View>
        )}

        {!isCollageMode && !isPostMode && !recording && (
          <TouchableOpacity activeOpacity={0.7} style={styles.soundBadge}>
            <Text style={styles.soundIcon}>♪</Text>
            <Text style={styles.soundText}>Adicionar som</Text>
          </TouchableOpacity>
        )}

        {isPostMode && !isCollageMode && <Text style={styles.headerTitle}>Novo post</Text>}

        {recording && (
          <Animated.View style={[styles.recBadge, { transform: [{ scale: recordPulse }] }]}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC {formatRecordTime(recordSeconds)}</Text>
          </Animated.View>
        )}

        {isCollageMode ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleCollageNext}
            disabled={!collageAllFilled}
            style={{ opacity: collageAllFilled ? 1 : 0.4 }}
          >
            <Text style={styles.nextText}>Avançar ›</Text>
          </TouchableOpacity>
        ) : isPostMode ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => {
            if (selectedGalleryUri) {
              router.push({
                pathname: "/capturePreview" as any,
                params: {
                  uri: selectedGalleryUri,
                  mediaType: "image",
                  mode,
                  filter,
                  facing,
                  nonce: String(Date.now()),
                  ...capturePreviewMediaParams,
                },
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

      {/* Right side tools (not in collage mode) */}
      {!isPostMode && !isCollageMode && (
        <View style={styles.rightTools}>
          {rightTools.map((t) => (
            <TouchableOpacity key={t.key} onPress={t.onPress} activeOpacity={0.7}>
              <View style={[styles.toolCircle, t.active && styles.toolCircleActive]}>
                <Text style={styles.toolIcon}>{t.icon}</Text>
              </View>
              <Text style={styles.toolLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Collage layout picker — horizontal strip at bottom */}
      {isCollageMode && (
        <View style={[styles.collageLayoutStrip, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collageLayoutScroll}>
            {LAYOUT_KEYS.map((lk) => {
              const cfg = COLLAGE_CONFIGS[lk];
              const isActive = collageLayout === lk;
              return (
                <TouchableOpacity
                  key={lk}
                  activeOpacity={0.8}
                  onPress={() => {
                    setCollageLayout(lk);
                  }}
                  style={[styles.layoutChip, isActive && styles.layoutChipActive]}
                >
                  {/* Mini preview icon */}
                  <View style={styles.layoutMiniPreview}>
                    {lk === "none" ? (
                      <View style={{ flex: 1, backgroundColor: isActive ? "#fff" : "rgba(255,255,255,0.4)", borderRadius: 2 }} />
                    ) : (
                      cfg.slots.map((s, si) => (
                        <View
                          key={si}
                          style={{
                            position: "absolute",
                            left: `${s.x * 100}%` as any,
                            top: `${s.y * 100}%` as any,
                            width: `${s.w * 100 - 4}%` as any,
                            height: `${s.h * 100 - 4}%` as any,
                            backgroundColor: isActive ? "#fff" : "rgba(255,255,255,0.4)",
                            borderRadius: 1.5,
                            margin: 0.5,
                          }}
                        />
                      ))
                    )}
                  </View>
                  <Text style={[styles.layoutChipLabel, isActive && styles.layoutChipLabelActive]}>
                    {lk === "none" ? "Normal" : cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Flip camera button in collage mode */}
          <TouchableOpacity onPress={toggleFacing} activeOpacity={0.7} style={styles.collageFlipBtn}>
            <Text style={styles.bottomFlipIcon}>↺</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Collage layout picker (old menu) */}
      {showCollageMenu && !isCollageMode && (
        <View style={styles.collageMenu}>
          {LAYOUT_KEYS.filter(k => k !== "none").map(lk => {
            const cfg = COLLAGE_CONFIGS[lk];
            return (
              <TouchableOpacity
                key={lk}
                activeOpacity={0.8}
                onPress={() => {
                  setCollageLayout(lk);
                  setShowCollageMenu(false);
                }}
                style={styles.collageMenuItem}
              >
                <Text style={styles.collageMenuIcon}>{cfg.icon}</Text>
                <Text style={styles.collageMenuLabel}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Slot action modal — Camera / Gallery picker */}
      <Modal
        visible={slotActionModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSlotActionModal(null)}
      >
        <TouchableOpacity
          style={styles.slotModalBackdrop}
          activeOpacity={1}
          onPress={() => setSlotActionModal(null)}
        >
          <View style={styles.slotModalSheet}>
            <View style={styles.slotModalHandle} />
            <Text style={styles.slotModalTitle}>
              Slot {slotActionModal !== null ? slotActionModal + 1 : ""}
            </Text>

            <TouchableOpacity
              style={styles.slotModalOption}
              activeOpacity={0.8}
              onPress={() => {
                const idx = slotActionModal!;
                setSlotActionModal(null);
                captureForSlot(idx);
              }}
            >
              <View style={styles.slotModalIconCircle}>
                <Text style={styles.slotModalIconText}>📷</Text>
              </View>
              <View>
                <Text style={styles.slotModalOptionTitle}>Tirar foto</Text>
                <Text style={styles.slotModalOptionSub}>Usar a câmera agora</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.slotModalOption}
              activeOpacity={0.8}
              onPress={() => {
                const idx = slotActionModal!;
                pickGalleryForSlot(idx);
              }}
            >
              <View style={styles.slotModalIconCircle}>
                <Text style={styles.slotModalIconText}>🖼</Text>
              </View>
              <View>
                <Text style={styles.slotModalOptionTitle}>Escolher da galeria</Text>
                <Text style={styles.slotModalOptionSub}>Selecionar foto existente</Text>
              </View>
            </TouchableOpacity>

            {collagePhotos[slotActionModal ?? 0] && (
              <TouchableOpacity
                style={[styles.slotModalOption, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.1)" }]}
                activeOpacity={0.8}
                onPress={() => {
                  const idx = slotActionModal!;
                  const newPhotos = [...collagePhotos];
                  newPhotos[idx] = null;
                  setCollagePhotos(newPhotos);
                  setSlotActionModal(null);
                }}
              >
                <View style={[styles.slotModalIconCircle, { backgroundColor: "rgba(255,59,48,0.15)" }]}>
                  <Text style={styles.slotModalIconText}>✕</Text>
                </View>
                <View>
                  <Text style={[styles.slotModalOptionTitle, { color: "#ff3b30" }]}>Remover foto</Text>
                  <Text style={styles.slotModalOptionSub}>Limpar este slot</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.slotModalCancel}
              activeOpacity={0.8}
              onPress={() => setSlotActionModal(null)}
            >
              <Text style={styles.slotModalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showCollageConfirm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCollageConfirm(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmSheet}>
            <View style={styles.confirmHandle} />
            <Text style={styles.confirmTitle}>Confirmar sequencia</Text>
            <Text style={styles.confirmSubtitle}>
              Revise suas {collagePhotos.filter(Boolean).length} fotos antes de abrir o preview.
            </Text>

            <View style={styles.confirmGrid}>
              <DraggableFlatList
                data={collageConfirmUris.map((uri, index) => ({ key: `confirm-${index}-${uri}`, uri }))}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                activationDistance={8}
                contentContainerStyle={styles.confirmListContent}
                onDragEnd={({ data }) => setCollageConfirmUris(data.map((item) => item.uri))}
                renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<{ key: string; uri: string }>) => (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onLongPress={drag}
                    delayLongPress={160}
                    style={[styles.confirmItem, isActive && styles.confirmItemActive]}
                  >
                    <Image source={{ uri: item.uri }} style={styles.confirmItemImage} contentFit="cover" />
                    <View style={styles.confirmIndexBadge}>
                      <Text style={styles.confirmIndexBadgeText}>{(getIndex?.() ?? 0) + 1}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmBackBtn}
                activeOpacity={0.85}
                onPress={() => setShowCollageConfirm(false)}
              >
                <Text style={styles.confirmBackBtnText}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmNextBtn, !collageAllFilled && { opacity: 0.45 }]}
                activeOpacity={0.9}
                disabled={!collageAllFilled}
                onPress={confirmCollageAndProceed}
              >
                <Text style={styles.confirmNextBtnText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Effects picker (WebGL effects) ── */}
      {showEffectsPicker && !isCollageMode && (
        <View style={styles.effectsPickerOverlay}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, gap: 4 }}>
            {EFFECTS.map(effect => {
              const isActive = effect.id === activeEffect;
              return (
                <TouchableOpacity
                  key={effect.id}
                  activeOpacity={0.8}
                  onPress={() => { setActiveEffect(effect.id); if (effect.id !== "none") setShowEffectsPicker(false); }}
                  style={[styles.effectPickerItem, isActive && styles.effectPickerItemActive]}
                >
                  <Text style={styles.effectPickerIcon}>{effect.icon}</Text>
                  <Text style={[styles.effectPickerLabel, isActive && { color: "#fff" }]} numberOfLines={1}>{effect.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* AR picker hidden in APK/native for now: current implementation is web-only face mesh */}

      {/* Bottom (not in collage mode) */}
      {!isCollageMode && !isPostMode ? (
        <View style={[styles.bottomStory, { paddingBottom: (Platform.OS === "android" ? Math.max(insets.bottom, 18) + 20 : insets.bottom + 10) }]}>
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.8)"]} style={styles.bottomGradientInner} />

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

            {recording && mode === "story" && (
              <TouchableOpacity
                onPress={() => setRecordLocked((p) => !p)}
                activeOpacity={0.8}
                style={[styles.recordLockBtn, recordLocked && styles.recordLockBtnActive]}
              >
                <Text style={styles.recordLockIcon}>{recordLocked ? "🔒" : "🔓"}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={toggleFacing} activeOpacity={0.7} style={styles.bottomFlipBtn}>
              <Text style={styles.bottomFlipIcon}>↺</Text>
            </TouchableOpacity>
          </View>

          {!recording && mode !== "reel" && (
            <Text style={styles.videoHint}>Segure para gravar vídeo</Text>
          )}
          {recording && mode === "story" && (
            <Text style={styles.videoHint}>
              {recordLocked ? "Gravacao travada - toque no cadeado para parar" : "Segure para gravar ou toque no cadeado para travar"}
            </Text>
          )}

          <View style={styles.modesRow}>
            {(["post", "story", "reel"] as CaptureMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={recording ? undefined : () => { setMode(m); setCollageLayout("none"); }}
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
      ) : !isCollageMode ? (
        <View style={[styles.bottomPost, galleryExpanded && styles.bottomPostExpanded]}>
          {!galleryExpanded && selectedGalleryUri && (
            <View style={styles.selectedPreviewRow}>
              <TouchableOpacity onPress={() => setGalleryExpanded(true)} activeOpacity={0.7} style={styles.expandBtn}>
                <Text style={styles.expandIcon}>⌃</Text>
              </TouchableOpacity>
            </View>
          )}

          {galleryExpanded && (
            <View style={styles.selectedPreviewRow}>
              <TouchableOpacity onPress={() => setGalleryExpanded(false)} activeOpacity={0.7} style={styles.expandBtn}>
                <Text style={[styles.expandIcon, { transform: [{ rotate: "180deg" }] }]}>⌃</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.albumRow}>
            <TouchableOpacity onPress={() => setShowAlbumPicker((p) => !p)} activeOpacity={0.7} style={styles.albumSelector}>
              <Text style={styles.albumText}>{selectedAlbum}</Text>
              <Text style={styles.albumArrow}>ˇ</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} style={styles.selectMultiBtn}>
              <Text style={styles.selectMultiIcon}>⧉</Text>
              <Text style={styles.selectMultiText}>Selecionar</Text>
            </TouchableOpacity>
          </View>

          {showAlbumPicker && (
            <ScrollView style={styles.albumDropdown} nestedScrollEnabled>
              <TouchableOpacity onPress={() => selectAlbum(null)} style={styles.albumDropdownItem}>
                <Text style={[styles.albumDropdownText, selectedAlbum === "Recentes" && { color: "#3897f0" }]}>Recentes</Text>
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
                style={[styles.galleryItem, selectedGalleryUri === item.uri && styles.galleryItemSelected]}
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
                    <View style={styles.galleryCheck}><Text style={styles.galleryCheckText}>✓</Text></View>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />

          <View style={[styles.postModesRow, { paddingBottom: (Platform.OS === "android" ? Math.max(insets.bottom, 18) + 12 : insets.bottom + 8) }]}>
            <TouchableOpacity onPress={handleOpenGallery} activeOpacity={0.7} style={styles.postGalleryBtn}>
              <Text style={styles.postGalleryIcon}>🖼</Text>
            </TouchableOpacity>
            {(["post", "story", "reel"] as CaptureMode[]).map((m) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} activeOpacity={0.7} style={styles.modeItem}>
                <Text style={[styles.modeTextPost, mode === m && styles.modeTextPostActive]}>{m.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={toggleFacing} activeOpacity={0.7}>
              <Text style={styles.postFlipIcon}>↺</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  cameraWrap: { position: "absolute", top: 0, left: 0, overflow: "hidden", borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 120, zIndex: 8 },
  bottomGradientInner: { position: "absolute", bottom: 0, left: 0, right: 0, height: 220 },
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
  rightTools: { position: "absolute", right: 14, top: Platform.OS === "ios" ? 110 : 90, alignItems: "center", gap: 14, zIndex: 5 },
  toolCircle: { width: 42, height: 42, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  toolCircleActive: { backgroundColor: "rgba(255,51,85,0.3)", borderWidth: 1.5, borderColor: "rgba(255,51,85,0.6)" },
  toolIcon: { color: "#fff", fontSize: 18 },
  toolLabel: { color: "rgba(255,255,255,0.75)", fontSize: 9, fontWeight: "600", textAlign: "center", marginTop: 2 },
  gridOverlay: { position: "absolute", top: 0, left: 0, zIndex: 2 },
  gridLineH: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.3)" },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.3)" },
  countdownOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 20 },
  countdownText: { color: "#fff", fontSize: 120, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 20 },

  // Collage
  collageContainer: { position: "absolute", top: 0, left: 0, zIndex: 1 },
  collageSlot: { backgroundColor: "rgba(30,30,30,0.95)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  emptySlot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  slotPlusCircle: {
    width: 48, height: 48, borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  slotPlusIcon: { color: "#fff", fontSize: 24, fontWeight: "300" },
  slotHint: { color: "rgba(255,255,255,0.5)", fontSize: 11, textAlign: "center", fontWeight: "600" },
  slotBadge: {
    position: "absolute", top: 8, left: 8,
    width: 22, height: 22, borderRadius: 99,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  slotBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  slotRetake: {
    position: "absolute", bottom: 8, right: 8,
    width: 30, height: 30, borderRadius: 99,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  slotRetakeIcon: { color: "#fff", fontSize: 16 },

  // Collage title badge
  collageTitleBadge: { flexDirection: "row", alignItems: "center", gap: 8 },
  collageTitleText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  collageTitleCount: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600" },

  // Layout strip
  collageLayoutStrip: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 12,
  },
  collageLayoutScroll: { paddingHorizontal: 16, gap: 12, alignItems: "center" },
  layoutChip: { alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  layoutChipActive: { backgroundColor: "rgba(255,255,255,0.12)" },
  layoutMiniPreview: { width: 36, height: 36, borderRadius: 6, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  layoutChipLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" },
  layoutChipLabelActive: { color: "#fff" },
  collageFlipBtn: {
    position: "absolute", right: 16, top: 12,
    width: 40, height: 40, borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },

  // Collage menu (for non-collage mode entry)
  collageMenu: {
    position: "absolute", right: 60, top: Platform.OS === "ios" ? 110 + 14 * 4 : 90 + 14 * 4,
    backgroundColor: "rgba(18,18,18,0.96)", borderRadius: 16, padding: 8, zIndex: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
  collageMenuItem: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, marginBottom: 2,
  },
  collageMenuIcon: { color: "#fff", fontSize: 18, marginRight: 10, width: 24, textAlign: "center" },
  collageMenuLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600" },

  // Slot action modal
  slotModalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  slotModalSheet: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
  },
  slotModalHandle: {
    width: 36, height: 4, borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginBottom: 16,
  },
  slotModalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 20 },
  slotModalOption: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 4,
  },
  slotModalIconCircle: {
    width: 48, height: 48, borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  slotModalIconText: { fontSize: 22 },
  slotModalOptionTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  slotModalOptionSub: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 },
  slotModalCancel: {
    marginTop: 12, paddingVertical: 14,
    borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  slotModalCancelText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  confirmSheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
  },
  confirmHandle: {
    width: 38,
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 12,
  },
  confirmTitle: { color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" },
  confirmSubtitle: { color: "rgba(255,255,255,0.62)", fontSize: 13, textAlign: "center", marginTop: 6, marginBottom: 14 },
  confirmGrid: { marginBottom: 16 },
  confirmListContent: { paddingHorizontal: 2, gap: 10 },
  confirmItem: {
    width: Math.min(122, (W - 18 * 2 - 20) / 3),
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  confirmItemActive: {
    transform: [{ scale: 1.04 }],
    borderColor: "rgba(56,151,240,0.9)",
  },
  confirmItemImage: { width: "100%", height: "100%" },
  confirmItemEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  confirmItemEmptyText: { color: "rgba(255,255,255,0.55)", fontSize: 26, fontWeight: "300" },
  confirmIndexBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmIndexBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  confirmActions: { flexDirection: "row", gap: 10 },
  confirmBackBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBackBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  confirmNextBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#3897f0",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmNextBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  // Video hint
  videoHint: { color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center", marginBottom: 4, fontWeight: "600" },

  // Bottom Story/Reel
  bottomStory: { position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: 24 },
  captureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", paddingHorizontal: 30, marginBottom: 10 },
  galleryThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  galleryThumbImg: { width: 48, height: 48, borderRadius: 12 },
  galleryThumbIcon: { fontSize: 22 },

  shotOuter: { width: 80, height: 80, borderRadius: 99, alignItems: "center", justifyContent: "center", borderWidth: 3.5, borderColor: "rgba(255,255,255,0.9)" },
  shotOuterRecording: { borderColor: "#ff3355" },
  shotInner: { width: 64, height: 64, borderRadius: 99, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  shotInnerRecording: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#ff3355" },

  bottomFlipBtn: { width: 48, height: 48, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  bottomFlipIcon: { color: "#fff", fontSize: 22 },
  recordLockBtn: { width: 48, height: 48, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  recordLockBtnActive: { backgroundColor: "rgba(255,51,85,0.32)", borderWidth: 1.5, borderColor: "rgba(255,51,85,0.75)" },
  recordLockIcon: { color: "#fff", fontSize: 18 },

  modesRow: { flexDirection: "row", justifyContent: "center", gap: 6, paddingTop: 4, paddingBottom: 2 },
  modeItem: { paddingHorizontal: 14, paddingVertical: 6 },
  modeText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  modeTextActive: { color: "#fff" },

  // Post mode (gallery)
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

  // Effects picker overlay
  effectsPickerOverlay: {
    position: "absolute",
    bottom: 200,
    left: 0,
    right: 0,
    zIndex: 15,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 20,
    marginHorizontal: 8,
    paddingVertical: 12,
  },
  arPickerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 178,
    zIndex: 15,
  },
  effectPickerItem: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    width: 72,
  },
  effectPickerItemActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  effectPickerIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  effectPickerLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  liveFilterThumb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  liveFilterThumbBase: {
    ...StyleSheet.absoluteFillObject,
  },
  liveFilterThumbShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  liveFilterThumbAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "34%",
    opacity: 0.45,
  },
  liveFilterThumbNone: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  liveFilterThumbNoneText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
});