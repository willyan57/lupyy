// lib/gl/filterLuts.ts
import type { FilterId } from "@/lib/mediaFilters/applyFilterAndExport";

/**
 * Fonte de LUT:
 * - number: require("...png") (Metro bundler)
 * - string: URI (se você quiser carregar remoto no futuro)
 */
export type LutSource = number | string | null;

export function getLutForFilter(filter: FilterId): LutSource {
  switch (filter) {
    case "warm":
      return require("@/assets/luts/warm.png");
    case "cool":
      return require("@/assets/luts/cool.png");
    case "pink":
      return require("@/assets/luts/pink.png");
    case "gold":
      return require("@/assets/luts/gold.png");
    case "night":
      return require("@/assets/luts/night.png");
    case "none":
    default:
      return null;
  }
}
