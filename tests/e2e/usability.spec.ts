import { expect, test, type Page } from "@playwright/test";

test.use({ hasTouch: true });

async function openPreview(page: Page, emptyFilters = false) {
  await page.route("**/dashboard/usability-preview*", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dashboard/src/styles.css"></head>
    <body><main id="root" style="padding:16px;max-width:1100px"></main><script type="module">
      import React from '/dashboard/node_modules/.vite/deps/react.js';
      import ReactDOM from '/dashboard/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/dashboard/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { DreAnalysisPanel } = await import('/dashboard/src/components/drePanels.tsx');
      const { GoodsEntryPanels } = await import('/dashboard/src/components/goodsEntryPanels.tsx');
      const { translations } = await import('/dashboard/src/i18n.tsx');
      const periods = [1,2].map(month => ({key:'2026-0'+month,label:['Jan/2026','Fev/2026'][month-1],data:{sheetName:'DRE',sections:[],summary:[{label:'TOTAL RECEITAS OPERACIONAIS',value:1000*month,rowNumber:1},{label:'RESULTADO OPERACIONAL',value:100*month,rowNumber:2}],period:{rawLabel:'2026-0'+month,year:2026,month}}}));
      localStorage.setItem('grest.workspace.b',JSON.stringify({drePeriods:periods}));
      if(location.search) sessionStorage.setItem('fixture.goods',JSON.stringify({dateFrom:'2026-03-01',dateTo:'',selectedGroup:'__ALL__',selectedSubgroup:'__ALL__'}));
      const session = {userId:'fixture',email:'fixture@example.com',authMode:'local',activeRestaurantId:'a',memberships:[{membershipId:'a',restaurantId:'a',restaurantName:'Katzsu',role:'viewer'},{membershipId:'b',restaurantId:'b',restaurantName:'Nosso Ipanema',role:'viewer'}]};
      const entries = [1,2].map(month => ({rowNumber:month,group:'Bebidas',subgroup:'Cervejas',productName:'Cerveja',purchaseUnit:'UN',quantity:1,purchaseUnitPrice:100,totalValue:100,supplier:'Fornecedor',receiptNumber:String(month),invoiceDate:'2026-0'+month+'-01',stockUnit:'UN',unitPrice:100}));
      function Preview() {
        const [section,setSection] = React.useState('dre');
        const [period,setPeriod] = React.useState('2026-02');
        return React.createElement(React.Fragment,null,
          React.createElement('nav',null,...['DRE','Mercadorias','Outra aba'].map((label,index) => React.createElement('button',{key:label,onClick:()=>setSection(['dre','goods','other'][index])},label))),
          section === 'dre' ? React.createElement(DreAnalysisPanel,{periods,selectedPeriod:period,session,canManageData:false,copy:translations.pt,onImport:()=>{},onSelectPeriod:setPeriod}) :
          section === 'goods' ? React.createElement(GoodsEntryPanels,{data:{sheetName:'Compras',entries},preferenceKey:'fixture.goods',canManageData:false,onImport:()=>{},onClear:()=>{},onRemoveImportedPeriod:()=>{}}) : React.createElement('h2',null,'Outra aba'));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Preview));
    </script></body></html>`
  }));
  await page.goto(`/dashboard/usability-preview${emptyFilters ? "?empty=1" : ""}`);
  await expect(page.getByRole("button", { name: "Comparativa", exact: true })).toBeVisible();
}

async function enableComparison(page: Page) {
  await page.getByRole("button", { name: "Comparativa", exact: true }).click();
  await page.locator(".restaurant-switcher-multiple summary").click();
  await page.getByRole("button", { name: "Nosso Ipanema", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Indicador comparativo" })).toBeVisible();
}

test("retains comparison choices and shows the selected months explicitly", async ({ page }) => {
  await openPreview(page);
  await page.locator(".analysis-month-field summary").click();
  await page.getByRole("button", { name: "Todos de 2026" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".analysis-month-field summary")).toContainText("Jan/2026, Fev/2026");
  await enableComparison(page);
  await page.getByRole("combobox", { name: "Indicador comparativo" }).selectOption("operationalMargin");
  await page.getByRole("button", { name: "Outra aba", exact: true }).click();
  await page.getByRole("button", { name: "DRE", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Indicador comparativo" })).toHaveValue("operationalMargin");
  await expect(page.locator(".restaurant-switcher-multiple summary")).toContainText("Katzsu, Nosso Ipanema");
});

test("chart details open by touch or keyboard, stay in the viewport and dismiss outside", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await enableComparison(page);
  const chart = page.locator(".dre-future-chart-card").filter({ has: page.getByRole("combobox", { name: "Indicador comparativo" }) });
  await chart.locator(".dre-zero-bar").first().tap();
  const tooltip = page.locator(".chart-details-popover");
  await expect(tooltip).toBeVisible();
  const bounds = await tooltip.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await chart.locator(".dre-zero-scale-label").tap();
  await expect(tooltip).toHaveCount(0);
  const mark = chart.locator('.dre-zero-bar-chart [role="button"]').first();
  await mark.focus();
  await mark.press("Enter");
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
});

test("distinguishes empty filters and restores goods filters after navigation", async ({ page }) => {
  await openPreview(page, true);
  await page.getByRole("button", { name: "Mercadorias", exact: true }).click();
  await expect(page.getByText("Nenhum lançamento no recorte", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redefinir filtros", exact: true }).click();
  await expect(page.getByText("Total comprado", { exact: true })).toBeVisible();
  const groupButton = page.getByRole("button", { name: "Grupo: Todos os grupos", exact: true });
  await groupButton.focus();
  await groupButton.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Outra aba", exact: true }).click();
  await page.getByRole("button", { name: "Mercadorias", exact: true }).click();
  await expect(page.getByRole("button", { name: "Grupo: Bebidas", exact: true })).toBeVisible();
});
