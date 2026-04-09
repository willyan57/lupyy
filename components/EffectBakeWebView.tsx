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
function applyLightLeaks(ctx, w, h) {
  var g1 = ctx.createRadialGradient(w * 0.1, h * 0.1, 0, w * 0.3, h * 0.3, w * 0.7);
  g1.addColorStop(0, "rgba(255,180,80,0.45)");
  g1.addColorStop(0.5, "rgba(255,120,60,0.2)");
  g1.addColorStop(1, "rgba(255,100,50,0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);
  var g2 = ctx.createRadialGradient(w * 0.85, h * 0.9, 0, w * 0.7, h * 0.7, w * 0.6);
  g2.addColorStop(0, "rgba(255,100,180,0.35)");
  g2.addColorStop(0.6, "rgba(255,80,120,0.15)");
  g2.addColorStop(1, "rgba(255,60,100,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}
function applyVhsPass(ctx, w, h) {
  ctx.globalCompositeOperation = "multiply";
  for (var y = 0; y < h; y += 2) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, y, w, 1);
  }
  ctx.globalCompositeOperation = "screen";
  for (var i = 0; i < 80; i++) {
    var x = Math.random() * w;
    var yy = Math.random() * h;
    var g = Math.floor(Math.random() * 255);
    ctx.fillStyle = "rgba(" + g + "," + g + "," + g + ",0.08)";
    ctx.fillRect(x, yy, Math.random() * 40, 1);
  }
  var trackY = Math.floor(Math.random() * h);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, trackY, w, 4);
}
function applyPrismPass(ctx, img, w, h) {
  var off = 12;
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.45;
  ctx.drawImage(img, off, off, w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(255,0,0,0.35)";
  ctx.fillRect(0, 0, w + off, h + off);
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(img, -off, -off, w, h);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(0,0,255,0.35)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "overlay";
  var grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "rgba(255,0,0,0.09)");
  grad.addColorStop(0.25, "rgba(255,255,0,0.09)");
  grad.addColorStop(0.5, "rgba(0,255,255,0.09)");
  grad.addColorStop(0.75, "rgba(0,0,255,0.09)");
  grad.addColorStop(1, "rgba(255,0,255,0.09)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}
function applyDuotonePass(ctx, data, w, h) {
  var dark = [60, 20, 120], light = [255, 160, 40];
  for (var i = 0; i < data.length; i += 4) {
    var lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    var r = dark[0] + (light[0] - dark[0]) * lum;
    var g = dark[1] + (light[1] - dark[1]) * lum;
    var b = dark[2] + (light[2] - dark[2]) * lum;
    data[i] = Math.round(data[i] * 0.15 + r * 0.85);
    data[i + 1] = Math.round(data[i + 1] * 0.15 + g * 0.85);
    data[i + 2] = Math.round(data[i + 2] * 0.15 + b * 0.85);
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
      if (effectId === "light_leaks") {
        applyLightLeaks(ctx, w, h);
      }
      if (effectId === "vhs") {
        var vhsData = ctx.getImageData(0, 0, w, h);
        chromaShift(vhsData.data, w, h, 6);
        ctx.putImageData(vhsData, 0, 0);
        applyVhsPass(ctx, w, h);
      }
      if (effectId === "prism") {
        applyPrismPass(ctx, img, w, h);
      }
      if (effectId === "chromatic" || effectId === "rgb_split" || effectId === "glitch") {
        var id = ctx.getImageData(0, 0, w, h);
        chromaShift(id.data, w, h, effectId === "rgb_split" ? 18 : (effectId === "glitch" ? 8 : 16));
        ctx.putImageData(id, 0, 0);
      } else if (effectId === "duotone") {
        var duoData = ctx.getImageData(0, 0, w, h);
        applyDuotonePass(ctx, duoData.data, w, h);
        ctx.putImageData(duoData, 0, 0);
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

export type EffectBakeJob = {
  /** `file://` or `data:image/...;base64,...` passed into the hidden WebView */
  fileUri: string;
  effectId: string;
  /** When `fileUri` is a data URL, used on failure/timeout so preview never goes blank */
  fallbackFileUri?: string;
};

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
    const fallback = job.fallbackFileUri ?? job.fileUri;
    const t = setTimeout(() => finishOnce(fallback), 30000);
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
          const fallback = job.fallbackFileUri ?? job.fileUri;
          try {
            const j = JSON.parse(ev.nativeEvent.data);
            if (j.ok && typeof j.data === "string") finishOnce(j.data);
            else finishOnce(fallback);
          } catch {
            finishOnce(fallback);
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
