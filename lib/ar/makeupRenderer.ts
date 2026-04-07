// lib/ar/makeupRenderer.ts — WebGL-accelerated makeup rendering pipeline
// Maps textures onto face mesh triangles using UV coordinates.
// Falls back to Canvas 2D on devices without WebGL support.

import type { FaceDetectionResult } from "./faceDetection";
import {
    JAWLINE_TRIANGLES,
    LEFT_CHEEK_TRIANGLES,
    LEFT_EYE_TRIANGLES,
    LIPS_TRIANGLES,
    NOSE_TRIANGLES,
    RIGHT_CHEEK_TRIANGLES,
    RIGHT_EYE_TRIANGLES,
    landmarksToPixels,
} from "./faceMeshUV";
import {
    type MakeupPreset,
    MAKEUP_PRESETS,
    generateBlushTexture,
    generateContourTexture,
    generateEyeshadowTexture,
    generateLipstickTexture,
    getCachedTexture,
} from "./makeupTextures";

// ── WebGL Shader Sources ──

const VERT_SRC = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;
  uniform vec2 uResolution;

  void main() {
    // Convert pixel coords to clip space
    vec2 clipPos = (aPosition / uResolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y; // Flip Y for WebGL
    gl_Position = vec4(clipPos, 0.0, 1.0);
    vTexCoord = aTexCoord;
  }
`;

const FRAG_SRC = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D uTexture;
  uniform float uOpacity;

  void main() {
    vec4 texColor = texture2D(uTexture, vTexCoord);
    gl_FragColor = vec4(texColor.rgb, texColor.a * uOpacity);
  }
`;

// ── Types ──

type MakeupRegion = {
  triangleIndices: number[];
  texture: HTMLCanvasElement;
  opacity: number;
  blendMode: "normal" | "multiply" | "screen" | "overlay";
};

// ── WebGL Makeup Renderer ──

let glCanvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let positionBuffer: WebGLBuffer | null = null;
let texCoordBuffer: WebGLBuffer | null = null;
let indexBuffer: WebGLBuffer | null = null;
let isInitialized = false;

function initWebGL(width: number, height: number): boolean {
  if (isInitialized && gl && glCanvas) {
    if (glCanvas.width !== width || glCanvas.height !== height) {
      glCanvas.width = width;
      glCanvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    return true;
  }

  try {
    glCanvas = document.createElement("canvas");
    glCanvas.width = width;
    glCanvas.height = height;

    gl = glCanvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });

    if (!gl) return false;

    // Compile shaders
    const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vertShader || !fragShader) return false;

    program = gl.createProgram()!;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Makeup WebGL program link failed:", gl.getProgramInfoLog(program));
      return false;
    }

    positionBuffer = gl.createBuffer();
    texCoordBuffer = gl.createBuffer();
    indexBuffer = gl.createBuffer();

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    isInitialized = true;
    return true;
  } catch (err) {
    console.warn("WebGL makeup init failed:", err);
    return false;
  }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createTextureFromCanvas(glCtx: WebGLRenderingContext, canvas: HTMLCanvasElement): WebGLTexture | null {
  const tex = glCtx.createTexture();
  if (!tex) return null;
  glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
  glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, canvas);
  return tex;
}

/**
 * Render a single makeup region using WebGL.
 */
function renderRegion(
  glCtx: WebGLRenderingContext,
  prog: WebGLProgram,
  landmarks: { x: number; y: number }[],
  triangleIndices: number[],
  texture: HTMLCanvasElement,
  opacity: number,
  canvasWidth: number,
  canvasHeight: number
) {
  // Collect unique vertices and compute bounding box for UVs
  const uniqueSet = new Set(triangleIndices);
  const uniqueArr = Array.from(uniqueSet);
  const indexMap = new Map<number, number>();
  uniqueArr.forEach((idx, i) => indexMap.set(idx, i));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  uniqueArr.forEach(idx => {
    if (idx < landmarks.length) {
      const lm = landmarks[idx];
      minX = Math.min(minX, lm.x);
      maxX = Math.max(maxX, lm.x);
      minY = Math.min(minY, lm.y);
      maxY = Math.max(maxY, lm.y);
    }
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Build vertex data
  const positions = new Float32Array(uniqueArr.length * 2);
  const texCoords = new Float32Array(uniqueArr.length * 2);

  uniqueArr.forEach((idx, i) => {
    if (idx < landmarks.length) {
      const lm = landmarks[idx];
      positions[i * 2] = lm.x;
      positions[i * 2 + 1] = lm.y;
      texCoords[i * 2] = (lm.x - minX) / rangeX;
      texCoords[i * 2 + 1] = (lm.y - minY) / rangeY;
    }
  });

  const indices = new Uint16Array(triangleIndices.map(idx => indexMap.get(idx) ?? 0));

  // Upload position data
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, positionBuffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, positions, glCtx.DYNAMIC_DRAW);
  const posLoc = glCtx.getAttribLocation(prog, "aPosition");
  glCtx.enableVertexAttribArray(posLoc);
  glCtx.vertexAttribPointer(posLoc, 2, glCtx.FLOAT, false, 0, 0);

  // Upload texture coordinate data
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, texCoordBuffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, texCoords, glCtx.DYNAMIC_DRAW);
  const texLoc = glCtx.getAttribLocation(prog, "aTexCoord");
  glCtx.enableVertexAttribArray(texLoc);
  glCtx.vertexAttribPointer(texLoc, 2, glCtx.FLOAT, false, 0, 0);

  // Upload index data
  glCtx.bindBuffer(glCtx.ELEMENT_ARRAY_BUFFER, indexBuffer);
  glCtx.bufferData(glCtx.ELEMENT_ARRAY_BUFFER, indices, glCtx.DYNAMIC_DRAW);

  // Upload texture
  const tex = createTextureFromCanvas(glCtx, texture);
  if (!tex) return;
  glCtx.activeTexture(glCtx.TEXTURE0);
  glCtx.bindTexture(glCtx.TEXTURE_2D, tex);

  // Set uniforms
  glCtx.uniform1i(glCtx.getUniformLocation(prog, "uTexture"), 0);
  glCtx.uniform1f(glCtx.getUniformLocation(prog, "uOpacity"), opacity);
  glCtx.uniform2f(glCtx.getUniformLocation(prog, "uResolution"), canvasWidth, canvasHeight);

  // Draw
  glCtx.drawElements(glCtx.TRIANGLES, indices.length, glCtx.UNSIGNED_SHORT, 0);

  // Cleanup texture
  glCtx.deleteTexture(tex);
}

// ── Canvas 2D Fallback ──

/**
 * Render makeup region using Canvas 2D — used when WebGL is unavailable.
 */
function renderRegionCanvas2D(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  triangleIndices: number[],
  texture: HTMLCanvasElement,
  opacity: number
) {
  ctx.save();
  ctx.globalAlpha = opacity;

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const uniqueIndices = new Set(triangleIndices);
  uniqueIndices.forEach(idx => {
    if (idx < landmarks.length) {
      minX = Math.min(minX, landmarks[idx].x);
      maxX = Math.max(maxX, landmarks[idx].x);
      minY = Math.min(minY, landmarks[idx].y);
      maxY = Math.max(maxY, landmarks[idx].y);
    }
  });
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  // Create clip path from triangles
  ctx.beginPath();
  for (let i = 0; i < triangleIndices.length; i += 3) {
    const i0 = triangleIndices[i];
    const i1 = triangleIndices[i + 1];
    const i2 = triangleIndices[i + 2];
    if (i0 >= landmarks.length || i1 >= landmarks.length || i2 >= landmarks.length) continue;
    ctx.moveTo(landmarks[i0].x, landmarks[i0].y);
    ctx.lineTo(landmarks[i1].x, landmarks[i1].y);
    ctx.lineTo(landmarks[i2].x, landmarks[i2].y);
    ctx.closePath();
  }
  ctx.clip();

  // Draw texture stretched to bounding box
  ctx.drawImage(texture, minX, minY, w, h);

  ctx.restore();
}

// ── Public API ──

/**
 * Render full makeup for a face using WebGL (with Canvas 2D fallback).
 * This is the main entry point called from FaceAROverlay / faceDetection.
 *
 * @param outputCtx - The 2D context of the overlay canvas
 * @param face - Face detection result with landmarks
 * @param presetId - Makeup preset ID
 * @param canvasWidth - Overlay canvas width
 * @param canvasHeight - Overlay canvas height
 */
export function renderMakeup(
  outputCtx: CanvasRenderingContext2D,
  face: FaceDetectionResult,
  presetId: string,
  canvasWidth: number,
  canvasHeight: number
) {
  const preset = MAKEUP_PRESETS.find(p => p.id === presetId) ?? MAKEUP_PRESETS[0];
  const pixelLandmarks = landmarksToPixels(face.landmarks, canvasWidth, canvasHeight);

  // Try WebGL first
  const useWebGL = initWebGL(canvasWidth, canvasHeight);

  if (useWebGL && gl && glCanvas && program) {
    gl.useProgram(program);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Render each makeup region
    const regions = buildRegions(preset, pixelLandmarks);
    for (const region of regions) {
      renderRegion(
        gl, program, pixelLandmarks,
        region.triangleIndices, region.texture,
        region.opacity, canvasWidth, canvasHeight
      );
    }

    // Copy WebGL result to the output canvas
    outputCtx.drawImage(glCanvas, 0, 0);
  } else {
    // Canvas 2D fallback
    const regions = buildRegions(preset, pixelLandmarks);
    for (const region of regions) {
      renderRegionCanvas2D(
        outputCtx, pixelLandmarks,
        region.triangleIndices, region.texture, region.opacity
      );
    }
  }
}

/**
 * Build all makeup regions for a preset.
 */
function buildRegions(preset: MakeupPreset, _landmarks: { x: number; y: number }[]): MakeupRegion[] {
  const regions: MakeupRegion[] = [];

  // Lipstick
  if (preset.lipstick.opacity > 0) {
    regions.push({
      triangleIndices: LIPS_TRIANGLES,
      texture: getCachedTexture(preset.id, "lips", () => generateLipstickTexture(preset.lipstick)),
      opacity: preset.lipstick.opacity,
      blendMode: "normal",
    });
  }

  // Eyeshadow (both eyes)
  if (preset.eyeshadow.intensity > 0) {
    const eyeTex = getCachedTexture(preset.id, "eyeshadow", () => generateEyeshadowTexture(preset.eyeshadow));
    regions.push({
      triangleIndices: LEFT_EYE_TRIANGLES,
      texture: eyeTex,
      opacity: preset.eyeshadow.intensity,
      blendMode: "multiply",
    });
    regions.push({
      triangleIndices: RIGHT_EYE_TRIANGLES,
      texture: eyeTex,
      opacity: preset.eyeshadow.intensity,
      blendMode: "multiply",
    });
  }

  // Blush (both cheeks)
  if (preset.blush.intensity > 0) {
    const blushTex = getCachedTexture(preset.id, "blush", () => generateBlushTexture(preset.blush));
    regions.push({
      triangleIndices: LEFT_CHEEK_TRIANGLES,
      texture: blushTex,
      opacity: preset.blush.intensity,
      blendMode: "screen",
    });
    regions.push({
      triangleIndices: RIGHT_CHEEK_TRIANGLES,
      texture: blushTex,
      opacity: preset.blush.intensity,
      blendMode: "screen",
    });
  }

  // Contour (jawline + nose)
  if (preset.contour.intensity > 0) {
    const contourTex = getCachedTexture(preset.id, "contour", () => generateContourTexture(preset.contour));
    regions.push({
      triangleIndices: JAWLINE_TRIANGLES,
      texture: contourTex,
      opacity: preset.contour.intensity * 0.7,
      blendMode: "multiply",
    });
    regions.push({
      triangleIndices: NOSE_TRIANGLES,
      texture: contourTex,
      opacity: preset.contour.intensity * 0.5,
      blendMode: "multiply",
    });
  }

  return regions;
}

/**
 * Get available makeup presets.
 */
export function getMakeupPresets(): MakeupPreset[] {
  return MAKEUP_PRESETS;
}

/**
 * Check if WebGL is available for makeup rendering.
 */
export function isMakeupWebGLAvailable(): boolean {
  try {
    const testCanvas = document.createElement("canvas");
    const testGl = testCanvas.getContext("webgl");
    return !!testGl;
  } catch {
    return false;
  }
}

/**
 * Cleanup WebGL resources.
 */
export function disposeMakeupRenderer() {
  if (gl && program) {
    gl.deleteProgram(program);
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    if (texCoordBuffer) gl.deleteBuffer(texCoordBuffer);
    if (indexBuffer) gl.deleteBuffer(indexBuffer);
  }
  gl = null;
  glCanvas = null;
  program = null;
  isInitialized = false;
}
