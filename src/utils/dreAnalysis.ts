import type { DreImportData, DreLine, DrePeriodData } from "../types";
import { getInventoryReport, groupValue, isDreCostSection, moneyRound, normalizeDreName } from "./dreInventory";

type Readers = { revenue: (data: DreImportData) => number; inputs: (data: DreImportData) => number };
const sectionValue = (section: DreImportData["sections"][number]) => section.groups.length > 0 ? section.groups.reduce((sum, group) => sum + groupValue(group), 0) : section.total?.value ?? 0;
const name = (line: { label: string }) => normalizeDreName(line.label);
const isRevenue = (label: string) => /\bRECEITAS?\b/.test(normalizeDreName(label)) && !/LIQUIDA|DEDUC|RESULTADO|MARGEM/.test(normalizeDreName(label));
const isNonOperational = (label: string) => /NAO OPERACIONA/.test(normalizeDreName(label));
const isDeduction = (label: string) => /DEDUC|DEDU[ÇC]/.test(normalizeDreName(label));
const isOperationalExpense = (label: string) => /DESPESAS? OPERACIONA|GASTOS? OPERACIONA|DESPESAS? FIXAS|GASTOS? FIXOS|ESTRUTURA/.test(normalizeDreName(label)) && !isNonOperational(label);
const monetary = (line: DreLine) => !/PERCENTUAL|^\((RO|RL|MC)\)/.test(name(line));

/** Derive a read-only analysis from original imports. Never persist this result
 * over the source workbook data. Section totals are used once, not together
 * with their subtotals or summary copies. */
export function prepareDrePeriods(periods: DrePeriodData[], readers: Readers): DrePeriodData[] {
  return periods.map(period => {
    if (period.data.analysis) return period;
    const original = period.data;
    const inventory = getInventoryReport(period, periods);
    const data: DreImportData = { ...original, sections: original.sections.map(section => ({ ...section, total: section.total ? { ...section.total } : undefined, groups: section.groups.map(group => ({ ...group, total: group.total ? { ...group.total } : undefined, lines: group.lines.map(line => ({ ...line })) })) })), summary: original.summary.map(line => ({ ...line })) };
    const grossRevenue = readers.revenue(original);
    const ratio = (value: number) => grossRevenue > 0 ? value / grossRevenue * 100 : undefined;
    if (inventory.status === "applied") {
      for (const stock of inventory.groups) {
        const target = stock.option!;
        const section = data.sections[target.sectionIndex];
        const group = section.groups[target.groupIndex];
        const adjustment: DreLine = { label: `Variação de estoque — ${stock.label}`, value: stock.variation!, percent: ratio(stock.variation!), rowNumber: -1 };
        group.lines.push(adjustment);
        if (group.total) { group.total.value = stock.real!; group.total.percent = ratio(stock.real!); }
        if (section.total) { section.total.value = moneyRound(section.total.value + stock.variation!); section.total.percent = ratio(section.total.value); }
      }
    }
    for (const section of data.sections) {
      if (section.total && section.groups.length > 0) {
        section.total.value = moneyRound(section.groups.reduce((sum, group) => sum + groupValue(group), 0));
        section.total.percent = ratio(section.total.value);
      }
    }
    const purchases = readers.inputs(original);
    const adjustment = inventory.status === "applied" ? inventory.total : 0;
    const cmv = moneyRound(purchases + adjustment);
    const sum = (predicate: (label: string) => boolean) => moneyRound(data.sections.filter(section => predicate(section.label)).reduce((total, section) => total + sectionValue(section), 0));
    const deductionSections = data.sections.filter(section => isDeduction(section.label));
    const deductionSummary = original.summary.find(line => monetary(line) && isDeduction(line.label) && name(line).includes("TOTAL"));
    const netSummary = original.summary.find(line => monetary(line) && name(line).includes("RECEITA LIQUIDA"));
    const deductions = deductionSections.length > 0 ? sum(isDeduction) : deductionSummary?.value ?? (netSummary ? moneyRound(grossRevenue - netSummary.value) : 0);
    const netRevenue = moneyRound(grossRevenue - deductions);
    const otherRevenue = sum(label => isRevenue(label) && isNonOperational(label));
    const operationalSections = data.sections.filter(section => isOperationalExpense(section.label));
    const operationalSummary = original.summary.find(line => monetary(line) && name(line).includes("TOTAL") && isOperationalExpense(line.label));
    const operationalExpenses = operationalSections.length > 0 ? sum(isOperationalExpense) : operationalSummary?.value;
    const originalOperational = original.summary.find(line => monetary(line) && name(line).includes("RESULTADO OPERACIONAL"))?.value;
    const originalFinal = original.summary.find(line => monetary(line) && /SALDO FINAL|RESULTADO FINAL/.test(name(line)))?.value;
    const originalExpenses = original.summary.find(line => monetary(line) && /TOTAL (DESPESAS|GASTOS)$/.test(name(line)))?.value;
    const hasCmv = data.sections.some(section => isDreCostSection(section.label));
    // Do not invent an operational-expense block or assume incomplete DREs are
    // reconciled. Such files keep their source results with an explicit note.
    const closingIssues: string[] = [];
    const hasRevenue = data.sections.some(section => isRevenue(section.label) && !isNonOperational(section.label)) || original.summary.some(line => monetary(line) && /RECEITAS? OPERACIONA/.test(name(line)));
    if (!Number.isFinite(grossRevenue) || grossRevenue < 0 || !hasRevenue) closingIssues.push("Receita operacional não identificada de forma confiável para conferir o fechamento.");
    if (!hasCmv) closingIssues.push("Bloco de insumos/CMV não identificado para conferir o fechamento.");
    if (operationalExpenses === undefined) closingIssues.push("Despesas operacionais não identificadas para conferir o resultado.");
    if (data.sections.some(section => /RESULTADO|MARGEM|SALDO|RECEITA LIQUIDA/.test(name(section)))) closingIssues.push("Há seções de resultado misturadas às movimentações. Revise a classificação antes de recalcular o fechamento.");
    const calculated = closingIssues.length === 0;
    const contribution = moneyRound(netRevenue - cmv);
    const operationalResult = calculated ? moneyRound(contribution - operationalExpenses!) : originalOperational !== undefined ? moneyRound(originalOperational - adjustment) : contribution;
    const nonOperationalExpenses = sum(label => !isRevenue(label) && !isDeduction(label) && !isDreCostSection(label) && !isOperationalExpense(label) && isNonOperational(label));
    // Preserve any additional customer-specific expense sections, without
    // counting section totals, subtotals or summary copies a second time.
    const otherExpenses = sum(label => !isRevenue(label) && !isDeduction(label) && !isDreCostSection(label) && !isOperationalExpense(label) && !isNonOperational(label));
    const totalExpenses = moneyRound(nonOperationalExpenses + (operationalExpenses ?? 0) + cmv + deductions + otherExpenses);
    const totalRevenue = moneyRound(grossRevenue + otherRevenue);
    const finalBalance = calculated ? moneyRound(totalRevenue - totalExpenses) : originalFinal !== undefined ? moneyRound(originalFinal - adjustment) : operationalResult;
    const writeSummary = (label: string, value: number) => {
      const normalized = normalizeDreName(label);
      const existing = data.summary.find(line => name(line) === normalized);
      if (existing) { existing.value = value; existing.percent = ratio(value); }
      else data.summary.push({ label, value, percent: ratio(value), rowNumber: -1 });
    };
    // Monetary totals and percentage-only rows are kept distinct. No percentage
    // is summed as currency, and every denominator is checked for zero.
    for (const line of data.summary) {
      if (!monetary(line)) continue;
      const label = name(line);
      if (/TOTAL/.test(label) && isDreCostSection(label)) { line.value = moneyRound(line.value + adjustment); line.percent = ratio(line.value); }
      if (!calculated) {
        if (/RESULTADO OPERACIONAL|SALDO FINAL|RESULTADO FINAL|MARGEM DE CONTRIBUICAO/.test(label)) { line.value = moneyRound(line.value - adjustment); line.percent = ratio(line.value); }
        if (/^TOTAL (DESPESAS|GASTOS)$/.test(label)) { line.value = moneyRound(line.value + adjustment); line.percent = ratio(line.value); }
        continue;
      }
      if (label.includes("RECEITA LIQUIDA")) line.value = netRevenue;
      else if (label.includes("MARGEM DE CONTRIBUICAO")) line.value = contribution;
      else if (label.includes("RESULTADO OPERACIONAL")) line.value = operationalResult;
      else if (/SALDO FINAL|RESULTADO FINAL/.test(label)) line.value = finalBalance;
      else if (/^TOTAL (DESPESAS|GASTOS)$/.test(label)) line.value = totalExpenses;
      else if (label === "TOTAL RECEITAS") line.value = totalRevenue;
      line.percent = ratio(line.value);
    }
    if (calculated) {
      writeSummary("RECEITA LÍQUIDA", netRevenue);
      writeSummary("MARGEM DE CONTRIBUIÇÃO", contribution);
      writeSummary("RESULTADO OPERACIONAL", operationalResult);
      writeSummary("SALDO FINAL", finalBalance);
      writeSummary("TOTAL DESPESAS", totalExpenses);
      writeSummary("TOTAL RECEITAS", totalRevenue);
    }
    for (const line of data.summary.filter(line => !monetary(line))) {
      const label = name(line);
      const denominator = label.startsWith("(RL)") ? netRevenue : label.startsWith("(MC)") ? contribution : grossRevenue;
      const numerator = /^\((RO|RL|MC)\)/.test(label) ? operationalResult : label.includes("MARGEM DE CONTRIBUICAO") ? contribution : /SALDO FINAL|RESULTADO FINAL/.test(label) ? finalBalance : operationalResult;
      line.percent = denominator !== 0 ? numerator / denominator * 100 : undefined;
      line.value = 0;
    }
    data.analysis = { inventoryStatus: inventory.status, inventoryIssues: inventory.config.enabled ? inventory.issues : [], stockAdjustment: adjustment, sourceStockAdjustment: inventory.sourceStockAdjustment, purchases, cmv, grossRevenue, deductions, netRevenue, otherRevenue, operationalExpenses: operationalExpenses ?? 0, nonOperationalExpenses, otherExpenses, contribution, operationalResult, totalExpenses, totalRevenue, finalBalance, originalFinalBalance: originalFinal, originalOperationalResult: originalOperational, originalExpenses, closingStatus: calculated ? "calculated" : "unavailable", closingIssues };
    return { ...period, data };
  });
}

export function combineDreAnalysis(periods: DrePeriodData[]): DreImportData["analysis"] {
  const analyses = periods.map(period => period.data.analysis);
  if (analyses.length === 0 || analyses.some(item => !item)) return undefined;
  const items = analyses.filter((item): item is NonNullable<typeof item> => Boolean(item));
  const sum = (key: "stockAdjustment" | "purchases" | "cmv" | "grossRevenue" | "deductions" | "netRevenue" | "otherRevenue" | "operationalExpenses" | "nonOperationalExpenses" | "otherExpenses" | "contribution" | "operationalResult" | "totalExpenses" | "totalRevenue" | "finalBalance") => moneyRound(items.reduce((total, item) => total + item[key], 0));
  const result = { ...items[0] };
  for (const key of ["stockAdjustment", "purchases", "cmv", "grossRevenue", "deductions", "netRevenue", "otherRevenue", "operationalExpenses", "nonOperationalExpenses", "otherExpenses", "contribution", "operationalResult", "totalExpenses", "totalRevenue", "finalBalance"] as const) result[key] = sum(key);
  result.inventoryStatus = items.every(item => item.inventoryStatus === items[0].inventoryStatus) ? items[0].inventoryStatus : "mixed";
  result.closingStatus = items.every(item => item.closingStatus === "calculated") ? "calculated" : "unavailable";
  result.sourceStockAdjustment = items.some(item => item.sourceStockAdjustment);
  result.inventoryIssues = periods.flatMap(period => (period.data.analysis?.inventoryIssues ?? []).map(issue => `${period.label}: ${issue}`));
  result.closingIssues = periods.flatMap(period => (period.data.analysis?.closingIssues ?? []).map(issue => `${period.label}: ${issue}`));
  for (const key of ["originalFinalBalance", "originalOperationalResult", "originalExpenses"] as const) result[key] = items.every(item => item[key] !== undefined) ? moneyRound(items.reduce((total, item) => total + item[key]!, 0)) : undefined;
  return result;
}
