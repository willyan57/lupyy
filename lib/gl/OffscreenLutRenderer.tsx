import { Asset } from "expo-asset";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type { FilterId } from "@/lib/mediaFilters/applyFilterAndExport";
import { getLutForFilter } from "./filterLuts";
import { FRAG, VERT } from "./shaders/lut2d";

type OffscreenLutRendererProps = {
  sourceUri: string;
  filter: FilterId;
  onFinish: (resultUri: string | null) => void;
};

/**
 * Etapa A-2
 *
 * Este componente renderiza a imagem + LUT em um GLView "invisível"
 * e tira um snapshot do framebuffer, devolvendo a URI do arquivo gerado.
 *
 * Ele ainda NÃO está plugado no applyFilterAndExport — isso será feito
 * numa próxima mini-etapa (A-3), para não quebrar nada do fluxo atual.
 */
export function OffscreenLutRenderer({
  sourceUri,
  filter,
  onFinish,
}: OffscreenLutRendererProps) {
  const finishedRef = useRef(false);

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
        const uImage = gl.getUniformLocation(program, "uImage");
        const uLut = gl.getUniformLocation(program, "uLut");
        const uIntensity = gl.getUniformLocation(program, "uIntensity");

        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          // Quad cobrindo a tela inteira em NDC
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW
        );

        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const loadAsset = async (input: number | string) => {
          const asset =
            typeof input === "number"
              ? Asset.fromModule(input)
              : Asset.fromURI(input);
          if (!asset.downloaded) {
            await asset.downloadAsync();
          }
          return asset;
        };

        const srcAsset = await loadAsset(sourceUri);

        const lutSource = getLutForFilter(filter);
        if (!lutSource) {
          // Sem LUT para esse filtro -> devolve original
          handleFinishOnce(sourceUri);
          return;
        }
        const lutAsset = await loadAsset(lutSource);

        const makeTex = (unit: number, asset: any) => {
          const tex = gl.createTexture();
          gl.activeTexture(unit);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          // expo-asset funciona direto aqui
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            asset
          );
          return tex;
        };

        makeTex(gl.TEXTURE0, srcAsset);
        gl.uniform1i(uImage, 0);

        makeTex(gl.TEXTURE1, lutAsset);
        gl.uniform1i(uLut, 1);

        gl.uniform1f(uIntensity, 1.0);

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.flush();
        gl.endFrameEXP?.();

        // Snapshot do framebuffer para arquivo
        const snapshot = await GLView.takeSnapshotAsync(gl, {
          format: "jpeg",
          result: "file",
          flip: true,
        } as any);

        // Alguns SDKs retornam string diretamente, outros objeto { uri }
        const resultUri =
          typeof snapshot === "string" ? snapshot : (snapshot?.uri as string);

        handleFinishOnce(resultUri || sourceUri);
      } catch {
        handleFinishOnce(sourceUri);
      }
    },
    [sourceUri, filter, handleFinishOnce]
  );

  return (
    <View style={styles.container}>
      <GLView style={styles.gl} onContextCreate={handleContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 1,
    height: 1,
    opacity: 0,
  },
  gl: {
    flex: 1,
  },
});
