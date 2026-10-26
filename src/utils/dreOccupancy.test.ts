import { describe, expect, it } from "vitest";
import type { DreImportData } from "../types";
import { getDreOccupancyValue } from "./dreOccupancy";

const line = (label: string, value: number) => ({ label, value, rowNumber: 1 });
const data = (label: string): DreImportData => ({ sheetName: "DRE", summary: [], sections: [{ label: "DESPESAS OPERACIONAIS", groups: [{ label, lines: [line("Aluguel", 100), line("IPTU", 20)], total: line("TOTAL", 120) }] }] });

describe("DRE occupancy identification", () => {
  it.each(["Imóvel", "IMOVEL", "Imóveis", "imoveis", "DESPESAS COM IMÓVEL", "Locação", "Taxa de locação", "Aluguel", "Aluguéis", "Ocupação", "Concessionárias", "Condomínio"])("recognizes %s without double counting subtotals", label => {
    expect(getDreOccupancyValue(data(label))).toBe(120);
  });
  it("uses details when the occupancy subtotal is absent and preserves negative adjustments", () => {
    const input = data("Imóvel");
    input.sections[0].groups[0].total = undefined;
    input.sections[0].groups[0].lines.push(line("Estorno", -10));
    expect(getDreOccupancyValue(input)).toBe(110);
  });
  it("does not infer occupancy from unrelated material, investment or revenue labels", () => {
    expect(getDreOccupancyValue(data("MATERIAL IMOBILIARIO"))).toBe(0);
    const input = data("IMÓVEL");
    input.sections[0].label = "RECEITAS NAO OPERACIONAIS";
    expect(getDreOccupancyValue(input)).toBe(0);
  });
  it("retains the existing sum of occupancy and utilities groups, but not their summary copies", () => {
    const input = data("IMÓVEL");
    input.sections[0].groups.push({ label: "CONCESSIONARIAS", lines: [line("Luz", 30)] });
    input.summary.push(line("TOTAL IMOVEL", 120));
    expect(getDreOccupancyValue(input)).toBe(150);
  });
});
