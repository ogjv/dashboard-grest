import { describe, expect, it } from "vitest";
import type { DreImportData, DreInventoryConfig, DrePeriodData } from "../types";
import { combineDreAnalysis, prepareDrePeriods } from "./dreAnalysis";
import { defaultDreInventory, getInventoryReport, groupValue, inventoryGroupOptions, normalizeDreInventory, parseInventoryAmount, previousInventoryPeriod } from "./dreInventory";

const line = (label: string, value: number) => ({ label, value, rowNumber: 1 });
const section = (label: string, groups: Array<[string, number]>) => ({ label, groups: groups.map(([name, value]) => ({ label: name, lines: [line("Compras ou lançamentos", value)], total: line(`TOTAL ${name}`, value) })), total: line(`TOTAL ${label}`, groups.reduce((sum, [, value]) => sum + value, 0)) });
const make = (key = "2026-09"): DrePeriodData => ({ key, label: key, data: { sheetName: "DRE", period: { year: Number(key.slice(0, 4)), month: Number(key.slice(5)), rawLabel: key }, sections: [section("RECEITAS OPERACIONAIS", [["BAR", 1000]]), section("DEDUCOES COM VENDAS", [["IMPOSTOS", 100]]), section("CMV", [["BAR", 200], ["COZINHA", 300], ["ACESSORIOS", 50]]), section("DESPESAS OPERACIONAIS", [["CMO", 100]]), section("RECEITAS NAO OPERACIONAIS", [["OUTRAS RECEITAS", 50]]), section("DESPESAS NAO OPERACIONAIS", [["OUTRAS SAIDAS", 30]])], summary: [line("TOTAL RECEITAS OPERACIONAIS", 1000), line("RECEITA LÍQUIDA", 900), line("TOTAL CMV", 550), line("MARGEM DE CONTRIBUIÇÃO", 350), line("RESULTADO OPERACIONAL", 250), line("TOTAL DESPESAS", 680), line("SALDO FINAL", 370), { ...line("(RO) RECEITA OPERACIONAL", 0), percent: 25 }, { ...line("(RL) RECEITA LIQUIDA", 0), percent: 27.78 }, { ...line("(MC) MARGEM CONTRIBUICAO", 0), percent: 71.43 }] } });
const readers = { revenue: (data: DreImportData) => data.summary.find(item => item.label === "TOTAL RECEITAS OPERACIONAIS")?.value ?? 0, inputs: (data: DreImportData) => data.sections.filter(item => item.label === "CMV").reduce((sum, item) => sum + item.groups.reduce((total, group) => total + groupValue(group), 0), 0) };
const configure = (period: DrePeriodData, periods = [period]): DreInventoryConfig => ({ ...defaultDreInventory(period, periods), enabled: true, bar: { ...defaultDreInventory(period, periods).bar, openingMode: "manual", opening: 100, closing: 150 }, kitchen: { ...defaultDreInventory(period, periods).kitchen, openingMode: "manual", opening: 80, closing: 60 } });

describe("DRE inventory and closing", () => {
  it("deducts sales deductions once whether or not the source closing already included them", () => {
    const period = make();
    expect(prepareDrePeriods([period], readers)[0].data.analysis).toMatchObject({ deductions: 100, netRevenue: 900, totalExpenses: 780, finalBalance: 270, operationalResult: 250, originalFinalBalance: 370 });
    period.data.summary.find(item => item.label === "SALDO FINAL")!.value = 270;
    period.data.summary.find(item => item.label === "TOTAL DESPESAS")!.value = 780;
    expect(prepareDrePeriods([period], readers)[0].data.analysis?.finalBalance).toBe(270);
  });
  it("reproduces the guide closing after deductions, without changing stock again", () => {
    const period = make();
    period.data.sections = [section("RECEITAS OPERACIONAIS", [["Vendas", 66285.5]]), section("DEDUCOES COM VENDAS", [["Deduções", 2666.24]]), section("CMV", [["CMV do arquivo", 19151.42]]), section("DESPESAS OPERACIONAIS", [["Despesas", 31595.64]]), section("DESPESAS NAO OPERACIONAIS", [["Saídas", 3453.74]])];
    period.data.summary = [line("TOTAL RECEITAS OPERACIONAIS", 66285.5), line("SALDO FINAL", 12084.7)];
    const result = prepareDrePeriods([period], readers)[0].data;
    expect(result.analysis).toMatchObject({ finalBalance: 9418.46, operationalResult: 12872.2, totalExpenses: 56867.04, nonOperationalExpenses: 3453.74, operationalExpenses: 31595.64, cmv: 19151.42, deductions: 2666.24, otherExpenses: 0 });
    expect(result.summary.find(item => item.label === "TOTAL DESPESAS")?.value).toBe(56867.04);
  });
  it("adds the four expense blocks once, with deductions available only in the summary", () => {
    const period = make();
    period.data.sections = period.data.sections.filter(item => item.label !== "DEDUCOES COM VENDAS");
    period.data.summary.push(line("TOTAL DEDUCOES COM VENDAS", 100));
    period.inventory = configure(period);
    const result = prepareDrePeriods([period], readers)[0].data.analysis!;
    expect(result.totalExpenses).toBe(750);
    expect(result.totalExpenses).toBe(result.nonOperationalExpenses + result.operationalExpenses + result.cmv + result.deductions);
    expect(result.finalBalance).toBe(300);
  });
  it("preserves additional customer expense blocks in the closing and consolidated breakdown", () => {
    const period = make();
    period.data.sections.push(section("OUTRAS SAIDAS", [["Ajuste", 20]]));
    const prepared = prepareDrePeriods([period, make("2026-08")], readers);
    expect(prepared[0].data.analysis).toMatchObject({ otherExpenses: 20, totalExpenses: 800, finalBalance: 250 });
    expect(combineDreAnalysis(prepared)).toMatchObject({ nonOperationalExpenses: 60, operationalExpenses: 200, otherExpenses: 20, deductions: 200, cmv: 1100, totalExpenses: 1580, finalBalance: 520 });
  });
  it("applies both stock signs only to the mapped groups and preserves the original import", () => {
    const period = make(); period.inventory = configure(period);
    const original = JSON.stringify(period);
    const result = prepareDrePeriods([period], readers)[0];
    expect(result.data.analysis).toMatchObject({ inventoryStatus: "applied", purchases: 550, stockAdjustment: -30, cmv: 520, operationalResult: 280, finalBalance: 300 });
    expect(result.data.sections[2].groups.map(group => groupValue(group))).toEqual([150, 320, 50]);
    const barLines = result.data.sections[2].groups[0].lines;
    expect(barLines[barLines.length - 1]?.percent).toBe(-5);
    expect(result.data.summary.find(item => item.label === "(RO) RECEITA OPERACIONAL")?.percent).toBeCloseTo(28);
    expect(result.data.summary.find(item => item.label === "(RL) RECEITA LIQUIDA")?.percent).toBeCloseTo(31.11111);
    expect(JSON.stringify(period)).toBe(original);
    expect(prepareDrePeriods([result], readers)[0]).toBe(result);
  });
  it("carries the immediately previous closing, across years, and propagates corrections dynamically", () => {
    const december = make("2025-12"); december.inventory = configure(december);
    const january = make("2026-01"); january.inventory = { ...defaultDreInventory(january, [december, january]), enabled: true };
    january.inventory.bar.closing = 140; january.inventory.kitchen.closing = 65;
    expect(getInventoryReport(january, [january, december]).groups.map(group => group.initial)).toEqual([150, 60]);
    expect(prepareDrePeriods([december, january], readers)[1].data.analysis?.stockAdjustment).toBe(5);
    december.inventory.bar.closing = 160;
    expect(prepareDrePeriods([january, december], readers)[0].data.analysis?.stockAdjustment).toBe(15);
  });
  it("does not bridge a missing month or assume empty initial/final values are zero", () => {
    const july = make("2026-07"); july.inventory = configure(july);
    const september = make(); september.inventory = configure(september);
    september.inventory.bar.openingMode = "previous";
    expect(previousInventoryPeriod(september, [july, september])).toBeUndefined();
    expect(prepareDrePeriods([july, september], readers)[1].data.analysis).toMatchObject({ inventoryStatus: "pending", stockAdjustment: 0, cmv: 550 });
    september.inventory.bar.openingMode = "manual"; september.inventory.kitchen.closing = undefined;
    expect(getInventoryReport(september, [september]).status).toBe("pending");
  });
  it("accepts genuine zeros and leaves financial ratios undefined without a revenue base", () => {
    const period = make(); period.inventory = configure(period);
    for (const key of ["bar", "kitchen"] as const) { period.inventory[key].opening = 0; period.inventory[key].closing = 0; }
    expect(getInventoryReport(period, [period]).status).toBe("applied");
    period.data.sections[0] = section("RECEITAS OPERACIONAIS", [["Vendas", 0]]);
    period.data.summary.find(line => line.label === "TOTAL RECEITAS OPERACIONAIS")!.value = 0;
    const calculated = prepareDrePeriods([period], readers)[0].data;
    expect(calculated.analysis?.closingStatus).toBe("calculated");
    expect(calculated.analysis?.finalBalance).toBe(-730);
    expect(calculated.summary.find(line => line.label === "SALDO FINAL")?.percent).toBeUndefined();
  });
  it("rejects ambiguous mappings, duplicate group use, double stock adjustment and impossible stock balances", () => {
    const period = make(); period.inventory = configure(period);
    period.inventory.kitchen.groupId = period.inventory.bar.groupId;
    expect(getInventoryReport(period, [period]).issues.join(" ")).toContain("grupos diferentes");
    period.inventory = configure(period); period.inventory.bar.closing = 1000;
    expect(getInventoryReport(period, [period]).status).toBe("pending");
    period.inventory = configure(period); period.data.sections[2].groups[0].lines.push(line("VARIACAO ESTOQUE BAR", -10));
    expect(getInventoryReport(period, [period]).issues.join(" ")).toContain("já contém");
    period.data.sections[2].groups.push({ ...period.data.sections[2].groups[0] });
    expect(getInventoryReport(period, [period]).issues.join(" ")).toContain("selecione um grupo");
  });
  it("uses explicit customer mappings instead of guessing nonstandard names", () => {
    const period = make(); period.data.sections[2].groups[0].label = "CAFETERIA";
    expect(defaultDreInventory(period, [period]).bar.groupId).toBeUndefined();
    period.inventory = configure(period); period.inventory.bar.groupId = inventoryGroupOptions(period)[0].id;
    expect(getInventoryReport(period, [period]).status).toBe("applied");
  });
  it("disabling stock restores purchases, but keeps the corrected closing and the saved inventory", () => {
    const period = make(); period.inventory = configure(period); period.inventory.enabled = false;
    expect(prepareDrePeriods([period], readers)[0].data.analysis).toMatchObject({ inventoryStatus: "off", cmv: 550, finalBalance: 270 });
    expect(period.inventory.bar.closing).toBe(150);
  });
  it("consolidates adjusted months instead of treating stock as an extra purchase", () => {
    const one = make("2026-08"); one.inventory = configure(one);
    const two = make(); two.inventory = configure(two); two.inventory.enabled = false;
    expect(combineDreAnalysis(prepareDrePeriods([one, two], readers))).toMatchObject({ inventoryStatus: "mixed", purchases: 1100, cmv: 1070, stockAdjustment: -30, finalBalance: 570 });
  });
  it("retains the source closing when a required expense section is missing", () => {
    const period = make(); period.data.sections = period.data.sections.filter(item => item.label !== "DESPESAS OPERACIONAIS");
    const result = prepareDrePeriods([period], readers)[0];
    expect(result.data.analysis?.closingStatus).toBe("unavailable");
    expect(result.data.summary.find(item => item.label === "SALDO FINAL")?.value).toBe(370);
  });
  it("normalizes persisted settings and parses Brazilian amounts without converting missing input to zero", () => {
    const period = make(); const settings = configure(period);
    expect(normalizeDreInventory(JSON.parse(JSON.stringify(settings)))).toMatchObject(settings);
    expect(parseInventoryAmount("1.234,56")).toBe(1234.56);
    expect(parseInventoryAmount("1234.56")).toBe(1234.56);
    expect(parseInventoryAmount("0,00")).toBe(0);
    for (const value of ["", "-1", "abc", "1,234", "1,2,3", "NaN"]) expect(parseInventoryAmount(value)).toBeUndefined();
  });
  it("adjusts any number of additional groups without changing the original imports", () => {
    const period = make();
    period.data.sections[2].groups.push(section("CMV", [["PADARIA", 80]]).groups[0]);
    period.inventory = configure(period);
    period.inventory.additionalGroups = inventoryGroupOptions(period).slice(2).map((option, index) => ({ id: `extra-${index}`, label: option.groupLabel, groupId: option.id, openingMode: "manual", opening: 20, closing: 30 }));
    const original = JSON.stringify(period);
    const result = prepareDrePeriods([period], readers)[0];
    expect(getInventoryReport(period, [period]).groups).toHaveLength(4);
    expect(result.data.analysis).toMatchObject({ inventoryStatus: "applied", purchases: 630, stockAdjustment: -50, cmv: 580, finalBalance: 240 });
    expect(result.data.sections[2].groups.map(groupValue)).toEqual([150, 320, 40, 70]);
    expect(JSON.stringify(period)).toBe(original);
    expect(normalizeDreInventory(JSON.parse(JSON.stringify(period.inventory)))?.additionalGroups).toEqual(period.inventory.additionalGroups);
  });
  it("inherits additional groups and their source mappings across months and year boundaries", () => {
    const december = make("2025-12"); december.inventory = configure(december);
    december.inventory.additionalGroups = [{ id: "extra", label: "Acessórios", groupId: inventoryGroupOptions(december)[2].id, openingMode: "manual", opening: 20, closing: 30 }];
    const january = make("2026-01");
    january.inventory = defaultDreInventory(january, [december, january]);
    expect(january.inventory.additionalGroups?.[0]).toMatchObject({ id: "extra", openingMode: "previous", groupId: inventoryGroupOptions(january)[2].id });
    january.inventory.bar.closing = 150; january.inventory.kitchen.closing = 60; january.inventory.additionalGroups![0].closing = 35;
    expect(getInventoryReport(january, [january, december]).groups.map(group => group.initial)).toEqual([150, 60, 30]);
    expect(prepareDrePeriods([december, january], readers)[1].data.analysis).toMatchObject({ stockAdjustment: -5, finalBalance: 275 });
    december.inventory.additionalGroups[0].closing = 40;
    expect(getInventoryReport(january, [january, december]).groups[2].initial).toBe(40);
    expect(prepareDrePeriods([december, january], readers)[1].data.analysis?.stockAdjustment).toBe(5);
    december.inventory.additionalGroups = [];
    expect(getInventoryReport(january, [january, december])).toMatchObject({ status: "pending" });
    expect(getInventoryReport(january, [january, december]).groups[2].initial).toBeUndefined();
  });
  it("blocks duplicate additional mappings, missing values, and stock linked to a different source group", () => {
    const previous = make("2026-08"); previous.inventory = configure(previous);
    const period = make(); period.inventory = configure(period);
    period.inventory.additionalGroups = [{ id: "extra", label: "Terceiro", groupId: period.inventory.bar.groupId, openingMode: "manual", opening: 0, closing: 0 }];
    expect(getInventoryReport(period, [previous, period]).issues.join(" ")).toContain("grupos diferentes");
    period.inventory.additionalGroups[0].groupId = inventoryGroupOptions(period)[2].id;
    period.inventory.additionalGroups[0].closing = undefined;
    expect(getInventoryReport(period, [previous, period]).status).toBe("pending");
    period.inventory.additionalGroups = [];
    period.inventory.bar.groupId = inventoryGroupOptions(period)[2].id;
    period.inventory.bar.openingMode = "previous";
    expect(getInventoryReport(period, [previous, period]).groups[0].initial).toBeUndefined();
    expect(prepareDrePeriods([previous, period], readers)[1].data.analysis?.stockAdjustment).toBe(0);
  });
  it("removing an additional group restores its unadjusted purchases only", () => {
    const period = make(); period.inventory = configure(period);
    period.inventory.additionalGroups = [{ id: "extra", label: "Acessórios", groupId: inventoryGroupOptions(period)[2].id, openingMode: "manual", opening: 20, closing: 30 }];
    expect(prepareDrePeriods([period], readers)[0].data.analysis?.finalBalance).toBe(310);
    period.inventory.additionalGroups = [];
    expect(prepareDrePeriods([period], readers)[0].data.analysis).toMatchObject({ cmv: 520, stockAdjustment: -30, finalBalance: 300 });
  });
});
