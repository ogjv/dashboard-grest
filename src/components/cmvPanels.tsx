import { useMemo, useState } from "react";
import type { ChangeEvent, CSSProperties, DragEvent } from "react";
import type { DashboardData, GroupSummary, ImportValidation, PeriodDashboard, ProductSummary, SalesTotalRow } from "../types";
import { formatCurrency, formatNumber, formatPercent } from "../utils/cmv";
import { getNavigationIcon } from "./appChrome";
import { useLocale } from "../i18n";

type UploadPanelState = {
  data?: DashboardData;
  validations?: ImportValidation[];
  error?: string;
  processing?: boolean;
};

export type DashboardPanelsProps = {
  state: UploadPanelState;
  dashboard?: DashboardData;
  periodDashboards: PeriodDashboard[];
  selectedPeriod: string;
  selectedView: string;
  totalView: string;
  hasDashboardData: boolean;
  canManageOperationalData: boolean;
  onUploadPair: (files: { salesFile: File; recipeFile: File }) => void;
  onSelectPeriod: (period: string) => void;
  onRemovePeriod?: (period: string) => void;
  onSelectView: (view: string) => void;
};

type PieDatum = {
  name: string;
  value: number;
  share: number;
  color: string;
};

const piePalette = ["#1f7a5a", "#e09f3e", "#d95d39", "#457b9d", "#8d6a9f", "#c36f6f", "#49796b", "#7b8cde"];
const TOTAL_VIEW = "__TOTAL__";
const TOTAL_PERIOD = "__ALL_PERIODS__";
type UploadState = UploadPanelState;

const getPeriodLabel = (dashboard: PeriodDashboard) => dashboard.label || dashboard.data.reportPeriod?.periodLabel || dashboard.data.reportPeriod?.displayLabel || "Período";

const normalizeDisplayProductKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const mergeProductsForDisplay = (products: ProductSummary[]) =>
  [...products
    .reduce((map, item) => {
      const normalizedCode = item.code.trim().toUpperCase();
      const normalizedName = normalizeDisplayProductKey(item.itemName);
      const key = `${normalizedCode || "__NO_CODE__"}::${normalizedName}`;
      const current = map.get(key);

      if (!current) {
        map.set(key, { ...item });
        return map;
      }

      const previousQuantity = current.quantity;
      const previousRevenue = current.revenue;
      const nextQuantity = current.quantity + item.quantity;
      const nextRevenue = current.revenue + item.revenue;

      current.quantity = nextQuantity;
      current.revenue = nextRevenue;
      current.cost += item.cost;
      current.grossProfit += item.grossProfit;
      current.unitCost =
        nextQuantity > 0
          ? Number((current.cost / nextQuantity).toFixed(2))
          : current.unitCost ?? item.unitCost;
      current.salePrice =
        current.salePrice !== undefined && item.salePrice !== undefined && nextQuantity > 0
          ? Number(
              (
                ((current.salePrice * previousQuantity) + (item.salePrice * item.quantity)) /
                nextQuantity
              ).toFixed(2)
            )
          : current.salePrice ?? item.salePrice;
      current.matchedRecipe = current.matchedRecipe || item.matchedRecipe;
      current.isPromotional = current.isPromotional || item.isPromotional;
      current.cmvPercent =
        nextRevenue > 0
          ? Number((((current.cmvPercent * previousRevenue) + (item.cmvPercent * item.revenue)) / nextRevenue).toFixed(2))
          : Number(Math.max(current.cmvPercent, item.cmvPercent).toFixed(2));

      return map;
    }, new Map<string, ProductSummary>())
    .values()];

const getMedian = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const getPercentile = (values: number[], percentile: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const weight = index - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
};

function IconSpark() {
  return (
    <svg viewBox="0 0 32 32" className="kpi-art" aria-hidden="true">
      <path
        d="M29 26C29 26.2652 28.8946 26.5196 28.7071 26.7071C28.5196 26.8946 28.2652 27 28 27H4C3.73478 27 3.48043 26.8946 3.29289 26.7071C3.10536 26.5196 3 26.2652 3 26V6C3 5.73478 3.10536 5.48043 3.29289 5.29289C3.48043 5.10536 3.73478 5 4 5C4.26522 5 4.51957 5.10536 4.70711 5.29289C4.89464 5.48043 5 5.73478 5 6V19.5863L11.2925 13.2925C11.3854 13.1995 11.4957 13.1258 11.6171 13.0754C11.7385 13.0251 11.8686 12.9992 12 12.9992C12.1314 12.9992 12.2615 13.0251 12.3829 13.0754C12.5043 13.1258 12.6146 13.1995 12.7075 13.2925L16 16.5863L22.5863 10H20C19.7348 10 19.4804 9.89464 19.2929 9.70711C19.1054 9.51957 19 9.26522 19 9C19 8.73478 19.1054 8.48043 19.2929 8.29289C19.4804 8.10536 19.7348 8 20 8H25C25.2652 8 25.5196 8.10536 25.7071 8.29289C25.8946 8.48043 26 8.73478 26 9V14C26 14.2652 25.8946 14.5196 25.7071 14.7071C25.5196 14.8946 25.2652 15 25 15C24.7348 15 24.4804 14.8946 24.2929 14.7071C24.1054 14.5196 24 14.2652 24 14V11.4137L16.7075 18.7075C16.6146 18.8005 16.5043 18.8742 16.3829 18.9246C16.2615 18.9749 16.1314 19.0008 16 19.0008C15.8686 19.0008 15.7385 18.9749 15.6171 18.9246C15.4957 18.8742 15.3854 18.8005 15.2925 18.7075L12 15.4137L5 22.4137V25H28C28.2652 25 28.5196 25.1054 28.7071 25.2929C28.8946 25.4804 29 25.7348 29 26Z"
        fill="#292929"
      />
    </svg>
  );
}

const getCMVTone = (value: number) => {
  if (value < 15) {
    return "good";
  }
  if (value <= 30) {
    return "mid";
  }
  return "bad";
};

const getProductCMVTone = (product: ProductSummary) => {
  if (!product.matchedRecipe) {
    return "pending";
  }
  if (product.isPromotional) {
    return "promo";
  }

  return getCMVTone(product.cmvPercent);
};

const getCMVToneLabel = (value: number) => {
  if (value < 15) {
    return "Saud\u00e1vel";
  }
  if (value <= 30) {
    return "Aten\u00e7\u00e3o";
  }
  return "Cr\u00edtico";
};

const getProductCMVLabel = (product: ProductSummary) => {
  if (!product.matchedRecipe) {
    return "Sem FT";
  }
  if (product.isPromotional) {
    return "Item promocional";
  }

  return getCMVToneLabel(product.cmvPercent);
};

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians)
  };
};

const buildArcPath = (cx: number, cy: number, outerRadius: number, innerRadius: number, startAngle: number, endAngle: number) => {
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

const asPieData = (rows: GroupSummary[], metric: "revenue" | "cost"): PieDatum[] => {
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  return rows
    .filter((row) => row[metric] > 0)
    .map((row, index) => ({
      name: row.name,
      value: row[metric],
      share: total > 0 ? row[metric] / total : 0,
      color: piePalette[index % piePalette.length]
    }));
};

function KPIGrid({ data }: { data: DashboardData }) {
  const { t } = useLocale();
  const cards = [
    {
      label: String(t("kpiRevenue")),
      value: formatCurrency(data.totalRevenue),
      hint: (t("soldItems") as (count: string) => string)(formatNumber(data.totalQuantity)),
      badge: "Receita",
      iconTone: "metric",
      badgeTone: "good",
      icon: <IconRevenueKpi />
    },
    {
      label: String(t("kpiCost")),
      value: formatCurrency(data.totalCost),
      hint: (t("costHint") as (value: string) => string)(formatPercent(data.averageCMV)),
      badge: "Base técnica",
      iconTone: "metric",
      badgeTone: "cool",
      icon: <IconCostKpi />
    },
    {
      label: String(t("kpiProfit")),
      value: formatCurrency(data.grossProfit),
      hint: (t("margin") as (value: string) => string)(formatPercent(data.totalRevenue > 0 ? (data.grossProfit / data.totalRevenue) * 100 : 0)),
      badge: "Resultado",
      iconTone: "metric",
      badgeTone: "warm",
      icon: <IconSpark />
    }
  ] as const;

  return (
    <section className="kpi-grid">
      {cards.map((card) => (
        <article key={card.label} className="card kpi-card clean">
          <div className="kpi-card-head">
            <div className={`icon-chip ${card.iconTone}`}>
              {card.icon}
            </div>
            <div className="kpi-card-heading">
              <span className="eyebrow">{card.label}</span>
            </div>
          </div>
          <strong>{card.value}</strong>
          <div className="kpi-card-foot">
            <span className={`kpi-card-badge ${card.badgeTone}`}>{card.badge}</span>
            <p>{card.hint}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function UploadPanel({
  state,
  onUploadPair,
  canManageData
}: {
  state: UploadState;
  onUploadPair: (files: { salesFile: File; recipeFile: File }) => void;
  canManageData: boolean;
}) {
  const { t } = useLocale();
  const [dragTarget, setDragTarget] = useState<"sales" | "recipes" | null>(null);
  const [pairedSalesFile, setPairedSalesFile] = useState<File | null>(null);
  const [pairedRecipeFile, setPairedRecipeFile] = useState<File | null>(null);
  const handleChange = (kind: "sales" | "recipes") => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (kind === "sales") {
      setPairedSalesFile(file);
    } else {
      setPairedRecipeFile(file);
    }
    event.target.value = "";
  };

  const handleDrop =
    (kind: "sales" | "recipes") =>
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragTarget(null);

      if (!canManageData) {
        return;
      }

      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) {
        return;
      }

      const file = files[0];
      if (!file) {
        return;
      }

      if (kind === "sales") {
        setPairedSalesFile(file);
      } else {
        setPairedRecipeFile(file);
      }
    };
  const canSubmitPair = Boolean(canManageData && pairedSalesFile && pairedRecipeFile && !state.processing);
  const handleSubmitPair = () => {
    if (!pairedSalesFile || !pairedRecipeFile) {
      return;
    }

    onUploadPair({ salesFile: pairedSalesFile, recipeFile: pairedRecipeFile });
    setPairedSalesFile(null);
    setPairedRecipeFile(null);
  };

  return (
    <section className="card upload-panel">
      <div className="section-head">
        <div>
          <h3>{String(t("uploadTitle"))}</h3>
          <p>Envie sempre o relatório de vendas e a ficha técnica do mesmo mês. O período será identificado pelo arquivo de vendas.</p>
        </div>
      </div>

      <div className="upload-grid guided">
        <label
          className={`upload-box featured simple ${canManageData ? "" : "locked"} ${dragTarget === "sales" ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (canManageData) {
              setDragTarget("sales");
            }
          }}
          onDragLeave={() => setDragTarget((current) => (current === "sales" ? null : current))}
          onDrop={handleDrop("sales")}
        >
          <span className="eyebrow">{String(t("salesUpload"))}</span>
          <strong className="upload-title">{pairedSalesFile?.name ?? String(t("uploadSalesShort"))}</strong>
          <small>Arquivo de vendas da competência.</small>
          <div className="upload-box-footer">
            <span className="upload-action">{String(t("uploadDropHint"))}</span>
            <span className="upload-meta">.csv .xlsx .xls</span>
          </div>
          <input className="upload-input-hidden" type="file" accept=".csv,.xlsx,.xls" onChange={handleChange("sales")} disabled={!canManageData} />
        </label>

        <label
          className={`upload-box featured secondary simple ${canManageData ? "" : "locked"} ${dragTarget === "recipes" ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (canManageData) {
              setDragTarget("recipes");
            }
          }}
          onDragLeave={() => setDragTarget((current) => (current === "recipes" ? null : current))}
          onDrop={handleDrop("recipes")}
        >
          <span className="eyebrow">{String(t("recipesUpload"))}</span>
          <strong className="upload-title">{pairedRecipeFile?.name ?? String(t("uploadRecipesShort"))}</strong>
          <small>{canManageData ? "Ficha técnica referente ao mesmo período das vendas." : String(t("authManageOnly"))}</small>
          <div className="upload-box-footer">
            <span className="upload-action">{String(t("uploadDropHint"))}</span>
            <span className="upload-meta">.csv .xlsx .xls</span>
          </div>
          <input className="upload-input-hidden" type="file" accept=".csv,.xlsx,.xls" onChange={handleChange("recipes")} disabled={!canManageData} />
        </label>
      </div>

      <div className="upload-pair-footer">
        <div className="upload-pair-footer-action">
          <button type="button" className="primary-button" onClick={handleSubmitPair} disabled={!canSubmitPair}>
            {state.processing ? String(t("processing")) : "Adicionar competência"}
          </button>
        </div>
        <div className="upload-pair-footer-copy">
          <strong>Upload por competência</strong>
          <span>Se você enviar novamente um par para o mesmo período, o mês será recalculado.</span>
          {!canManageData ? <small>{String(t("authManageOnly"))}</small> : null}
          {state.processing ? <small>{String(t("processing"))}</small> : null}
          {state.error ? <small className="error">{state.error}</small> : null}
          {!state.error && state.data ? <small className="success">{String(t("success"))}</small> : null}
        </div>
      </div>
    </section>
  );
}

function IconRevenueKpi() {
  return (
    <svg viewBox="0 0 32 32" className="kpi-art" aria-hidden="true">
      <path d="M16 3C13.4288 3 10.9154 3.76244 8.77759 5.1909C6.63975 6.61935 4.97351 8.64968 3.98957 11.0251C3.00563 13.4006 2.74819 16.0144 3.2498 18.5362C3.75141 21.0579 4.98953 23.3743 6.80762 25.1924C8.6257 27.0105 10.9421 28.2486 13.4638 28.7502C15.9856 29.2518 18.5995 28.9944 20.9749 28.0104C23.3503 27.0265 25.3807 25.3603 26.8091 23.2224C28.2376 21.0846 29 18.5712 29 16C28.9964 12.5533 27.6256 9.24882 25.1884 6.81163C22.7512 4.37445 19.4467 3.00364 16 3ZM16 27C13.8244 27 11.6977 26.3549 9.88873 25.1462C8.07979 23.9375 6.66989 22.2195 5.83733 20.2095C5.00477 18.1995 4.78693 15.9878 5.21137 13.854C5.63581 11.7202 6.68345 9.7602 8.22183 8.22183C9.76021 6.68345 11.7202 5.6358 13.854 5.21136C15.9878 4.78692 18.1995 5.00476 20.2095 5.83733C22.2195 6.66989 23.9375 8.07979 25.1462 9.88873C26.3549 11.6977 27 13.8244 27 16C26.9967 18.9164 25.8367 21.7123 23.7745 23.7745C21.7123 25.8367 18.9164 26.9967 16 27ZM21 18.5C21 19.4283 20.6313 20.3185 19.9749 20.9749C19.3185 21.6313 18.4283 22 17.5 22H17V23C17 23.2652 16.8946 23.5196 16.7071 23.7071C16.5196 23.8946 16.2652 24 16 24C15.7348 24 15.4804 23.8946 15.2929 23.7071C15.1054 23.5196 15 23.2652 15 23V22H13C12.7348 22 12.4804 21.8946 12.2929 21.7071C12.1054 21.5196 12 21.2652 12 21C12 20.7348 12.1054 20.4804 12.2929 20.2929C12.4804 20.1054 12.7348 20 13 20H17.5C17.8978 20 18.2794 19.842 18.5607 19.5607C18.842 19.2794 19 18.8978 19 18.5C19 18.1022 18.842 17.7206 18.5607 17.4393C18.2794 17.158 17.8978 17 17.5 17H14.5C13.5717 17 12.6815 16.6313 12.0251 15.9749C11.3688 15.3185 11 14.4283 11 13.5C11 12.5717 11.3688 11.6815 12.0251 11.0251C12.6815 10.3687 13.5717 10 14.5 10H15V9C15 8.73478 15.1054 8.48043 15.2929 8.29289C15.4804 8.10536 15.7348 8 16 8C16.2652 8 16.5196 8.10536 16.7071 8.29289C16.8946 8.48043 17 8.73478 17 9V10H19C19.2652 10 19.5196 10.1054 19.7071 10.2929C19.8946 10.4804 20 10.7348 20 11C20 11.2652 19.8946 11.5196 19.7071 11.7071C19.5196 11.8946 19.2652 12 19 12H14.5C14.1022 12 13.7206 12.158 13.4393 12.4393C13.158 12.7206 13 13.1022 13 13.5C13 13.8978 13.158 14.2794 13.4393 14.5607C13.7206 14.842 14.1022 15 14.5 15H17.5C18.4283 15 19.3185 15.3687 19.9749 16.0251C20.6313 16.6815 21 17.5717 21 18.5Z" fill="#292929" />
    </svg>
  );
}

function IconCostKpi() {
  return (
    <svg viewBox="0 0 32 32" className="kpi-art" aria-hidden="true">
      <path d="M17 15V22C17 22.2652 16.8947 22.5196 16.7071 22.7071C16.5196 22.8946 16.2653 23 16 23C15.7348 23 15.4805 22.8946 15.2929 22.7071C15.1054 22.5196 15 22.2652 15 22V15C15 14.7348 15.1054 14.4804 15.2929 14.2929C15.4805 14.1054 15.7348 14 16 14C16.2653 14 16.5196 14.1054 16.7071 14.2929C16.8947 14.4804 17 14.7348 17 15ZM29.9825 12.2637L28.25 25.265C28.1858 25.7455 27.9492 26.1863 27.5843 26.5054C27.2195 26.8246 26.7511 27.0003 26.2663 27H5.73379C5.24902 27.0003 4.78063 26.8246 4.41573 26.5054C4.05084 26.1863 3.81427 25.7455 3.75004 25.265L2.01629 12.265C1.97851 11.9824 2.0016 11.6949 2.08401 11.422C2.16642 11.149 2.30625 10.8968 2.49412 10.6823C2.68199 10.4678 2.91355 10.2959 3.17328 10.1783C3.43301 10.0606 3.7149 9.9998 4.00004 10H8.54629L15.25 2.34125C15.3439 2.23484 15.4593 2.14962 15.5886 2.09125C15.7179 2.03287 15.8582 2.00269 16 2.00269C16.1419 2.00269 16.2822 2.03287 16.4115 2.09125C16.5408 2.14962 16.6562 2.23484 16.75 2.34125L23.4538 10H28C28.2849 10.0002 28.5663 10.0612 28.8257 10.1789C29.085 10.2967 29.3162 10.4685 29.5038 10.6828C29.6913 10.8971 29.831 11.149 29.9133 11.4217C29.9957 11.6943 30.0189 11.9814 29.9813 12.2637H29.9825ZM11.2038 10H20.7963L16 4.51875L11.2038 10ZM28 12H4.00004L5.73379 25H26.2663L28 12ZM21.605 14.9L20.905 21.9C20.8912 22.0311 20.9034 22.1636 20.941 22.2899C20.9785 22.4162 21.0407 22.5339 21.1238 22.6361C21.207 22.7383 21.3096 22.8231 21.4256 22.8855C21.5417 22.948 21.6689 22.9869 21.8 23C21.8338 23.0018 21.8676 23.0018 21.9013 23C22.149 22.9997 22.3877 22.9075 22.5713 22.7412C22.7549 22.5749 22.8703 22.3464 22.895 22.1L23.595 15.1C23.6216 14.8361 23.5422 14.5725 23.3743 14.3671C23.2065 14.1618 22.9639 14.0315 22.7 14.005C22.4362 13.9785 22.1725 14.0579 21.9672 14.2257C21.7618 14.3936 21.6316 14.6361 21.605 14.9ZM10.395 14.9C10.3685 14.6361 10.2383 14.3936 10.0329 14.2257C9.82755 14.0579 9.56393 13.9785 9.30004 14.005C9.03615 14.0315 8.7936 14.1618 8.62576 14.3671C8.45791 14.5725 8.37852 14.8361 8.40504 15.1L9.10504 22.1C9.12991 22.3475 9.24616 22.5769 9.43107 22.7433C9.61597 22.9097 9.85627 23.0012 10.105 23C10.1388 23.0018 10.1726 23.0018 10.2063 23C10.337 22.9869 10.4638 22.9481 10.5795 22.886C10.6951 22.8239 10.7975 22.7395 10.8806 22.6379C10.9637 22.5362 11.026 22.4191 11.0638 22.2934C11.1017 22.1676 11.1144 22.0357 11.1013 21.905L10.395 14.9Z" fill="#292929" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true">
      <path d="M5 7.5h14" />
      <path d="M9 7.5V5.2h6v2.3" />
      <path d="M7.5 7.5 8.3 19h7.4l.8-11.5" />
      <path d="M10 10.5v5.5" />
      <path d="M14 10.5v5.5" />
    </svg>
  );
}

function ValidationPanel({ validations }: { validations: ImportValidation[] }) {
  const invalid = validations.filter((item) => item.missingColumns.length > 0);
  if (invalid.length === 0) {
    return null;
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>Validação de arquivos</h3>
          <p>Algumas colunas obrigatórias não foram encontradas. Corrija isso antes de confiar na leitura do dashboard.</p>
        </div>
      </div>

      <div className="issue-grid">
        {invalid.map((validation) => (
          <article key={`${validation.kind}-${validation.fileName}`} className="issue-card danger">
            <span className="eyebrow">{validation.kind === "sales" ? "Vendas" : "Fichas técnicas"}</span>
            <strong>{validation.fileName}</strong>
            <p>Colunas ausentes: {validation.missingColumns.join(", ")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function IssuesPanel({ data }: { data: DashboardData }) {
  if (data.issues.length === 0) {
    return null;
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>Inconsistências e alertas</h3>
          <p>Leitura rápida dos pontos que merecem revisão antes de concluir a análise.</p>
        </div>
      </div>

      <div className="issue-grid">
        {data.issues.map((issue) => (
          <article key={issue.id} className={`issue-card ${issue.tone}`}>
            <span className="eyebrow">Alerta</span>
            <strong>{issue.title}</strong>
            <p>{issue.description}</p>
            {typeof issue.count === "number" ? <p>{formatNumber(issue.count)} ocorrência(s)</p> : null}
            {issue.details?.length ? <p>Código(s): {issue.details.join(", ")}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function DonutChartCard({
  title,
  subtitle,
  data,
  activeName,
  onSelect,
  valueFormatter = formatCurrency,
  centerValue,
  centerLabel = "grupos",
  hideCenterLabel = false,
  centerEmphasis = "default"
}: {
  title: string;
  subtitle: string;
  data: PieDatum[];
  activeName?: string;
  onSelect: (name: string) => void;
  valueFormatter?: (value: number) => string;
  centerValue?: string;
  centerLabel?: string;
  hideCenterLabel?: boolean;
  centerEmphasis?: "default" | "large";
}) {
  const [clickedSlice, setClickedSlice] = useState<string>();
  const size = 248;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = 88;
  const innerRadius = 68;
  let cursor = 0;
  const activeSlice = data.find((slice) => slice.name === activeName);
  const resolvedCenterValue = centerValue ?? (activeSlice ? valueFormatter(activeSlice.value) : valueFormatter(data.reduce((sum, slice) => sum + slice.value, 0)));
  const resolvedCenterLabel = activeSlice ? activeSlice.name : centerLabel;
  const showCenterLabel = !hideCenterLabel && Boolean(resolvedCenterLabel);

  return (
    <section className="card chart-card">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="donut-layout">
        <svg viewBox={`0 0 ${size} ${size}`} className="donut-chart" role="img" aria-label={title}>
          {data.map((slice) => {
            const start = cursor * 360;
            const end = (cursor + slice.share) * 360;
            cursor += slice.share;
            const isActive = slice.name === activeName;
            const style = {
              "--slice-color": slice.color,
              "--slice-opacity": isActive ? "1" : "0.82"
            } as CSSProperties;

            return (
              <path
                key={slice.name}
                d={buildArcPath(cx, cy, outerRadius, innerRadius, start, end)}
                className={`donut-slice ${isActive ? "active" : ""} ${clickedSlice === slice.name ? "clicked" : ""}`}
                style={style}
                onClick={() => {
                  setClickedSlice(slice.name);
                  window.setTimeout(() => {
                    setClickedSlice((current) => (current === slice.name ? undefined : current));
                  }, 340);
                  onSelect(slice.name);
                }}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={innerRadius - 6} fill="var(--donut-hole)" />
          <foreignObject
            x={cx - innerRadius + 6}
            y={cy - innerRadius + 6}
            width={(innerRadius - 8) * 2}
            height={(innerRadius - 8) * 2}
          >
            <div className={`donut-center-box ${showCenterLabel ? "" : "value-only"} ${centerEmphasis === "large" ? "large" : ""} ${resolvedCenterValue.length > 17 ? "tight" : resolvedCenterValue.length > 13 ? "compact" : ""}`}>
              <div className="donut-center-value">{resolvedCenterValue}</div>
              {showCenterLabel ? <div className="donut-center-subtitle-html">{resolvedCenterLabel}</div> : null}
            </div>
          </foreignObject>
        </svg>

        <div className="donut-legend">
          {data.map((slice) => (
            <button
              key={slice.name}
              type="button"
              className={`legend-item ${slice.name === activeName ? "active" : ""}`}
              onClick={() => onSelect(slice.name)}
            >
              <span className="legend-swatch" style={{ backgroundColor: slice.color }} />
              <span className="legend-name">{slice.name}</span>
              <strong>{valueFormatter(slice.value)}</strong>
              <small>{formatPercent(slice.share * 100)}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function GroupFilterBar({
  groups,
  selectedView,
  onSelect
}: {
  groups: GroupSummary[];
  selectedView: string;
  onSelect: (value: string) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="card compact-card">
      <div className="section-head">
        <div>
          <h3>{String(t("groupFilter"))}</h3>
          <p>{String(t("groupFilterText"))}</p>
        </div>
      </div>

      <div className="filter-bar">
        <button type="button" className={`filter-pill ${selectedView === TOTAL_VIEW ? "active" : ""}`} onClick={() => onSelect(TOTAL_VIEW)}>
          {String(t("total"))}
        </button>
        {groups.map((group) => (
          <button
            type="button"
            key={group.name}
            className={`filter-pill ${selectedView === group.name ? "active" : ""}`}
            onClick={() => onSelect(group.name)}
          >
            {group.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function PeriodFilterBar({
  dashboards,
  selectedPeriod,
  onSelect,
  onRemovePeriod,
  canManagePeriods = false,
  compactOnly = false
}: {
  dashboards: PeriodDashboard[];
  selectedPeriod: string;
  onSelect: (value: string) => void;
  onRemovePeriod?: (value: string) => void;
  canManagePeriods?: boolean;
  compactOnly?: boolean;
}) {
  const { t } = useLocale();
  if (dashboards.length === 0) {
    return null;
  }

  return (
    <section className={compactOnly ? "period-selector-strip" : "card compact-card period-filter-card"}>
      {!compactOnly ? (
        <div className="section-head">
          <div>
            <h3>{String(t("periodAnalyzed"))}</h3>
            <p>{String(t("periodAnalyzedText"))}</p>
          </div>
        </div>
      ) : null}

      <div className="filter-bar">
        <button type="button" className={`filter-pill ${selectedPeriod === TOTAL_PERIOD ? "active" : ""}`} onClick={() => onSelect(TOTAL_PERIOD)}>
          {String(t("total"))}
        </button>
        {dashboards.map((dashboard) => (
          <span
            key={dashboard.key}
            className={`filter-pill filter-pill-group ${selectedPeriod === dashboard.key ? "active" : ""}`}
            title={
              dashboard.salesFileName || dashboard.recipeFileName
                ? `Vendas: ${dashboard.salesFileName ?? "-"} | Ficha técnica: ${dashboard.recipeFileName ?? "-"}`
                : getPeriodLabel(dashboard)
            }
          >
            <button type="button" className="filter-pill-main" onClick={() => onSelect(dashboard.key)}>
              {getPeriodLabel(dashboard)}
            </button>
            {canManagePeriods && onRemovePeriod ? (
              <button
                type="button"
                className="filter-pill-remove"
                onClick={() => onRemovePeriod(dashboard.key)}
                aria-label={`Remover ${getPeriodLabel(dashboard)}`}
                title={`Excluir ${getPeriodLabel(dashboard)}`}
              >
                <IconTrash />
              </button>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}

function TotalOverviewPanel({
  groups,
  activeName,
  onSelect
}: {
  groups: GroupSummary[];
  activeName?: string;
  onSelect: (name: string) => void;
}) {
  const { t } = useLocale();
  const totalRevenue = groups.reduce((sum, group) => sum + group.revenue, 0);
  const totalCost = groups.reduce((sum, group) => sum + group.cost, 0);
  const total = groups.reduce((sum, group) => sum + group.cmvPercent, 0);
  const cmvPieData = groups
    .filter((group) => group.cmvPercent > 0)
    .map((group, index) => ({
      name: group.name,
      value: group.cmvPercent,
      share: total > 0 ? group.cmvPercent / total : 0,
      color: piePalette[index % piePalette.length]
    }));

  return (
    <DonutChartCard
      title={String(t("totalOverviewTitle"))}
      subtitle={String(t("totalOverviewText"))}
      data={cmvPieData}
      activeName={activeName}
      onSelect={onSelect}
      valueFormatter={formatPercent}
      centerValue={formatPercent(totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0)}
      hideCenterLabel
      centerEmphasis="large"
    />
  );
}

function CMVStatusPanel({ products }: { products: ProductSummary[] }) {
  const { t } = useLocale();
  const validProducts = products.filter((item) => item.matchedRecipe && !item.isPromotional && item.revenue > 0);
  const buckets = [
    {
      label: String(t("below15")),
      tone: "good",
      items: validProducts.filter((item) => item.cmvPercent < 15)
    },
    {
      label: String(t("between15And30")),
      tone: "mid",
      items: validProducts.filter((item) => item.cmvPercent >= 15 && item.cmvPercent <= 30)
    },
    {
      label: String(t("above30")),
      tone: "bad",
      items: validProducts.filter((item) => item.cmvPercent > 30)
    }
  ];
  const total = validProducts.length || 1;

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>{String(t("cmvRangesTitle"))}</h3>
          <p>{String(t("cmvRangesText"))}</p>
        </div>
      </div>

      <div className="cmv-band">
        {buckets.map((bucket) => {
          const percentage = (bucket.items.length / total) * 100;
          return (
            <div key={bucket.label} className={`band-card ${bucket.tone}`}>
              <span className="eyebrow">{bucket.label}</span>
              <strong>{formatNumber(bucket.items.length)}</strong>
              <p>{(t("itemsWithFt") as (value: string) => string)(formatPercent(percentage))}</p>
            </div>
          );
        })}
      </div>

      <div className="cmv-bar-overview">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className={`cmv-bar-segment ${bucket.tone}`}
            style={{ width: `${(bucket.items.length / total) * 100}%` }}
          />
        ))}
      </div>
    </section>
  );
}

function CMVGroupBars({ groups, onSelect, activeName }: { groups: GroupSummary[]; onSelect: (name: string) => void; activeName?: string }) {
  const { t } = useLocale();
  const max = Math.max(...groups.map((item) => item.cmvPercent), 0);

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>{String(t("cmvByGroupTitle"))}</h3>
          <p>{String(t("cmvByGroupText"))}</p>
        </div>
      </div>

      <div className="ranking-list">
        {groups.map((group) => (
          <button
            type="button"
            key={group.name}
            className={`group-bar-button ${group.name === activeName ? "active" : ""}`}
            onClick={() => onSelect(group.name)}
          >
            <div className="ranking-labels">
              <span>{group.name}</span>
              <strong>{formatPercent(group.cmvPercent)}</strong>
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill cmv-${getCMVTone(group.cmvPercent)}`}
                style={{ width: `${max > 0 ? Math.max((group.cmvPercent / max) * 100, 10) : 0}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MissingRecipesPanel({ products, coveragePercent }: { products: ProductSummary[]; coveragePercent: number }) {
  const { t } = useLocale();
  const unmatchedProducts = mergeProductsForDisplay(products.filter((item) => !item.matchedRecipe));
  const unmatchedRevenue = unmatchedProducts.reduce((sum, item) => sum + item.revenue, 0);

  if (unmatchedProducts.length === 0) {
    return null;
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>{String(t("missingTitle"))}</h3>
          <p>{String(t("missingText"))}</p>
        </div>
      </div>

      <div className="totals-grid">
        <div className="totals-box compact warning-surface">
          <span className="eyebrow">{String(t("pendingItems"))}</span>
          <strong>{formatNumber(unmatchedProducts.length)}</strong>
          <p>{(t("missingRevenue") as (value: string) => string)(formatCurrency(unmatchedRevenue))}</p>
          <p>{(t("coverage") as (value: string) => string)(formatPercent(coveragePercent))}</p>
        </div>
      </div>

      <div className="table-wrap insight-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Item</th>
              <th>Grupo</th>
              <th>Subgrupo</th>
              <th>Receita</th>
            </tr>
          </thead>
          <tbody>
            {unmatchedProducts.map((product) => (
              <tr key={`missing-${product.code}-${product.itemName}`}>
                <td>{product.code}</td>
                <td>{product.itemName}</td>
                <td>{product.group}</td>
                <td>{product.subgroup}</td>
                <td>{formatCurrency(product.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PromotionalItemsPanel({ products }: { products: ProductSummary[] }) {
  const { t } = useLocale();
  const promotionalProducts = mergeProductsForDisplay(products.filter((item) => item.isPromotional));
  const promotionalCost = promotionalProducts.reduce((sum, item) => sum + item.cost, 0);

  if (promotionalProducts.length === 0) {
    return null;
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>{String(t("promoTitle"))}</h3>
          <p>{String(t("promoText"))}</p>
        </div>
      </div>

      <div className="totals-grid">
        <div className="totals-box compact promo-surface">
          <span className="eyebrow">{String(t("promoDetected"))}</span>
          <strong>{formatNumber(promotionalProducts.length)}</strong>
          <p>{(t("promoAssociatedCost") as (value: string) => string)(formatCurrency(promotionalCost))}</p>
        </div>
      </div>

      <div className="table-wrap insight-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Item</th>
              <th>Grupo</th>
              <th>Subgrupo</th>
              <th>Receita</th>
              <th>Custo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {promotionalProducts.map((product) => (
              <tr key={`promo-${product.code}-${product.itemName}`}>
                <td>{product.code}</td>
                <td>{product.itemName}</td>
                <td>{product.group}</td>
                <td>{product.subgroup}</td>
                <td>{formatCurrency(product.revenue)}</td>
                <td>{formatCurrency(product.cost)}</td>
                <td>
                  <span className="cmv-pill promo">{String(t("promotionalItem"))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupExplorer({
  groupName,
  products,
  onClear
}: {
  groupName?: string;
  products: ProductSummary[];
  onClear: () => void;
}) {
  const { t } = useLocale();
  const visibleProducts = groupName ? mergeProductsForDisplay(products.filter((item) => item.group === groupName)) : [];
  const subgroupMap = visibleProducts.reduce((map, item) => {
    const current = map.get(item.subgroup) ?? [];
    current.push(item);
    map.set(item.subgroup, current);
    return map;
  }, new Map<string, ProductSummary[]>());

  if (!groupName) {
    return (
      <section className="card explorer-empty">
        <h3>{String(t("groupDetailTitle"))}</h3>
        <p>{String(t("groupDetailText"))}</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>{groupName}</h3>
          <p>{String(t("groupItemsText"))}</p>
        </div>
        <button type="button" className="ghost-button" onClick={onClear}>
          {String(t("clearFocus"))}
        </button>
      </div>

      <div className="subgroup-stack">
        {[...subgroupMap.entries()]
          .sort(([, a], [, b]) => b.reduce((sum, item) => sum + item.revenue, 0) - a.reduce((sum, item) => sum + item.revenue, 0))
          .map(([subgroup, items]) => (
            <section key={subgroup} className="subgroup-card">
              <div className="subgroup-head">
                <div>
                  <span className="eyebrow">{subgroup}</span>
                  <strong>{formatCurrency(items.reduce((sum, item) => sum + item.revenue, 0))}</strong>
                </div>
                <small>{(t("itemsCount") as (count: string) => string)(formatNumber(items.length))}</small>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Codigo</th>
                      <th>Item</th>
                      <th>Qtd</th>
                      <th>Custo unit.</th>
                      <th>Preço</th>
                      <th>Receita</th>
                      <th>Custo</th>
                      <th>CMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .slice()
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((item) => (
                        <tr key={`${subgroup}-${item.code}-${item.itemName}`}>
                          <td>{item.code}</td>
                          <td>{item.itemName}</td>
                          <td>{formatNumber(item.quantity)}</td>
                          <td>{item.unitCost !== undefined ? formatCurrency(item.unitCost) : "—"}</td>
                          <td>{item.salePrice !== undefined ? formatCurrency(item.salePrice) : "—"}</td>
                          <td>{formatCurrency(item.revenue)}</td>
                          <td>{formatCurrency(item.cost)}</td>
                          <td>
                            <span className={`cmv-pill ${getProductCMVTone(item)}`}>
                              {item.isPromotional
                                ? String(t("promotionalItem"))
                                : item.matchedRecipe
                                  ? `${formatPercent(item.cmvPercent)} | ${getProductCMVLabel(item)}`
                                  : String(t("withoutFt"))}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
      </div>
    </section>
  );
}

function ProductHighlights({ products }: { products: ProductSummary[] }) {
  const { t } = useLocale();
  const validProducts = products.filter((item) => item.matchedRecipe && !item.isPromotional);
  const highlightedProducts = mergeProductsForDisplay(validProducts);

  const topRevenue = highlightedProducts.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const topSoldProducts = highlightedProducts
    .filter((item) => item.revenue > 0 && item.quantity > 0)
    .slice()
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 25);
  const highestCMV = topSoldProducts
    .slice()
    .sort((a, b) => b.cmvPercent - a.cmvPercent)
    .slice(0, 6);

  return (
    <section className="analytics-grid">
      <section className="card">
        <div className="section-head">
          <div>
            <h3>{String(t("topSalesTitle"))}</h3>
            <p>{String(t("topSalesText"))}</p>
          </div>
        </div>
        <div className="ranking-list">
          {topRevenue.map((item) => (
            <div key={`top-${item.code}`} className="ranking-row">
              <div className="ranking-labels">
                <span>{item.itemName}</span>
                <strong>{formatCurrency(item.revenue)}</strong>
              </div>
              <div className="meta-inline">
                <small>{item.group}</small>
                <small>{formatNumber(item.quantity)} un.</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>{String(t("topCmvTitle"))}</h3>
            <p>{String(t("topCmvText"))}</p>
          </div>
        </div>
        <div className="ranking-list">
          {highestCMV.map((item) => (
            <div key={`cmv-${item.code}`} className="ranking-row">
              <div className="ranking-labels">
                <span>{item.itemName}</span>
                <strong className={`text-${getCMVTone(item.cmvPercent)}`}>{formatPercent(item.cmvPercent)}</strong>
              </div>
              <div className="bar-track">
                <div className={`bar-fill cmv-${getCMVTone(item.cmvPercent)}`} style={{ width: `${Math.min(item.cmvPercent, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function StrategicProductMatrix({ products }: { products: ProductSummary[] }) {
  const { t } = useLocale();
  const validProducts = mergeProductsForDisplay(
    products.filter((item) => item.matchedRecipe && !item.isPromotional && item.revenue > 0 && item.quantity > 0)
  );

  if (validProducts.length === 0) {
    return null;
  }

  const enrichedProducts = validProducts.map((item) => ({
    ...item,
    marginPercent: item.revenue > 0 ? ((item.grossProfit / item.revenue) * 100) : 0
  }));
  const quantityCut = getMedian(enrichedProducts.map((item) => item.quantity));
  const highMarginCut = getPercentile(enrichedProducts.map((item) => item.marginPercent), 0.65);
  const lowMarginCut = getPercentile(enrichedProducts.map((item) => item.marginPercent), 0.35);
  const sortByOpportunity = (left: typeof enrichedProducts[number], right: typeof enrichedProducts[number]) =>
    (right.revenue * right.marginPercent) - (left.revenue * left.marginPercent);

  const cards = [
    {
      key: "high-potential",
      title: String(t("strategicHighPotentialTitle")),
      text: String(t("strategicHighPotentialText")),
      tone: "good",
      items: enrichedProducts
        .filter((item) => item.quantity < quantityCut && item.marginPercent >= highMarginCut)
        .sort(sortByOpportunity)
        .slice(0, 4)
    },
    {
      key: "low-return",
      title: String(t("strategicLowReturnTitle")),
      text: String(t("strategicLowReturnText")),
      tone: "bad",
      items: enrichedProducts
        .filter((item) => item.quantity >= quantityCut && item.marginPercent <= lowMarginCut)
        .sort((a, b) => (b.quantity * (100 - b.marginPercent)) - (a.quantity * (100 - a.marginPercent)))
        .slice(0, 4)
    },
    {
      key: "profit-engines",
      title: String(t("strategicProfitEnginesTitle")),
      text: String(t("strategicProfitEnginesText")),
      tone: "good",
      items: enrichedProducts
        .filter((item) => item.quantity >= quantityCut && item.marginPercent >= highMarginCut)
        .sort(sortByOpportunity)
        .slice(0, 4)
    },
    {
      key: "attention-points",
      title: String(t("strategicAttentionTitle")),
      text: String(t("strategicAttentionText")),
      tone: "mid",
      items: enrichedProducts
        .filter((item) => item.quantity < quantityCut && item.marginPercent <= lowMarginCut)
        .sort((a, b) => (b.revenue - b.grossProfit) - (a.revenue - a.grossProfit))
        .slice(0, 4)
    }
  ];

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h3>{String(t("strategicMatrixTitle"))}</h3>
          <p>{String(t("strategicMatrixText"))}</p>
        </div>
        <div className="strategic-thresholds">
          <small>{(t("strategicHighSalesCut") as (value: string) => string)(formatNumber(quantityCut))}</small>
          <small>{(t("strategicHighMarginCut") as (value: string) => string)(formatPercent(highMarginCut))}</small>
          <small>{(t("strategicLowMarginCut") as (value: string) => string)(formatPercent(lowMarginCut))}</small>
        </div>
      </div>

      <div className="issue-grid strategic-grid">
        {cards.map((card) => (
          <article key={card.key} className={`issue-card strategic-card ${card.tone}`}>
            <span className="eyebrow">{card.title}</span>
            <p>{card.text}</p>

            {card.items.length > 0 ? (
              <div className="ranking-list">
                {card.items.map((item) => (
                  <div key={`${card.key}-${item.code}`} className="ranking-row strategic-row">
                    <div className="ranking-labels">
                      <span>{item.itemName}</span>
                      <strong>{formatPercent(item.marginPercent)}</strong>
                    </div>
                    <div className="meta-inline strategic-meta">
                      <small>{formatNumber(item.quantity)} un.</small>
                      <small>{formatCurrency(item.revenue)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="message">{String(t("strategicEmpty"))}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function SalesTotalsPanel({ totals }: { totals: SalesTotalRow[] }) {
  const { t } = useLocale();
  const generalTotals = totals.filter((item) => item.level === "general");
  if (generalTotals.length === 0) {
    return null;
  }

  const totalRevenue = generalTotals.reduce((sum, item) => sum + item.revenue, 0);
  const totalQuantity = generalTotals.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className="card compact-footer">
      <div className="section-head">
        <div>
          <h3>{String(t("officialTotalTitle"))}</h3>
          <p>{String(t("officialTotalText"))}</p>
        </div>
      </div>

      <div className="totals-box compact">
        <span className="eyebrow">{generalTotals.length > 1 ? String(t("officialTotalConsolidated")) : String(t("officialTotal"))}</span>
        <strong>{formatCurrency(totalRevenue)}</strong>
        <p>{(t("closingUnits") as (value: string) => string)(formatNumber(totalQuantity))}</p>
      </div>
    </section>
  );
}

export function DashboardPanels({
  state,
  dashboard,
  periodDashboards,
  selectedPeriod,
  selectedView,
  totalView,
  hasDashboardData,
  canManageOperationalData,
  onUploadPair,
  onSelectPeriod,
  onRemovePeriod,
  onSelectView
}: DashboardPanelsProps) {
  const { t } = useLocale();
  const revenuePieData = useMemo(() => (dashboard ? asPieData(dashboard.groups, "revenue") : []), [dashboard]);
  const costPieData = useMemo(() => (dashboard ? asPieData(dashboard.groups, "cost") : []), [dashboard]);

  return (
    <>
      {canManageOperationalData ? (
        <UploadPanel
          state={state}
          onUploadPair={onUploadPair}
          canManageData={canManageOperationalData}
        />
      ) : null}
      {!hasDashboardData ? (
        <section className="card empty-state-card">
          <div className="empty-state-inner">
            <span className="empty-state-icon" aria-hidden="true">
              {getNavigationIcon("dashboard")}
            </span>
            <h3>Este restaurante ainda não tem dados no Dashboard</h3>
            <p>Quando esta aba for alimentada para esta unidade, os indicadores, gráficos e análises do Dashboard aparecerão aqui.</p>
          </div>
        </section>
      ) : dashboard ? (
        <>
          <ValidationPanel validations={state.validations ?? []} />
          <KPIGrid data={dashboard} />
          <IssuesPanel data={dashboard} />
          <PeriodFilterBar
            dashboards={periodDashboards}
            selectedPeriod={selectedPeriod}
            onSelect={onSelectPeriod}
            onRemovePeriod={onRemovePeriod}
            canManagePeriods={canManageOperationalData}
            compactOnly={!canManageOperationalData}
          />
          <GroupFilterBar groups={dashboard.groups} selectedView={selectedView} onSelect={onSelectView} />

          <section className="analytics-grid wide">
            <DonutChartCard
              title={String(t("chartSalesTitle"))}
              subtitle={String(t("chartSalesText"))}
              data={revenuePieData}
              activeName={selectedView === totalView ? undefined : selectedView}
              onSelect={onSelectView}
              hideCenterLabel
            />
            <DonutChartCard
              title={String(t("chartCostTitle"))}
              subtitle={String(t("chartCostText"))}
              data={costPieData}
              activeName={selectedView === totalView ? undefined : selectedView}
              onSelect={onSelectView}
              hideCenterLabel
            />
          </section>

          <section className="analytics-grid wide">
            <CMVStatusPanel products={dashboard.products} />
            <CMVGroupBars
              groups={dashboard.groups}
              activeName={selectedView === totalView ? undefined : selectedView}
              onSelect={onSelectView}
            />
          </section>

          {selectedView === totalView ? (
            <TotalOverviewPanel
              groups={dashboard.groups}
              activeName={selectedView === totalView ? undefined : selectedView}
              onSelect={onSelectView}
            />
          ) : (
            <GroupExplorer groupName={selectedView} products={dashboard.products} onClear={() => onSelectView(totalView)} />
          )}
          <ProductHighlights products={dashboard.products} />
          <StrategicProductMatrix products={dashboard.products} />
          <PromotionalItemsPanel products={dashboard.products} />
          <MissingRecipesPanel products={dashboard.products} coveragePercent={dashboard.coveragePercent} />
          <SalesTotalsPanel totals={dashboard.importedSalesTotals} />
        </>
      ) : null}
    </>
  );
}
