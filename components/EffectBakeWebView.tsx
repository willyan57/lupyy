// Hidden WebView: bakes effect approximations into JPEG on native (Android/iOS).
// Aligns with lib/gl/webglEffects getEffectCSSFilter + chromatic/rgb_shift pixel pass.

import * as FileSystem from "expo-file-system";
import { useCallback, useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import WebView from "react-native-webview";

const BAKE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>
<canvas id="c"></canvas>
<script>
var CSS = {
  none: "none",
  vhs: "saturate(0.75) contrast(1.15) sepia(0.15) brightness(1.05)",
  duotone: "saturate(0.3) contrast(1.2) sepia(0.6) hue-rotate(180deg)",
  neon_edges: "contrast(1.5) brightness(1.1) saturate(1.5)",
  halftone: "contrast(1.3) grayscale(0.4)",
  light_leaks: "brightness(1.08) contrast(0.95) saturate(1.15)",
  glitch: "contrast(1.25) saturate(1.4) hue-rotate(8deg) brightness(1.03)",
  chromatic: "saturate(1.45) contrast(1.12) hue-rotate(-6deg)",
  prism: "saturate(1.25) brightness(1.06) hue-rotate(12deg)",
  pixelate: "contrast(1.1) saturate(0.85)",
  rgb_split: "saturate(1.35) contrast(1.1) hue-rotate(4deg)",
  mirror: "contrast(1.05) saturate(1.1)",
  kaleidoscope: "saturate(1.5) contrast(1.08) hue-rotate(25deg)",
  fisheye: "saturate(1.15) contrast(1.08)",
  wave_distort: "saturate(1.2) contrast(1.05) hue-rotate(-4deg)"
};
function chromaShift(data, w, h, px) {
  var copy = new Uint8ClampedArray(data);
  for (var i = 0; i < data.length; i += 4) {
    var x = (i / 4) % w, y = ((i / 4) / w) | 0;
    var rI = (y * w + Math.min(x + px, w - 1)) * 4;
    var bI = (y * w + Math.max(x - px, 0)) * 4;
    data[i] = copy[rI];
    data[i + 1] = copy[i + 1];
    data[i + 2] = copy[bI + 2];
    data[i + 3] = 255;
  }
}
function runEffectBake(uri, effectId) {
  var img = new Image();
  img.onload = function () {
    try {
      var max = 1440;
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error("bad size");
      if (w > max || h > max) {
        var s = max / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      var cv = document.getElementById("c");
      cv.width = w;
      cv.height = h;
      var ctx = cv.getContext("2d");
      var css = CSS[effectId] || "none";
      ctx.filter = css === "none" ? "none" : css;
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = "none";
      if (effectId === "chromatic" || effectId === "rgb_split") {
        var id = ctx.getImageData(0, 0, w, h);
        chromaShift(id.data, w, h, effectId === "rgb_split" ? 5 : 4);
        ctx.putImageData(id, 0, 0);
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, data: cv.toDataURL("image/jpeg", 0.92) }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
    }
  };
  img.onerror = function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
  };
  img.src = uri;
}
</script></body></html>`;

export type EffectBakeJob = { fileUri: string; effectId: string };

type Props = {
  job: EffectBakeJob | null;
  onFinish: (outputUri: string) => void;
};

export function EffectBakeWebView({ job, onFinish }: Props) {
  const ref = useRef<WebView>(null);
  const doneRef = useRef(false);

  const finishOnce = useCallback(
    (uri: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onFinish(uri);
    },
    [onFinish]
  );

  useEffect(() => {
    doneRef.current = false;
    if (!job) return;
    const t = setTimeout(() => finishOnce(job.fileUri), 30000);
    return () => clearTimeout(t);
  }, [job, finishOnce]);

  if (Platform.OS === "web" || !job) return null;

  const iosReadDir =
    Platform.OS === "ios"
      ? job.fileUri.slice(0, Math.max(0, job.fileUri.lastIndexOf("/")))
      : undefined;

  return (
    <View style={{ width: 1, height: 1, overflow: "hidden", opacity: 0, position: "absolute" }} pointerEvents="none">
      <WebView
        key={`${job.fileUri}::${job.effectId}`}
        ref={ref}
        source={{ html: BAKE_HTML }}
        style={{ width: 320, height: 320 }}
        onLoadEnd={() => {
          const inj = `(function(){try{runEffectBake(${JSON.stringify(job.fileUri)},${JSON.stringify(job.effectId)});}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({ok:false}));}})();true;`;
          setTimeout(() => ref.current?.injectJavaScript(inj), 40);
        }}
        onMessage={(ev) => {
          try {
            const j = JSON.parse(ev.nativeEvent.data);
            if (j.ok && typeof j.data === "string") finishOnce(j.data);
            else finishOnce(job.fileUri);
          } catch {
            finishOnce(job.fileUri);
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        {...(iosReadDir ? { allowingReadAccessToURL: iosReadDir } : {})}
      />
    </View>
  );
}

export async function dataUrlToCacheFile(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) return dataUrl;
  const b64 = dataUrl.slice(comma + 1);
  const path = `${FileSystem.cacheDirectory}bake-effect-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}
