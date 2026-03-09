import * as ImageManipulator from "expo-image-manipulator";

export type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";
export type MediaType = "image" | "video";
export type QuickAdjustmentId = "none" | "bright" | "dark" | "punch";

export type ShaderAdjustments = {
  intensity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  smoothing?: number;
  warmth?: number;
  tintColor?: [number, number, number];
  tintStrength?: number;
};

export type ExportEffects = {
  filterId?: FilterId;
  filter?: FilterId;
  quickAdjustment?: QuickAdjustmentId;
  shaderAdjustments?: ShaderAdjustments;
  beautify?: {
    tab?: string;
    option?: string;
    values?: Record<string, number>;
  };
};

export type ApplyFilterArgs = {
  uri: string;
  mediaType: MediaType;
  effects: ExportEffects;
};

function hasCustomBeautify(effects: ExportEffects) {
  return Object.values(effects.beautify?.values ?? {}).some(
    (value) => typeof value === "number" && value !== 60
  );
}

function shouldReencode(effects: ExportEffects) {
  if ((effects.filterId ?? effects.filter ?? "none") !== "none") return true;
  if ((effects.quickAdjustment ?? "none") !== "none") return true;
  const shader = effects.shaderAdjustments;
  if (shader) {
    if ((shader.intensity ?? 0) > 0) return true;
    if ((shader.brightness ?? 0) !== 0) return true;
    if ((shader.contrast ?? 1) !== 1) return true;
    if ((shader.saturation ?? 1) !== 1) return true;
    if ((shader.smoothing ?? 0) > 0) return true;
    if ((shader.warmth ?? 0) !== 0) return true;
    if ((shader.tintStrength ?? 0) > 0) return true;
  }
  return hasCustomBeautify(effects);
}

export async function applyFilterAndExport(
  argsOrUri: ApplyFilterArgs | string,
  mediaType?: MediaType,
  filter?: FilterId
): Promise<string> {
  const args: ApplyFilterArgs =
    typeof argsOrUri === "string"
      ? {
          uri: argsOrUri,
          mediaType: (mediaType ?? "image") as MediaType,
          effects: {
            filterId: (filter ?? "none") as FilterId,
            quickAdjustment: "none",
            beautify: { values: {} },
          },
        }
      : argsOrUri;

  if (!args.uri || args.mediaType !== "image") {
    return args.uri;
  }

  const effects = args.effects ?? { filterId: "none", quickAdjustment: "none", beautify: { values: {} } };
  if (!shouldReencode(effects)) {
    return args.uri;
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      args.uri,
      [{ rotate: 0 }],
      {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result?.uri || args.uri;
  } catch {
    return args.uri;
  }
}

export default applyFilterAndExport;
