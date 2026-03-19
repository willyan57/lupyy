export const VERT = `precision mediump float;
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vec2 uv = (aPos + 1.0) * 0.5;
  vUv = vec2(uv.x, 1.0 - uv.y);
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
uniform float uSharpness;
uniform float uTemperature;
uniform float uVignette;
uniform float uGrain;
uniform float uFade;
uniform float uHighlights;
uniform float uShadows;

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

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 src = texture2D(uImage, vUv);
  vec3 color = src.rgb;

  // Smoothing (skin softening)
  if (uSmoothing > 0.01) {
    vec3 smoothed = sampleSmoothed(vUv, uSmoothing * 3.0);
    color = mix(color, smoothed, uSmoothing * 0.7);
  }

  // Sharpness (unsharp mask)
  if (uSharpness > 0.01) {
    vec3 blurred = sampleSmoothed(vUv, 1.5);
    vec3 sharp = color + (color - blurred) * uSharpness * 2.0;
    color = clamp(sharp, 0.0, 1.0);
  }

  // Brightness
  color += uBrightness;

  // Contrast
  color = (color - 0.5) * uContrast + 0.5;

  // Highlights & Shadows
  if (abs(uHighlights) > 0.01 || abs(uShadows) > 0.01) {
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    float highlightMask = smoothstep(0.5, 1.0, lum);
    float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
    color += uHighlights * highlightMask * 0.4;
    color += uShadows * shadowMask * 0.4;
  }

  // Saturation
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luminance), color, uSaturation);

  // Temperature (warm/cool shift)
  if (abs(uTemperature) > 0.01) {
    color.r += uTemperature * 0.18;
    color.b -= uTemperature * 0.18;
    color.g += uTemperature * 0.06;
  }

  // Fade (lift blacks)
  if (uFade > 0.01) {
    color = mix(color, color + vec3(uFade * 0.35), 1.0 - smoothstep(0.0, 0.3, luminance));
    color = max(color, vec3(uFade * 0.2));
  }

  // Whiten teeth
  if (uWhitenTeeth > 0.01) {
    float yellowish = max(0.0, color.r + color.g - 2.0 * color.b) * 0.25;
    float skinLike = step(0.15, color.r) * step(color.r, 0.95);
    float whitenAmount = yellowish * skinLike * uWhitenTeeth;
    color.b += whitenAmount * 0.15;
    color = mix(color, vec3(luminance + 0.05), whitenAmount * 0.3);
  }

  // Base glow
  if (uBaseGlow > 0.01) {
    float glowAmount = uBaseGlow * 0.12;
    color += glowAmount;
    color = mix(color, smoothstep(0.0, 1.0, color), uBaseGlow * 0.3);
  }

  // Vignette (shader-based, much smoother than overlay)
  if (uVignette > 0.01) {
    vec2 center = vUv - 0.5;
    float dist = length(center) * 1.414;
    float vig = smoothstep(0.4, 1.2, dist);
    color *= 1.0 - vig * uVignette * 0.85;
  }

  // Film grain
  if (uGrain > 0.01) {
    float noise = rand(vUv * 800.0 + fract(uGrain * 100.0)) - 0.5;
    color += noise * uGrain * 0.35;
  }

  color = clamp(color, 0.0, 1.0);

  // LUT
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
uniform float uSharpness;
uniform float uTemperature;
uniform float uVignette;
uniform float uGrain;
uniform float uFade;
uniform float uHighlights;
uniform float uShadows;

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

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 src = texture2D(uImage, vUv);
  vec3 color = src.rgb;

  // Smoothing
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

  // Sharpness
  if (uSharpness > 0.01) {
    vec2 step = vec2(1.5 / 512.0);
    vec3 blurSum = vec3(0.0);
    float blurCount = 0.0;
    for (float dx = -2.0; dx <= 2.0; dx += 1.0) {
      for (float dy = -2.0; dy <= 2.0; dy += 1.0) {
        blurSum += texture2D(uImage, vUv + vec2(dx, dy) * step).rgb;
        blurCount += 1.0;
      }
    }
    vec3 blurred = blurSum / blurCount;
    vec3 sharp = color + (color - blurred) * uSharpness * 2.0;
    color = clamp(sharp, 0.0, 1.0);
  }

  // Brightness
  color += uBrightness;

  // Contrast
  color = (color - 0.5) * uContrast + 0.5;

  // Highlights & Shadows
  if (abs(uHighlights) > 0.01 || abs(uShadows) > 0.01) {
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    float highlightMask = smoothstep(0.5, 1.0, lum);
    float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
    color += uHighlights * highlightMask * 0.4;
    color += uShadows * shadowMask * 0.4;
  }

  // Saturation
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luminance), color, uSaturation);

  // Temperature
  if (abs(uTemperature) > 0.01) {
    color.r += uTemperature * 0.18;
    color.b -= uTemperature * 0.18;
    color.g += uTemperature * 0.06;
  }

  // Fade
  if (uFade > 0.01) {
    color = mix(color, color + vec3(uFade * 0.35), 1.0 - smoothstep(0.0, 0.3, luminance));
    color = max(color, vec3(uFade * 0.2));
  }

  // Whiten teeth
  if (uWhitenTeeth > 0.01) {
    float yellowish = max(0.0, color.r + color.g - 2.0 * color.b) * 0.25;
    float skinLike = step(0.15, color.r) * step(color.r, 0.95);
    float whitenAmount = yellowish * skinLike * uWhitenTeeth;
    color.b += whitenAmount * 0.15;
    color = mix(color, vec3(luminance + 0.05), whitenAmount * 0.3);
  }

  // Base glow
  if (uBaseGlow > 0.01) {
    float glowAmount = uBaseGlow * 0.12;
    color += glowAmount;
    color = mix(color, smoothstep(0.0, 1.0, color), uBaseGlow * 0.3);
  }

  // Vignette
  if (uVignette > 0.01) {
    vec2 center = vUv - 0.5;
    float dist = length(center) * 1.414;
    float vig = smoothstep(0.4, 1.2, dist);
    color *= 1.0 - vig * uVignette * 0.85;
  }

  // Film grain
  if (uGrain > 0.01) {
    float noise = rand(vUv * 800.0 + fract(uGrain * 100.0)) - 0.5;
    color += noise * uGrain * 0.35;
  }

  color = clamp(color, 0.0, 1.0);

  vec3 lutColor = applyLut2D(color);
  vec3 finalColor = mix(color, lutColor, uIntensity);

  gl_FragColor = vec4(finalColor, src.a);
}`;
