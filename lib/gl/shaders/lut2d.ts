export const VERT = `precision mediump float;
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export const FRAG = `precision mediump float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uLut;
uniform float uIntensity;

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
  vec3 lut = applyLut2D(src.rgb);
  vec3 outc = mix(src.rgb, lut, uIntensity);
  gl_FragColor = vec4(outc, src.a);
}`