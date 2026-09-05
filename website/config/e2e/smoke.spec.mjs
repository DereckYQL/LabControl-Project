import { test, expect } from "@playwright/test";

async function login(page, user, pass) {
  await page.goto("/login.html");
  await page.fill("#input-user", user);
  await page.fill("#input-pass", pass);
  await page.click(".login-submit");
  await page.waitForURL("**/index.html");
}

test("login como INSUCO y el dashboard carga los datos", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");

  await expect(page.locator("#saludo-titulo")).toContainText("Administrador", { timeout: 8000 });
  await expect(page.locator("#stat-cards .stat-card")).toHaveCount(5, { timeout: 8000 });
  await expect(page.locator(".sidebar__user .name")).not.toBeEmpty();
});

test("configuracion.html muestra la versión v2.9", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");

  await page.goto("/configuracion.html");
  await expect(page.locator("body")).toContainText("LabControl v2.9", { timeout: 8000 });

  // El panel visible muestra la versión y el conteo en vivo de laboratorios/equipos.
  await page.click('#cfg-sidenav button[data-section="sistema"]');
  const panel = page.locator("#panel-sistema");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("LabControl v2.9");
  await expect(panel).toContainText("Total laboratorios");
  await expect(panel).toContainText("Total equipos");
});

test("login-hint autocompleta la cuenta de demostración", async ({ page }) => {
  await page.goto("/login.html");
  await page.click(".login-hint__btn:has-text('Admin')");
  await expect(page.locator("#input-user")).toHaveValue("INSUCO");
  await expect(page.locator("#input-pass")).toHaveValue("Insuco1336");
});

test("prof_camila ve los datos técnicos restringidos en Equipos", async ({ page }) => {
  await login(page, "prof_camila", "camila123");

  await page.goto("/equipos.html");
  await expect(page.locator("#aviso-sin-permiso")).toBeVisible();
  await expect(page.locator("[data-control]")).toHaveCount(0);
});

test("admin abre el control remoto de un equipo", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");

  await page.goto("/equipos.html");
  const btn = page.locator("[data-control]").first();
  await expect(btn).toBeVisible({ timeout: 8000 });
  await btn.click();

  await expect(page.locator("#seccion-remoto")).toBeVisible();
  await expect(page.locator("#rem-nombre")).not.toBeEmpty();
  await expect(page.locator("#remote-log")).toContainText("Sesión de control iniciada");
});

test("prof_camila edita su propio perfil y guarda", async ({ page }) => {
  await login(page, "prof_camila", "camila123");

  await page.goto("/configuracion.html");
  await page.fill("#p-nombre", "Camila Editada");
  await page.click("#btn-guardar-cfg");
  await expect(page.locator("#toast-container")).toContainText("Configuración guardada correctamente.", { timeout: 8000 });
});