import { expect, test, type Page } from "@playwright/test";

async function openDre(page: Page, owner = true, comparison = false) {
  await page.addInitScript(({ owner, comparison }) => {
    const membership = { membershipId: "m-stock", accountId: "account", restaurantId: "stock-test", restaurantName: "Restaurante Inventário", role: owner ? "owner" : "viewer" };
    const second = { ...membership, membershipId: "m-other", restaurantId: "stock-other", restaurantName: "Restaurante Compras" };
    localStorage.setItem("grest.auth.session", JSON.stringify({ userId: "stock-user", email: "stock@example.com", userFullName: "Gestor", authMode: "local", globalRole: owner ? "owner" : "user", activeRole: membership.role, memberships: comparison ? [membership, second] : [membership], activeRestaurantId: membership.restaurantId, activeRestaurantName: membership.restaurantName }));
    if (localStorage.getItem("stock-test-seeded")) return;
    const line = (label: string, value: number) => ({ label, value, rowNumber: 1 });
    const section = (label: string, groups: Array<[string, number]>) => ({ label, groups: groups.map(([label, value]) => ({ label, lines: [line("Compras ou lançamentos", value)], total: line("TOTAL " + label, value) })), total: line("TOTAL " + label, groups.reduce((sum, [, value]) => sum + value, 0)) });
    const periods = [8, 9, 10].map(month => ({ key: "2026-" + String(month).padStart(2, "0"), label: ["Ago/2026", "Set/2026", "Out/2026"][month - 8], data: {
      sheetName: "DRE", period: { rawLabel: "Mês " + month, year: 2026, month },
      sections: [section("RECEITAS OPERACIONAIS", [["VENDAS", 1000]]), section("DEDUCOES COM VENDAS", [["IMPOSTOS", 100]]), section("CMV", [["BAR", 200], ["COZINHA", 300], ["ACESSORIOS", 50]]), section("DESPESAS OPERACIONAIS", [["CMO", 100]]), section("RECEITAS NAO OPERACIONAIS", [["OUTRAS", 50]]), section("DESPESAS NAO OPERACIONAIS", [["OUTRAS", 30]])],
      summary: [line("TOTAL RECEITAS OPERACIONAIS", 1000), line("TOTAL CMV", 550), line("RECEITA LIQUIDA", 900), line("RESULTADO OPERACIONAL", 250), line("TOTAL DESPESAS", 680), line("SALDO FINAL", 370)]
    } }));
    const workspace = { locale: "pt", state: { auditEntries: [] }, uploadFeedback: [], selectedPeriod: "__ALL_PERIODS__", selectedView: "__TOTAL__", selectedDrePeriod: "2026-09", drePeriods: periods };
    localStorage.setItem("grest.workspace.stock-other", JSON.stringify(workspace));
    if (comparison) Object.assign(periods[1], { inventory: { enabled: true, bar: { openingMode: "manual", opening: 100, closing: 150, groupId: JSON.stringify(["CMV", "BAR"]) }, kitchen: { openingMode: "manual", opening: 80, closing: 60, groupId: JSON.stringify(["CMV", "COZINHA"]) } } });
    localStorage.setItem("grest.workspace.stock-test", JSON.stringify(workspace));
    localStorage.setItem("stock-test-seeded", "true");
  }, { owner, comparison });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: "Análise de DRE", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estoque e CMV real", exact: true })).toBeVisible();
}

async function chooseMonth(page: Page, label: string) {
  await page.locator(".analysis-month-field summary").click();
  const target = page.locator(".analysis-month-row").getByRole("button", { name: label, exact: true });
  if (await target.getAttribute("aria-pressed") !== "true") await target.click();
  const selectedLabels = await page.locator('.analysis-month-row .analysis-month-option[aria-pressed="true"]').allTextContents();
  for (const text of selectedLabels) {
    const name = text.trim().replace(/^✓\s*/, "");
    if (name !== label) await page.locator(".analysis-month-row").getByRole("button", { name, exact: true }).click();
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".analysis-month-field summary")).toContainText(label);
}

async function saveStock(page: Page, linked = false) {
  await page.getByRole("button", { name: "Salvar configuração de estoque", exact: true }).click();
  if (linked) await page.getByRole("dialog").getByRole("button", { name: "Salvar e recalcular", exact: true }).click();
}

test("stock persists, carries forward and updates linked months without replacing Excel values", async ({ page }) => {
  await openDre(page);
  await page.getByText("Conferir cálculo e valores originais", { exact: true }).click();
  await expect(page.locator(".dre-reconciliation tbody tr").last()).toContainText("R$ 270,00");
  await page.getByRole("checkbox", { name: "Considerar variação de estoque" }).check();
  await page.getByLabel("Estoque inicial de Bar", { exact: true }).fill("100,00");
  await page.getByLabel("Estoque final de Bar", { exact: true }).fill("150,00");
  await page.getByLabel("Estoque inicial de Cozinha", { exact: true }).fill("80,00");
  await page.getByLabel("Estoque final de Cozinha", { exact: true }).fill("60,00");
  await saveStock(page, true);
  await expect(page.locator(".dre-basis-status")).toHaveText("CMV com estoque ajustado");
  await expect(page.locator(".dre-reconciliation tbody tr").last()).toContainText("R$ 300,00");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("grest.workspace.stock-test")!).drePeriods.find((item: { key: string }) => item.key === "2026-09").inventory.bar.closing)).toBe(150);
  await page.reload();
  await page.getByRole("button", { name: "Análise de DRE", exact: true }).click();
  await expect(page.getByLabel("Estoque final de Bar", { exact: true })).toHaveValue("150,00");
  await chooseMonth(page, "Out/2026");
  await expect(page.getByLabel("Estoque inicial de Bar", { exact: true })).toHaveValue("150,00");
  await expect(page.getByLabel("Estoque inicial de Bar", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Estoque inicial de Cozinha", { exact: true })).toHaveValue("60,00");
  await expect(page.locator(".dre-basis-status")).toContainText("Estoque pendente");
  await page.getByLabel("Estoque final de Bar", { exact: true }).fill("140,00");
  await page.getByLabel("Estoque final de Cozinha", { exact: true }).fill("65,00");
  await saveStock(page);
  await expect(page.locator(".dre-basis-status")).toHaveText("CMV com estoque ajustado");
  await chooseMonth(page, "Set/2026");
  await page.getByLabel("Estoque final de Bar", { exact: true }).fill("160,00");
  await saveStock(page, true);
  await chooseMonth(page, "Out/2026");
  await expect(page.getByLabel("Estoque inicial de Bar", { exact: true })).toHaveValue("160,00");
  if (await page.locator(".dre-reconciliation details").getAttribute("open") === null) await page.getByText("Conferir cálculo e valores originais", { exact: true }).click();
  await expect(page.locator(".dre-reconciliation tbody tr").last()).toContainText("R$ 255,00");
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("grest.workspace.stock-test")!));
  expect(persisted.drePeriods[1].data.summary.find((line: { label: string }) => line.label === "SALDO FINAL").value).toBe(370);
  expect(persisted.drePeriods[1].data.analysis).toBeUndefined();
  expect(persisted.state.auditEntries.some((entry: { action: string }) => entry.action === "update")).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await expect(page.getByLabel("Estoque final de Bar", { exact: true })).toHaveCSS("box-shadow", "none");
    }
    await page.locator(".dre-stock-panel").evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 150));
    await page.locator(".dre-stock-panel").screenshot({ path: `test-results/inventory-${theme}.png` });
  }
});

test("comparison and pressure charts use each restaurant's stock-adjusted CMV and recalculated closing", async ({ page }) => {
  await openDre(page, true, true);
  await page.getByRole("button", { name: "Comparativa", exact: true }).click();
  await page.locator(".restaurant-switcher-multiple summary").click();
  await page.getByRole("button", { name: "Restaurante Compras", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dre-comparison-bases")).toContainText("Estoque ajustado");
  await expect(page.locator(".dre-comparison-bases")).toContainText("Sem ajuste de estoque");
  await page.getByRole("combobox", { name: "Indicador comparativo" }).selectOption("cmvRatio");
  const chart = page.locator(".dre-future-chart-card").filter({ has: page.getByRole("combobox", { name: "Indicador comparativo" }) });
  await expect(chart.getByRole("button", { name: /Restaurante Inventário: 52,00%/ })).toBeAttached();
  await expect(chart.getByRole("button", { name: /Restaurante Compras: 55,00%/ })).toBeAttached();
  await expect(page.locator(".dre-grouped-ratio-chart").getByRole("button", { name: /Restaurante Inventário, Insumos \/ CMV: 52,00%/ })).toBeAttached();
  await page.getByRole("combobox", { name: "Indicador comparativo" }).selectOption("finalResult");
  await expect(chart.getByRole("button", { name: /Restaurante Inventário: R\$\s*300,00/ })).toBeAttached();
  await expect(chart.getByRole("button", { name: /Restaurante Compras: R\$\s*270,00/ })).toBeAttached();
});

test("unsaved inventory is guarded when changing periods, profile or sections", async ({ page }) => {
  await openDre(page);
  await page.getByRole("checkbox", { name: "Considerar variação de estoque" }).check();
  await page.getByRole("button", { name: "Salvar configuração de estoque", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("estoque inicial pendente");
  await page.locator(".workspace-context-user").click();
  await expect(page.getByRole("dialog")).toContainText("ainda não foi salva");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Considerar variação de estoque" })).toBeChecked();
  await page.locator(".analysis-month-field summary").click();
  await page.locator(".analysis-month-row").getByRole("button", { name: "Out/2026", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".analysis-month-field summary")).toContainText("Set/2026");
  await page.getByRole("checkbox", { name: "Considerar variação de estoque" }).uncheck();
  await page.locator(".workspace-context-user").click();
  await expect(page.locator(".account-panel")).toBeVisible();
});

test("stock is read-only for a viewer and the original closing remains available", async ({ page }) => {
  await openDre(page, false);
  await expect(page.getByRole("checkbox", { name: "Considerar variação de estoque" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Salvar configuração de estoque" })).toHaveCount(0);
  await page.getByText("Conferir cálculo e valores originais", { exact: true }).click();
  await expect(page.locator(".dre-reconciliation tbody tr").last()).toContainText("R$ 370,00");
  await expect(page.locator(".dre-reconciliation tbody tr").last()).toContainText("R$ 270,00");
  await expect(page.getByRole("button", { name: "Adicionar grupo de estoque" })).toHaveCount(0);
});

test("additional stock groups persist, carry forward, validate and can be removed", async ({ page }) => {
  await openDre(page);
  await page.getByRole("checkbox", { name: "Considerar variação de estoque" }).check();
  await page.getByLabel("Estoque inicial de Bar", { exact: true }).fill("100,00");
  await page.getByLabel("Estoque final de Bar", { exact: true }).fill("150,00");
  await page.getByLabel("Estoque inicial de Cozinha", { exact: true }).fill("80,00");
  await page.getByLabel("Estoque final de Cozinha", { exact: true }).fill("60,00");
  await page.getByRole("button", { name: "Adicionar grupo de estoque", exact: true }).click();
  await expect(page.locator(".dre-stock-group")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Adicionar grupo de estoque", exact: true })).toBeDisabled();
  const additional = page.getByRole("group", { name: "ACESSORIOS", exact: true });
  await expect(additional.getByRole("combobox").first().locator('option[value=\'["CMV","BAR"]\']')).toHaveAttribute("disabled", "");
  await saveStock(page);
  await expect(page.getByRole("alert")).toContainText("ACESSORIOS: estoque inicial pendente");
  await page.getByLabel("Estoque inicial de ACESSORIOS", { exact: true }).fill("20,00");
  await page.getByLabel("Estoque final de ACESSORIOS", { exact: true }).fill("30,00");
  await saveStock(page, true);
  await page.getByText("Conferir cálculo e valores originais", { exact: true }).click();
  await expect(page.locator(".dre-reconciliation tbody tr").last()).toContainText("R$ 310,00");
  await page.reload();
  await page.getByRole("button", { name: "Análise de DRE", exact: true }).click();
  await expect(page.getByLabel("Estoque final de ACESSORIOS", { exact: true })).toHaveValue("30,00");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.locator(".dre-stock-panel").screenshot({ path: `test-results/inventory-additional-${theme}.png` });
  }
  await chooseMonth(page, "Out/2026");
  await expect(page.getByLabel("Estoque inicial de ACESSORIOS", { exact: true })).toHaveValue("30,00");
  await expect(page.getByLabel("Estoque inicial de ACESSORIOS", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByLabel("Estoque final de Bar", { exact: true }).fill("150,00");
  await page.getByLabel("Estoque final de Cozinha", { exact: true }).fill("60,00");
  await page.getByLabel("Estoque final de ACESSORIOS", { exact: true }).fill("35,00");
  await saveStock(page);
  await page.getByRole("button", { name: "Remover grupo ACESSORIOS", exact: true }).click();
  await expect(page.locator(".dre-stock-group")).toHaveCount(2);
  await saveStock(page);
  await page.reload();
  await page.getByRole("button", { name: "Análise de DRE", exact: true }).click();
  await expect(page.locator(".dre-stock-group")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Adicionar grupo de estoque", exact: true })).toBeEnabled();
});

test("comparative DRE follows both themes and recognizes Imóvel as occupancy", async ({ page }) => {
  await openDre(page, true, true);
  await page.evaluate(() => {
    const key = "grest.workspace.stock-test";
    const workspace = JSON.parse(localStorage.getItem(key)!);
    for (const period of workspace.drePeriods) {
      const section = period.data.sections.find((item: { label: string }) => item.label === "DESPESAS OPERACIONAIS");
      section.groups.push({ label: "Imóvel", lines: [{ label: "Aluguel", value: 100, rowNumber: 2 }, { label: "IPTU", value: 20, rowNumber: 3 }], total: { label: "TOTAL IMOVEL", value: 120, rowNumber: 4 } });
      section.total.value += 120;
    }
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload();
  await page.getByRole("button", { name: "Análise de DRE", exact: true }).click();
  await page.getByRole("button", { name: "Comparativa", exact: true }).click();
  await page.locator(".restaurant-switcher-multiple summary").click();
  await page.getByRole("button", { name: "Restaurante Compras", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dre-grouped-ratio-chart").getByRole("button", { name: /Restaurante Inventário, Locação: 12,00%, R\$\s*120,00/ })).toBeAttached();
  await page.locator(".analysis-month-field summary").click();
  await page.locator(".analysis-month-row").getByRole("button", { name: "Ago/2026", exact: true }).click();
  await page.keyboard.press("Escape");
  for (const theme of ["light", "dark", "light"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const text = theme === "light" ? "rgb(32, 31, 35)" : "rgb(241, 243, 245)";
    const muted = theme === "light" ? "rgb(89, 98, 105)" : "rgb(157, 163, 173)";
    for (const selector of [".dre-future-chart-card", ".dre-line-reference-card", ".dre-grouped-reference-card"]) {
      const card = page.locator(`${selector}:visible`).first();
      await expect(card.locator("h3").first()).toHaveCSS("color", text);
      await expect(card.locator(".section-head p").first()).toHaveCSS("color", muted);
      await expect(card.locator(".dre-chart-centered-legend")).toHaveCSS("color", muted);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
    }
    await expect(page.locator(".dre-zero-restaurant-label-html").first()).toHaveCSS("color", muted);
    await expect(page.locator(".dre-line-measure-label").first()).toHaveCSS("fill", muted);
    await expect(page.locator(".dre-grouped-metric-label").first()).toHaveCSS("fill", muted);
    await expect(page.locator(".dre-benchmark-zone-legend strong").first()).toHaveCSS("color", text);
    await expect(page.locator(".dre-bar-vertical-value").first()).toHaveCSS("fill", "rgba(255, 255, 255, 0.96)");
    await page.locator(".dre-future-chart-card:visible").first().screenshot({ path: `test-results/dre-comparison-${theme}.png` });
  }
});
