// lib/gl/filterLuts.ts

import type { FilterId } from "@/lib/mediaFilters/applyFilterAndExport";

export type LutSource = number | string | null;

// Para filtros sem LUT dedicada, usamos a mais proxima
// Quando voce criar as LUTs unicas, troque o require para o arquivo correto
export function getLutForFilter(filter: FilterId): LutSource {
  switch (filter) {
    case "warm":
      return require("@/assets/luts/warm.png");
    case "cool":
      return require("@/assets/luts/cool.png");
    case "pink":
      return require("@/assets/luts/pink.png");
    case "gold":
      return require("@/assets/luts/gold.png");
    case "night":
      return require("@/assets/luts/night.png");

    // LUTs novas — crie os arquivos .png e descomente
    // case "cinematic_gold":
    //   return require("@/assets/luts/cinematic_gold.png");
    // case "blue_teal":
    //   return require("@/assets/luts/blue_teal.png");
    // case "pastel_dream":
    //   return require("@/assets/luts/pastel_dream.png");
    // case "tokyo_night":
    //   return require("@/assets/luts/tokyo_night.png");
    // case "desert_warm":
    //   return require("@/assets/luts/desert_warm.png");
    // case "vintage_film":
    //   return require("@/assets/luts/vintage_film.png");
    // case "sakura":
    //   return require("@/assets/luts/sakura.png");
    // case "neon_glow":
    //   return require("@/assets/luts/neon_glow.png");
    // case "miami_vibes":
    //   return require("@/assets/luts/miami_vibes.png");
    // case "deep_contrast":
    //   return require("@/assets/luts/deep_contrast.png");
    // case "moody_forest":
    //   return require("@/assets/luts/moody_forest.png");
    // case "winter_lowsat":
    //   return require("@/assets/luts/winter_lowsat.png");
    // case "summer_pop":
    //   return require("@/assets/luts/summer_pop.png");
    // case "aqua_fresh":
    //   return require("@/assets/luts/aqua_fresh.png");
    // case "sepia_clean":
    //   return require("@/assets/luts/sepia_clean.png");
    // case "urban_grit":
    //   return require("@/assets/luts/urban_grit.png");
    // case "cream_tone":
    //   return require("@/assets/luts/cream_tone.png");

    case "none":
    default:
      return null;
  }
}

// CORRIGIDO: adicionados brightness, contrast, saturation, smoothing
// que sao acessados pelo capturePreview via fp.xxx
export type FilterShaderParams = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  smoothing?: number;
  sharpness?: number;
  temperature?: number;
  vignette?: number;
  grain?: number;
  fade?: number;
  highlights?: number;
  shadows?: number;
};

export function getFilterShaderParams(filter: string): FilterShaderParams {
  switch (filter) {
    case "face_enhance":
      return { brightness: 0.02, contrast: 1.05, saturation: 1.05, smoothing: 0.15, sharpness: 0.3, temperature: 0.15 };
    case "studio_glow":
      return { brightness: 0.03, contrast: 1.1, saturation: 1.02, sharpness: 0.5, vignette: 0.3, highlights: 0.2 };
    case "cartoon_soft":
      return { brightness: 0.02, saturation: 1.15, sharpness: 0.1, temperature: 0.1, highlights: 0.3 };
    case "bw_art":
      return { contrast: 1.2, saturation: 0.0, vignette: 0.6, sharpness: 0.4, grain: 0.2 };
    case "soft_skin_ig":
      return { brightness: 0.02, contrast: 1.03, saturation: 1.05, smoothing: 0.2, temperature: 0.12, highlights: 0.15 };
    case "clean_portrait":
      return { brightness: 0.01, contrast: 1.05, saturation: 1.0, sharpness: 0.4, highlights: 0.1 };
    case "cinematic_gold":
      return { brightness: 0.03, contrast: 1.12, saturation: 1.08, temperature: 0.25, vignette: 0.4, shadows: -0.1 };
    case "blue_teal_2026":
      return { contrast: 1.05, saturation: 0.95, temperature: -0.3, vignette: 0.2, sharpness: 0.2 };
    case "pastel_dream":
      return { brightness: 0.05, saturation: 0.9, fade: 0.3, highlights: 0.3, temperature: 0.05 };
    case "tokyo_night":
      return { brightness: -0.03, contrast: 1.1, saturation: 0.9, temperature: -0.2, vignette: 0.5, grain: 0.1, shadows: -0.15 };
    case "desert_warm":
      return { brightness: 0.04, contrast: 1.05, saturation: 1.1, temperature: 0.35, highlights: 0.2 };
    case "vintage_film":
      return { brightness: 0.02, contrast: 1.08, saturation: 0.85, grain: 0.35, fade: 0.2, vignette: 0.3, temperature: 0.1 };
    case "sakura":
      return { brightness: 0.03, saturation: 1.1, temperature: 0.08, highlights: 0.25, fade: 0.1 };
    case "neon_glow":
      return { contrast: 1.15, saturation: 1.25, sharpness: 0.3, vignette: 0.4, highlights: 0.3 };
    case "miami_vibes":
      return { brightness: 0.04, contrast: 1.08, saturation: 1.15, temperature: 0.2, highlights: 0.25, sharpness: 0.2 };
    case "deep_contrast":
      return { contrast: 1.3, saturation: 1.05, vignette: 0.5, shadows: -0.2, sharpness: 0.4 };
    case "moody_forest":
      return { brightness: -0.03, contrast: 1.1, saturation: 0.85, temperature: -0.1, vignette: 0.5, shadows: -0.2, grain: 0.1 };
    case "winter_lowsat":
      return { saturation: 0.7, temperature: -0.15, fade: 0.15 };
    case "summer_pop":
      return { brightness: 0.03, contrast: 1.1, saturation: 1.2, temperature: 0.15, sharpness: 0.3, highlights: 0.2 };
    case "aqua_fresh":
      return { saturation: 1.05, temperature: -0.2, highlights: 0.2, sharpness: 0.2 };
    case "pink_rose":
      return { brightness: 0.02, saturation: 1.1, temperature: 0.05, highlights: 0.2, fade: 0.1 };
    case "sepia_clean":
      return { contrast: 1.05, saturation: 0.6, temperature: 0.2, vignette: 0.3, fade: 0.15, grain: 0.1 };
    case "urban_grit":
      return { contrast: 1.2, saturation: 0.8, vignette: 0.5, grain: 0.25, sharpness: 0.4, shadows: -0.15 };
    case "cream_tone":
      return { brightness: 0.03, saturation: 0.9, temperature: 0.18, fade: 0.12, highlights: 0.15 };
    default:
      return {};
  }
}
