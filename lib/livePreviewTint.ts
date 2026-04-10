// Live camera preview tints for native Android/iOS and Capacitor WebView.
// CSS `filter` on wrappers does not affect the native camera surface or hardware-video in WebView,
// so we stack semi-transparent Views and LinearGradients as a visible approximation.

import type { LiveFilterDef } from "@/components/LiveFilterCarousel";
import type { EffectId } from "@/lib/gl/webglEffects";

export type PreviewTintGradient = {
  colors: string[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  locations?: number[];
};

export type PreviewTintLayer = {
  opacity: number;
  /** Solid overlay (RN View) */
  color?: string;
  /** Light leaks, duotone, chromatic separation, etc. */
  gradient?: PreviewTintGradient;
};

function effectTintLayers(id: EffectId): PreviewTintLayer[] {
  switch (id) {
    case "none":
      return [];
    case "glitch":
      return [
        {
          opacity: 0.11,
          gradient: {
            colors: ["rgba(120,255,80,0.55)", "rgba(255,40,200,0.28)", "rgba(0,0,0,0)"],
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
            locations: [0, 0.42, 1],
          },
        },
      ];
    case "chromatic":
      return [
        {
          opacity: 0.1,
          gradient: {
            colors: [
              "rgba(255,55,95,0.5)",
              "rgba(255,55,95,0.08)",
              "rgba(0,235,255,0.5)",
              "rgba(0,235,255,0.08)",
            ],
            start: { x: 0, y: 0.5 },
            end: { x: 1, y: 0.5 },
            locations: [0, 0.46, 0.54, 1],
          },
        },
      ];
    case "light_leaks":
      return [
        {
          opacity: 0.16,
          gradient: {
            colors: ["rgba(255,215,130,0.75)", "rgba(255,150,80,0.28)", "rgba(0,0,0,0)"],
            start: { x: 0, y: 0 },
            end: { x: 0.62, y: 0.58 },
            locations: [0, 0.38, 1],
          },
        },
        {
          opacity: 0.12,
          gradient: {
            colors: ["rgba(255,110,195,0.6)", "rgba(255,90,130,0)", "rgba(0,0,0,0)"],
            start: { x: 1, y: 1 },
            end: { x: 0.32, y: 0.42 },
          },
        },
      ];
    case "vhs":
      return [
        {
          opacity: 0.13,
          gradient: {
            colors: ["rgba(200,175,130,0.45)", "rgba(90,75,55,0.35)", "rgba(25,22,18,0.5)"],
            start: { x: 0.5, y: 0 },
            end: { x: 0.5, y: 1 },
            locations: [0, 0.5, 1],
          },
        },
        {
          opacity: 0.06,
          color: "rgba(0,0,0,0.4)",
        },
      ];
    case "prism":
      return [
        {
          opacity: 0.12,
          gradient: {
            colors: ["rgba(255,200,255,0.5)", "rgba(180,220,255,0.35)", "rgba(255,255,200,0.25)", "rgba(0,0,0,0)"],
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
            locations: [0, 0.35, 0.7, 1],
          },
        },
      ];
    case "duotone":
      return [
        {
          opacity: 0.14,
          gradient: {
            colors: ["rgba(40,55,200,0.55)", "rgba(255,120,80,0.4)", "rgba(20,25,60,0.45)"],
            start: { x: 0, y: 1 },
            end: { x: 1, y: 0 },
            locations: [0, 0.5, 1],
          },
        },
      ];
    case "pixelate":
      return [
        { opacity: 0.08, color: "#888888" },
        {
          opacity: 0.05,
          gradient: {
            colors: ["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", "rgba(0,0,0,0.25)"],
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
          },
        },
      ];
    case "halftone":
      return [
        {
          opacity: 0.12,
          gradient: {
            colors: ["rgba(30,30,30,0.65)", "rgba(80,80,80,0.2)", "rgba(200,200,200,0.15)"],
            start: { x: 0.5, y: 0 },
            end: { x: 0.5, y: 1 },
            locations: [0, 0.55, 1],
          },
        },
      ];
    case "rgb_split":
      return [
        {
          opacity: 0.1,
          gradient: {
            colors: ["rgba(255,40,40,0.45)", "rgba(255,40,40,0)", "rgba(0,0,0,0)"],
            start: { x: 0, y: 0.5 },
            end: { x: 0.55, y: 0.5 },
          },
        },
        {
          opacity: 0.1,
          gradient: {
            colors: ["rgba(0,255,160,0.45)", "rgba(0,255,160,0)", "rgba(0,0,0,0)"],
            start: { x: 1, y: 0.5 },
            end: { x: 0.45, y: 0.5 },
          },
        },
      ];
    case "mirror":
      return [
        {
          opacity: 0.1,
          gradient: {
            colors: ["rgba(255,255,255,0.35)", "rgba(200,220,255,0.12)", "rgba(0,0,0,0)"],
            start: { x: 0.5, y: 0 },
            end: { x: 0.5, y: 1 },
            locations: [0, 0.4, 1],
          },
        },
      ];
    case "kaleidoscope":
      return [
        {
          opacity: 0.12,
          gradient: {
            colors: ["rgba(255,100,200,0.45)", "rgba(255,220,100,0.35)", "rgba(100,200,255,0.35)", "rgba(0,0,0,0)"],
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
            locations: [0, 0.33, 0.66, 1],
          },
        },
      ];
    case "fisheye":
      return [
        {
          opacity: 0.14,
          gradient: {
            colors: ["rgba(0,0,0,0)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)"],
            start: { x: 0.5, y: 0.5 },
            end: { x: 1, y: 1 },
            locations: [0, 0.55, 1],
          },
        },
        {
          opacity: 0.08,
          gradient: {
            colors: ["rgba(120,200,255,0.25)", "rgba(0,0,0,0)"],
            start: { x: 0.5, y: 0.5 },
            end: { x: 0, y: 0 },
          },
        },
      ];
    case "wave_distort":
      return [
        {
          opacity: 0.11,
          gradient: {
            colors: ["rgba(60,140,255,0.4)", "rgba(100,200,255,0.2)", "rgba(40,80,200,0.35)", "rgba(0,0,0,0)"],
            start: { x: 0, y: 0.3 },
            end: { x: 1, y: 0.7 },
            locations: [0, 0.4, 0.75, 1],
          },
        },
      ];
    case "neon_edges":
      return [
        {
          opacity: 0.11,
          gradient: {
            colors: ["rgba(255,0,230,0.5)", "rgba(255,0,230,0)", "rgba(0,255,200,0.35)", "rgba(0,255,200,0)"],
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
            locations: [0, 0.25, 0.65, 1],
          },
        },
      ];
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
