// lib/ar/faceMeshUV.ts — Face Mesh triangulation + UV mapping
// MediaPipe Face Mesh provides 468 landmarks with canonical face model UVs.
// This module provides triangle indices and UV coordinates for texture mapping.

/**
 * Face mesh triangle indices for MediaPipe 468-landmark model.
 * Each group of 3 indices defines a triangle on the face surface.
 * These are the canonical MediaPipe Face Mesh TRIANGULATION indices (subset focused on key face regions).
 */

// ── LIPS region triangles (outer + inner lip mesh) ──
export const LIPS_TRIANGLES: number[] = [
  // Upper lip outer
  61, 185, 40, 40, 185, 39, 39, 185, 37, 37, 185, 267,
  267, 185, 269, 269, 185, 270, 270, 185, 409, 409, 185, 291,
  // Upper lip inner
  78, 191, 80, 80, 191, 81, 81, 191, 82, 82, 191, 13,
  13, 191, 312, 312, 191, 311, 311, 191, 310, 310, 191, 308,
  // Lower lip outer
  61, 146, 91, 91, 146, 181, 181, 146, 84, 84, 146, 17,
  17, 314, 405, 405, 314, 321, 321, 314, 375, 375, 314, 291,
  // Lower lip inner
  78, 95, 88, 88, 95, 178, 178, 95, 87, 87, 95, 14,
  14, 317, 402, 402, 317, 318, 318, 317, 324, 324, 317, 308,
  // Connection triangles
  61, 78, 191, 61, 191, 185, 291, 308, 317, 291, 317, 314,
  17, 84, 87, 17, 87, 14,
];

// ── LEFT EYE region triangles (eyelid + surrounding area) ──
export const LEFT_EYE_TRIANGLES: number[] = [
  // Upper eyelid
  33, 246, 161, 161, 246, 160, 160, 246, 159, 159, 246, 158,
  158, 246, 157, 157, 246, 173, 173, 246, 133,
  // Lower eyelid
  33, 7, 163, 163, 7, 144, 144, 7, 145, 145, 7, 153,
  153, 7, 154, 154, 7, 155, 155, 7, 133,
  // Eyeshadow area (above upper eyelid)
  70, 63, 105, 105, 63, 66, 66, 63, 107, 107, 63, 55,
  55, 63, 65, 65, 63, 52, 52, 63, 53,
  33, 161, 70, 70, 161, 105, 133, 173, 53, 53, 173, 52,
];

// ── RIGHT EYE region triangles ──
export const RIGHT_EYE_TRIANGLES: number[] = [
  // Upper eyelid
  263, 466, 388, 388, 466, 387, 387, 466, 386, 386, 466, 385,
  385, 466, 384, 384, 466, 398, 398, 466, 362,
  // Lower eyelid
  263, 249, 390, 390, 249, 373, 373, 249, 374, 374, 249, 380,
  380, 249, 381, 381, 249, 382, 382, 249, 362,
  // Eyeshadow area
  300, 293, 334, 334, 293, 296, 296, 293, 336, 336, 293, 285,
  285, 293, 295, 295, 293, 282, 282, 293, 283,
  263, 388, 300, 300, 388, 334, 362, 398, 283, 283, 398, 282,
];

// ── LEFT CHEEK triangles (blush zone) ──
export const LEFT_CHEEK_TRIANGLES: number[] = [
  // Cheekbone area
  116, 123, 50, 50, 123, 187, 187, 123, 205, 205, 123, 36,
  36, 123, 142, 142, 123, 203, 203, 123, 206,
  // Lower cheek
  187, 205, 206, 206, 205, 36, 50, 187, 118, 118, 187, 101,
  101, 187, 206, 116, 50, 117, 117, 50, 118,
];

// ── RIGHT CHEEK triangles ──
export const RIGHT_CHEEK_TRIANGLES: number[] = [
  345, 352, 280, 280, 352, 411, 411, 352, 425, 425, 352, 266,
  266, 352, 371, 371, 352, 423, 423, 352, 426,
  411, 425, 426, 426, 425, 266, 280, 411, 347, 347, 411, 330,
  330, 411, 426, 345, 280, 346, 346, 280, 347,
];

// ── NOSE triangles (contour + highlight) ──
export const NOSE_TRIANGLES: number[] = [
  // Bridge
  6, 122, 351, 122, 196, 197, 197, 196, 419, 419, 196, 351,
  6, 197, 122, 6, 419, 351,
  // Tip
  1, 2, 164, 164, 2, 0, 0, 2, 98, 98, 2, 327,
  // Nostrils
  48, 115, 220, 220, 115, 45, 275, 344, 440, 440, 344, 278,
];

// ── FOREHEAD triangles ──
export const FOREHEAD_TRIANGLES: number[] = [
  10, 338, 297, 10, 297, 332, 10, 332, 284,
  10, 67, 109, 10, 109, 103, 10, 103, 54,
  10, 21, 54, 10, 284, 251, 10, 251, 389,
  10, 338, 21,
];

// ── JAWLINE triangles (contour zone) ──
export const JAWLINE_TRIANGLES: number[] = [
  // Left jaw
  132, 93, 234, 234, 93, 127, 127, 93, 162, 162, 93, 58,
  58, 172, 136, 136, 172, 150, 150, 172, 149, 149, 172, 176,
  176, 148, 152,
  // Right jaw  
  361, 323, 454, 454, 323, 356, 356, 323, 389, 389, 323, 288,
  288, 397, 365, 365, 397, 379, 379, 397, 378, 378, 397, 400,
  400, 377, 152,
];

/**
 * Generate UV coordinates for a set of face landmarks.
 * Maps the 3D face landmarks to a 2D texture space [0,1]x[0,1].
 * Uses the bounding box of the region to normalize coords.
 */
export function computeRegionUVs(
  landmarks: { x: number; y: number }[],
  triangleIndices: number[],
  canvasWidth: number,
  canvasHeight: number
): { positions: Float32Array; uvs: Float32Array; indices: Uint16Array } {
  // Collect unique vertex indices
  const uniqueIndices = Array.from(new Set(triangleIndices));
  const indexMap = new Map<number, number>();
  uniqueIndices.forEach((idx, i) => indexMap.set(idx, i));

  // Compute bounding box of the region for UV normalization
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  uniqueIndices.forEach(idx => {
    if (idx >= landmarks.length) return;
    const lm = landmarks[idx];
    minX = Math.min(minX, lm.x);
    maxX = Math.max(maxX, lm.x);
    minY = Math.min(minY, lm.y);
    maxY = Math.max(maxY, lm.y);
  });

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Build position + UV arrays
  const positions = new Float32Array(uniqueIndices.length * 2);
  const uvs = new Float32Array(uniqueIndices.length * 2);

  uniqueIndices.forEach((idx, i) => {
    if (idx >= landmarks.length) return;
    const lm = landmarks[idx];
    // Position in clip space [-1, 1]
    positions[i * 2] = (lm.x / canvasWidth) * 2 - 1;
    positions[i * 2 + 1] = 1 - (lm.y / canvasHeight) * 2;
    // UV in [0, 1] — normalized within region bounding box
    uvs[i * 2] = (lm.x - minX) / rangeX;
    uvs[i * 2 + 1] = (lm.y - minY) / rangeY;
  });

  // Remap triangle indices
  const remappedIndices = new Uint16Array(triangleIndices.length);
  triangleIndices.forEach((origIdx, i) => {
    remappedIndices[i] = indexMap.get(origIdx) ?? 0;
  });

  return { positions, uvs, indices: remappedIndices };
}

/**
 * Convert normalized MediaPipe landmarks (0-1) to pixel coordinates.
 */
export function landmarksToPixels(
  landmarks: { x: number; y: number; z: number }[],
  width: number,
  height: number
): { x: number; y: number }[] {
  return landmarks.map(lm => ({
    x: lm.x * width,
    y: lm.y * height,
  }));
}

/**
 * Canonical UV coordinates for the MediaPipe face mesh.
 * These map face landmarks to a standardized UV space for texture lookup.
 * Key regions are mapped to specific UV rectangles:
 * - Lips:     U [0.3, 0.7],  V [0.65, 0.85]
 * - Left eye: U [0.15, 0.45], V [0.3, 0.5]
 * - Right eye: U [0.55, 0.85], V [0.3, 0.5]
 * - Cheeks:   U [0.05, 0.95], V [0.45, 0.7]
 * - Nose:     U [0.35, 0.65], V [0.4, 0.65]
 * - Forehead: U [0.15, 0.85], V [0.0, 0.25]
 */
export const MAKEUP_UV_REGIONS = {
  lips: { uMin: 0.3, uMax: 0.7, vMin: 0.65, vMax: 0.85 },
  leftEye: { uMin: 0.15, uMax: 0.45, vMin: 0.3, vMax: 0.5 },
  rightEye: { uMin: 0.55, uMax: 0.85, vMin: 0.3, vMax: 0.5 },
  leftCheek: { uMin: 0.05, uMax: 0.35, vMin: 0.45, vMax: 0.7 },
  rightCheek: { uMin: 0.65, uMax: 0.95, vMin: 0.45, vMax: 0.7 },
  nose: { uMin: 0.35, uMax: 0.65, vMin: 0.4, vMax: 0.65 },
  forehead: { uMin: 0.15, uMax: 0.85, vMin: 0.0, vMax: 0.25 },
  jawline: { uMin: 0.0, uMax: 1.0, vMin: 0.7, vMax: 1.0 },
} as const;
