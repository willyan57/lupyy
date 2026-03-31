import * as ImageManipulator from "expo-image-manipulator";

export type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night"
  | "cinematic_gold" | "blue_teal" | "pastel_dream" | "tokyo_night" | "desert_warm"
  | "vintage_film" | "sakura" | "neon_glow" | "miami_vibes" | "deep_contrast"
  | "moody_forest" | "winter_lowsat" | "summer_pop" | "aqua_fresh" | "pink_rose"
  | "sepia_clean" | "urban_grit" | "cream_tone";
export type MediaType = "image" | "video";
export type QuickAdjustmentId = "none" | "brighten" | "darken" | "vivid";

export type ExportEffects = {
  filter: FilterId;
  quickAdjustment: QuickAdjustmentId | string;
  beautify: Record<string, any>;
};

export type ApplyFilterArgs = {
  uri: string;
  mediaType: MediaType;
  effects: ExportEffects;
};

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
            filter: (filter ?? "none") as FilterId,
            quickAdjustment: "none",
            beautify: {},
          },
        }
      : argsOrUri;

  if (!args.uri) return args.uri;
  if (args.mediaType !== "image") return args.uri;

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
