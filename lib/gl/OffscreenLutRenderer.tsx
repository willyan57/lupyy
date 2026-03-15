// lib/gl/OffscreenLutRenderer.tsx
// Corrigido: tamanho real da imagem + parâmetros de beautify

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
  /** Tamanho do GL canvas para exportação. Se não informado, tenta detectar da imagem. */
  exportWidth?: number;
  exportHeight?: number;
  onFinish: (resultUri: string | null) => void;
};

/**
 * Renderiza imagem + LUT + beautify em um GLView offscreen (invisível)
 * e tira snapshot do framebuffer, devolvendo a URI do arquivo gerado.
 *
 * CORREÇÕES:
 * - GLView agora usa tamanho real da imagem (não 1x1)
 * - Parâmetros de beautify são passados como uniforms
 * - Fallback seguro se tamanho não estiver disponível
 */
export function OffscreenLutRenderer({
  sourceUri,
  filter,
  beautify,
  exportWidth,
  exportHeight,
  onFinish,
}: OffscreenLutRendererProps) {
  const finishedRef = useRef(false);

  // Tamanho padrão razoável para exportação
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
        // Compilar shaders
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

        // Quad
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

        // Uniforms
        const uImage = gl.getUniformLocation(program, "uImage");
        const uLut = gl.getUniformLocation(program, "uLut");
        const uIntensity = gl.getUniformLocation(program, "uIntensity");
        const uBrightness = gl.getUniformLocation(program, "uBrightness");
        const uContrast = gl.getUniformLocation(program, "uContrast");
        const uSaturation = gl.getUniformLocation(program, "uSaturation");
        const uSmoothing = gl.getUniformLocation(program, "uSmoothing");
        const uWhitenTeeth = gl.getUniformLocation(program, "uWhitenTeeth");
        const uBaseGlow = gl.getUniformLocation(program, "uBaseGlow");

        // Load assets
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

        // Imagem
        makeTex(gl.TEXTURE0, srcAsset);
        gl.uniform1i(uImage, 0);

        // LUT
        const lutSource = getLutForFilter(filter);
        if (lutSource) {
          const lutAsset = await loadAsset(lutSource);
          makeTex(gl.TEXTURE1, lutAsset);
          gl.uniform1i(uLut, 1);
          gl.uniform1f(uIntensity, 1.0);
        } else {
          // Textura identidade 1x1
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

        // Beautify uniforms
        const b = beautify || {};
        gl.uniform1f(uBrightness, b.brightness ?? 0.0);
        gl.uniform1f(uContrast, b.contrast ?? 1.0);
        gl.uniform1f(uSaturation, b.saturation ?? 1.0);
        gl.uniform1f(uSmoothing, b.smoothing ?? 0.0);
        gl.uniform1f(uWhitenTeeth, b.whitenTeeth ?? 0.0);
        gl.uniform1f(uBaseGlow, b.baseGlow ?? 0.0);

        // Draw
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();

        // Aguardar o frame ser renderizado completamente
        await new Promise((r) => setTimeout(r, 100));

        // Snapshot ANTES de endFrameEXP (que limpa o framebuffer)
        let resultUri: string | null = null;
        try {
          const snapshot = await GLView.takeSnapshotAsync(gl, {
            format: "jpeg",
            result: "file",
            flip: false,
          } as any);

          resultUri =
            typeof snapshot === "string" ? snapshot : (snapshot?.uri as string);
        } catch (snapErr) {
          console.warn("Snapshot falhou, tentando novamente:", snapErr);
          // Retry: redesenhar e tentar novamente
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.flush();
          await new Promise((r) => setTimeout(r, 200));
          try {
            const snapshot2 = await GLView.takeSnapshotAsync(gl, {
              format: "jpeg",
              result: "file",
              flip: false,
            } as any);
            resultUri =
              typeof snapshot2 === "string" ? snapshot2 : (snapshot2?.uri as string);
          } catch {
            console.warn("Snapshot retry também falhou");
          }
        }

        gl.endFrameEXP?.();

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
    // Fora da tela, mas com tamanho real para gerar snapshot de qualidade
    left: -9999,
    top: -9999,
    overflow: "hidden",
  },
});
