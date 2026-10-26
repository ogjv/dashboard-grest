import type { DreGroup, DreInventoryConfig, DreInventoryGroup, DrePeriodData } from "../types";

export const normalizeDreName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const moneyRound = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const groupValue = (group: DreGroup) => group.total?.value ?? group.lines.reduce((sum, line) => sum + line.value, 0);
export const isDreCostSection = (label: string) => /\b(CMV|INSUMOS)\b|CUSTOS? D[AE]S? MERCADORIAS|CUSTOS? DOS? PRODUTOS|COMPRAS DIRETAS|CUSTOS VARIAVEIS/.test(normalizeDreName(label));
const validAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100));

export function parseInventoryAmount(value: string): number | undefined {
  const text = value.trim().replace(/^R\$\s*/, "");
  if (!text) return undefined;
  let normalized = text;
  if (/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(text)) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return undefined;
  const number = Number(normalized);
  return validAmount(number) ? number : undefined;
}

export function normalizeDreInventory(value: unknown): DreInventoryConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<DreInventoryConfig>;
  const normalizeGroup = (item?: DreInventoryGroup): DreInventoryGroup => ({
    openingMode: item?.openingMode === "previous" ? "previous" : "manual",
    opening: validAmount(item?.opening) ? item.opening : undefined,
    closing: validAmount(item?.closing) ? item.closing : undefined,
    groupId: typeof item?.groupId === "string" ? item.groupId : undefined
  });
  const additionalGroups = Array.isArray(input.additionalGroups) ? input.additionalGroups.filter(item => item && typeof item.id === "string" && item.id.trim() && !["bar", "kitchen"].includes(item.id)).map(item => ({ ...normalizeGroup(item), id: item.id, label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "Grupo adicional" })) : [];
  return { enabled: input.enabled === true, bar: normalizeGroup(input.bar), kitchen: normalizeGroup(input.kitchen), additionalGroups, updatedAt: input.updatedAt, updatedBy: input.updatedBy };
}

export const inventoryConfigGroups = (config: DreInventoryConfig) => [
  { ...config.bar, id: "bar", label: "Bar" },
  { ...config.kitchen, id: "kitchen", label: "Cozinha" },
  ...(config.additionalGroups ?? [])
];

export function inventoryMonthKey(period: DrePeriodData): string | undefined {
  const year = period.data.period?.year;
  const month = period.data.period?.month;
  if (Number.isInteger(year) && Number.isInteger(month) && year && month && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}`;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period.key) ? period.key : undefined;
}
export function previousInventoryPeriod(period: DrePeriodData, periods: DrePeriodData[]) {
  const key = inventoryMonthKey(period);
  if (!key) return undefined;
  const [year, month] = key.split("-").map(Number);
  const previousKey = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const matches = periods.filter(item => inventoryMonthKey(item) === previousKey);
  return matches.length === 1 ? matches[0] : undefined;
}
export function inventoryGroupOptions(period: DrePeriodData) {
  return period.data.sections.flatMap((section, sectionIndex) => isDreCostSection(section.label) ? section.groups.map((group, groupIndex) => ({
    id: JSON.stringify([normalizeDreName(section.label), normalizeDreName(group.label)]),
    label: `${section.label} / ${group.label}`, groupLabel: group.label, sectionIndex, groupIndex, purchases: groupValue(group)
  })) : []);
}
export function defaultDreInventory(period: DrePeriodData, periods: DrePeriodData[]): DreInventoryConfig {
  const previous = normalizeDreInventory(previousInventoryPeriod(period, periods)?.inventory);
  const options = inventoryGroupOptions(period);
  const make = (key: "bar" | "kitchen", name: string): DreInventoryGroup => {
    const matches = options.filter(option => new RegExp(`\\b${name}\\b`).test(normalizeDreName(option.label.split(" / ").slice(1).join(" / "))));
    const groupId = previous?.[key].groupId ?? (matches.length === 1 ? matches[0].id : undefined);
    return { openingMode: validAmount(previous?.[key].closing) ? "previous" : "manual", groupId };
  };
  const additionalGroups = (previous?.additionalGroups ?? []).map(group => ({ id: group.id, label: group.label, groupId: group.groupId, openingMode: validAmount(group.closing) ? "previous" as const : "manual" as const }));
  return { enabled: previous?.enabled ?? false, bar: make("bar", "BAR"), kitchen: make("kitchen", "COZINHA"), additionalGroups };
}
export function getInventoryReport(period: DrePeriodData, periods: DrePeriodData[], config = normalizeDreInventory(period.inventory) ?? defaultDreInventory(period, periods)) {
  const previous = previousInventoryPeriod(period, periods);
  const previousConfig = normalizeDreInventory(previous?.inventory);
  const options = inventoryGroupOptions(period);
  const issues: string[] = [];
  const configuredGroups = inventoryConfigGroups(config);
  const previousGroups = previousConfig ? inventoryConfigGroups(previousConfig) : [];
  const groups = configuredGroups.map(input => {
    const key = input.id;
    const label = input.label;
    // Match the actual DRE group, not its screen position. Remapping a field
    // must never reuse an unrelated group's closing from the previous month.
    const previousMatches = previousGroups.filter(group => input.groupId && group.groupId === input.groupId);
    const previousGroup = previousMatches.length === 1 ? previousMatches[0] : undefined;
    const initial = input.openingMode === "previous" ? previousGroup?.closing : input.opening;
    const candidates = options.filter(option => option.id === input.groupId);
    const option = candidates.length === 1 ? candidates[0] : undefined;
    const variation = validAmount(initial) && validAmount(input.closing) ? moneyRound(initial - input.closing) : undefined;
    if (!option) issues.push(`${label}: selecione um grupo de compras identificado na DRE.`);
    if (!validAmount(initial)) issues.push(`${label}: estoque inicial pendente${input.openingMode === "previous" ? " no mês anterior" : ""}.`);
    if (!validAmount(input.closing)) issues.push(`${label}: informe o estoque final.`);
    const real = option && variation !== undefined ? moneyRound(option.purchases + variation) : undefined;
    if (real !== undefined && real < 0) issues.push(`${label}: o estoque final supera o inicial mais as compras. Revise os valores antes de aplicar.`);
    return { key, label, openingMode: input.openingMode, groupId: input.groupId, initial, closing: input.closing, variation, real, option, previousLabel: previous?.label };
  });
  if (!inventoryMonthKey(period)) issues.push("O período não tem mês e ano identificados; revise a identificação antes de aplicar estoque.");
  if (new Set(configuredGroups.map(group => group.id)).size !== configuredGroups.length) issues.push("Os grupos de estoque precisam ter identificadores diferentes.");
  const selectedIds = configuredGroups.map(group => group.groupId).filter((id): id is string => Boolean(id));
  if (new Set(selectedIds).size !== selectedIds.length) issues.push("Selecione grupos diferentes da DRE para cada ajuste de estoque.");
  const alreadyAdjusted = options.some(option => period.data.sections[option.sectionIndex].groups[option.groupIndex].lines.some(line => /VARIACAO.*ESTOQUE|AJUSTE.*ESTOQUE/.test(normalizeDreName(line.label))));
  if (alreadyAdjusted) issues.push("O arquivo já contém uma linha de variação de estoque. Use as compras sem esse ajuste para evitar dupla aplicação.");
  return { config, groups, issues, sourceStockAdjustment: alreadyAdjusted, status: !config.enabled ? "off" as const : issues.length > 0 ? "pending" as const : "applied" as const, total: moneyRound(groups.reduce((sum, group) => sum + (group.variation ?? 0), 0)) };
}
