// Live camera preview tints for native Android/iOS and Capacitor WebView.
// CSS `filter` on wrappers does not affect the native camera surface or hardware-video in WebView,
// so we stack semi-transparent Views using filter/effect accent colors as a visible approximation.

import type { LiveFilterDef } from "@/components/LiveFilterCarousel";
import type { EffectId } from "@/lib/gl/webglEffects";

export type PreviewTintLayer = { color: string; opacity: number };

function effectTintLayers(id: EffectId): PreviewTintLayer[] {
  switch (id) {
    case "none":
      return [];
    case "glitch":
      return [{ color: "#7CFC00", opacity: 0.035 }];
    case "chromatic":
      return [
        { color: "#FF2D55", opacity: 0.02 },
        { color: "#00E5FF", opacity: 0.02 },
      ];
    case "light_leaks":
      return [{ color: "#FFB84D", opacity: 0.05 }];
    case "vhs":
      return [{ color: "#C4A574", opacity: 0.045 }];
    case "prism":
      return [{ color: "#E8D5FF", opacity: 0.04 }];
    case "duotone":
      return [{ color: "#5B6CFF", opacity: 0.035 }];
    case "pixelate":
      return [{ color: "#666666", opacity: 0.03 }];
    case "halftone":
      return [{ color: "#1a1a1a", opacity: 0.035 }];
    case "rgb_split":
      return [
        { color: "#FF0000", opacity: 0.02 },
        { color: "#00FF88", opacity: 0.02 },
      ];
    case "mirror":
      return [{ color: "#FFFFFF", opacity: 0.025 }];
    case "kaleidoscope":
      return [{ color: "#FF88DD", opacity: 0.035 }];
    case "fisheye":
      return [{ color: "#88CCFF", opacity: 0.03 }];
    case "wave_distort":
      return [{ color: "#4488FF", opacity: 0.03 }];
    case "neon_edges":
      return [{ color: "#FF00E5", opacity: 0.04 }];
    default:
      return [];
  }
}

/**
 * When `isWeb && !isCapacitor`, normal browsers apply CSS filters on the camera wrapper — skip tints
 * to avoid double grading. Native and Capacitor need these layers for a visible live preview.
 */
function scaleLayers(layers: PreviewTintLayer[], factor: number, maxOpacity: number): PreviewTintLayer[] {
  return layers.map((l) => ({
    ...l,
    opacity: Math.min(maxOpacity, l.opacity * factor),
  }));
}

export function getPreviewTintLayers(params: {
  isWeb: boolean;
  isCapacitor: boolean;
  /** True React Native on Android — live preview uses tint stacks (no CSS on camera surface). */
  isAndroidNative?: boolean;
  liveFilter: LiveFilterDef;
  activeEffect: EffectId;
}): PreviewTintLayer[] {
  const { isWeb, isCapacitor, isAndroidNative, liveFilter, activeEffect } = params;
  if (isWeb && !isCapacitor) {
    return [];
  }

  const layers: PreviewTintLayer[] = [];
  const hasEffect = activeEffect !== "none";

  if (liveFilter.id !== "none" && liveFilter.accent && liveFilter.accent !== "transparent") {
    layers.push({
      color: liveFilter.accent,
      // Keep native preview closer to web: subtle grade cue instead of a color mask.
      opacity: hasEffect ? 0.06 : 0.1,
    });
  }

  layers.push(...effectTintLayers(activeEffect));

  // APK (RN Android): previous opacities were too subtle vs mobile web CSS grading.
  if (isAndroidNative) {
    return scaleLayers(layers, 2.35, 0.34);
  }
  // Capacitor WebView: não aplicamos CSS no <video> (tela preta em vários devices) — reforça o gradiente por cima.
  if (isCapacitor) {
    return scaleLayers(layers, 2.15, 0.33);
  }
  return layers;
}
