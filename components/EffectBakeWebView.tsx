// Hidden WebView: bakes effect approximations into JPEG on native (Android/iOS).
// Kept in sync with lib/gl/webglEffects: CSS + canvas passes. Claridade = pixel loop (same as applyClaridade in TS).

import * as FileSystem from "expo-file-system";
import { useCallback, useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import WebView from "react-native-webview";

const BAKE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>
<canvas id="c"></canvas>
<script>
var CSS = {
  none: "none",
  preto_branco: "grayscale(1) contrast(1.14) brightness(1.02)",
  aurora: "brightness(1.02) contrast(1.04) saturate(1.05) hue-rotate(-10deg)",
  brisa_rosa: "brightness(1.03) contrast(1.02) saturate(1.1) sepia(0.05)",
  pixelate: "contrast(1.1) saturate(0.85)",
  halftone: "contrast(1.3) grayscale(0.4)",
  neon_edges: "contrast(1.5) brightness(1.1) saturate(1.5)",
  mirror: "contrast(1.05) saturate(1.1)",
  kaleidoscope: "saturate(1.5) contrast(1.08) hue-rotate(25deg)",
  fisheye: "saturate(1.15) contrast(1.08)",
  wave_distort: "saturate(1.2) contrast(1.05) hue-rotate(-4deg)"
};
function applyAurora(ctx, w, h) {
  var k = 0.36;
  ctx.globalCompositeOperation = "overlay";
  var g1 = ctx.createRadialGradient(0, 0, 0, w * 0.38, h * 0.32, w * 0.78);
  g1.addColorStop(0, "rgba(110,200,255,0.072)");
  g1.addColorStop(0.45, "rgba(90,170,230,0.029)");
  g1.addColorStop(1, "rgba(70,140,210,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);
  var g2 = ctx.createRadialGradient(w, h, 0, w * 0.62, h * 0.68, w * 0.58);
  g2.addColorStop(0, "rgba(130,215,255,0.05)");
  g2.addColorStop(1, "rgba(100,190,240,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}
function applyBrisaRosa(ctx, w, h) {
  var k = 0.38;
  ctx.globalCompositeOperation = "screen";
  var g1 = ctx.createRadialGradient(w * 0.18, h * 0.12, 0, w * 0.38, h * 0.32, w * 0.58);
  g1.addColorStop(0, "rgba(255,205,225,0.084)");
  g1.addColorStop(0.55, "rgba(255,190,210,0.03)");
  g1.addColorStop(1, "rgba(255,180,200,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);
  var g2 = ctx.createRadialGradient(w * 0.88, h * 0.45, 0, w * 0.58, h * 0.48, w * 0.52);
  g2.addColorStop(0, "rgba(235,215,255,0.068)");
  g2.addColorStop(1, "rgba(225,200,255,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}
/** Same math as lib/gl/webglEffects applyClaridade (intensity 1 in bake). */
function applyClaridadePass(ctx, w, h, intensity) {
  var t = typeof intensity === "number" ? intensity : 1;
  var contrastBoost = 1 + 0.11 * t;
  var satBoost = 1 + 0.1 * t;
  var id = ctx.getImageData(0, 0, w, h);
  var data = id.data;
  var len = data.length;
  var out = new Uint8ClampedArray(len);
  for (var i = 0; i < len; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    r = (r - 128) * contrastBoost + 128;
    g = (g - 128) * contrastBoost + 128;
    b = (b - 128) * contrastBoost + 128;
    r = r < 0 ? 0 : r > 255 ? 255 : r;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    b = b < 0 ? 0 : b > 255 ? 255 : b;
    var lum = r * 0.299 + g * 0.587 + b * 0.114;
    r = lum + (r - lum) * satBoost;
    g = lum + (g - lum) * satBoost;
    b = lum + (b - lum) * satBoost;
    out[i] = Math.round(r < 0 ? 0 : r > 255 ? 255 : r);
    out[i + 1] = Math.round(g < 0 ? 0 : g > 255 ? 255 : g);
    out[i + 2] = Math.round(b < 0 ? 0 : b > 255 ? 255 : b);
    out[i + 3] = data[i + 3];
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
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
      if (effectId === "claridade") {
        css = "none";
      }
      ctx.filter = css === "none" ? "none" : css;
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = "none";
      if (effectId === "claridade") {
        applyClaridadePass(ctx, w, h, 1);
      }
      if (effectId === "aurora") {
        applyAurora(ctx, w, h);
      }
      if (effectId === "brisa_rosa") {
        applyBrisaRosa(ctx, w, h);
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
