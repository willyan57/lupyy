export const VERT = `precision mediump float;
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FRAG = `precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uLut;
uniform float uIntensity;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uSmoothing;
uniform float uWhitenTeeth;
uniform float uBaseGlow;

vec3 applyLut2D(vec3 color) {
  float size = 64.0;
  float grid = 8.0;
  float tile = 1.0 / grid;
  float slice = color.b * (size - 1.0);
  float slice0 = floor(slice);
  float slice1 = min(slice0 + 1.0, size - 1.0);
  float z = fract(slice);
  float x0 = mod(slice0, grid);
  float y0 = floor(slice0 / grid);
  float x1 = mod(slice1, grid);
  float y1 = floor(slice1 / grid);
  vec2 uv0 = vec2(x0, y0) * tile + vec2(color.r, color.g) * tile;
  vec2 uv1 = vec2(x1, y1) * tile + vec2(color.r, color.g) * tile;
  vec3 c0 = texture2D(uLut, uv0).rgb;
  vec3 c1 = texture2D(uLut, uv1).rgb;
  return mix(c0, c1, z);
}

vec3 sampleSmoothed(vec2 uv, float radius) {
  vec2 texSize = vec2(textureSize(uImage, 0));
  vec2 step = radius / max(texSize, vec2(512.0));
  vec3 sum = vec3(0.0);
  float count = 0.0;
  for (float dx = -2.0; dx <= 2.0; dx += 1.0) {
    for (float dy = -2.0; dy <= 2.0; dy += 1.0) {
      vec2 offset = vec2(dx, dy) * step;
      sum += texture2D(uImage, uv + offset).rgb;
      count += 1.0;
    }
  }
  return sum / count;
}

void main() {
  vec4 src = texture2D(uImage, vUv);
  vec3 color = src.rgb;

  if (uSmoothing > 0.01) {
    vec3 smoothed = sampleSmoothed(vUv, uSmoothing * 3.0);
    color = mix(color, smoothed, uSmoothing * 0.7);
  }

  color += uBrightness;
  color = (color - 0.5) * uContrast + 0.5;

  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luminance), color, uSaturation);

  if (uWhitenTeeth > 0.01) {
    float yellowish = max(0.0, color.r + color.g - 2.0 * color.b) * 0.25;
    float skinLike = step(0.15, color.r) * step(color.r, 0.95);
    float whitenAmount = yellowish * skinLike * uWhitenTeeth;
    color.b += whitenAmount * 0.15;
    color = mix(color, vec3(luminance + 0.05), whitenAmount * 0.3);
  }

  if (uBaseGlow > 0.01) {
    float glowAmount = uBaseGlow * 0.12;
    color += glowAmount;
    color = mix(color, smoothstep(0.0, 1.0, color), uBaseGlow * 0.3);
  }

  color = clamp(color, 0.0, 1.0);

  vec3 lutColor = applyLut2D(color);
  vec3 finalColor = mix(color, lutColor, uIntensity);

  gl_FragColor = vec4(finalColor, src.a);
}`;

export const FRAG_COMPAT = `precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uLut;
uniform float uIntensity;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uSmoothing;
uniform float uWhitenTeeth;
uniform float uBaseGlow;

vec3 applyLut2D(vec3 color) {
  float size = 64.0;
  float grid = 8.0;
  float tile = 1.0 / grid;
  float slice = color.b * (size - 1.0);
  float slice0 = floor(slice);
  float slice1 = min(slice0 + 1.0, size - 1.0);
  float z = fract(slice);
  float x0 = mod(slice0, grid);
  float y0 = floor(slice0 / grid);
  float x1 = mod(slice1, grid);
  float y1 = floor(slice1 / grid);
  vec2 uv0 = vec2(x0, y0) * tile + vec2(color.r, color.g) * tile;
  vec2 uv1 = vec2(x1, y1) * tile + vec2(color.r, color.g) * tile;
  vec3 c0 = texture2D(uLut, uv0).rgb;
  vec3 c1 = texture2D(uLut, uv1).rgb;
  return mix(c0, c1, z);
}

void main() {
  vec4 src = texture2D(uImage, vUv);
  vec3 color = src.rgb;

  if (uSmoothing > 0.01) {
    vec2 step = vec2(uSmoothing * 3.0 / 512.0);
    vec3 sum = vec3(0.0);
    float count = 0.0;
    for (float dx = -2.0; dx <= 2.0; dx += 1.0) {
      for (float dy = -2.0; dy <= 2.0; dy += 1.0) {
        sum += texture2D(uImage, vUv + vec2(dx, dy) * step).rgb;
        count += 1.0;
      }
    }
    vec3 smoothed = sum / count;
    color = mix(color, smoothed, uSmoothing * 0.7);
  }

  color += uBrightness;
  color = (color - 0.5) * uContrast + 0.5;

  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luminance), color, uSaturation);

  if (uWhitenTeeth > 0.01) {
    float yellowish = max(0.0, color.r + color.g - 2.0 * color.b) * 0.25;
    float skinLike = step(0.15, color.r) * step(color.r, 0.95);
    float whitenAmount = yellowish * skinLike * uWhitenTeeth;
    color.b += whitenAmount * 0.15;
    color = mix(color, vec3(luminance + 0.05), whitenAmount * 0.3);
  }

  if (uBaseGlow > 0.01) {
    float glowAmount = uBaseGlow * 0.12;
    color += glowAmount;
    color = mix(color, smoothstep(0.0, 1.0, color), uBaseGlow * 0.3);
  }

  color = clamp(color, 0.0, 1.0);

  vec3 lutColor = applyLut2D(color);
  vec3 finalColor = mix(color, lutColor, uIntensity);

  gl_FragColor = vec4(finalColor, src.a);
}`;
