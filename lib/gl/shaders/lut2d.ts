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
uniform float uHasLut;
uniform float uIntensity;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uSmoothing;
uniform float uWarmth;
uniform vec3 uTintColor;
uniform float uTintStrength;

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

vec3 applySmoothing(vec2 uv, float radius) {
  vec2 px = vec2(radius / 512.0, radius / 512.0);
  vec3 center = texture2D(uImage, uv).rgb;
  vec3 accum = center * 4.0;
  accum += texture2D(uImage, uv + vec2(px.x, 0.0)).rgb;
  accum += texture2D(uImage, uv - vec2(px.x, 0.0)).rgb;
  accum += texture2D(uImage, uv + vec2(0.0, px.y)).rgb;
  accum += texture2D(uImage, uv - vec2(0.0, px.y)).rgb;
  accum += texture2D(uImage, uv + px).rgb;
  accum += texture2D(uImage, uv - px).rgb;
  accum += texture2D(uImage, uv + vec2(px.x, -px.y)).rgb;
  accum += texture2D(uImage, uv + vec2(-px.x, px.y)).rgb;
  return accum / 12.0;
}

void main() {
  vec4 src = texture2D(uImage, vUv);
  vec3 color = src.rgb;

  if (uSmoothing > 0.001) {
    vec3 smoothColor = applySmoothing(vUv, max(1.0, uSmoothing * 6.0));
    color = mix(color, smoothColor, clamp(uSmoothing, 0.0, 1.0));
  }

  color += uBrightness;
  color = (color - 0.5) * uContrast + 0.5;

  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gray), color, max(uSaturation, 0.0));

  color.r += uWarmth * 0.08;
  color.b -= uWarmth * 0.05;
  color = mix(color, uTintColor, clamp(uTintStrength, 0.0, 1.0));
  color = clamp(color, 0.0, 1.0);

  if (uHasLut > 0.5) {
    vec3 lut = applyLut2D(color);
    color = mix(color, lut, clamp(uIntensity, 0.0, 1.0));
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), src.a);
}`;
