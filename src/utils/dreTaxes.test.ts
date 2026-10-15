import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import type { DreGroup, DreImportData } from "../types";
import { getDreTaxValue } from "./dreTaxes";
import { parseDreSpreadsheetFile } from "./file";

const line = (label: string, value: number) => ({ label, value, rowNumber: 1 });
const data = (...groups: DreGroup[]): DreImportData => ({ sheetName: "DRE", sections: [{ label: "DESPESAS OPERACIONAIS", groups }], summary: [] });
const taxes = [line("COFINS", 12615.50), line("CSLL", 4541.58), line("ICMS", 2125.85), line("IRPJ", 4468.44), line("PIS", 2733.36)];

describe("DRE tax identification", () => {
  it("recognizes fiscal lines in sales deductions without treating all deductions as taxes", () => {
    expect(getDreTaxValue(data({ label: "DEDUÇÕES COM VENDAS", lines: [...taxes, line("COMISSÃO", 32698.24)], total: line("TOTAL DEDUCOES", 69426.72) }))).toBeCloseTo(26484.73, 2);
  });
  it("uses an identified tax group total only once", () => {
    expect(getDreTaxValue(data({ label: "IMPOSTOS", lines: taxes, total: line("TOTAL IMPOSTOS", 26484.73) }))).toBeCloseTo(26484.73, 2);
  });
  it("keeps payroll charges out of the revenue-tax metric", () => {
    expect(getDreTaxValue(data({ label: "CMO", lines: [line("IMPOSTO FGTS", 13396.61), line("IMPOSTO GPS", 7178.89), line("TAXAS E IMPOSTOS EVENTUAIS", 1485.87)] }))).toBe(0);
    expect(getDreTaxValue(data({ label: "IMPOSTOS", lines: [...taxes, line("FGTS", 10)], total: line("TOTAL", 26494.73) }))).toBeCloseTo(26484.73, 2);
  });
  it("matches standalone fiscal names, not incidental word fragments", () => {
    expect(getDreTaxValue(data({ label: "Outros", lines: [line("PIS/COFINS", 100), line("Simples Nacional", 50), line("ISSQN", 20), line("DAS", 30), line("PISOS E REVESTIMENTOS", 999), line("ASSISTENCIA", 999), line("TARIFA DAS VENDAS", 999)] }))).toBe(200);
  });
  it("preserves zero and negative adjustments", () => {
    expect(getDreTaxValue(data({ label: "Deduções", lines: [line("ICMS", 100), line("ESTORNO ICMS", -20), line("PIS", 0)] }))).toBe(80);
  });
  it("does not invent a tax breakdown for mixed fees and taxes", () => {
    expect(getDreTaxValue(data({ label: "IMOVEL", lines: [line("TAXAS E IMPOSTOS EVENTUAIS", 1485.87), line("LOCACAO DE EQUIPAMENTOS", 2311.11)] }))).toBe(0);
  });
  it("recognizes taxes after importing an XLS, without requiring a group named Impostos", async () => {
    const matrix = [
      ["Tipo de Análise: Competência", "", "Restaurante exemplo"],
      ["Período: 01/09/2026 a 30/09/2026", "", "DRE"], [],
      ["DEDUCOES COM VENDAS", "DEDUCOES COM VENDAS", "COFINS", 12615.5],
      ["", "", "CSLL", 4541.58], ["", "", "ICMS", 2125.85],
      ["", "", "IRPJ", 4468.44], ["", "", "PIS", 2733.36],
      ["", "TOTAL DEDUCOES COM VENDAS", "", 26484.73]
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), "DRE");
    const file = new File([XLSX.write(workbook, { type: "array", bookType: "biff8" })], "dre.xls");
    const imported = await parseDreSpreadsheetFile(file);
    expect(getDreTaxValue(imported)).toBeCloseTo(26484.73, 2);
  });
  // Optional local regression with the supplied client file. No client workbook
  // or its full financial contents is copied into the repository.
  it.runIf(Boolean(process.env.DRE_SAMPLE_PATH))("recognizes the supplied Nosso Ipanema workbook", async () => {
    const bytes = new Uint8Array(readFileSync(process.env.DRE_SAMPLE_PATH!));
    const imported = await parseDreSpreadsheetFile(new File([bytes], "dre.xls"));
    expect(getDreTaxValue(imported)).toBeCloseTo(26484.73, 2);
    expect(imported.sections.some(section => section.groups.some(group => group.lines.some(item => item.label === "COFINS")))).toBe(true);
  });
});
