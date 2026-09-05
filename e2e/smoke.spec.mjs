import { test, expect } from "@playwright/test";

test("login como INSUCO y el dashboard carga los datos", async ({ page }) => {
  await page.goto("/login.html");
  await expect(page).toHaveTitle(/Insuco LabControl/);
  await page.fill("#input-user", "INSUCO");
  await page.fill("#input-pass", "Insuco1336");
  await page.click(".login-submit");
  await page.waitForURL("**/index.html");

  await expect(page.locator("#saludo-titulo")).toContainText("Administrador", { timeout: 8000 });
  await expect(page.locator("#stat-cards .stat-card")).toHaveCount(5, { timeout: 8000 });
  await expect(page.locator(".sidebar__user .name")).not.toBeEmpty();
});

test("configuracion.html muestra la versión v2.6", async ({ page }) => {
  await page.goto("/login.html");
  await page.fill("#input-user", "INSUCO");
  await page.fill("#input-pass", "Insuco1336");
  await page.click(".login-submit");
  await page.waitForURL("**/index.html");

  await page.goto("/configuracion.html");
  await expect(page.locator("body")).toContainText("LabControl v2.6", { timeout: 8000 });
});