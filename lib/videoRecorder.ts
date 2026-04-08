// lib/videoRecorder.ts — Cross-platform video recording using MediaRecorder API
// Works in WebView (Capacitor APK), mobile web, and desktop browsers
// Replaces CameraView.recordAsync() which fails in WebView environments

export type VideoRecorderOptions = {
  /** Max duration in seconds */
  maxDuration?: number;
  /** Preferred video quality: "1080p" | "720p" | "480p" */
  quality?: "1080p" | "720p" | "480p";
  /** Which camera to use */
  facingMode?: "user" | "environment";
  /** Called when recording starts */
  onStart?: () => void;
  /** Called every second with elapsed time */
  onTick?: (seconds: number) => void;
  /** Called when recording completes */
  onComplete?: (uri: string) => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Reuse existing camera stream when available (APK/WebView safer) */
  existingStream?: MediaStream | null;
};

export type VideoRecorderInstance = {
  /** Start recording */
  start: () => void;
  /** Stop recording manually */
  stop: () => void;
  /** Check if currently recording */
  isRecording: () => boolean;
  /** Cleanup resources */
  destroy: () => void;
};

/**
 * Create a video recorder using the browser MediaRecorder API.
 * This works in Capacitor WebViews on Android 5+ and iOS 14.3+.
 */
export async function createVideoRecorder(
  options: VideoRecorderOptions = {}
): Promise<VideoRecorderInstance | null> {
  const {
    maxDuration = 60,
    quality = "720p",
    facingMode = "environment",
    onStart,
    onTick,
    onComplete,
    onError,
    existingStream,
  } = options;

  // Check browser support
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    onError?.("MediaRecorder não disponível neste dispositivo");
    return null;
  }

  if (typeof MediaRecorder === "undefined") {
    onError?.("MediaRecorder API não suportada");
    return null;
  }

  // Reuse existing active camera stream when possible (avoids camera-in-use errors on WebView/APK)
  let stream: MediaStream | null = null;
  if (existingStream && existingStream.getVideoTracks().length > 0) {
    try {
      stream = new MediaStream(existingStream.getVideoTracks());
      const audioTracks = existingStream.getAudioTracks();
      if (audioTracks.length > 0) {
        stream.addTrack(audioTracks[0]);
      }
    } catch {
      stream = null;
    }
  }

  // Get camera stream
  const constraints: MediaStreamConstraints = {
    video: {
      facingMode,
      width: quality === "1080p" ? { ideal: 1920 } : quality === "720p" ? { ideal: 1280 } : { ideal: 854 },
      height: quality === "1080p" ? { ideal: 1080 } : quality === "720p" ? { ideal: 720 } : { ideal: 480 },
    },
    audio: true,
  };

  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: any) {
      // Try without audio
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: constraints.video,
          audio: false,
        });
      } catch (err2: any) {
        onError?.(`Não foi possível acessar a câmera: ${err2.message || err2}`);
        return null;
      }
    }
  }

  // Determine best MIME type
  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    stream.getTracks().forEach((t) => t.stop());
    onError?.("Nenhum formato de vídeo suportado");
    return null;
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: quality === "1080p" ? 5000000 : quality === "720p" ? 2500000 : 1000000,
    });
  } catch {
    // Fallback without options
    try {
      recorder = new MediaRecorder(stream);
    } catch (err: any) {
      stream.getTracks().forEach((t) => t.stop());
      onError?.(`Erro ao criar gravador: ${err.message || err}`);
      return null;
    }
  }

  let chunks: Blob[] = [];
  let timerInterval: any = null;
  let seconds = 0;
  let recording = false;
  let destroyed = false;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    if (destroyed) return;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    recording = false;

    if (chunks.length === 0) {
      onError?.("Nenhum dado gravado");
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    chunks = [];

    if (blob.size < 1000) {
      onError?.("Gravação muito curta ou vazia");
      return;
    }

    const url = URL.createObjectURL(blob);
    onComplete?.(url);
  };

  recorder.onerror = (e: any) => {
    recording = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    onError?.(e?.error?.message || "Erro na gravação");
  };

  const instance: VideoRecorderInstance = {
    start: () => {
      if (recording || destroyed) return;
      chunks = [];
      seconds = 0;
      recording = true;

      try {
        try {
          recorder.start(1000); // Collect data every second
        } catch {
          recorder.start();
        }
      } catch (err: any) {
        recording = false;
        onError?.(`Erro ao iniciar gravação: ${err.message || err}`);
        return;
      }

      onStart?.();

      // Timer
      timerInterval = setInterval(() => {
        seconds++;
        onTick?.(seconds);
        if (seconds >= maxDuration) {
          instance.stop();
        }
      }, 1000);
    },

    stop: () => {
      if (!recording) return;
      try {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      } catch {}
      recording = false;
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    },

    isRecording: () => recording,

    destroy: () => {
      destroyed = true;
      instance.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };

  return instance;
}

/**
 * Get the video element's stream for live preview.
 * Attaches a camera stream to an existing video element.
 */
export async function attachCameraStream(
  videoElement: HTMLVideoElement,
  facingMode: "user" | "environment" = "environment"
): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.playsInline = true;
    await videoElement.play();
    return stream;
  } catch (err: any) {
    console.warn("attachCameraStream error:", err);
    return null;
  }
}

/**
 * Record from an existing MediaStream (from CameraView or getUserMedia).
 */
export function recordFromStream(
  stream: MediaStream,
  options: Omit<VideoRecorderOptions, "facingMode" | "quality"> = {}
): VideoRecorderInstance | null {
  const { maxDuration = 60, onStart, onTick, onComplete, onError } = options;

  if (typeof MediaRecorder === "undefined") {
    onError?.("MediaRecorder não disponível");
    return null;
  }

  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    onError?.("Formato de vídeo não suportado");
    return null;
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch (err: any) {
      onError?.(err.message || "Erro no MediaRecorder");
      return null;
    }
  }

  let chunks: Blob[] = [];
  let timerInterval: any = null;
  let seconds = 0;
  let recording = false;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    if (timerInterval) clearInterval(timerInterval);
    recording = false;
    if (chunks.length === 0) { onError?.("Sem dados"); return; }
    const blob = new Blob(chunks, { type: mimeType });
    chunks = [];
    onComplete?.(URL.createObjectURL(blob));
  };

  recorder.onerror = () => {
    recording = false;
    if (timerInterval) clearInterval(timerInterval);
    onError?.("Erro na gravação");
  };

  return {
    start: () => {
      if (recording) return;
      chunks = [];
      seconds = 0;
      recording = true;
      recorder.start(1000);
      onStart?.();
      timerInterval = setInterval(() => {
        seconds++;
        onTick?.(seconds);
        if (seconds >= maxDuration) recorder.stop();
      }, 1000);
    },
    stop: () => {
      if (!recording) return;
      try { recorder.stop(); } catch {}
      recording = false;
    },
    isRecording: () => recording,
    destroy: () => {
      if (recording) try { recorder.stop(); } catch {}
      if (timerInterval) clearInterval(timerInterval);
    },
  };
}

function getSupportedMimeType(): string | null {
  const isCapacitorLike =
    typeof window !== "undefined" &&
    (
      typeof (window as any)?.Capacitor !== "undefined" ||
      typeof (window as any)?.AndroidBridge !== "undefined" ||
      document?.URL?.startsWith("http://localhost") ||
      navigator?.userAgent?.includes("Capacitor")
    );
  const candidates = [
    // APK/WebView: prioritize plain H264 MP4; AAC variant fails on some Android WebViews.
    ...(isCapacitorLike ? ["video/mp4;codecs=h264", "video/mp4", "video/mp4;codecs=h264,aac"] : []),
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    ...(isCapacitorLike ? [] : ["video/mp4;codecs=h264,aac", "video/mp4"]),
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}
