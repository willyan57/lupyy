// lib/ar/makeupTextures.ts — Procedural makeup texture generation
// Generates high-quality makeup textures as Canvas-rendered images (no external files needed).
// Each texture is a 256x256 RGBA image designed for UV-mapped face mesh rendering.

export type MakeupPreset = {
  id: string;
  name: string;
  icon: string;
  lipstick: LipstickConfig;
  blush: BlushConfig;
  eyeshadow: EyeshadowConfig;
  contour: ContourConfig;
};

export type LipstickConfig = {
  color: string;        // Base color (hex)
  glossiness: number;   // 0-1 — amount of specular highlight
  opacity: number;      // 0-1
  matte: boolean;       // Matte vs glossy finish
};

export type BlushConfig = {
  color: string;
  intensity: number;    // 0-1
  spread: number;       // 0-1 — how wide the blush spreads
};

export type EyeshadowConfig = {
  colors: string[];     // Gradient colors (inner to outer)
  shimmer: number;      // 0-1
  intensity: number;
  style: "smoky" | "natural" | "glam" | "cut_crease";
};

export type ContourConfig = {
  shadowColor: string;
  highlightColor: string;
  intensity: number;
};

// ── Preset library ──

export const MAKEUP_PRESETS: MakeupPreset[] = [
  {
    id: "natural_glow",
    name: "Natural Glow",
    icon: "🌸",
    lipstick: { color: "#cc6677", glossiness: 0.3, opacity: 0.5, matte: false },
    blush: { color: "#ffaaaa", intensity: 0.35, spread: 0.6 },
    eyeshadow: { colors: ["#f5e6d3", "#d4b896"], shimmer: 0.2, intensity: 0.3, style: "natural" },
    contour: { shadowColor: "#8b7355", highlightColor: "#fff5e6", intensity: 0.25 },
  },
  {
    id: "glam_night",
    name: "Glam Night",
    icon: "✨",
    lipstick: { color: "#990033", glossiness: 0.7, opacity: 0.75, matte: false },
    blush: { color: "#ff6688", intensity: 0.45, spread: 0.5 },
    eyeshadow: { colors: ["#2a1a3a", "#6b3fa0", "#c490e4"], shimmer: 0.8, intensity: 0.7, style: "smoky" },
    contour: { shadowColor: "#5a4030", highlightColor: "#ffe8cc", intensity: 0.45 },
  },
  {
    id: "soft_pink",
    name: "Soft Pink",
    icon: "💗",
    lipstick: { color: "#e87a9f", glossiness: 0.5, opacity: 0.6, matte: false },
    blush: { color: "#ffb3c6", intensity: 0.4, spread: 0.65 },
    eyeshadow: { colors: ["#ffe0ec", "#ffaac4", "#ff78a0"], shimmer: 0.5, intensity: 0.5, style: "natural" },
    contour: { shadowColor: "#9e7a6a", highlightColor: "#fff0e6", intensity: 0.3 },
  },
  {
    id: "bold_red",
    name: "Bold Red",
    icon: "💋",
    lipstick: { color: "#cc0022", glossiness: 0.4, opacity: 0.8, matte: true },
    blush: { color: "#ff8888", intensity: 0.3, spread: 0.5 },
    eyeshadow: { colors: ["#1a1a1a", "#333333"], shimmer: 0.1, intensity: 0.4, style: "smoky" },
    contour: { shadowColor: "#6b5040", highlightColor: "#ffedda", intensity: 0.4 },
  },
  {
    id: "sunset_vibes",
    name: "Sunset Vibes",
    icon: "🌅",
    lipstick: { color: "#cc5533", glossiness: 0.5, opacity: 0.65, matte: false },
    blush: { color: "#ffaa77", intensity: 0.45, spread: 0.55 },
    eyeshadow: { colors: ["#ff9944", "#cc4400", "#882200"], shimmer: 0.6, intensity: 0.6, style: "glam" },
    contour: { shadowColor: "#7a5535", highlightColor: "#fff0d4", intensity: 0.35 },
  },
  {
    id: "ice_queen",
    name: "Ice Queen",
    icon: "❄️",
    lipstick: { color: "#aa6688", glossiness: 0.6, opacity: 0.55, matte: false },
    blush: { color: "#ddaacc", intensity: 0.3, spread: 0.6 },
    eyeshadow: { colors: ["#e0e8ff", "#a0b0dd", "#6070aa"], shimmer: 0.7, intensity: 0.55, style: "cut_crease" },
    contour: { shadowColor: "#8888aa", highlightColor: "#f0f0ff", intensity: 0.35 },
  },
];

// ── Texture generation ──

const TEX_SIZE = 256;

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/**
 * Generate a lipstick texture — smooth gradient with optional gloss highlight.
 */
export function generateLipstickTexture(config: LipstickConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  const [r, g, b] = hexToRgb(config.color);

  // Base fill
  ctx.fillStyle = `rgba(${r},${g},${b},${config.opacity})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Depth variation — darker at edges, lighter at center
  const centerGrad = ctx.createRadialGradient(
    TEX_SIZE * 0.5, TEX_SIZE * 0.45, 0,
    TEX_SIZE * 0.5, TEX_SIZE * 0.45, TEX_SIZE * 0.55
  );
  centerGrad.addColorStop(0, `rgba(${Math.min(255, r + 30)},${Math.min(255, g + 20)},${Math.min(255, b + 20)},0.3)`);
  centerGrad.addColorStop(0.6, `rgba(${r},${g},${b},0.1)`);
  centerGrad.addColorStop(1, `rgba(${Math.max(0, r - 40)},${Math.max(0, g - 30)},${Math.max(0, b - 30)},0.25)`);
  ctx.fillStyle = centerGrad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Gloss highlight (specular)
  if (config.glossiness > 0 && !config.matte) {
    const glossGrad = ctx.createRadialGradient(
      TEX_SIZE * 0.45, TEX_SIZE * 0.35, 0,
      TEX_SIZE * 0.45, TEX_SIZE * 0.35, TEX_SIZE * 0.3
    );
    const alpha = config.glossiness * 0.5;
    glossGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    glossGrad.addColorStop(0.3, `rgba(255,255,255,${alpha * 0.4})`);
    glossGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glossGrad;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  }

  // Subtle noise for realism
  addNoiseToCanvas(ctx, TEX_SIZE, TEX_SIZE, 0.03);

  return canvas;
}

/**
 * Generate a blush texture — soft radial gradient.
 */
export function generateBlushTexture(config: BlushConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  const [r, g, b] = hexToRgb(config.color);

  // Soft radial gradient from center
  const grad = ctx.createRadialGradient(
    TEX_SIZE * 0.5, TEX_SIZE * 0.5, 0,
    TEX_SIZE * 0.5, TEX_SIZE * 0.5, TEX_SIZE * config.spread * 0.5
  );
  grad.addColorStop(0, `rgba(${r},${g},${b},${config.intensity})`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},${config.intensity * 0.6})`);
  grad.addColorStop(0.7, `rgba(${r},${g},${b},${config.intensity * 0.2})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  addNoiseToCanvas(ctx, TEX_SIZE, TEX_SIZE, 0.02);
  return canvas;
}

/**
 * Generate an eyeshadow texture — multi-color gradient with optional shimmer.
 */
export function generateEyeshadowTexture(config: EyeshadowConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Vertical gradient (top of eyelid to crease)
  const grad = ctx.createLinearGradient(0, TEX_SIZE, 0, 0);
  config.colors.forEach((color, i) => {
    const [r, g, b] = hexToRgb(color);
    const stop = i / Math.max(1, config.colors.length - 1);
    grad.addColorStop(stop, `rgba(${r},${g},${b},${config.intensity})`);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Style variations
  if (config.style === "smoky") {
    // Add darker edges
    const edgeGrad = ctx.createRadialGradient(
      TEX_SIZE * 0.5, TEX_SIZE * 0.5, TEX_SIZE * 0.2,
      TEX_SIZE * 0.5, TEX_SIZE * 0.5, TEX_SIZE * 0.5
    );
    edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
    edgeGrad.addColorStop(1, `rgba(0,0,0,${config.intensity * 0.3})`);
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  } else if (config.style === "cut_crease") {
    // Sharp line at crease
    ctx.fillStyle = `rgba(0,0,0,${config.intensity * 0.4})`;
    ctx.fillRect(0, TEX_SIZE * 0.4, TEX_SIZE, TEX_SIZE * 0.08);
  }

  // Shimmer particles
  if (config.shimmer > 0) {
    addShimmer(ctx, TEX_SIZE, TEX_SIZE, config.shimmer);
  }

  // Fade edges to transparent
  const fadeGrad = ctx.createRadialGradient(
    TEX_SIZE * 0.5, TEX_SIZE * 0.5, TEX_SIZE * 0.3,
    TEX_SIZE * 0.5, TEX_SIZE * 0.5, TEX_SIZE * 0.5
  );
  fadeGrad.addColorStop(0, "rgba(0,0,0,0)");
  fadeGrad.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  ctx.globalCompositeOperation = "source-over";

  return canvas;
}

/**
 * Generate a contour/highlight texture — shadow on edges, highlight on center.
 */
export function generateContourTexture(config: ContourConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  const [sr, sg, sb] = hexToRgb(config.shadowColor);
  const [hr, hg, hb] = hexToRgb(config.highlightColor);

  // Shadow on left and right edges
  const shadowGradL = ctx.createLinearGradient(0, 0, TEX_SIZE * 0.35, 0);
  shadowGradL.addColorStop(0, `rgba(${sr},${sg},${sb},${config.intensity * 0.5})`);
  shadowGradL.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
  ctx.fillStyle = shadowGradL;
  ctx.fillRect(0, 0, TEX_SIZE * 0.35, TEX_SIZE);

  const shadowGradR = ctx.createLinearGradient(TEX_SIZE, 0, TEX_SIZE * 0.65, 0);
  shadowGradR.addColorStop(0, `rgba(${sr},${sg},${sb},${config.intensity * 0.5})`);
  shadowGradR.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
  ctx.fillStyle = shadowGradR;
  ctx.fillRect(TEX_SIZE * 0.65, 0, TEX_SIZE * 0.35, TEX_SIZE);

  // Highlight in center strip
  const highlightGrad = ctx.createLinearGradient(0, 0, 0, TEX_SIZE);
  highlightGrad.addColorStop(0, `rgba(${hr},${hg},${hb},${config.intensity * 0.15})`);
  highlightGrad.addColorStop(0.3, `rgba(${hr},${hg},${hb},${config.intensity * 0.3})`);
  highlightGrad.addColorStop(0.7, `rgba(${hr},${hg},${hb},${config.intensity * 0.25})`);
  highlightGrad.addColorStop(1, `rgba(${hr},${hg},${hb},${config.intensity * 0.1})`);
  ctx.fillStyle = highlightGrad;
  ctx.fillRect(TEX_SIZE * 0.38, 0, TEX_SIZE * 0.24, TEX_SIZE);

  return canvas;
}

// ── Utility ──

function addNoiseToCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 255 * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
}

function addShimmer(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const count = Math.floor(30 * intensity);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const size = 1 + Math.random() * 2.5;
    const alpha = 0.3 + Math.random() * 0.5;
    ctx.fillStyle = `rgba(255,255,240,${alpha * intensity})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Cache for generated textures to avoid re-rendering every frame.
 */
const textureCache = new Map<string, HTMLCanvasElement>();

export function getCachedTexture(presetId: string, region: string, generator: () => HTMLCanvasElement): HTMLCanvasElement {
  const key = `${presetId}::${region}`;
  if (!textureCache.has(key)) {
    textureCache.set(key, generator());
  }
  return textureCache.get(key)!;
}

export function clearTextureCache() {
  textureCache.clear();
}
