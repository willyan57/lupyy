// lib/gl/filterLuts.ts
import type { FilterId } from "@/lib/mediaFilters/applyFilterAndExport";

/**
 * Fonte genérica de LUT: pode ser um require() estático ou um URI.
 * No seu LutRenderer atual você já usa algo assim.
 */
export type LutSource = number | string | null;

/**
 * Retorna a LUT correspondente ao filtro selecionado.
 * Por enquanto está com `null` como placeholder para não quebrar nada.
 * Na próxima mini-etapa a gente pluga aqui os requires reais dos PNGs.
 */
export function getLutForFilter(filter: FilterId): LutSource {
  switch (filter) {
    case "warm":
      // TODO: substituir pelo asset real
      // ex: return require("@/assets/luts/warm.png");
      return null;

    case "cool":
      // ex: return require("@/assets/luts/cool.png");
      return null;

    case "pink":
      // ex: return require("@/assets/luts/pink.png");
      return null;

    case "gold":
      // ex: return require("@/assets/luts/gold.png");
      return null;

    case "night":
      // ex: return require("@/assets/luts/night.png");
      return null;

    case "none":
    default:
      return null;
  }
}
