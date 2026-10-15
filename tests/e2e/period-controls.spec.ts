import { expect, test } from "@playwright/test";

test("period menus fit both themes and narrow screens", async ({ page }) => {
  await page.route("**/dashboard/period-preview", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dashboard/src/styles.css"></head>
    <body><main id="root" style="padding:16px;max-width:700px"></main><script type="module">
      import React from '/dashboard/node_modules/.vite/deps/react.js';
      import ReactDOM from '/dashboard/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/dashboard/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { PeriodSelector } = await import('/dashboard/src/components/periodSelector.tsx');
      const periods = [2024, 2025, 2026].flatMap(year => Array.from({length:12}, (_,index) => ({key: year+'-'+String(index+1).padStart(2,'0'), label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][index]+'/'+year, year})));
      function Preview() {
        const [keys,setKeys] = React.useState(['2026-01']);
        return React.createElement(PeriodSelector,{periods,selectedKeys:keys,multiple:true,onSelect:setKeys});
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Preview));
    </script></body></html>`
  }));
  await page.goto("/dashboard/period-preview");
  await expect(page.getByLabel("Ano da análise")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      const year = page.getByLabel("Ano da análise");
      await expect(year).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await year.focus();
      await expect(year).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(year).toHaveCSS("box-shadow", "none");
      await page.locator("summary").click();
      const menu = await page.locator(".analysis-month-menu").boundingBox();
      expect(menu!.x).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width + 1);
      await expect(page.getByRole("button", { name: "Fev/2026" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
  await page.getByLabel("Ano da análise").selectOption("2025");
  await page.locator("summary").click();
  await expect(page.getByRole("button", { name: "Jan/2025" })).toBeVisible();
  await page.getByRole("button", { name: "Jan/2025" }).click();
  await expect(page.locator("summary")).toContainText("2 meses selecionados");
  await page.screenshot({ path: "test-results/period-selector.png" });
});
