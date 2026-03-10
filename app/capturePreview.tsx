// app/capturePreview.tsx
// CORRECOES APLICADAS:
// 1. Preview usa LutRenderer (GL real) em vez de overlay rgba
// 2. Beautify params sao calculados e passados ao shader
// 3. OffscreenLutRenderer recebe beautify + tamanho real na exportacao
// 4. Slider com Animated para feedback mais suave
// 5. Consistencia preview <-> exportacao garantida
// 6. Swipe horizontal para trocar filtro
// 7. Slider de intensidade do filtro
// 8. Painel de ajustes avancados (sharpness, temperature, vignette, grain, fade, highlights, shadows)

import Colors from "@/constants/Colors";
import type { BeautifyParams } from "@/lib/gl/LutRenderer";
import LutRenderer from "@/lib/gl/LutRenderer";
import { OffscreenLutRenderer } from "@/lib/gl/OffscreenLutRenderer";
import { getFilterShaderParams, getLutForFilter } from "@/lib/gl/filterLuts";
import { compressImage, prepareVideo } from "@/lib/media";
import type { FilterId as ExportFilterId } from "@/lib/mediaFilters/applyFilterAndExport";
import * as FilterExport from "@/lib/mediaFilters/applyFilterAndExport";
import { supabase } from "@/lib/supabase";
import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
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

const { width, height } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const previewHeight = isWeb ? height * 0.85 : height;


type CaptureMode = "post" | "story" | "reel";
type FilterId = "none" | "face_enhance" | "studio_glow" | "cartoon_soft" | "bw_art" | "soft_skin_ig" | "clean_portrait" | "cinematic_gold" | "blue_teal_2026" | "pastel_dream" | "tokyo_night" | "desert_warm" | "vintage_film" | "sakura" | "neon_glow" | "miami_vibes" | "deep_contrast" | "moody_forest" | "winter_lowsat" | "summer_pop" | "aqua_fresh" | "pink_rose" | "sepia_clean" | "urban_grit" | "cream_tone";

const mapPreviewFilterToExport = (id: FilterId): ExportFilterId => {
  if (id === "none") return "none";
  if (id === "face_enhance") return "warm";
  if (id === "studio_glow") return "gold";
  if (id === "cartoon_soft") return "pink";
  if (id === "bw_art") return "night";
  if (
    id === "soft_skin_ig" ||
    id === "clean_portrait" ||
    id === "desert_warm" ||
    id === "cream_tone"
  )
    return "warm";
  if (id === "cinematic_gold" || id === "vintage_film" || id === "sepia_clean")
    return "gold";
  if (id === "blue_teal_2026" || id === "aqua_fresh" || id === "moody_forest")
    return "cool";
  if (id === "pastel_dream" || id === "sakura" || id === "pink_rose")
    return "pink";
  if (id === "tokyo_night" || id === "neon_glow" || id === "urban_grit")
    return "night";
  return "none";
};

const FILTERS: {
  id: FilterId;
  name: string;
  description: string;
  overlay?: string;
  blur?: number;
  vignette?: boolean;
  glow?: boolean;
}[] = [
  {
    id: "none",
    name: "Sem filtro",
    description: "Foto original, sem alteracao. Escolha um efeito quando quiser.",
  },
  {
    id: "face_enhance",
    name: "Realcar rosto",
    description:
      "Suaviza pele, reduz olheiras e deixa o rosto pronto para selfie natural.",
    overlay: "rgba(255,214,196,0.20)",
    glow: true,
  },
  {
    id: "studio_glow",
    name: "Foto profissional",
    description:
      "Luz de estudio, contraste moderado e nitidez para parecer camera profissional.",
    overlay: "rgba(255,255,255,0.14)",
    vignette: true,
    glow: true,
  },
  {
    id: "cartoon_soft",
    name: "Cartoon leve",
    description:
      "Cores mais vivas e aspecto de ilustracao suave, mantendo sua expressao real.",
    overlay: "rgba(255,120,180,0.16)",
    glow: true,
  },
  {
    id: "bw_art",
    name: "P&B artistico",
    description:
      "Preto e branco com contraste alto e clima de filme, perfeito para momentos intensos.",
    overlay: "rgba(0,0,0,0.26)",
    vignette: true,
  },
  {
    id: "soft_skin_ig",
    name: "Soft Skin IG",
    description:
      "Pele macia, leve brilho e contraste suave no estilo influencers do Instagram.",
    overlay: "rgba(255,188,160,0.18)",
    glow: true,
  },
  {
    id: "clean_portrait",
    name: "Clean Portrait",
    description:
      "Look limpo, nitido e equilibrado para retratos e fotos de perfil.",
    overlay: "rgba(240,248,255,0.16)",
    glow: true,
  },
  {
    id: "cinematic_gold",
    name: "Cinematic Gold",
    description:
      "Sombra em teal e luz quente dourada, trazendo clima de filme moderno.",
    overlay: "rgba(255,215,170,0.2)",
    vignette: true,
  },
  {
    id: "blue_teal_2026",
    name: "Blue Teal 2026",
    description:
      "Azuis profundos e verdes teal, perfeito para viagens urbanas e noite.",
    overlay: "rgba(90,170,255,0.22)",
  },
  {
    id: "pastel_dream",
    name: "Pastel Dream",
    description:
      "Tudo mais claro, suave e com vibe estetica pastel de Pinterest.",
    overlay: "rgba(255,220,245,0.22)",
    glow: true,
  },
  {
    id: "tokyo_night",
    name: "Tokyo Night",
    description:
      "Clima neon noturno, com roxos e azuis intensos sem destruir a pele.",
    overlay: "rgba(80,60,140,0.28)",
    vignette: true,
  },
  {
    id: "desert_warm",
    name: "Desert Warm",
    description:
      "Tons quentes de por do sol, ideal para praia, campo e fotos douradas.",
    overlay: "rgba(255,190,120,0.24)",
  },
  {
    id: "vintage_film",
    name: "Vintage Film",
    description:
      "Granulado visual suave com tons envelhecidos, lembrando filmes analogicos.",
    overlay: "rgba(240,210,180,0.24)",
    vignette: true,
  },
  {
    id: "sakura",
    name: "Sakura Glow",
    description:
      "Toque rosado com luz suave, perfeito para selfies romanticas.",
    overlay: "rgba(255,170,210,0.24)",
    glow: true,
  },
  {
    id: "neon_glow",
    name: "Neon Glow",
    description:
      "Realca luzes coloridas e deixa tudo com cara de balada futurista.",
    overlay: "rgba(170,120,255,0.26)",
    vignette: true,
  },
  {
    id: "miami_vibes",
    name: "Miami Vibes",
    description:
      "Cores vibrantes, ceu azul forte e pele dourada no estilo verao Miami.",
    overlay: "rgba(255,210,150,0.26)",
    glow: true,
  },
  {
    id: "deep_contrast",
    name: "Deep Contrast",
    description:
      "Preto mais profundo, luz mais marcada e sensacao de foto de revista.",
    overlay: "rgba(10,10,10,0.30)",
    vignette: true,
  },
  {
    id: "moody_forest",
    name: "Moody Forest",
    description:
      "Verdes fechados e atmosfera mais dramatica, otimo para natureza.",
    overlay: "rgba(40,80,40,0.32)",
    vignette: true,
  },
  {
    id: "winter_lowsat",
    name: "Winter LowSat",
    description:
      "Saturacao reduzida, look frio e elegante para paisagens e cidade.",
    overlay: "rgba(190,210,230,0.24)",
  },
  {
    id: "summer_pop",
    name: "Summer Pop",
    description:
      "Cores fortes e contraste alto, ideal para praia, festas e viagens.",
    overlay: "rgba(255,210,120,0.24)",
    glow: true,
  },
  {
    id: "aqua_fresh",
    name: "Aqua Fresh",
    description:
      "Aguas mais turquesa e visual refrescante, perfeito para piscina e mar.",
    overlay: "rgba(120,210,255,0.26)",
  },
  {
    id: "pink_rose",
    name: "Pink Rose",
    description:
      "Rosa suave com toque romantico, otimo para selfies e casais.",
    overlay: "rgba(255,170,200,0.26)",
    glow: true,
  },
  {
    id: "sepia_clean",
    name: "Sepia Clean",
    description:
      "Marrom claro, limpo e elegante, trazendo clima retro moderno.",
    overlay: "rgba(210,170,130,0.28)",
    vignette: true,
  },
  {
    id: "urban_grit",
    name: "Urban Grit",
    description:
      "Clima de rua, contraste forte e leve desaturacao para fotos urbanas.",
    overlay: "rgba(40,40,40,0.32)",
    vignette: true,
  },
  {
    id: "cream_tone",
    name: "Cream Tone",
    description:
      "Look cremoso, quente e chique, muito usado em feeds minimalistas.",
    overlay: "rgba(245,220,190,0.28)",
    glow: true,
  },
];

const ITEM_W = 92;
export default function CapturePreview() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const uri = useMemo(() => String(params.uri ?? ""), [params.uri]);
  const mediaType = useMemo(
    () => String(params.mediaType ?? "image") as "image" | "video",
    [params.mediaType]
  );
  const mode = useMemo(
    () => String(params.mode ?? "post") as CaptureMode,
    [params.mode]
  );
  const nonce = useMemo(() => String(params.nonce ?? ""), [params.nonce]);

  const insets = useSafeAreaInsets();

  const initialFilter = useMemo(() => {
    const raw = String(params.filter ?? "none");
    const allowed = FILTERS.map((f) => f.id);
    return (allowed.includes(raw as any) ? (raw as FilterId) : "none");
  }, [params.filter]);
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showInlineFilters, setShowInlineFilters] = useState(false);

  // ─── NOVO: intensidade do filtro ───
  const [filterIntensity, setFilterIntensity] = useState(1.0);

  // ─── NOVO: painel de ajustes avancados ───
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);
  const [adjustValues, setAdjustValues] = useState({
    sharpness: 0, temperature: 0, vignette: 0,
    grain: 0, fade: 0, highlights: 0, shadows: 0,
  });

  const [bakeJob, setBakeJob] = useState<{
    uri: string;
    filterId: ExportFilterId;
    beautify: BeautifyParams;
    resolve: (u: string) => void;
  } | null>(null);

  const activeFilter = useMemo(
    () => FILTERS.find((f) => f.id === filter) ?? FILTERS[0],
    [filter]
  );
  const filterIndex = useMemo(
    () => Math.max(0, FILTERS.findIndex((f) => f.id === filter)),
    [filter]
  );

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

  const [toolsCollapsed, setToolsCollapsed] = useState(true);
  const [caption, setCaption] = useState("");
  const [activeToolSheet, setActiveToolSheet] = useState<
    | null
    | "text"
    | "stickers"
    | "music"
    | "mention"
    | "effects"
    | "draw"
    | "save"
  >(null);
  const [quickAdjustment, setQuickAdjustment] = useState<
    "none" | "bright" | "dark" | "punch"
  >("none");
  const [effectsOpen, setEffectsOpen] = useState(false);

  const [showBeautifyPanel, setShowBeautifyPanel] = useState(false);
  const [beautifyTab, setBeautifyTab] = useState<"face" | "makeup">("face");
  const [beautifyOption, setBeautifyOption] = useState("Ativado");
  const [beautifyValues, setBeautifyValues] = useState<Record<string, number>>(
    () => {
      const allOptions = [
        "Ativado",
        "Suavizar",
        "Contraste",
        "Dente",
        "Base",
        "Batom",
        "Sombra",
        "Blush",
        "Contorno",
      ];
      const initial: Record<string, number> = {};
      allOptions.forEach((opt) => {
        initial[opt] = 60;
      });
      return initial;
    }
  );
  const beautifyTrackRef = useRef<View>(null);
  const [beautifyTrackWidth, setBeautifyTrackWidth] = useState(0);
  const [beautifyTrackX, setBeautifyTrackX] = useState(0);

  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiTempUri, setAiTempUri] = useState<string | null>(null);

  const effectiveUri = aiTempUri || uri;

  // ─── NOVO: swipe gesture para trocar filtro ───
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 15 && Math.abs(gs.dx) > Math.abs(gs.dy * 1.5),
        onPanResponderMove: (_, gs) => {
          swipeAnim.setValue(gs.dx);
        },
        onPanResponderRelease: (_, gs) => {
          const threshold = width * 0.18;
          if (gs.dx < -threshold) {
            const newIdx = Math.min(filterIndex + 1, FILTERS.length - 1);
            setFilter(FILTERS[newIdx].id);
            setFilterIntensity(1.0);
          } else if (gs.dx > threshold) {
            const newIdx = Math.max(filterIndex - 1, 0);
            setFilter(FILTERS[newIdx].id);
            setFilterIntensity(1.0);
          }
          Animated.spring(swipeAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [filterIndex]
  );

  // BeautifyParams para o shader — ATUALIZADO com campos avancados
  const beautifyParams = useMemo<BeautifyParams>(() => {
    const smoothRaw = (beautifyValues["Suavizar"] ?? 60) / 100;
    const contrastRaw = (beautifyValues["Contraste"] ?? 60) / 100;
    const teethRaw = (beautifyValues["Dente"] ?? 60) / 100;
    const baseRaw = (beautifyValues["Base"] ?? 60) / 100;

    const quickBrightness =
      quickAdjustment === "bright" ? 0.08
      : quickAdjustment === "dark" ? -0.08
      : 0.0;
    const quickContrast =
      quickAdjustment === "punch" ? 1.18
      : quickAdjustment === "bright" ? 1.05
      : 1.0;
    const quickSaturation =
      quickAdjustment === "punch" ? 1.18
      : quickAdjustment === "bright" ? 1.02
      : 1.0;

    // Buscar parametros extras do filtro selecionado
    const fp = typeof getFilterShaderParams === "function"
      ? getFilterShaderParams(mapPreviewFilterToExport(filter))
      : {};

    return {
      brightness: quickBrightness + (fp.brightness ?? 0),
      contrast: quickContrast * (0.5 + contrastRaw) * (fp.contrast ?? 1),
      saturation: quickSaturation * (fp.saturation ?? 1),
      smoothing: Math.max(0, smoothRaw - 0.6) * 2.5 + (fp.smoothing ?? 0),
      whitenTeeth: Math.max(0, teethRaw - 0.6) * 2.5,
      baseGlow: Math.max(0, baseRaw - 0.6) * 2.5,
      sharpness: adjustValues.sharpness + (fp.sharpness ?? 0),
      temperature: adjustValues.temperature + (fp.temperature ?? 0),
      vignette: adjustValues.vignette + (fp.vignette ?? 0) + (activeFilter.vignette ? 0.3 : 0),
      grain: adjustValues.grain + (fp.grain ?? 0),
      fade: adjustValues.fade + (fp.fade ?? 0),
      highlights: adjustValues.highlights + (fp.highlights ?? 0),
      shadows: adjustValues.shadows + (fp.shadows ?? 0),
    };
  }, [beautifyValues, quickAdjustment, filter, adjustValues, activeFilter]);

  // LUT source para o preview
  const previewLutSource = useMemo(() => {
    const exportId = mapPreviewFilterToExport(filter);
    return getLutForFilter(exportId);
  }, [filter]);

  // Flag: precisamos do GL renderer no preview? — ATUALIZADO
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

  const exportEffects = useMemo(() => {
    const quick =
      quickAdjustment === "bright"
        ? { brightness: 0.08, contrast: 1.05, saturation: 1.02 }
        : quickAdjustment === "dark"
        ? { brightness: -0.08, contrast: 1.0, saturation: 1.0 }
        : quickAdjustment === "punch"
        ? { brightness: 0.0, contrast: 1.18, saturation: 1.18 }
        : { brightness: 0.0, contrast: 1.0, saturation: 1.0 };

    const soft = Math.max(0, Math.min(1, (beautifyValues["Suavizar"] ?? 60) / 100));
    const faceContrast = Math.max(0, Math.min(1, (beautifyValues["Contraste"] ?? 60) / 100));
    const teeth = Math.max(0, Math.min(1, (beautifyValues["Dente"] ?? 60) / 100));
    const base = Math.max(0, Math.min(1, (beautifyValues["Base"] ?? 60) / 100));

    return {
      filterId: mapPreviewFilterToExport(filter),
      quickAdjustment,
      ...quick,
      beautify: {
        smoothSkin: soft,
        faceContrast,
        whitenTeeth: teeth,
        base,
        tab: beautifyTab,
        option: beautifyOption,
        values: beautifyValues,
      },
    };
  }, [filter, quickAdjustment, beautifyValues, beautifyTab, beautifyOption]);

  const shouldBakeOnExport = useMemo(() => {
    if (mediaType !== "image" && mediaType !== "video") return false;
    if (aiTempUri) return true;
    if (filter !== "none") return true;
    if (quickAdjustment !== "none") return true;
    if ((beautifyValues["Suavizar"] ?? 60) !== 60) return true;
    if ((beautifyValues["Contraste"] ?? 60) !== 60) return true;
    if ((beautifyValues["Dente"] ?? 60) !== 60) return true;
    if ((beautifyValues["Base"] ?? 60) !== 60) return true;
    if (adjustValues.sharpness !== 0 || adjustValues.temperature !== 0) return true;
    if (adjustValues.vignette !== 0 || adjustValues.grain !== 0) return true;
    if (adjustValues.fade !== 0 || adjustValues.highlights !== 0 || adjustValues.shadows !== 0) return true;
    return false;
  }, [mediaType, aiTempUri, filter, quickAdjustment, beautifyValues, adjustValues]);

  const bakeImageWithLut = useCallback(
    (uri: string, filterId: ExportFilterId, bParams: BeautifyParams) => {
      return new Promise<string>((resolve) => {
        setBakeJob({ uri, filterId, beautify: bParams, resolve });
      });
    },
    []
  );

  const maybeBakeMedia = async (inputUri: string) => {
    if (!shouldBakeOnExport) return inputUri;

    try {
      if (mediaType === "image") {
        const exportFilterId = (exportEffects?.filterId as ExportFilterId) || "none";
        const baked = await bakeImageWithLut(inputUri, exportFilterId, beautifyParams);
        if (baked) inputUri = baked;
      }

      const mod: any = FilterExport as any;
      const fn = mod.applyFilterAndExport ?? mod.default;
      if (typeof fn !== "function") return inputUri;

      const out = await fn({
        uri: inputUri,
        mediaType,
        effects: {
          filter: "none",
          quickAdjustment: "none",
          beautify: {},
        },
      });

      if (typeof out === "string" && out) return out;
      if (out && typeof out === "object" && typeof out.uri === "string") return out.uri;
      return inputUri;
    } catch (err) {
      console.log("Falha ao aplicar efeitos no export:", err);
      return inputUri;
    }
  };

  useEffect(() => {
    setMediaLoaded(false);
  }, [uri, nonce, mediaType]);

  useEffect(() => {
    const next = activeFilter.overlay ?? null;
    const prev = nextOverlay ?? prevOverlay ?? null;

    setPrevOverlay(prev);
    setNextOverlay(next);

    transition.stopAnimation();
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    const b = activeFilter.blur ?? 0;
    setBlurIntensity(b);
    blurOpacity.stopAnimation();
    blurOpacity.setValue(0);
    if (b > 0)
      Animated.timing(blurOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();

    if (hideLabelRef.current) clearTimeout(hideLabelRef.current);
    labelOpacity.stopAnimation();
    labelScale.stopAnimation();
    labelOpacity.setValue(0);
    labelScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.spring(labelScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 0,
      }),
    ]).start();
    hideLabelRef.current = setTimeout(() => {
      Animated.timing(labelOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }, 900);
  }, [activeFilter.id]);

  useEffect(() => {
    if (syncScrollRef.current) return;
    listRef.current?.scrollToOffset({
      offset: filterIndex * ITEM_W,
      animated: true,
    });
  }, [filterIndex]);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    };
    loadUser();
  }, []);

  useEffect(() => {
    setMediaLoaded(false);
  }, [uri, nonce]);

  useEffect(() => {
    return () => {
      if (aiTempUri) {
        FileSystem.deleteAsync(aiTempUri, { idempotent: true }).catch(() => {});
      }
    };
  }, [aiTempUri]);

  const handleBack = () => router.back();

  async function uploadToBucket(
    bucket: "posts" | "stories",
    path: string,
    uriToUpload: string,
    contentType: string,
    maxRetries: number = 3
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (Platform.OS === "web") {
          const response = await fetch(uriToUpload);
          const blob = await response.blob();
          const { error } = await supabase.storage
            .from(bucket)
            .upload(path, blob, { contentType, upsert: true });
          if (error) throw error;
        } else {
          const base64 = await FileSystem.readAsStringAsync(uriToUpload, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const binaryString = (global as any).atob
            ? (global as any).atob(base64)
            : atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer;

          const { error } = await supabase.storage
            .from(bucket)
            .upload(path, arrayBuffer, { contentType, upsert: true });
          if (error) throw error;
        }
        return;
      } catch (err) {
        if (attempt === maxRetries) {
          throw err;
        }
      }
    }
  }

  function extractTags(text: string) {
    const hashtagMatches = text.match(/#(\w+)/g) ?? [];
    const mentionMatches = text.match(/@(\w+)/g) ?? [];

    const hashtags = Array.from(
      new Set(
        hashtagMatches.map((tag) => tag.replace("#", "").trim().toLowerCase())
      )
    );
    const mentions = Array.from(
      new Set(
        mentionMatches.map((m) => m.replace("@", "").trim().toLowerCase())
      )
    );

    return { hashtags, mentions };
  }

  const performSendWithUri = async (finalUri: string) => {
    if (!finalUri) return;

    if (mode === "reel") {
      router.push({
        pathname: "/new" as any,
        params: { source: "camera", uri: finalUri, mediaType, filter },
      });
      return;
    }
    let bakedUri = finalUri;
    bakedUri = await maybeBakeMedia(bakedUri);

    if (mode === "story") {
      try {
        setSending(true);

        let currentUserId = userId;
        if (!currentUserId) {
          const { data } = await supabase.auth.getUser();
          currentUserId = data.user?.id ?? null;
        }
        if (!currentUserId) {
          setSending(false);
          return;
        }

        const isVideo = mediaType === "video";

        let uploadUri = bakedUri;
        let thumbUploadUri: string | null = null;

        if (!isVideo) {
          uploadUri = await compressImage(bakedUri);
        } else {
          const prepared = await prepareVideo(bakedUri);
          uploadUri = prepared.videoUri;
          thumbUploadUri = prepared.thumbUri ?? null;
        }

        const timestamp = Date.now();
        const basePath = `${currentUserId}/${timestamp}`;
        const ext = isVideo ? "mp4" : "jpg";
        const contentType = isVideo ? "video/mp4" : "image/jpeg";
        const mediaPath = `${basePath}.${ext}`;

        await uploadToBucket("stories", mediaPath, uploadUri, contentType);

        let thumbPath: string | null = null;
        if (isVideo && thumbUploadUri) {
          thumbPath = `${basePath}.jpg`;
          await uploadToBucket("stories", thumbPath, thumbUploadUri, "image/jpeg");
        }

        const { error: dbError } = await supabase.from("stories").insert({
          user_id: currentUserId,
          media_type: mediaType,
          media_path: mediaPath,
          thumbnail_path: thumbPath,
          caption: caption || null,
          has_sound: isVideo,
        });

        setSending(false);
        if (!dbError) {
          router.replace("/feed");
        }
      } catch (err) {
        console.log("Erro ao enviar story da camera:", err);
        setSending(false);
        Alert.alert(
          "Erro ao publicar story",
          "Nao foi possivel publicar seu story. Tente novamente."
        );
      }
      return;
    }

    try {
      setSending(true);

      let currentUserId = userId;
      if (!currentUserId) {
        const { data } = await supabase.auth.getUser();
        currentUserId = data.user?.id ?? null;
      }
      if (!currentUserId) {
        setSending(false);
        return;
      }

      const isVideo = mediaType === "video";
      const timestamp = Date.now();

      let uploadUri = bakedUri;
      let thumbUri: string | null = null;

      if (!isVideo) {
        uploadUri = await compressImage(bakedUri);
      } else {
        const prepared = await prepareVideo(bakedUri);
        uploadUri = prepared.videoUri;
        thumbUri = prepared.thumbUri ?? null;
      }

      const ext = isVideo ? "mp4" : "jpg";
      const contentType = isVideo ? "video/mp4" : "image/jpeg";
      const basePath = `${currentUserId}/${timestamp}`;
      const mediaPath = `${basePath}.${ext}`;

      await uploadToBucket("posts", mediaPath, uploadUri, contentType);

      let thumbPath: string | null = null;
      if (isVideo && thumbUri) {
        thumbPath = `${basePath}.jpg`;
        await uploadToBucket("posts", thumbPath, thumbUri, "image/jpeg");
      }

      const { hashtags, mentions } = extractTags(caption);

      const { data: insertedPost, error: postError } = await supabase
        .from("posts")
        .insert({
          user_id: currentUserId,
          media_type: mediaType,
          image_path: mediaPath,
          thumbnail_path: thumbPath,
          caption: caption || null,
          width: null,
          height: null,
          duration: null,
          hashtags,
          mentions,
          privacy_level: "public",
          is_carousel: false,
        })
        .select("id")
        .single();

      if (postError || !insertedPost) {
        throw postError || new Error("Erro ao criar post");
      }

      const postId = insertedPost.id;

      const { error: mediaError } = await supabase.from("post_media").insert({
        post_id: postId,
        media_type: mediaType,
        media_path: mediaPath,
        thumbnail_path: thumbPath,
        width: null,
        height: null,
        duration: null,
        position: 0,
      });

      if (mediaError) {
        throw mediaError;
      }

      setSending(false);
      router.replace("/feed");
    } catch (err) {
      console.log("Erro ao enviar midia da camera:", err);
      setSending(false);
      Alert.alert(
        "Erro ao publicar",
        "Nao foi possivel publicar o conteudo. Tente novamente."
      );
    }
  };

  function getAiPresetFromFilter() {
    switch (filter) {
      case "face_enhance":
        return "face_enhance_soft";
      case "studio_glow":
        return "studio_portrait";
      case "cartoon_soft":
        return "cartoon_soft";
      case "bw_art":
        return "bw_artistic";
      default:
        return "face_enhance_soft";
    }
  }

  function getAiPresetFromBeautify() {
    if (beautifyTab === "face") {
      if (beautifyOption === "Dente") return "whiten_teeth";
      return "soft_skin";
    }
    if (beautifyTab === "makeup") {
      if (
        beautifyOption === "Batom" ||
        beautifyOption === "Blush" ||
        beautifyOption === "Contorno"
      ) {
        return "makeup_glam";
      }
      return "makeup_natural";
    }
    return "soft_skin";
  }

  async function applyAiTransform(mode: "filter" | "beautify", preset: string) {
    if (mediaType !== "image" || !uri) return;
    if (aiProcessing) return;

    try {
      setAiProcessing(true);

      const base64 = await FileSystem.readAsStringAsync(effectiveUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { data, error } = await supabase.functions.invoke("ai-image-flux", {
        body: {
          mode,
          preset,
          image: `data:image/jpeg;base64,${base64}`,
          image_base64: base64,
          mime: "image/jpeg",
        },
      });

      if (error || !data || typeof data !== "object") {
        const msg = (error as any)?.message || (data as any)?.error || "Nao foi possivel aplicar IA. Tente novamente.";
        Alert.alert("Erro", String(msg));
        return;
      }

      const outputImageUrl = (data as any).outputImageUrl as string | undefined;

      if (!outputImageUrl) {
        Alert.alert("Erro", "IA nao retornou imagem.");
        return;
      }

      const localPath =
        (FileSystem.documentDirectory ?? "") +
        `ai-${Date.now().toString()}.webp`;

      const download = await FileSystem.downloadAsync(
        outputImageUrl,
        localPath
      );

      if (!download || !download.uri) {
        Alert.alert("Erro", "Falha ao baixar imagem da IA.");
        return;
      }

      if (aiTempUri && aiTempUri !== download.uri) {
        try {
          await FileSystem.deleteAsync(aiTempUri, { idempotent: true });
        } catch {}
      }

      setMediaLoaded(false);
      setAiTempUri(download.uri);
    } catch (err) {
      Alert.alert("Erro", "Falha ao aplicar IA. Tente novamente.");
    } finally {
      setAiProcessing(false);
    }
  }

  async function handleRevertAi() {
    if (!aiTempUri) return;
    try {
      await FileSystem.deleteAsync(aiTempUri, { idempotent: true });
    } catch {}
    setAiTempUri(null);
    setMediaLoaded(false);
  }

  const handleApplyFilterAi = () => {
    const preset = getAiPresetFromFilter();
    void applyAiTransform("filter", preset);
  };

  const handleApplyBeautifyAi = () => {
    const preset = getAiPresetFromBeautify();
    void applyAiTransform("beautify", preset);
  };

  const handleSend = () => {
    if (!effectiveUri || sending || aiProcessing) return;
    void performSendWithUri(effectiveUri);
  };

  const label =
    mode === "story" ? "Publicar Story" : mode === "reel" ? "Avancar" : "Avancar";

  const primaryAudienceLabel =
    mode === "story" ? "Seus stories" : mode === "reel" ? "Reels" : "Feed";
  const secondaryAudienceLabel = "Amigos proximos";

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
        <View
          style={[
            styles.carouselThumb,
            { backgroundColor: item.overlay ?? "rgba(255,255,255,0.18)" },
          ]}
        />
        <Text
          style={[styles.carouselText, active && styles.carouselTextActive]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const prevOpacity = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const nextOpacity = transition;

  // ─── ATUALIZADO: adicionado "adjust" na toolbar ───
  const baseTools = [
    { key: "text", label: "Texto", icon: "Aa" },
    { key: "stickers", label: "Figurinhas", icon: "☻" },
    { key: "music", label: "Musicas", icon: "♫" },
    { key: "beautify", label: "Embelezar", icon: "✧" },
    { key: "adjust", label: "Ajustes", icon: "⚙" },
    { key: "mention", label: "Mencionar", icon: "@" },
    { key: "effects", label: "Efeitos", icon: "✺" },
    { key: "draw", label: "Desenhar", icon: "✎" },
    { key: "save", label: "Salvar", icon: "⇣" },
  ] as const;

  const beautifyFaceOptions = [
    "Ativado",
    "Suavizar",
    "Contraste",
    "Dente",
    "Base",
  ];
  const beautifyMakeupOptions = [
    "Ativado",
    "Batom",
    "Sombra",
    "Blush",
    "Contorno",
  ];

  const quickAdjustments = [
    { key: "none", label: "Normal" },
    { key: "bright", label: "Claro" },
    { key: "dark", label: "Escuro" },
    { key: "punch", label: "Punch" },
  ] as const;

  // ─── NOVO: itens do painel de ajustes avancados ───
  const adjustItems: {
    key: keyof typeof adjustValues; label: string; icon: string;
    min: number; max: number; step: number;
  }[] = [
    { key: "sharpness", label: "Nitidez", icon: "△", min: 0, max: 1.0, step: 0.01 },
    { key: "temperature", label: "Temperatura", icon: "🌡", min: -0.5, max: 0.5, step: 0.01 },
    { key: "vignette", label: "Vinheta", icon: "⬡", min: 0, max: 1.0, step: 0.01 },
    { key: "grain", label: "Grao", icon: "▤", min: 0, max: 0.5, step: 0.01 },
    { key: "fade", label: "Fade", icon: "▨", min: 0, max: 0.5, step: 0.01 },
    { key: "highlights", label: "Realces", icon: "▲", min: -0.5, max: 0.5, step: 0.01 },
    { key: "shadows", label: "Sombras", icon: "▼", min: -0.5, max: 0.5, step: 0.01 },
  ];

  const beautifyValue = beautifyValues[beautifyOption] ?? 60;

  const sliderAnimValue = useRef(new Animated.Value(beautifyValue / 100)).current;

  useEffect(() => {
    sliderAnimValue.setValue((beautifyValues[beautifyOption] ?? 60) / 100);
  }, [beautifyOption]);

  const handleBeautifyValueFromGesture = (evt: any) => {
    if (!beautifyTrackWidth) return;
    const pageX =
      evt?.nativeEvent?.pageX ??
      evt?.nativeEvent?.changedTouches?.[0]?.pageX ??
      evt?.nativeEvent?.touches?.[0]?.pageX;
    if (typeof pageX !== "number") return;
    const relativeX = pageX - beautifyTrackX;
    const ratio = relativeX / beautifyTrackWidth;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const value = Math.round(clampedRatio * 100);

    sliderAnimValue.setValue(clampedRatio);

    setBeautifyValues((prev) => ({
      ...prev,
      [beautifyOption]: value,
    }));
  };

  const tools = toolsCollapsed
    ? [
        ...baseTools.slice(0, 5),
        { key: "more", label: "Mais", icon: "⋮" },
      ]
    : [
        ...baseTools,
        { key: "more", label: "Menos", icon: "⋮" },
      ];

  // ─── ATUALIZADO: handleToolPress com "adjust" ───
  const handleToolPress = (key: string) => {
    if (key === "beautify") {
      setShowBeautifyPanel((prev) => !prev);
      setShowInlineFilters(false);
      setEffectsOpen(false);
      setShowAdjustPanel(false);
      setActiveToolSheet(null);
      setToolsCollapsed(true);
      return;
    }

    if (key === "adjust") {
      setShowAdjustPanel((prev) => !prev);
      setShowBeautifyPanel(false);
      setEffectsOpen(false);
      setShowInlineFilters(false);
      setActiveToolSheet(null);
      setToolsCollapsed(true);
      return;
    }

    if (key === "effects") {
      setEffectsOpen((prev) => !prev);
      setShowBeautifyPanel(false);
      setShowAdjustPanel(false);
      setActiveToolSheet(null);
      setShowInlineFilters(false);
      setToolsCollapsed(true);
      return;
    }

    if (key === "more") {
      setToolsCollapsed((prev) => !prev);
      setEffectsOpen(false);
      setShowBeautifyPanel(false);
      setShowAdjustPanel(false);
      setShowInlineFilters(false);
      setActiveToolSheet(null);
      return;
    }

    setEffectsOpen(false);
    setShowBeautifyPanel(false);
    setShowAdjustPanel(false);
    setShowInlineFilters(false);
    setToolsCollapsed(true);

    if (
      key === "text" ||
      key === "stickers" ||
      key === "music" ||
      key === "mention" ||
      key === "draw" ||
      key === "save"
    ) {
      setActiveToolSheet((prev) => (prev === key ? null : (key as any)));
      return;
    }
  };

  function getBeautifyIcon(option: string) {
    switch (option) {
      case "Ativado":
        return "✨";
      case "Suavizar":
        return "💧";
      case "Contraste":
        return "☀️";
      case "Dente":
        return "😁";
      case "Base":
        return "🧴";
      case "Batom":
        return "💄";
      case "Sombra":
        return "👁️";
      case "Blush":
        return "🌸";
      case "Contorno":
        return "🎭";
      default:
        return "●";
    }
  }

  const sliderFillWidth = sliderAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const sliderThumbLeft = sliderAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  return (
    <View style={styles.container}>
      {/* OffscreenLutRenderer para exportacao com beautify */}
      {bakeJob ? (
        <OffscreenLutRenderer
          sourceUri={bakeJob.uri}
          filter={bakeJob.filterId}
          beautify={bakeJob.beautify}
          exportWidth={1080}
          exportHeight={1350}
          onFinish={(u) => {
            const out = u || bakeJob.uri;
            const r = bakeJob.resolve;
            setBakeJob(null);
            r(out);
          }}
        />
      ) : null}

      {/* ─── ATUALIZADO: Preview com swipe gesture ─── */}
      <Animated.View
        style={{ flex: 1, transform: [{ translateX: swipeAnim }] }}
        {...panResponder.panHandlers}
      >
        {mediaType === "image" && needsGlPreview ? (
          <LutRenderer
            key={`gl-${effectiveUri}-${filter}-${filterIntensity}-${JSON.stringify(beautifyParams)}`}
            sourceUri={effectiveUri}
            lut={previewLutSource}
            intensity={filterIntensity}
            beautify={beautifyParams}
            style={styles.preview}
            onReady={() => setMediaLoaded(true)}
          />
        ) : mediaType === "image" ? (
          <Image
            key={`${effectiveUri}::${nonce}::${filter}`}
            source={{ uri: effectiveUri }}
            style={styles.preview}
            resizeMode={isWeb ? "contain" : "cover"}
            onLoadEnd={() => setMediaLoaded(true)}
          />
        ) : (
          <Video
            key={`${uri}::${nonce}`}
            source={{ uri }}
            style={styles.preview}
            resizeMode={isWeb ? ResizeMode.CONTAIN : ResizeMode.COVER}
            shouldPlay
            isLooping
            onLoad={() => setMediaLoaded(true)}
          />
        )}
      </Animated.View>

      {/* Overlays visuais (vignette, glow) */}
      {!needsGlPreview && prevOverlay && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.filterOverlay,
            { backgroundColor: prevOverlay, opacity: prevOpacity },
          ]}
        />
      )}
      {!needsGlPreview && nextOverlay && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.filterOverlay,
            { backgroundColor: nextOverlay, opacity: nextOpacity },
          ]}
        />
      )}

      {blurIntensity > 0 && Platform.OS !== "web" && (
        <Animated.View
          pointerEvents="none"
          style={[styles.blurWrap, { opacity: blurOpacity }]}
        >
          <BlurView
            intensity={blurIntensity}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {activeFilter.vignette && (
        <View pointerEvents="none" style={styles.vignetteWrap}>
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vTop}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vBottom}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vLeft}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            style={styles.vRight}
          />
        </View>
      )}

      {activeFilter.glow && (
        <View pointerEvents="none" style={styles.glowWrap}>
          <LinearGradient
            colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]}
            style={styles.glowTop}
          />
        </View>
      )}

      {/* Quick adjustments visuais — apenas para video */}
      {!needsGlPreview && quickAdjustment === "bright" && (
        <View
          pointerEvents="none"
          style={[styles.adjustmentOverlay, styles.adjustmentBright]}
        />
      )}
      {!needsGlPreview && quickAdjustment === "dark" && (
        <View
          pointerEvents="none"
          style={[styles.adjustmentOverlay, styles.adjustmentDark]}
        />
      )}
      {!needsGlPreview && quickAdjustment === "punch" && (
        <View
          pointerEvents="none"
          style={[styles.adjustmentOverlay, styles.adjustmentPunch]}
        />
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.filterLabel,
          { opacity: labelOpacity, transform: [{ scale: labelScale }] },
        ]}
      >
        <Text style={styles.filterLabelText}>
          {activeFilter.name}
          {filterIntensity < 1 ? ` ${Math.round(filterIntensity * 100)}%` : ""}
        </Text>
      </Animated.View>

      {((!mediaLoaded) || aiProcessing) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.75)", "rgba(0,0,0,0.0)"]}
        style={styles.topGradient}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.85)"]}
        style={styles.bottomGradient}
      />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.85}>
          <Text style={styles.topIcon}>←</Text>
        </TouchableOpacity>

        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>
            {mode === "story" ? "Story" : mode === "reel" ? "Reel" : "Post"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setFiltersOpen(true)}
          activeOpacity={0.85}
          style={styles.topRight}
        >
          <Text style={styles.topRightIcon}>✦</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Swipe hint ─── */}
      <View pointerEvents="none" style={styles.swipeHint}>
        <Text style={styles.swipeHintText}>◀ Deslize para trocar filtro ▶</Text>
      </View>

      <View style={styles.rightTools}>
        {tools.map((tool) => (
          <TouchableOpacity
            key={tool.key}
            activeOpacity={0.9}
            onPress={() => handleToolPress(tool.key)}
            style={styles.rightToolButton}
          >
            {!toolsCollapsed && tool.key !== "more" && (
              <Text style={styles.rightToolLabel}>{tool.label}</Text>
            )}
            {!toolsCollapsed && tool.key === "more" && (
              <Text style={styles.rightToolLabel}>{tool.label}</Text>
            )}

            <View style={styles.rightToolCircle}>
              <Text style={styles.rightToolIcon}>{tool.icon}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── NOVO: Slider de intensidade do filtro ─── */}
      {filter !== "none" && (
        <View style={styles.intensityBar}>
          <Text style={styles.intensityLabel}>
            Intensidade: {Math.round(filterIntensity * 100)}%
          </Text>
          <View style={styles.intensitySliderRow}>
            <Text style={styles.intensityMinMax}>0</Text>
            <View style={styles.intensityTrack}>
              <View
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  const px = e.nativeEvent.locationX;
                  const w = width - 100;
                  setFilterIntensity(Math.max(0, Math.min(1, px / w)));
                }}
                onResponderMove={(e) => {
                  const px = e.nativeEvent.locationX;
                  const w = width - 100;
                  setFilterIntensity(Math.max(0, Math.min(1, px / w)));
                }}
                style={styles.intensityTrackInner}
              >
                <View
                  style={[
                    styles.intensityFill,
                    { width: `${filterIntensity * 100}%` as any },
                  ]}
                />
                <View
                  style={[
                    styles.intensityThumb,
                    { left: `${filterIntensity * 100}%` as any },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.intensityMinMax}>100</Text>
          </View>
        </View>
      )}

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 16 }]}>
        {showBeautifyPanel && (
          <View style={styles.beautifyPanel}>
            <View style={styles.beautifySliderRow}>
              <View
                style={styles.beautifySliderTrack}
                ref={beautifyTrackRef}
                onLayout={() => {
                  beautifyTrackRef.current?.measureInWindow((x, _y, w) => {
                    setBeautifyTrackX(x);
                    setBeautifyTrackWidth(w);
                  });
                }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={handleBeautifyValueFromGesture}
                onResponderMove={handleBeautifyValueFromGesture}
              >
                <Animated.View
                  style={[
                    styles.beautifySliderFill,
                    { width: sliderFillWidth as any },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.beautifySliderThumb,
                    {
                      left: sliderThumbLeft as any,
                      transform: [{ translateX: -11 }],
                    },
                  ]}
                />
              </View>
              <Text style={styles.beautifyValueLabel}>{beautifyValue}</Text>
            </View>

            <View style={styles.beautifyTabsRow}>
              <View style={styles.beautifyTabsLeft}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setBeautifyTab("face");
                    setBeautifyOption(beautifyFaceOptions[0]);
                  }}
                  style={[
                    styles.beautifyTabButton,
                    beautifyTab === "face" && styles.beautifyTabButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.beautifyTabText,
                      beautifyTab === "face" && styles.beautifyTabTextActive,
                    ]}
                  >
                    Rosto
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    setBeautifyTab("makeup");
                    setBeautifyOption(beautifyMakeupOptions[0]);
                  }}
                  style={[
                    styles.beautifyTabButton,
                    beautifyTab === "makeup" && styles.beautifyTabButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.beautifyTabText,
                      beautifyTab === "makeup" && styles.beautifyTabTextActive,
                    ]}
                  >
                    Maquiagem
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.beautifyTabsRight}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setBeautifyValues((prev) => ({
                      ...prev,
                      [beautifyOption]: 60,
                    }));
                    setBeautifyOption("Ativado");
                  }}
                >
                  <Text style={styles.beautifyResetText}>Redefinir</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleApplyBeautifyAi}
                  disabled={aiProcessing || mediaType !== "image"}
                >
                  <Text style={styles.beautifyApplyText}>
                    {aiProcessing ? "IA..." : "Aplicar IA"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.beautifyOptionsRow}
            >
              {(beautifyTab === "face"
                ? beautifyFaceOptions
                : beautifyMakeupOptions
              ).map((option) => {
                const active = beautifyOption === option;
                return (
                  <TouchableOpacity
                    key={option}
                    activeOpacity={0.9}
                    onPress={() => setBeautifyOption(option)}
                    style={styles.beautifyOptionItem}
                  >
                    <View
                      style={[
                        styles.beautifyOptionCircle,
                        active && styles.beautifyOptionCircleActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.beautifyOptionIcon,
                          active && styles.beautifyOptionIconActive,
                        ]}
                      >
                        {getBeautifyIcon(option)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.beautifyOptionLabel,
                        active && styles.beautifyOptionLabelActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ─── NOVO: Painel de ajustes avancados ─── */}
        {showAdjustPanel && (
          <View style={styles.adjustPanelContainer}>
            <View style={styles.adjustPanelHeader}>
              <Text style={styles.adjustPanelTitle}>Ajustes Avancados</Text>
              <TouchableOpacity
                onPress={() => setAdjustValues({
                  sharpness: 0, temperature: 0, vignette: 0,
                  grain: 0, fade: 0, highlights: 0, shadows: 0,
                })}
              >
                <Text style={styles.beautifyResetText}>Redefinir</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.3 }}>
              {adjustItems.map((item) => (
                <View key={item.key} style={styles.adjustRow}>
                  <Text style={styles.adjustIcon}>{item.icon}</Text>
                  <Text style={styles.adjustLabel}>{item.label}</Text>
                  <View style={styles.adjustSliderWrap}>
                    <View
                      style={styles.adjustSliderTrack}
                      onStartShouldSetResponder={() => true}
                      onMoveShouldSetResponder={() => true}
                      onResponderGrant={(e) => {
                        const px = e.nativeEvent.locationX;
                        const trackW = width - 180;
                        const ratio = Math.max(0, Math.min(1, px / trackW));
                        const val = item.min + ratio * (item.max - item.min);
                        setAdjustValues((prev) => ({ ...prev, [item.key]: Math.round(val * 100) / 100 }));
                      }}
                      onResponderMove={(e) => {
                        const px = e.nativeEvent.locationX;
                        const trackW = width - 180;
                        const ratio = Math.max(0, Math.min(1, px / trackW));
                        const val = item.min + ratio * (item.max - item.min);
                        setAdjustValues((prev) => ({ ...prev, [item.key]: Math.round(val * 100) / 100 }));
                      }}
                    >
                      <View style={styles.adjustSliderBg} />
                      <View
                        style={[
                          styles.adjustSliderFill,
                          {
                            width: `${((adjustValues[item.key] - item.min) / (item.max - item.min)) * 100}%` as any,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.adjustSliderThumb,
                          {
                            left: `${((adjustValues[item.key] - item.min) / (item.max - item.min)) * 100}%` as any,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={styles.adjustValue}>
                    {adjustValues[item.key].toFixed(2)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {effectsOpen && (
          <View style={styles.quickAdjustRow}>
            {quickAdjustments.map((item) => {
              const active = quickAdjustment === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.9}
                  onPress={() => setQuickAdjustment(item.key as any)}
                  style={[
                    styles.quickAdjustChip,
                    active && styles.quickAdjustChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.quickAdjustText,
                      active && styles.quickAdjustTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.aiApplyButton}
              onPress={handleApplyFilterAi}
              disabled={aiProcessing || mediaType !== "image"}
            >
              {aiProcessing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.aiApplyButtonText}>IA</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
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

        <View style={styles.audienceRow}>
          <TouchableOpacity activeOpacity={0.9} style={styles.audienceChip}>
            <Text style={styles.audienceChipText}>{primaryAudienceLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.9} style={styles.audienceChipAlt}>
            <Text style={styles.audienceChipAltText}>
              {secondaryAudienceLabel}
            </Text>
          </TouchableOpacity>

          {aiTempUri ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleRevertAi}
              style={styles.aiRevertButton}
            >
              <Text style={styles.aiRevertButtonText}>Reverter</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleSend}
            style={styles.sendButton}
            disabled={sending || aiProcessing}
          >
            {sending || aiProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>➜</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[styles.carouselWrap, !showInlineFilters && { opacity: 0 }]}
        pointerEvents={showInlineFilters ? "auto" : "none"}
      >
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
          contentContainerStyle={{
            paddingHorizontal: (width - ITEM_W) / 2,
          }}
          renderItem={renderFilterItem}
          onMomentumScrollEnd={onCarouselMomentumEnd}
          getItemLayout={(_, index) => ({
            length: ITEM_W,
            offset: ITEM_W * index,
            index,
          })}
        />
      </View>

      <Modal
        visible={activeToolSheet === "text"}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveToolSheet(null)}
      >
        <View style={styles.toolModalOverlay}>
          <View
            style={[
              styles.textToolContainer,
              { paddingBottom: insets.bottom + 24 },
            ]}
          >
            <View style={styles.textToolHeader}>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}>
                <Text style={styles.textToolHeaderButton}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={styles.textToolHeaderTitle}>Texto</Text>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}>
                <Text style={styles.textToolHeaderButton}>Concluir</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.textToolFormattingRow}>
              <Text style={styles.textToolFormattingLabel}>Aa</Text>
              <View style={styles.textToolColorDotRow}>
                <View style={styles.textToolColorDot} />
                <View style={styles.textToolColorDot} />
                <View style={styles.textToolColorDot} />
              </View>
            </View>

            <TextInput
              style={styles.textToolInput}
              placeholder="Toque para digitar..."
              placeholderTextColor="#ccc"
              multiline
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={
          activeToolSheet === "stickers" ||
          activeToolSheet === "music" ||
          activeToolSheet === "mention" ||
          activeToolSheet === "effects" ||
          activeToolSheet === "draw" ||
          activeToolSheet === "save"
        }
        transparent
        animationType="slide"
        onRequestClose={() => setActiveToolSheet(null)}
      >
        <Pressable
          style={styles.toolModalOverlay}
          onPress={() => setActiveToolSheet(null)}
        >
          <Pressable style={styles.bottomSheet} onPress={() => {}}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeaderRow}>
              <Text style={styles.bottomSheetTitle}>
                {activeToolSheet === "stickers" && "Figurinhas"}
                {activeToolSheet === "music" && "Musicas"}
                {activeToolSheet === "mention" && "Mencionar"}
                {activeToolSheet === "effects" && "Efeitos"}
                {activeToolSheet === "draw" && "Desenhar"}
                {activeToolSheet === "save" && "Salvar"}
              </Text>
              <TouchableOpacity onPress={() => setActiveToolSheet(null)}>
                <Text style={styles.bottomSheetClose}>Fechar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar..."
                placeholderTextColor="#888"
              />
            </View>

            {activeToolSheet === "stickers" && (
              <View style={styles.stickersGrid}>
                {[
                  "LOCALIZACAO",
                  "MENCAO",
                  "MUSICA",
                  "GIF",
                  "PERGUNTAS",
                  "ENQUETE",
                  "LINK",
                  "HASHTAG",
                ].map((label) => (
                  <View key={label} style={styles.stickerChip}>
                    <Text style={styles.stickerChipText}>{label}</Text>
                  </View>
                ))}
              </View>
            )}

            {activeToolSheet === "music" && (
              <ScrollView style={styles.musicList}>
                {[
                  "Fim de Tarde – JrOliveira",
                  "Dias De Luta, Dias De Gloria – Charlie Brown Jr.",
                  "Disciplina Blindada – Jamal Natue",
                  "De uns Dias pra Ca – Mc Luuky",
                  "Um Centimetro – Toque Dez",
                  "Onde Nos Chegou – Toque Dez",
                ].map((track) => (
                  <View key={track} style={styles.musicRow}>
                    <View style={styles.musicThumb} />
                    <View style={styles.musicInfo}>
                      <Text style={styles.musicTitle}>{track}</Text>
                      <Text style={styles.musicSubtitle}>Pre-visualizacao</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            {activeToolSheet === "mention" && (
              <ScrollView style={styles.mentionList}>
                {[
                  "kaka_piecho",
                  "julyanags",
                  "sthefandambros",
                  "regisrafael",
                  "alexandre.da.fonseca",
                ].map((user) => (
                  <View key={user} style={styles.mentionRow}>
                    <View style={styles.mentionAvatar} />
                    <Text style={styles.mentionName}>{user}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            {(activeToolSheet === "effects" ||
              activeToolSheet === "draw" ||
              activeToolSheet === "save") && (
              <View style={styles.placeholderContent}>
                <Text style={styles.placeholderText}>
                  Em breve aqui vao os recursos completos de{" "}
                  {activeToolSheet === "effects" && "efeitos"}
                  {activeToolSheet === "draw" && "desenho"}
                  {activeToolSheet === "save" && "salvar / rascunho"} do seu
                  Story.
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={filtersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setFiltersOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>IA Criativa</Text>

            <View style={styles.filtersGrid}>
              {FILTERS.map((f) => {
                const active = f.id === filter;
                return (
                  <TouchableOpacity
                    key={f.id}
                    activeOpacity={0.9}
                    onPress={() => { setFilter(f.id); setFilterIntensity(1.0); }}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <View
                      style={[
                        styles.filterThumb,
                        {
                          backgroundColor:
                            f.overlay ?? "rgba(255,255,255,0.18)",
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {f.name}
                    </Text>
                    <Text style={styles.filterChipDescription} numberOfLines={2}>
                      {f.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setFiltersOpen(false)}
              style={styles.sheetDone}
            >
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
  preview: { width, height: previewHeight, position: "absolute", top: 0, left: 0 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  filterOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },
  blurWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },
  vignetteWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },
  vTop: {
    position: "absolute", top: 0, left: 0, right: 0, height: 160,
  },
  vBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
    transform: [{ rotate: "180deg" }],
  },
  vLeft: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 140,
    transform: [{ rotate: "90deg" }],
  },
  vRight: {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 140,
    transform: [{ rotate: "-90deg" }],
  },
  glowWrap: {
    position: "absolute", top: 0, left: 0, right: 0, height: 220,
  },
  glowTop: {
    position: "absolute", top: 0, left: 0, right: 0, height: 220,
  },
  adjustmentOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  },
  adjustmentBright: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  adjustmentDark: {
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  adjustmentPunch: {
    backgroundColor: "rgba(0,0,0,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
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
  topGradient: {
    position: "absolute", top: 0, left: 0, right: 0, height: height * 0.25,
  },
  bottomGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: height * 0.42,
  },
  topBar: {
    position: "absolute", top: 26, left: 16, right: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  topIcon: { color: "#fff", fontSize: 26, fontWeight: "700" },
  topBadge: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)",
  },
  topBadgeText: {
    color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.5,
  },
  topRight: { width: 40, alignItems: "flex-end" },
  topRightIcon: { color: "#fff", fontSize: 22 },

  // ─── NOVO: swipe hint ───
  swipeHint: {
    position: "absolute", top: height * 0.24, alignSelf: "center",
  },
  swipeHintText: {
    color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "500",
  },

  rightTools: {
    position: "absolute", right: 12, top: height * 0.16,
  },
  rightToolButton: {
    flexDirection: "row-reverse", alignItems: "center", marginBottom: 10,
  },
  rightToolCircle: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center", marginLeft: 8,
  },
  rightToolIcon: { color: "#fff", fontSize: 18, fontWeight: "800" },
  rightToolLabel: {
    color: "#fff", fontSize: 13, fontWeight: "700",
  },

  // ─── NOVO: intensity slider ───
  intensityBar: {
    position: "absolute",
    bottom: 220,
    left: 18, right: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  intensityLabel: {
    color: "#fff", fontSize: 12, fontWeight: "600", textAlign: "center", marginBottom: 6,
  },
  intensitySliderRow: {
    flexDirection: "row", alignItems: "center",
  },
  intensityMinMax: {
    color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600", width: 24, textAlign: "center",
  },
  intensityTrack: {
    flex: 1, marginHorizontal: 4,
  },
  intensityTrackInner: {
    height: 6, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.20)",
    position: "relative",
  },
  intensityFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    borderRadius: 999, backgroundColor: "#ff3366",
  },
  intensityThumb: {
    position: "absolute", top: -9,
    width: 24, height: 24, borderRadius: 999,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
    transform: [{ translateX: -12 }],
  },

  bottomPanel: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 18, paddingBottom: 0,
  },
  quickAdjustRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 4,
  },
  quickAdjustChip: {
    flex: 1, height: 32, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 4, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  quickAdjustChipActive: {
    backgroundColor: "rgba(255,51,85,0.2)",
    borderColor: "rgba(255,51,85,0.6)",
  },
  quickAdjustText: {
    color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700",
  },
  quickAdjustTextActive: { color: "#fff" },
  legendRow: {
    borderRadius: 18, backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10,
  },
  legendInput: {
    color: "#fff", fontSize: 14, maxHeight: 70,
  },
  audienceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  audienceChip: {
    flex: 1, height: 40, borderRadius: 999,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    marginRight: 8,
  },
  audienceChipText: {
    color: "#000", fontWeight: "800", fontSize: 13,
  },
  audienceChipAlt: {
    flex: 1, height: 40, borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
    marginRight: 8,
  },
  audienceChipAltText: {
    color: "#fff", fontWeight: "700", fontSize: 13,
  },
  aiRevertButton: {
    height: 40, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
    marginRight: 8,
  },
  aiRevertButtonText: {
    color: "#fff", fontWeight: "700", fontSize: 13,
  },
  sendButton: {
    width: 46, height: 46, borderRadius: 999,
    backgroundColor: "rgba(0,149,246,0.95)",
    alignItems: "center", justifyContent: "center",
  },
  sendIcon: { color: "#fff", fontSize: 20, fontWeight: "900" },
  carouselWrap: {
    position: "absolute", left: 0, right: 0, bottom: 110, height: 86,
  },
  carouselItem: {
    width: ITEM_W, alignItems: "center", justifyContent: "center",
    paddingTop: 10, paddingBottom: 12, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  carouselItemActive: {
    backgroundColor: "rgba(255,51,85,0.16)",
    borderWidth: 1, borderColor: "rgba(255,51,85,0.45)",
  },
  carouselThumb: {
    width: 46, height: 46, borderRadius: 14, marginBottom: 8,
  },
  carouselText: {
    color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 12,
    maxWidth: 80, textAlign: "center",
  },
  carouselTextActive: { color: "#fff" },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end",
  },
  sheet: {
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    backgroundColor: "rgba(18,18,18,0.98)",
  },
  sheetHandle: {
    width: 46, height: 5, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginBottom: 10,
  },
  sheetTitle: {
    color: "#fff", fontWeight: "900", fontSize: 16,
    marginBottom: 14, alignSelf: "center",
  },
  filtersGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center",
  },
  filterChip: {
    width: (width - 18 * 2 - 10 * 2) / 3,
    paddingVertical: 12, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  filterChipActive: {
    backgroundColor: "rgba(255,51,85,0.18)",
    borderColor: "rgba(255,51,85,0.45)",
  },
  filterThumb: {
    width: 46, height: 46, borderRadius: 14, marginBottom: 8,
  },
  filterChipText: {
    color: "rgba(255,255,255,0.82)", fontWeight: "800", fontSize: 12,
  },
  filterChipTextActive: { color: "#fff" },
  filterChipDescription: {
    color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2, textAlign: "center",
  },
  sheetDone: {
    marginTop: 16, height: 52, borderRadius: 16,
    backgroundColor: "rgba(255,51,85,0.95)", alignItems: "center", justifyContent: "center",
  },
  sheetDoneText: {
    color: "#fff", fontWeight: "900", letterSpacing: 0.4,
  },
  toolModalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end",
  },
  textToolContainer: {
    backgroundColor: "#000", paddingTop: 24, paddingHorizontal: 16, paddingBottom: 24,
  },
  textToolHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 16,
  },
  textToolHeaderTitle: {
    color: "#fff", fontSize: 16, fontWeight: "600",
  },
  textToolHeaderButton: {
    color: "#0095F6", fontSize: 14, fontWeight: "600",
  },
  textToolFormattingRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 12,
  },
  textToolFormattingLabel: {
    color: "#fff", fontSize: 18, fontWeight: "700",
  },
  textToolColorDotRow: {
    flexDirection: "row", gap: 8,
  },
  textToolColorDot: {
    width: 16, height: 16, borderRadius: 999, backgroundColor: "#fff",
  },
  textToolInput: {
    minHeight: 120, color: "#fff", fontSize: 18, textAlignVertical: "top",
  },
  bottomSheet: {
    backgroundColor: Colors.surface,
    paddingTop: 8, paddingBottom: 12, paddingHorizontal: 16,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  bottomSheetHandle: {
    alignSelf: "center", width: 40, height: 4, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)", marginBottom: 12,
  },
  bottomSheetHeaderRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 12,
  },
  bottomSheetTitle: {
    color: Colors.text, fontSize: 16, fontWeight: "700",
  },
  bottomSheetClose: {
    color: "#0095F6", fontSize: 14, fontWeight: "600",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
  },
  searchIcon: {
    fontSize: 14, marginRight: 6, color: "#888",
  },
  searchInput: {
    flex: 1, color: Colors.text, fontSize: 14,
  },
  stickersGrid: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "space-between", rowGap: 8, marginTop: 4,
  },
  stickerChip: {
    backgroundColor: "#fff", borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4,
  },
  stickerChipText: {
    fontSize: 12, fontWeight: "700", color: "#111",
  },
  musicList: { maxHeight: 260, marginTop: 4 },
  musicRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  musicThumb: {
    width: 40, height: 40, borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)", marginRight: 10,
  },
  musicInfo: { flex: 1 },
  musicTitle: {
    color: Colors.text, fontSize: 14, marginBottom: 2,
  },
  musicSubtitle: {
    color: "rgba(255,255,255,0.5)", fontSize: 12,
  },
  mentionList: { maxHeight: 260, marginTop: 4 },
  mentionRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
  },
  mentionAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)", marginRight: 10,
  },
  mentionName: { color: Colors.text, fontSize: 14 },
  placeholderContent: { marginTop: 16, paddingVertical: 16 },
  placeholderText: {
    color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 18,
  },
  beautifyPanel: { marginBottom: 10, paddingHorizontal: 4 },
  beautifySliderRow: {
    flexDirection: "row", alignItems: "center", marginBottom: 10,
  },
  beautifySliderTrack: {
    flex: 1, height: 6, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.20)", position: "relative",
  },
  beautifySliderFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    borderRadius: 999, backgroundColor: "#ff3366",
  },
  beautifySliderThumb: {
    position: "absolute", top: -9, width: 24, height: 24,
    borderRadius: 999, backgroundColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  beautifyValueLabel: {
    marginLeft: 12, color: "#fff", fontWeight: "700", fontSize: 14,
    minWidth: 30, textAlign: "right",
  },
  beautifyTabsRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 8,
  },
  beautifyTabsLeft: { flexDirection: "row", gap: 8 },
  beautifyTabButton: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)",
  },
  beautifyTabButtonActive: {
    backgroundColor: "rgba(255,51,85,0.22)",
  },
  beautifyTabText: {
    color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600",
  },
  beautifyTabTextActive: { color: "#fff" },
  beautifyResetText: {
    color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600",
  },
  beautifyOptionsRow: { paddingTop: 6, paddingBottom: 2 },
  beautifyOptionItem: { alignItems: "center", marginRight: 18 },
  beautifyOptionCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  beautifyOptionCircleActive: {
    backgroundColor: "rgba(255,51,85,0.28)",
  },
  beautifyOptionIcon: {
    color: "rgba(255,255,255,0.85)", fontSize: 18,
  },
  beautifyOptionIconActive: { color: "#fff" },
  beautifyOptionLabel: {
    color: "rgba(255,255,255,0.85)", fontSize: 12,
  },
  beautifyOptionLabelActive: {
    color: "#fff", fontWeight: "700",
  },
  aiApplyButton: {
    height: 32, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: "rgba(0,149,246,0.9)",
    alignItems: "center", justifyContent: "center", marginLeft: 6,
  },
  aiApplyButtonText: {
    color: "#fff", fontSize: 12, fontWeight: "700",
  },
  beautifyTabsRight: {
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  beautifyApplyText: {
    color: "#0095F6", fontSize: 13, fontWeight: "700",
  },

  // ─── NOVO: painel de ajustes avancados ───
  adjustPanelContainer: {
    marginBottom: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 16,
    padding: 12,
  },
  adjustPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  adjustPanelTitle: {
    color: "#fff", fontSize: 14, fontWeight: "800",
  },
  adjustRow: {
    flexDirection: "row", alignItems: "center", marginVertical: 5,
  },
  adjustIcon: {
    color: "#fff", fontSize: 16, width: 26, textAlign: "center",
  },
  adjustLabel: {
    color: "#fff", fontSize: 12, width: 80, fontWeight: "600",
  },
  adjustSliderWrap: {
    flex: 1, marginHorizontal: 6,
  },
  adjustSliderTrack: {
    height: 36, borderRadius: 999,
    backgroundColor: "transparent",
    position: "relative",
    justifyContent: "center",
  },
  adjustSliderBg: {
    position: "absolute", left: 0, right: 0, top: 15, height: 6,
    borderRadius: 999, backgroundColor: "rgba(255,255,255,0.20)",
  },
  adjustSliderFill: {
    position: "absolute", left: 0, top: 15, height: 6,
    borderRadius: 999, backgroundColor: "#ff3366",
  },
  adjustSliderThumb: {
    position: "absolute", top: 6,
    width: 24, height: 24, borderRadius: 999,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
    transform: [{ translateX: -12 }],
  },
  adjustValue: {
    color: "rgba(255,255,255,0.6)", fontSize: 11, width: 40, textAlign: "right",
  },
});
