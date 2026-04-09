// Hidden WebView: merges multi-photo collage into one JPEG on native (same geometry as web canvas bake).

import * as FileSystem from "expo-file-system";
import { useCallback, useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import WebView from "react-native-webview";

export type CollageBakeJob = {
  id: string;
  dataUrls: string[];
  slots: { x: number; y: number; w: number; h: number }[];
};

type Props = {
  job: CollageBakeJob | null;
  onFinish: (cacheFilePath: string | null) => void;
};

const BAKE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>
<canvas id="c"></canvas>
<script>
function runCollageBake(dataUrls, slots) {
  var outW = 1080, outH = 1920;
  var cv = document.getElementById("c");
  if (!cv || !dataUrls || !slots) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
    return;
  }
  cv.width = outW;
  cv.height = outH;
  var ctx = cv.getContext("2d");
  if (!ctx) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
    return;
  }
  var total = Math.min(dataUrls.length, slots.length);
  if (total <= 0) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
    return;
  }
  var loaded = 0;
  var images = new Array(total);
  var failed = false;
  function tryFinish() {
    if (loaded < total) return;
    if (failed) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
      return;
    }
    try {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      if (ctx.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = "high";
      for (var j = 0; j < total; j++) {
        var slot = slots[j];
        var src = images[j];
        if (!slot || !src) continue;
        var x = Math.round(slot.x * outW);
        var y = Math.round(slot.y * outH);
        var w = Math.round(slot.w * outW);
        var h = Math.round(slot.h * outH);
        var iw = src.naturalWidth || src.width || w;
        var ih = src.naturalHeight || src.height || h;
        if (iw <= 0 || ih <= 0 || w <= 0 || h <= 0) continue;
        var slotRatio = w / h;
        var imgRatio = iw / ih;
        var sx = 0, sy = 0, sw = iw, sh = ih;
        if (imgRatio > slotRatio) {
          sw = ih * slotRatio;
          sx = (iw - sw) / 2;
        } else if (imgRatio < slotRatio) {
          sh = iw / slotRatio;
          sy = (ih - sh) / 2;
        }
        ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, data: cv.toDataURL("image/jpeg", 0.92) }));
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
    }
  }
  for (var i = 0; i < total; i++) {
    (function (idx) {
      var img = new Image();
      img.onload = function () {
        images[idx] = img;
        loaded++;
        tryFinish();
      };
      img.onerror = function () {
        failed = true;
        loaded++;
        tryFinish();
      };
      img.src = dataUrls[idx];
    })(i);
  }
}
</script></body></html>`;

async function dataUrlToCacheFile(dataUrl: string): Promise<string | null> {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) return null;
  const b64 = dataUrl.slice(comma + 1);
  const path = `${FileSystem.cacheDirectory}collage-bake-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

export function CollageBakeWebView({ job, onFinish }: Props) {
  const ref = useRef<WebView>(null);
  const doneRef = useRef(false);

  const finishOnce = useCallback(
    (path: string | null) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onFinish(path);
    },
    [onFinish]
  );

  useEffect(() => {
    doneRef.current = false;
    if (!job) return;
    const t = setTimeout(() => finishOnce(null), 45000);
    return () => clearTimeout(t);
  }, [job, finishOnce]);

  if (Platform.OS === "web" || !job) return null;

  const inj = `(function(){try{runCollageBake(${JSON.stringify(job.dataUrls)},${JSON.stringify(job.slots)});}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({ok:false}));}})();true;`;

  return (
    <View style={{ width: 1, height: 1, overflow: "hidden", opacity: 0, position: "absolute" }} pointerEvents="none">
      <WebView
        key={`collage-${job.id}`}
        ref={ref}
        source={{ html: BAKE_HTML }}
        style={{ width: 320, height: 320 }}
        onLoadEnd={() => setTimeout(() => ref.current?.injectJavaScript(inj), 50)}
        onMessage={async (ev) => {
          try {
            const j = JSON.parse(ev.nativeEvent.data);
            if (j.ok && typeof j.data === "string") {
              try {
                const path = await dataUrlToCacheFile(j.data);
                finishOnce(path);
              } catch {
                finishOnce(null);
              }
            } else finishOnce(null);
          } catch {
            finishOnce(null);
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
      />
    </View>
  );
}
