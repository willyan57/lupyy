import { Asset } from "expo-asset";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import type { FilterId } from "@/lib/mediaFilters/applyFilterAndExport";
import { getLutForFilter } from "./filterLuts";
import { FRAG, VERT } from "./shaders/lut2d";

type ShaderAdjustments = {
  intensity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  smoothing?: number;
  warmth?: number;
  tintColor?: [number, number, number];
  tintStrength?: number;
};

type OffscreenLutRendererProps = {
  sourceUri: string;
  filter: FilterId;
  adjustments?: ShaderAdjustments;
  onFinish: (resultUri: string | null) => void;
};

const FALLBACK_SIZE = 1080;

const compileShader = (gl: ExpoWebGLRenderingContext, type: number, src: string) => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return shader;
};

const loadAsset = async (input: number | string) => {
  const asset = typeof input === "number" ? Asset.fromModule(input) : Asset.fromURI(input);
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

export function OffscreenLutRenderer({ sourceUri, filter, adjustments, onFinish }: OffscreenLutRendererProps) {
  const finishedRef = useRef(false);
  const [size, setSize] = useState({ width: FALLBACK_SIZE, height: FALLBACK_SIZE });

  useEffect(() => {
    if (!sourceUri) return;
    Image.getSize(
      sourceUri,
      (width, height) => {
        if (width > 0 && height > 0) {
          setSize({ width, height });
        }
      },
      () => undefined
    );
  }, [sourceUri]);

  const handleFinishOnce = useCallback(
    (uri: string | null) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish(uri);
    },
    [onFinish]
  );

  const handleContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      if (!sourceUri) {
        handleFinishOnce(null);
        return;
      }

      try {
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERT);
        const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
        const program = gl.createProgram()!;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(program, "aPos");
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const srcAsset = await loadAsset(sourceUri);
        makeTex(gl, gl.TEXTURE0, srcAsset);
        gl.uniform1i(gl.getUniformLocation(program, "uImage"), 0);

        const lutSource = getLutForFilter(filter);
        if (lutSource) {
          const lutAsset = await loadAsset(lutSource);
          makeTex(gl, gl.TEXTURE1, lutAsset);
          gl.uniform1i(gl.getUniformLocation(program, "uLut"), 1);
          gl.uniform1f(gl.getUniformLocation(program, "uHasLut"), 1);
        } else {
          gl.uniform1f(gl.getUniformLocation(program, "uHasLut"), 0);
        }

        gl.uniform1f(gl.getUniformLocation(program, "uIntensity"), adjustments?.intensity ?? (lutSource ? 1 : 0));
        gl.uniform1f(gl.getUniformLocation(program, "uBrightness"), adjustments?.brightness ?? 0);
        gl.uniform1f(gl.getUniformLocation(program, "uContrast"), adjustments?.contrast ?? 1);
        gl.uniform1f(gl.getUniformLocation(program, "uSaturation"), adjustments?.saturation ?? 1);
        gl.uniform1f(gl.getUniformLocation(program, "uSmoothing"), adjustments?.smoothing ?? 0);
        gl.uniform1f(gl.getUniformLocation(program, "uWarmth"), adjustments?.warmth ?? 0);
        const tint = adjustments?.tintColor ?? [1, 1, 1];
        gl.uniform3f(gl.getUniformLocation(program, "uTintColor"), tint[0], tint[1], tint[2]);
        gl.uniform1f(gl.getUniformLocation(program, "uTintStrength"), adjustments?.tintStrength ?? 0);

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();
        gl.endFrameEXP?.();

        const snapshot = await GLView.takeSnapshotAsync(gl, {
          format: "jpeg",
          result: "file",
          flip: true,
        } as any);

        const resultUri = typeof snapshot === "string" ? snapshot : (snapshot?.uri as string | undefined);
        handleFinishOnce(resultUri || sourceUri);
      } catch {
        handleFinishOnce(sourceUri);
      }
    },
    [sourceUri, filter, adjustments, handleFinishOnce]
  );

  return (
    <View pointerEvents="none" style={styles.container}>
      <GLView
        style={{ width: size.width, height: size.height }}
        onContextCreate={handleContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    opacity: 0,
    left: -99999,
    top: -99999,
  },
});
