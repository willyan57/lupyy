// app/capturePreview.tsx
// PREMIUM Instagram-style capture preview with:
// - Smooth slider transitions (no flickering)
// - Working drawing tool with colors/sizes
// - Working save to gallery
// - Text tool with fonts, colors, alignment
// - Mention search from real profiles
// - Location picker
// - Fixed black image export (proper bake pipeline)
// - Collage support

import Colors from "@/constants/Colors";
import type { BeautifyParams } from "@/lib/gl/LutRenderer";
import LutRenderer from "@/lib/gl/LutRenderer";
import { OffscreenLutRenderer } from "@/lib/gl/OffscreenLutRenderer";
import { getFilterShaderParams, getLutForFilter } from "@/lib/gl/filterLuts";
import { compressImage, prepareVideo } from "@/lib/media";
import type { FilterId as ExportFilterId } from "@/lib/mediaFilters/applyFilterAndExport";
import { supabase } from "@/lib/supabase";
import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// @ts-ignore
import Svg, { Path } from "react-native-svg";

const { width, height } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const previewHeight = isWeb ? height * 0.85 : height;

type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "face_enhance" | "studio_glow" | "cartoon_soft" | "bw_art" | "soft_skin_ig" | "clean_portrait" | "cinematic_gold" | "blue_teal_2026" | "pastel_dream" | "tokyo_night" | "desert_warm" | "vintage_film" | "sakura" | "neon_glow" | "miami_vibes" | "deep_contrast" | "moody_forest" | "winter_lowsat" | "summer_pop" | "aqua_fresh" | "pink_rose" | "sepia_clean" | "urban_grit" | "cream_tone";
type ExtendedBeautifyParams = BeautifyParams & {
  sharpness?: number; temperature?: number; vignette?: number;
  grain?: number; fade?: number; highlights?: number; shadows?: number;
};

type TextOverlay = {
  id: string; text: string; color: string; fontSize: number;
  fontWeight: "400" | "700" | "900"; align: "left" | "center" | "right";
  x: number; y: number; bg?: string;
};

type DrawPath = { d: string; color: string; width: number };

const mapPreviewFilterToExport = (id: FilterId): ExportFilterId => {
  if (id === "none") return "none";
  // Filters with dedicated LUTs — map directly
  const directMap: Record<string, ExportFilterId> = {
    cinematic_gold: "cinematic_gold", blue_teal_2026: "blue_teal", pastel_dream: "pastel_dream",
    tokyo_night: "tokyo_night", desert_warm: "desert_warm", vintage_film: "vintage_film",
    sakura: "sakura", neon_glow: "neon_glow", miami_vibes: "miami_vibes",
    deep_contrast: "deep_contrast", moody_forest: "moody_forest", winter_lowsat: "winter_lowsat",
    summer_pop: "summer_pop", aqua_fresh: "aqua_fresh", pink_rose: "pink_rose",
    sepia_clean: "sepia_clean", urban_grit: "urban_grit", cream_tone: "cream_tone",
  };
  if (directMap[id]) return directMap[id];
  // Fallback mapping for preset names that don't match LUT filenames
  if (id === "face_enhance" || id === "soft_skin_ig" || id === "clean_portrait") return "warm";
  if (id === "studio_glow") return "gold";
  if (id === "cartoon_soft") return "pink";
  if (id === "bw_art") return "night";
  return "none";
};

const FILTERS: { id: FilterId; name: string; description: string; overlay?: string; blur?: number; vignette?: boolean; glow?: boolean }[] = [
  { id: "none", name: "Original", description: "Sem alteração" },
  { id: "face_enhance", name: "Realçar rosto", description: "Suaviza pele e realça rosto", overlay: "rgba(255,214,196,0.20)", glow: true },
  { id: "studio_glow", name: "Estúdio", description: "Luz profissional e nitidez", overlay: "rgba(255,255,255,0.14)", vignette: true, glow: true },
  { id: "cartoon_soft", name: "Cartoon", description: "Cores vivas e ilustração suave", overlay: "rgba(255,120,180,0.16)", glow: true },
  { id: "bw_art", name: "P&B Art", description: "Preto e branco dramático", overlay: "rgba(0,0,0,0.26)", vignette: true },
  { id: "soft_skin_ig", name: "Soft Skin", description: "Pele macia estilo IG", overlay: "rgba(255,188,160,0.18)", glow: true },
  { id: "clean_portrait", name: "Clean", description: "Limpo e equilibrado", overlay: "rgba(240,248,255,0.16)", glow: true },
  { id: "cinematic_gold", name: "Cinema Gold", description: "Tom dourado cinematográfico", overlay: "rgba(255,215,170,0.2)", vignette: true },
  { id: "blue_teal_2026", name: "Blue Teal", description: "Azuis profundos urbanos", overlay: "rgba(90,170,255,0.22)" },
  { id: "pastel_dream", name: "Pastel", description: "Cores suaves e delicadas", overlay: "rgba(255,220,245,0.22)", glow: true },
  { id: "tokyo_night", name: "Tokyo Night", description: "Neon noturno intenso", overlay: "rgba(80,60,140,0.28)", vignette: true },
  { id: "desert_warm", name: "Desert", description: "Tons quentes de pôr do sol", overlay: "rgba(255,190,120,0.24)" },
  { id: "vintage_film", name: "Vintage", description: "Granulado de filme analógico", overlay: "rgba(240,210,180,0.24)", vignette: true },
  { id: "sakura", name: "Sakura", description: "Rosa suave romântico", overlay: "rgba(255,170,210,0.24)", glow: true },
  { id: "neon_glow", name: "Neon", description: "Luzes de balada futurista", overlay: "rgba(170,120,255,0.26)", vignette: true },
  { id: "miami_vibes", name: "Miami", description: "Vibrante e dourado", overlay: "rgba(255,210,150,0.26)", glow: true },
  { id: "deep_contrast", name: "Deep", description: "Contraste de revista", overlay: "rgba(10,10,10,0.30)", vignette: true },
  { id: "moody_forest", name: "Moody", description: "Verdes dramáticos", overlay: "rgba(40,80,40,0.32)", vignette: true },
  { id: "winter_lowsat", name: "Winter", description: "Frio e elegante", overlay: "rgba(190,210,230,0.24)" },
  { id: "summer_pop", name: "Summer", description: "Cores fortes de verão", overlay: "rgba(255,210,120,0.24)", glow: true },
  { id: "aqua_fresh", name: "Aqua", description: "Turquesa refrescante", overlay: "rgba(120,210,255,0.26)" },
  { id: "pink_rose", name: "Pink Rose", description: "Rosa romântico", overlay: "rgba(255,170,200,0.26)", glow: true },
  { id: "sepia_clean", name: "Sépia", description: "Retro moderno elegante", overlay: "rgba(210,170,130,0.28)", vignette: true },
  { id: "urban_grit", name: "Urban", description: "Clima de rua intenso", overlay: "rgba(40,40,40,0.32)", vignette: true },
  { id: "cream_tone", name: "Cream", description: "Cremoso e chique", overlay: "rgba(245,220,190,0.28)", glow: true },
];

const DRAW_COLORS = ["#fff", "#000", "#ff3366", "#0095f6", "#ffd700", "#00e676", "#ff6b00", "#9c27b0"];
const TEXT_COLORS = ["#fff", "#000", "#ff3366", "#0095f6", "#ffd700", "#00e676", "#ff6b00", "#9c27b0", "#e91e63", "#00bcd4"];
const TEXT_BG_COLORS = ["transparent", "rgba(0,0,0,0.7)", "rgba(255,255,255,0.9)", "rgba(255,51,102,0.8)", "rgba(0,149,246,0.8)"];

const ITEM_W = 92;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getTouchDistance = (touches: any[] = []) => {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  const dx = (b.pageX ?? 0) - (a.pageX ?? 0);
  const dy = (b.pageY ?? 0) - (a.pageY ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
};

export default function CapturePreview() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const rawUri = useMemo(() => String(params.uri ?? ""), [params.uri]);
  const mediaType = useMemo(() => String(params.mediaType ?? "image") as "image" | "video", [params.mediaType]);
  const mode = useMemo(() => String(params.mode ?? "post") as CaptureMode, [params.mode]);
  const nonce = useMemo(() => String(params.nonce ?? ""), [params.nonce]);
  const collageUris = useMemo(() => {
    const raw = params.collageUris;
    if (typeof raw !== "string") return [] as string[];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && !!item) : [];
    } catch {
      return [] as string[];
    }
  }, [params.collageUris]);
  const facing = useMemo(() => String(params.facing ?? "back"), [params.facing]);
  const isFrontCamera = facing === "front";
  const cameFromCamera = facing === "front" || facing === "back";
  const normalizedWidthParam = useMemo(() => Number(params.width ?? 0), [params.width]);
  const normalizedHeightParam = useMemo(() => Number(params.height ?? 0), [params.height]);
  const hasNormalizedDimensions = normalizedWidthParam > 0 && normalizedHeightParam > 0;

  // Normalization
  const [normalizedUri, setNormalizedUri] = useState<string | null>(null);
  const needsNormalization = Platform.OS !== "web" && mediaType === "image" && !!rawUri && (cameFromCamera || !hasNormalizedDimensions);

  useEffect(() => {
    if (!needsNormalization || !rawUri) { setNormalizedUri(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const IM = await import("expo-image-manipulator");
        const result = await IM.manipulateAsync(rawUri, [{ rotate: 0 }], { compress: 0.96, format: IM.SaveFormat.JPEG });
        if (!cancelled && result?.uri) setNormalizedUri(result.uri);
      } catch {
        if (!cancelled) setNormalizedUri(rawUri);
      }
    })();
    return () => { cancelled = true; };
  }, [rawUri, needsNormalization]);

  const isPreparingImage = needsNormalization && !normalizedUri;
  const uri = needsNormalization ? normalizedUri || "" : rawUri;

  const initialFilter = useMemo(() => {
    const raw = String(params.filter ?? "none");
    return (FILTERS.some(f => f.id === raw) ? raw as FilterId : "none");
  }, [params.filter]);

  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showInlineFilters, setShowInlineFilters] = useState(false);
  const [filterIntensity, setFilterIntensity] = useState(1.0);

  // Adjust panel
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);
  const [adjustValues, setAdjustValues] = useState({
    sharpness: 0, temperature: 0, vignette: 0, grain: 0, fade: 0, highlights: 0, shadows: 0,
  });
  const [selectedAdjust, setSelectedAdjust] = useState<keyof typeof adjustValues>("sharpness");

  // Compare
  const [isComparing, setIsComparing] = useState(false);

  // GL debounce — increased to prevent flicker
  const [debouncedBeautifyParams, setDebouncedBeautifyParams] = useState<ExtendedBeautifyParams | null>(null);
  const debounceTimerRef = useRef<any>(null);

  const [bakeJob, setBakeJob] = useState<{
    uri: string; filterId: ExportFilterId; beautify: BeautifyParams; resolve: (u: string) => void;
  } | null>(null);

  const activeFilter = useMemo(() => FILTERS.find(f => f.id === filter) ?? FILTERS[0], [filter]);
  const filterIndex = useMemo(() => Math.max(0, FILTERS.findIndex(f => f.id === filter)), [filter]);

  const transition = useRef(new Animated.Value(1)).current;
  const [prevOverlay, setPrevOverlay] = useState<string | null>(null);
  const [nextOverlay, setNextOverlay] = useState<string | null>(null);
  const blurOpacity = useRef(new Animated.Value(0)).current;
  const [blurIntensity, setBlurIntensity] = useState(0);
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelScale = useRef(new Animated.Value(0.96)).current;
  const hideLabelRef = useRef<any>(null);
  const listRef = useRef<any>(null);
  const syncScrollRef = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [toolsCollapsed, setToolsCollapsed] = useState(true);
  const [caption, setCaption] = useState("");
  const [activeToolSheet, setActiveToolSheet] = useState<null | "text" | "stickers" | "music" | "mention" | "effects" | "draw" | "save" | "location">(null);
  const [quickAdjustment, setQuickAdjustment] = useState<"none" | "bright" | "dark" | "punch">("none");
  const [effectsOpen, setEffectsOpen] = useState(false);

  // Beautify
  const [showBeautifyPanel, setShowBeautifyPanel] = useState(false);
  const [beautifyTab, setBeautifyTab] = useState<"face" | "makeup">("face");
  const [beautifyOption, setBeautifyOption] = useState("Ativado");
  const [beautifyValues, setBeautifyValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    ["Ativado", "Suavizar", "Contraste", "Dente", "Base", "Batom", "Sombra", "Blush", "Contorno"].forEach(opt => { initial[opt] = 60; });
    return initial;
  });
  const beautifyTrackRef = useRef<any>(null);
  const [beautifyTrackWidth, setBeautifyTrackWidth] = useState(0);
  const [beautifyTrackX, setBeautifyTrackX] = useState(0);

  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiTempUri, setAiTempUri] = useState<string | null>(null);
  const effectiveUri = aiTempUri || uri;

  // Drawing state
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [drawColor, setDrawColor] = useState("#fff");
  const [drawWidth, setDrawWidth] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef("");

  // Text overlays
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [editingText, setEditingText] = useState("");
  const [editingTextColor, setEditingTextColor] = useState("#fff");
  const [editingTextBg, setEditingTextBg] = useState("transparent");
  const [editingTextWeight, setEditingTextWeight] = useState<"400" | "700" | "900">("700");
  const [editingTextAlign, setEditingTextAlign] = useState<"left" | "center" | "right">("center");
  const textGestureStateRef = useRef<Record<string, { startX: number; startY: number; startFontSize: number; startPageX: number; startPageY: number; startDistance: number }>>({});

  // Mention
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<{ id: string; username: string }[]>([]);

  // Location
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const LOCATION_SUGGESTIONS = [
    "São Paulo, Brasil", "Rio de Janeiro, Brasil", "Curitiba, Brasil",
    "Florianópolis, Brasil", "Belo Horizonte, Brasil", "Brasília, Brasil",
    "Salvador, Brasil", "Porto Alegre, Brasil", "Recife, Brasil",
  ];

  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(
    hasNormalizedDimensions ? { width: normalizedWidthParam, height: normalizedHeightParam } : null
  );

  useEffect(() => {
    setMediaDimensions(hasNormalizedDimensions ? { width: normalizedWidthParam, height: normalizedHeightParam } : null);
  }, [hasNormalizedDimensions, normalizedWidthParam, normalizedHeightParam]);

  useEffect(() => {
    if (mediaType !== "image" || !effectiveUri || hasNormalizedDimensions) return;
    let cancelled = false;
    (Image as any).getSize(effectiveUri,
      (w: number, h: number) => { if (!cancelled && w > 0 && h > 0) setMediaDimensions({ width: w, height: h }); },
      () => { if (!cancelled) setMediaDimensions(null); }
    );
    return () => { cancelled = true; };
  }, [effectiveUri, mediaType, hasNormalizedDimensions]);

  const previewMediaStyle = useMemo(() => ({ width, height: previewHeight }), []);

  // Beautify params — computed with smooth intermediate values
  const beautifyParams = useMemo<ExtendedBeautifyParams>(() => {
    const smoothRaw = (beautifyValues["Suavizar"] ?? 60) / 100;
    const contrastRaw = (beautifyValues["Contraste"] ?? 60) / 100;
    const teethRaw = (beautifyValues["Dente"] ?? 60) / 100;
    const baseRaw = (beautifyValues["Base"] ?? 60) / 100;

    const quickBrightness = quickAdjustment === "bright" ? 0.08 : quickAdjustment === "dark" ? -0.08 : 0.0;
    const quickContrast = quickAdjustment === "punch" ? 1.18 : quickAdjustment === "bright" ? 1.05 : 1.0;
    const quickSaturation = quickAdjustment === "punch" ? 1.18 : quickAdjustment === "bright" ? 1.02 : 1.0;

    const fp = typeof getFilterShaderParams === "function" ? getFilterShaderParams(mapPreviewFilterToExport(filter)) : {};

    return {
      brightness: clamp(quickBrightness + (fp.brightness ?? 0), -0.3, 0.3),
      contrast: clamp(quickContrast * (0.4 + contrastRaw) * (fp.contrast ?? 1), 0.5, 2.0),
      saturation: clamp(quickSaturation * (fp.saturation ?? 1), 0.0, 2.0),
      smoothing: clamp(Math.max(0, smoothRaw - 0.6) * 2.5 + (fp.smoothing ?? 0), 0, 1),
      whitenTeeth: clamp(Math.max(0, teethRaw - 0.6) * 2.5, 0, 1),
      baseGlow: clamp(Math.max(0, baseRaw - 0.6) * 2.5, 0, 1),
      sharpness: clamp(adjustValues.sharpness + (fp.sharpness ?? 0), 0, 0.42),
      temperature: clamp(adjustValues.temperature + (fp.temperature ?? 0), -0.4, 0.4),
      vignette: clamp(adjustValues.vignette + (fp.vignette ?? 0) + (activeFilter.vignette ? 0.3 : 0), 0, 0.8),
      grain: clamp(adjustValues.grain + (fp.grain ?? 0), 0, 0.35),
      fade: clamp(adjustValues.fade + (fp.fade ?? 0), 0, 0.4),
      highlights: clamp(adjustValues.highlights + (fp.highlights ?? 0), -0.4, 0.4),
      shadows: clamp(adjustValues.shadows + (fp.shadows ?? 0), -0.4, 0.4),
    };
  }, [beautifyValues, quickAdjustment, filter, adjustValues, activeFilter]);

  // Debounce — longer interval for smoother transitions
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedBeautifyParams(beautifyParams);
    }, 120);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [beautifyParams]);

  const glBeautifyParams = debouncedBeautifyParams ?? beautifyParams;

  const previewLutSource = useMemo(() => getLutForFilter(mapPreviewFilterToExport(filter)), [filter]);

  const needsGlPreview = useMemo(() => {
    if (mediaType !== "image") return false;
    if (previewLutSource !== null) return true;
    const bp = beautifyParams;
    if (bp.smoothing && bp.smoothing > 0.01) return true;
    if (bp.brightness && bp.brightness !== 0) return true;
    if (bp.contrast && Math.abs(bp.contrast - 1.0) > 0.01) return true;
    if (bp.whitenTeeth && bp.whitenTeeth > 0.01) return true;
    if (bp.baseGlow && bp.baseGlow > 0.01) return true;
    if (bp.sharpness && bp.sharpness > 0.01) return true;
    if (bp.temperature && Math.abs(bp.temperature) > 0.01) return true;
    if (bp.vignette && bp.vignette > 0.01) return true;
    if (bp.grain && bp.grain > 0.01) return true;
    if (bp.fade && bp.fade > 0.01) return true;
    if (bp.highlights && Math.abs(bp.highlights) > 0.01) return true;
    if (bp.shadows && Math.abs(bp.shadows) > 0.01) return true;
    return false;
  }, [mediaType, previewLutSource, beautifyParams]);

  const shouldBakeOnExport = useMemo(() => {
    if (mediaType !== "image") return false;
    if (aiTempUri || filter !== "none" || quickAdjustment !== "none") return true;
    if ((beautifyValues["Suavizar"] ?? 60) !== 60 || (beautifyValues["Contraste"] ?? 60) !== 60) return true;
    if (adjustValues.sharpness !== 0 || adjustValues.temperature !== 0 || adjustValues.vignette !== 0) return true;
    if (adjustValues.grain !== 0 || adjustValues.fade !== 0 || adjustValues.highlights !== 0 || adjustValues.shadows !== 0) return true;
    return false;
  }, [mediaType, aiTempUri, filter, quickAdjustment, beautifyValues, adjustValues]);

  const bakeImageWithLut = useCallback(
    (bakeUri: string, filterId: ExportFilterId, bParams: BeautifyParams) => {
      return new Promise<string>((resolve) => {
        const timeout = setTimeout(() => {
          console.log("bakeImageWithLut timeout");
          setBakeJob(null);
          resolve(bakeUri);
        }, 12000);

        setBakeJob({
          uri: bakeUri,
          filterId,
          beautify: bParams,
          resolve: (result: string) => {
            clearTimeout(timeout);
            resolve(result);
          },
        });
      });
    }, []
  );

  const maybeBakeMedia = async (inputUri: string) => {
    if (!shouldBakeOnExport) return inputUri;
    try {
      if (mediaType === "image") {
        const exportFilterId = mapPreviewFilterToExport(filter);
        const baked = await bakeImageWithLut(inputUri, exportFilterId, beautifyParams);
        if (baked && baked !== inputUri) {
          try {
            const info = await FileSystem.getInfoAsync(baked);
            if (info.exists && (info as any).size > 0) return baked;
          } catch {}
        }
      }
      return inputUri;
    } catch {
      return inputUri;
    }
  };

  // Effects
  useEffect(() => { setMediaLoaded(false); }, [uri, nonce, mediaType]);

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
    labelOpacity.stopAnimation(); labelScale.stopAnimation();
    labelOpacity.setValue(0); labelScale.setValue(0.96);
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
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  useEffect(() => { setMediaLoaded(false); }, [uri, nonce]);

  useEffect(() => {
    return () => { if (aiTempUri) FileSystem.deleteAsync(aiTempUri, { idempotent: true }).catch(() => {}); };
  }, [aiTempUri]);

  // Mention search
  useEffect(() => {
    if (!mentionQuery || mentionQuery.length < 2) { setMentionResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, display_name")
          .ilike("username", `%${mentionQuery}%`)
          .limit(10);
        setMentionResults(data ?? []);
      } catch { setMentionResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [mentionQuery]);

  // Drawing PanResponder
  const drawPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => isDrawing,
    onMoveShouldSetPanResponder: () => isDrawing,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      currentPathRef.current = `M${locationX},${locationY}`;
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      currentPathRef.current += ` L${locationX},${locationY}`;
    },
    onPanResponderRelease: () => {
      if (currentPathRef.current) {
        setDrawPaths(prev => [...prev, { d: currentPathRef.current, color: drawColor, width: drawWidth }]);
        currentPathRef.current = "";
      }
    },
  }), [isDrawing, drawColor, drawWidth]);

  const handleBack = () => router.back();

  // Upload
  async function uploadToBucket(bucket: "posts" | "stories", path: string, uriToUpload: string, contentType: string, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (Platform.OS === "web") {
          let blob: Blob;
          if (uriToUpload.startsWith("data:")) {
            const parts = uriToUpload.split(",");
            const raw = atob(parts[1]);
            const arr = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            blob = new Blob([arr], { type: contentType });
          } else {
            const resp = await fetch(uriToUpload);
            blob = await resp.blob();
          }
          const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: true });
          if (error) throw error;
        } else {
          const base64 = await FileSystem.readAsStringAsync(uriToUpload, { encoding: FileSystem.EncodingType.Base64 });
          const binaryString = (global as any).atob ? (global as any).atob(base64) : atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
          const { error } = await supabase.storage.from(bucket).upload(path, bytes.buffer, { contentType, upsert: true });
          if (error) throw error;
        }
        return;
      } catch (err) {
        if (attempt === maxRetries) throw err;
      }
    }
  }

  function extractTags(text: string) {
    const hashtags = Array.from(new Set((text.match(/#(\w+)/g) ?? []).map(t => t.replace("#", "").toLowerCase())));
    const mentions = Array.from(new Set((text.match(/@(\w+)/g) ?? []).map(m => m.replace("@", "").toLowerCase())));
    return { hashtags, mentions };
  }

  const performSendWithUri = async (finalUri: string) => {
    if (!finalUri) return;
    if (mode === "reel") {
      router.push({ pathname: "/new" as any, params: { source: "camera", uri: finalUri, mediaType, filter } });
      return;
    }
    let bakedUri = await maybeBakeMedia(finalUri);

    if (mode === "story") {
      try {
        setSending(true);
        let uid = userId;
        if (!uid) { const { data } = await supabase.auth.getUser(); uid = data.user?.id ?? null; }
        if (!uid) { setSending(false); return; }
        const isVideo = mediaType === "video";
        let uploadUri = bakedUri;
        let thumbUploadUri: string | null = null;
        if (!isVideo) { uploadUri = await compressImage(bakedUri); }
        else { const p = await prepareVideo(bakedUri); uploadUri = p.videoUri; thumbUploadUri = p.thumbUri ?? null; }
        const timestamp = Date.now();
        const basePath = `${uid}/${timestamp}`;
        const ext = isVideo ? "mp4" : "jpg";
        await uploadToBucket("stories", `${basePath}.${ext}`, uploadUri, isVideo ? "video/mp4" : "image/jpeg");
        let thumbPath: string | null = null;
        if (isVideo && thumbUploadUri) { thumbPath = `${basePath}.jpg`; await uploadToBucket("stories", thumbPath, thumbUploadUri, "image/jpeg"); }
        await supabase.from("stories").insert({
          user_id: uid, media_type: mediaType, media_path: `${basePath}.${ext}`,
          thumbnail_path: thumbPath, caption: caption || null, has_sound: isVideo,
          location: selectedLocation || null,
          filter: filter !== "none" ? mapPreviewFilterToExport(filter) : "none",
          tagged_users: taggedUsers.length > 0 ? taggedUsers.map(t => t.id) : [],
          text_overlays: textOverlays.length > 0 ? JSON.stringify(textOverlays) : null,
          draw_paths: drawPaths.length > 0 ? JSON.stringify(drawPaths) : null,
        });
        setSending(false);
        router.replace("/feed");
      } catch (err) {
        console.log("Story error:", err);
        setSending(false);
        Alert.alert("Erro", "Não foi possível publicar. Tente novamente.");
      }
      return;
    }

    // Post — handle collage as carousel
    try {
      setSending(true);
      let uid = userId;
      if (!uid) { const { data } = await supabase.auth.getUser(); uid = data.user?.id ?? null; }
      if (!uid) { setSending(false); return; }
      const isVideo = mediaType === "video";
      const { hashtags, mentions } = extractTags(caption);
      const allMentions = [...mentions, ...taggedUsers.map(t => t.username)];

      // If collage, upload each image as a carousel
      const urisToUpload = collageUris.length > 1 ? collageUris : [bakedUri];
      const isCarousel = urisToUpload.length > 1;

      const { data: insertedPost, error: postError } = await supabase.from("posts").insert({
        user_id: uid, media_type: mediaType, image_path: "", // will be set from first media
        thumbnail_path: null, caption: caption || null,
        hashtags, mentions: allMentions, privacy_level: "public", is_carousel: isCarousel, location: selectedLocation,
      }).select("id").single();
      if (postError || !insertedPost) throw postError || new Error("Erro ao criar post");

      for (let i = 0; i < urisToUpload.length; i++) {
        let uploadUri = urisToUpload[i];
        let thumbUri: string | null = null;
        if (!isVideo) { uploadUri = await compressImage(uploadUri); }
        else { const p = await prepareVideo(uploadUri); uploadUri = p.videoUri; thumbUri = p.thumbUri ?? null; }
        const timestamp = Date.now();
        const basePath = `${uid}/${timestamp}_${i}`;
        const ext = isVideo ? "mp4" : "jpg";
        await uploadToBucket("posts", `${basePath}.${ext}`, uploadUri, isVideo ? "video/mp4" : "image/jpeg");
        let thumbPath: string | null = null;
        if (isVideo && thumbUri) { thumbPath = `${basePath}.jpg`; await uploadToBucket("posts", thumbPath, thumbUri, "image/jpeg"); }
        await supabase.from("post_media").insert({
          post_id: insertedPost.id, media_type: mediaType, media_path: `${basePath}.${ext}`,
          thumbnail_path: thumbPath, position: i,
        });
        // Update main post image_path with first media
        if (i === 0) {
          await supabase.from("posts").update({ image_path: `${basePath}.${ext}`, thumbnail_path: thumbPath }).eq("id", insertedPost.id).then((r: any) => r);
        }
      }

      setSending(false);
      router.replace("/feed");
    } catch (err) {
      console.log("Post error:", err);
      setSending(false);
      Alert.alert("Erro", "Não foi possível publicar. Tente novamente.");
    }
  };

  // Save to gallery
  const handleSave = async () => {
    try {
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = effectiveUri;
        a.download = `lupyy_${Date.now()}.${mediaType === "video" ? "mp4" : "jpg"}`;
        a.click();
        Alert.alert("Salvo!", "Mídia salva com sucesso.");
        setActiveToolSheet(null);
        return;
      }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permissão necessária", "Permita o acesso à galeria."); return; }
      let saveUri = effectiveUri;
      if (shouldBakeOnExport && mediaType === "image") {
        saveUri = await maybeBakeMedia(effectiveUri);
      }
      await MediaLibrary.saveToLibraryAsync(saveUri);
      Alert.alert("Salvo!", "Mídia salva na galeria.");
      setActiveToolSheet(null);
    } catch (err) {
      console.log("Save error:", err);
      Alert.alert("Erro", "Não foi possível salvar.");
    }
  };

  // AI
  async function applyAiTransform(aiMode: "filter" | "beautify", preset: string) {
    if (mediaType !== "image" || !uri || aiProcessing) return;
    try {
      setAiProcessing(true);
      const base64 = await FileSystem.readAsStringAsync(effectiveUri, { encoding: FileSystem.EncodingType.Base64 });
      const { data, error } = await supabase.functions.invoke("ai-image-flux", {
        body: { mode: aiMode, preset, image: `data:image/jpeg;base64,${base64}`, image_base64: base64, mime: "image/jpeg" },
      });
      if (error || !data?.outputImageUrl) { Alert.alert("Erro", "Falha na IA."); return; }
      const localPath = (FileSystem.documentDirectory ?? "") + `ai-${Date.now()}.webp`;
      const download = await FileSystem.downloadAsync(data.outputImageUrl, localPath);
      if (!download?.uri) { Alert.alert("Erro", "Falha ao baixar."); return; }
      if (aiTempUri) try { await FileSystem.deleteAsync(aiTempUri, { idempotent: true }); } catch {}
      setMediaLoaded(false);
      setAiTempUri(download.uri);
    } catch { Alert.alert("Erro", "Falha na IA."); }
    finally { setAiProcessing(false); }
  }

  async function handleRevertAi() {
    if (!aiTempUri) return;
    try { await FileSystem.deleteAsync(aiTempUri, { idempotent: true }); } catch {}
    setAiTempUri(null);
    setMediaLoaded(false);
  }

  const handleSend = () => {
    if (!effectiveUri || sending || aiProcessing) return;
    void performSendWithUri(effectiveUri);
  };

  const addTextOverlay = () => {
    if (!editingText.trim()) return;
    setTextOverlays(prev => [...prev, {
      id: String(Date.now()), text: editingText, color: editingTextColor,
      fontSize: 24, fontWeight: editingTextWeight, align: editingTextAlign,
      x: width / 2 - 80, y: height * 0.3, bg: editingTextBg !== "transparent" ? editingTextBg : undefined,
    }]);
    setEditingText("");
    setActiveToolSheet(null);
  };

  const addTaggedUser = (user: any) => {
    if (taggedUsers.find(t => t.id === user.id)) return;
    setTaggedUsers(prev => [...prev, { id: user.id, username: user.username }]);
    setCaption(prev => prev + (prev ? " " : "") + `@${user.username}`);
    setActiveToolSheet(null);
  };

  const primaryAudienceLabel = mode === "story" ? "Seus stories" : mode === "reel" ? "Reels" : "Feed";
  const secondaryAudienceLabel = "Amigos próximos";

  const onCarouselMomentumEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / ITEM_W);
    const safe = Math.max(0, Math.min(FILTERS.length - 1, idx));
    syncScrollRef.current = true;
    setFilter(FILTERS[safe].id);
    setFilterIntensity(1.0);
    setTimeout(() => (syncScrollRef.current = false), 0);
  };

  const renderFilterItem = ({ item }: { item: any }) => {
    const active = item.id === filter;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { setFilter(item.id); setFilterIntensity(1.0); }}
        style={[styles.carouselItem, active && styles.carouselItemActive]}
      >
        <View style={[styles.carouselThumb, { backgroundColor: item.overlay ?? "rgba(255,255,255,0.18)" }]} />
        <Text style={[styles.carouselText, active && styles.carouselTextActive]} numberOfLines={1}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  const prevOpacity = transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const nextOpacity = transition;

  const baseTools = [
    { key: "text", label: "Texto", icon: "Aa" },
    { key: "stickers", label: "Figurinhas", icon: "☻" },
    { key: "music", label: "Músicas", icon: "♫" },
    { key: "beautify", label: "Embelezar", icon: "✧" },
    { key: "adjust", label: "Ajustes", icon: "⚙" },
    { key: "mention", label: "Marcar", icon: "@" },
    { key: "location", label: "Local", icon: "📍" },
    { key: "effects", label: "Efeitos", icon: "✺" },
    { key: "draw", label: "Desenhar", icon: "✎" },
    { key: "save", label: "Salvar", icon: "⇣" },
  ] as const;

  const beautifyFaceOptions = ["Ativado", "Suavizar", "Contraste", "Dente", "Base"];
  const beautifyMakeupOptions = ["Ativado", "Batom", "Sombra", "Blush", "Contorno"];

  const quickAdjustments = [
    { key: "none", label: "Normal" },
    { key: "bright", label: "Lux" },
    { key: "dark", label: "Dramático" },
    { key: "punch", label: "Vibrante" },
  ] as const;

  const adjustItems: { key: keyof typeof adjustValues; label: string; icon: string; min: number; max: number }[] = [
    { key: "sharpness", label: "Nitidez", icon: "△", min: 0, max: 0.42 },
    { key: "temperature", label: "Temperatura", icon: "🌡", min: -0.4, max: 0.4 },
    { key: "vignette", label: "Vinheta", icon: "⬡", min: 0, max: 0.8 },
    { key: "grain", label: "Grão", icon: "▤", min: 0, max: 0.35 },
    { key: "fade", label: "Fade", icon: "▨", min: 0, max: 0.4 },
    { key: "highlights", label: "Realces", icon: "▲", min: -0.4, max: 0.4 },
    { key: "shadows", label: "Sombras", icon: "▼", min: -0.4, max: 0.4 },
  ];

  const beautifyValue = beautifyValues[beautifyOption] ?? 60;
  const sliderAnimValue = useRef(new Animated.Value(beautifyValue / 100)).current;

  useEffect(() => {
    Animated.timing(sliderAnimValue, { toValue: (beautifyValues[beautifyOption] ?? 60) / 100, duration: 80, useNativeDriver: false }).start();
  }, [beautifyOption, beautifyValues[beautifyOption]]);

  // Smooth slider handler with Animated.timing
  const handleBeautifySlider = useCallback((evt: any) => {
    if (!beautifyTrackWidth) return;
    const pageX = evt?.nativeEvent?.pageX ?? evt?.nativeEvent?.changedTouches?.[0]?.pageX ?? evt?.nativeEvent?.touches?.[0]?.pageX;
    if (typeof pageX !== "number") return;
    const ratio = Math.max(0, Math.min(1, (pageX - beautifyTrackX) / beautifyTrackWidth));
    const value = Math.round(ratio * 100);
    Animated.timing(sliderAnimValue, { toValue: ratio, duration: 0, useNativeDriver: false }).start();
    setBeautifyValues(prev => ({ ...prev, [beautifyOption]: value }));
  }, [beautifyTrackWidth, beautifyTrackX, beautifyOption]);

  // Smooth adjust slider
  const handleAdjustSlider = useCallback((evt: any, trackWidth: number) => {
    const item = adjustItems.find(i => i.key === selectedAdjust)!;
    const px = evt.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, px / trackWidth));
    const val = Math.round((item.min + ratio * (item.max - item.min)) * 100) / 100;
    setAdjustValues(prev => ({ ...prev, [selectedAdjust]: val }));
  }, [selectedAdjust, adjustItems]);

  const tools = toolsCollapsed
    ? [...baseTools.slice(0, 5), { key: "more", label: "Mais", icon: "⋮" } as const]
    : [...baseTools, { key: "more", label: "Menos", icon: "⋮" } as const];

  const handleToolPress = (key: string) => {
    if (key === "beautify") { setShowBeautifyPanel(p => !p); setShowAdjustPanel(false); setEffectsOpen(false); setActiveToolSheet(null); setShowInlineFilters(false); setIsDrawing(false); return; }
    if (key === "adjust") { setShowAdjustPanel(p => !p); setShowBeautifyPanel(false); setEffectsOpen(false); setActiveToolSheet(null); setShowInlineFilters(false); setIsDrawing(false); return; }
    if (key === "effects") { setEffectsOpen(p => !p); setShowBeautifyPanel(false); setShowAdjustPanel(false); setActiveToolSheet(null); setShowInlineFilters(false); setIsDrawing(false); return; }
    if (key === "more") { setToolsCollapsed(p => !p); setEffectsOpen(false); setShowBeautifyPanel(false); setShowAdjustPanel(false); setShowInlineFilters(false); setActiveToolSheet(null); setIsDrawing(false); return; }
    if (key === "draw") { setIsDrawing(p => !p); setShowBeautifyPanel(false); setShowAdjustPanel(false); setEffectsOpen(false); setShowInlineFilters(false); setActiveToolSheet(null); return; }
    if (key === "save") { handleSave(); return; }
    setEffectsOpen(false); setShowBeautifyPanel(false); setShowAdjustPanel(false); setShowInlineFilters(false); setIsDrawing(false);
    setActiveToolSheet(prev => prev === key ? null : key as any);
  };

  function getBeautifyIcon(option: string) {
    const icons: Record<string, string> = { "Ativado": "✨", "Suavizar": "💧", "Contraste": "☀️", "Dente": "😁", "Base": "🧴", "Batom": "💄", "Sombra": "👁️", "Blush": "🌸", "Contorno": "🎭" };
    return icons[option] || "●";
  }

  const sliderFillWidth = sliderAnimValue.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const sliderThumbLeft = sliderAnimValue.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  const adjustTrackWidthRef = useRef(width - 36 - 60);

  return (
    <View style={styles.container}>
      {/* Bake renderer */}
      {bakeJob && (
        <OffscreenLutRenderer
          sourceUri={bakeJob.uri}
          filter={bakeJob.filterId}
          beautify={bakeJob.beautify}
          exportWidth={1080}
          exportHeight={1350}
          onFinish={(u) => { const out = u || bakeJob.uri; const r = bakeJob.resolve; setBakeJob(null); r(out); }}
        />
      )}

      {/* Preview */}
      <Pressable
        style={styles.previewStage}
        onPressIn={() => { if (needsGlPreview || filter !== "none") setIsComparing(true); }}
        onPressOut={() => setIsComparing(false)}
        {...(isDrawing ? drawPanResponder.panHandlers : {})}
      >
        <View style={styles.previewAbsolute}>
          {isPreparingImage ? null : mediaType === "image" && needsGlPreview && !isComparing ? (
            <LutRenderer
              sourceUri={effectiveUri}
              lut={previewLutSource}
              intensity={filterIntensity}
              beautify={glBeautifyParams}
              style={(isFrontCamera ? [styles.preview, previewMediaStyle, { transform: [{ scaleX: -1 }] }] : [styles.preview, previewMediaStyle]) as any}
              onReady={() => setMediaLoaded(true)}
            />
          ) : mediaType === "image" ? (
            <Image
              key={`${effectiveUri}::${nonce}::${isComparing ? "orig" : filter}`}
              source={{ uri: effectiveUri }}
              style={(isFrontCamera ? [styles.preview, previewMediaStyle, { transform: [{ scaleX: -1 }] }] : [styles.preview, previewMediaStyle]) as any}
              resizeMode="cover"
              onLoadEnd={() => setMediaLoaded(true)}
            />
          ) : (
            <Video
              key={`${uri}::${nonce}`}
              source={{ uri }}
              style={[styles.preview, styles.videoPreview] as any}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay isLooping
              onLoad={() => setMediaLoaded(true)}
            />
          )}
        </View>

        {/* Drawing overlay */}
        {drawPaths.length > 0 && (
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            {drawPaths.map((p, i) => (
              <Path key={i} d={p.d} stroke={p.color} strokeWidth={p.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        )}

        {/* Text overlays — draggable + pinch to resize */}
        {textOverlays.map(t => (
          <View
            key={t.id}
            style={[styles.textOverlayItem, { left: t.x, top: t.y, backgroundColor: t.bg || "transparent" }]}
            onStartShouldSetResponder={() => !isDrawing}
            onMoveShouldSetResponder={() => !isDrawing}
            onResponderGrant={(e) => {
              const touches = e.nativeEvent.touches ?? [];
              const state: any = { startX: t.x, startY: t.y, startFontSize: t.fontSize, startPageX: e.nativeEvent.pageX, startPageY: e.nativeEvent.pageY, startDistance: 0 };
              if (touches.length >= 2) state.startDistance = getTouchDistance(touches as any);
              textGestureStateRef.current[t.id] = state;
            }}
            onResponderMove={(e) => {
              const gs = textGestureStateRef.current[t.id];
              if (!gs) return;
              const touches = e.nativeEvent.touches ?? [];
              if (touches.length >= 2) {
                // Pinch to resize
                const dist = getTouchDistance(touches as any);
                if (gs.startDistance > 0 && dist > 0) {
                  const scale = dist / gs.startDistance;
                  const newSize = Math.round(clamp(gs.startFontSize * scale, 10, 120));
                  setTextOverlays(prev => prev.map(o => o.id === t.id ? { ...o, fontSize: newSize } : o));
                }
              } else {
                // Drag
                const dx = e.nativeEvent.pageX - gs.startPageX;
                const dy = e.nativeEvent.pageY - gs.startPageY;
                setTextOverlays(prev => prev.map(o => o.id === t.id ? { ...o, x: gs.startX + dx, y: gs.startY + dy } : o));
              }
            }}
            onResponderRelease={() => { delete textGestureStateRef.current[t.id]; }}
          >
            <Text style={{ color: t.color, fontSize: t.fontSize, fontWeight: t.fontWeight, textAlign: t.align }}>{t.text}</Text>
            {/* Delete button */}
            <TouchableOpacity
              style={{ position: "absolute", top: -10, right: -10, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" }}
              onPress={() => setTextOverlays(prev => prev.filter(o => o.id !== t.id))}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {isComparing && (
          <View style={styles.comparingLabel}><Text style={styles.comparingLabelText}>Original</Text></View>
        )}
      </Pressable>

      {/* Visual overlays */}
      {!needsGlPreview && prevOverlay && (
        <Animated.View pointerEvents="none" style={[styles.filterOverlay, { backgroundColor: prevOverlay, opacity: prevOpacity }]} />
      )}
      {!needsGlPreview && nextOverlay && (
        <Animated.View pointerEvents="none" style={[styles.filterOverlay, { backgroundColor: nextOverlay, opacity: nextOpacity }]} />
      )}
      {blurIntensity > 0 && Platform.OS !== "web" && (
        <Animated.View pointerEvents="none" style={[styles.blurWrap, { opacity: blurOpacity }]}>
          <BlurView intensity={blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      {activeFilter.vignette && (
        <View pointerEvents="none" style={styles.vignetteWrap}>
          <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]} style={styles.vTop} />
          <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]} style={[styles.vTop, { top: undefined, bottom: 0, transform: [{ rotate: "180deg" }] }]} />
        </View>
      )}
      {activeFilter.glow && (
        <View pointerEvents="none" style={styles.glowWrap}>
          <LinearGradient colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 220 }} />
        </View>
      )}

      <Animated.View pointerEvents="none" style={[styles.filterLabel, { opacity: labelOpacity, transform: [{ scale: labelScale }] }]}>
        <Text style={styles.filterLabelText}>{activeFilter.name}{filterIntensity < 1 ? ` ${Math.round(filterIntensity * 100)}%` : ""}</Text>
      </Animated.View>

      {((!mediaLoaded) || aiProcessing) && (
        <View style={styles.loadingOverlay}><ActivityIndicator color="#fff" /></View>
      )}

      <LinearGradient colors={["rgba(0,0,0,0.75)", "rgba(0,0,0,0.0)"]} style={styles.topGradient} />
      <LinearGradient colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.85)"]} style={styles.bottomGradient} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.85}><Text style={styles.topIcon}>←</Text></TouchableOpacity>
        <View style={styles.topCenter}>
          <View style={styles.topBadge}>
            <Text style={styles.topBadgeText}>{mode === "story" ? "Story" : mode === "reel" ? "Reel" : "Post"}</Text>
          </View>
          {selectedLocation && (
            <TouchableOpacity onPress={() => setSelectedLocation(null)} style={styles.locationBadge}>
              <Text style={styles.locationBadgeText}>📍 {selectedLocation}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => setFiltersOpen(true)} activeOpacity={0.85}><Text style={styles.topRightIcon}>✦</Text></TouchableOpacity>
      </View>

      {/* Drawing toolbar */}
      {isDrawing && (
        <View style={styles.drawToolbar}>
          <View style={styles.drawColorRow}>
            {DRAW_COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => setDrawColor(c)}
                style={[styles.drawColorDot, { backgroundColor: c }, drawColor === c && styles.drawColorDotActive]} />
            ))}
          </View>
          <View style={styles.drawSizeRow}>
            {[2, 4, 8, 14].map(s => (
              <TouchableOpacity key={s} onPress={() => setDrawWidth(s)}
                style={[styles.drawSizeBtn, drawWidth === s && styles.drawSizeBtnActive]}>
                <View style={{ width: s + 4, height: s + 4, borderRadius: 99, backgroundColor: drawColor }} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setDrawPaths(prev => prev.slice(0, -1))} style={styles.drawUndoBtn}>
              <Text style={styles.drawUndoBtnText}>↩</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDrawPaths([])} style={styles.drawUndoBtn}>
              <Text style={styles.drawUndoBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Right tools */}
      <View style={styles.rightTools}>
        {tools.map((tool) => (
          <TouchableOpacity key={tool.key} activeOpacity={0.9} onPress={() => handleToolPress(tool.key)} style={styles.rightToolButton}>
            {!toolsCollapsed && tool.key !== "more" && <Text style={styles.rightToolLabel}>{tool.label}</Text>}
            {!toolsCollapsed && tool.key === "more" && <Text style={styles.rightToolLabel}>{tool.label}</Text>}
            <View style={[styles.rightToolCircle, (isDrawing && tool.key === "draw") && { backgroundColor: "rgba(255,51,85,0.4)" }]}>
              <Text style={styles.rightToolIcon}>{tool.icon}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter intensity slider */}
      {filter !== "none" && (
        <View style={styles.intensityBar}>
          <Text style={styles.intensityLabel}>Intensidade: {Math.round(filterIntensity * 100)}%</Text>
          <View style={styles.intensitySliderRow}>
            <Text style={styles.intensityMinMax}>0</Text>
            <View style={styles.intensityTrack}>
              <View
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => setFilterIntensity(Math.max(0, Math.min(1, e.nativeEvent.locationX / (width - 100))))}
                onResponderMove={(e) => setFilterIntensity(Math.max(0, Math.min(1, e.nativeEvent.locationX / (width - 100))))}
                style={styles.intensityTrackInner}
              >
                <View style={[styles.intensityFill, { width: `${filterIntensity * 100}%` as any }]} />
                <View style={[styles.intensityThumb, { left: `${filterIntensity * 100}%` as any }]} />
              </View>
            </View>
            <Text style={styles.intensityMinMax}>100</Text>
          </View>
        </View>
      )}

      {/* Bottom panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 16 }]}>
        {/* Beautify panel */}
        {showBeautifyPanel && (
          <View style={styles.beautifyPanel}>
            <View style={styles.beautifySliderRow}>
              <View
                style={styles.beautifySliderTrack}
                ref={beautifyTrackRef}
                onLayout={() => {
                  beautifyTrackRef.current?.measureInWindow((x: number, _: number, w: number) => {
                    setBeautifyTrackX(x); setBeautifyTrackWidth(w);
                  });
                }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={handleBeautifySlider}
                onResponderMove={handleBeautifySlider}
              >
                <Animated.View style={[styles.beautifySliderFill, { width: sliderFillWidth as any }]} />
                <Animated.View style={[styles.beautifySliderThumb, { left: sliderThumbLeft as any, transform: [{ translateX: -11 }] }]} />
              </View>
              <Text style={styles.beautifyValueLabel}>{beautifyValue}</Text>
            </View>

            <View style={styles.beautifyTabsRow}>
              <View style={styles.beautifyTabsLeft}>
                {(["face", "makeup"] as const).map(tab => (
                  <TouchableOpacity key={tab} activeOpacity={0.9}
                    onPress={() => { setBeautifyTab(tab); setBeautifyOption(tab === "face" ? beautifyFaceOptions[0] : beautifyMakeupOptions[0]); }}
                    style={[styles.beautifyTabButton, beautifyTab === tab && styles.beautifyTabButtonActive]}
                  >
                    <Text style={[styles.beautifyTabText, beautifyTab === tab && styles.beautifyTabTextActive]}>
                      {tab === "face" ? "Rosto" : "Maquiagem"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => { setBeautifyValues(prev => ({ ...prev, [beautifyOption]: 60 })); setBeautifyOption("Ativado"); }}>
                <Text style={styles.beautifyResetText}>Redefinir</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.beautifyOptionsRow}>
              {(beautifyTab === "face" ? beautifyFaceOptions : beautifyMakeupOptions).map((option) => {
                const active = beautifyOption === option;
                return (
                  <TouchableOpacity key={option} activeOpacity={0.9} onPress={() => setBeautifyOption(option)} style={styles.beautifyOptionItem}>
                    <View style={[styles.beautifyOptionCircle, active && styles.beautifyOptionCircleActive]}>
                      <Text style={[styles.beautifyOptionIcon, active && styles.beautifyOptionIconActive]}>{getBeautifyIcon(option)}</Text>
                    </View>
                    <Text style={[styles.beautifyOptionLabel, active && styles.beautifyOptionLabelActive]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Adjust panel — smooth sliders */}
        {showAdjustPanel && (
          <View style={styles.beautifyPanel}>
            <View style={styles.beautifySliderRow}>
              <View
                style={styles.beautifySliderTrack}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onLayout={(e) => { adjustTrackWidthRef.current = e.nativeEvent.layout.width; }}
                onResponderGrant={(e) => handleAdjustSlider(e, adjustTrackWidthRef.current)}
                onResponderMove={(e) => handleAdjustSlider(e, adjustTrackWidthRef.current)}
              >
                {(() => {
                  const item = adjustItems.find(i => i.key === selectedAdjust)!;
                  const pct = ((adjustValues[selectedAdjust] - item.min) / (item.max - item.min)) * 100;
                  return (
                    <>
                      <View style={[styles.beautifySliderFill, { width: `${pct}%` }]} />
                      <View style={[styles.beautifySliderThumbStatic, { left: `${pct}%` }]} />
                    </>
                  );
                })()}
              </View>
              <Text style={styles.beautifyValueLabel}>{adjustValues[selectedAdjust].toFixed(2)}</Text>
            </View>

            <View style={styles.beautifyTabsRow}>
              <Text style={[styles.beautifyTabText, { fontWeight: "800", color: "#fff" }]}>
                {adjustItems.find(i => i.key === selectedAdjust)?.label}
              </Text>
              <TouchableOpacity onPress={() => setAdjustValues({ sharpness: 0, temperature: 0, vignette: 0, grain: 0, fade: 0, highlights: 0, shadows: 0 })}>
                <Text style={styles.beautifyResetText}>Redefinir</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.beautifyOptionsRow}>
              {adjustItems.map(item => {
                const active = selectedAdjust === item.key;
                const hasValue = adjustValues[item.key] !== 0;
                return (
                  <TouchableOpacity key={item.key} activeOpacity={0.9} onPress={() => setSelectedAdjust(item.key)} style={styles.beautifyOptionItem}>
                    <View style={[styles.beautifyOptionCircle, active && styles.beautifyOptionCircleActive, hasValue && !active && { borderWidth: 1, borderColor: "rgba(255,51,85,0.4)" }]}>
                      <Text style={[styles.beautifyOptionIcon, active && styles.beautifyOptionIconActive]}>{item.icon}</Text>
                    </View>
                    <Text style={[styles.beautifyOptionLabel, active && styles.beautifyOptionLabelActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Quick effects */}
        {effectsOpen && (
          <View style={styles.quickAdjustRow}>
            {quickAdjustments.map(item => {
              const active = quickAdjustment === item.key;
              return (
                <TouchableOpacity key={item.key} activeOpacity={0.9} onPress={() => setQuickAdjustment(item.key as any)}
                  style={[styles.quickAdjustChip, active && styles.quickAdjustChipActive]}>
                  <Text style={[styles.quickAdjustText, active && styles.quickAdjustTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity activeOpacity={0.9} style={styles.aiApplyButton}
              onPress={() => applyAiTransform("filter", "face_enhance_soft")} disabled={aiProcessing || mediaType !== "image"}>
              {aiProcessing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.aiApplyButtonText}>IA</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Caption */}
        <View style={styles.legendRow}>
          <TextInput
            style={styles.legendInput}
            placeholder="Adicione uma legenda..."
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={caption}
            onChangeText={setCaption}
            multiline
          />
        </View>

        {/* Audience + send */}
        <View style={styles.audienceRow}>
          <TouchableOpacity activeOpacity={0.9} style={styles.audienceChip}>
            <Text style={styles.audienceChipText}>{primaryAudienceLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} style={styles.audienceChipAlt}>
            <Text style={styles.audienceChipAltText}>{secondaryAudienceLabel}</Text>
          </TouchableOpacity>
          {aiTempUri && (
            <TouchableOpacity activeOpacity={0.9} onPress={handleRevertAi} style={styles.aiRevertButton}>
              <Text style={styles.aiRevertButtonText}>Reverter</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.9} onPress={handleSend} style={styles.sendButton} disabled={sending || aiProcessing}>
            {sending || aiProcessing ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendIcon}>➜</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter carousel */}
      <View style={[styles.carouselWrap, !showInlineFilters && { opacity: 0 }]} pointerEvents={showInlineFilters ? "auto" : "none"}>
        <FlatList
          ref={r => { listRef.current = r; }}
          data={FILTERS}
          keyExtractor={i => i.id}
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

      {/* ─── TEXT TOOL MODAL ─── */}
      <Modal visible={activeToolSheet === "text"} transparent animationType="fade" onRequestClose={() => setActiveToolSheet(null)}>
        <View style={styles.toolModalOverlay}>
          <View style={[styles.textToolContainer, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.textToolHeader}>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}><Text style={styles.textToolHeaderButton}>Cancelar</Text></TouchableOpacity>
              <Text style={styles.textToolHeaderTitle}>Texto</Text>
              <TouchableOpacity onPress={addTextOverlay}><Text style={styles.textToolHeaderButton}>Adicionar</Text></TouchableOpacity>
            </View>

            {/* Font weights */}
            <View style={styles.textToolFormattingRow}>
              {(["400", "700", "900"] as const).map(w => (
                <TouchableOpacity key={w} onPress={() => setEditingTextWeight(w)}
                  style={[styles.textWeightBtn, editingTextWeight === w && styles.textWeightBtnActive]}>
                  <Text style={[styles.textWeightBtnText, { fontWeight: w }]}>
                    {w === "400" ? "Light" : w === "700" ? "Bold" : "Black"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Alignment */}
            <View style={styles.textToolFormattingRow}>
              {(["left", "center", "right"] as const).map(a => (
                <TouchableOpacity key={a} onPress={() => setEditingTextAlign(a)}
                  style={[styles.textWeightBtn, editingTextAlign === a && styles.textWeightBtnActive]}>
                  <Text style={styles.textWeightBtnText}>{a === "left" ? "◀" : a === "center" ? "⬛" : "▶"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Colors */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {TEXT_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setEditingTextColor(c)}
                  style={[styles.textColorDot, { backgroundColor: c }, editingTextColor === c && { borderWidth: 3, borderColor: "#0095f6" }]} />
              ))}
            </ScrollView>

            {/* Background colors */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {TEXT_BG_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setEditingTextBg(c)}
                  style={[styles.textBgDot, { backgroundColor: c === "transparent" ? "#333" : c }, editingTextBg === c && { borderWidth: 3, borderColor: "#0095f6" }]}>
                  {c === "transparent" && <Text style={{ color: "#fff", fontSize: 10 }}>∅</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[styles.textToolInput, { color: editingTextColor, fontWeight: editingTextWeight, textAlign: editingTextAlign, backgroundColor: editingTextBg !== "transparent" ? editingTextBg : undefined }]}
              placeholder="Toque para digitar..."
              placeholderTextColor="#666"
              multiline
              value={editingText}
              onChangeText={setEditingText}
              autoFocus
            />
          </View>
        </View>
      </Modal>

      {/* ─── MENTION MODAL ─── */}
      <Modal visible={activeToolSheet === "mention"} transparent animationType="slide" onRequestClose={() => setActiveToolSheet(null)}>
        <Pressable style={styles.toolModalOverlay} onPress={() => setActiveToolSheet(null)}>
          <Pressable style={styles.bottomSheet} onPress={() => {}}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeaderRow}>
              <Text style={styles.bottomSheetTitle}>Marcar Pessoas</Text>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}><Text style={styles.bottomSheetClose}>Fechar</Text></TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nome de usuário..."
                placeholderTextColor="#888"
                value={mentionQuery}
                onChangeText={setMentionQuery}
                autoFocus
              />
            </View>
            {taggedUsers.length > 0 && (
              <View style={styles.taggedRow}>
                {taggedUsers.map(t => (
                  <View key={t.id} style={styles.taggedChip}>
                    <Text style={styles.taggedChipText}>@{t.username}</Text>
                    <TouchableOpacity onPress={() => setTaggedUsers(prev => prev.filter(p => p.id !== t.id))}>
                      <Text style={styles.taggedChipRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <ScrollView style={styles.mentionList}>
              {mentionResults.map(user => (
                <TouchableOpacity key={user.id} onPress={() => addTaggedUser(user)} style={styles.mentionRow}>
                  <View style={[styles.mentionAvatar, user.avatar_url && { overflow: "hidden" }]}>
                    {user.avatar_url && <Image source={{ uri: user.avatar_url }} style={{ width: 36, height: 36 }} />}
                  </View>
                  <View>
                    <Text style={styles.mentionName}>{user.username}</Text>
                    {user.display_name && <Text style={styles.mentionSubname}>{user.display_name}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
              {mentionQuery.length >= 2 && mentionResults.length === 0 && (
                <Text style={styles.mentionEmpty}>Nenhum usuário encontrado</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── LOCATION MODAL ─── */}
      <Modal visible={activeToolSheet === "location"} transparent animationType="slide" onRequestClose={() => setActiveToolSheet(null)}>
        <Pressable style={styles.toolModalOverlay} onPress={() => setActiveToolSheet(null)}>
          <Pressable style={styles.bottomSheet} onPress={() => {}}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeaderRow}>
              <Text style={styles.bottomSheetTitle}>Adicionar Localização</Text>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}><Text style={styles.bottomSheetClose}>Fechar</Text></TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>📍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar local..."
                placeholderTextColor="#888"
                value={locationQuery}
                onChangeText={setLocationQuery}
                autoFocus
              />
            </View>
            <ScrollView style={styles.mentionList}>
              {LOCATION_SUGGESTIONS
                .filter(l => !locationQuery || l.toLowerCase().includes(locationQuery.toLowerCase()))
                .map(loc => (
                  <TouchableOpacity key={loc} onPress={() => { setSelectedLocation(loc); setActiveToolSheet(null); }} style={styles.mentionRow}>
                    <Text style={{ fontSize: 18, marginRight: 10 }}>📍</Text>
                    <Text style={styles.mentionName}>{loc}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── STICKERS / MUSIC / EFFECTS MODAL ─── */}
      <Modal
        visible={activeToolSheet === "stickers" || activeToolSheet === "music" || activeToolSheet === "effects"}
        transparent animationType="slide" onRequestClose={() => setActiveToolSheet(null)}
      >
        <Pressable style={styles.toolModalOverlay} onPress={() => setActiveToolSheet(null)}>
          <Pressable style={styles.bottomSheet} onPress={() => {}}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeaderRow}>
              <Text style={styles.bottomSheetTitle}>
                {activeToolSheet === "stickers" ? "Figurinhas" : activeToolSheet === "music" ? "Músicas" : "Efeitos"}
              </Text>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}><Text style={styles.bottomSheetClose}>Fechar</Text></TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput style={styles.searchInput} placeholder="Pesquisar..." placeholderTextColor="#888" />
            </View>

            {activeToolSheet === "stickers" && (
              <View style={styles.stickersGrid}>
                {["LOCALIZAÇÃO", "MENÇÃO", "MÚSICA", "GIF", "PERGUNTAS", "ENQUETE", "LINK", "HASHTAG", "HORA", "CONTAGEM"].map(label => (
                  <TouchableOpacity key={label} style={styles.stickerChip}
                    onPress={() => {
                      if (label === "LOCALIZAÇÃO") { setActiveToolSheet("location"); }
                      else if (label === "MENÇÃO") { setActiveToolSheet("mention"); }
                    }}>
                    <Text style={styles.stickerChipText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {activeToolSheet === "music" && (
              <ScrollView style={styles.musicList}>
                {["Fim de Tarde – JrOliveira", "Dias De Luta – Charlie Brown Jr.", "Disciplina Blindada – Jamal Natue",
                  "De uns Dias pra Ca – Mc Luuky", "Um Centimetro – Toque Dez", "Onde Nos Chegou – Toque Dez"
                ].map(track => (
                  <View key={track} style={styles.musicRow}>
                    <View style={styles.musicThumb}><Text style={{ fontSize: 16 }}>♪</Text></View>
                    <View style={styles.musicInfo}>
                      <Text style={styles.musicTitle}>{track}</Text>
                      <Text style={styles.musicSubtitle}>Pré-visualização</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            {activeToolSheet === "effects" && (
              <View style={styles.stickersGrid}>
                {[
                  { label: "Clarendon", vals: { highlights: 0.25, shadows: 0.1, sharpness: 0.15 } },
                  { label: "Gingham", vals: { fade: 0.2, highlights: 0.15, temperature: -0.1 } },
                  { label: "Moon", vals: { fade: 0.15, temperature: -0.2, highlights: 0.2 } },
                  { label: "Lark", vals: { highlights: 0.3, temperature: 0.1, shadows: 0.15 } },
                  { label: "Reyes", vals: { fade: 0.25, temperature: 0.15, highlights: 0.1 } },
                  { label: "Juno", vals: { highlights: 0.2, shadows: -0.15, temperature: 0.1 } },
                  { label: "Slumber", vals: { fade: 0.2, vignette: 0.3, temperature: 0.05 } },
                  { label: "Crema", vals: { fade: 0.15, temperature: 0.12, highlights: 0.1 } },
                  { label: "Ludwig", vals: { highlights: 0.15, shadows: -0.1, vignette: 0.2 } },
                  { label: "Aden", vals: { fade: 0.18, temperature: 0.08, highlights: 0.15 } },
                  { label: "Perpetua", vals: { highlights: 0.2, temperature: -0.12, fade: 0.1 } },
                  { label: "Amaro", vals: { highlights: 0.25, sharpness: 0.2, vignette: 0.15 } },
                  { label: "Mayfair", vals: { vignette: 0.35, highlights: 0.15, temperature: 0.08 } },
                  { label: "Rise", vals: { highlights: 0.2, temperature: 0.15, fade: 0.08 } },
                  { label: "Hudson", vals: { temperature: -0.15, highlights: 0.2, vignette: 0.25 } },
                  { label: "Valencia", vals: { temperature: 0.15, fade: 0.12, highlights: 0.1 } },
                  { label: "X-Pro II", vals: { vignette: 0.4, highlights: 0.25, shadows: -0.2 } },
                  { label: "Lo-Fi", vals: { highlights: 0.3, shadows: -0.25, sharpness: 0.25, vignette: 0.3 } },
                  { label: "Earlybird", vals: { temperature: 0.2, fade: 0.2, vignette: 0.25, grain: 0.1 } },
                  { label: "Brannan", vals: { temperature: 0.1, fade: 0.15, vignette: 0.2, grain: 0.08 } },
                ].map(eff => (
                  <TouchableOpacity key={eff.label} style={styles.stickerChip} onPress={() => {
                    setAdjustValues(prev => ({ ...prev, ...eff.vals }));
                    setActiveToolSheet(null);
                    setShowAdjustPanel(true);
                  }}>
                    <Text style={styles.stickerChipText}>{eff.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Filters full modal ─── */}
      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filtros</Text>
            <View style={styles.filtersGrid}>
              {FILTERS.map(f => {
                const active = f.id === filter;
                return (
                  <TouchableOpacity key={f.id} activeOpacity={0.9}
                    onPress={() => { setFilter(f.id); setFilterIntensity(1.0); }}
                    style={[styles.filterChip, active && styles.filterChipActive]}>
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
  previewStage: { flex: 1, overflow: "hidden" },
  previewAbsolute: { position: "absolute", top: 0, left: 0, width, height: previewHeight },
  comparingLabel: { position: "absolute", top: "50%" as any, alignSelf: "center", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" },
  comparingLabelText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  preview: { width, height: previewHeight },
  videoPreview: { width, height: previewHeight },
  loadingOverlay: { ...StyleSheet.absoluteFillObject as any, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" },
  filterOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  blurWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  vignetteWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  vTop: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  glowWrap: { position: "absolute", top: 0, left: 0, right: 0, height: 220 },
  filterLabel: { position: "absolute", top: height * 0.18, alignSelf: "center", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  filterLabelText: { color: "#fff", fontWeight: "900", letterSpacing: 0.3 },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: height * 0.25 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: height * 0.42 },
  topBar: { position: "absolute", top: 26, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topIcon: { color: "#fff", fontSize: 26, fontWeight: "700" },
  topCenter: { alignItems: "center" },
  topBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)" },
  topBadgeText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  topRightIcon: { color: "#fff", fontSize: 22 },
  locationBadge: { marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.5)" },
  locationBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  rightTools: { position: "absolute", right: 12, top: height * 0.16 },
  rightToolButton: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 10 },
  rightToolCircle: { width: 40, height: 40, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", marginLeft: 8 },
  rightToolIcon: { color: "#fff", fontSize: 18, fontWeight: "800" },
  rightToolLabel: { color: "#fff", fontSize: 13, fontWeight: "700" },
  // Drawing
  drawToolbar: { position: "absolute", top: 80, left: 16, right: 60, zIndex: 20, backgroundColor: "rgba(0,0,0,0.8)", borderRadius: 16, padding: 10 },
  drawColorRow: { flexDirection: "row", gap: 8, marginBottom: 8, justifyContent: "center" },
  drawColorDot: { width: 28, height: 28, borderRadius: 99, borderWidth: 2, borderColor: "transparent" },
  drawColorDotActive: { borderColor: "#fff", borderWidth: 3 },
  drawSizeRow: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  drawSizeBtn: { width: 36, height: 36, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  drawSizeBtnActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  drawUndoBtn: { width: 36, height: 36, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  drawUndoBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  // Text overlays
  textOverlayItem: { position: "absolute", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, maxWidth: width * 0.7 },
  // Intensity
  intensityBar: { position: "absolute", bottom: 220, left: 18, right: 18, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  intensityLabel: { color: "#fff", fontSize: 12, fontWeight: "600", textAlign: "center", marginBottom: 6 },
  intensitySliderRow: { flexDirection: "row", alignItems: "center" },
  intensityMinMax: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600", width: 24, textAlign: "center" },
  intensityTrack: { flex: 1, marginHorizontal: 4 },
  intensityTrackInner: { height: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.20)", position: "relative" },
  intensityFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: "#ff3366" },
  intensityThumb: { position: "absolute", top: -9, width: 24, height: 24, borderRadius: 999, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4, transform: [{ translateX: -12 }] },
  // Bottom
  bottomPanel: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18 },
  quickAdjustRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4 },
  quickAdjustChip: { flex: 1, height: 32, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", marginHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  quickAdjustChipActive: { backgroundColor: "rgba(255,51,85,0.2)", borderColor: "rgba(255,51,85,0.6)" },
  quickAdjustText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700" },
  quickAdjustTextActive: { color: "#fff" },
  legendRow: { borderRadius: 18, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10 },
  legendInput: { color: "#fff", fontSize: 14, maxHeight: 70 },
  audienceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  audienceChip: { flex: 1, height: 40, borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginRight: 8 },
  audienceChipText: { color: "#000", fontWeight: "800", fontSize: 13 },
  audienceChipAlt: { flex: 1, height: 40, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", marginRight: 8 },
  audienceChipAltText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  aiRevertButton: { height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.7)", backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", marginRight: 8 },
  aiRevertButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sendButton: { width: 46, height: 46, borderRadius: 999, backgroundColor: "rgba(0,149,246,0.95)", alignItems: "center", justifyContent: "center" },
  sendIcon: { color: "#fff", fontSize: 20, fontWeight: "900" },
  aiApplyButton: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(0,149,246,0.9)", alignItems: "center", justifyContent: "center", marginLeft: 6 },
  aiApplyButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  // Carousel
  carouselWrap: { position: "absolute", left: 0, right: 0, bottom: 110, height: 86 },
  carouselItem: { width: ITEM_W, alignItems: "center", justifyContent: "center", paddingTop: 10, paddingBottom: 12, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.38)" },
  carouselItemActive: { backgroundColor: "rgba(255,51,85,0.16)", borderWidth: 1, borderColor: "rgba(255,51,85,0.45)" },
  carouselThumb: { width: 46, height: 46, borderRadius: 14, marginBottom: 8 },
  carouselText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 12, maxWidth: 80, textAlign: "center" },
  carouselTextActive: { color: "#fff" },
  // Modals
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: "rgba(18,18,18,0.98)" },
  sheetHandle: { width: 46, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginBottom: 10 },
  sheetTitle: { color: "#fff", fontWeight: "900", fontSize: 16, marginBottom: 14, alignSelf: "center" },
  filtersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  filterChip: { width: (width - 36 - 20) / 3, paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  filterChipActive: { backgroundColor: "rgba(255,51,85,0.18)", borderColor: "rgba(255,51,85,0.45)" },
  filterThumb: { width: 46, height: 46, borderRadius: 14, marginBottom: 8 },
  filterChipText: { color: "rgba(255,255,255,0.82)", fontWeight: "800", fontSize: 12 },
  filterChipTextActive: { color: "#fff" },
  sheetDone: { marginTop: 16, height: 52, borderRadius: 16, backgroundColor: "rgba(255,51,85,0.95)", alignItems: "center", justifyContent: "center" },
  sheetDoneText: { color: "#fff", fontWeight: "900", letterSpacing: 0.4 },
  // Tool modals
  toolModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  textToolContainer: { backgroundColor: "#000", paddingTop: 24, paddingHorizontal: 16 },
  textToolHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  textToolHeaderTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  textToolHeaderButton: { color: "#0095F6", fontSize: 14, fontWeight: "600" },
  textToolFormattingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  textWeightBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" },
  textWeightBtnActive: { backgroundColor: "rgba(0,149,246,0.3)", borderWidth: 1, borderColor: "#0095f6" },
  textWeightBtnText: { color: "#fff", fontSize: 13 },
  textColorDot: { width: 28, height: 28, borderRadius: 99, marginRight: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  textBgDot: { width: 28, height: 28, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  textToolInput: { minHeight: 120, fontSize: 22, textAlignVertical: "top", borderRadius: 12, padding: 12 },
  bottomSheet: { backgroundColor: Colors.surface, paddingTop: 8, paddingBottom: 12, paddingHorizontal: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: height * 0.6 },
  bottomSheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.28)", marginBottom: 12 },
  bottomSheetHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  bottomSheetTitle: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  bottomSheetClose: { color: "#0095F6", fontSize: 14, fontWeight: "600" },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14 },
  stickersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, justifyContent: "center" },
  stickerChip: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  stickerChipText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  musicList: { maxHeight: 260, marginTop: 4 },
  musicRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)" },
  musicThumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.08)", marginRight: 10, alignItems: "center", justifyContent: "center" },
  musicInfo: { flex: 1 },
  musicTitle: { color: Colors.text, fontSize: 14, marginBottom: 2 },
  musicSubtitle: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  mentionList: { maxHeight: 260, marginTop: 4 },
  mentionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  mentionAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 10 },
  mentionName: { color: Colors.text, fontSize: 14, fontWeight: "600" },
  mentionSubname: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  mentionEmpty: { color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", marginTop: 20 },
  taggedRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  taggedChip: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,149,246,0.2)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  taggedChipText: { color: "#0095f6", fontSize: 12, fontWeight: "700" },
  taggedChipRemove: { color: "#0095f6", fontSize: 12, marginLeft: 6, fontWeight: "700" },
  // Beautify
  beautifyPanel: { marginBottom: 10, paddingHorizontal: 4 },
  beautifySliderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  beautifySliderTrack: { flex: 1, height: 28, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.20)", position: "relative", justifyContent: "center" },
  beautifySliderFill: { position: "absolute", left: 0, top: 11, height: 6, borderRadius: 999, backgroundColor: "#ff3366" },
  beautifySliderThumb: { position: "absolute", top: 2, width: 24, height: 24, borderRadius: 999, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  beautifySliderThumbStatic: { position: "absolute", top: 2, width: 24, height: 24, borderRadius: 999, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4, transform: [{ translateX: -12 }] },
  beautifyValueLabel: { marginLeft: 12, color: "#fff", fontWeight: "700", fontSize: 14, minWidth: 30, textAlign: "right" },
  beautifyTabsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  beautifyTabsLeft: { flexDirection: "row", gap: 8 },
  beautifyTabButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" },
  beautifyTabButtonActive: { backgroundColor: "rgba(255,51,85,0.22)" },
  beautifyTabText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  beautifyTabTextActive: { color: "#fff" },
  beautifyResetText: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  beautifyOptionsRow: { paddingTop: 6, paddingBottom: 2 },
  beautifyOptionItem: { alignItems: "center", marginRight: 18 },
  beautifyOptionCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  beautifyOptionCircleActive: { backgroundColor: "rgba(255,51,85,0.28)" },
  beautifyOptionIcon: { color: "rgba(255,255,255,0.85)", fontSize: 18 },
  beautifyOptionIconActive: { color: "#fff" },
  beautifyOptionLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12 },
  beautifyOptionLabelActive: { color: "#fff", fontWeight: "700" },
});
