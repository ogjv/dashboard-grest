import { expect, test, type Page } from "@playwright/test";

async function openDirectory(page: Page, confirmationAvailable = true) {
  await page.route("**/dashboard/users-preview", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dashboard/src/styles.css"></head>
    <body><main id="root" style="padding:16px;max-width:1260px;margin:auto"></main><script type="module">
      import React from '/dashboard/node_modules/.vite/deps/react.js';
      import ReactDOM from '/dashboard/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/dashboard/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const { UserManagementPanel } = await import('/dashboard/src/components/accountPanels.tsx');
      const { translations } = await import('/dashboard/src/i18n.tsx');
      const memberships = ['Katzsu','Nosso Ipanema','Chanchada'].map((restaurantName,index) => ({membershipId:String(index),restaurantId:['a','b','c'][index],restaurantName,role:'owner'}));
      const session = {userId:'owner',email:'owner@example.com',authMode:'local',globalRole:'owner',memberships};
      const makeMember = (userId,fullName,status) => ({userId,fullName,email:userId+'@example.com',membershipId:userId,accountId:'account',role:'user',emailConfirmedAt:status==='pending'?null:'2026-10-01T12:00:00Z',createdAt:'2026-10-01T12:00:00Z',restaurants:status==='linked'?[{restaurantId:'a',restaurantName:'Katzsu',role:'viewer'}]:[]});
      const initialMembers = [makeMember('pending','João Pendente','pending'),makeMember('bruna','Bruna Sem Vínculo','unlinked'),makeMember('carlos','Carlos Cliente','linked'),...Array.from({length:18},(_,index)=>makeMember('client'+index,'Cliente '+String(index).padStart(2,'0'),'linked')),{...makeMember('owner','Gestor Owner','linked'),role:'owner'}];
      window.__updates=[];
      if (!${confirmationAvailable}) initialMembers.forEach(member => { delete member.emailConfirmedAt; });
      function Preview() {
        const [members,setMembers]=React.useState(initialMembers);
        const [inviteForm,setInviteForm]=React.useState({email:'',restaurantIds:[]});
        return React.createElement(UserManagementPanel,{
          session,members,membersLoading:false,inviteForm,inviteBusy:false,invitations:[],invitationsLoading:false,copy:translations.pt,
          onInviteEmailChange:email=>setInviteForm(current=>({...current,email})),
          onInviteRestaurantToggle:id=>setInviteForm(current=>({...current,restaurantIds:current.restaurantIds.includes(id)?current.restaurantIds.filter(value=>value!==id):[...current.restaurantIds,id]})),
          onCreateInvitation:()=>{},onRevokeInvitation:()=>{},
          onUpdateMember:async payload=>{window.__updates.push({restaurantIds:payload.restaurantIds,accountRole:payload.accountRole,restaurantRole:payload.restaurantRole});setMembers(current=>current.map(member=>member.userId===payload.member.userId?{...member,restaurants:payload.restaurantIds.map(id=>({restaurantId:id,restaurantName:memberships.find(item=>item.restaurantId===id).restaurantName,role:'viewer'}))}:member));},
          onRemoveMember:async member=>setMembers(current=>current.map(item=>item.userId===member.userId?{...item,restaurants:[]}:item))
        });
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Preview));
    </script></body></html>`
  }));
  await page.goto("/dashboard/users-preview");
  await expect(page.getByRole("heading", { name: "Contas e acessos" })).toBeVisible();
}

test("separates confirmation and access status, searches multiple fields and paginates", async ({ page }) => {
  await openDirectory(page);
  await expect(page.locator(".user-directory-list li")).toHaveCount(10);
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(page.getByText("Página 2 de 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Aguardando e-mail/ }).click();
  await expect(page.locator(".user-directory-list li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Gerenciar João Pendente" })).toBeVisible();
  await page.getByRole("button", { name: /Ativas sem restaurante/ }).click();
  await expect(page.getByRole("button", { name: "Gerenciar Bruna Sem Vínculo" })).toBeVisible();
  await page.getByRole("button", { name: /Todas as contas/ }).click();
  await page.getByRole("searchbox", { name: "Buscar usuário" }).fill("katzsu carlos");
  await expect(page.locator(".user-directory-list li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Gerenciar Carlos Cliente" })).toBeVisible();
});

test("assigns restaurants with reader permissions and protects unsaved edits", async ({ page }) => {
  await openDirectory(page);
  await page.getByRole("button", { name: /Ativas sem restaurante/ }).click();
  await page.getByRole("button", { name: "Gerenciar Bruna Sem Vínculo" }).click();
  await page.locator(".user-access-editor summary").click();
  await page.getByRole("button", { name: "Nosso Ipanema", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Salvar acesso", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __updates: unknown[] }).__updates)).toEqual([{ restaurantIds: ["b"], accountRole: "user", restaurantRole: "viewer" }]);
  await expect(page.locator(".user-access-editor .user-directory-status")).toHaveText("Com acesso");
  await page.locator(".user-access-editor summary").click();
  await page.getByRole("button", { name: "Katzsu", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fechar edição de acesso" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salvar acesso", exact: true })).toBeEnabled();
});

test("fits both themes and keeps the restaurant picker within narrow screens", async ({ page }) => {
  await openDirectory(page);
  await page.getByRole("button", { name: /Ativas sem restaurante/ }).click();
  await page.getByRole("button", { name: "Gerenciar Bruna Sem Vínculo" }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const search = page.getByRole("searchbox", { name: "Buscar usuário" });
      await expect(search).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await search.focus();
      await expect(search).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(search).toHaveCSS("box-shadow", "none");
      await page.locator(".user-access-editor summary").click();
      const menu = await page.locator(".user-access-editor .restaurant-switcher-menu").boundingBox();
      expect(menu!.x).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.keyboard.press("Escape");
    }
  }
  await page.locator(".user-access-editor summary").click();
  await page.screenshot({ path: "test-results/user-management.png", fullPage: true });
});

test("shows known restaurant access without an unavailable-status banner when confirmation is not connected", async ({ page }) => {
  await openDirectory(page, false);
  await expect(page.getByText(/Confirmação indisponível|Status indisponível|A confirmação de e-mail de algumas contas/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Aguardando e-mail/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Com acesso/ }).click();
  await expect(page.locator(".user-directory-row .user-directory-status")).toHaveText(Array(10).fill("Com acesso"));
  await page.getByRole("button", { name: /^Sem restaurante/ }).click();
  await expect(page.locator(".user-directory-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "Gerenciar Bruna Sem Vínculo" }).click();
  await expect(page.locator(".user-access-facts")).toContainText("Não consultada");
});
