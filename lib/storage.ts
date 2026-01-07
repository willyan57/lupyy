import { decode } from "base64-arraybuffer";
import type { ImagePickerAsset } from "expo-image-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { v4 as uuidv4 } from "uuid";
import { compressImage } from "./media";
import { supabase } from "./supabase";

export type UploadedStory = {
  fileName: string;
  publicUrl: string;
  type: "image" | "video";
  filter?: string;
};

async function readUriAsBase64Data(uri: string): Promise<string> {
  if (uri.startsWith("file:") || uri.startsWith(FileSystem.cacheDirectory ?? "") || uri.startsWith(FileSystem.documentDirectory ?? "")) {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return base64;
  }

  const response = await fetch(uri);
  const blob = await response.blob();

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = reader.result;
      if (typeof value === "string") resolve(value);
      else reject(new Error("Falha ao converter arquivo para base64"));
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsDataURL(blob);
  });

  const parts = base64.split("base64,");
  const base64Data = parts[1];
  if (!base64Data) throw new Error("Base64 inválido");
  return base64Data;
}

export async function uploadStoryMediaFromUri(
  uri: string,
  type: "image" | "video",
  filter?: string
): Promise<UploadedStory | null> {
  let finalUri = uri;

  if (type === "image") {
    try {
      finalUri = await compressImage(uri);
    } catch {
      finalUri = uri;
    }
  }

  const ext = type === "image" ? "jpg" : "mp4";
  const fileName = `story_${uuidv4()}_${Date.now()}.${ext}`;

  const base64Data = await readUriAsBase64Data(finalUri);
  const buffer = decode(base64Data);

  const { error: uploadError } = await supabase.storage.from("stories").upload(fileName, buffer, {
    contentType: type === "image" ? "image/jpeg" : "video/mp4",
    upsert: false,
  });

  if (uploadError) {
    console.log(uploadError);
    return null;
  }

  const { data } = supabase.storage.from("stories").getPublicUrl(fileName);
  if (!data?.publicUrl) return null;

  return {
    fileName,
    publicUrl: data.publicUrl,
    type,
    filter,
  };
}

export async function uploadStory(filter?: string): Promise<UploadedStory | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.8,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return null;

  const file = result.assets[0] as ImagePickerAsset;
  const uri = file.uri;
  const type = file.type === "video" ? "video" : "image";

  return uploadStoryMediaFromUri(uri, type, filter);
}
