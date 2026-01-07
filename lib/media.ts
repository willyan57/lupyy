import * as ImageManipulator from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";

export async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      {
        compress: 0.7,
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

export async function prepareVideo(uri: string): Promise<PreparedVideo> {
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(uri, {
      time: 500,
    });

    return {
      videoUri: uri,
      thumbUri: thumb.uri,
    };
  } catch (e) {
    console.log("prepareVideo error", e);
    return {
      videoUri: uri,
      thumbUri: null,
    };
  }
}
