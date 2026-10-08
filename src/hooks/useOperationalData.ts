import { useEffect, useMemo, useState } from "react";
import type {
  AuditLogEntry,
  DrePeriodData,
  GoodsEntryImportData,
  GoodsEntryRow,
  ImportValidation,
  PeriodDashboard,
  PersistedWorkspace,
  ProductSummary,
  RecipeRow,
  UploadFeedbackItem
} from "../types";
import { buildDashboardData, buildDashboardSlice, mapRecipeRows, mapSalesRows } from "../utils/cmv";
import { DRE_TOTAL_PERIOD, getDrePeriodKey, getDrePeriodLabel, getDreRevenueGroups, getDreRevenueValue } from "../components/drePanels";
import { confirmAction } from "../utils/confirmDialog";
import { parseDreSpreadsheetFile, parseGoodsEntrySpreadsheetFile, parseSalesSpreadsheetFile, parseSpreadsheetFile } from "../utils/file";

export type UploadState = PersistedWorkspace["state"];

const TOTAL_VIEW = "__TOTAL__";
const TOTAL_PERIOD = "__ALL_PERIODS__";
const DEFAULT_DRE_PERIOD = "__LATEST_DRE__";
const MAX_AUDIT_ENTRIES = 80;

const getPeriodLabel = (dashboard: PeriodDashboard) => dashboard.label || dashboard.data.reportPeriod?.periodLabel || dashboard.data.reportPeriod?.displayLabel || "Período";

const createAuditEntry = (input: Omit<AuditLogEntry, "id" | "createdAt">): AuditLogEntry => ({
  id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  createdAt: new Date().toISOString(),
  ...input
});

const appendAuditEntries = (current: UploadState, entries: AuditLogEntry[] = []) =>
  entries.length > 0
    ? {
        ...current,
        auditEntries: [...entries, ...(current.auditEntries ?? [])].slice(0, MAX_AUDIT_ENTRIES)
      }
    : current;

const askImportConfirmation = (title: string, message: string, tone: "default" | "danger" = "default") =>
  confirmAction({
    title,
    message,
    tone,
    confirmLabel: tone === "danger" ? "Excluir" : "Confirmar importação",
    cancelLabel: "Cancelar"
  });

const GENERIC_FILE_PROCESSING_ERROR = "Não foi possível processar o arquivo. Verifique o formato e tente novamente.";
const GENERIC_FILES_PROCESSING_ERROR = "Não foi possível processar os arquivos. Verifique o formato das planilhas e tente novamente.";

const dedupeFiles = (files: File[]) => {
  const map = new Map<string, File>();
  for (const file of files) {
    map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
  }
  return [...map.values()];
};

const productsToSalesRows = (products: ProductSummary[]) =>
  mapSalesRows(
    products.map((product) => ({
      codigo: product.code,
      produto: product.itemName,
      qte: product.quantity,
      total: product.revenue,
      grupo: product.group,
      subgrupo: product.subgroup
    }))
  );

const buildConsolidatedDashboard = (periods: PeriodDashboard[]) => {
  if (periods.length === 0) {
    return undefined;
  }

  const consolidatedProducts = periods.flatMap((periodDashboard) => periodDashboard.data.products);
  const consolidatedTotals = periods.flatMap((periodDashboard) => periodDashboard.data.importedSalesTotals);
  const consolidatedPeriodLabel =
    periods.length === 1
      ? periods[0].data.reportPeriod
      : {
          rawLabel: periods.map((periodDashboard) => getPeriodLabel(periodDashboard)).join(" • "),
          displayLabel: "Base consolidada",
          periodKey: TOTAL_PERIOD,
          periodLabel: "TOTAL"
        };

  return buildDashboardSlice(periods[0].data, consolidatedProducts, consolidatedTotals, consolidatedPeriodLabel);
};

const sortPeriodDashboards = (periods: PeriodDashboard[]) =>
  [...periods].sort((a, b) => {
    const yearA = a.data.reportPeriod?.year ?? 0;
    const yearB = b.data.reportPeriod?.year ?? 0;
    const monthA = a.data.reportPeriod?.month ?? 0;
    const monthB = b.data.reportPeriod?.month ?? 0;
    return yearA !== yearB ? yearA - yearB : monthA - monthB;
  });

const upsertPeriodDashboards = (currentPeriods: PeriodDashboard[], incomingPeriods: PeriodDashboard[]) =>
  sortPeriodDashboards(
    [...incomingPeriods
      .reduce((map, periodDashboard) => {
        map.set(periodDashboard.key, periodDashboard);
        return map;
      }, new Map<string, PeriodDashboard>(currentPeriods.map((period) => [period.key, period])))
    .values()]
  );

const normalizeLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const getGoodsEntryReferenceDate = (row: GoodsEntryRow) => row.invoiceDate ?? row.competencyDate ?? row.dueDate ?? "";

const normalizeGoodsEntryDedupText = (value: string) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");

const getGoodsEntryDedupKey = (row: GoodsEntryRow) =>
  (() => {
    const referenceDate = getGoodsEntryReferenceDate(row);
    const receiptNumber = normalizeGoodsEntryDedupText(row.receiptNumber);
    const totalValue = Number(row.totalValue || 0).toFixed(2);
    const quantity = Number(row.quantity || 0).toFixed(4);
    const purchaseUnitPrice = Number(row.purchaseUnitPrice || 0).toFixed(4);
    const unitPrice = Number(row.unitPrice || 0).toFixed(4);

    if (referenceDate && receiptNumber) {
      return [
        referenceDate,
        receiptNumber,
        totalValue,
        quantity,
        purchaseUnitPrice,
        unitPrice
      ].join("|");
    }

    return [
      "unsafe",
      normalizeGoodsEntryDedupText(row.sourceFileName ?? ""),
      row.rowNumber,
      referenceDate,
      receiptNumber,
      totalValue,
      normalizeGoodsEntryDedupText(row.productName),
      normalizeGoodsEntryDedupText(row.supplier)
    ].join("|");
  })();

const formatGoodsEntryDateLabel = (value: string) => {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
};

const toGoodsEntryIsoDate = (value?: string) => {
  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!match) {
    return undefined;
  }

  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
};

const getGoodsEntryPeriodStart = (period?: GoodsEntryImportData["reportPeriod"]) => toGoodsEntryIsoDate(period?.startDate);
const getGoodsEntryPeriodEnd = (period?: GoodsEntryImportData["reportPeriod"]) => toGoodsEntryIsoDate(period?.endDate);

const buildMergedGoodsEntryData = (
  currentData: GoodsEntryImportData | undefined,
  incomingFiles: Array<{ fileName: string; data: GoodsEntryImportData }>
): GoodsEntryImportData => {
  const entriesByKey = new Map<string, GoodsEntryRow>();

  for (const entry of currentData?.entries ?? []) {
    entriesByKey.set(getGoodsEntryDedupKey(entry), entry);
  }

  for (const incoming of incomingFiles) {
    for (const entry of incoming.data.entries) {
      const entryWithSource = {
        ...entry,
        sourceFileName: entry.sourceFileName ?? incoming.fileName,
        sourcePeriodLabel:
          entry.sourcePeriodLabel ??
          incoming.data.reportPeriod?.displayLabel ??
          incoming.data.reportPeriod?.periodLabel ??
          incoming.data.reportPeriod?.rawLabel
      };
      entriesByKey.set(getGoodsEntryDedupKey(entryWithSource), entryWithSource);
    }
  }

  const entries = [...entriesByKey.values()].sort((left, right) => {
    const dateComparison = getGoodsEntryReferenceDate(left).localeCompare(getGoodsEntryReferenceDate(right));
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.productName.localeCompare(right.productName);
  });
  const importedData = incomingFiles.map((item) => item.data);
  const dates = entries.map((entry) => getGoodsEntryReferenceDate(entry)).filter(Boolean).sort((left, right) => left.localeCompare(right));
  const importedPeriods = [
    ...(currentData?.importedPeriods ?? (currentData?.reportPeriod ? [currentData.reportPeriod] : [])),
    ...importedData.map((data) => data.reportPeriod).filter((period): period is NonNullable<GoodsEntryImportData["reportPeriod"]> => Boolean(period))
  ].reduce<NonNullable<GoodsEntryImportData["importedPeriods"]>>((items, period) => {
    const key = `${getGoodsEntryPeriodStart(period) ?? period.startDate ?? ""}|${getGoodsEntryPeriodEnd(period) ?? period.endDate ?? ""}|${period.displayLabel}`;
    if (!items.some((item) => `${getGoodsEntryPeriodStart(item) ?? item.startDate ?? ""}|${getGoodsEntryPeriodEnd(item) ?? item.endDate ?? ""}|${item.displayLabel}` === key)) {
      items.push(period);
    }
    return items;
  }, []);
  const periodStartDates = importedPeriods.map(getGoodsEntryPeriodStart).filter(Boolean) as string[];
  const periodEndDates = importedPeriods.map(getGoodsEntryPeriodEnd).filter(Boolean) as string[];
  const startDate =
    [...periodStartDates, dates[0]]
      .filter(Boolean)
      .sort((left, right) => String(left).localeCompare(String(right)))[0];
  const endDate =
    [...periodEndDates, dates[dates.length - 1]]
      .filter(Boolean)
      .sort((left, right) => String(right).localeCompare(String(left)))[0];
  const displayLabel = startDate && endDate
    ? `${formatGoodsEntryDateLabel(String(startDate))} a ${formatGoodsEntryDateLabel(String(endDate))}`
    : incomingFiles[incomingFiles.length - 1]?.data.reportPeriod?.displayLabel ?? currentData?.reportPeriod?.displayLabel ?? "Base acumulada";

  return {
    sheetName: incomingFiles.length === 1 && !currentData ? incomingFiles[0].data.sheetName : "Base acumulada",
    restaurantName: incomingFiles[incomingFiles.length - 1]?.data.restaurantName ?? currentData?.restaurantName,
    reportTitle: incomingFiles[incomingFiles.length - 1]?.data.reportTitle ?? currentData?.reportTitle,
    reportPeriod: {
      rawLabel: displayLabel,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      displayLabel,
      periodKey: startDate && endDate ? `${String(startDate).slice(0, 7)}_${String(endDate).slice(0, 7)}` : "goods-entry-accumulated",
      periodLabel: displayLabel,
      month: startDate ? Number(String(startDate).slice(5, 7)) : undefined,
      year: startDate ? Number(String(startDate).slice(0, 4)) : undefined
    },
    importedPeriods,
    headerRowIndex: incomingFiles[incomingFiles.length - 1]?.data.headerRowIndex ?? currentData?.headerRowIndex,
    entries
  };
};

const rebuildGoodsEntryDataFromEntries = (
  currentData: GoodsEntryImportData,
  entries: GoodsEntryRow[],
  importedPeriods = currentData.importedPeriods ?? []
): GoodsEntryImportData | undefined => {
  if (entries.length === 0) {
    return undefined;
  }

  const syntheticData = buildMergedGoodsEntryData(undefined, [
    {
      fileName: currentData.sheetName,
      data: {
        ...currentData,
        entries,
        importedPeriods,
        reportPeriod: undefined
      }
    }
  ]);

  return {
    ...syntheticData,
    importedPeriods
  };
};

export const buildImportErrorMessage = (fileName: string, detail: string, hint = "Revise o formato, as colunas e os dados da planilha e tente novamente.") => {
  const normalizedFileName = fileName?.trim() || "arquivo";
  return `Não foi possível importar "${normalizedFileName}". ${detail} ${hint}`;
};

const validateColumns = (
  kind: "sales" | "recipes",
  fileName: string,
  availableColumns: string[],
  expectedColumns: string[]
): ImportValidation => {
  const normalizedAvailable = availableColumns.map((header) => normalizeLabel(header));
  return {
    kind,
    fileName,
    availableColumns,
    missingColumns: expectedColumns.filter((column) => !normalizedAvailable.includes(normalizeLabel(column)))
  };
};

const getDuplicateCodes = (recipes: RecipeRow[]) => {
  const signaturesByCode = new Map<string, Set<string>>();
  const normalizeComparableCode = (value: string) =>
    String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/^(\d+)[.,]0+$/, "$1");

  for (const recipe of recipes) {
    const normalizedCode = normalizeComparableCode(recipe.code ?? "");
    if (!normalizedCode || !recipe.itemName.trim()) {
      continue;
    }

    const signature = JSON.stringify({
      place: (recipe.place ?? "").trim().toUpperCase(),
      cost: Number(recipe.cost.toFixed(4)),
      salePrice: recipe.salePrice ? Number(recipe.salePrice.toFixed(4)) : 0,
      cmvPercent: recipe.cmvPercent ? Number(recipe.cmvPercent.toFixed(4)) : 0,
      isPromotional: recipe.isPromotional,
      group: recipe.group.trim().toUpperCase(),
      subgroup: recipe.subgroup.trim().toUpperCase()
    });

    const current = signaturesByCode.get(normalizedCode) ?? new Set<string>();
    current.add(signature);
    signaturesByCode.set(normalizedCode, current);
  }

  return [...signaturesByCode.entries()]
    .filter(([, signatures]) => signatures.size > 1)
    .map(([code]) => code);
};

export function useOperationalData() {
  const [salesFiles, setSalesFiles] = useState<File[]>([]);
  const [, setRecipeFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>({});
  const [uploadFeedback, setUploadFeedback] = useState<UploadFeedbackItem[]>([]);
  const [drePeriods, setDrePeriods] = useState<DrePeriodData[]>([]);
  const [selectedDrePeriod, setSelectedDrePeriod] = useState<string>(DEFAULT_DRE_PERIOD);
  const [dreError, setDreError] = useState<string>();
  const [dreProcessing, setDreProcessing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(TOTAL_PERIOD);
  const [selectedView, setSelectedView] = useState<string>(TOTAL_VIEW);

  const periodDashboards = useMemo(() => state.periodDashboards ?? [], [state.periodDashboards]);
  const consolidatedPeriodDashboard = useMemo(
    () => (!state.data && periodDashboards.length > 0 ? buildConsolidatedDashboard(periodDashboards) : undefined),
    [periodDashboards, state.data]
  );
  const dashboard =
    selectedPeriod === TOTAL_PERIOD
      ? state.data ?? consolidatedPeriodDashboard
      : periodDashboards.find((periodDashboard) => periodDashboard.key === selectedPeriod)?.data;
  const activeDrePeriod =
    drePeriods.find((period) => period.key === selectedDrePeriod) ??
    drePeriods[drePeriods.length - 1];
  const dreData = activeDrePeriod?.data;
  const goodsEntryData = state.goodsEntryData;
  const goodsEntryError = state.goodsEntryError;
  const goodsEntryMessage = state.goodsEntryMessage;
  const goodsEntryProcessing = state.goodsEntryProcessing ?? false;
  const hasDashboardData = Boolean(dashboard);
  const hasSalesFile = salesFiles.length > 0 || (state.periodDashboards?.length ?? 0) > 0;
  const hasGoodsEntryData = Boolean(goodsEntryData?.entries.length);

  useEffect(() => {
    if (!state.recipeBase?.length) {
      return;
    }

    const nextDuplicateCodes = getDuplicateCodes(state.recipeBase);
    const currentDuplicateCodes = state.duplicateRecipeCodes ?? [];
    if (JSON.stringify(nextDuplicateCodes) === JSON.stringify(currentDuplicateCodes)) {
      return;
    }

    setState((current) => ({
      ...current,
      duplicateRecipeCodes: nextDuplicateCodes,
      data: current.data
        ? {
            ...current.data,
            duplicateRecipeCodes: nextDuplicateCodes,
            issues: current.data.issues.filter((issue) => issue.id !== "duplicate-recipe-codes")
          }
        : current.data,
      periodDashboards: current.periodDashboards?.map((period) => ({
        ...period,
        data: {
          ...period.data,
          duplicateRecipeCodes: nextDuplicateCodes,
          issues: period.data.issues.filter((issue) => issue.id !== "duplicate-recipe-codes")
        }
      }))
    }));
  }, [state.recipeBase, state.duplicateRecipeCodes]);

  useEffect(() => {
    if (selectedView !== TOTAL_VIEW && !dashboard?.groups.some((group) => group.name === selectedView)) {
      setSelectedView(TOTAL_VIEW);
    }
  }, [dashboard, selectedView]);

  useEffect(() => {
    if (selectedPeriod !== TOTAL_PERIOD && !periodDashboards.some((periodDashboard) => periodDashboard.key === selectedPeriod)) {
      setSelectedPeriod(TOTAL_PERIOD);
    }
  }, [periodDashboards, selectedPeriod]);

  const createPeriodDashboardsFromImports = (
    fileNames: string[],
    recipes: RecipeRow[],
    duplicateRecipeCodes: string[],
    salesImports: Awaited<ReturnType<typeof parseSalesSpreadsheetFile>>[]
  ) =>
    salesImports
      .map((salesImport, index) => {
        const sales = mapSalesRows(salesImport.items);
        if (sales.length === 0) {
          return null;
        }

        const fallbackKey = `arquivo-${index + 1}`;
        return {
          key: salesImport.reportPeriod?.periodKey ?? fallbackKey,
          label: salesImport.reportPeriod?.periodLabel ?? salesImport.reportPeriod?.displayLabel ?? fileNames[index] ?? fallbackKey,
          data: buildDashboardData(sales, recipes, salesImport.totals, salesImport.reportPeriod, duplicateRecipeCodes)
        };
      })
      .filter((dashboardItem): dashboardItem is PeriodDashboard => Boolean(dashboardItem));

  const applyPeriodDashboards = (
    nextPeriods: PeriodDashboard[],
    options?: {
      recipeBase?: RecipeRow[];
      duplicateRecipeCodes?: string[];
      recipeFileName?: string;
      validations?: ImportValidation[];
      error?: string;
      auditEntries?: AuditLogEntry[];
    }
  ) => {
    const nextData = buildConsolidatedDashboard(nextPeriods);

    setState((current) => ({
      ...appendAuditEntries(current, options?.auditEntries),
      data: nextData,
      periodDashboards: nextPeriods,
      salesFileNames: undefined,
      recipeFileName: undefined,
      recipeBase: options?.recipeBase ?? current.recipeBase,
      duplicateRecipeCodes: options?.duplicateRecipeCodes ?? current.duplicateRecipeCodes,
      validations: options?.validations ?? current.validations,
      error: options?.error,
      processing: false
    }));
    setSelectedPeriod(TOTAL_PERIOD);
    setSelectedView(TOTAL_VIEW);
  };

  const handleSalesUpload = async (files: File[]) => {
    const nextSalesFiles = dedupeFiles([...salesFiles, ...files]);
    setSalesFiles(nextSalesFiles);
    setState((current) => ({
      ...current,
      salesFileNames: nextSalesFiles.map((file) => file.name),
      error: undefined
    }));

    if (!state.recipeBase?.length) {
      return;
    }

    const recipes = state.recipeBase;
    const duplicateRecipeCodes = state.duplicateRecipeCodes ?? getDuplicateCodes(recipes);
    let validations = state.validations?.filter((item) => item.kind === "recipes") ?? [];

    try {
      setUploadFeedback(nextSalesFiles.map((file) => ({ id: `sales-${file.name}`, kind: "sales", fileName: file.name, status: "pending" })));
      setState((current) => ({ ...current, processing: true, error: undefined }));

      const salesImports = await Promise.all(nextSalesFiles.map((file) => parseSalesSpreadsheetFile(file)));
      validations = [
        ...validations,
        ...salesImports.map((salesImport, index) =>
          validateColumns("sales", nextSalesFiles[index]?.name ?? `vendas-${index + 1}`, salesImport.headerValues, ["CÓDIGO", "PRODUTO", "QTE", "TOTAL"])
        )
      ];

      const invalidValidation = validations.find((validation) => validation.missingColumns.length > 0);
      if (invalidValidation) {
        throw new Error(
          buildImportErrorMessage(
            invalidValidation.fileName,
            `Faltam colunas obrigatórias: ${invalidValidation.missingColumns.join(", ")}.`
          )
        );
      }

      const incomingPeriods = createPeriodDashboardsFromImports(nextSalesFiles.map((file) => file.name), recipes, duplicateRecipeCodes, salesImports);
      if (incomingPeriods.length === 0) {
        throw new Error(
          buildImportErrorMessage(
            nextSalesFiles[0]?.name ?? "vendas",
            "Não foram encontradas linhas válidas para processar este arquivo de vendas."
          )
        );
      }

      const mergedPeriods = upsertPeriodDashboards(periodDashboards, incomingPeriods);
      setUploadFeedback(nextSalesFiles.map((file) => ({ id: `sales-${file.name}`, kind: "sales", fileName: file.name, status: "success" })));
      applyPeriodDashboards(mergedPeriods, {
        recipeBase: recipes,
        duplicateRecipeCodes,
        validations
      });
      setSalesFiles([]);
    } catch (error) {
      setUploadFeedback(
        nextSalesFiles.map((file) => ({
          id: `sales-${file.name}`,
          kind: "sales",
          fileName: file.name,
          status: "error",
          detail: error instanceof Error ? error.message : GENERIC_FILE_PROCESSING_ERROR
        }))
      );
      setState((current) => ({
        ...current,
        validations,
        error: error instanceof Error ? error.message : GENERIC_FILES_PROCESSING_ERROR,
        processing: false
      }));
    }
  };

  const handleRecipeUpload = async (file: File) => {
    if (salesFiles.length === 0 && periodDashboards.length === 0) {
      setState((current) => ({
        ...current,
        error: "Envie primeiro o arquivo de vendas. Depois, selecione a ficha técnica correspondente."
      }));
      return;
    }

    setRecipeFile(file);
    let validations: ImportValidation[] = [];

    try {
      setUploadFeedback([
        ...(salesFiles.length > 0 ? salesFiles.map((salesFile) => ({ id: `sales-${salesFile.name}`, kind: "sales" as const, fileName: salesFile.name, status: "pending" as const })) : []),
        { id: `recipes-${file.name}`, kind: "recipes", fileName: file.name, status: "pending" }
      ]);
      setState((current) => ({
        ...current,
        recipeFileName: file.name,
        processing: true,
        error: undefined
      }));

      const recipesRaw = await parseSpreadsheetFile(file);
      const recipes = mapRecipeRows(recipesRaw);
      const recipeHeaders = recipesRaw[0] ? Object.keys(recipesRaw[0]) : [];
      validations = [
        validateColumns("recipes", file.name, recipeHeaders, ["CÓDIGO", "PRODUTO DO CARDÁPIO", "PREÇO", "CUSTO", "CMV"])
      ];

      const invalidRecipeValidation = validations.find((validation) => validation.missingColumns.length > 0);
      if (invalidRecipeValidation) {
        throw new Error(
          buildImportErrorMessage(
            invalidRecipeValidation.fileName,
            `Faltam colunas obrigatórias: ${invalidRecipeValidation.missingColumns.join(", ")}.`
          )
        );
      }

      if (recipes.length === 0) {
        throw new Error(
          buildImportErrorMessage(file.name, "Não foram encontradas linhas válidas para processar este arquivo de fichas técnicas.")
        );
      }

      const duplicateRecipeCodes = getDuplicateCodes(recipes);
      const rebuiltPeriods = periodDashboards.map((period) => ({
        key: period.key,
        label: period.label,
        data: buildDashboardData(
          productsToSalesRows(period.data.products),
          recipes,
          period.data.importedSalesTotals,
          period.data.reportPeriod,
          duplicateRecipeCodes
        )
      }));

      let incomingPeriods: PeriodDashboard[] = [];
      if (salesFiles.length > 0) {
        const salesImports = await Promise.all(salesFiles.map((salesFile) => parseSalesSpreadsheetFile(salesFile)));
        const salesValidations = salesImports.map((salesImport, index) =>
          validateColumns("sales", salesFiles[index]?.name ?? `vendas-${index + 1}`, salesImport.headerValues, ["CÓDIGO", "PRODUTO", "QTE", "TOTAL"])
        );
        validations = [...salesValidations, ...validations];

        const invalidSalesValidation = validations.find((validation) => validation.missingColumns.length > 0);
        if (invalidSalesValidation) {
          throw new Error(
            buildImportErrorMessage(
              invalidSalesValidation.fileName,
              `Faltam colunas obrigatórias: ${invalidSalesValidation.missingColumns.join(", ")}.`
            )
          );
        }

        incomingPeriods = createPeriodDashboardsFromImports(salesFiles.map((salesFile) => salesFile.name), recipes, duplicateRecipeCodes, salesImports);
      }

      const mergedPeriods = upsertPeriodDashboards(rebuiltPeriods, incomingPeriods);
      if (mergedPeriods.length === 0) {
        throw new Error(
          buildImportErrorMessage(file.name, "Não foi possível montar o dashboard com os dados carregados. Verifique se o arquivo de vendas está compatível com as fichas técnicas.")
        );
      }

      setUploadFeedback([
        ...(salesFiles.length > 0 ? salesFiles.map((salesFile) => ({ id: `sales-${salesFile.name}`, kind: "sales" as const, fileName: salesFile.name, status: "success" as const })) : []),
        { id: `recipes-${file.name}`, kind: "recipes", fileName: file.name, status: "success" }
      ]);

      applyPeriodDashboards(mergedPeriods, {
        recipeBase: recipes,
        duplicateRecipeCodes,
        recipeFileName: file.name,
        validations
      });
      setSalesFiles([]);
      setRecipeFile(null);
    } catch (error) {
      setUploadFeedback([
        ...(salesFiles.length > 0
          ? salesFiles.map((salesFile) => ({
              id: `sales-${salesFile.name}`,
              kind: "sales" as const,
              fileName: salesFile.name,
              status: "error" as const,
              detail: error instanceof Error ? error.message : GENERIC_FILE_PROCESSING_ERROR
            }))
          : []),
        {
          id: `recipes-${file.name}`,
          kind: "recipes",
          fileName: file.name,
          status: "error",
          detail: error instanceof Error ? error.message : GENERIC_FILE_PROCESSING_ERROR
        }
      ]);
      setState((current) => ({
        ...current,
        recipeFileName: file.name,
        validations,
        error: error instanceof Error ? error.message : GENERIC_FILES_PROCESSING_ERROR,
        processing: false
      }));
    }
  };

  const handleUpload = (kind: "sales" | "recipes", files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (kind === "sales") {
      void handleSalesUpload(files);
      return;
    }

    void handleRecipeUpload(files[0]);
  };

  const handlePairedUpload = async ({ salesFile, recipeFile, actorEmail }: { salesFile: File; recipeFile: File; actorEmail?: string }) => {
    let validations: ImportValidation[] = [];

    try {
      setUploadFeedback([
        { id: `sales-${salesFile.name}`, kind: "sales", fileName: salesFile.name, status: "pending" },
        { id: `recipes-${recipeFile.name}`, kind: "recipes", fileName: recipeFile.name, status: "pending" }
      ]);
      setState((current) => ({
        ...current,
        error: undefined,
        processing: true
      }));

      const [salesImport, recipesRaw] = await Promise.all([
        parseSalesSpreadsheetFile(salesFile),
        parseSpreadsheetFile(recipeFile)
      ]);
      const recipes = mapRecipeRows(recipesRaw);
      const recipeHeaders = recipesRaw[0] ? Object.keys(recipesRaw[0]) : [];
      validations = [
        validateColumns("sales", salesFile.name, salesImport.headerValues, ["CÓDIGO", "PRODUTO", "QTE", "TOTAL"]),
        validateColumns("recipes", recipeFile.name, recipeHeaders, ["CÓDIGO", "PRODUTO DO CARDÁPIO", "PREÇO", "CUSTO", "CMV"])
      ];

      const invalidValidation = validations.find((validation) => validation.missingColumns.length > 0);
      if (invalidValidation) {
        throw new Error(
          buildImportErrorMessage(
            invalidValidation.fileName,
            `Faltam colunas obrigatórias: ${invalidValidation.missingColumns.join(", ")}.`
          )
        );
      }

      const sales = mapSalesRows(salesImport.items);
      if (sales.length === 0) {
        throw new Error(
          buildImportErrorMessage(salesFile.name, "Não foram encontradas linhas válidas para processar este arquivo de vendas.")
        );
      }

      if (recipes.length === 0) {
        throw new Error(
          buildImportErrorMessage(recipeFile.name, "Não foram encontradas linhas válidas para processar este arquivo de fichas técnicas.")
        );
      }

      const duplicateRecipeCodes = getDuplicateCodes(recipes);
      const fallbackKey = `${salesFile.name}-${Date.now()}`;
      const periodKey = salesImport.reportPeriod?.periodKey ?? fallbackKey;
      const periodLabel = salesImport.reportPeriod?.periodLabel ?? salesImport.reportPeriod?.displayLabel ?? salesFile.name;
      const existingPeriod = periodDashboards.some((period) => period.key === periodKey);
      const dashboardConfirmation = [
        `Tipo: vendas + fichas técnicas`,
        `Período detectado: ${periodLabel}`,
        `Arquivo de vendas: ${salesFile.name}`,
        `Arquivo de fichas técnicas: ${recipeFile.name}`,
        `Itens de venda identificados: ${sales.length}`,
        `Receita identificada: ${sales.reduce((sum, item) => sum + item.revenue, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        existingPeriod ? "Atenção: já existe uma competência com este período. Ao confirmar, os dados anteriores serão substituídos por este novo par de arquivos." : undefined
      ].filter(Boolean).join("\n");

      if (!(await askImportConfirmation("Confirmar importação para o Dashboard?", dashboardConfirmation))) {
        setUploadFeedback([]);
        setState((current) => ({
          ...current,
          error: undefined,
          processing: false
        }));
        return;
      }

      const nextPeriod: PeriodDashboard = {
        key: periodKey,
        label: periodLabel,
        salesFileName: salesFile.name,
        recipeFileName: recipeFile.name,
        data: buildDashboardData(sales, recipes, salesImport.totals, salesImport.reportPeriod, duplicateRecipeCodes)
      };
      const nextPeriods = upsertPeriodDashboards(periodDashboards, [nextPeriod]);

      setUploadFeedback([
        { id: `sales-${salesFile.name}`, kind: "sales", fileName: salesFile.name, status: "success" },
        { id: `recipes-${recipeFile.name}`, kind: "recipes", fileName: recipeFile.name, status: "success" }
      ]);
      applyPeriodDashboards(nextPeriods, {
        recipeBase: undefined,
        duplicateRecipeCodes: undefined,
        validations,
        auditEntries: [
          createAuditEntry({
            module: "dashboard",
            action: "import",
            status: "success",
            title: "Importação de vendas e ficha técnica",
            actorEmail,
            periodLabel,
            fileNames: [salesFile.name, recipeFile.name],
            detail: `${sales.length} itens de venda identificados.`
          })
        ]
      });
      setSalesFiles([]);
      setRecipeFile(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : GENERIC_FILE_PROCESSING_ERROR;
      setUploadFeedback([
        { id: `sales-${salesFile.name}`, kind: "sales", fileName: salesFile.name, status: "error", detail },
        { id: `recipes-${recipeFile.name}`, kind: "recipes", fileName: recipeFile.name, status: "error", detail }
      ]);
      setState((current) => ({
        ...current,
        validations,
        error: detail,
        processing: false
      }));
    }
  };

  const handleDreImport = async (file: File, actorEmail?: string) => {
    try {
      setDreProcessing(true);
      setDreError(undefined);
      const nextDreData = await parseDreSpreadsheetFile(file);

      if (nextDreData.sections.length === 0 && nextDreData.summary.length === 0) {
        throw new Error(
          buildImportErrorMessage(file.name, "Não foi possível identificar seções de DRE neste arquivo.")
        );
      }

      if (getDreRevenueValue(nextDreData) > 0 && getDreRevenueGroups(nextDreData).length === 0) {
        throw new Error(
          buildImportErrorMessage(
            file.name,
            "A seção de Receitas Operacionais foi encontrada, mas nenhuma subdivisão de receita foi identificada. Verifique se os subgrupos estão na coluna B do arquivo."
          )
        );
      }

      const fallbackKey = `${file.name}-${Date.now()}`;
      const periodKey = getDrePeriodKey(nextDreData, fallbackKey);
      const periodLabel = getDrePeriodLabel(nextDreData, file.name);
      const existingPeriod = drePeriods.some((period) => period.key === periodKey);
      const dreRevenue = getDreRevenueValue(nextDreData);
      const dreConfirmation = [
        `Período detectado: ${periodLabel}`,
        nextDreData.restaurantName ? `Restaurante no arquivo: ${nextDreData.restaurantName}` : undefined,
        `Arquivo: ${file.name}`,
        `Seções identificadas: ${nextDreData.sections.length}`,
        `Receita operacional identificada: ${dreRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        existingPeriod ? "Atenção: já existe um DRE com este período. Ao confirmar, o DRE anterior será substituído." : undefined
      ].filter(Boolean).join("\n");

      if (!(await askImportConfirmation("Confirmar importação de DRE?", dreConfirmation))) {
        return;
      }

      setDrePeriods((current) => {
        const nextPeriod = {
          key: periodKey,
          label: periodLabel,
          fileName: file.name,
          data: nextDreData
        };
        const withoutCurrentPeriod = current.filter((period) => period.key !== periodKey);
        return [...withoutCurrentPeriod, nextPeriod].sort((left, right) => left.key.localeCompare(right.key));
      });
      setState((current) =>
        appendAuditEntries(current, [
          createAuditEntry({
            module: "dre",
            action: "import",
            status: "success",
            title: "Importação de DRE",
            actorEmail,
            periodLabel,
            fileNames: [file.name],
            detail: `${nextDreData.sections.length} seções e ${nextDreData.summary.length} totais identificados.`
          })
        ])
      );
      setSelectedDrePeriod(periodKey);
    } catch (error) {
      setDreError(error instanceof Error ? error.message : "Não foi possível processar o arquivo de DRE. Verifique o modelo e tente novamente.");
    } finally {
      setDreProcessing(false);
    }
  };

  const handleGoodsEntryImport = async (files: File | File[], actorEmail?: string) => {
    const incomingFiles = Array.isArray(files) ? files : [files];
    const firstFile = incomingFiles[0];
    if (!firstFile) {
      return;
    }

    try {
      setState((current) => ({
        ...current,
        goodsEntryFileName: incomingFiles.map((file) => file.name).join(", "),
        goodsEntryProcessing: true,
        goodsEntryError: undefined,
        goodsEntryMessage: undefined
      }));

      const parsedFiles = await Promise.all(
        incomingFiles.map(async (file) => ({
          fileName: file.name,
          data: await parseGoodsEntrySpreadsheetFile(file)
        }))
      );

      const invalidFile = parsedFiles.find((item) => item.data.entries.length === 0);
      if (invalidFile) {
        throw new Error(
          buildImportErrorMessage(invalidFile.fileName, "Não foram encontradas linhas válidas de entrada de mercadorias neste arquivo.")
        );
      }

      const importedEntriesCount = parsedFiles.reduce((sum, item) => sum + item.data.entries.length, 0);
      const importedTotalValue = parsedFiles.reduce(
        (sum, item) => sum + item.data.entries.reduce((entrySum, entry) => entrySum + entry.totalValue, 0),
        0
      );
      const importedPeriodLabels = [
        ...new Set(
          parsedFiles
            .map((item) => item.data.reportPeriod?.displayLabel ?? item.data.reportPeriod?.periodLabel ?? item.data.reportPeriod?.rawLabel)
            .filter(Boolean)
        )
      ];
      const goodsConfirmation = [
        `Arquivo(s): ${parsedFiles.map((item) => item.fileName).join(", ")}`,
        `Período(s) detectado(s): ${importedPeriodLabels.join(", ") || "Não identificado"}`,
        `Lançamentos identificados: ${importedEntriesCount}`,
        `Total identificado: ${importedTotalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        "Entradas duplicadas serão ignoradas automaticamente."
      ].join("\n");

      if (!(await askImportConfirmation("Confirmar importação de entradas de mercadorias?", goodsConfirmation))) {
        setState((current) => ({
          ...current,
          goodsEntryProcessing: false
        }));
        return;
      }

      setState((current) => {
        const previousEntriesCount = current.goodsEntryData?.entries.length ?? 0;
        const nextGoodsEntryData = buildMergedGoodsEntryData(current.goodsEntryData, parsedFiles);
        const nextEntriesCount = nextGoodsEntryData.entries.length;
        const addedEntriesCount = Math.max(0, nextEntriesCount - previousEntriesCount);

        return {
          ...appendAuditEntries(current, [
            createAuditEntry({
              module: "goods-entry",
              action: "import",
              status: "success",
              title: "Importação de entrada de mercadorias",
              actorEmail,
              periodLabel: importedPeriodLabels.join(", ") || undefined,
              fileNames: parsedFiles.map((item) => item.fileName),
              detail: `${addedEntriesCount} lançamentos novos adicionados à base.`
            })
          ]),
          goodsEntryData: nextGoodsEntryData,
          goodsEntryFileName: [current.goodsEntryFileName, ...parsedFiles.map((item) => item.fileName)].filter(Boolean).join(", "),
          goodsEntryError: undefined,
          goodsEntryMessage:
            addedEntriesCount > 0
              ? `${addedEntriesCount} lançamentos novos foram adicionados. Base total: ${nextEntriesCount} lançamentos.`
              : `Arquivo processado com ${importedEntriesCount} lançamentos. Nenhum item novo foi adicionado porque todos já constavam na base.`,
          goodsEntryProcessing: false
        };
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        goodsEntryError: error instanceof Error ? error.message : "Não foi possível processar a entrada de mercadorias. Verifique o arquivo e tente novamente.",
        goodsEntryMessage: undefined,
        goodsEntryProcessing: false
      }));
    }
  };

  const handleClearGoodsEntry = () => {
    setState((current) => {
      const nextState = { ...current };
      delete nextState.goodsEntryData;
      delete nextState.goodsEntryFileName;
      delete nextState.goodsEntryError;
      delete nextState.goodsEntryMessage;
      delete nextState.goodsEntryProcessing;
      return nextState;
    });
  };

  const handleRemoveGoodsEntryImportedPeriod = (periodLabel: string, actorEmail?: string) => {
    setState((current) => {
      if (!current.goodsEntryData) {
        return current;
      }

      const nextImportedPeriods = (current.goodsEntryData.importedPeriods ?? []).filter(
        (period) => (period.displayLabel || period.periodLabel || period.rawLabel) !== periodLabel
      );
      const nextEntries = current.goodsEntryData.entries.filter((entry) => entry.sourcePeriodLabel !== periodLabel);
      const nextGoodsEntryData = rebuildGoodsEntryDataFromEntries(current.goodsEntryData, nextEntries, nextImportedPeriods);

      if (!nextGoodsEntryData) {
        const nextState = appendAuditEntries(current, [
          createAuditEntry({
            module: "goods-entry",
            action: "remove",
            status: "success",
            title: "Exclusão de período de entradas",
            actorEmail,
            periodLabel,
            detail: "Período removido da base de entrada de mercadorias."
          })
        ]);
        delete nextState.goodsEntryData;
        delete nextState.goodsEntryFileName;
        delete nextState.goodsEntryError;
        nextState.goodsEntryMessage = `Período ${periodLabel} removido. A base de entrada de mercadorias ficou vazia.`;
        delete nextState.goodsEntryProcessing;
        return nextState;
      }

      return {
        ...appendAuditEntries(current, [
          createAuditEntry({
            module: "goods-entry",
            action: "remove",
            status: "success",
            title: "Exclusão de período de entradas",
            actorEmail,
            periodLabel,
            detail: "Período removido da base de entrada de mercadorias."
          })
        ]),
        goodsEntryData: nextGoodsEntryData,
        goodsEntryError: undefined,
        goodsEntryMessage: `Período ${periodLabel} removido da base. Base total: ${nextGoodsEntryData.entries.length} lançamentos.`,
        goodsEntryProcessing: false
      };
    });
  };

  const rebuildFromPeriods = (nextPeriods: PeriodDashboard[], auditEntries?: AuditLogEntry[]) => {
    if (nextPeriods.length === 0) {
      applyPeriodDashboards([], { error: undefined, auditEntries });
      return;
    }

    applyPeriodDashboards(nextPeriods, { error: undefined, auditEntries });
  };

  const handleRemovePeriod = async (periodKey: string, actorEmail?: string) => {
    const targetPeriod = periodDashboards.find((period) => period.key === periodKey);
    const targetLabel = targetPeriod ? getPeriodLabel(targetPeriod) : periodKey;
    const shouldRemove = await askImportConfirmation(
      `Excluir período ${targetLabel}?`,
      "Essa ação remove somente os dados dessa competência no Dashboard e não pode ser desfeita.",
      "danger"
    );
    if (!shouldRemove) {
      return;
    }

    rebuildFromPeriods(periodDashboards.filter((period) => period.key !== periodKey), [
      createAuditEntry({
        module: "dashboard",
        action: "remove",
        status: "success",
        title: "Exclusão de competência do Dashboard",
        actorEmail,
        periodLabel: targetLabel,
        fileNames: [targetPeriod?.salesFileName, targetPeriod?.recipeFileName].filter((name): name is string => Boolean(name)),
        detail: "Período removido da base de vendas e CMV."
      })
    ]);
  };

  const handleRemoveDrePeriod = async (periodKey: string, actorEmail?: string) => {
    const targetPeriod = drePeriods.find((period) => period.key === periodKey);
    const targetLabel = targetPeriod?.label ?? periodKey;
    const shouldRemove = await askImportConfirmation(
      `Excluir período ${targetLabel}?`,
      "Essa ação remove somente esse DRE da análise atual e não pode ser desfeita.",
      "danger"
    );
    if (!shouldRemove) {
      return;
    }

    setDrePeriods((current) => {
      const nextPeriods = current.filter((period) => period.key !== periodKey);
      const selectedDrePeriodKeys = selectedDrePeriod.split(",").map((key) => key.trim()).filter(Boolean);
      const nextSelectedKeys = selectedDrePeriodKeys.filter(
        (key) => key !== periodKey && nextPeriods.some((period) => period.key === key)
      );

      if (selectedDrePeriod === periodKey || selectedDrePeriodKeys.includes(periodKey)) {
        setSelectedDrePeriod(nextSelectedKeys.join(",") || (nextPeriods[nextPeriods.length - 1]?.key ?? DEFAULT_DRE_PERIOD));
      } else if (selectedDrePeriod === DRE_TOTAL_PERIOD && nextPeriods.length <= 1) {
        setSelectedDrePeriod(
          nextPeriods[nextPeriods.length - 1]?.key ?? DEFAULT_DRE_PERIOD
        );
      }

      return nextPeriods;
    });
    setState((current) =>
      appendAuditEntries(current, [
        createAuditEntry({
          module: "dre",
          action: "remove",
          status: "success",
          title: "Exclusão de período de DRE",
          actorEmail,
          periodLabel: targetLabel,
          fileNames: targetPeriod?.fileName ? [targetPeriod.fileName] : undefined,
          detail: "Período removido da análise de DRE."
        })
      ])
    );
  };

  const handleClearAll = () => {
    setSalesFiles([]);
    setRecipeFile(null);
    setUploadFeedback([]);
    setState((current) => ({
      goodsEntryData: current.goodsEntryData,
      goodsEntryFileName: current.goodsEntryFileName,
      goodsEntryError: current.goodsEntryError,
      goodsEntryMessage: current.goodsEntryMessage,
      goodsEntryProcessing: current.goodsEntryProcessing
    }));
    setSelectedPeriod(TOTAL_PERIOD);
    setSelectedView(TOTAL_VIEW);
  };

  const handleResetFlow = () => {
    setRecipeFile(null);
    setUploadFeedback([]);
    setSalesFiles([]);
    setState((current) => ({
      ...current,
      error: undefined,
      processing: false
    }));
  };

  return {
    salesFiles,
    setSalesFiles,
    setRecipeFile,
    state,
    setState,
    uploadFeedback,
    setUploadFeedback,
    drePeriods,
    setDrePeriods,
    selectedDrePeriod,
    setSelectedDrePeriod,
    dreError,
    setDreError,
    dreProcessing,
    setDreProcessing,
    selectedPeriod,
    setSelectedPeriod,
    selectedView,
    setSelectedView,
    periodDashboards,
    dashboard,
    dreData,
    goodsEntryData,
    goodsEntryError,
    goodsEntryMessage,
    goodsEntryProcessing,
    hasDashboardData,
    hasSalesFile,
    hasGoodsEntryData,
    handleUpload,
    handlePairedUpload,
    handleDreImport,
    handleGoodsEntryImport,
    handleClearGoodsEntry,
    handleRemoveGoodsEntryImportedPeriod,
    handleRemovePeriod,
    handleRemoveDrePeriod,
    handleClearAll,
    handleResetFlow
  };
}
