import type { FilterId } from "@/lib/mediaFilters/applyFilterAndExport";

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
