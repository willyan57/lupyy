import * as ImageManipulator from "expo-image-manipulator";

export type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";
export type MediaType = "image" | "video";

export type QuickAdjustmentId = "none" | "brighten" | "darken" | "vivid";

export type ExportEffects = {
  filter: FilterId;
  quickAdjustment: QuickAdjustmentId;
  beautify: Record<string, number>;
};

export type ApplyFilterArgs = {
  uri: string;
  mediaType: MediaType;
  effects: ExportEffects;
};

/**
 * Export "base" (re-encode) para garantir arquivo estável.
 * - LUT/GL acontece fora daqui (OffscreenLutRenderer), porque ImageManipulator não aplica cor/LUT.
 * - Aqui só fazemos um no-op controlado quando existe qualquer efeito selecionado.
 */
function shouldReencode(effects: ExportEffects) {
  if (effects.filter !== "none") return true;
  if (effects.quickAdjustment !== "none") return true;
  // Qualquer ajuste de embelezar != 60 dispara reencode
  return Object.values(effects.beautify || {}).some((v) => typeof v === "number" && v !== 60);
}

export async function applyFilterAndExport(
  argsOrUri: ApplyFilterArgs | string,
  mediaType?: MediaType,
  filter?: FilterId
): Promise<string> {
  // Compat: assinatura antiga applyFilterAndExport(uri, mediaType, filter)
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

  // Só tratamos foto aqui
  if (args.mediaType !== "image") return args.uri;

  const effects = args.effects ?? { filter: "none", quickAdjustment: "none", beautify: {} };

  if (!shouldReencode(effects)) {
    return args.uri;
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      args.uri,
      [{ rotate: 0 }], // no-op que força export
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
