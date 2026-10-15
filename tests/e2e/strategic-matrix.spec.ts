import { expect, test } from "@playwright/test";

test("strategic categories have subtle colors and visible item separators in both themes", async ({ page }) => {
  await page.route("**/dashboard/strategy-preview", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dashboard/src/styles.css"></head>
    <body><main id="root" style="padding:16px;max-width:1440px;margin:auto"></main><script type="module">
      import React from '/dashboard/node_modules/.vite/deps/react.js';
      import ReactDOM from '/dashboard/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/dashboard/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { StrategicProductMatrix } = await import('/dashboard/src/components/cmvPanels.tsx');
      const products = Array.from({length:16},(_,index)=>{
        const quantity=(index%8<4?10:100)+(index%4);
        const margin=(index<8?80:30)+(index%4);
        const revenue=quantity*25;
        return {code:String(index),itemName:'Produto '+index+' com nome longo para conferir a quebra de linha',group:'Cardápio',subgroup:'Principal',quantity,revenue,cost:revenue*(1-margin/100),grossProfit:revenue*margin/100,cmvPercent:100-margin,matchedRecipe:true,isPromotional:false};
      });
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(StrategicProductMatrix,{products}));
    </script></body></html>`
  }));
  await page.goto("/dashboard/strategy-preview");
  await expect(page.locator(".strategic-card")).toHaveCount(4);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const cards = await page.locator(".strategic-card").evaluateAll(elements => elements.map(element => ({
        background: getComputedStyle(element).backgroundColor,
        heading: getComputedStyle(element.querySelector("h4")!).color,
        shadow: getComputedStyle(element).boxShadow,
        decoration: getComputedStyle(element, "::before").content
      })));
      expect(new Set(cards.map(card => card.background)).size).toBe(4);
      expect(new Set(cards.map(card => card.heading)).size).toBe(4);
      for (const card of cards) {
        expect(card.shadow).toBe("none");
        expect(card.decoration).toBe("none");
      }
      const separators = page.locator(".strategic-row + .strategic-row");
      expect(await separators.count()).toBeGreaterThanOrEqual(4);
      for (const row of await separators.all()) {
        await expect(row).toHaveCSS("border-top-width", "1px");
        await expect(row).toHaveCSS("border-top-style", "solid");
        expect(await row.evaluate(element => getComputedStyle(element).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/strategy-${theme}-${width}.png`, fullPage: true });
    }
  }
});
