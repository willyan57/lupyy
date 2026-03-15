import { Asset } from "expo-asset";
import { GLView } from "expo-gl";
import { useMemo } from "react";
import { StyleProp, ViewStyle } from "react-native";

type LutSource = number | string;

export type BeautifyParams = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  smoothing?: number;
  whitenTeeth?: number;
  baseGlow?: number;
  sharpness?: number;
  temperature?: number;
  vignette?: number;
  grain?: number;
  fade?: number;
  highlights?: number;
  shadows?: number;
};

type ExtendedBeautifyParams = BeautifyParams & {
  sharpness?: number;
  temperature?: number;
  vignette?: number;
  grain?: number;
  fade?: number;
  highlights?: number;
  shadows?: number;
};

export default function LutRenderer({
  sourceUri,
  lut,
  intensity = 1,
  beautify,
  style,
  onReady,
  flipY = true,
}: {
  sourceUri: string;
  lut: LutSource | null;
  intensity?: number;
  beautify?: ExtendedBeautifyParams;
  style?: StyleProp<ViewStyle>;
  onReady?: () => void;
  flipY?: boolean;
}) {
  const key = useMemo(() => {
    const b = beautify || {};
    return `${sourceUri}__${typeof lut === "number" ? String(lut) : lut ?? "nolut"}__${intensity}__${JSON.stringify(b)}__${flipY}`;
  }, [sourceUri, lut, intensity, beautify, flipY]);

  const hasLut = lut !== null && lut !== undefined;

  return (
    <GLView
      key={key}
      style={style}
      onContextCreate={async (gl: any) => {
        try {
          const { VERT, FRAG_COMPAT } = await import("./shaders/lut2d");

          const compile = (type: number, src: string) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
              console.warn("Shader compile error:", gl.getShaderInfoLog(sh));
            }
            return sh;
          };

          const vs = compile(gl.VERTEX_SHADER, VERT);
          const fs = compile(gl.FRAGMENT_SHADER, FRAG_COMPAT);

          const prog = gl.createProgram();
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);

          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn("Program link error:", gl.getProgramInfoLog(prog));
          }

          gl.useProgram(prog);

          const quad = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, quad);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW
          );

          const aPos = gl.getAttribLocation(prog, "aPos");
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          const uImage = gl.getUniformLocation(prog, "uImage");
          const uLut = gl.getUniformLocation(prog, "uLut");
          const uIntensity = gl.getUniformLocation(prog, "uIntensity");
          const uBrightness = gl.getUniformLocation(prog, "uBrightness");
          const uContrast = gl.getUniformLocation(prog, "uContrast");
          const uSaturation = gl.getUniformLocation(prog, "uSaturation");
          const uSmoothing = gl.getUniformLocation(prog, "uSmoothing");
          const uWhitenTeeth = gl.getUniformLocation(prog, "uWhitenTeeth");
          const uBaseGlow = gl.getUniformLocation(prog, "uBaseGlow");
          const uSharpness = gl.getUniformLocation(prog, "uSharpness");
          const uTemperature = gl.getUniformLocation(prog, "uTemperature");
          const uVignette = gl.getUniformLocation(prog, "uVignette");
          const uGrain = gl.getUniformLocation(prog, "uGrain");
          const uFade = gl.getUniformLocation(prog, "uFade");
          const uHighlights = gl.getUniformLocation(prog, "uHighlights");
          const uShadows = gl.getUniformLocation(prog, "uShadows");
          const uFlipY = gl.getUniformLocation(prog, "uFlipY");

          const loadAsset = async (src: LutSource) => {
            const a =
              typeof src === "number"
                ? Asset.fromModule(src)
                : Asset.fromURI(src);
            if (!a.downloaded) await a.downloadAsync();
            return a;
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
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset);
            return tex;
          };

          makeTex(gl.TEXTURE0, srcAsset);
          gl.uniform1i(uImage, 0);

          if (hasLut) {
            const lutAsset = await loadAsset(lut!);
            makeTex(gl.TEXTURE1, lutAsset);
            gl.uniform1i(uLut, 1);
            gl.uniform1f(uIntensity, intensity);
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

          const b: ExtendedBeautifyParams = beautify || {};
          gl.uniform1f(uBrightness, b.brightness ?? 0.0);
          gl.uniform1f(uContrast, b.contrast ?? 1.0);
          gl.uniform1f(uSaturation, b.saturation ?? 1.0);
          gl.uniform1f(uSmoothing, b.smoothing ?? 0.0);
          gl.uniform1f(uWhitenTeeth, b.whitenTeeth ?? 0.0);
          gl.uniform1f(uBaseGlow, b.baseGlow ?? 0.0);
          gl.uniform1f(uSharpness, b.sharpness ?? 0.0);
          gl.uniform1f(uTemperature, b.temperature ?? 0.0);
          gl.uniform1f(uVignette, b.vignette ?? 0.0);
          gl.uniform1f(uGrain, b.grain ?? 0.0);
          gl.uniform1f(uFade, b.fade ?? 0.0);
          gl.uniform1f(uHighlights, b.highlights ?? 0.0);
          gl.uniform1f(uShadows, b.shadows ?? 0.0);
          if (uFlipY) gl.uniform1f(uFlipY, flipY ? 1.0 : 0.0);

          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.flush();
          gl.endFrameEXP?.();

          onReady?.();
        } catch (err) {
          console.warn("LutRenderer GL error:", err);
        }
      }}
    />
  );
}