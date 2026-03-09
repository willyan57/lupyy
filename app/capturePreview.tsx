import Colors from "@/constants/Colors";
import LutRenderer from "@/lib/gl/LutRenderer";
import { OffscreenLutRenderer } from "@/lib/gl/OffscreenLutRenderer";
import { getLutForFilter } from "@/lib/gl/filterLuts";
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

type ShaderAdjustments = {
  intensity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  smoothing?: number;
  warmth?: number;
  tintColor?: [number, number, number];
  tintStrength?: number;
};

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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const getFilterShaderAdjustments = (id: FilterId): ShaderAdjustments => {
  switch (id) {
    case "face_enhance":
      return { intensity: 0.45, brightness: 0.03, contrast: 1.02, saturation: 1.02, smoothing: 0.18, warmth: 0.06 };
    case "studio_glow":
      return { intensity: 0.6, brightness: 0.04, contrast: 1.08, saturation: 1.04, smoothing: 0.08, warmth: 0.04 };
    case "cartoon_soft":
      return { intensity: 0.72, brightness: 0.05, contrast: 1.06, saturation: 1.16, tintColor: [1.0, 0.78, 0.9], tintStrength: 0.06 };
    case "bw_art":
      return { intensity: 0.92, contrast: 1.18, saturation: 0.0 };
    case "soft_skin_ig":
      return { intensity: 0.42, brightness: 0.03, contrast: 1.01, saturation: 1.0, smoothing: 0.24, warmth: 0.05 };
    case "clean_portrait":
      return { intensity: 0.35, brightness: 0.02, contrast: 1.03, saturation: 1.01, smoothing: 0.12 };
    case "cinematic_gold":
      return { intensity: 0.78, contrast: 1.12, saturation: 1.06, warmth: 0.1, tintColor: [1.0, 0.85, 0.68], tintStrength: 0.06 };
    case "blue_teal_2026":
      return { intensity: 0.76, contrast: 1.08, saturation: 1.06, tintColor: [0.62, 0.88, 1.0], tintStrength: 0.07 };
    case "pastel_dream":
      return { intensity: 0.58, brightness: 0.05, contrast: 0.96, saturation: 0.94, tintColor: [1.0, 0.88, 0.96], tintStrength: 0.08 };
    case "tokyo_night":
      return { intensity: 0.84, brightness: -0.02, contrast: 1.16, saturation: 1.1, tintColor: [0.65, 0.56, 1.0], tintStrength: 0.08 };
    case "desert_warm":
      return { intensity: 0.64, brightness: 0.04, contrast: 1.04, saturation: 1.02, warmth: 0.12 };
    case "vintage_film":
      return { intensity: 0.66, brightness: 0.01, contrast: 0.98, saturation: 0.9, warmth: 0.08 };
    case "sakura":
      return { intensity: 0.6, brightness: 0.04, contrast: 0.98, saturation: 1.02, tintColor: [1.0, 0.78, 0.88], tintStrength: 0.08 };
    case "neon_glow":
      return { intensity: 0.84, brightness: 0.02, contrast: 1.16, saturation: 1.18, tintColor: [0.82, 0.65, 1.0], tintStrength: 0.07 };
    case "miami_vibes":
      return { intensity: 0.7, brightness: 0.05, contrast: 1.08, saturation: 1.14, warmth: 0.08 };
    case "deep_contrast":
      return { intensity: 0.7, brightness: -0.02, contrast: 1.22, saturation: 1.0 };
    case "moody_forest":
      return { intensity: 0.76, brightness: -0.02, contrast: 1.1, saturation: 0.9, tintColor: [0.7, 0.9, 0.74], tintStrength: 0.05 };
    case "winter_lowsat":
      return { intensity: 0.46, brightness: 0.01, contrast: 1.02, saturation: 0.78, tintColor: [0.86, 0.92, 1.0], tintStrength: 0.04 };
    case "summer_pop":
      return { intensity: 0.62, brightness: 0.04, contrast: 1.08, saturation: 1.18, warmth: 0.06 };
    case "aqua_fresh":
      return { intensity: 0.7, brightness: 0.03, contrast: 1.02, saturation: 1.08, tintColor: [0.68, 0.94, 1.0], tintStrength: 0.06 };
    case "pink_rose":
      return { intensity: 0.6, brightness: 0.03, contrast: 1.0, saturation: 1.04, tintColor: [1.0, 0.8, 0.88], tintStrength: 0.07 };
    case "sepia_clean":
      return { intensity: 0.68, brightness: 0.02, contrast: 1.0, saturation: 0.88, warmth: 0.1 };
    case "urban_grit":
      return { intensity: 0.8, brightness: -0.03, contrast: 1.18, saturation: 0.82 };
    case "cream_tone":
      return { intensity: 0.52, brightness: 0.04, contrast: 0.98, saturation: 0.94, warmth: 0.1 };
    case "none":
    default:
      return { intensity: 0.0, brightness: 0.0, contrast: 1.0, saturation: 1.0, smoothing: 0.0, warmth: 0.0, tintStrength: 0.0 };
  }
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
    description: "Foto original, sem alteração. Escolha um efeito quando quiser.",
  },
  {
    id: "face_enhance",
    name: "Realçar rosto",
    description:
      "Suaviza pele, reduz olheiras e deixa o rosto pronto para selfie natural.",
    overlay: "rgba(255,214,196,0.20)",
    glow: true,
  },
  {
    id: "studio_glow",
    name: "Foto profissional",
    description:
      "Luz de estúdio, contraste moderado e nitidez para parecer câmera profissional.",
    overlay: "rgba(255,255,255,0.14)",
    vignette: true,
    glow: true,
  },
  {
    id: "cartoon_soft",
    name: "Cartoon leve",
    description:
      "Cores mais vivas e aspecto de ilustração suave, mantendo sua expressão real.",
    overlay: "rgba(255,120,180,0.16)",
    glow: true,
  },
  {
    id: "bw_art",
    name: "P&B artístico",
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
      "Look limpo, nítido e equilibrado para retratos e fotos de perfil.",
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
      "Tudo mais claro, suave e com vibe estética pastel de Pinterest.",
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
      "Tons quentes de pôr do sol, ideal para praia, campo e fotos douradas.",
    overlay: "rgba(255,190,120,0.24)",
  },
  {
    id: "vintage_film",
    name: "Vintage Film",
    description:
      "Granulado visual suave com tons envelhecidos, lembrando filmes analógicos.",
    overlay: "rgba(240,210,180,0.24)",
    vignette: true,
  },
  {
    id: "sakura",
    name: "Sakura Glow",
    description:
      "Toque rosado com luz suave, perfeito para selfies românticas.",
    overlay: "rgba(255,170,210,0.24)",
    glow: true,
  },
  {
    id: "neon_glow",
    name: "Neon Glow",
    description:
      "Realça luzes coloridas e deixa tudo com cara de balada futurista.",
    overlay: "rgba(170,120,255,0.26)",
    vignette: true,
  },
  {
    id: "miami_vibes",
    name: "Miami Vibes",
    description:
      "Cores vibrantes, céu azul forte e pele dourada no estilo verão Miami.",
    overlay: "rgba(255,210,150,0.26)",
    glow: true,
  },
  {
    id: "deep_contrast",
    name: "Deep Contrast",
    description:
      "Preto mais profundo, luz mais marcada e sensação de foto de revista.",
    overlay: "rgba(10,10,10,0.30)",
    vignette: true,
  },
  {
    id: "moody_forest",
    name: "Moody Forest",
    description:
      "Verdes fechados e atmosfera mais dramática, ótimo para natureza.",
    overlay: "rgba(40,80,40,0.32)",
    vignette: true,
  },
  {
    id: "winter_lowsat",
    name: "Winter LowSat",
    description:
      "Saturação reduzida, look frio e elegante para paisagens e cidade.",
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
      "Águas mais turquesa e visual refrescante, perfeito para piscina e mar.",
    overlay: "rgba(120,210,255,0.26)",
  },
  {
    id: "pink_rose",
    name: "Pink Rose",
    description:
      "Rosa suave com toque romântico, ótimo para selfies e casais.",
    overlay: "rgba(255,170,200,0.26)",
    glow: true,
  },
  {
    id: "sepia_clean",
    name: "Sepia Clean",
    description:
      "Marrom claro, limpo e elegante, trazendo clima retrô moderno.",
    overlay: "rgba(210,170,130,0.28)",
    vignette: true,
  },
  {
    id: "urban_grit",
    name: "Urban Grit",
    description:
      "Clima de rua, contraste forte e leve desaturação para fotos urbanas.",
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
  const [bakeJob, setBakeJob] = useState<{ uri: string; filterId: ExportFilterId; adjustments: ShaderAdjustments; resolve: (u: string) => void } | null>(null);
  const bakeImageWithLut = useCallback((uri: string, filterId: ExportFilterId, adjustments: ShaderAdjustments) => {
    return new Promise<string>((resolve) => {
      setBakeJob({ uri, filterId, adjustments, resolve });
    });
  }, []);


  const activeFilter = useMemo(
    () => FILTERS.find((f) => f.id === filter) ?? FILTERS[0],
    [filter]
  );
  const filterIndex = useMemo(
    () => Math.max(0, FILTERS.findIndex((f) => f.id === filter)),
    [filter]
  );

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

  const shaderAdjustments = useMemo(() => {
    const base = getFilterShaderAdjustments(filter);
    let brightness = base.brightness ?? 0;
    let contrast = base.contrast ?? 1;
    let saturation = base.saturation ?? 1;
    let smoothing = base.smoothing ?? 0;
    let warmth = base.warmth ?? 0;
    let tintColor: [number, number, number] = base.tintColor ?? [1, 1, 1];
    let tintStrength = base.tintStrength ?? 0;

    if (quickAdjustment === "bright") {
      brightness += 0.08;
      contrast *= 1.04;
      saturation *= 1.02;
    } else if (quickAdjustment === "dark") {
      brightness -= 0.08;
    } else if (quickAdjustment === "punch") {
      contrast *= 1.16;
      saturation *= 1.14;
    }

    const normalize = (value: number) => (value - 60) / 40;
    const smooth = clamp01((beautifyValues["Suavizar"] ?? 60) / 100);
    const faceContrast = normalize(beautifyValues["Contraste"] ?? 60);
    const teeth = clamp01((beautifyValues["Dente"] ?? 60) / 100);
    const baseValue = clamp01((beautifyValues["Base"] ?? 60) / 100);
    const lipstick = clamp01((beautifyValues["Batom"] ?? 60) / 100);
    const shadow = clamp01((beautifyValues["Sombra"] ?? 60) / 100);
    const blush = clamp01((beautifyValues["Blush"] ?? 60) / 100);
    const contour = clamp01((beautifyValues["Contorno"] ?? 60) / 100);

    smoothing = clamp01(smoothing + smooth * 0.35 + baseValue * 0.08);
    brightness += teeth * 0.04 + baseValue * 0.02 + blush * 0.01;
    contrast *= 1 + faceContrast * 0.18 + contour * 0.1 + shadow * 0.06;
    saturation *= 1 + lipstick * 0.08 + blush * 0.06 - shadow * 0.03;
    warmth += baseValue * 0.04 + contour * 0.02;

    const tintMix = Math.max(lipstick, blush, shadow * 0.8);
    if (tintMix > 0) {
      tintStrength = Math.max(tintStrength, tintMix * 0.12);
      if (lipstick >= blush && lipstick >= shadow) {
        tintColor = [1.0, 0.74, 0.82];
      } else if (shadow >= blush) {
        tintColor = [0.86, 0.82, 1.0];
      } else {
        tintColor = [1.0, 0.82, 0.88];
      }
    }

    return {
      intensity: base.intensity ?? 0,
      brightness,
      contrast,
      saturation,
      smoothing,
      warmth,
      tintColor,
      tintStrength,
    } satisfies ShaderAdjustments;
  }, [filter, quickAdjustment, beautifyValues]);

  const exportEffects = useMemo(() => {
    return {
      filterId: mapPreviewFilterToExport(filter),
      quickAdjustment,
      shaderAdjustments,
      beautify: {
        tab: beautifyTab,
        option: beautifyOption,
        values: beautifyValues,
      },
    };
  }, [filter, quickAdjustment, shaderAdjustments, beautifyTab, beautifyOption, beautifyValues]);

  const shouldBakeOnExport = useMemo(() => {
    if (mediaType !== "image" && mediaType !== "video") return false;
    if (aiTempUri) return true;
    if (filter !== "none") return true;
    if (quickAdjustment !== "none") return true;
    if ((beautifyValues["Suavizar"] ?? 60) !== 60) return true;
    return false;
  }, [mediaType, aiTempUri, filter, quickAdjustment, beautifyValues]);

  const maybeBakeMedia = async (inputUri: string) => {
    if (!shouldBakeOnExport) return inputUri;

    try {
      if (mediaType === "image") {
        const exportFilterId = (exportEffects?.filterId as ExportFilterId) || "none";
        if (exportFilterId !== "none") {
          const baked = await bakeImageWithLut(inputUri, exportFilterId, shaderAdjustments);
          if (baked) inputUri = baked;
        }
      }

      const mod: any = FilterExport as any;
      const fn = mod.applyFilterAndExport ?? mod.default;
      if (typeof fn !== "function") return inputUri;

      const out = await fn({
        uri: inputUri,
        mediaType,
        effects: exportEffects,
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
        console.log("Erro ao enviar story da câmera:", err);
        setSending(false);
        Alert.alert(
          "Erro ao publicar story",
          "Não foi possível publicar seu story. Tente novamente."
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
      console.log("Erro ao enviar mídia da câmera:", err);
      setSending(false);
      Alert.alert(
        "Erro ao publicar",
        "Não foi possível publicar o conteúdo. Tente novamente."
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
        const msg = (error as any)?.message || (data as any)?.error || "Não foi possível aplicar IA. Tente novamente.";
        Alert.alert("Erro", String(msg));
        return;
      }

      const outputImageUrl = (data as any).outputImageUrl as string | undefined;

      if (!outputImageUrl) {
        Alert.alert("Erro", "IA não retornou imagem.");
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
    mode === "story" ? "Publicar Story" : mode === "reel" ? "Avançar" : "Avançar";

  const primaryAudienceLabel =
    mode === "story" ? "Seus stories" : mode === "reel" ? "Reels" : "Feed";
  const secondaryAudienceLabel = "Amigos próximos";

  const onCarouselMomentumEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / ITEM_W);
    const safe = Math.max(0, Math.min(FILTERS.length - 1, idx));
    syncScrollRef.current = true;
    setFilter(FILTERS[safe].id);
    setTimeout(() => (syncScrollRef.current = false), 0);
  };

  const renderFilterItem = ({ item }: { item: any }) => {
    const active = item.id === filter;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setFilter(item.id)}
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


  const baseTools = [
    { key: "text", label: "Texto", icon: "Aa" },
    { key: "stickers", label: "Figurinhas", icon: "☻" },
    { key: "music", label: "Músicas", icon: "♫" },
    { key: "beautify", label: "Embelezar", icon: "✧" },
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

  const beautifyValue = beautifyValues[beautifyOption] ?? 60;



  const beautifySliderAnim = useRef(new Animated.Value(beautifyValue)).current;
  const beautifyRafRef = useRef<number | null>(null);
  const updateBeautifyOptionValue = useCallback(
    (value: number) => {
      const safeValue = Math.max(0, Math.min(100, Math.round(value)));
      beautifySliderAnim.setValue(safeValue);
      if (beautifyRafRef.current != null) {
        cancelAnimationFrame(beautifyRafRef.current);
      }
      beautifyRafRef.current = requestAnimationFrame(() => {
        beautifyRafRef.current = null;
        setBeautifyValues((prev) =>
          prev[beautifyOption] === safeValue
            ? prev
            : {
                ...prev,
                [beautifyOption]: safeValue,
              }
        );
      });
    },
    [beautifyOption, beautifySliderAnim]
  );

  useEffect(() => {
    beautifySliderAnim.setValue(beautifyValue);
  }, [beautifyOption, beautifyValue, beautifySliderAnim]);

  useEffect(() => {
    return () => {
      if (beautifyRafRef.current != null) {
        cancelAnimationFrame(beautifyRafRef.current);
      }
    };
  }, []);

  const handleBeautifyValueFromGesture = useCallback((pageX: number) => {
    if (!beautifyTrackWidth || typeof pageX !== "number") return;
    const relativeX = pageX - beautifyTrackX;
    const ratio = relativeX / beautifyTrackWidth;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    updateBeautifyOptionValue(clampedRatio * 100);
  }, [beautifyTrackWidth, beautifyTrackX, updateBeautifyOptionValue]);

  const beautifyPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => handleBeautifyValueFromGesture(evt.nativeEvent.pageX),
        onPanResponderMove: (evt) => handleBeautifyValueFromGesture(evt.nativeEvent.pageX),
      }),
    [handleBeautifyValueFromGesture]
  );

  const tools = toolsCollapsed
    ? [
        ...baseTools.slice(0, 4),
        { key: "more", label: "Mais", icon: "⋮" },
      ]
    : [
        ...baseTools,
        { key: "more", label: "Menos", icon: "⋮" },
      ];

  const handleToolPress = (key: string) => {
    if (key === "beautify") {
      setShowBeautifyPanel((prev) => !prev);
      setShowInlineFilters(false);
      setEffectsOpen(false);
      setActiveToolSheet(null);
      setToolsCollapsed(true);
      return;
    }

    if (key === "effects") {
      setEffectsOpen((prev) => !prev);
      setShowBeautifyPanel(false);
      setActiveToolSheet(null);
      setShowInlineFilters(false);
      setToolsCollapsed(true);
      return;
    }

    if (key === "more") {
      setToolsCollapsed((prev) => !prev);
      setEffectsOpen(false);
      setShowBeautifyPanel(false);
      setShowInlineFilters(false);
      setActiveToolSheet(null);
      return;
    }

    setEffectsOpen(false);
    setShowBeautifyPanel(false);
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

  return (
    <View style={styles.container}>
      {bakeJob ? (
        <OffscreenLutRenderer
          sourceUri={bakeJob.uri}
          filter={bakeJob.filterId}
          adjustments={bakeJob.adjustments}
          onFinish={(u) => {
            const out = u || bakeJob.uri;
            const r = bakeJob.resolve;
            setBakeJob(null);
            r(out);
          }}
        />
      ) : null}
      {mediaType === "image" ? (
        filter !== "none" || quickAdjustment !== "none" || (beautifyValues[beautifyOption] ?? 60) !== 60 || Object.values(beautifyValues).some((value) => value !== 60) ? (
          <LutRenderer
            key={`${effectiveUri}::${nonce}::${filter}::${JSON.stringify(shaderAdjustments)}`}
            sourceUri={effectiveUri}
            lut={getLutForFilter(mapPreviewFilterToExport(filter))}
            intensity={shaderAdjustments.intensity ?? 1}
            brightness={shaderAdjustments.brightness ?? 0}
            contrast={shaderAdjustments.contrast ?? 1}
            saturation={shaderAdjustments.saturation ?? 1}
            smoothing={shaderAdjustments.smoothing ?? 0}
            warmth={shaderAdjustments.warmth ?? 0}
            tintColor={shaderAdjustments.tintColor}
            tintStrength={shaderAdjustments.tintStrength ?? 0}
            style={styles.preview}
            onReady={() => setMediaLoaded(true)}
          />
        ) : (
          <Image
            key={`${effectiveUri}::${nonce}::${filter}`}
            source={{ uri: effectiveUri }}
            style={styles.preview}
            resizeMode={isWeb ? "contain" : "cover"}
            onLoadEnd={() => setMediaLoaded(true)}
          />
        )
      ) : (
        <Video
          key={`${effectiveUri}::${nonce}`}
          source={{ uri: effectiveUri }}
          style={styles.preview}
          resizeMode={isWeb ? ResizeMode.CONTAIN : ResizeMode.COVER}
          shouldPlay
          isLooping
          onLoad={() => setMediaLoaded(true)}
        />
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.filterLabel,
          { opacity: labelOpacity, transform: [{ scale: labelScale }] },
        ]}
      >
        <Text style={styles.filterLabelText}>{activeFilter.name}</Text>
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

      <View style={styles.bottomPanel}>
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
                {...beautifyPanResponder.panHandlers}
              >
                <Animated.View
                  style={[
                    styles.beautifySliderFill,
                    {
                      width: beautifySliderAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ["0%", "100%"],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.beautifySliderThumb,
                    {
                      left: beautifySliderAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ["0%", "100%"],
                      }),
                      transform: [{ translateX: -10 }],
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
                    updateBeautifyOptionValue(60);
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
                {activeToolSheet === "music" && "Músicas"}
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
                  "LOCALIZAÇÃO",
                  "MENÇÃO",
                  "MÚSICA",
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
                  "Dias De Luta, Dias De Glória – Charlie Brown Jr.",
                  "Disciplina Blindada – Jamal Natuê",
                  "De uns Dias pra Cá – Mc Luuky",
                  "Um Centímetro – Toque Dez",
                  "Onde Nós Chegou – Toque Dez",
                ].map((track) => (
                  <View key={track} style={styles.musicRow}>
                    <View style={styles.musicThumb} />
                    <View style={styles.musicInfo}>
                      <Text style={styles.musicTitle}>{track}</Text>
                      <Text style={styles.musicSubtitle}>Pré-visualização</Text>
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
                  Em breve aqui vão os recursos completos de{" "}
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
                    onPress={() => setFilter(f.id)}
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blurWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  vignetteWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  vTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  vBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    transform: [{ rotate: "180deg" }],
  },
  vLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 140,
    transform: [{ rotate: "90deg" }],
  },
  vRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 140,
    transform: [{ rotate: "-90deg" }],
  },
  glowWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  glowTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  adjustmentOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  beautifySoftWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  beautifyLightOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    height: height * 0.42,
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
  topIcon: { color: "#fff", fontSize: 26, fontWeight: "700" },
  topBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  topBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  topRight: { width: 40, alignItems: "flex-end" },
  topRightIcon: { color: "#fff", fontSize: 22 },
  rightTools: {
    position: "absolute",
    right: 12,
    top: height * 0.16,
  },
  rightToolButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 10,
  },
  rightToolCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  rightToolIcon: { color: "#fff", fontSize: 18, fontWeight: "800" },
  rightToolLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  quickAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  quickAdjustChip: {
    flex: 1,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  quickAdjustChipActive: {
    backgroundColor: "rgba(255,51,85,0.2)",
    borderColor: "rgba(255,51,85,0.6)",
  },
  quickAdjustText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "700",
  },
  quickAdjustTextActive: {
    color: "#fff",
  },
  legendRow: {
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  legendInput: {
    color: "#fff",
    fontSize: 14,
    maxHeight: 70,
  },
  audienceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  audienceChip: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  audienceChipText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 13,
  },
  audienceChipAlt: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  audienceChipAltText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  aiRevertButton: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  aiRevertButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: "rgba(0,149,246,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendIcon: { color: "#fff", fontSize: 20, fontWeight: "900" },
  carouselWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 110,
    height: 86,
  },
  carouselItem: {
    width: ITEM_W,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  carouselItemActive: {
    backgroundColor: "rgba(255,51,85,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,51,85,0.45)",
  },
  carouselThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginBottom: 8,
  },
  carouselText: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "900",
    fontSize: 12,
    maxWidth: 80,
    textAlign: "center",
  },
  carouselTextActive: { color: "#fff" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "rgba(18,18,18,0.98)",
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 10,
  },
  sheetTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 14,
    alignSelf: "center",
  },
  filtersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  filterChip: {
    width: (width - 18 * 2 - 10 * 2) / 3,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  filterChipActive: {
    backgroundColor: "rgba(255,51,85,0.18)",
    borderColor: "rgba(255,51,85,0.45)",
  },
  filterThumb: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginBottom: 8,
  },
  filterChipText: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "800",
    fontSize: 12,
  },
  filterChipTextActive: { color: "#fff" },
  filterChipDescription: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  sheetDone: {
    marginTop: 16,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,51,85,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDoneText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  toolModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  textToolContainer: {
    backgroundColor: "#000",
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  textToolHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  textToolHeaderTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  textToolHeaderButton: {
    color: "#0095F6",
    fontSize: 14,
    fontWeight: "600",
  },
  textToolFormattingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  textToolFormattingLabel: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  textToolColorDotRow: {
    flexDirection: "row",
    gap: 8,
  },
  textToolColorDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  textToolInput: {
    minHeight: 120,
    color: "#fff",
    fontSize: 18,
    textAlignVertical: "top",
  },
  bottomSheet: {
    backgroundColor: Colors.surface,
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomSheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginBottom: 12,
  },
  bottomSheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  bottomSheetTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  bottomSheetClose: {
    color: "#0095F6",
    fontSize: 14,
    fontWeight: "600",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
    color: "#888",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  stickersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginTop: 4,
  },
  stickerChip: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  stickerChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111",
  },
  musicList: {
    maxHeight: 260,
    marginTop: 4,
  },
  musicRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  musicThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 10,
  },
  musicInfo: {
    flex: 1,
  },
  musicTitle: {
    color: Colors.text,
    fontSize: 14,
    marginBottom: 2,
  },
  musicSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  mentionList: {
    maxHeight: 260,
    marginTop: 4,
  },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  mentionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginRight: 10,
  },
  mentionName: {
    color: Colors.text,
    fontSize: 14,
  },
  placeholderContent: {
    marginTop: 16,
    paddingVertical: 16,
  },
  placeholderText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    lineHeight: 18,
  },
  beautifyPanel: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  beautifySliderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  beautifySliderTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
    position: "relative",
  },
  beautifySliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#ff3366",
  },
  beautifySliderThumb: {
    position: "absolute",
    top: -8,
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  beautifyValueLabel: {
    marginLeft: 10,
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  beautifyTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  beautifyTabsLeft: {
    flexDirection: "row",
    gap: 8,
  },
  beautifyTabButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  beautifyTabButtonActive: {
    backgroundColor: "rgba(255,51,85,0.22)",
  },
  beautifyTabText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "600",
  },
  beautifyTabTextActive: {
    color: "#fff",
  },
  beautifyResetText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  beautifyOptionsRow: {
    paddingTop: 6,
    paddingBottom: 2,
  },
  beautifyOptionItem: {
    alignItems: "center",
    marginRight: 18,
  },
  beautifyOptionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  beautifyOptionCircleActive: {
    backgroundColor: "rgba(255,51,85,0.28)",
  },
  beautifyOptionIcon: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 18,
  },
  beautifyOptionIconActive: {
    color: "#fff",
  },
  beautifyOptionLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
  },
  beautifyOptionLabelActive: {
    color: "#fff",
    fontWeight: "700",
  },
  aiApplyButton: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(0,149,246,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  aiApplyButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  beautifyTabsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  beautifyApplyText: {
    color: "#0095F6",
    fontSize: 13,
    fontWeight: "700",
  },
});