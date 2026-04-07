// Map capture-time CSS filter strings (Instagram-style live filters) to LUT/beautify boosts
// so native GL export (OffscreenLutRenderer) approximates the same look as web CSS.

import type { BeautifyParams } from "@/lib/gl/LutRenderer";

export type ShaderBoost = Partial<
  BeautifyParams & {
    sharpness?: number;
    temperature?: number;
    vignette?: number;
    grain?: number;
    fade?: number;
    highlights?: number;
    shadows?: number;
  }
>;

function num(m: RegExpMatchArray | null, def = 1): number {
  if (!m?.[1]) return def;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : def;
}

/** Parse css filter string like "contrast(1.2) saturate(1.35)" into shader-friendly boosts */
export function cssFilterStringToShaderBoost(css: string): ShaderBoost {
  if (!css || css === "none") return {};
  const s = css.toLowerCase();
  const out: ShaderBoost = {};

  const contrast = s.match(/contrast\(([\d.]+)\)/);
  if (contrast) out.contrast = num(contrast, 1);

  const saturate = s.match(/saturate\(([\d.]+)\)/);
  if (saturate) out.saturation = num(saturate, 1);

  const brightness = s.match(/brightness\(([\d.]+)\)/);
  if (brightness) {
    const b = num(brightness, 1);
    out.brightness = clamp((b - 1) * 0.35, -0.22, 0.22);
  }

  if (s.includes("grayscale(1)") || s.includes("grayscale(100%)")) {
    out.saturation = 0;
  }

  const sepia = s.match(/sepia\(([\d.]+)\)/);
  if (sepia) {
    const se = num(sepia, 0);
    out.temperature = clamp(se * 0.12, 0, 0.25);
    out.fade = clamp(se * 0.08, 0, 0.15);
  }

  const hue = s.match(/hue-rotate\((-?[\d.]+)deg\)/);
  if (hue) {
    const deg = parseFloat(hue[1]);
    if (Number.isFinite(deg)) out.temperature = clamp((out.temperature ?? 0) + deg / 180 * 0.2, -0.35, 0.35);
  }

  if (s.includes("blur(")) {
    out.sharpness = -0.06;
  }

  return out;
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

/** Merge base beautify params with capture-time CSS boost (multiplicative where appropriate). */
export function mergeBeautifyWithCssBoost<T extends ShaderBoost>(base: T, boost: ShaderBoost): T {
  const m = { ...base };
  if (boost.brightness != null) m.brightness = clamp((m.brightness ?? 0) + boost.brightness, -0.3, 0.3);
  if (boost.contrast != null) m.contrast = clamp((m.contrast ?? 1) * boost.contrast, 0.5, 2.2);
  if (boost.saturation != null) m.saturation = clamp((m.saturation ?? 1) * boost.saturation, 0, 2.2);
  if (boost.temperature != null) m.temperature = clamp((m.temperature ?? 0) + boost.temperature, -0.45, 0.45);
  if (boost.vignette != null) m.vignette = clamp((m.vignette ?? 0) + boost.vignette, 0, 0.85);
  if (boost.sharpness != null) m.sharpness = clamp((m.sharpness ?? 0) + boost.sharpness, -0.15, 0.42);
  if (boost.grain != null) m.grain = clamp((m.grain ?? 0) + boost.grain, 0, 0.35);
  if (boost.fade != null) m.fade = clamp((m.fade ?? 0) + boost.fade, 0, 0.4);
  if (boost.highlights != null) m.highlights = clamp((m.highlights ?? 0) + boost.highlights, -0.45, 0.45);
  if (boost.shadows != null) m.shadows = clamp((m.shadows ?? 0) + boost.shadows, -0.45, 0.45);
  return m;
}
