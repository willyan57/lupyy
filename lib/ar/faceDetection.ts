// lib/ar/faceDetection.ts — MediaPipe Face Mesh integration for WebView
// Provides face landmark detection for AR effects + WebGL makeup rendering
import { renderMakeup } from "./makeupRenderer";

export type FaceLandmark = {
  x: number; // 0-1 normalized
  y: number;
  z: number;
};

export type FaceDetectionResult = {
  landmarks: FaceLandmark[];
  faceOval: number[]; // indices
  leftEye: number[];
  rightEye: number[];
  lips: number[];
  noseTip: number;
  forehead: number;
  chin: number;
  leftCheek: number;
  rightCheek: number;
};

export type AREffectId =
  | "none"
  | "face_mesh"
  | "beauty_glow"
  | "neon_outline"
  | "heart_eyes"
  | "crown"
  | "devil_horns"
  | "butterfly"
  | "sparkles"
  | "sunglasses"
  | "cat_ears"
  | "dog_nose"
  | "angel_halo"
  | "face_paint"
  | "color_freckles"
  | "makeup_lipstick"
  | "makeup_blush"
  | "makeup_eyeshadow"
  | "makeup_contour"
  | "makeup_full"
  | "makeup_natural_glow"
  | "makeup_glam_night"
  | "makeup_soft_pink"
  | "makeup_bold_red"
  | "makeup_sunset_vibes"
  | "makeup_ice_queen";

export type AREffectDef = {
  id: AREffectId;
  name: string;
  description: string;
  icon: string;
  requiresFace: boolean;
};

export const AR_EFFECTS: AREffectDef[] = [
  { id: "none", name: "Nenhum", description: "Sem efeito AR", icon: "⊘", requiresFace: false },
  { id: "face_mesh", name: "Face Mesh", description: "Grade 3D no rosto", icon: "🕸️", requiresFace: true },
  { id: "beauty_glow", name: "Glow", description: "Brilho suave no rosto", icon: "✨", requiresFace: true },
  { id: "neon_outline", name: "Neon Face", description: "Contorno neon no rosto", icon: "💡", requiresFace: true },
  { id: "heart_eyes", name: "Heart Eyes", description: "Corações nos olhos", icon: "😍", requiresFace: true },
  { id: "crown", name: "Coroa", description: "Coroa dourada", icon: "👑", requiresFace: true },
  { id: "devil_horns", name: "Diabinho", description: "Chifres de diabo", icon: "😈", requiresFace: true },
  { id: "butterfly", name: "Borboleta", description: "Borboletas ao redor", icon: "🦋", requiresFace: true },
  { id: "sparkles", name: "Brilhos", description: "Partículas brilhantes", icon: "⭐", requiresFace: true },
  { id: "sunglasses", name: "Óculos", description: "Óculos de sol", icon: "🕶️", requiresFace: true },
  { id: "cat_ears", name: "Gato", description: "Orelhas e nariz de gato", icon: "🐱", requiresFace: true },
  { id: "dog_nose", name: "Cachorro", description: "Nariz e língua de cachorro", icon: "🐶", requiresFace: true },
  { id: "angel_halo", name: "Anjo", description: "Auréola de anjo", icon: "😇", requiresFace: true },
  { id: "face_paint", name: "Pintura", description: "Pintura facial tribal", icon: "🎭", requiresFace: true },
  { id: "color_freckles", name: "Sardas", description: "Sardas coloridas", icon: "🌸", requiresFace: true },
  { id: "makeup_lipstick", name: "Batom", description: "Batom realista", icon: "💄", requiresFace: true },
  { id: "makeup_blush", name: "Blush", description: "Blush nas bochechas", icon: "🌺", requiresFace: true },
  { id: "makeup_eyeshadow", name: "Sombra", description: "Sombra nos olhos", icon: "👁️", requiresFace: true },
  { id: "makeup_contour", name: "Contorno", description: "Contorno facial", icon: "🎭", requiresFace: true },
  { id: "makeup_full", name: "Make Completa", description: "Maquiagem completa", icon: "💋", requiresFace: true },
  { id: "makeup_natural_glow", name: "Natural Glow", description: "Make natural com WebGL", icon: "🌸", requiresFace: true },
  { id: "makeup_glam_night", name: "Glam Night", description: "Glamour noturno WebGL", icon: "✨", requiresFace: true },
  { id: "makeup_soft_pink", name: "Soft Pink", description: "Rosa suave WebGL", icon: "💗", requiresFace: true },
  { id: "makeup_bold_red", name: "Bold Red", description: "Vermelho marcante WebGL", icon: "💋", requiresFace: true },
  { id: "makeup_sunset_vibes", name: "Sunset Vibes", description: "Tons de pôr do sol WebGL", icon: "🌅", requiresFace: true },
  { id: "makeup_ice_queen", name: "Ice Queen", description: "Frio e elegante WebGL", icon: "❄️", requiresFace: true },
];

// MediaPipe Face Mesh key landmark indices
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

let faceMeshModel: any = null;
let isLoading = false;
let loadPromise: Promise<boolean> | null = null;

/**
 * Load MediaPipe Face Mesh via CDN.
 * MediaPipe works in WebView — this is the same tech used by many web AR apps.
 */
export async function loadFaceDetection(): Promise<boolean> {
  if (faceMeshModel) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (isLoading) return false;
    isLoading = true;

    try {
      // Check if MediaPipe is already loaded
      if ((window as any).__mediapipeFaceMesh) {
        faceMeshModel = (window as any).__mediapipeFaceMesh;
        isLoading = false;
        return true;
      }

      // Load TensorFlow.js and Face Landmarks Detection
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.min.js");

      const FaceMesh = (window as any).FaceMesh;
      if (!FaceMesh) {
        console.warn("MediaPipe FaceMesh not available");
        isLoading = false;
        return false;
      }

      faceMeshModel = new FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
      });

      faceMeshModel.setOptions({
        maxNumFaces: 2,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      await faceMeshModel.initialize();
      (window as any).__mediapipeFaceMesh = faceMeshModel;
      isLoading = false;
      return true;
    } catch (err) {
      console.warn("Failed to load MediaPipe FaceMesh:", err);
      isLoading = false;
      return false;
    }
  })();

  return loadPromise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Detect faces in a video element or image.
 * Returns face detection results for each face found.
 */
export async function detectFaces(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<FaceDetectionResult[]> {
  if (!faceMeshModel) {
    const loaded = await loadFaceDetection();
    if (!loaded) return [];
  }

  return new Promise((resolve) => {
    const onResults = (results: any) => {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        resolve([]);
        return;
      }

      const faces: FaceDetectionResult[] = results.multiFaceLandmarks.map((landmarks: any[]) => ({
        landmarks: landmarks.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z })),
        faceOval: FACE_OVAL,
        leftEye: LEFT_EYE,
        rightEye: RIGHT_EYE,
        lips: LIPS,
        noseTip: NOSE_TIP,
        forehead: FOREHEAD,
        chin: CHIN,
        leftCheek: LEFT_CHEEK,
        rightCheek: RIGHT_CHEEK,
      }));

      resolve(faces);
    };

    faceMeshModel.onResults(onResults);

    try {
      faceMeshModel.send({ image: input });
    } catch {
      resolve([]);
    }

    // Timeout
    setTimeout(() => resolve([]), 5000);
  });
}

/**
 * Draw AR effect on a canvas overlay based on face detection results.
 */
export function drawAREffect(
  ctx: CanvasRenderingContext2D,
  faces: FaceDetectionResult[],
  effectId: AREffectId,
  canvasWidth: number,
  canvasHeight: number,
  time: number = 0
) {
  if (effectId === "none" || faces.length === 0) return;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (const face of faces) {
    const lm = face.landmarks;
    if (!lm || lm.length === 0) continue;

    switch (effectId) {
      case "face_mesh":
        drawFaceMesh(ctx, lm, canvasWidth, canvasHeight);
        break;
      case "beauty_glow":
        drawBeautyGlow(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "neon_outline":
        drawNeonOutline(ctx, lm, face, canvasWidth, canvasHeight, time);
        break;
      case "heart_eyes":
        drawHeartEyes(ctx, lm, face, canvasWidth, canvasHeight, time);
        break;
      case "crown":
        drawCrown(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "devil_horns":
        drawDevilHorns(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "butterfly":
        drawButterflies(ctx, lm, canvasWidth, canvasHeight, time);
        break;
      case "sparkles":
        drawSparkles(ctx, lm, canvasWidth, canvasHeight, time);
        break;
      case "sunglasses":
        drawSunglasses(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "cat_ears":
        drawCatEars(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "dog_nose":
        drawDogNose(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "angel_halo":
        drawAngelHalo(ctx, lm, face, canvasWidth, canvasHeight, time);
        break;
      case "face_paint":
        drawFacePaint(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "color_freckles":
        drawColorFreckles(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "makeup_lipstick":
        drawMakeupLipstick(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "makeup_blush":
        drawMakeupBlush(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "makeup_eyeshadow":
        drawMakeupEyeshadow(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "makeup_contour":
        drawMakeupContour(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      case "makeup_full":
        drawMakeupLipstick(ctx, lm, face, canvasWidth, canvasHeight);
        drawMakeupBlush(ctx, lm, face, canvasWidth, canvasHeight);
        drawMakeupEyeshadow(ctx, lm, face, canvasWidth, canvasHeight);
        drawMakeupContour(ctx, lm, face, canvasWidth, canvasHeight);
        break;
      // WebGL-accelerated makeup presets
      case "makeup_natural_glow":
        renderMakeup(ctx, face, "natural_glow", canvasWidth, canvasHeight);
        break;
      case "makeup_glam_night":
        renderMakeup(ctx, face, "glam_night", canvasWidth, canvasHeight);
        break;
      case "makeup_soft_pink":
        renderMakeup(ctx, face, "soft_pink", canvasWidth, canvasHeight);
        break;
      case "makeup_bold_red":
        renderMakeup(ctx, face, "bold_red", canvasWidth, canvasHeight);
        break;
      case "makeup_sunset_vibes":
        renderMakeup(ctx, face, "sunset_vibes", canvasWidth, canvasHeight);
        break;
      case "makeup_ice_queen":
        renderMakeup(ctx, face, "ice_queen", canvasWidth, canvasHeight);
        break;
    }
  }
}

// ── Drawing helpers ──

function toPixel(lm: FaceLandmark, w: number, h: number): [number, number] {
  return [lm.x * w, lm.y * h];
}

function drawFaceMesh(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], w: number, h: number) {
  ctx.strokeStyle = "rgba(0,255,180,0.4)";
  ctx.lineWidth = 0.5;
  // Draw triangulated mesh (simplified — connecting nearby points)
  for (let i = 0; i < lm.length; i++) {
    const [x, y] = toPixel(lm[i], w, h);
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,255,180,0.6)";
    ctx.fill();
  }
  // Connect face oval
  ctx.beginPath();
  ctx.strokeStyle = "rgba(0,255,200,0.6)";
  ctx.lineWidth = 1.5;
  FACE_OVAL.forEach((idx, i) => {
    const [x, y] = toPixel(lm[idx], w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
}

function drawBeautyGlow(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  const [cx, cy] = toPixel(lm[face.noseTip], w, h);
  const [fx, fy] = toPixel(lm[face.forehead], w, h);
  const [chx, chy] = toPixel(lm[face.chin], w, h);
  const faceHeight = Math.abs(chy - fy);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, faceHeight * 0.8);
  grad.addColorStop(0, "rgba(255,220,200,0.25)");
  grad.addColorStop(0.5, "rgba(255,200,180,0.12)");
  grad.addColorStop(1, "rgba(255,180,160,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawNeonOutline(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number, time: number) {
  const hue = (time * 60) % 360;
  ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.8)`;
  ctx.lineWidth = 3;
  ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.9)`;
  ctx.shadowBlur = 15;

  // Face oval
  ctx.beginPath();
  face.faceOval.forEach((idx, i) => {
    const [x, y] = toPixel(lm[idx], w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  // Eyes
  [face.leftEye, face.rightEye].forEach(eye => {
    ctx.beginPath();
    eye.forEach((idx, i) => {
      const [x, y] = toPixel(lm[idx], w, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  });

  // Lips
  ctx.strokeStyle = `hsla(${(hue + 120) % 360}, 100%, 60%, 0.7)`;
  ctx.beginPath();
  face.lips.forEach((idx, i) => {
    const [x, y] = toPixel(lm[idx], w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  ctx.shadowBlur = 0;
}

function drawHeartEyes(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number, time: number) {
  const scale = 1 + Math.sin(time * 3) * 0.1;
  [face.leftEye, face.rightEye].forEach(eye => {
    let cx = 0, cy = 0;
    eye.forEach(idx => { cx += lm[idx].x; cy += lm[idx].y; });
    cx = (cx / eye.length) * w;
    cy = (cy / eye.length) * h;
    const size = 20 * scale;
    ctx.font = `${size}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❤️", cx, cy);
  });
}

function drawCrown(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  const [fx, fy] = toPixel(lm[face.forehead], w, h);
  const [lx] = toPixel(lm[face.leftCheek], w, h);
  const [rx] = toPixel(lm[face.rightCheek], w, h);
  const faceWidth = Math.abs(rx - lx);
  const size = faceWidth * 0.8;
  ctx.font = `${size}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("👑", fx, fy - size * 0.15);
}

function drawDevilHorns(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  const [fx, fy] = toPixel(lm[face.forehead], w, h);
  const [lx] = toPixel(lm[face.leftCheek], w, h);
  const [rx] = toPixel(lm[face.rightCheek], w, h);
  const faceWidth = Math.abs(rx - lx);

  // Left horn
  ctx.fillStyle = "#cc0000";
  ctx.beginPath();
  ctx.moveTo(fx - faceWidth * 0.25, fy);
  ctx.lineTo(fx - faceWidth * 0.35, fy - faceWidth * 0.5);
  ctx.lineTo(fx - faceWidth * 0.15, fy);
  ctx.fill();

  // Right horn
  ctx.beginPath();
  ctx.moveTo(fx + faceWidth * 0.25, fy);
  ctx.lineTo(fx + faceWidth * 0.35, fy - faceWidth * 0.5);
  ctx.lineTo(fx + faceWidth * 0.15, fy);
  ctx.fill();
}

function drawButterflies(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], w: number, h: number, time: number) {
  const emojis = ["🦋"];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const angle = time * 0.5 + (i * Math.PI * 2 / count);
    const radius = 80 + Math.sin(time + i) * 20;
    const cx = lm[1].x * w + Math.cos(angle) * radius;
    const cy = lm[1].y * h + Math.sin(angle) * radius * 0.6 - 40;
    ctx.font = "24px serif";
    ctx.textAlign = "center";
    ctx.fillText(emojis[0], cx, cy);
  }
}

function drawSparkles(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], w: number, h: number, time: number) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = time * 0.8 + (i * Math.PI * 2 / count);
    const radius = 60 + Math.sin(time * 2 + i * 0.5) * 30;
    const cx = lm[1].x * w + Math.cos(angle) * radius;
    const cy = lm[1].y * h + Math.sin(angle) * radius * 0.7 - 20;
    const size = 8 + Math.sin(time * 3 + i) * 4;
    const alpha = 0.5 + Math.sin(time * 4 + i * 0.7) * 0.5;

    ctx.fillStyle = `hsla(${(i * 30 + time * 50) % 360}, 100%, 70%, ${alpha})`;
    drawStar(ctx, cx, cy, size, 4);
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, points: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.4;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSunglasses(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  const leftCenter = getCenter(lm, face.leftEye, w, h);
  const rightCenter = getCenter(lm, face.rightEye, w, h);
  const [nx, ny] = toPixel(lm[face.noseTip], w, h);
  const eyeDist = Math.sqrt((rightCenter[0] - leftCenter[0]) ** 2 + (rightCenter[1] - leftCenter[1]) ** 2);
  const lensR = eyeDist * 0.32;

  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.strokeStyle = "rgba(40,40,40,1)";
  ctx.lineWidth = 3;

  // Left lens
  roundedRect(ctx, leftCenter[0] - lensR, leftCenter[1] - lensR * 0.8, lensR * 2, lensR * 1.6, lensR * 0.3);
  ctx.fill();
  ctx.stroke();

  // Right lens
  roundedRect(ctx, rightCenter[0] - lensR, rightCenter[1] - lensR * 0.8, lensR * 2, lensR * 1.6, lensR * 0.3);
  ctx.fill();
  ctx.stroke();

  // Bridge
  ctx.beginPath();
  ctx.moveTo(leftCenter[0] + lensR, leftCenter[1]);
  ctx.quadraticCurveTo((leftCenter[0] + rightCenter[0]) / 2, ny - lensR * 0.3, rightCenter[0] - lensR, rightCenter[1]);
  ctx.lineWidth = 4;
  ctx.stroke();

  // Reflection
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.ellipse(leftCenter[0] - lensR * 0.3, leftCenter[1] - lensR * 0.3, lensR * 0.4, lensR * 0.25, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(rightCenter[0] - lensR * 0.3, rightCenter[1] - lensR * 0.3, lensR * 0.4, lensR * 0.25, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCatEars(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  const [fx, fy] = toPixel(lm[face.forehead], w, h);
  const [lx] = toPixel(lm[face.leftCheek], w, h);
  const [rx] = toPixel(lm[face.rightCheek], w, h);
  const faceWidth = Math.abs(rx - lx);
  const earH = faceWidth * 0.45;

  // Left ear
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(fx - faceWidth * 0.3, fy);
  ctx.lineTo(fx - faceWidth * 0.15, fy - earH);
  ctx.lineTo(fx, fy);
  ctx.fill();
  ctx.fillStyle = "#ffb6c1";
  ctx.beginPath();
  ctx.moveTo(fx - faceWidth * 0.25, fy);
  ctx.lineTo(fx - faceWidth * 0.17, fy - earH * 0.6);
  ctx.lineTo(fx - faceWidth * 0.05, fy);
  ctx.fill();

  // Right ear
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + faceWidth * 0.15, fy - earH);
  ctx.lineTo(fx + faceWidth * 0.3, fy);
  ctx.fill();
  ctx.fillStyle = "#ffb6c1";
  ctx.beginPath();
  ctx.moveTo(fx + faceWidth * 0.05, fy);
  ctx.lineTo(fx + faceWidth * 0.17, fy - earH * 0.6);
  ctx.lineTo(fx + faceWidth * 0.25, fy);
  ctx.fill();

  // Nose
  const [nx, ny] = toPixel(lm[face.noseTip], w, h);
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(nx, ny, 6, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  [-1, 1].forEach(side => {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(nx + side * 8, ny + i * 5);
      ctx.lineTo(nx + side * 45, ny + i * 8 - 3);
      ctx.stroke();
    }
  });
}

function drawDogNose(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  const [nx, ny] = toPixel(lm[face.noseTip], w, h);
  const [lx] = toPixel(lm[face.leftCheek], w, h);
  const [rx] = toPixel(lm[face.rightCheek], w, h);
  const faceWidth = Math.abs(rx - lx);

  // Big dog nose
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.ellipse(nx, ny + 5, faceWidth * 0.12, faceWidth * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nostrils
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(nx - 6, ny + 4, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(nx + 6, ny + 4, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tongue
  const lipCenter = getCenter(lm, face.lips, w, h);
  ctx.fillStyle = "#ff6b8a";
  ctx.beginPath();
  ctx.ellipse(lipCenter[0], lipCenter[1] + 15, 12, 20, 0, 0, Math.PI);
  ctx.fill();
}

function drawAngelHalo(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number, time: number) {
  const [fx, fy] = toPixel(lm[face.forehead], w, h);
  const [lx] = toPixel(lm[face.leftCheek], w, h);
  const [rx] = toPixel(lm[face.rightCheek], w, h);
  const faceWidth = Math.abs(rx - lx);

  const pulse = 1 + Math.sin(time * 2) * 0.05;
  const haloW = faceWidth * 0.5 * pulse;
  const haloH = haloW * 0.3;

  ctx.strokeStyle = "rgba(255,215,0,0.8)";
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(255,215,0,0.6)";
  ctx.shadowBlur = 20;

  ctx.beginPath();
  ctx.ellipse(fx, fy - faceWidth * 0.35, haloW, haloH, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,235,80,0.4)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(fx, fy - faceWidth * 0.35, haloW + 3, haloH + 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
}

function drawFacePaint(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  ctx.globalAlpha = 0.5;

  // War paint stripes on cheeks
  const [lcx, lcy] = toPixel(lm[face.leftCheek], w, h);
  const [rcx, rcy] = toPixel(lm[face.rightCheek], w, h);

  const colors = ["#ff3366", "#ffd700", "#00e676"];
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(lcx - 15, lcy - 10 + i * 10, 30, 6);
    ctx.fillRect(rcx - 15, rcy - 10 + i * 10, 30, 6);
  });

  // Forehead symbol
  const [fx, fy] = toPixel(lm[face.forehead], w, h);
  ctx.fillStyle = "#ff3366";
  drawStar(ctx, fx, fy + 10, 12, 5);

  ctx.globalAlpha = 1;
}

function drawColorFreckles(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  const [lcx, lcy] = toPixel(lm[face.leftCheek], w, h);
  const [rcx, rcy] = toPixel(lm[face.rightCheek], w, h);

  const colors = ["#ff6b8a", "#ffb347", "#87ceeb", "#dda0dd", "#98fb98", "#f0e68c"];
  const spread = 25;

  [
    [lcx, lcy],
    [rcx, rcy],
  ].forEach(([cx, cy]) => {
    for (let i = 0; i < 12; i++) {
      const x = cx + (Math.random() - 0.5) * spread * 2;
      const y = cy + (Math.random() - 0.5) * spread;
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, 2 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Nose freckles
  const [nx, ny] = toPixel(lm[face.noseTip], w, h);
  for (let i = 0; i < 5; i++) {
    const x = nx + (Math.random() - 0.5) * 15;
    const y = ny + (Math.random() - 0.5) * 10 - 5;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// ── Makeup Effects ──

function drawMakeupLipstick(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#cc2244";

  // Outer lip shape
  ctx.beginPath();
  const outerLips = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
  outerLips.forEach((idx, i) => {
    const [x, y] = toPixel(lm[idx], w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Inner lip (lower) for depth
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#991133";
  ctx.beginPath();
  const innerLips = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
  innerLips.forEach((idx, i) => {
    const [x, y] = toPixel(lm[idx], w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Highlight on upper lip
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#ff88aa";
  const [ulx, uly] = toPixel(lm[0], w, h); // Upper lip center
  ctx.beginPath();
  ctx.ellipse(ulx, uly, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMakeupBlush(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  ctx.save();
  const [lcx, lcy] = toPixel(lm[face.leftCheek], w, h);
  const [rcx, rcy] = toPixel(lm[face.rightCheek], w, h);
  const [lx] = toPixel(lm[face.leftCheek], w, h);
  const [rx] = toPixel(lm[face.rightCheek], w, h);
  const faceWidth = Math.abs(rx - lx);
  const blushR = faceWidth * 0.2;

  // Left cheek blush
  const gradL = ctx.createRadialGradient(lcx + 10, lcy - 5, 0, lcx + 10, lcy - 5, blushR);
  gradL.addColorStop(0, "rgba(255,100,120,0.35)");
  gradL.addColorStop(0.6, "rgba(255,130,150,0.15)");
  gradL.addColorStop(1, "rgba(255,150,170,0)");
  ctx.fillStyle = gradL;
  ctx.fillRect(lcx - blushR, lcy - blushR, blushR * 2, blushR * 2);

  // Right cheek blush
  const gradR = ctx.createRadialGradient(rcx - 10, rcy - 5, 0, rcx - 10, rcy - 5, blushR);
  gradR.addColorStop(0, "rgba(255,100,120,0.35)");
  gradR.addColorStop(0.6, "rgba(255,130,150,0.15)");
  gradR.addColorStop(1, "rgba(255,150,170,0)");
  ctx.fillStyle = gradR;
  ctx.fillRect(rcx - blushR, rcy - blushR, blushR * 2, blushR * 2);

  ctx.restore();
}

function drawMakeupEyeshadow(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  ctx.save();

  [face.leftEye, face.rightEye].forEach(eye => {
    const center = getCenter(lm, eye, w, h);
    // Calculate eye width
    const eyePoints = eye.map(idx => toPixel(lm[idx], w, h));
    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    eyePoints.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); });
    const eyeW = (maxX - minX) * 0.6;
    const eyeH = eyeW * 0.45;

    // Eyeshadow gradient — smoky purple
    const grad = ctx.createRadialGradient(center[0], minY - 2, 0, center[0], minY - 2, eyeW);
    grad.addColorStop(0, "rgba(100,50,150,0.4)");
    grad.addColorStop(0.4, "rgba(140,80,180,0.25)");
    grad.addColorStop(0.7, "rgba(180,120,200,0.1)");
    grad.addColorStop(1, "rgba(200,150,220,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(center[0], minY - 2, eyeW, eyeH, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Shimmer highlight
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "rgba(255,220,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(center[0], minY - eyeH * 0.3, eyeW * 0.3, eyeH * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Eyeliner
    ctx.strokeStyle = "rgba(30,20,40,0.5)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    eye.forEach((idx, i) => {
      const [x, y] = toPixel(lm[idx], w, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    // Cat-eye wing
    const outerCorner = toPixel(lm[eye[eye.length - 4]], w, h);
    ctx.beginPath();
    ctx.moveTo(outerCorner[0], outerCorner[1]);
    ctx.lineTo(outerCorner[0] + eyeW * 0.25, outerCorner[1] - eyeH * 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.restore();
}

function drawMakeupContour(ctx: CanvasRenderingContext2D, lm: FaceLandmark[], face: FaceDetectionResult, w: number, h: number) {
  ctx.save();

  const [fx, fy] = toPixel(lm[face.forehead], w, h);
  const [cx, cy] = toPixel(lm[face.chin], w, h);
  const [lcx, lcy] = toPixel(lm[face.leftCheek], w, h);
  const [rcx, rcy] = toPixel(lm[face.rightCheek], w, h);
  const [nx, ny] = toPixel(lm[face.noseTip], w, h);
  const faceWidth = Math.abs(rcx - lcx);
  const faceHeight = Math.abs(cy - fy);

  // Jawline contour — subtle shadow along face oval
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "rgba(120,80,50,0.4)";
  ctx.lineWidth = faceWidth * 0.06;
  ctx.beginPath();
  const jawPoints = [389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162];
  jawPoints.forEach((idx, i) => {
    const [x, y] = toPixel(lm[idx], w, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Nose contour — thin shadow lines along nose bridge
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "rgba(100,70,40,0.5)";
  ctx.lineWidth = 2;
  const noseBridge = [6, 197, 195, 5, 4, 1]; // nose bridge landmarks
  [-1, 1].forEach(side => {
    ctx.beginPath();
    noseBridge.forEach((idx, i) => {
      const [x, y] = toPixel(lm[idx], w, h);
      if (i === 0) ctx.moveTo(x + side * 6, y);
      else ctx.lineTo(x + side * 6, y);
    });
    ctx.stroke();
  });

  // Nose tip highlight
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "rgba(255,240,220,0.6)";
  ctx.beginPath();
  ctx.ellipse(nx, ny - 5, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Forehead highlight
  const forGrad = ctx.createRadialGradient(fx, fy + faceHeight * 0.08, 0, fx, fy + faceHeight * 0.08, faceWidth * 0.25);
  forGrad.addColorStop(0, "rgba(255,245,230,0.2)");
  forGrad.addColorStop(1, "rgba(255,245,230,0)");
  ctx.fillStyle = forGrad;
  ctx.fillRect(fx - faceWidth * 0.3, fy, faceWidth * 0.6, faceHeight * 0.15);

  ctx.restore();
}



function getCenter(lm: FaceLandmark[], indices: number[], w: number, h: number): [number, number] {
  let cx = 0, cy = 0;
  indices.forEach(idx => { cx += lm[idx].x; cy += lm[idx].y; });
  return [(cx / indices.length) * w, (cy / indices.length) * h];
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function isFaceDetectionAvailable(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
