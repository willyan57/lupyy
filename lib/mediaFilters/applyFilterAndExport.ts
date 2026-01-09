import * as ImageManipulator from "expo-image-manipulator";

export type FilterId = "none" | "warm" | "cool" | "pink" | "gold" | "night";
export type MediaType = "image" | "video";

/**
 * Nesta etapa, só reprocessamos/comprimimos a FOTO de forma uniforme.
 * O "efeito" ainda não muda cor/brilho de verdade; isso entra depois com LUT/GL.
 */

function buildActions(filter: FilterId): ImageManipulator.Action[] {
  // rotate: 0 é uma operação "no-op" válida, só pra acionar o manipulateAsync.
  switch (filter) {
    case "warm":
    case "cool":
    case "pink":
    case "gold":
    case "night":
      return [{ rotate: 0 }];
    case "none":
    default:
      return [];
  }
}

export async function applyFilterAndExport(
  uri: string,
  mediaType: MediaType,
  filter: FilterId
): Promise<string> {
  if (!uri) return uri;

  // Só tratamos foto por enquanto
  if (mediaType !== "image") {
    return uri;
  }

  const actions = buildActions(filter);

  if (!actions.length) {
    return uri;
  }

  try {
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.92,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    if (!result || !result.uri) {
      return uri;
    }

    return result.uri;
  } catch {
    return uri;
  }
}
