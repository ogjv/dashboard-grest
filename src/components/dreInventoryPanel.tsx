import { useEffect, useMemo, useState } from "react";
import type { DreImportData, DreInventoryConfig, DreInventoryGroup, DrePeriodData } from "../types";
import { defaultDreInventory, getInventoryReport, inventoryConfigGroups, inventoryGroupOptions, normalizeDreInventory, parseInventoryAmount } from "../utils/dreInventory";
import { formatCurrency, formatPercent } from "../utils/cmv";

const formatInput = (value?: number) => value === undefined ? "" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DreInventoryPanel({ period, periods, editable, onSave, onDirtyChange }: {
  period: DrePeriodData;
  periods: DrePeriodData[];
  editable: boolean;
  onSave?: (key: string, config: DreInventoryConfig) => Promise<boolean | void> | boolean | void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initial = useMemo(() => normalizeDreInventory(period.inventory) ?? defaultDreInventory(period, periods), [period, periods]);
  const [config, setConfig] = useState(initial);
  const [values, setValues] = useState<Record<string, { opening: string; closing: string }>>(() => Object.fromEntries(inventoryConfigGroups(initial).map(group => [group.id, { opening: formatInput(group.opening), closing: formatInput(group.closing) }])));
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const withValues = (id: string, group: DreInventoryGroup) => ({ ...group, opening: parseInventoryAmount(values[id]?.opening ?? ""), closing: parseInventoryAmount(values[id]?.closing ?? "") });
  const draft: DreInventoryConfig = { ...config, bar: withValues("bar", config.bar), kitchen: withValues("kitchen", config.kitchen), additionalGroups: (config.additionalGroups ?? []).map(group => ({ ...group, ...withValues(group.id, group) })) };
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const report = getInventoryReport(period, periods, draft);
  const options = inventoryGroupOptions(period);
  const selectedIds = new Set(inventoryConfigGroups(config).map(group => group.groupId));
  const availableOptions = options.filter(option => !selectedIds.has(option.id) && options.filter(other => other.id === option.id).length === 1);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = async () => {
    if (!editable || !onSave || busy) return;
    setError(undefined); setMessage(undefined);
    if (draft.enabled && report.issues.length > 0) { setError(report.issues.join(" ")); return; }
    setBusy(true);
    try {
      const saved = await onSave(period.key, draft);
      if (saved !== false) setMessage("Estoque salvo. A análise e os meses vinculados usam os novos valores.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o estoque."); }
    finally { setBusy(false); }
  };
  const change = (key: string, update: Partial<DreInventoryGroup>) => {
    setConfig(current => key === "bar" || key === "kitchen" ? { ...current, [key]: { ...current[key], ...update } } : { ...current, additionalGroups: (current.additionalGroups ?? []).map(group => group.id === key ? { ...group, ...update, label: update.groupId ? options.find(option => option.id === update.groupId)?.groupLabel ?? group.label : group.label } : group) });
    setMessage(undefined); setError(undefined);
  };
  const setAmount = (key: string, field: "opening" | "closing", value: string) => {
    setValues(current => ({ ...current, [key]: { ...current[key], [field]: value } }));
    setMessage(undefined); setError(undefined);
  };
  const addGroup = () => {
    const option = availableOptions[0];
    if (!editable || busy || !option) return;
    const id = `stock-${crypto.randomUUID()}`;
    setConfig(current => ({ ...current, additionalGroups: [...(current.additionalGroups ?? []), { id, label: option.groupLabel, groupId: option.id, openingMode: "manual" }] }));
    setValues(current => ({ ...current, [id]: { opening: "", closing: "" } }));
    setMessage(undefined); setError(undefined);
  };
  const removeGroup = (id: string) => {
    if (!editable || busy) return;
    setConfig(current => ({ ...current, additionalGroups: (current.additionalGroups ?? []).filter(group => group.id !== id) }));
    setValues(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    setMessage(undefined); setError(undefined);
  };
  return <section className="dre-stock-panel" aria-label="Variação de estoque">
    <div className="dre-stock-header"><div><h3>Estoque e CMV real</h3><p>{period.label} · Ajuste os grupos de insumos necessários. Grupos não selecionados permanecem na base do arquivo.</p></div>
      <label className="dre-stock-switch"><input type="checkbox" checked={config.enabled} disabled={!editable || busy} onChange={event => { setConfig(current => ({ ...current, enabled: event.target.checked })); setMessage(undefined); }} /><span>Considerar variação de estoque</span></label>
    </div>
    {config.enabled ? <>
      <p className="dre-stock-help">CMV real = compras + estoque inicial − estoque final. Informe os inventários a custo, com o mesmo critério de avaliação. O modo automático usa apenas o mês imediatamente anterior, nunca um mês mais antigo.</p>
      <div className="dre-stock-groups">{report.groups.map(group => {
        const automatic = group.openingMode === "previous";
        return <fieldset key={group.key} disabled={!editable || busy} className="dre-stock-group"><legend>{group.label}</legend>
          <label><span>Grupo de compras — {group.label}</span><select aria-label={`Grupo de compras de ${group.label}`} value={group.groupId ?? ""} onChange={event => change(group.key, { groupId: event.target.value || undefined })}><option value="">Selecione o grupo da DRE</option>{options.map((option, index) => <option key={`${option.id}-${index}`} value={option.id} disabled={option.id !== group.groupId && selectedIds.has(option.id) || options.filter(other => other.id === option.id).length > 1}>{option.label}</option>)}</select></label>
          <label><span>Origem do estoque inicial</span><select aria-label={`Origem do estoque inicial de ${group.label}`} value={group.openingMode} onChange={event => change(group.key, { openingMode: event.target.value as "manual" | "previous" })}><option value="manual">Informar manualmente</option><option value="previous">Usar estoque final do mês anterior</option></select></label>
          <div className="dre-stock-values"><label><span>Estoque inicial (R$)</span><input aria-label={`Estoque inicial de ${group.label}`} type="text" inputMode="decimal" autoComplete="off" readOnly={automatic} value={automatic ? formatInput(group.initial) : values[group.key]?.opening ?? ""} placeholder={automatic ? "Mês anterior pendente" : "0,00"} onChange={event => setAmount(group.key, "opening", event.target.value)} /></label>
          <label><span>Estoque final (R$)</span><input aria-label={`Estoque final de ${group.label}`} type="text" inputMode="decimal" autoComplete="off" value={values[group.key]?.closing ?? ""} placeholder="0,00" onChange={event => setAmount(group.key, "closing", event.target.value)} /></label></div>
          {automatic ? <small>{group.initial !== undefined ? `Vinculado ao fechamento de ${group.previousLabel}. Correções nesse mês atualizam este inicial.` : "Não há fechamento válido no mês anterior. Informe o inicial manualmente ou preencha o mês anterior."}</small> : null}
          <dl className="dre-stock-preview"><div><dt>{report.sourceStockAdjustment ? "Valor do arquivo (ajuste já incluso)" : "Compras do arquivo"}</dt><dd>{group.option ? formatCurrency(group.option.purchases) : "Grupo pendente"}</dd></div><div><dt>Variação de estoque</dt><dd>{group.variation !== undefined ? formatCurrency(group.variation) : "Pendente"}</dd></div><div><dt>CMV real previsto</dt><dd>{group.real !== undefined ? formatCurrency(group.real) : "Pendente"}</dd></div></dl>
          {editable && group.key !== "bar" && group.key !== "kitchen" ? <button type="button" className="secondary-button dre-stock-remove" aria-label={`Remover grupo ${group.label}`} onClick={() => removeGroup(group.key)}>Remover grupo</button> : null}
        </fieldset>;
      })}</div>
      {editable ? <div className="dre-stock-actions"><button type="button" className="secondary-button dre-stock-add" disabled={busy || availableOptions.length === 0} onClick={addGroup}>Adicionar grupo de estoque</button><span>{availableOptions.length > 0 ? "Inclua outro grupo de compras da DRE. As alterações são aplicadas somente ao salvar." : "Todos os grupos de compras disponíveis já estão selecionados."}</span></div> : null}
    </> : <p className="dre-stock-help">Sem ajuste de inventário. O CMV considera os valores do arquivo. Os estoques já informados não são apagados ao desativar.</p>}
    {!editable ? <p className="dre-stock-help">Seu acesso permite consultar os valores. A configuração é feita por quem possui permissão de gestão.</p> : <div className="dre-stock-actions"><button type="button" className="primary-button" disabled={!dirty || busy || !onSave} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar configuração de estoque"}</button>{dirty ? <span role="status">Prévia — alterações ainda não salvas</span> : null}</div>}
    {error ? <p className="message error" role="alert">{error}</p> : null}{message ? <p className="message success" role="status">{message}</p> : null}
  </section>;
}

export function DreClosingReconciliation({ data }: { data: DreImportData }) {
  const calculation = data.analysis;
  if (!calculation) return null;
  const rows = [
    ["Receita operacional bruta", calculation.grossRevenue], ["Deduções sobre vendas", -calculation.deductions], ["Receita líquida", calculation.netRevenue],
    [calculation.sourceStockAdjustment ? "Insumos do arquivo (ajuste já incluso)" : "Compras do arquivo", calculation.purchases], ["Ajuste de estoque aplicado", calculation.stockAdjustment], ["CMV considerado", calculation.cmv],
    ["Margem de contribuição", calculation.contribution], ["Despesas operacionais", calculation.operationalExpenses], ["Resultado operacional", calculation.operationalResult],
    ["Outras receitas informadas", calculation.otherRevenue], ["Despesas não operacionais", calculation.nonOperationalExpenses],
    ...(calculation.otherExpenses !== 0 ? [["Demais despesas informadas", calculation.otherExpenses] as const] : []),
    ["Total despesas (inclui deduções de vendas)", calculation.totalExpenses], ["Saldo gerencial calculado", calculation.finalBalance]
  ] as const;
  return <section className="dre-reconciliation" aria-label="Base de cálculo da DRE">
    <div className="dre-stock-header"><div><h3>Base da análise</h3><p>{calculation.closingStatus === "calculated" ? "Fechamento recalculado pelas seções da DRE. Deduções entram uma única vez." : "Fechamento completo não disponível. Os resultados informados no arquivo foram preservados, com ajuste de estoque quando aplicável."}</p></div><span className={`dre-basis-status ${calculation.inventoryStatus}`}>{calculation.inventoryStatus === "applied" ? "CMV com estoque ajustado" : calculation.inventoryStatus === "mixed" ? "Base mista entre os meses" : calculation.inventoryStatus === "pending" ? "Estoque pendente · sem ajuste adicional" : calculation.sourceStockAdjustment ? "CMV com estoque no arquivo" : "CMV sem ajuste de estoque"}</span></div>
    <dl className="dre-stock-overview"><div><dt>{calculation.sourceStockAdjustment ? "Insumos do arquivo" : "Compras do arquivo"}</dt><dd>{formatCurrency(calculation.purchases)}</dd></div><div><dt>Ajuste de estoque aplicado</dt><dd>{formatCurrency(calculation.stockAdjustment)}</dd></div><div><dt>CMV considerado</dt><dd>{formatCurrency(calculation.cmv)}</dd></div></dl>
    {calculation.inventoryStatus === "mixed" ? <p className="dre-stock-help">O consolidado reúne meses com bases de estoque diferentes. Cada mês usa somente seu próprio ajuste válido; configurações pendentes não são aplicadas.</p> : null}
    {calculation.inventoryIssues.length > 0 ? <div className="dre-stock-pending" role="status"><p>Há ajustes de estoque não aplicados. Nos períodos abaixo os insumos continuam na base do arquivo até resolver:</p><ul>{calculation.inventoryIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></div> : null}
    {calculation.closingIssues.length > 0 ? <ul className="dre-stock-help">{calculation.closingIssues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
    <details><summary>Conferir cálculo e valores originais</summary>
      <p className="dre-stock-help">Total despesas = despesas não operacionais + despesas operacionais + insumos (CMV considerado) + deduções de vendas{calculation.otherExpenses !== 0 ? " + demais despesas informadas" : ""}. Cada bloco entra uma única vez. Saldo final = receitas totais − total despesas.</p>
      <p className="dre-stock-help">Percentuais sobre receita operacional bruta. Saldo gerencial considera as demais movimentações da planilha, inclusive saídas não operacionais; não equivale automaticamente ao lucro contábil.</p>
      {calculation.closingStatus === "calculated" ? <dl className="dre-calculation-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatCurrency(value)}</dd></div>)}<div><dt>CMV / receita operacional bruta</dt><dd>{calculation.grossRevenue > 0 ? formatPercent(calculation.cmv / calculation.grossRevenue * 100) : "Sem base"}</dd></div></dl> : null}
      <div className="table-scroll"><table><thead><tr><th>Conferência</th><th>Original do Excel</th><th>Valor na análise</th></tr></thead><tbody>
        <tr><td>Total despesas</td><td>{calculation.originalExpenses !== undefined ? formatCurrency(calculation.originalExpenses) : "Não informado"}</td><td>{calculation.closingStatus === "calculated" ? formatCurrency(calculation.totalExpenses) : "Não conferido"}</td></tr>
        <tr><td>Resultado operacional</td><td>{calculation.originalOperationalResult !== undefined ? formatCurrency(calculation.originalOperationalResult) : "Não informado"}</td><td>{formatCurrency(calculation.operationalResult)}</td></tr>
        <tr><td>Saldo final</td><td>{calculation.originalFinalBalance !== undefined ? formatCurrency(calculation.originalFinalBalance) : "Não informado"}</td><td>{formatCurrency(calculation.finalBalance)}</td></tr>
      </tbody></table></div>
    </details>
  </section>;
}
