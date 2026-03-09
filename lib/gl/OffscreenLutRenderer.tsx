import { Asset } from "expo-asset";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type { FilterId } from "@/lib/mediaFilters/applyFilterAndExport";
import type { BeautifyParams } from "./LutRenderer";
import { getLutForFilter } from "./filterLuts";
import { FRAG_COMPAT as FRAG, VERT } from "./shaders/lut2d";

type OffscreenLutRendererProps = {
  sourceUri: string;
  filter: FilterId;
  beautify?: BeautifyParams;
  exportWidth?: number;
  exportHeight?: number;
  onFinish: (resultUri: string | null) => void;
};

export function OffscreenLutRenderer({
  sourceUri,
  filter,
  beautify,
  exportWidth,
  exportHeight,
  onFinish,
}: OffscreenLutRendererProps) {
  const finishedRef = useRef(false);

  const glWidth = exportWidth || 1080;
  const glHeight = exportHeight || 1080;

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
        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vertexShader, VERT);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fragmentShader, FRAG);
        gl.compileShader(fragmentShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        const aPos = gl.getAttribLocation(program, "aPos");
        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const uImage = gl.getUniformLocation(program, "uImage");
        const uLut = gl.getUniformLocation(program, "uLut");
        const uIntensity = gl.getUniformLocation(program, "uIntensity");
        const uBrightness = gl.getUniformLocation(program, "uBrightness");
        const uContrast = gl.getUniformLocation(program, "uContrast");
        const uSaturation = gl.getUniformLocation(program, "uSaturation");
        const uSmoothing = gl.getUniformLocation(program, "uSmoothing");
        const uWhitenTeeth = gl.getUniformLocation(program, "uWhitenTeeth");
        const uBaseGlow = gl.getUniformLocation(program, "uBaseGlow");

        const loadAsset = async (input: number | string) => {
          const asset =
            typeof input === "number"
              ? Asset.fromModule(input)
              : Asset.fromURI(input);
          if (!asset.downloaded) await asset.downloadAsync();
          return asset;
        };

        const srcAsset = await loadAsset(sourceUri);

        const makeTex = (unit: number, asset: any) => {
          const tex = gl.createTexture();
          gl.activeTexture(unit);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset
          );
          return tex;
        };

        makeTex(gl.TEXTURE0, srcAsset);
        gl.uniform1i(uImage, 0);

        const lutSource = getLutForFilter(filter);
        if (lutSource) {
          const lutAsset = await loadAsset(lutSource);
          makeTex(gl.TEXTURE1, lutAsset);
          gl.uniform1i(uLut, 1);
          gl.uniform1f(uIntensity, 1.0);
        } else {
          const identityTex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, identityTex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
            gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([255, 255, 255, 255])
          );
          gl.uniform1i(uLut, 1);
          gl.uniform1f(uIntensity, 0.0);
        }

        const b = beautify || {};
        gl.uniform1f(uBrightness, b.brightness ?? 0.0);
        gl.uniform1f(uContrast, b.contrast ?? 1.0);
        gl.uniform1f(uSaturation, b.saturation ?? 1.0);
        gl.uniform1f(uSmoothing, b.smoothing ?? 0.0);
        gl.uniform1f(uWhitenTeeth, b.whitenTeeth ?? 0.0);
        gl.uniform1f(uBaseGlow, b.baseGlow ?? 0.0);

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

        const resultUri =
          typeof snapshot === "string" ? snapshot : (snapshot?.uri as string);

        handleFinishOnce(resultUri || sourceUri);
      } catch (err) {
        console.warn("OffscreenLutRenderer error:", err);
        handleFinishOnce(sourceUri);
      }
    },
    [sourceUri, filter, beautify, handleFinishOnce]
  );

  return (
    <View style={styles.container} pointerEvents="none">
      <GLView
        style={{ width: glWidth, height: glHeight }}
        onContextCreate={handleContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: -9999,
    top: -9999,
    overflow: "hidden",
  },
});
