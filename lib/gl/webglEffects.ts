// lib/gl/webglEffects.ts — Canvas effects for story preview (export) only

export type EffectId =
  | "none"
  | "preto_branco"
  | "golden_mist"
  | "veludo"
  | "aurora"
  | "claridade"
  | "brisa_rosa"
  | "pixelate"
  | "halftone"
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
  { id: "preto_branco", name: "Preto e branco", description: "Tons de cinza elegantes", icon: "◐", category: "color" },
  { id: "golden_mist", name: "Luz dourada", description: "Brilho suave estilo editorial", icon: "✦", category: "artistic" },
  { id: "veludo", name: "Veludo", description: "Vignette suave e foco no centro", icon: "◆", category: "artistic" },
  { id: "aurora", name: "Aurora", description: "Tom frio cinematográfico", icon: "❄", category: "artistic" },
  { id: "claridade", name: "Claridade", description: "Contraste e cor mais vivos", icon: "◇", category: "color" },
  { id: "brisa_rosa", name: "Brisa rosa", description: "Luz rosada delicada", icon: "🌸", category: "artistic" },
  { id: "pixelate", name: "Pixel", description: "Pixelização estilizada", icon: "🟩", category: "artistic" },
  { id: "halftone", name: "Halftone", description: "Pontos de meio-tom", icon: "⚫", category: "artistic" },
  { id: "mirror", name: "Espelho", description: "Reflexo simétrico", icon: "🪞", category: "distortion" },
  { id: "kaleidoscope", name: "Caleidoscópio", description: "Padrão caleidoscópico", icon: "🔮", category: "artistic" },
  { id: "fisheye", name: "Fisheye", description: "Lente olho de peixe", icon: "🐟", category: "distortion" },
  { id: "wave_distort", name: "Wave", description: "Distorção de onda suave", icon: "🌊", category: "distortion" },
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

        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        switch (effectId) {
          case "preto_branco":
            applyPretoBranco(ctx, w, h, data, intensity);
            break;
          case "golden_mist":
            applyGoldenMist(ctx, w, h, intensity);
            break;
          case "veludo":
            applyVeludo(ctx, w, h, intensity);
            break;
          case "aurora":
            applyAurora(ctx, w, h, intensity);
            break;
          case "claridade":
            applyClaridade(ctx, w, h, data, intensity);
            break;
          case "brisa_rosa":
            applyBrisaRosa(ctx, w, h, intensity);
            break;
          case "pixelate":
            applyPixelate(ctx, img, w, h, intensity);
            break;
          case "halftone":
            applyHalftone(ctx, w, h, data, intensity);
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
 * Lightweight CSS approximation for preview (capturePreview only — camera uses none).
 */
export function getEffectCSSFilter(effectId: EffectId): string | null {
  switch (effectId) {
    case "preto_branco":
      return "grayscale(1) contrast(1.14) brightness(1.02)";
    case "golden_mist":
      return "brightness(1.04) contrast(1.03) saturate(1.06) sepia(0.06)";
    case "veludo":
      return "contrast(1.06) brightness(0.97)";
    case "aurora":
      return "brightness(1.02) contrast(1.04) saturate(1.05) hue-rotate(-10deg)";
    case "claridade":
      return "contrast(1.1) saturate(1.08) brightness(1.02)";
    case "brisa_rosa":
      return "brightness(1.03) contrast(1.02) saturate(1.1) sepia(0.05)";
    case "pixelate":
      return "contrast(1.1) saturate(0.85)";
    case "halftone":
      return "contrast(1.3) grayscale(0.4)";
    case "neon_edges":
      return "contrast(1.5) brightness(1.1) saturate(1.5)";
    case "mirror":
      return "contrast(1.05) saturate(1.1)";
    case "kaleidoscope":
      return "saturate(1.5) contrast(1.08) hue-rotate(25deg)";
    case "fisheye":
      return "saturate(1.15) contrast(1.08)";
    case "wave_distort":
      return "saturate(1.2) contrast(1.05) hue-rotate(-4deg)";
    default:
      return null;
  }
}

function applyPretoBranco(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: Uint8ClampedArray,
  intensity: number
) {
  const contrast = 1.06 + intensity * 0.1;
  const result = ctx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    const origLum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    let lum = Math.min(255, Math.max(0, (origLum - 128) * contrast + 128));
    const g = Math.round(lum * intensity + origLum * (1 - intensity));
    result.data[i] = g;
    result.data[i + 1] = g;
    result.data[i + 2] = g;
    result.data[i + 3] = data[i + 3];
  }
  ctx.putImageData(result, 0, 0);
}

function applyGoldenMist(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const k = 0.42 * intensity;
  const grad1 = ctx.createRadialGradient(w * 0.12, h * 0.1, 0, w * 0.32, h * 0.28, w * 0.62);
  grad1.addColorStop(0, `rgba(255, 220, 170, ${0.28 * k})`);
  grad1.addColorStop(0.55, `rgba(255, 185, 120, ${0.1 * k})`);
  grad1.addColorStop(1, "rgba(255, 160, 100, 0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, w, h);

  const grad2 = ctx.createRadialGradient(w * 0.88, h * 0.85, 0, w * 0.72, h * 0.68, w * 0.45);
  grad2.addColorStop(0, `rgba(255, 200, 210, ${0.18 * k})`);
  grad2.addColorStop(1, "rgba(255, 180, 200, 0)");
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "source-over";
}

/** Vignette suave (multiply) + leve brilho central — não altera geometria. */
function applyVeludo(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.hypot(w, h) * 0.66;
  const edgeRgb = Math.round(108 - 28 * intensity);
  const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.52, `rgba(248,248,248,${1 - 0.04 * intensity})`);
  g.addColorStop(1, `rgb(${edgeRgb},${edgeRgb},${edgeRgb})`);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.48);
  g2.addColorStop(0, `rgba(255,255,255,${0.08 * intensity})`);
  g2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

/** Gradiente azul-esverdeado suave (overlay) — look premium frio. */
function applyAurora(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const k = 0.36 * intensity;
  ctx.globalCompositeOperation = "overlay";
  const g1 = ctx.createRadialGradient(0, 0, 0, w * 0.38, h * 0.32, w * 0.78);
  g1.addColorStop(0, `rgba(110,200,255,${0.2 * k})`);
  g1.addColorStop(0.45, `rgba(90,170,230,${0.08 * k})`);
  g1.addColorStop(1, "rgba(70,140,210,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2 = ctx.createRadialGradient(w, h, 0, w * 0.62, h * 0.68, w * 0.58);
  g2.addColorStop(0, `rgba(130,215,255,${0.14 * k})`);
  g2.addColorStop(1, "rgba(100,190,240,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

/** Contraste em torno do meio-tom + saturação leve — “HDR” discreto. APK: mesma lógica em EffectBakeWebView (`applyClaridadePass`). */
function applyClaridade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: Uint8ClampedArray,
  intensity: number
) {
  const t = intensity;
  const contrastBoost = 1 + 0.11 * t;
  const satBoost = 1 + 0.1 * t;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    r = (r - 128) * contrastBoost + 128;
    g = (g - 128) * contrastBoost + 128;
    b = (b - 128) * contrastBoost + 128;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    r = lum + (r - lum) * satBoost;
    g = lum + (g - lum) * satBoost;
    b = lum + (b - lum) * satBoost;
    out[i] = Math.round(Math.max(0, Math.min(255, r)));
    out[i + 1] = Math.round(Math.max(0, Math.min(255, g)));
    out[i + 2] = Math.round(Math.max(0, Math.min(255, b)));
    out[i + 3] = data[i + 3];
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}

/** Luz rosada e lavanda em screen — retrato editorial. */
function applyBrisaRosa(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const k = 0.38 * intensity;
  ctx.globalCompositeOperation = "screen";
  const g1 = ctx.createRadialGradient(w * 0.18, h * 0.12, 0, w * 0.38, h * 0.32, w * 0.58);
  g1.addColorStop(0, `rgba(255,205,225,${0.22 * k})`);
  g1.addColorStop(0.55, `rgba(255,190,210,${0.08 * k})`);
  g1.addColorStop(1, "rgba(255,180,200,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2 = ctx.createRadialGradient(w * 0.88, h * 0.45, 0, w * 0.58, h * 0.48, w * 0.52);
  g2.addColorStop(0, `rgba(235,215,255,${0.18 * k})`);
  g2.addColorStop(1, "rgba(225,200,255,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function applyPixelate(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, intensity: number) {
  const blockSize = Math.max(2, Math.floor(4 + intensity * 16));
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
  const result = ctx.createImageData(w, h);
  const gray = new Float32Array(w * h);

  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

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
      const angle = Math.atan2(gy, gx);
      const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;
      const [r, g, b] = hslToRgb(hue, 100, 50 + edge * 0.2);
      result.data[idx] = Math.round(r * (edge / 255));
      result.data[idx + 1] = Math.round(g * (edge / 255));
      result.data[idx + 2] = Math.round(b * (edge / 255));
      result.data[idx + 3] = 255;
    }
  }

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
