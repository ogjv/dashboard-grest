import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("participation legends and client section names stay inside their cards", async ({ page }) => {
  const samplePath = process.env.DRE_SAMPLE_PATH;
  if (samplePath) await page.route("**/dashboard/participation-sample.xls", route => route.fulfill({ body: readFileSync(samplePath) }));
  await page.route("**/dashboard/participation-preview", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dashboard/src/styles.css"></head>
    <body><main id="root" style="padding:12px;max-width:1600px;margin:auto"></main><script type="module">
      import React from '/dashboard/node_modules/.vite/deps/react.js';
      import ReactDOM from '/dashboard/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/dashboard/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { DreParticipationGrid } = await import('/dashboard/src/components/drePanels.tsx');
      const { translations } = await import('/dashboard/src/i18n.tsx');
      let data = {sheetName:'DRE',summary:[],sections:['RECEITAS OPERACIONAIS','DEDUCOES COM VENDAS','CMV','DESPESAS OPERACIONAIS','RECEITAS NAO OPERACIONAIS','DESPESAS NAO OPERACIONAIS','SEÇÃO COM MUITAS SUBDIVISÕES'].map((label,index)=>({label,groups:Array.from({length:[5,3,2,8,3,5,14][index]},(_,groupIndex)=>({label:['PRESTADORES DE SERVIÇOS COM NOMENCLATURA EXTENSA','TARIFAS DOS CARTÕES/VALES','REPASSE/ESTORNO (+)','CONCESSIONÁRIAS'][groupIndex%4]+' '+groupIndex,lines:[{label:'Item',value:1000+groupIndex*100,rowNumber:groupIndex}]}))}))};
      if (${Boolean(samplePath)}) {
        const { parseDreSpreadsheetFile } = await import('/dashboard/src/utils/file.ts');
        const blob = await (await fetch('/dashboard/participation-sample.xls')).blob();
        data = await parseDreSpreadsheetFile(new File([blob], 'dre.xls'));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DreParticipationGrid,{data,copy:translations.pt}));
    </script></body></html>`
  }));
  await page.goto("/dashboard/participation-preview");
  await expect(page.getByRole("heading", { name: "Participação por grupo" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator(".dre-donut-card").count()).toBeGreaterThanOrEqual(6);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const clipped = await page.locator(".dre-donut-copy, .dre-donut-legend-row, .dre-donut-legend-name").evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent));
      expect(clipped).toEqual([]);
      for (const card of await page.locator(".dre-donut-card").all()) {
        const bounds = await card.boundingBox();
        for (const child of await card.locator(".dre-donut-heading, .dre-donut-legend-row").all()) {
          const box = await child.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
          expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
          expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 1440 || width === 320) await page.screenshot({ path: `test-results/participation-${theme}-${width}.png`, fullPage: true });
    }
  }
  const item = page.locator(".dre-donut-legend-row").first();
  await item.click();
  await expect(page.locator(".chart-details-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".chart-details-popover")).toHaveCount(0);
});
