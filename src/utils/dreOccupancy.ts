import type { DreImportData } from "../types";
import { groupValue, normalizeDreName } from "./dreInventory";

// Occupancy is a group-level metric, including the property's associated
// costs, not only its rent line. Do not add its detail to its subtotal again.
const occupancyName = /\b(LOCACAO|ALUGUEL|ALUGUEIS|OCUPACAO|CONCESSIONARIAS?|CONDOMINIOS?|IMOVEL|IMOVEIS)\b/;

export function getDreOccupancyValue(data: DreImportData): number {
  const groups = new Map<string, number>();
  for (const section of data.sections) {
    if (/\bRECEITAS?\b/.test(normalizeDreName(section.label))) continue;
    for (const group of section.groups) {
      if (occupancyName.test(normalizeDreName(group.label))) {
        groups.set(`${section.label}::${group.label}`, groupValue(group));
      }
    }
  }
  return [...groups.values()].reduce((total, value) => total + value, 0);
}
