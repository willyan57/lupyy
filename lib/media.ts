import * as ImageManipulator from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Platform } from "react-native";

export async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1440 } }],
      {
        compress: 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result.uri;
  } catch (e) {
    console.log("compressImage error", e);
    return uri;
  }
}

export type PreparedVideo = {
  videoUri: string;
  thumbUri: string | null;
};

/**
 * Web fallback: extract a video frame using <video> + <canvas>
 */
async function extractWebThumbnail(videoUri: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "auto";

      video.onloadeddata = () => {
        // Seek to 0.5s
        video.currentTime = 0.5;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(video.videoWidth, 1080);
          canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };

      video.onerror = () => resolve(null);

      // Timeout fallback
      setTimeout(() => resolve(null), 8000);

      video.src = videoUri;
      video.load();
    } catch {
      resolve(null);
    }
  });
}

export async function prepareVideo(uri: string): Promise<PreparedVideo> {
  // Try native first (works on APK)
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(uri, {
      time: 500,
    });

    return {
      videoUri: uri,
      thumbUri: thumb.uri,
    };
  } catch (e) {
    console.log("prepareVideo native error", e);
  }

  // Web fallback: use <video> + <canvas>
  if (Platform.OS === "web") {
    try {
      const webThumb = await extractWebThumbnail(uri);
      if (webThumb) {
        return { videoUri: uri, thumbUri: webThumb };
      }
    } catch (e) {
      console.log("prepareVideo web fallback error", e);
    }
  }

  return {
    videoUri: uri,
    thumbUri: null,
  };
}
