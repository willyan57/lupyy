import { Asset } from "expo-asset";
import { GLView } from "expo-gl";
import { useMemo } from "react";
import { ViewStyle } from "react-native";

type LutSource = number | string;

export default function LutRenderer({
  sourceUri,
  lut,
  intensity = 1,
  style,
  onReady,
}: {
  sourceUri: string;
  lut: LutSource;
  intensity?: number;
  style?: ViewStyle;
  onReady?: () => void;
}) {
  const key = useMemo(
    () => `${sourceUri}__${typeof lut === "number" ? String(lut) : lut}__${intensity}`,
    [sourceUri, lut, intensity]
  );

  return (
    <GLView
      key={key}
      style={style}
      onContextCreate={async (gl: any) => {
        try {
          const { VERT, FRAG } = await import("./shaders/lut2d");

          const compile = (type: number, src: string) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            return sh;
          };

          const vs = compile(gl.VERTEX_SHADER, VERT);
          const fs = compile(gl.FRAGMENT_SHADER, FRAG);

          const prog = gl.createProgram();
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          gl.useProgram(prog);

          const quad = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, quad);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

          const aPos = gl.getAttribLocation(prog, "aPos");
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          const uImage = gl.getUniformLocation(prog, "uImage");
          const uLut = gl.getUniformLocation(prog, "uLut");
          const uIntensity = gl.getUniformLocation(prog, "uIntensity");

          const loadAsset = async (src: LutSource) => {
            const a = typeof src === "number" ? Asset.fromModule(src) : Asset.fromURI(src);
            await a.downloadAsync();
            return a;
          };

          const srcAsset = await loadAsset(sourceUri);
          const lutAsset = await loadAsset(lut);

          const makeTex = (unit: number, asset: any) => {
            const tex = gl.createTexture();
            gl.activeTexture(unit);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            // Expo's WebGL accepts expo-asset Asset objects directly in texImage2D on native.
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset);
            return tex;
          };

          makeTex(gl.TEXTURE0, srcAsset);
          gl.uniform1i(uImage, 0);

          makeTex(gl.TEXTURE1, lutAsset);
          gl.uniform1i(uLut, 1);

          gl.uniform1f(uIntensity, intensity);

          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.flush();
          gl.endFrameEXP?.();

          onReady?.();
        } catch {
          // If GL fails, we just don't crash the screen.
        }
      }}
    />
  );
}
