// lib/gl/webglEffects.ts — Custom WebGL/Canvas shader effects
// Glitch, Chromatic Aberration, Light Leaks, VHS, Prism, Duotone, Pixelate, Halftone

export type EffectId =
  | "none"
  | "glitch"
  | "chromatic"
  | "light_leaks"
  | "vhs"
  | "prism"
  | "duotone"
  | "pixelate"
  | "halftone"
  | "rgb_split"
  | "mirror"
  | "kaleidoscope"
  | "fisheye"
  | "wave_distort"
  | "neon_edges";

export type EffectDef = {
  id: EffectId;
  name: string;
  description: string;
  icon: string;
  category: "distortion" | "color" | "artistic" | "retro";
};

export const EFFECTS: EffectDef[] = [
  { id: "none", name: "Nenhum", description: "Sem efeito", icon: "⊘", category: "color" },
  { id: "glitch", name: "Glitch", description: "Distorção digital aleatória", icon: "⚡", category: "distortion" },
  { id: "chromatic", name: "Chromatic", description: "Aberração cromática RGB", icon: "🌈", category: "distortion" },
  { id: "light_leaks", name: "Light Leaks", description: "Vazamento de luz vintage", icon: "☀️", category: "artistic" },
  { id: "vhs", name: "VHS", description: "Estilo fita VHS anos 90", icon: "📼", category: "retro" },
  { id: "prism", name: "Prisma", description: "Efeito prisma holográfico", icon: "💎", category: "distortion" },
  { id: "duotone", name: "Duotone", description: "Duas cores intensas", icon: "🎨", category: "color" },
  { id: "pixelate", name: "Pixel", description: "Pixelização estilizada", icon: "🟩", category: "artistic" },
  { id: "halftone", name: "Halftone", description: "Pontos de meio-tom", icon: "⚫", category: "artistic" },
  { id: "rgb_split", name: "RGB Split", description: "Canais RGB separados", icon: "🔴", category: "distortion" },
  { id: "mirror", name: "Espelho", description: "Reflexo simétrico", icon: "🪞", category: "distortion" },
  { id: "kaleidoscope", name: "Caleidoscópio", description: "Padrão caleidoscópico", icon: "🔮", category: "artistic" },
  { id: "fisheye", name: "Fisheye", description: "Lente olho de peixe", icon: "🐟", category: "distortion" },
  { id: "wave_distort", name: "Wave", description: "Distorção de onda", icon: "🌊", category: "distortion" },
  { id: "neon_edges", name: "Neon Edges", description: "Bordas neon brilhantes", icon: "✨", category: "artistic" },
];

/**
 * Apply an effect to an image using Canvas 2D API.
 * Works in all WebViews — no WebGL required.
 * Returns a data URL of the processed image.
 */
export async function applyCanvasEffect(
  imageUri: string,
  effectId: EffectId,
  intensity: number = 1.0
): Promise<string> {
  if (effectId === "none") return imageUri;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = Math.min(img.naturalWidth, 1440);
        const h = Math.round(w * (img.naturalHeight / img.naturalWidth));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        if (!ctx) { resolve(imageUri); return; }

        // Draw original
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        switch (effectId) {
          case "glitch":
            applyGlitch(ctx, w, h, data, intensity);
            break;
          case "chromatic":
            applyChromatic(ctx, w, h, data, intensity);
            break;
          case "light_leaks":
            applyLightLeaks(ctx, w, h, intensity);
            break;
          case "vhs":
            applyVHS(ctx, w, h, data, intensity);
            break;
          case "prism":
            applyPrism(ctx, img, w, h, intensity);
            break;
          case "duotone":
            applyDuotone(ctx, w, h, data, intensity);
            break;
          case "pixelate":
            applyPixelate(ctx, img, w, h, intensity);
            break;
          case "halftone":
            applyHalftone(ctx, w, h, data, intensity);
            break;
          case "rgb_split":
            applyRGBSplit(ctx, w, h, data, intensity);
            break;
          case "mirror":
            applyMirror(ctx, img, w, h);
            break;
          case "kaleidoscope":
            applyKaleidoscope(ctx, img, w, h);
            break;
          case "fisheye":
            applyFisheye(ctx, w, h, data, intensity);
            break;
          case "wave_distort":
            applyWaveDistort(ctx, img, w, h, intensity);
            break;
          case "neon_edges":
            applyNeonEdges(ctx, w, h, data, intensity);
            break;
        }

        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        resolve(imageUri);
      }
    };
    img.onerror = () => resolve(imageUri);
    img.src = imageUri;
    setTimeout(() => resolve(imageUri), 10000);
  });
}

/**
 * Get CSS filter string for live preview (lightweight approximation).
 * Used on the camera screen for instant preview.
 */
export function getEffectCSSFilter(effectId: EffectId): string | null {
  switch (effectId) {
    case "vhs": return "saturate(0.75) contrast(1.15) sepia(0.15) brightness(1.05)";
    case "duotone": return "saturate(0.3) contrast(1.2) sepia(0.6) hue-rotate(180deg)";
    case "neon_edges": return "contrast(1.5) brightness(1.1) saturate(1.5)";
    case "halftone": return "contrast(1.3) grayscale(0.4)";
    case "light_leaks": return "brightness(1.08) contrast(0.95) saturate(1.15)";
    default: return null;
  }
}

// ── Effect implementations ──

function applyGlitch(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  // Put original back first
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);

  const sliceCount = Math.floor(8 + intensity * 15);
  for (let i = 0; i < sliceCount; i++) {
    const y = Math.floor(Math.random() * h);
    const sliceH = Math.floor(2 + Math.random() * 20 * intensity);
    const offset = Math.floor((Math.random() - 0.5) * 40 * intensity);
    const sliceData = ctx.getImageData(0, y, w, Math.min(sliceH, h - y));
    ctx.putImageData(sliceData, offset, y);
  }

  // RGB channel shift
  const shift = Math.floor(3 + intensity * 8);
  const original = ctx.getImageData(0, 0, w, h);
  const shifted = ctx.createImageData(w, h);
  for (let i = 0; i < original.data.length; i += 4) {
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);
    // Red channel shifted right
    const rIdx = (y * w + Math.min(x + shift, w - 1)) * 4;
    shifted.data[i] = original.data[rIdx];
    // Green channel stays
    shifted.data[i + 1] = original.data[i + 1];
    // Blue channel shifted left
    const bIdx = (y * w + Math.max(x - shift, 0)) * 4;
    shifted.data[i + 2] = original.data[bIdx + 2];
    shifted.data[i + 3] = 255;
  }
  ctx.putImageData(shifted, 0, 0);

  // Random noise lines
  const lineCount = Math.floor(3 * intensity);
  for (let i = 0; i < lineCount; i++) {
    const y = Math.floor(Math.random() * h);
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${0.3 * intensity})`;
    ctx.fillRect(0, y, w, 1 + Math.floor(Math.random() * 3));
  }
}

function applyChromatic(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  const offset = Math.floor(4 + intensity * 12);
  const result = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);
    // Red shifted right
    const rIdx = (y * w + Math.min(x + offset, w - 1)) * 4;
    result.data[i] = data[rIdx];
    // Green stays
    result.data[i + 1] = data[i + 1];
    // Blue shifted left
    const bIdx = (y * w + Math.max(x - offset, 0)) * 4;
    result.data[i + 2] = data[bIdx + 2];
    result.data[i + 3] = 255;
  }
  ctx.putImageData(result, 0, 0);
}

function applyLightLeaks(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  // Warm gradient from top-left
  const grad1 = ctx.createRadialGradient(w * 0.1, h * 0.1, 0, w * 0.3, h * 0.3, w * 0.7);
  grad1.addColorStop(0, `rgba(255,180,80,${0.45 * intensity})`);
  grad1.addColorStop(0.5, `rgba(255,120,60,${0.2 * intensity})`);
  grad1.addColorStop(1, "rgba(255,100,50,0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, w, h);

  // Pink leak from bottom-right
  const grad2 = ctx.createRadialGradient(w * 0.85, h * 0.9, 0, w * 0.7, h * 0.7, w * 0.6);
  grad2.addColorStop(0, `rgba(255,100,180,${0.35 * intensity})`);
  grad2.addColorStop(0.6, `rgba(255,80,120,${0.15 * intensity})`);
  grad2.addColorStop(1, "rgba(255,60,100,0)");
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, w, h);

  // Golden flare
  const grad3 = ctx.createRadialGradient(w * 0.6, h * 0.2, 0, w * 0.5, h * 0.3, w * 0.4);
  grad3.addColorStop(0, `rgba(255,220,120,${0.3 * intensity})`);
  grad3.addColorStop(1, "rgba(255,200,100,0)");
  ctx.fillStyle = grad3;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "source-over";
}

function applyVHS(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  // Chromatic offset
  const offset = Math.floor(2 + intensity * 4);
  const result = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);
    const rIdx = (y * w + Math.min(x + offset, w - 1)) * 4;
    result.data[i] = data[rIdx];
    result.data[i + 1] = data[i + 1];
    const bIdx = (y * w + Math.max(x - offset, 0)) * 4;
    result.data[i + 2] = data[bIdx + 2];
    result.data[i + 3] = 255;
  }
  ctx.putImageData(result, 0, 0);

  // Scanlines
  ctx.globalCompositeOperation = "multiply";
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 * intensity})`;
    ctx.fillRect(0, y, w, 1);
  }

  // Noise
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 80 * intensity; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const gray = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${gray},${gray},${gray},${0.08 * intensity})`;
    ctx.fillRect(x, y, Math.random() * 40, 1);
  }

  // Slight color wash
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = `rgba(100,60,180,${0.08 * intensity})`;
  ctx.fillRect(0, 0, w, h);

  // Tracking lines
  const trackY = Math.floor(Math.random() * h);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(255,255,255,${0.15 * intensity})`;
  ctx.fillRect(0, trackY, w, 3 + Math.floor(Math.random() * 5));

  ctx.globalCompositeOperation = "source-over";
}

function applyPrism(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, intensity: number) {
  const offset = 6 + intensity * 10;
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.5;

  // Red channel offset
  ctx.drawImage(img, offset, offset, w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgba(255,0,0,${0.4 * intensity})`;
  ctx.fillRect(0, 0, w + offset, h + offset);

  // Reset and draw blue offset
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(img, -offset, -offset, w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgba(0,0,255,${0.4 * intensity})`;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = "source-over";

  // Rainbow gradient overlay
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `rgba(255,0,0,${0.1 * intensity})`);
  grad.addColorStop(0.2, `rgba(255,255,0,${0.1 * intensity})`);
  grad.addColorStop(0.4, `rgba(0,255,0,${0.1 * intensity})`);
  grad.addColorStop(0.6, `rgba(0,255,255,${0.1 * intensity})`);
  grad.addColorStop(0.8, `rgba(0,0,255,${0.1 * intensity})`);
  grad.addColorStop(1, `rgba(255,0,255,${0.1 * intensity})`);
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function applyDuotone(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  // Purple + Orange duotone
  const dark = [60, 20, 120]; // purple for shadows
  const light = [255, 160, 40]; // orange for highlights
  const result = new Uint8ClampedArray(data);

  for (let i = 0; i < result.length; i += 4) {
    const lum = (result[i] * 0.299 + result[i + 1] * 0.587 + result[i + 2] * 0.114) / 255;
    const r = dark[0] + (light[0] - dark[0]) * lum;
    const g = dark[1] + (light[1] - dark[1]) * lum;
    const b = dark[2] + (light[2] - dark[2]) * lum;
    result[i] = Math.round(result[i] * (1 - intensity) + r * intensity);
    result[i + 1] = Math.round(result[i + 1] * (1 - intensity) + g * intensity);
    result[i + 2] = Math.round(result[i + 2] * (1 - intensity) + b * intensity);
  }
  ctx.putImageData(new ImageData(result, w, h), 0, 0);
}

function applyPixelate(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, intensity: number) {
  const blockSize = Math.max(2, Math.floor(4 + intensity * 16));
  // Draw small then scale up
  const smallW = Math.ceil(w / blockSize);
  const smallH = Math.ceil(h / blockSize);
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = smallW;
  tempCanvas.height = smallH;
  const tCtx = tempCanvas.getContext("2d")!;
  tCtx.drawImage(img, 0, 0, smallW, smallH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
}

function applyHalftone(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  const dotSize = Math.max(3, Math.floor(4 + intensity * 6));
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += dotSize) {
    for (let x = 0; x < w; x += dotSize) {
      const idx = (y * w + x) * 4;
      const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
      const radius = (lum * dotSize * 0.5) * intensity + (dotSize * 0.1);
      ctx.beginPath();
      ctx.arc(x + dotSize / 2, y + dotSize / 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${data[idx]},${data[idx + 1]},${data[idx + 2]})`;
      ctx.fill();
    }
  }
}

function applyRGBSplit(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  const offset = Math.floor(8 + intensity * 15);
  // Create separate channels
  ctx.clearRect(0, 0, w, h);

  // Red channel
  const rData = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    rData.data[i] = data[i];
    rData.data[i + 1] = 0;
    rData.data[i + 2] = 0;
    rData.data[i + 3] = 200;
  }
  const rCanvas = document.createElement("canvas");
  rCanvas.width = w; rCanvas.height = h;
  rCanvas.getContext("2d")!.putImageData(rData, 0, 0);

  // Green channel
  const gData = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    gData.data[i] = 0;
    gData.data[i + 1] = data[i + 1];
    gData.data[i + 2] = 0;
    gData.data[i + 3] = 200;
  }
  const gCanvas = document.createElement("canvas");
  gCanvas.width = w; gCanvas.height = h;
  gCanvas.getContext("2d")!.putImageData(gData, 0, 0);

  // Blue channel
  const bData = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    bData.data[i] = 0;
    bData.data[i + 1] = 0;
    bData.data[i + 2] = data[i + 2];
    bData.data[i + 3] = 200;
  }
  const bCanvas = document.createElement("canvas");
  bCanvas.width = w; bCanvas.height = h;
  bCanvas.getContext("2d")!.putImageData(bData, 0, 0);

  ctx.drawImage(rCanvas, -offset, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(gCanvas, 0, 0);
  ctx.drawImage(bCanvas, offset, 0);
  ctx.globalCompositeOperation = "source-over";
}

function applyMirror(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  ctx.drawImage(img, 0, 0, w / 2, h, 0, 0, w / 2, h);
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w / 2, h, 0, 0, w / 2, h);
  ctx.restore();
}

function applyKaleidoscope(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const segments = 6;
  const cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < segments; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((Math.PI * 2 * i) / segments);
    if (i % 2 === 1) ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w * Math.cos(Math.PI * 2 / segments), w * Math.sin(Math.PI * 2 / segments));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, -cx, -cy, w, h);
    ctx.restore();
  }
}

function applyFisheye(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  const result = ctx.createImageData(w, h);
  const cx = w / 2, cy = h / 2;
  const maxR = Math.min(cx, cy);
  const strength = 1.5 + intensity * 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      let srcX: number, srcY: number;

      if (r < 1) {
        const nr = Math.pow(r, strength) / r;
        srcX = Math.round(cx + dx * nr * maxR);
        srcY = Math.round(cy + dy * nr * maxR);
      } else {
        srcX = x;
        srcY = y;
      }

      srcX = Math.max(0, Math.min(w - 1, srcX));
      srcY = Math.max(0, Math.min(h - 1, srcY));

      const dIdx = (y * w + x) * 4;
      const sIdx = (srcY * w + srcX) * 4;
      result.data[dIdx] = data[sIdx];
      result.data[dIdx + 1] = data[sIdx + 1];
      result.data[dIdx + 2] = data[sIdx + 2];
      result.data[dIdx + 3] = 255;
    }
  }
  ctx.putImageData(result, 0, 0);
}

function applyWaveDistort(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, intensity: number) {
  ctx.clearRect(0, 0, w, h);
  const amplitude = 8 + intensity * 15;
  const frequency = 0.02 + intensity * 0.03;

  for (let y = 0; y < h; y++) {
    const offset = Math.sin(y * frequency) * amplitude;
    ctx.drawImage(img, 0, y, w, 1, offset, y, w, 1);
  }
}

function applyNeonEdges(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8ClampedArray, intensity: number) {
  // Sobel edge detection
  const result = ctx.createImageData(w, h);
  const gray = new Float32Array(w * h);

  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // Sobel
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] + gray[i - w + 1]
                - 2 * gray[i - 1] + 2 * gray[i + 1]
                - gray[i + w - 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
                + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const edge = Math.min(255, Math.sqrt(gx * gx + gy * gy) * intensity * 2);

      const idx = i * 4;
      // Neon colors based on angle
      const angle = Math.atan2(gy, gx);
      const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;
      const [r, g, b] = hslToRgb(hue, 100, 50 + edge * 0.2);
      result.data[idx] = Math.round(r * (edge / 255));
      result.data[idx + 1] = Math.round(g * (edge / 255));
      result.data[idx + 2] = Math.round(b * (edge / 255));
      result.data[idx + 3] = 255;
    }
  }

  // Blend with original
  const blended = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    blended.data[i] = Math.min(255, data[i] * (1 - intensity * 0.5) + result.data[i]);
    blended.data[i + 1] = Math.min(255, data[i + 1] * (1 - intensity * 0.5) + result.data[i + 1]);
    blended.data[i + 2] = Math.min(255, data[i + 2] * (1 - intensity * 0.5) + result.data[i + 2]);
    blended.data[i + 3] = 255;
  }
  ctx.putImageData(blended, 0, 0);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
