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
      return [{ color: "#7CFC00", opacity: 0.09 }];
    case "chromatic":
      return [
        { color: "#FF2D55", opacity: 0.045 },
        { color: "#00E5FF", opacity: 0.045 },
      ];
    case "light_leaks":
      return [{ color: "#FFB84D", opacity: 0.14 }];
    case "vhs":
      return [{ color: "#C4A574", opacity: 0.13 }];
    case "prism":
      return [{ color: "#E8D5FF", opacity: 0.11 }];
    case "duotone":
      return [{ color: "#5B6CFF", opacity: 0.1 }];
    case "pixelate":
      return [{ color: "#666666", opacity: 0.07 }];
    case "halftone":
      return [{ color: "#1a1a1a", opacity: 0.09 }];
    case "rgb_split":
      return [
        { color: "#FF0000", opacity: 0.04 },
        { color: "#00FF88", opacity: 0.04 },
      ];
    case "mirror":
      return [{ color: "#FFFFFF", opacity: 0.06 }];
    case "kaleidoscope":
      return [{ color: "#FF88DD", opacity: 0.09 }];
    case "fisheye":
      return [{ color: "#88CCFF", opacity: 0.07 }];
    case "wave_distort":
      return [{ color: "#4488FF", opacity: 0.08 }];
    case "neon_edges":
      return [{ color: "#FF00E5", opacity: 0.1 }];
    default:
      return [];
  }
}

/**
 * When `isWeb && !isCapacitor`, normal browsers apply CSS filters on the camera wrapper — skip tints
 * to avoid double grading. Native and Capacitor need these layers for a visible live preview.
 */
export function getPreviewTintLayers(params: {
  isWeb: boolean;
  isCapacitor: boolean;
  liveFilter: LiveFilterDef;
  activeEffect: EffectId;
}): PreviewTintLayer[] {
  const { isWeb, isCapacitor, liveFilter, activeEffect } = params;
  if (isWeb && !isCapacitor) {
    return [];
  }

  const layers: PreviewTintLayer[] = [];
  const hasEffect = activeEffect !== "none";

  if (liveFilter.id !== "none" && liveFilter.accent && liveFilter.accent !== "transparent") {
    layers.push({
      color: liveFilter.accent,
      opacity: hasEffect ? 0.14 : 0.22,
    });
  }

  layers.push(...effectTintLayers(activeEffect));

  return layers;
}
