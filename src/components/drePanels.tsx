/* eslint-disable react-refresh/only-export-components */
import { Fragment, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { AuthSession, DreImportData, DrePeriodData, PersistedWorkspace, RestaurantMembership } from "../types";
import { formatCurrency, formatPercent } from "../utils/cmv";
import { loadRestaurantWorkspace } from "../utils/auth";
import { loadCloudWorkspace } from "../utils/cloudAuth";
import { getNavigationIcon } from "./appChrome";
import { PeriodSelector } from "./periodSelector";
import { RestaurantNavigatorPanel } from "./dashboardPanels";
import { useViewState } from "../hooks/useViewState";
import { ChartDetails } from "./chartDetails";
import { activateChartMark, useChartDetails } from "../hooks/useChartDetails";

const drePalette = ["#2f6f5e", "#c9823a", "#496f9f", "#8b6f47", "#6f7785", "#a55c7a", "#5f7f4f", "#6a5acd", "#4f8a8b", "#b08d57"];
const shortMonthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const DRE_TOTAL_PERIOD = "__ALL_DRE_PERIODS__";
const DRE_SELECTION_SEPARATOR = ",";

export type DrePanelCopy = {
  navDre: string;
  dreParsedTitle: string;
  dreEmptyTitle: string;
  dreEmptyText: string;
  dreUploadTitle: string;
  dreUploadAction: string;
  dreUploadHint: string;
  dreProcessing: string;
  drePeriod: string;
  dreSelectPeriod: string;
  dreRevenue: string;
  dreOutflows: string;
  dreFinalBalance: string;
  dreResultMap: string;
  dreResultMapText: string;
  dreSectionChart: string;
  dreSectionChartText: string;
  dreParticipationTitle: string;
  dreParticipationText: string;
  dreStrategicTitle: string;
  dreStrategicText: string;
  dreRevenueConcentration: string;
  dreNoData: string;
  dreLargestExpense: string;
  dreFinalMargin: string;
  dreExpenseRatio: string;
  dreRestaurantDiagnostics: string;
  dreRestaurantDiagnosticsText: string;
  dreFinalMarginCard: string;
  dreOperationalMarginCard: string;
  dreInputsOnRevenue: string;
  drePeopleOnRevenue: string;
  dreStructureOnRevenue: string;
  dreHealthy: string;
  dreCritical: string;
  dreAttention: string;
  dreAttentionPoints: string;
  dreRevenueMixTitle: string;
  dreRevenueMixText: string;
  dreMenuMixTitle: string;
  dreMenuMixText: string;
  dreCardFeesTitle: string;
  dreCardFeesText: string;
  dreRevenueVsExpenses: string;
  dreRevenueVsExpensesText: string;
  dreOperationalResultChart: string;
  dreOperationalResultChartText: string;
  total: string;
};

export type DreAnalysisPanelProps = {
  data?: DreImportData;
  periods: DrePeriodData[];
  selectedPeriod: string;
  session: AuthSession;
  error?: string;
  processing?: boolean;
  canManageData: boolean;
  copy: DrePanelCopy;
  onImport: (file: File) => void;
  onSelectPeriod: (period: string) => void;
  onRemovePeriod?: (period: string) => void;
};

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians)
  };
};

const buildArcPath = (
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
) => {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    "Z"
  ].join(" ");
};


const normalizeDreLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const matchesAnyDreTerm = (label: string, terms: string[]) => {
  const normalized = normalizeDreLabel(label);
  return terms.some((term) => normalized.includes(normalizeDreLabel(term)));
};

const matchesAnyDreExactTerm = (label: string, terms: string[]) => {
  const normalized = normalizeDreLabel(label).trim();
  return terms.some((term) => normalized === normalizeDreLabel(term).trim());
};

const DRE_INPUT_TERMS = [
  "INSUMOS",
  "CMV",
  "CUSTO DA MERCADORIA",
  "CUSTO DAS MERCADORIAS",
  "CUSTO DOS PRODUTOS",
  "CUSTOS DOS PRODUTOS",
  "CUSTO DE VENDAS",
  "CUSTOS VARIAVEIS",
  "COMPRAS DIRETAS",
  "COMPRA DIRETA",
  "COMPRAS DE MERCADORIAS",
  "COMPRAS MERCADORIAS"
];

const DRE_INPUT_EXCLUDED_TERMS = [
  "COMISSAO",
  "COMISSOES",
  "TAXA DE CARTAO",
  "TAXAS DE CARTAO",
  "TARIFA",
  "CARTAO",
  "CARTOES",
  "DELIVERY",
  "IFOOD",
  "RAPPI",
  "UBER",
  "SERVICO",
  "SERVICOS",
  "TAXA DE SERVICO",
  "PESSOAL",
  "CMO",
  "FOLHA",
  "SALARIO",
  "SALARIOS",
  "MAO DE OBRA",
  "ENCARGOS"
];

const DRE_OPERATIONAL_EXPENSE_TERMS = [
  "DESPESAS OPERACIONAIS",
  "GASTOS OPERACIONAIS",
  "DESPESAS FIXAS",
  "GASTOS FIXOS",
  "ESTRUTURA"
];

const DRE_PEOPLE_TERMS = [
  "CMO",
  "CUSTO MAO DE OBRA",
  "CUSTO DE MAO DE OBRA",
  "CUSTOS MAO DE OBRA",
  "CUSTOS DE MAO DE OBRA",
  "PESSOAL",
  "PERSONAL",
  "FOLHA",
  "SALARIO",
  "SALARIOS",
  "MAO DE OBRA",
  "ENCARGOS",
  "RH",
  "EQUIPE",
  "COLABORADORES"
];

const DRE_PEOPLE_EXACT_TERMS = ["CMO"];

const DRE_MATERIAL_TERMS = ["MATERIAIS", "MATERIAL", "DESCARTAVEIS", "EMBALAGENS", "ACESSORIOS"];
const DRE_OCCUPANCY_TERMS = [
  "TAXA DE LOCACAO",
  "LOCACAO",
  "ALUGUEL",
  "OCUPACAO",
  "CONCESSIONARIA",
  "CONCESSIONARIAS",
  "CONDOMINIO"
];
const DRE_TAX_TERMS = ["IMPOSTOS", "IMPOSTO", "TRIBUTOS", "TRIBUTO"];

const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: value >= 1000000 ? 1 : 0
  }).format(value);

const formatDonutCenterLabel = (value: string) => {
  const normalized = value.trim();
  return normalized || "TOTAL";
};

const getDreGroupValue = (group: DreImportData["sections"][number]["groups"][number]) =>
  group.total?.value ?? group.lines.reduce((sum, line) => sum + line.value, 0);

const getDreSectionValue = (section: DreImportData["sections"][number]) =>
  section.total?.value ?? section.groups.reduce((sum, group) => sum + getDreGroupValue(group), 0);

const isDreInputExcludedLabel = (label: string) => matchesAnyDreTerm(label, DRE_INPUT_EXCLUDED_TERMS);

const getDreGroupInputValue = (group: DreImportData["sections"][number]["groups"][number]) => {
  if (isDreInputExcludedLabel(group.label) || matchesAnyDreTerm(group.label, DRE_PEOPLE_TERMS)) {
    return 0;
  }

  const lines = group.lines.filter((line) => !isDreInputExcludedLabel(line.label) && !matchesAnyDreTerm(line.label, DRE_PEOPLE_TERMS));

  if (group.total && lines.length === group.lines.length) {
    return group.total.value;
  }

  if (lines.length > 0) {
    return lines.reduce((sum, line) => sum + line.value, 0);
  }

  return group.total?.value ?? 0;
};

const isDreNonOperationalLabel = (label: string) => {
  const normalized = normalizeDreLabel(label);
  return normalized.includes("NAO OPERACIONAL") || normalized.includes("NAO OPERACIONAIS");
};

const isDreOperationalRevenueLabel = (label: string) => {
  const normalized = normalizeDreLabel(label);
  return !isDreNonOperationalLabel(label) && (
    normalized.includes("RECEITAS OPERACIONAIS") ||
    normalized.includes("RECEITA OPERACIONAL")
  );
};

const isDreRevenueLabel = (label: string) => {
  const normalized = normalizeDreLabel(label);
  return normalized.includes("RECEITA") && !normalized.includes("RECEITA LIQUIDA") && !isDreNonOperationalLabel(label);
};

const isDreResultLabel = (label: string) => {
  const normalized = normalizeDreLabel(label);
  return normalized.includes("RESULTADO") || normalized.includes("SALDO") || normalized.includes("MARGEM");
};

const findDreSectionByIncludes = (data: DreImportData, terms: string[]) =>
  data.sections.find((section) => {
    return matchesAnyDreTerm(section.label, terms);
  });

const findDreGroupByIncludes = (data: DreImportData, terms: string[]) => {
  for (const section of data.sections) {
    const group = section.groups.find((item) => {
      return matchesAnyDreTerm(item.label, terms);
    });

    if (group) {
      return { section, group };
    }
  }

  return undefined;
};

const findDreSummaryValueByMatcher = (data: DreImportData, matcher: (label: string) => boolean) =>
  data.summary.find((item) => matcher(item.label) && item.value > 0)?.value;

const findDreAnySummaryValueByMatcher = (data: DreImportData, matcher: (label: string) => boolean) =>
  data.summary.find((item) => matcher(item.label))?.value;

const getDreOperationalResultValue = (data: DreImportData) =>
  findDreAnySummaryValueByMatcher(data, (label) => {
    const normalized = normalizeDreLabel(label);
    return normalized.includes("RESULTADO OPERACIONAL") && !normalized.includes("PERCENTUAL");
  });

const getDreFinalBalanceValue = (data: DreImportData) =>
  findDreAnySummaryValueByMatcher(data, (label) => normalizeDreLabel(label).includes("SALDO FINAL")) ??
  getDreOperationalResultValue(data);

const findDreGroupsByIncludes = (data: DreImportData, terms: string[]) =>
  data.sections.flatMap((section) =>
    section.groups
      .filter((group) => matchesAnyDreTerm(group.label, terms))
      .map((group) => ({ section, group }))
  );

const findDreGroupsByExact = (data: DreImportData, terms: string[]) =>
  data.sections.flatMap((section) =>
    section.groups
      .filter((group) => matchesAnyDreExactTerm(group.label, terms))
      .map((group) => ({ section, group }))
  );

const getDreInputsValue = (data: DreImportData) => {
  const inputsSection = findDreSectionByIncludes(data, DRE_INPUT_TERMS);
  if (inputsSection) {
    return inputsSection.groups.reduce((sum, group) => sum + getDreGroupInputValue(group), 0);
  }

  return findDreGroupsByIncludes(data, DRE_INPUT_TERMS).reduce((sum, item) => sum + getDreGroupInputValue(item.group), 0);
};

const getDrePeopleValue = (data: DreImportData) => {
  const peopleGroups = [
    ...findDreGroupsByIncludes(data, DRE_PEOPLE_TERMS),
    ...findDreGroupsByExact(data, DRE_PEOPLE_EXACT_TERMS)
  ];

  if (peopleGroups.length > 0) {
    const uniqueGroups = new Map(peopleGroups.map((item) => [`${item.section.label}::${item.group.label}`, item]));
    return [...uniqueGroups.values()].reduce((sum, item) => sum + getDreGroupValue(item.group), 0);
  }

  const peopleSection = findDreSectionByIncludes(data, [...DRE_PEOPLE_TERMS, "GASTO COM PESSOAL"]);
  return peopleSection ? getDreSectionValue(peopleSection) : 0;
};

const getDreOperationalExpenseValue = (data: DreImportData) => {
  const operationalSection = findDreSectionByIncludes(data, DRE_OPERATIONAL_EXPENSE_TERMS);
  return operationalSection ? getDreSectionValue(operationalSection) : 0;
};

const getDreGroupsValueByTerms = (data: DreImportData, terms: string[]) => {
  const groups = findDreGroupsByIncludes(data, terms);
  const uniqueGroups = new Map(groups.map((item) => [`${item.section.label}::${item.group.label}`, item]));
  return [...uniqueGroups.values()].reduce((sum, item) => sum + getDreGroupValue(item.group), 0);
};

const getDreTaxValue = (data: DreImportData) => getDreGroupsValueByTerms(data, DRE_TAX_TERMS);

const getDreMaterialValue = (data: DreImportData) => getDreGroupsValueByTerms(data, DRE_MATERIAL_TERMS);

const getDreOccupancyValue = (data: DreImportData) => getDreGroupsValueByTerms(data, DRE_OCCUPANCY_TERMS);

const getDreComparisonMetrics = (data: DreImportData) => {
  const revenue = getDreRevenueValue(data);
  const cmv = getDreInputsValue(data);
  const cmo = getDrePeopleValue(data);
  const taxes = getDreTaxValue(data);
  const materials = getDreMaterialValue(data);
  const occupancy = getDreOccupancyValue(data);
  const operationalResult = getDreOperationalResultValue(data) ?? revenue - getDreExpenseValue(data);
  const finalResult = getDreFinalBalanceValue(data) ?? operationalResult;

  return {
    revenue,
    taxes,
    cmv,
    cmo,
    materials,
    occupancy,
    operationalResult,
    finalResult
  };
};

const getDreRevenueSections = (data: DreImportData) => {
  const operationalRevenueSections = data.sections.filter((section) => isDreOperationalRevenueLabel(section.label));

  if (operationalRevenueSections.length > 0) {
    return operationalRevenueSections;
  }

  return data.sections.filter((section) => isDreRevenueLabel(section.label));
};

export const getDreRevenueValue = (data: DreImportData) => {
  const operationalRevenueSummary = findDreSummaryValueByMatcher(data, (label) => {
    const normalized = normalizeDreLabel(label);
    return isDreOperationalRevenueLabel(label) && normalized.includes("TOTAL");
  });

  if (operationalRevenueSummary !== undefined) {
    return operationalRevenueSummary;
  }

  const operationalRevenueSections = data.sections.filter((section) => isDreOperationalRevenueLabel(section.label));
  const operationalRevenueFromSections = operationalRevenueSections.reduce((sum, section) => sum + getDreSectionValue(section), 0);

  if (operationalRevenueFromSections > 0) {
    return operationalRevenueFromSections;
  }

  const netRevenueSummary = findDreSummaryValueByMatcher(data, (label) => normalizeDreLabel(label).includes("RECEITA LIQUIDA"));

  if (netRevenueSummary !== undefined) {
    return netRevenueSummary;
  }

  const genericRevenueSummary = findDreSummaryValueByMatcher(data, (label) => {
    const normalized = normalizeDreLabel(label);
    return normalized.includes("TOTAL") && normalized.includes("RECEITA") && !isDreNonOperationalLabel(label);
  });

  return genericRevenueSummary ?? getDreRevenueSections(data).reduce((sum, section) => sum + getDreSectionValue(section), 0);
};

const getDreExpenseValue = (data: DreImportData) =>
  findDreSummaryValueByMatcher(data, (label) => {
    const normalized = normalizeDreLabel(label);
    return (
      normalized.includes("TOTAL") &&
      (normalized.includes("DESPESAS") || normalized.includes("GASTOS")) &&
      !normalized.includes("OPERACIONAIS") &&
      !normalized.includes("OPERACIONAL")
    );
  }) ??
  (() => {
    const revenueSectionLabels = new Set(getDreRevenueSections(data).map((section) => section.label));
    return data.sections
      .filter((section) => !revenueSectionLabels.has(section.label))
      .reduce((sum, section) => sum + getDreSectionValue(section), 0);
  })();

export const getDreRevenueGroups = (data: DreImportData) =>
  getDreRevenueSections(data)
    .flatMap((section) => {
      const normalizedSection = normalizeDreLabel(section.label);

      return section.groups.flatMap((group) => {
        const normalizedGroup = normalizeDreLabel(group.label);
        const groupValue = getDreGroupValue(group);
        const hasInternalBreakdown = group.lines.some((line) => line.value > 0);
        const groupCandidate = {
          section,
          group,
          label: group.label,
          value: groupValue,
          normalized: normalizedGroup
        };

        if (normalizedGroup !== normalizedSection && groupValue > 0) {
          return [groupCandidate];
        }

        if (hasInternalBreakdown) {
          return group.lines.map((line) => ({
            section,
            group,
            label: line.label,
            value: line.value,
            normalized: normalizeDreLabel(line.label)
          }));
        }

        return [];
      });
    })
    .filter(
      (item) =>
        !item.normalized.includes("TOTAL") &&
        !item.normalized.includes("DIFERENCA DE CAIXA") &&
        !item.normalized.includes("INFORMADO PELOS CAIXAS") &&
        !item.normalized.includes("COMPUTADO NO MOMENTO")
    )
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);

const getDreRevenueLineGroups = (data: DreImportData) =>
  getDreRevenueSections(data)
    .flatMap((section) =>
      section.groups.flatMap((group) =>
        group.lines.map((line) => ({
          section,
          group,
          label: line.label,
          value: line.value,
          normalized: normalizeDreLabel(line.label)
        }))
      )
    )
    .filter((item) => !item.normalized.includes("TOTAL") && !item.normalized.includes("DIFERENCA DE CAIXA"))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);

const findDrePrimaryRevenueGroup = (data: DreImportData) =>
  getDreRevenueGroups(data)[0] ?? getDreRevenueLineGroups(data)[0];

const findDreRevenueLeader = (data: DreImportData) => {
  const primaryGroup = findDrePrimaryRevenueGroup(data);

  if (primaryGroup) {
    return {
      label: primaryGroup.label,
      value: primaryGroup.value
    };
  }

  return undefined;
};

const findDreCardFeesGroup = (data: DreImportData) => {
  const revenueSectionLabels = new Set(getDreRevenueSections(data).map((section) => section.label));
  const groups = data.sections
    .filter((section) => !revenueSectionLabels.has(section.label))
    .flatMap((section) =>
      section.groups.map((group) => ({
        section,
        group,
        normalized: normalizeDreLabel(group.label)
      }))
    );

  return (
    groups.find(
      (item) =>
        item.normalized.includes("TARIFA") &&
        (item.normalized.includes("CARTAO") || item.normalized.includes("CARTOES") || item.normalized.includes("VALE"))
    ) ??
    groups.find((item) => item.normalized.includes("CARTAO") || item.normalized.includes("CARTOES"))
  );
};

const getDrePeriodShortLabel = (data: DreImportData) => {
  if (data.period?.month && data.period.year) {
    return `${shortMonthLabels[data.period.month - 1]}/${String(data.period.year).slice(-2)}`;
  }

  return data.period?.rawLabel ?? data.sheetName;
};

export const getDrePeriodKey = (data: DreImportData, fallback: string) => {
  if (data.period?.month && data.period.year) {
    return `${data.period.year}-${String(data.period.month).padStart(2, "0")}`;
  }

  return fallback;
};

export const getDrePeriodLabel = (data: DreImportData, fallback: string) => {
  if (data.period?.month && data.period.year) {
    return `${shortMonthLabels[data.period.month - 1]}/${data.period.year}`;
  }

  return data.period?.rawLabel ?? fallback;
};

const getDrePeriodYear = (period?: DrePeriodData) =>
  period?.data.period?.year ?? (period?.key.match(/^(\d{4})-/)?.[1] ? Number(period.key.slice(0, 4)) : undefined);

const getDreTone = (label: string, value: number) => {
  if (isDreRevenueLabel(label)) {
    return "good";
  }

  if (isDreResultLabel(label)) {
    return value >= 0 ? "good" : "bad";
  }

  return "bad";
};

const getDreRatioTone = (value: number, goodMax: number, attentionMax: number) => {
  if (!Number.isFinite(value)) {
    return "mid";
  }

  if (value <= goodMax) {
    return "good";
  }

  if (value <= attentionMax) {
    return "mid";
  }

  return "bad";
};

const buildConsolidatedDreData = (periods: DrePeriodData[]): DreImportData | undefined => {
  if (periods.length === 0) {
    return undefined;
  }

  const summaryMap = new Map<string, DreImportData["summary"][number]>();
  const sectionMap = new Map<
    string,
    {
      label: string;
      totalValue: number;
      rowNumber: number;
      groups: Map<
        string,
        {
          label: string;
          totalValue: number;
          rowNumber: number;
          lines: Map<string, DreImportData["sections"][number]["groups"][number]["lines"][number]>;
        }
      >;
    }
  >();

  periods.forEach((period) => {
    period.data.summary.forEach((line) => {
      const summaryKey = normalizeDreLabel(line.label);
      const current = summaryMap.get(summaryKey);
      summaryMap.set(summaryKey, {
        label: current?.label ?? line.label,
        value: (current?.value ?? 0) + line.value,
        rowNumber: current?.rowNumber ?? line.rowNumber
      });
    });

    period.data.sections.forEach((section) => {
      const sectionKey = normalizeDreLabel(section.label);
      const sectionEntry =
        sectionMap.get(sectionKey) ??
        {
          label: section.label,
          totalValue: 0,
          rowNumber: section.total?.rowNumber ?? 0,
          groups: new Map()
        };

      sectionEntry.totalValue += getDreSectionValue(section);

      section.groups.forEach((group) => {
        const groupKey = normalizeDreLabel(group.label);
        const groupEntry =
          sectionEntry.groups.get(groupKey) ??
          {
            label: group.label,
            totalValue: 0,
            rowNumber: group.total?.rowNumber ?? 0,
            lines: new Map()
          };

        groupEntry.totalValue += getDreGroupValue(group);

        group.lines.forEach((line) => {
          const lineKey = normalizeDreLabel(line.label);
          const currentLine = groupEntry.lines.get(lineKey);
          groupEntry.lines.set(lineKey, {
            label: currentLine?.label ?? line.label,
            value: (currentLine?.value ?? 0) + line.value,
            rowNumber: currentLine?.rowNumber ?? line.rowNumber
          });
        });

        sectionEntry.groups.set(groupKey, groupEntry);
      });

      sectionMap.set(sectionKey, sectionEntry);
    });
  });

  return {
    sheetName: "Total",
    restaurantName: periods[0].data.restaurantName,
    reportTitle: periods[0].data.reportTitle,
    analysisTitle: "Análise total",
    period: {
      rawLabel: "Total"
    },
    summary: [...summaryMap.values()],
    sections: [...sectionMap.values()].map((section) => ({
      label: section.label,
      total: {
        label: section.label,
        value: section.totalValue,
        rowNumber: section.rowNumber
      },
      groups: [...section.groups.values()].map((group) => ({
        label: group.label,
        total: {
          label: group.label,
          value: group.totalValue,
          rowNumber: group.rowNumber
        },
        lines: [...group.lines.values()]
      }))
    }))
  };
};

type DreTrendPoint = {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  operationalResult: number;
};

const buildDreTrendPoints = (periods: DrePeriodData[]): DreTrendPoint[] =>
  [...periods]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((period) => ({
      key: period.key,
      label: getDrePeriodShortLabel(period.data),
      revenue: getDreRevenueValue(period.data),
      expenses: getDreExpenseValue(period.data),
      operationalResult: getDreOperationalResultValue(period.data) ?? getDreFinalBalanceValue(period.data) ?? 0
    }));

const getDreMarginTone = (value: number) => {
  if (!Number.isFinite(value)) {
    return "mid";
  }

  if (value >= 10) {
    return "good";
  }

  if (value >= 3) {
    return "mid";
  }

  return "bad";
};

function DreResultMap({ data, copy }: { data: DreImportData; copy: DrePanelCopy }) {
  const revenue = getDreRevenueValue(data);
  const expenses = getDreExpenseValue(data);
  const finalBalance = getDreFinalBalanceValue(data) ?? revenue - expenses;
  const maxValue = Math.max(Math.abs(revenue), Math.abs(expenses), Math.abs(finalBalance), 1);
  const cards = [
    { key: "revenue", label: copy.dreRevenue, value: revenue, tone: "good" },
    { key: "outflows", label: copy.dreOutflows, value: expenses, tone: "bad" },
    { key: "balance", label: copy.dreFinalBalance, value: finalBalance, tone: finalBalance >= 0 ? "good" : "bad" }
  ];

  return (
    <section className="dre-chart-card dre-result-map">
      <div className="section-head">
        <div>
          <h3>{copy.dreResultMap}</h3>
          <p>{copy.dreResultMapText}</p>
        </div>
      </div>
      <div className="dre-result-bars">
        {cards.map((card) => (
          <article key={card.key} className={`dre-result-bar-card ${card.tone}`}>
            <div>
              <span className="eyebrow">{card.label}</span>
              <strong>{formatCurrency(card.value)}</strong>
            </div>
            <div className="dre-result-track">
              <span style={{ width: `${Math.max(7, (Math.abs(card.value) / maxValue) * 100)}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DreSectionChart({ data, copy }: { data: DreImportData; copy: DrePanelCopy }) {
  const sections = data.sections
    .map((section, index) => ({
      label: section.label,
      value: getDreSectionValue(section),
      color: drePalette[index % drePalette.length],
      tone: getDreTone(section.label, getDreSectionValue(section))
    }))
    .filter((section) => section.value > 0)
    .sort((left, right) => right.value - left.value);
  const maxValue = Math.max(...sections.map((section) => section.value), 1);

  if (sections.length === 0) {
    return null;
  }

  return (
    <section className="dre-chart-card">
      <div className="section-head">
        <div>
          <h3>{copy.dreSectionChart}</h3>
          <p>{copy.dreSectionChartText}</p>
        </div>
      </div>
      <div className="dre-section-bars">
        {sections.map((section) => (
          <article key={section.label} className="dre-section-bar-row">
            <div className="dre-section-bar-label">
              <span>{section.label}</span>
              <strong>{formatCurrency(section.value)}</strong>
            </div>
            <div className="dre-section-bar-track">
              <span
                className={`dre-section-bar-fill ${section.tone}`}
                style={
                  {
                    width: `${Math.max(5, (section.value / maxValue) * 100)}%`,
                    "--dre-color": section.color
                  } as CSSProperties
                }
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DreMiniDonut({
  title,
  items,
  total,
  index,
  copy
}: {
  title: string;
  items: Array<{ label: string; value: number; color: string }>;
  total: number;
  index: number;
  copy: DrePanelCopy;
}) {
  const [clickedSlice, setClickedSlice] = useState<string>();
  const [selectedSlice, setSelectedSlice] = useState<string>();
  const { details: tooltip, setDetails: setTooltip, chartRef, anchor, onMouseLeave } = useChartDetails<{ label: string; value: number; x: number; y: number }>();
  const isDense = items.length > 6;
  const isVeryDense = items.length > 10;
  const size = isVeryDense ? 300 : isDense ? 244 : 176;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = isVeryDense ? 142 : isDense ? 114 : 80;
  const innerRadius = isVeryDense ? 78 : isDense ? 66 : 46;
  const activeItem = items.find((item) => item.label === selectedSlice);
  const centerValue = activeItem ? activeItem.value : total;
  const centerLabel = activeItem ? formatDonutCenterLabel(activeItem.label) : copy.total;
  const centerBoxSize = Math.max(58, (innerRadius - 9) * 2);
  const centerBoxHeight = isVeryDense ? 62 : isDense ? 54 : 46;
  let cursor = 0;
  const showTooltip = (item: { label: string; value: number }, event: { clientX: number; clientY: number }) => {
    setTooltip({
      label: item.label,
      value: item.value,
      x: event.clientX + 14,
      y: event.clientY + 14
    });
  };

  return (
    <article ref={chartRef} onMouseLeave={onMouseLeave} className={`dre-donut-card ${isDense ? "dense" : ""} ${isVeryDense ? "very-dense" : ""}`}>
      <div className="dre-donut-shell">
        <svg viewBox={`0 0 ${size} ${size}`} className="dre-mini-donut" role="group" aria-label={title}>
          {items.map((item) => {
            const share = total > 0 ? item.value / total : 0;
            const start = cursor * 360;
            const end = (cursor + share) * 360;
            cursor += share;

            return (
              <path
                key={item.label}
                d={buildArcPath(cx, cy, outerRadius, innerRadius, start, end)}
                fill={item.color}
                tabIndex={0}
                role="button"
                aria-label={`${item.label}: ${formatCurrency(item.value)}`}
                onKeyDown={activateChartMark}
                className={`${clickedSlice === item.label ? "clicked" : ""} ${selectedSlice === item.label ? "active" : ""}`}
                onClick={() => {
                  setSelectedSlice((current) => (current === item.label ? undefined : item.label));
                  showTooltip(item, { clientX: 0, clientY: 0 });
                  setClickedSlice(item.label);
                  window.setTimeout(() => {
                    setClickedSlice((current) => (current === item.label ? undefined : current));
                  }, 340);
                }}
                onMouseEnter={(event) => showTooltip(item, event)}
                onMouseMove={(event) => showTooltip(item, event)}
                onFocus={() => showTooltip(item, { clientX: 0, clientY: 0 })}
                onMouseLeave={onMouseLeave}
              >
                <title>{`${item.label}: ${formatCurrency(item.value)}`}</title>
              </path>
            );
          })}
          <circle cx={cx} cy={cy} r={innerRadius - 5} fill="var(--donut-hole)" />
          <foreignObject
            x={cx - centerBoxSize / 2}
            y={cy - centerBoxHeight / 2}
            width={centerBoxSize}
            height={centerBoxHeight}
            className="dre-donut-center-object"
          >
            <div className={`dre-donut-center-html ${activeItem ? "has-selection" : ""}`}>
              <strong>{formatCompactCurrency(centerValue)}</strong>
              <span title={centerLabel}>{centerLabel}</span>
            </div>
          </foreignObject>
        </svg>
      </div>
      <div className="dre-donut-copy">
        <span className="eyebrow">#{index + 1}</span>
        <strong>{title}</strong>
        <p>{formatCurrency(total)}</p>
      </div>
      <div className="dre-donut-legend">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`dre-donut-legend-row ${selectedSlice === item.label ? "active" : ""}`}
            onClick={() => {
              setSelectedSlice((current) => (current === item.label ? undefined : item.label));
              showTooltip(item, { clientX: 0, clientY: 0 });
            }}
            onMouseEnter={(event) => showTooltip(item, event)}
            onMouseMove={(event) => showTooltip(item, event)}
            onMouseLeave={onMouseLeave}
          >
            <span className="dre-donut-swatch" style={{ backgroundColor: item.color }} />
            <span className="dre-donut-legend-name">{item.label}</span>
            <strong>{formatPercent(total > 0 ? (item.value / total) * 100 : 0)}</strong>
          </button>
        ))}
      </div>
      {tooltip ? (
        <ChartDetails anchor={anchor}>
          <strong>{tooltip.label}</strong>
          <span>{formatCurrency(tooltip.value)}</span>
          <span>{formatPercent(total > 0 ? (tooltip.value / total) * 100 : 0)} de participação</span>
        </ChartDetails>
      ) : null}
    </article>
  );
}

function DreParticipationGrid({ data, copy }: { data: DreImportData; copy: DrePanelCopy }) {
  const sectionCharts = data.sections
    .map((section, sectionIndex) => {
      const items = section.groups
        .map((group, groupIndex) => ({
          label: group.label,
          value: getDreGroupValue(group),
          color: drePalette[(sectionIndex + groupIndex) % drePalette.length]
        }))
        .filter((item) => item.value > 0)
        .sort((left, right) => right.value - left.value);

      return {
        title: section.label,
        items,
        total: items.reduce((sum, item) => sum + item.value, 0)
      };
    })
    .filter((section) => section.items.length > 1 && section.total > 0);

  if (sectionCharts.length === 0) {
    return null;
  }

  return (
    <section className="dre-chart-card dre-participation-panel">
      <div className="section-head">
        <div>
          <h3>{copy.dreParticipationTitle}</h3>
          <p>{copy.dreParticipationText}</p>
        </div>
      </div>
      <div className={`dre-donut-grid ${sectionCharts.length % 2 === 1 ? "odd" : ""}`}>
        {sectionCharts.map((section, index) => (
          <DreMiniDonut
            key={section.title}
            title={section.title}
            items={section.items}
            total={section.total}
            index={index}
            copy={copy}
          />
        ))}
      </div>
    </section>
  );
}

function DreStrategicInsights({ data, copy }: { data: DreImportData; copy: DrePanelCopy }) {
  const revenue = getDreRevenueValue(data);
  const expenses = getDreExpenseValue(data);
  const finalBalance = getDreFinalBalanceValue(data) ?? revenue - expenses;
  const revenueLeader = findDreRevenueLeader(data);
  const revenueSectionLabels = new Set(getDreRevenueSections(data).map((section) => section.label));
  const expenseGroups = data.sections
    .filter((section) => !revenueSectionLabels.has(section.label))
    .flatMap((section) =>
      section.groups.map((group) => ({
        label: group.label,
        section: section.label,
        value: getDreGroupValue(group)
      }))
    )
    .filter((group) => group.value > 0)
    .sort((left, right) => right.value - left.value);
  const expenseLeader = expenseGroups[0];
  const insights = [
    {
      label: copy.dreRevenueConcentration,
      title: revenueLeader?.label ?? copy.dreNoData,
      value: revenueLeader ? formatPercent(revenue > 0 ? (revenueLeader.value / revenue) * 100 : 0) : "-",
      detail: revenueLeader ? formatCurrency(revenueLeader.value) : "Reimporte o DRE para atualizar a abertura de receitas.",
      tone: "good"
    },
    {
      label: copy.dreLargestExpense,
      title: expenseLeader?.label ?? "-",
      value: expenseLeader ? formatPercent(expenses > 0 ? (expenseLeader.value / expenses) * 100 : 0) : "-",
      detail: expenseLeader ? `${expenseLeader.section} · ${formatCurrency(expenseLeader.value)}` : "-",
      tone: "bad"
    },
    {
      label: copy.dreFinalMargin,
      title: formatCurrency(finalBalance),
      value: formatPercent(revenue > 0 ? (finalBalance / revenue) * 100 : 0),
      detail: copy.dreFinalBalance,
      tone: finalBalance >= 0 ? "good" : "bad"
    },
    {
      label: copy.dreExpenseRatio,
      title: formatCurrency(expenses),
      value: formatPercent(revenue > 0 ? (expenses / revenue) * 100 : 0),
      detail: `${copy.dreOutflows} / ${copy.dreRevenue}`,
      tone: "mid"
    }
  ];

  return (
    <section className="dre-chart-card dre-strategy-panel">
      <div className="section-head">
        <div>
          <h3>{copy.dreStrategicTitle}</h3>
          <p>{copy.dreStrategicText}</p>
        </div>
      </div>
      <div className="dre-strategy-grid">
        {insights.map((insight) => (
          <article key={insight.label} className={`dre-strategy-card ${insight.tone}`}>
            <span className="eyebrow">{insight.label}</span>
            <strong>{insight.title}</strong>
            <div>
              <b>{insight.value}</b>
              <small>{insight.detail}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DreProcessingSkeleton() {
  return (
    <section className="card skeleton-card" aria-label="Processando DRE">
      <span className="skeleton-line short" />
      <span className="skeleton-line long" />
      <div className="skeleton-grid">
        <span className="skeleton-block" />
        <span className="skeleton-block" />
        <span className="skeleton-block" />
      </div>
    </section>
  );
}

function EmptyStateIcon() {
  return (
    <span className="empty-state-icon" aria-hidden="true">
      {getNavigationIcon("dre")}
    </span>
  );
}

function DreValidationPanel({ data }: { data: DreImportData }) {
  const revenue = getDreRevenueValue(data);
  const expenses = getDreExpenseValue(data);
  const inputsValue = getDreInputsValue(data);
  const peopleValue = getDrePeopleValue(data);
  const operationalExpenseValue = getDreOperationalExpenseValue(data);
  const finalBalance = getDreFinalBalanceValue(data);
  const operationalResult = getDreOperationalResultValue(data);
  const inputsRatio = revenue > 0 ? (inputsValue / revenue) * 100 : 0;
  const peopleRatio = revenue > 0 ? (peopleValue / revenue) * 100 : 0;
  const expenseRatio = revenue > 0 ? (expenses / revenue) * 100 : 0;
  const checks = [
    {
      label: "Receita operacional",
      value: revenue > 0 ? formatCurrency(revenue) : "Não identificada",
      status: revenue > 0 ? "good" : "bad",
      detail: revenue > 0 ? "Base de cálculo encontrada." : "Sem receita-base confiável para percentuais."
    },
    {
      label: "Insumos / CMV",
      value: inputsValue > 0 ? formatCurrency(inputsValue) : "Não identificado",
      status: inputsValue <= 0 ? "bad" : inputsRatio > 45 ? "mid" : "good",
      detail: inputsValue > 0 ? `${formatPercent(inputsRatio)} sobre receita` : "Revise se o DRE usa outro nome para CMV/insumos."
    },
    {
      label: "Pessoal / CMO",
      value: peopleValue > 0 ? formatCurrency(peopleValue) : "Não identificado",
      status: peopleValue <= 0 ? "bad" : peopleRatio > 35 ? "mid" : "good",
      detail: peopleValue > 0 ? `${formatPercent(peopleRatio)} sobre receita` : "Revise se o DRE usa outra sigla para pessoal."
    },
    {
      label: "Despesas operacionais",
      value: operationalExpenseValue > 0 ? formatCurrency(operationalExpenseValue) : "Não identificada",
      status: operationalExpenseValue > 0 ? "good" : "mid",
      detail: operationalExpenseValue > 0 ? "Bloco operacional localizado." : "Estrutura operacional não localizada por nome."
    },
    {
      label: "Resultado operacional",
      value: operationalResult !== undefined ? formatCurrency(operationalResult) : "Não identificado",
      status: operationalResult !== undefined ? "good" : "mid",
      detail: "Usado para margem operacional e gráficos de evolução."
    },
    {
      label: "Saldo final",
      value: finalBalance !== undefined ? formatCurrency(finalBalance) : "Não identificado",
      status: finalBalance !== undefined ? "good" : "mid",
      detail: "Usado para margem final."
    }
  ];
  const alerts = [
    revenue <= 0 ? "Receita operacional/base não identificada; percentuais podem ficar inválidos." : undefined,
    inputsValue <= 0 ? "Insumos/CMV não identificados no DRE." : undefined,
    peopleValue <= 0 ? "Pessoal/CMO não identificado no DRE." : undefined,
    inputsRatio > 45 ? `Insumos altos: ${formatPercent(inputsRatio)} sobre receita.` : undefined,
    peopleRatio > 35 ? `Pessoal alto: ${formatPercent(peopleRatio)} sobre receita.` : undefined,
    expenseRatio > 100 ? `Saídas maiores que a receita: ${formatPercent(expenseRatio)}.` : undefined
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="dre-chart-card dre-validation-panel">
      <div className="section-head">
        <div>
          <h3>Validação da DRE</h3>
          <p>Conferência dos principais blocos antes da leitura dos indicadores.</p>
        </div>
      </div>

      <div className="dre-validation-grid">
        {checks.map((check) => (
          <article key={check.label} className={`dre-validation-card ${check.status}`}>
            <span className="eyebrow">{check.label}</span>
            <strong>{check.value}</strong>
            <p>{check.detail}</p>
          </article>
        ))}
      </div>

      {alerts.length > 0 ? (
        <div className="dre-validation-alerts">
          <span className="eyebrow">Alertas de inconsistência</span>
          {alerts.map((alert) => (
            <p key={alert}>{alert}</p>
          ))}
        </div>
      ) : (
        <p className="message auth-status-message">DRE validada sem inconsistências críticas nos blocos principais.</p>
      )}
    </section>
  );
}

function DreRestaurantDiagnostics({ data, copy }: { data: DreImportData; copy: DrePanelCopy }) {
  const revenue = getDreRevenueValue(data);
  const finalBalance = getDreFinalBalanceValue(data) ?? revenue - getDreExpenseValue(data);
  const operationalResult = getDreOperationalResultValue(data) ?? finalBalance;
  const inputsValue = getDreInputsValue(data);
  const peopleValue = getDrePeopleValue(data);
  const operationalExpenseValue = getDreOperationalExpenseValue(data);
  const structureValue = operationalExpenseValue > 0 ? Math.max(0, operationalExpenseValue - peopleValue) : 0;
  const finalMargin = revenue > 0 ? (finalBalance / revenue) * 100 : 0;
  const operationalMargin = revenue > 0 ? (operationalResult / revenue) * 100 : 0;
  const inputsRatio = revenue > 0 ? (inputsValue / revenue) * 100 : 0;
  const peopleRatio = revenue > 0 ? (peopleValue / revenue) * 100 : 0;
  const structureRatio = revenue > 0 ? (structureValue / revenue) * 100 : 0;
  const revenueSectionLabels = new Set(getDreRevenueSections(data).map((section) => section.label));
  const expenseGroups = data.sections
    .filter((section) => !revenueSectionLabels.has(section.label))
    .flatMap((section) =>
      section.groups.map((group) => ({
        section: section.label,
        label: group.label,
        value: getDreGroupValue(group)
      }))
    )
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);
  const diagnosisCards = [
    {
      label: copy.dreFinalMarginCard,
      value: formatPercent(finalMargin),
      detail: formatCurrency(finalBalance),
      tone: getDreMarginTone(finalMargin)
    },
    {
      label: copy.dreOperationalMarginCard,
      value: formatPercent(operationalMargin),
      detail: formatCurrency(operationalResult),
      tone: getDreMarginTone(operationalMargin)
    },
    {
      label: copy.dreInputsOnRevenue,
      value: formatPercent(inputsRatio),
      detail: inputsValue > 0 ? formatCurrency(inputsValue) : copy.dreNoData,
      tone: getDreRatioTone(inputsRatio, 28, 35)
    },
    {
      label: copy.drePeopleOnRevenue,
      value: formatPercent(peopleRatio),
      detail: peopleValue > 0 ? formatCurrency(peopleValue) : copy.dreNoData,
      tone: getDreRatioTone(peopleRatio, 22, 30)
    },
    {
      label: copy.dreStructureOnRevenue,
      value: formatPercent(structureRatio),
      detail: operationalExpenseValue > 0 ? formatCurrency(structureValue) : copy.dreNoData,
      tone: getDreRatioTone(structureRatio, 18, 25)
    }
  ];
  const toneLabel = (tone: string) => {
    if (tone === "good") {
      return copy.dreHealthy;
    }

    if (tone === "bad") {
      return copy.dreCritical;
    }

    return copy.dreAttention;
  };

  return (
    <section className="dre-chart-card dre-diagnostics-panel">
      <div className="section-head">
        <div>
          <h3>{copy.dreRestaurantDiagnostics}</h3>
          <p>{copy.dreRestaurantDiagnosticsText}</p>
        </div>
      </div>

      <div className="dre-diagnostics-layout">
        <div className="dre-diagnostics-grid">
          {diagnosisCards.map((card) => (
            <article key={card.label} className={`dre-diagnostic-card ${card.tone}`}>
              <span className="eyebrow">{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
              <small>{toneLabel(card.tone)}</small>
            </article>
          ))}
        </div>
        <article className="dre-diagnostic-card attention-list bad">
          <span className="eyebrow">{copy.dreAttentionPoints}</span>
          <div className="dre-attention-list">
            {expenseGroups.map((item) => (
              <div key={`${item.section}-${item.label}`} className="dre-attention-row">
                <span>{item.label}</span>
                <strong>{formatCurrency(item.value)}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function DreHorizontalBreakdown({
  title,
  text,
  lines,
  useImportedPercent = false
}: {
  title: string;
  text: string;
  lines: DreImportData["sections"][number]["groups"][number]["lines"];
  useImportedPercent?: boolean;
}) {
  const total = lines.reduce((sum, line) => sum + line.value, 0);
  const visibleLines = lines
    .filter((line) => line.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 10);
  const maxValue = Math.max(...visibleLines.map((line) => line.value), 1);

  if (visibleLines.length === 0) {
    return null;
  }

  return (
    <section className="dre-chart-card dre-breakdown-card">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
        <strong>{formatCurrency(total)}</strong>
      </div>
      <div className="dre-breakdown-list">
        {visibleLines.map((line, index) => (
          <article key={`${line.label}-${line.rowNumber}`} className="dre-breakdown-row">
            <div className="dre-breakdown-label">
              <span>{line.label}</span>
              <strong>{formatCurrency(line.value)}</strong>
            </div>
            <div className="dre-section-bar-track">
              <span
                className="dre-section-bar-fill"
                style={
                  {
                    width: `${Math.max(4, (line.value / maxValue) * 100)}%`,
                    "--dre-color": drePalette[index % drePalette.length]
                  } as CSSProperties
                }
              />
            </div>
            <small>
              {formatPercent(
                useImportedPercent && line.percent !== undefined ? line.percent : total > 0 ? (line.value / total) * 100 : 0
              )}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function DreOperationalBreakdowns({ data, copy }: { data: DreImportData; copy: DrePanelCopy }) {
  const menuGroup = findDreGroupByIncludes(data, ["CARDAPIO"]) ?? findDrePrimaryRevenueGroup(data);
  const cardFeesGroup = findDreCardFeesGroup(data);
  const isMenuRevenue = menuGroup ? normalizeDreLabel(menuGroup.group.label).includes("CARDAPIO") : false;
  const visibleCards = Number(Boolean(menuGroup)) + Number(Boolean(cardFeesGroup));

  if (!menuGroup && !cardFeesGroup) {
    return null;
  }

  return (
    <section className={`dre-operational-grid ${visibleCards === 1 ? "single" : ""}`}>
      {menuGroup ? (
        <DreHorizontalBreakdown
          title={isMenuRevenue ? copy.dreMenuMixTitle : copy.dreRevenueMixTitle}
          text={isMenuRevenue ? copy.dreMenuMixText : copy.dreRevenueMixText}
          lines={menuGroup.group.lines}
        />
      ) : null}
      {cardFeesGroup ? (
        <DreHorizontalBreakdown
          title={copy.dreCardFeesTitle}
          text={copy.dreCardFeesText}
          lines={cardFeesGroup.group.lines}
          useImportedPercent
        />
      ) : null}
    </section>
  );
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function DreRevenueExpenseTrend({ data, copy, trendPoints }: { data: DreImportData; copy: DrePanelCopy; trendPoints?: DreTrendPoint[] }) {
  const revenue = getDreRevenueValue(data);
  const expenses = getDreExpenseValue(data);
  const height = 220;
  const width = 680;
  const padding = 28;
  const activeTrend = trendPoints && trendPoints.length > 1 ? trendPoints : undefined;

  if (activeTrend) {
    const maxValue = Math.max(...activeTrend.flatMap((point) => [point.revenue, point.expenses]), 1);
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    const getX = (index: number) => padding + (activeTrend.length === 1 ? plotWidth / 2 : (index / (activeTrend.length - 1)) * plotWidth);
    const getY = (value: number) => padding + (1 - value / maxValue) * plotHeight;
    const revenuePoints = activeTrend.map((point, index) => ({ x: getX(index), y: getY(point.revenue) }));
    const expensePoints = activeTrend.map((point, index) => ({ x: getX(index), y: getY(point.expenses) }));
    const labelStep = Math.max(1, Math.ceil(activeTrend.length / 6));

    return (
      <section className="dre-chart-card dre-line-chart-card">
        <div className="section-head">
          <div>
            <h3>{copy.dreRevenueVsExpenses}</h3>
            <p>{copy.dreRevenueVsExpensesText}</p>
          </div>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="dre-line-chart" role="img" aria-label={copy.dreRevenueVsExpenses}>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
          <path d={buildLinePath(revenuePoints)} className="dre-line revenue" />
          <path d={buildLinePath(expensePoints)} className="dre-line expense" />
          {activeTrend.map((point, index) => (
            <g key={`revenue-expense-${point.key}`}>
              <circle cx={getX(index)} cy={getY(point.revenue)} r="5" className="dre-point revenue" />
              <circle cx={getX(index)} cy={getY(point.expenses)} r="5" className="dre-point expense" />
              {index % labelStep === 0 || index === activeTrend.length - 1 ? (
                <text x={getX(index)} y={height - 6} textAnchor="middle">
                  {point.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
        <div className="dre-chart-legend-inline">
          <span className="revenue">
            {copy.dreRevenue}: {formatCurrency(revenue)}
          </span>
          <span className="expense">
            {copy.dreOutflows}: {formatCurrency(expenses)}
          </span>
        </div>
      </section>
    );
  }

  const maxValue = Math.max(revenue, expenses, 1);
  const x = width / 2;
  const revenueY = padding + (1 - revenue / maxValue) * (height - padding * 2);
  const expensesY = padding + (1 - expenses / maxValue) * (height - padding * 2);

  return (
    <section className="dre-chart-card dre-line-chart-card">
      <div className="section-head">
        <div>
          <h3>{copy.dreRevenueVsExpenses}</h3>
          <p>{copy.dreRevenueVsExpensesText}</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="dre-line-chart" role="img" aria-label={copy.dreRevenueVsExpenses}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <path
          d={`M ${padding} ${revenueY + 18} Q ${x} ${revenueY - 28} ${width - padding} ${revenueY + 8}`}
          className="dre-line revenue"
        />
        <path
          d={`M ${padding} ${expensesY + 18} Q ${x} ${expensesY - 20} ${width - padding} ${expensesY + 8}`}
          className="dre-line expense"
        />
        <circle cx={x} cy={revenueY} r="7" className="dre-point revenue" />
        <circle cx={x} cy={expensesY} r="7" className="dre-point expense" />
        <text x={x} y={height - 6} textAnchor="middle">
          {getDrePeriodShortLabel(data)}
        </text>
      </svg>
      <div className="dre-chart-legend-inline">
        <span className="revenue">
          {copy.dreRevenue}: {formatCurrency(revenue)}
        </span>
        <span className="expense">
          {copy.dreOutflows}: {formatCurrency(expenses)}
        </span>
      </div>
    </section>
  );
}

function DreOperationalResultBars({ data, copy, trendPoints }: { data: DreImportData; copy: DrePanelCopy; trendPoints?: DreTrendPoint[] }) {
  const operationalResult = getDreOperationalResultValue(data) ?? getDreFinalBalanceValue(data) ?? 0;
  const height = 220;
  const width = 680;
  const padding = 28;
  const activeTrend = trendPoints && trendPoints.length > 1 ? trendPoints : undefined;

  if (activeTrend) {
    const maxValue = Math.max(...activeTrend.map((point) => Math.abs(point.operationalResult)), 1);
    const hasNegative = activeTrend.some((point) => point.operationalResult < 0);
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    const baseline = hasNegative ? padding + plotHeight / 2 : height - padding;
    const scale = hasNegative ? (plotHeight / 2) / maxValue : plotHeight / maxValue;
    const slotWidth = plotWidth / activeTrend.length;
    const barWidth = Math.max(16, Math.min(46, slotWidth * 0.58));
    const labelStep = Math.max(1, Math.ceil(activeTrend.length / 6));

    return (
      <section className="dre-chart-card dre-line-chart-card">
        <div className="section-head">
          <div>
            <h3>{copy.dreOperationalResultChart}</h3>
            <p>{copy.dreOperationalResultChartText}</p>
          </div>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="dre-bar-chart" role="img" aria-label={copy.dreOperationalResultChart}>
          <line x1={padding} y1={baseline} x2={width - padding} y2={baseline} />
          {activeTrend.map((point, index) => {
            const x = padding + slotWidth * index + slotWidth / 2;
            const barHeight = Math.max(4, Math.abs(point.operationalResult) * scale);
            const barY = point.operationalResult >= 0 ? baseline - barHeight : baseline;
            const belowBarLabelY = barY + barHeight + 16;
            const negativeLabelFitsBelow = belowBarLabelY <= height - 34;
            const valueLabelY =
              point.operationalResult >= 0 || !negativeLabelFitsBelow
                ? Math.max(16, barY - 8)
                : belowBarLabelY;

            return (
              <g key={`operational-result-${point.key}`}>
                <rect
                  x={x - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx="7"
                  className={point.operationalResult >= 0 ? "positive" : "negative"}
                />
                <text
                  x={x}
                  y={valueLabelY}
                  textAnchor="middle"
                  className={`dre-bar-value-label ${point.operationalResult >= 0 ? "positive" : "negative"} ${
                    point.operationalResult < 0 && !negativeLabelFitsBelow ? "above-negative" : ""
                  }`}
                >
                  {formatCompactCurrency(point.operationalResult)}
                </text>
                {index % labelStep === 0 || index === activeTrend.length - 1 ? (
                  <text x={x} y={height - 6} textAnchor="middle">
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div className="dre-chart-legend-inline">
          <span>{formatCurrency(operationalResult)}</span>
        </div>
      </section>
    );
  }

  const maxValue = Math.max(Math.abs(operationalResult), 1);
  const barHeight = Math.max(16, (Math.abs(operationalResult) / maxValue) * (height - padding * 2));
  const baseline = height - padding;
  const barY = operationalResult >= 0 ? baseline - barHeight : baseline;

  return (
    <section className="dre-chart-card dre-line-chart-card">
      <div className="section-head">
        <div>
          <h3>{copy.dreOperationalResultChart}</h3>
          <p>{copy.dreOperationalResultChartText}</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="dre-bar-chart" role="img" aria-label={copy.dreOperationalResultChart}>
        <line x1={padding} y1={baseline} x2={width - padding} y2={baseline} />
        <rect
          x={width / 2 - 34}
          y={barY}
          width="68"
          height={barHeight}
          rx="8"
          className={operationalResult >= 0 ? "positive" : "negative"}
        />
        <text x={width / 2} y={height - 6} textAnchor="middle">
          {getDrePeriodShortLabel(data)}
        </text>
      </svg>
      <div className="dre-chart-legend-inline">
        <span>{formatCurrency(operationalResult)}</span>
      </div>
    </section>
  );
}

function DreFinancialCharts({ data, copy, trendPoints }: { data: DreImportData; copy: DrePanelCopy; trendPoints?: DreTrendPoint[] }) {
  return (
    <section className="dre-financial-chart-grid">
      <DreRevenueExpenseTrend data={data} copy={copy} trendPoints={trendPoints} />
      <DreOperationalResultBars data={data} copy={copy} trendPoints={trendPoints} />
    </section>
  );
}

type DreComparisonRestaurant = Pick<RestaurantMembership, "restaurantId" | "restaurantName" | "photoUrl">;

type DreComparisonRow = {
  restaurantId: string;
  restaurantName: string;
  data: DreImportData;
  periods: DrePeriodData[];
  metrics: ReturnType<typeof getDreComparisonMetrics>;
};

const formatDreAxisRestaurantName = (value: string) => {
  const normalized = value.trim();
  return normalized.length > 16 ? `${normalized.slice(0, 14).trim()}…` : normalized;
};

const getWorkspaceDrePeriods = async (session: AuthSession, restaurantId: string) => {
  const workspace =
    session.authMode === "supabase"
      ? await loadCloudWorkspace(restaurantId)
      : loadRestaurantWorkspace<PersistedWorkspace>(restaurantId);

  return workspace?.drePeriods ?? [];
};

const getSelectedRestaurantPeriods = (periods: DrePeriodData[], selectedKeys: string[]) => {
  const availablePeriods = [...periods].sort((left, right) => left.key.localeCompare(right.key));

  if (selectedKeys.length === 0) {
    return availablePeriods.slice(-1);
  }

  return availablePeriods.filter((period) => selectedKeys.includes(period.key));
};

function DreComparisonSelector({
  restaurants,
  selectedIds,
  activeRestaurantId,
  loading,
  enabled,
  onModeChange,
  onToggle
}: {
  restaurants: DreComparisonRestaurant[];
  selectedIds: string[];
  activeRestaurantId?: string;
  loading: boolean;
  enabled: boolean;
  onModeChange: (enabled: boolean) => void;
  onToggle: (restaurantId: string) => void;
}) {
  if (restaurants.length <= 1) {
    return null;
  }

  return (
    <div className="dre-view-mode-panel">
      <div className="dre-view-mode-head">
        <span className="eyebrow">Visualização</span>
        {loading && enabled ? <span className="soft-badge">Carregando dados</span> : null}
      </div>
      <div className="dre-view-mode-switch" role="group" aria-label="Modo de visualização da DRE">
        <button type="button" className={!enabled ? "active" : ""} aria-pressed={!enabled} onClick={() => onModeChange(false)}>
          Única
        </button>
        <button type="button" className={enabled ? "active" : ""} aria-pressed={enabled} onClick={() => onModeChange(true)}>
          Comparativa
        </button>
      </div>
      {enabled ? (
        <RestaurantNavigatorPanel
          eyebrow=""
          title="Restaurantes da comparação"
          memberships={restaurants.map((restaurant) => ({ ...restaurant, membershipId: restaurant.restaurantId }))}
          activeRestaurantId={activeRestaurantId}
          multiple
          selectedRestaurantIds={selectedIds}
          onActivateRestaurant={onToggle}
        />
      ) : null}
    </div>
  );
}

function DreComparisonMetricBars({
  title,
  description,
  rows,
  getValue,
  mode = "currency",
  lowerIsBetter = false,
  metricOptions,
  selectedMetricKey,
  onSelectMetric
}: {
  title: string;
  description: string;
  rows: DreComparisonRow[];
  getValue: (row: DreComparisonRow) => number;
  mode?: "currency" | "percent";
  lowerIsBetter?: boolean;
  metricOptions?: Array<{ key: string; label: string }>;
  selectedMetricKey?: string;
  onSelectMetric?: (key: string) => void;
}) {
  const values = rows.map((row) => getValue(row));
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);
  const rankedValues = [...values].filter((value) => Number.isFinite(value));
  const bestValue = lowerIsBetter
    ? Math.min(...rankedValues)
    : Math.max(...rankedValues);

  return (
    <section className="dre-chart-card dre-comparison-chart-card">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="dre-comparison-bars">
        {rows.map((row, index) => {
          const value = getValue(row);
          const width = Math.max(5, (Math.abs(value) / maxAbs) * 100);
          const positive = value >= 0;
          const isBest = Number.isFinite(value) && value === bestValue;

          return (
            <article key={`${title}-${row.restaurantId}`} className={`dre-comparison-bar-row ${positive ? "positive" : "negative"}`}>
              <div className="dre-comparison-bar-head">
                <span>{row.restaurantName}</span>
                <strong>{mode === "percent" ? formatPercent(value) : formatCurrency(value)}</strong>
              </div>
              <div className="dre-comparison-bar-track">
                <span
                  className={isBest ? "best" : ""}
                  style={
                    {
                      width: `${width}%`,
                      "--dre-color": drePalette[index % drePalette.length]
                    } as CSSProperties
                  }
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DreComparisonColumnChart({
  title,
  description,
  rows,
  getValue,
  mode = "currency"
}: {
  title: string;
  description: string;
  rows: DreComparisonRow[];
  getValue: (row: DreComparisonRow) => number;
  mode?: "currency" | "percent";
}) {
  const values = rows.map((row) => getValue(row));
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);

  return (
    <section className="dre-chart-card dre-comparison-chart-card dre-comparison-column-card">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="dre-comparison-column-chart">
        {rows.map((row, index) => {
          const value = getValue(row);
          const height = Math.max(8, (Math.abs(value) / maxAbs) * 100);

          return (
            <article key={`${title}-${row.restaurantId}`} className="dre-comparison-column-item">
              <strong>{mode === "percent" ? formatPercent(value) : formatCompactCurrency(value)}</strong>
              <div className="dre-comparison-column-track">
                <span
                  className={value >= 0 ? "positive" : "negative"}
                  style={
                    {
                      height: `${height}%`,
                      "--dre-color": drePalette[index % drePalette.length]
                    } as CSSProperties
                  }
                />
              </div>
              <small>{row.restaurantName}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DreComparisonZeroBarChart({
  title,
  description,
  rows,
  getValue,
  mode = "currency",
  lowerIsBetter = false,
  metricOptions,
  selectedMetricKey,
  onSelectMetric
}: {
  title: string;
  description: string;
  rows: DreComparisonRow[];
  getValue: (row: DreComparisonRow) => number;
  mode?: "currency" | "percent";
  lowerIsBetter?: boolean;
  metricOptions?: Array<{ key: string; label: string }>;
  selectedMetricKey?: string;
  onSelectMetric?: (key: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { details: hoveredIndex, setDetails: setHoveredIndex, chartRef, anchor, onMouseLeave } = useChartDetails<number>();
  const restaurantCount = Math.max(rows.length, 1);
  const width = Math.max(760, 170 + restaurantCount * 112);
  const height = 380;
  const paddingLeft = 124;
  const paddingRight = 34;
  const paddingTop = 42;
  const paddingBottom = 96;
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;
  const values = rows.map((row) => getValue(row));
  const totalAbsoluteValue = values.reduce((sum, value) => sum + Math.abs(value), 0);
  const averageValue = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const rankedRows = rows
    .map((row, index) => ({ row, value: values[index] ?? 0 }))
    .sort((left, right) => right.value - left.value);
  const rawMaxValue = Math.max(...values, 0);
  const rawMinValue = Math.min(...values, 0);
  const span = Math.max(rawMaxValue - rawMinValue, Math.max(Math.abs(rawMaxValue), Math.abs(rawMinValue), 1));
  const pad = Math.max(span * 0.28, mode === "percent" ? 6 : span * 0.08);
  let maxValue = rawMaxValue + pad;
  let minValue = rawMinValue - pad;

  if (rawMinValue >= 0) {
    minValue = mode === "currency" || !lowerIsBetter ? -Math.max(rawMaxValue * 0.1, pad * 0.6) : 0;
    maxValue = Math.max(rawMaxValue * 1.32, mode === "percent" ? (lowerIsBetter ? rawMaxValue + 8 : 16) : rawMaxValue + pad);
  }

  if (rawMaxValue <= 0) {
    maxValue = 0;
    minValue = rawMinValue - pad;
  }

  if (mode === "percent" && !lowerIsBetter) {
    maxValue = Math.max(maxValue, 14);
    minValue = Math.min(minValue, -6);
  }
  const range = Math.max(1, maxValue - minValue);
  const zeroY = paddingTop + (maxValue / range) * innerHeight;
  const barSlot = innerWidth / restaurantCount;
  const barWidth = Math.min(34, Math.max(14, barSlot * 0.22));
  const axisLabelWidth = Math.min(92, Math.max(64, barSlot * 0.76));
  const showInlineValueLabels = barSlot >= 50;
  const showAxisRestaurantLabels = barSlot >= 66;
  const formatValue = (value: number) => (mode === "percent" ? formatPercent(value) : formatCompactCurrency(value));
  const formatFullValue = (value: number) => (mode === "percent" ? formatPercent(value) : formatCurrency(value));
  const chartIdBase = `dre-bar-chart-${title.replace(/\W/g, "")}`;
  const getY = (value: number) => paddingTop + ((maxValue - value) / range) * innerHeight;
  const axisValues = [maxValue, averageValue, 0, minValue].filter(
    (value, index, list) => list.findIndex((item) => Math.abs(item - value) < 0.0001) === index
  );
  const benchmarkBands =
    mode === "percent" && !lowerIsBetter
      ? [
          { label: "Saudável", detail: "> 10%", from: maxValue, to: 10, className: "good" },
          { label: "Atenção", detail: "0% a 10%", from: 10, to: 0, className: "mid" },
          { label: "Crítico", detail: "< 0%", from: 0, to: minValue, className: "bad" }
        ]
      : mode === "percent" && lowerIsBetter
        ? [
            { label: "Saudável", detail: "menor pressão", from: Math.min(maxValue, 30), to: 0, className: "good" },
            { label: "Atenção", detail: "acima da média", from: maxValue, to: Math.min(maxValue, 30), className: "mid" }
          ]
        : [
            { label: "Acima da média", detail: formatValue(averageValue), from: maxValue, to: averageValue, className: "good" },
            { label: "Abaixo da média", detail: "comparativo", from: averageValue, to: minValue, className: "mid" }
          ];
  const healthyLimit = lowerIsBetter ? averageValue * 0.86 : averageValue;
  const attentionLimit = lowerIsBetter ? averageValue * 1.12 : Math.min(0, averageValue * 0.72);
  const comparisonBands =
    mode === "percent" && !lowerIsBetter
      ? [
          { label: "Saudável", detail: "> 10%", from: maxValue, to: 10, className: "good" },
          { label: "Atenção", detail: "0% a 10%", from: 10, to: 0, className: "mid" },
          { label: "Crítico", detail: "< 0%", from: 0, to: minValue, className: "bad" }
        ]
      : lowerIsBetter
        ? [
            { label: "Saudável", detail: `até ${formatValue(healthyLimit)}`, from: healthyLimit, to: minValue, className: "good" },
            { label: "Atenção", detail: `até ${formatValue(attentionLimit)}`, from: attentionLimit, to: healthyLimit, className: "mid" },
            { label: "Crítico", detail: `acima de ${formatValue(attentionLimit)}`, from: maxValue, to: attentionLimit, className: "bad" }
          ]
        : [
            { label: "Saudável", detail: `acima de ${formatValue(healthyLimit)}`, from: maxValue, to: healthyLimit, className: "good" },
            { label: "Atenção", detail: `até ${formatValue(healthyLimit)}`, from: healthyLimit, to: attentionLimit, className: "mid" },
            { label: "Crítico", detail: `abaixo de ${formatValue(attentionLimit)}`, from: attentionLimit, to: minValue, className: "bad" }
          ];
  const visibleBenchmarkBands = comparisonBands.filter((band) => Math.abs(band.from - band.to) > 0.0001);
  const activeRow = rows[Math.min(activeIndex, rows.length - 1)];
  const activeValue = activeRow ? getValue(activeRow) : 0;
  const activeRank = activeRow ? rankedRows.findIndex((item) => item.row.restaurantId === activeRow.restaurantId) + 1 : 0;
  const activeShare = totalAbsoluteValue > 0 ? (Math.abs(activeValue) / totalAbsoluteValue) * 100 : 0;
  const activeDelta = activeValue - averageValue;
  const hoveredRow = hoveredIndex !== undefined ? rows[hoveredIndex] : undefined;
  const hoveredValue = hoveredRow ? getValue(hoveredRow) : 0;
  const hoveredRank = hoveredRow ? rankedRows.findIndex((item) => item.row.restaurantId === hoveredRow.restaurantId) + 1 : 0;
  const hoveredShare = totalAbsoluteValue > 0 ? (Math.abs(hoveredValue) / totalAbsoluteValue) * 100 : 0;
  const hoveredDelta = hoveredValue - averageValue;

  return (
    <section ref={chartRef} className="dre-chart-card dre-comparison-chart-card dre-future-chart-card" onMouseLeave={onMouseLeave}>
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {metricOptions && onSelectMetric ? (
        <label className="dre-comparison-metric-select">
          <span>Indicador</span>
          <select value={selectedMetricKey} onChange={(event) => onSelectMetric(event.target.value)} aria-label="Indicador comparativo">
            {metricOptions.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {metric.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {visibleBenchmarkBands.length > 0 ? (
        <div className="dre-benchmark-zone-legend dre-benchmark-zone-legend-top">
          {visibleBenchmarkBands.map((band) => (
            <span key={band.label} className={band.className}>
              <strong>{band.label}</strong>
              <small>{band.detail}</small>
            </span>
          ))}
        </div>
      ) : null}
      <p className="dre-chart-interaction-hint">Passe o cursor ou toque em uma barra para ver o detalhamento.</p>
      <div className="dre-zero-bar-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="dre-zero-bar-chart" role="group" aria-label={title} style={{ minWidth: width }}>
          <defs>
            <clipPath id={`${chartIdBase}-clip`}>
              <rect x={paddingLeft} y={paddingTop} width={innerWidth} height={innerHeight} />
            </clipPath>
          </defs>
          <rect x={paddingLeft} y={paddingTop} width={innerWidth} height={innerHeight} className="dre-zero-zone" />
          <g clipPath={`url(#${chartIdBase}-clip)`}>
            {visibleBenchmarkBands.map((band) => {
              const bandY = paddingTop + ((maxValue - band.from) / range) * innerHeight;
              const bandEndY = paddingTop + ((maxValue - band.to) / range) * innerHeight;
              return (
                <rect
                  key={`${title}-${band.label}`}
                  x={paddingLeft}
                  y={Math.min(bandY, bandEndY)}
                  width={innerWidth}
                  height={Math.max(0, Math.abs(bandEndY - bandY))}
                  className={`dre-zero-benchmark-band ${band.className}`}
                />
              );
            })}
          </g>
          <line x1={paddingLeft} x2={paddingLeft} y1={paddingTop} y2={height - paddingBottom} className="dre-zero-y-axis" />
          {axisValues.map((axisValue) => {
            const y = paddingTop + ((maxValue - axisValue) / range) * innerHeight;
            return (
              <g key={`${title}-${axisValue}`}>
                <line
                  x1={paddingLeft}
                  x2={width - paddingRight}
                  y1={y}
                  y2={y}
                  className={axisValue === 0 ? "dre-zero-axis" : "dre-zero-grid-line"}
                />
                <text x={paddingLeft - 16} y={y + 5} textAnchor="end" className="dre-zero-axis-label">
                  {axisValue === 0 ? "0" : formatValue(axisValue)}
                </text>
              </g>
            );
          })}
          <text x={paddingLeft - 16} y={paddingTop - 18} textAnchor="end" className="dre-zero-scale-label">
            Escala
          </text>
          <line
            x1={paddingLeft}
            x2={width - paddingRight}
            y1={paddingTop + ((maxValue - averageValue) / range) * innerHeight}
            y2={paddingTop + ((maxValue - averageValue) / range) * innerHeight}
            className="dre-zero-average-line"
          />
          {rows.map((row, index) => {
            const value = getValue(row);
            const x = paddingLeft + index * barSlot + barSlot / 2;
            const valueY = getY(value);
            const isZeroValue = Math.abs(value) < 0.0001;
            const displayBarHeight = isZeroValue ? 0 : Math.max(8, Math.abs(zeroY - valueY));
            const barY = value >= 0 ? zeroY - displayBarHeight : zeroY;
            const barBottom = value >= 0 ? zeroY : zeroY + displayBarHeight;
            const barRadius = Math.min(12, barWidth / 2, displayBarHeight / 2);
            const barPath =
              value >= 0
                ? `M ${x - barWidth / 2} ${zeroY} L ${x - barWidth / 2} ${barY + barRadius} Q ${x - barWidth / 2} ${barY} ${x - barWidth / 2 + barRadius} ${barY} L ${x + barWidth / 2 - barRadius} ${barY} Q ${x + barWidth / 2} ${barY} ${x + barWidth / 2} ${barY + barRadius} L ${x + barWidth / 2} ${zeroY} Z`
                : `M ${x - barWidth / 2} ${zeroY} L ${x + barWidth / 2} ${zeroY} L ${x + barWidth / 2} ${barBottom - barRadius} Q ${x + barWidth / 2} ${barBottom} ${x + barWidth / 2 - barRadius} ${barBottom} L ${x - barWidth / 2 + barRadius} ${barBottom} Q ${x - barWidth / 2} ${barBottom} ${x - barWidth / 2} ${barBottom - barRadius} Z`;
            const useVerticalValue = showInlineValueLabels && displayBarHeight >= 58;
            const valueTextY = value >= 0 ? barY + displayBarHeight / 2 : barBottom - displayBarHeight / 2;
            const outsideValueY = isZeroValue ? zeroY - 14 : value >= 0 ? barY - 12 : barBottom + 18;
            const labelText = formatValue(value);
            const restaurantColor = drePalette[index % drePalette.length];

            return (
              <g key={row.restaurantId} className={`${index === activeIndex ? "active" : ""} ${isZeroValue ? "is-zero" : ""}`}
                role="button" tabIndex={0} aria-label={`${row.restaurantName}: ${formatFullValue(value)}`}
                onKeyDown={activateChartMark}
                onClick={() => { setActiveIndex(index); setHoveredIndex(index); }}
                onFocus={() => { setActiveIndex(index); setHoveredIndex(index); }}>
                <rect x={x - Math.max(24, barWidth) / 2} y={Math.min(barY, zeroY - 12)} width={Math.max(24, barWidth)} height={Math.max(24, displayBarHeight + 12)} fill="transparent" />
                <line x1={x} x2={x} y1={zeroY} y2={value >= 0 ? barY : barBottom} className="dre-zero-bar-guide" />
                {isZeroValue ? (
                  <circle
                    cx={x}
                    cy={zeroY}
                    r="4.5"
                    fill={restaurantColor}
                    className="dre-zero-dot"
                    onMouseEnter={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                    onFocus={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                    onClick={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                    onTouchStart={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                  />
                ) : (
                  <path
                    d={barPath}
                    fill={value >= 0 ? restaurantColor : "#e4574f"}
                    className="dre-zero-bar"
                    onMouseEnter={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                    onFocus={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                    onClick={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                    onTouchStart={() => {
                      setActiveIndex(index);
                      setHoveredIndex(index);
                    }}
                  />
                )}
                {useVerticalValue ? (
                  <text
                    x={x}
                    y={valueTextY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="dre-bar-vertical-value"
                    transform={`rotate(-90 ${x} ${valueTextY})`}
                  >
                    {labelText}
                  </text>
                ) : (
                  <text
                    x={x}
                    y={outsideValueY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`dre-bar-external-value ${isZeroValue ? "zero" : ""}`}
                  >
                    {labelText}
                  </text>
                )}
                {showAxisRestaurantLabels ? (
                  <foreignObject x={x - axisLabelWidth / 2} y={height - 72} width={axisLabelWidth} height="42">
                    <div className="dre-zero-restaurant-label-html" title={row.restaurantName}>
                      {row.restaurantName}
                    </div>
                  </foreignObject>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {visibleBenchmarkBands.length > 0 ? (
        <div className="dre-benchmark-zone-legend dre-benchmark-zone-legend-bottom">
          {visibleBenchmarkBands.map((band) => (
            <span key={band.label} className={band.className}>
              <strong>{band.label}</strong>
              <small>{band.detail}</small>
            </span>
          ))}
        </div>
      ) : null}
      {hoveredRow ? (
        <ChartDetails anchor={anchor}>
          <span>{hoveredRow.restaurantName}</span>
          <strong>{formatFullValue(hoveredValue)}</strong>
          <small>Ranking #{hoveredRank}</small>
          <small>{formatPercent(hoveredShare)} do total comparado</small>
          <small>{hoveredDelta >= 0 ? "+" : ""}{formatFullValue(hoveredDelta)} vs. média</small>
        </ChartDetails>
      ) : null}
      {activeRow ? (
        <div className="dre-benchmark-insight" style={{ "--dre-color": drePalette[activeIndex % drePalette.length] } as CSSProperties}>
          <span>{activeRow.restaurantName}</span>
          <strong>{formatFullValue(activeValue)}</strong>
          <small>Ranking #{activeRank}</small>
          <small>{formatPercent(activeShare)} do total comparado</small>
          <small>{activeDelta >= 0 ? "+" : ""}{formatFullValue(activeDelta)} vs. média</small>
        </div>
      ) : null}
      <div className="dre-chart-centered-legend">
        {rows.map((row, index) => (
          <span key={row.restaurantId}>
            <i style={{ background: drePalette[index % drePalette.length] }} />
            {row.restaurantName}
          </span>
        ))}
      </div>
    </section>
  );
}

function DreComparisonGroupedRatioChart({ rows }: { rows: DreComparisonRow[] }) {
  const metrics = [
    { key: "cmv", label: "CMV", color: "#2f6f5e" },
    { key: "cmo", label: "CMO", color: "#a55c7a" },
    { key: "taxes", label: "Impostos", color: "#496f9f" },
    { key: "materials", label: "Materiais", color: "#c9823a" },
    { key: "occupancy", label: "Locação", color: "#8b6f47" }
  ] as const;
  const getRatio = (row: DreComparisonRow, key: (typeof metrics)[number]["key"]) =>
    row.metrics.revenue > 0 ? (row.metrics[key] / row.metrics.revenue) * 100 : 0;
  const maxRatio = Math.max(
    ...rows.flatMap((row) => metrics.map((metric) => Math.abs(getRatio(row, metric.key)))),
    1
  );

  return (
    <section className="dre-chart-card dre-comparison-chart-card dre-comparison-grouped-card">
      <div className="section-head">
        <div>
          <h3>Pressões sobre receita</h3>
          <p>Mostra valor absoluto e percentual sobre receita para cada restaurante.</p>
        </div>
      </div>
      <div className="dre-pressure-card-grid">
        {rows.map((row) => (
          <article key={row.restaurantId} className="dre-pressure-card">
            <div className="dre-pressure-card-head">
              <strong>{row.restaurantName}</strong>
              <span>{formatCurrency(row.metrics.revenue)}</span>
            </div>
            <div className="dre-pressure-list">
              {metrics.map((metric) => {
                const ratio = getRatio(row, metric.key);
                const value = row.metrics[metric.key];

                return (
                  <div
                    key={metric.key}
                    className="dre-pressure-row"
                    style={{ "--dre-color": metric.color } as CSSProperties}
                  >
                    <div className="dre-pressure-row-head">
                      <span>{metric.label}</span>
                      <strong>{formatCurrency(value)} · {formatPercent(ratio)}</strong>
                    </div>
                    <div className="dre-pressure-track">
                      <span style={{ width: `${Math.max(2, (Math.abs(ratio) / maxRatio) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      <div className="dre-composition-legend">
        {metrics.map((metric) => (
          <span key={metric.key}>
            <i style={{ background: metric.color }} />
            {metric.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function DreComparisonGroupedPressureChart({ rows }: { rows: DreComparisonRow[] }) {
  const { details: active, setDetails: setActive, chartRef, anchor, onMouseLeave } = useChartDetails<{
    restaurantName: string;
    metricLabel: string;
    ratio: number;
    value: number;
    color: string;
  }>();
  const metrics = [
    { key: "cmv", label: "Insumos / CMV" },
    { key: "cmo", label: "Pessoal / CMO" },
    { key: "taxes", label: "Impostos" },
    { key: "materials", label: "Materiais" },
    { key: "occupancy", label: "Locação" }
  ] as const;
  const getRatio = (row: DreComparisonRow, key: (typeof metrics)[number]["key"]) =>
    row.metrics.revenue > 0 ? (row.metrics[key] / row.metrics.revenue) * 100 : 0;
  const maxRatio = Math.max(
    ...rows.flatMap((row) => metrics.map((metric) => Math.abs(getRatio(row, metric.key)))),
    1
  );
  const chartWidth = Math.max(840, 190 + metrics.length * Math.max(128, rows.length * 34));
  const chartHeight = 420;
  const paddingLeft = 150;
  const paddingRight = 34;
  const paddingTop = 54;
  const paddingBottom = 92;
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const scaleMax = Math.ceil(Math.max(10, maxRatio * 1.22) / 5) * 5;
  const groupWidth = innerWidth / metrics.length;
  const groupInnerWidth = groupWidth * 0.72;
  const barGap = rows.length > 6 ? 5 : 8;
  const barWidth = Math.min(28, Math.max(9, (groupInnerWidth - barGap * Math.max(0, rows.length - 1)) / Math.max(rows.length, 1)));
  const getY = (value: number) => paddingTop + (1 - Math.min(Math.max(value, 0), scaleMax) / scaleMax) * innerHeight;
  const axisValues = [scaleMax, scaleMax * 0.75, scaleMax * 0.5, scaleMax * 0.25, 0];

  return (
    <section ref={chartRef} className="dre-chart-card dre-comparison-chart-card dre-comparison-grouped-card dre-grouped-reference-card" onMouseLeave={onMouseLeave}>
      <div className="section-head">
        <div>
          <h3>Pressões sobre receita</h3>
          <p>Compara CMV, CMO, impostos, materiais e locação como percentual da receita.</p>
        </div>
      </div>
      <div className="dre-grouped-chart-shell">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="dre-grouped-ratio-chart" role="group" aria-label="Pressões sobre receita" style={{ minWidth: chartWidth }}>
          <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={paddingTop + innerHeight} className="dre-line-y-axis" />
          <text x={paddingLeft - 118} y={paddingTop + innerHeight / 2} textAnchor="middle" className="dre-line-measure-label dre-grouped-measure-label" transform={`rotate(-90 ${paddingLeft - 118} ${paddingTop + innerHeight / 2})`}>
            % da receita
          </text>
          {axisValues.map((value) => {
            const y = getY(value);
            return (
              <g key={value}>
                <line x1={paddingLeft} y1={y} x2={chartWidth - paddingRight} y2={y} className={value === 0 ? "dre-zero-axis" : "dre-zero-grid-line"} />
                <text x={paddingLeft - 14} y={y + 5} textAnchor="end" className="dre-line-axis-label">
                  {formatPercent(value)}
                </text>
              </g>
            );
          })}
          {metrics.map((metric, metricIndex) => {
            const groupCenter = paddingLeft + metricIndex * groupWidth + groupWidth / 2;
            const groupStart = groupCenter - (rows.length * barWidth + Math.max(0, rows.length - 1) * barGap) / 2;

            return (
              <g key={metric.key}>
                {rows.map((row, rowIndex) => {
                  const ratio = getRatio(row, metric.key);
                  const value = row.metrics[metric.key];
                  const color = drePalette[rowIndex % drePalette.length];
                  const x = groupStart + rowIndex * (barWidth + barGap);
                  const y = getY(ratio);
                  const barHeight = Math.max(2, paddingTop + innerHeight - y);
                  const radius = Math.min(10, barWidth / 2, barHeight / 2);
                  const labelFits = barHeight >= 48 && barWidth >= 15;

                  return (
                    <g key={`${metric.key}-${row.restaurantId}`} role="button" tabIndex={0}
                      aria-label={`${row.restaurantName}, ${metric.label}: ${formatPercent(ratio)}, ${formatCurrency(value)}`}
                      onKeyDown={activateChartMark}
                      onFocus={() => setActive({ restaurantName: row.restaurantName, metricLabel: metric.label, ratio, value, color })}
                      onClick={() => setActive({ restaurantName: row.restaurantName, metricLabel: metric.label, ratio, value, color })}>
                      <rect x={x} y={Math.min(y, paddingTop + innerHeight - 24)} width={barWidth} height={Math.max(24, barHeight)} fill="transparent" />
                      <path
                        d={`M ${x} ${paddingTop + innerHeight} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + barWidth - radius} ${y} Q ${x + barWidth} ${y} ${x + barWidth} ${y + radius} L ${x + barWidth} ${paddingTop + innerHeight} Z`}
                        fill={color}
                        className="dre-grouped-ratio-bar"
                        onMouseEnter={() =>
                          setActive({
                            restaurantName: row.restaurantName,
                            metricLabel: metric.label,
                            ratio,
                            value,
                            color
                          })
                        }
                        onFocus={() =>
                          setActive({
                            restaurantName: row.restaurantName,
                            metricLabel: metric.label,
                            ratio,
                            value,
                            color
                          })
                        }
                        onClick={() =>
                          setActive({
                            restaurantName: row.restaurantName,
                            metricLabel: metric.label,
                            ratio,
                            value,
                            color
                          })
                        }
                        onTouchStart={() =>
                          setActive({
                            restaurantName: row.restaurantName,
                            metricLabel: metric.label,
                            ratio,
                            value,
                            color
                          })
                        }
                      />
                      {labelFits ? (
                        <text
                          x={x + barWidth / 2}
                          y={y + barHeight / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="dre-bar-vertical-value"
                          transform={`rotate(-90 ${x + barWidth / 2} ${y + barHeight / 2})`}
                        >
                          {formatPercent(ratio)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                <text x={groupCenter} y={chartHeight - 46} textAnchor="middle" className="dre-grouped-metric-label">
                  {metric.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {active ? (
        <ChartDetails anchor={anchor}>
          <span>{active.restaurantName}</span>
          <strong>{active.metricLabel}</strong>
          <small>{formatPercent(active.ratio)} da receita</small>
          <small>{formatCurrency(active.value)}</small>
        </ChartDetails>
      ) : null}
      <div className="dre-chart-centered-legend">
        {rows.map((row, index) => (
          <span key={row.restaurantId}>
            <i style={{ background: drePalette[index % drePalette.length] }} />
            {row.restaurantName}
          </span>
        ))}
      </div>
    </section>
  );
}

function DreComparisonEvolutionChart({ rows }: { rows: DreComparisonRow[] }) {
  const { details: tooltip, setDetails: setTooltip, chartRef, anchor, onMouseLeave } = useChartDetails<{
    x: number;
    y: number;
    restaurantName: string;
    label: string;
    value: number;
    color: string;
  }>();
  const periodKeys = [
    ...new Set(rows.flatMap((row) => row.periods.map((period) => period.key)))
  ].sort((left, right) => left.localeCompare(right));

  if (periodKeys.length <= 1) {
    return null;
  }

  const width = 1080;
  const height = 520;
  const paddingLeft = 150;
  const paddingRight = 96;
  const paddingTop = 46;
  const paddingBottom = 118;
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;
  const series = rows.map((row, rowIndex) => ({
    restaurantId: row.restaurantId,
    restaurantName: row.restaurantName,
    color: drePalette[rowIndex % drePalette.length],
    points: periodKeys.map((periodKey) => {
      const period = row.periods.find((item) => item.key === periodKey);
      const metrics = period ? getDreComparisonMetrics(period.data) : undefined;
      return {
        key: periodKey,
        label: period ? getDrePeriodShortLabel(period.data) : periodKey,
        value: metrics && metrics.revenue > 0 ? (metrics.operationalResult / metrics.revenue) * 100 : undefined
      };
    })
  }));
  const globalMinValue = -100;
  const globalMaxValue = 100;
  const range = Math.max(1, globalMaxValue - globalMinValue);
  const getX = (index: number) => paddingLeft + (periodKeys.length === 1 ? innerWidth / 2 : (index / (periodKeys.length - 1)) * innerWidth);
  const getY = (value: number) => {
    const clampedValue = Math.min(globalMaxValue, Math.max(globalMinValue, value));
    return paddingTop + ((globalMaxValue - clampedValue) / range) * innerHeight;
  };
  const healthyBoundaryY = getY(10);
  const attentionBoundaryY = getY(0);
  const healthyHeight = Math.max(0, healthyBoundaryY - paddingTop);
  const attentionHeight = Math.max(0, attentionBoundaryY - healthyBoundaryY);
  const criticalHeight = Math.max(0, paddingTop + innerHeight - attentionBoundaryY);
  const buildPath = (points: Array<{ value?: number }>) => {
    const plottedPoints = points
      .map((point, index) => {
        if (point.value === undefined) {
          return undefined;
        }

        return { x: getX(index), y: getY(point.value) };
      })
      .filter((point): point is { x: number; y: number } => Boolean(point));

    if (plottedPoints.length === 0) {
      return "";
    }

    return plottedPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  };
  const zoneLabels = [
    { label: "Saudável", limit: "> 10%", y: paddingTop + healthyHeight / 2, className: "good" },
    { label: "Atenção", limit: "0% a 10%", y: healthyBoundaryY + attentionHeight / 2, className: "mid" },
    { label: "Crítico", limit: "< 0%", y: attentionBoundaryY + criticalHeight / 2, className: "bad" }
  ];
  const axisLabels = [100, 50, 0, -50, -100].map((value) => ({
    value,
    label: formatPercent(value),
    y: getY(value)
  }));

  return (
    <section ref={chartRef} className="dre-chart-card dre-comparison-chart-card dre-comparison-evolution-card dre-line-reference-card" onMouseLeave={onMouseLeave}>
      <div className="section-head">
        <div>
          <h3>Evolução da margem operacional</h3>
          <p>Compara a tendência mensal dos restaurantes selecionados. Passe o cursor sobre os pontos para ver os valores.</p>
        </div>
      </div>
      <div className="dre-comparison-evolution-shell">
        <div className="dre-evolution-zone-legend" aria-label="Classificações da margem operacional">
          {zoneLabels.map((zone) => (
            <span key={zone.label} className={zone.className}>
              <strong>{zone.label}</strong>
              <small>{zone.limit}</small>
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="dre-comparison-evolution-chart" role="group" aria-label="Evolução comparativa da margem operacional">
          <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={paddingTop + innerHeight} className="dre-line-y-axis" />
          <text x={paddingLeft - 118} y={paddingTop + innerHeight / 2} textAnchor="middle" className="dre-line-measure-label" transform={`rotate(-90 ${paddingLeft - 118} ${paddingTop + innerHeight / 2})`}>
            Margem operacional
          </text>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.restaurantId} id={`dre-line-gradient-${item.restaurantId}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={item.color} stopOpacity="0.62" />
                <stop offset="100%" stopColor={item.color} stopOpacity="1" />
              </linearGradient>
            ))}
            <clipPath id="dre-evolution-zone-clip">
              <rect x={paddingLeft} y={paddingTop} width={innerWidth} height={innerHeight} rx="28" />
            </clipPath>
          </defs>
          <rect x={paddingLeft} y={paddingTop} width={innerWidth} height={innerHeight} rx="28" className="dre-evolution-zone-base" />
          <g clipPath="url(#dre-evolution-zone-clip)">
            <rect x={paddingLeft} y={paddingTop} width={innerWidth} height={healthyHeight} className="dre-evolution-zone good" />
            <rect x={paddingLeft} y={healthyBoundaryY} width={innerWidth} height={attentionHeight} className="dre-evolution-zone mid" />
            <rect x={paddingLeft} y={attentionBoundaryY} width={innerWidth} height={criticalHeight} className="dre-evolution-zone bad" />
          </g>
          <line x1={paddingLeft} y1={healthyBoundaryY} x2={width - paddingRight} y2={healthyBoundaryY} className="dre-evolution-marker-line" />
          <line x1={paddingLeft} y1={attentionBoundaryY} x2={width - paddingRight} y2={attentionBoundaryY} className="dre-evolution-marker-line strong" />
          {[
            { value: 10, label: "Saudável" },
            { value: 3, label: "Atenção" },
            { value: 0, label: "Origem" }
          ].map((marker) => (
            <g key={marker.label}>
              <line x1={paddingLeft} y1={getY(marker.value)} x2={width - paddingRight} y2={getY(marker.value)} className="dre-evolution-marker-line dre-evolution-legacy-marker" />
              <text x={width - paddingRight - 14} y={getY(marker.value) - 10} textAnchor="end" className="dre-evolution-marker-label">
                {marker.label} · {formatPercent(marker.value)}
              </text>
            </g>
          ))}
          {[0, 0.5, 1].map((position) => {
            const y = paddingTop + position * innerHeight;
            const value = globalMaxValue - position * range;
            return (
              <text key={position} x={paddingLeft - 14} y={y + 4} textAnchor="end" className="dre-line-axis-label dre-evolution-legacy-axis">
                {formatPercent(value)}
              </text>
            );
          })}
          {axisLabels.map((axis) => (
            <text key={`${axis.value}-${axis.label}`} x={paddingLeft - 14} y={axis.y + 5} textAnchor="end" className="dre-line-axis-label dre-evolution-boundary-axis">
              {axis.label}
            </text>
          ))}
          {periodKeys.map((periodKey, index) => (
            <text key={periodKey} x={getX(index)} y={height - 30} textAnchor="middle" className="dre-line-axis-label">
              {series[0]?.points[index]?.label ?? periodKey}
            </text>
          ))}
          {series.map((item) => (
            <g key={item.restaurantId}>
              <path d={buildPath(item.points)} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="dre-evolution-line" />
              {item.points.map((point, index) => {
                if (point.value === undefined) {
                  return null;
                }

                const pointValue = point.value;
                const pointX = getX(index);
                const pointY = getY(pointValue);

                return (
                  <g key={`${item.restaurantId}-${point.key}`}
                    onMouseEnter={() => setTooltip({ x: (pointX / width) * 100, y: (pointY / height) * 100, restaurantName: item.restaurantName, label: point.label, value: pointValue, color: item.color })}
                    onClick={() => setTooltip({ x: (pointX / width) * 100, y: (pointY / height) * 100, restaurantName: item.restaurantName, label: point.label, value: pointValue, color: item.color })}>
                    <circle cx={pointX} cy={pointY} r="14" fill="transparent" role="button" aria-label={`${item.restaurantName}, ${point.label}: ${formatPercent(pointValue)}`} />
                    <circle
                      cx={pointX}
                      cy={pointY}
                      r="5.5"
                      fill="#292c42"
                      stroke={item.color}
                      className="dre-evolution-point"
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.restaurantName}, ${point.label}: ${formatPercent(pointValue)}`}
                      onKeyDown={activateChartMark}
                      onMouseEnter={() =>
                        setTooltip({
                          x: (pointX / width) * 100,
                          y: (pointY / height) * 100,
                          restaurantName: item.restaurantName,
                          label: point.label,
                          value: pointValue,
                          color: item.color
                        })
                      }
                      onFocus={() =>
                        setTooltip({
                          x: (pointX / width) * 100,
                          y: (pointY / height) * 100,
                          restaurantName: item.restaurantName,
                          label: point.label,
                          value: pointValue,
                          color: item.color
                        })
                      }
                      onClick={() =>
                        setTooltip({
                          x: (pointX / width) * 100,
                          y: (pointY / height) * 100,
                          restaurantName: item.restaurantName,
                          label: point.label,
                          value: pointValue,
                          color: item.color
                        })
                      }
                      onTouchStart={() =>
                        setTooltip({
                          x: (pointX / width) * 100,
                          y: (pointY / height) * 100,
                          restaurantName: item.restaurantName,
                          label: point.label,
                          value: pointValue,
                          color: item.color
                        })
                      }
                    />
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {tooltip ? (
          <ChartDetails anchor={anchor}>
            <span>{tooltip.restaurantName}</span>
            <strong>{formatPercent(tooltip.value)}</strong>
            <small>{tooltip.label}</small>
          </ChartDetails>
        ) : null}
      </div>
      <div className="dre-chart-centered-legend">
        {series.map((item) => (
          <span key={item.restaurantId}>
            <i style={{ background: item.color }} />
            {item.restaurantName}
          </span>
        ))}
      </div>
    </section>
  );
}

function DreRevenueCompositionChart({ rows }: { rows: DreComparisonRow[] }) {
  const segments = [
    { key: "taxes", label: "Impostos", color: "#496f9f" },
    { key: "cmv", label: "CMV", color: "#2f6f5e" },
    { key: "cmo", label: "CMO", color: "#a55c7a" },
    { key: "materials", label: "Materiais", color: "#c9823a" },
    { key: "occupancy", label: "Taxa de locação", color: "#8b6f47" },
    { key: "operationalResult", label: "Resultado", color: "#5f7f4f" }
  ] as const;

  return (
    <section className="dre-chart-card dre-comparison-chart-card dre-composition-card">
      <div className="section-head">
        <div>
          <h3>Composição da receita</h3>
          <p>Mostra, em percentual, para onde vai a receita de cada restaurante.</p>
        </div>
      </div>
      <div className="dre-composition-list">
        {rows.map((row) => (
          <article key={row.restaurantId} className="dre-composition-row">
            <div className="dre-composition-head">
              <span>{row.restaurantName}</span>
              <strong>{formatCurrency(row.metrics.revenue)}</strong>
            </div>
            <div className="dre-composition-track">
              {segments.map((segment) => {
                const rawValue = row.metrics[segment.key];
                const percent = row.metrics.revenue > 0 ? (rawValue / row.metrics.revenue) * 100 : 0;
                const width = Math.max(0, Math.min(100, Math.abs(percent)));

                if (width <= 0) {
                  return null;
                }

                return (
                  <span
                    key={segment.key}
                    title={`${segment.label}: ${formatPercent(percent)}`}
                    style={
                      {
                        width: `${width}%`,
                        "--dre-color": segment.color
                      } as CSSProperties
                    }
                  />
                );
              })}
            </div>
          </article>
        ))}
      </div>
      <div className="dre-composition-legend">
        {segments.map((segment) => (
          <span key={segment.key}>
            <i style={{ background: segment.color }} />
            {segment.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function DreComparisonPanel({ rows, preferenceKey }: { rows: DreComparisonRow[]; preferenceKey: string }) {
  const [selectedMetricKey, setSelectedMetricKey] = useViewState(`${preferenceKey}.metric`, "revenue");
  const bestMargin = [...rows].sort((left, right) => {
    const leftMargin = left.metrics.revenue > 0 ? left.metrics.operationalResult / left.metrics.revenue : -Infinity;
    const rightMargin = right.metrics.revenue > 0 ? right.metrics.operationalResult / right.metrics.revenue : -Infinity;
    return rightMargin - leftMargin;
  })[0];
  const lowestCmv = [...rows]
    .filter((row) => row.metrics.revenue > 0)
    .sort((left, right) => left.metrics.cmv / left.metrics.revenue - right.metrics.cmv / right.metrics.revenue)[0];
  const highestRevenue = [...rows].sort((left, right) => right.metrics.revenue - left.metrics.revenue)[0];
  const highestCmo = [...rows]
    .filter((row) => row.metrics.revenue > 0)
    .sort((left, right) => right.metrics.cmo / right.metrics.revenue - left.metrics.cmo / left.metrics.revenue)[0];
  const metricOptions = [
    {
      key: "revenue",
      label: "Faturamento",
      description: "Receita operacional identificada em cada restaurante.",
      mode: "currency" as const,
      lowerIsBetter: false,
      getValue: (row: DreComparisonRow) => row.metrics.revenue
    },
    {
      key: "operationalResult",
      label: "Resultado operacional",
      description: "Resultado da atividade principal de cada unidade.",
      mode: "currency" as const,
      lowerIsBetter: false,
      getValue: (row: DreComparisonRow) => row.metrics.operationalResult
    },
    {
      key: "finalResult",
      label: "Resultado final",
      description: "Saldo final depois de todas as entradas e saídas consideradas na DRE.",
      mode: "currency" as const,
      lowerIsBetter: false,
      getValue: (row: DreComparisonRow) => row.metrics.finalResult
    },
    {
      key: "operationalMargin",
      label: "Margem operacional",
      description: "Resultado operacional dividido pela receita.",
      mode: "percent" as const,
      lowerIsBetter: false,
      getValue: (row: DreComparisonRow) => (row.metrics.revenue > 0 ? (row.metrics.operationalResult / row.metrics.revenue) * 100 : 0)
    },
    {
      key: "cmvRatio",
      label: "Insumos / CMV sobre receita",
      description: "Peso dos insumos e CMV sobre a receita operacional.",
      mode: "percent" as const,
      lowerIsBetter: true,
      getValue: (row: DreComparisonRow) => (row.metrics.revenue > 0 ? (row.metrics.cmv / row.metrics.revenue) * 100 : 0)
    },
    {
      key: "cmoRatio",
      label: "Pessoal / CMO sobre receita",
      description: "Peso de pessoal e mão de obra sobre a receita operacional.",
      mode: "percent" as const,
      lowerIsBetter: true,
      getValue: (row: DreComparisonRow) => (row.metrics.revenue > 0 ? (row.metrics.cmo / row.metrics.revenue) * 100 : 0)
    },
    {
      key: "taxesRatio",
      label: "Impostos sobre receita",
      description: "Peso dos impostos sobre a receita operacional.",
      mode: "percent" as const,
      lowerIsBetter: true,
      getValue: (row: DreComparisonRow) => (row.metrics.revenue > 0 ? (row.metrics.taxes / row.metrics.revenue) * 100 : 0)
    },
    {
      key: "materialsRatio",
      label: "Materiais sobre receita",
      description: "Peso dos materiais, embalagens e acessórios sobre a receita.",
      mode: "percent" as const,
      lowerIsBetter: true,
      getValue: (row: DreComparisonRow) => (row.metrics.revenue > 0 ? (row.metrics.materials / row.metrics.revenue) * 100 : 0)
    },
    {
      key: "occupancyRatio",
      label: "Locação sobre receita",
      description: "Peso de locação, ocupação e concessionárias sobre a receita.",
      mode: "percent" as const,
      lowerIsBetter: true,
      getValue: (row: DreComparisonRow) => (row.metrics.revenue > 0 ? (row.metrics.occupancy / row.metrics.revenue) * 100 : 0)
    }
  ];
  const selectedMetric = metricOptions.find((metric) => metric.key === selectedMetricKey) ?? metricOptions[0];
  const highlights = [
    {
      label: "Melhor margem",
      restaurant: bestMargin?.restaurantName ?? "-",
      value: bestMargin && bestMargin.metrics.revenue > 0 ? formatPercent((bestMargin.metrics.operationalResult / bestMargin.metrics.revenue) * 100) : "-"
    },
    {
      label: "Menor CMV",
      restaurant: lowestCmv?.restaurantName ?? "-",
      value: lowestCmv ? formatPercent((lowestCmv.metrics.cmv / lowestCmv.metrics.revenue) * 100) : "-"
    },
    {
      label: "Maior faturamento",
      restaurant: highestRevenue?.restaurantName ?? "-",
      value: highestRevenue ? formatCurrency(highestRevenue.metrics.revenue) : "-"
    },
    {
      label: "Maior pressão de CMO",
      restaurant: highestCmo?.restaurantName ?? "-",
      value: highestCmo ? formatPercent((highestCmo.metrics.cmo / highestCmo.metrics.revenue) * 100) : "-"
    }
  ];

  return (
    <section className="dre-comparison-panel">
      <div className="section-head">
        <div>
          <h3>Análise comparativa</h3>
          <p>Leitura simultânea dos principais indicadores da DRE dos restaurantes selecionados.</p>
        </div>
      </div>

      <div className="dre-comparison-highlight-grid">
        {highlights.map((highlight) => (
          <article key={highlight.label} className="dre-comparison-highlight-card">
            <span className="eyebrow">{highlight.label}</span>
            <strong>{highlight.restaurant}</strong>
            <p>{highlight.value}</p>
          </article>
        ))}
      </div>

      <div className="dre-comparison-chart-grid">
        <DreComparisonZeroBarChart
          title="Faturamento"
          description="Receita operacional identificada em cada restaurante."
          rows={rows}
          getValue={(row) => row.metrics.revenue}
        />
        <DreComparisonZeroBarChart
          title="Resultado operacional"
          description="Resultado da atividade principal de cada unidade."
          rows={rows}
          getValue={(row) => row.metrics.operationalResult}
        />
        <DreComparisonZeroBarChart
          title="Resultado final"
          description="Saldo final depois de todas as entradas e saídas consideradas na DRE."
          rows={rows}
          getValue={(row) => row.metrics.finalResult}
        />
        <DreComparisonZeroBarChart
          title="Margem operacional"
          description="Resultado operacional dividido pela receita."
          rows={rows}
          mode="percent"
          getValue={(row) => (row.metrics.revenue > 0 ? (row.metrics.operationalResult / row.metrics.revenue) * 100 : 0)}
        />
      </div>

      <section className="dre-comparison-metric-selector-card">
        <div className="section-head">
          <div>
            <h3>Indicador comparativo</h3>
            <p>Escolha o indicador para comparar os restaurantes no mesmo gráfico.</p>
          </div>
        </div>
        <div className="dre-comparison-metric-selector" role="group" aria-label="Indicador comparativo">
          {metricOptions.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={metric.key === selectedMetric.key ? "active" : ""}
              onClick={() => setSelectedMetricKey(metric.key)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </section>

      <DreComparisonZeroBarChart
        title={selectedMetric.label}
        description={selectedMetric.description}
        rows={rows}
        mode={selectedMetric.mode}
        lowerIsBetter={selectedMetric.lowerIsBetter}
        getValue={selectedMetric.getValue}
        metricOptions={metricOptions}
        selectedMetricKey={selectedMetric.key}
        onSelectMetric={setSelectedMetricKey}
      />

      <DreComparisonEvolutionChart rows={rows} />
      <DreComparisonGroupedPressureChart rows={rows} />
      <DreRevenueCompositionChart rows={rows} />
    </section>
  );
}

export function DreAnalysisPanel({
  data,
  periods,
  selectedPeriod,
  session,
  error,
  processing,
  canManageData,
  copy,
  onImport,
  onSelectPeriod,
  onRemovePeriod
}: DreAnalysisPanelProps) {
  const sortedPeriods = useMemo(() => [...periods].sort((left, right) => left.key.localeCompare(right.key)), [periods]);
  const selectedPeriodKeys = useMemo(
    () =>
      selectedPeriod
        .split(DRE_SELECTION_SEPARATOR)
        .map((item) => item.trim())
        .filter((key) => sortedPeriods.some((period) => period.key === key)),
    [selectedPeriod, sortedPeriods]
  );
  const fallbackPeriod = sortedPeriods[sortedPeriods.length - 1];
  const effectiveSelectedKeys = useMemo(
    () => (selectedPeriodKeys.length > 0 ? selectedPeriodKeys : fallbackPeriod ? [fallbackPeriod.key] : []),
    [fallbackPeriod, selectedPeriodKeys]
  );
  const selectedPeriods = useMemo(
    () => sortedPeriods.filter((period) => effectiveSelectedKeys.includes(period.key)),
    [effectiveSelectedKeys, sortedPeriods]
  );

  const comparisonRestaurants = useMemo<DreComparisonRestaurant[]>(
    () =>
      [...new Map((session.memberships ?? []).map((membership) => [membership.restaurantId, membership])).values()].map((membership) => ({
        restaurantId: membership.restaurantId,
        restaurantName: membership.restaurantName,
        photoUrl: membership.photoUrl
      })),
    [session.memberships]
  );
  const activeRestaurantId = session.activeRestaurantId ?? session.restaurantId;
  const preferenceKey = `grest.view.${session.userId}.${activeRestaurantId ?? "none"}.dre`;
  const [comparisonEnabled, setComparisonEnabled] = useViewState(`${preferenceKey}.comparison`, false);
  const [selectedComparisonRestaurantIds, setSelectedComparisonRestaurantIds] = useViewState<string[]>(`${preferenceKey}.restaurants`,
    activeRestaurantId ? [activeRestaurantId] : []);
  const [comparisonPeriodMap, setComparisonPeriodMap] = useState<Record<string, DrePeriodData[]>>({});
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const displayData = selectedPeriods.length > 1 ? buildConsolidatedDreData(selectedPeriods) : selectedPeriods[0]?.data ?? data;
  const trendPoints = useMemo(
    () => (selectedPeriods.length > 1 ? buildDreTrendPoints(selectedPeriods) : undefined),
    [selectedPeriods]
  );


  useEffect(() => {
    if (!activeRestaurantId) {
      return;
    }

    setSelectedComparisonRestaurantIds((current) => {
      const validIds = new Set(comparisonRestaurants.map((restaurant) => restaurant.restaurantId));
      const next = current.filter((restaurantId) => validIds.has(restaurantId));
      return next.length > 0 ? next : [activeRestaurantId];
    });
  }, [activeRestaurantId, comparisonRestaurants]);

  useEffect(() => {
    const missingIds = selectedComparisonRestaurantIds.filter(
      (restaurantId) => restaurantId !== activeRestaurantId && !comparisonPeriodMap[restaurantId]
    );

    if (!comparisonEnabled || missingIds.length === 0) {
      setComparisonLoading(false);
      return;
    }

    let mounted = true;
    setComparisonLoading(true);
    void Promise.all(
      missingIds.map(async (restaurantId) => {
        try {
          const loadedPeriods = await getWorkspaceDrePeriods(session, restaurantId);
          return [restaurantId, loadedPeriods] as const;
        } catch {
          return [restaurantId, []] as const;
        }
      })
    ).then((entries) => {
      if (!mounted) {
        return;
      }

      setComparisonPeriodMap((current) => ({
        ...current,
        ...Object.fromEntries(entries)
      }));
      setComparisonLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [activeRestaurantId, comparisonEnabled, comparisonPeriodMap, selectedComparisonRestaurantIds, session]);


  const toggleComparisonRestaurant = (restaurantId: string) => {
    setSelectedComparisonRestaurantIds((current) => {
      if (current.includes(restaurantId)) {
        const next = current.filter((item) => item !== restaurantId);
        return next.length > 0 ? next : [restaurantId];
      }

      return [...current, restaurantId];
    });
  };

  const comparisonRows = useMemo<DreComparisonRow[]>(() => {
    if (!comparisonEnabled || selectedComparisonRestaurantIds.length <= 1) {
      return [];
    }

    return selectedComparisonRestaurantIds.flatMap((restaurantId) => {
      const restaurant = comparisonRestaurants.find((item) => item.restaurantId === restaurantId);
      const restaurantPeriods = restaurantId === activeRestaurantId ? periods : comparisonPeriodMap[restaurantId] ?? [];
      const selectedRestaurantPeriods = getSelectedRestaurantPeriods(restaurantPeriods, effectiveSelectedKeys);
      const restaurantData =
        selectedRestaurantPeriods.length > 1
          ? buildConsolidatedDreData(selectedRestaurantPeriods)
          : selectedRestaurantPeriods[0]?.data;

      if (!restaurant || !restaurantData) {
        return [];
      }

      return [
        {
          restaurantId,
          restaurantName: restaurant.restaurantName,
          data: restaurantData,
          periods: selectedRestaurantPeriods,
          metrics: getDreComparisonMetrics(restaurantData)
        }
      ];
    });
  }, [
    activeRestaurantId,
    comparisonPeriodMap,
    comparisonRestaurants,
    comparisonEnabled,
    effectiveSelectedKeys,
    periods,
    selectedComparisonRestaurantIds
  ]);
  const comparisonMode = comparisonEnabled && selectedComparisonRestaurantIds.length > 1 && comparisonRows.length > 1;
  const comparisonRequested = comparisonEnabled && comparisonRestaurants.length > 1 && selectedComparisonRestaurantIds.length > 1;
  const comparisonPending = comparisonRequested && (comparisonLoading || selectedComparisonRestaurantIds.some((restaurantId) => restaurantId !== activeRestaurantId && !comparisonPeriodMap[restaurantId]));
  const missingRestaurants = comparisonRequested && !comparisonPending
    ? comparisonRestaurants.filter((restaurant) => selectedComparisonRestaurantIds.includes(restaurant.restaurantId) && !comparisonRows.some((row) => row.restaurantId === restaurant.restaurantId))
    : [];

  return (
    <section className="card dre-panel">
      <div className="section-head">
        <div>
          <h3>{displayData ? copy.dreParsedTitle : copy.dreEmptyTitle}</h3>
          {!displayData ? <p>{copy.dreEmptyText}</p> : null}
        </div>
      </div>

      {canManageData ? (
        <label className="upload-box dre-upload-box">
          <input
            className="upload-input-hidden"
            type="file"
            accept=".xlsx,.xls"
            disabled={processing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                onImport(file);
              }
            }}
          />
          <div>
            <span className="eyebrow">{copy.dreUploadTitle}</span>
            <strong>{processing ? copy.dreProcessing : copy.dreUploadAction}</strong>
            <small>{copy.dreUploadHint}</small>
          </div>
          <span className="upload-action">{copy.dreUploadAction}</span>
        </label>
      ) : null}

      {error ? <p className="message error">{error}</p> : null}
      {processing ? <DreProcessingSkeleton /> : null}
      {!displayData && !processing ? (
        <section className="card empty-state-card">
          <div className="empty-state-inner">
            <EmptyStateIcon />
            <h3>Este restaurante ainda não tem dados de DRE</h3>
            <p>Quando esta aba for alimentada para esta unidade, os indicadores, gráficos e diagnósticos financeiros aparecerão aqui.</p>
          </div>
        </section>
      ) : null}

      {displayData ? (
        <>
          {periods.length > 0 ? (
            <section className="dre-analysis-controls">
              <PeriodSelector
                periods={sortedPeriods.map((period) => ({ key: period.key, label: period.label, year: getDrePeriodYear(period) }))}
                selectedKeys={effectiveSelectedKeys}
                multiple
                onSelect={(keys) => onSelectPeriod(keys.join(DRE_SELECTION_SEPARATOR))}
                onRemove={canManageData ? onRemovePeriod : undefined}
              />

              <DreComparisonSelector
                restaurants={comparisonRestaurants}
                selectedIds={selectedComparisonRestaurantIds}
                activeRestaurantId={activeRestaurantId}
                loading={comparisonPending}
                enabled={comparisonEnabled}
                onModeChange={setComparisonEnabled}
                onToggle={toggleComparisonRestaurant}
              />
            </section>
          ) : null}

          {missingRestaurants.length > 0 ? <p className="message" role="status">Sem dados no período selecionado: {missingRestaurants.map((restaurant) => restaurant.restaurantName).join(", ")}.</p> : null}
          {comparisonPending ? <DreProcessingSkeleton /> : comparisonMode ? (
            <DreComparisonPanel rows={comparisonRows} preferenceKey={preferenceKey} />
          ) : comparisonRequested ? (
            <section className="empty-state-card" role="status">
              <div className="empty-state-inner">
                <EmptyStateIcon />
                <h3>Não há dados suficientes para comparar neste período</h3>
                <p>A comparação precisa de pelo menos dois restaurantes com dados nos meses selecionados.</p>
                <div className="empty-state-actions">
                  <button type="button" className="ghost-button" onClick={() => { if (fallbackPeriod) onSelectPeriod(fallbackPeriod.key); }}>Redefinir período</button>
                  <button type="button" className="ghost-button" onClick={() => setComparisonEnabled(false)}>Visualização única</button>
                </div>
              </div>
            </section>
          ) : (
            <>
              <DreValidationPanel data={displayData} />

              <div className="dre-visual-grid">
                <DreResultMap data={displayData} copy={copy} />
                <DreSectionChart data={displayData} copy={copy} />
              </div>

              <DreStrategicInsights data={displayData} copy={copy} />
              <DreRestaurantDiagnostics data={displayData} copy={copy} />
              <DreOperationalBreakdowns data={displayData} copy={copy} />
              <DreFinancialCharts data={displayData} copy={copy} trendPoints={trendPoints} />
              <DreParticipationGrid data={displayData} copy={copy} />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
