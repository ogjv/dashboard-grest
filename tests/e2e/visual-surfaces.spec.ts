import { expect, test } from "@playwright/test";

test("shared surfaces stay flat and neutral in both themes and screen sizes", async ({ page }) => {
  await page.route("**/dashboard/surfaces-preview", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dashboard/src/styles.css"></head><body>
      <main style="max-width:1000px;margin:auto;padding:16px;display:grid;gap:16px">
        <section class="card period-filter-card"><div class="section-head"><div><h3>Período analisado</h3><p>Período consolidado dos arquivos importados.</p></div></div><div class="period-banner"><small>Total consolidado</small><strong>01/01/2026 a 30/09/2026</strong></div></section>
        <section class="card"><h3>Indicadores</h3><p>Dados do restaurante selecionado.</p><div class="issue-card warning"><strong>Revisar custos</strong><p>Confira os produtos com maior impacto.</p></div><div class="strategic-card good"><strong>Margem saudável</strong></div><div class="band-card bad"><strong>Margem negativa</strong></div><div class="message success" role="status">Alterações salvas.</div><button class="primary-button">Salvar</button></section>
        <div class="user-directory-row selected"><strong>Cliente selecionado</strong></div>
      </main></body></html>`
  }));
  await page.goto("/dashboard/surfaces-preview");
  await expect(page.getByRole("heading", { name: "Período analisado" })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const styles = await page.locator(".card, .period-banner, .issue-card, .strategic-card, .band-card, .message, .primary-button, .user-directory-row").evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return { shadow: style.boxShadow, image: style.backgroundImage, before: getComputedStyle(element, "::before").content };
      }));
      for (const style of styles) {
        expect(style.shadow).toBe("none");
        expect(style.image).toBe("none");
        expect(["none", "normal"]).toContain(style.before);
      }
      const textStyles = await page.locator("h3, p, strong, small").evaluateAll(elements => elements.map(element => ({ shadow: getComputedStyle(element).textShadow, background: getComputedStyle(element).backgroundColor })));
      for (const style of textStyles) {
        expect(style.shadow).toBe("none");
        expect(style.background).toBe("rgba(0, 0, 0, 0)");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/surfaces-${theme}-${width}.png`, fullPage: true });
    }
  }
});
