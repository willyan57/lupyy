import { Asset } from "expo-asset";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type LutSource = number | string | null;

type LutRendererProps = {
  sourceUri: string;
  lut: LutSource;
  intensity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  smoothing?: number;
  warmth?: number;
  tintColor?: [number, number, number];
  tintStrength?: number;
  style?: StyleProp<ViewStyle>;
  onReady?: () => void;
};

const compileShader = (gl: ExpoWebGLRenderingContext, type: number, src: string) => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return shader;
};

const loadAsset = async (src: number | string) => {
  const asset = typeof src === "number" ? Asset.fromModule(src) : Asset.fromURI(src);
  if (!asset.downloaded) {
    await asset.downloadAsync();
  }
  return asset;
};

const makeTex = (gl: ExpoWebGLRenderingContext, unit: number, asset: Asset) => {
  const tex = gl.createTexture();
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as any);
  return tex;
};

export default function LutRenderer({
  sourceUri,
  lut,
  intensity = 1,
  brightness = 0,
  contrast = 1,
  saturation = 1,
  smoothing = 0,
  warmth = 0,
  tintColor = [1, 1, 1],
  tintStrength = 0,
  style,
  onReady,
}: LutRendererProps) {
  const key = useMemo(
    () =>
      JSON.stringify({
        sourceUri,
        lut,
        intensity,
        brightness,
        contrast,
        saturation,
        smoothing,
        warmth,
        tintColor,
        tintStrength,
      }),
    [sourceUri, lut, intensity, brightness, contrast, saturation, smoothing, warmth, tintColor, tintStrength]
  );

  return (
    <GLView
      key={key}
      style={style}
      onContextCreate={async (gl: ExpoWebGLRenderingContext) => {
        try {
          const { VERT, FRAG } = await import("./shaders/lut2d");
          const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
          const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
          const program = gl.createProgram()!;
          gl.attachShader(program, vs);
          gl.attachShader(program, fs);
          gl.linkProgram(program);
          gl.useProgram(program);

          const quad = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, quad);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

          const aPos = gl.getAttribLocation(program, "aPos");
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          const sourceAsset = await loadAsset(sourceUri);
          makeTex(gl, gl.TEXTURE0, sourceAsset);
          gl.uniform1i(gl.getUniformLocation(program, "uImage"), 0);

          if (lut) {
            const lutAsset = await loadAsset(lut);
            makeTex(gl, gl.TEXTURE1, lutAsset);
            gl.uniform1i(gl.getUniformLocation(program, "uLut"), 1);
            gl.uniform1f(gl.getUniformLocation(program, "uHasLut"), 1);
          } else {
            gl.uniform1f(gl.getUniformLocation(program, "uHasLut"), 0);
          }

          gl.uniform1f(gl.getUniformLocation(program, "uIntensity"), intensity);
          gl.uniform1f(gl.getUniformLocation(program, "uBrightness"), brightness);
          gl.uniform1f(gl.getUniformLocation(program, "uContrast"), contrast);
          gl.uniform1f(gl.getUniformLocation(program, "uSaturation"), saturation);
          gl.uniform1f(gl.getUniformLocation(program, "uSmoothing"), smoothing);
          gl.uniform1f(gl.getUniformLocation(program, "uWarmth"), warmth);
          gl.uniform3f(gl.getUniformLocation(program, "uTintColor"), tintColor[0], tintColor[1], tintColor[2]);
          gl.uniform1f(gl.getUniformLocation(program, "uTintStrength"), tintStrength);

          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.flush();
          gl.endFrameEXP?.();
          onReady?.();
        } catch {
          onReady?.();
        }
      }}
    />
  );
}
