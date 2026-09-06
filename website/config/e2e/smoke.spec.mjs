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

test("configuracion.html muestra la versión v3.1", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");

  await page.goto("/configuracion.html");
  await expect(page.locator("body")).toContainText("LabControl v3.2", { timeout: 8000 });

  // El panel visible muestra la versión y el conteo en vivo de laboratorios/equipos.
  await page.click('#cfg-sidenav button[data-section="sistema"]');
  const panel = page.locator("#panel-sistema");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("LabControl v3.2");
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

test("solicitud de especialidad: prof_juan la pide y el admin la aprueba", async ({ page }) => {
  await login(page, "prof_juan", "juan123");
  await page.goto("/configuracion.html");

  // Los no-admins ya no pueden modificar su área/departamento
  await expect(page.locator("#p-area")).toBeDisabled();

  await page.fill("#p-especialidad", "Desarrollo Web y Redes Avanzadas");
  await page.click("#btn-guardar-cfg");
  await expect(page.locator("#toast-container")).toContainText("Configuración guardada correctamente.", { timeout: 8000 });

  // El admin abre la notificación y aprueba la solicitud
  await page.evaluate(() => localStorage.removeItem("lc_sesion"));
  await login(page, "INSUCO", "Insuco1336");
  await page.click(".notif-btn");
  const item = page.locator(".notif-item").filter({ hasText: "Solicitud de cambio de especialidad" }).first();
  await expect(item).toBeVisible({ timeout: 8000 });
  await item.click();

  await expect(page.locator("#modal-solicitud")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#modal-solicitud")).toContainText("Desarrollo Web y Redes Avanzadas");
  await page.click("#sol-aceptar");

  await expect(page.locator("#modal-solicitud")).not.toBeVisible({ timeout: 8000 });
  await expect(page.locator("#toast-container")).toContainText("Solicitud aprobada");
});

test("admin edita un usuario existente desde su detalle", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/usuarios.html");

  await page.locator(".usr-card").filter({ hasText: "prof" }).first().click();
  await expect(page.locator("#vista-usr-detalle")).toBeVisible({ timeout: 8000 });
  await page.click("#btn-editar-usr");

  await expect(page.locator("#modal-usuario")).toBeVisible();
  await page.fill("#usr-nombre", "Nombre Editado");
  await page.click("#btn-guardar-usr");

  await expect(page.locator("#det-nombre")).toContainText("Nombre Editado", { timeout: 8000 });
});

test("cabeceras de seguridad: CSP estricto, sin caché en API y dotfiles negados", async ({ request }) => {
  const html = await request.get("/index.html");
  const csp = html.headers()["content-security-policy"] || "";
  const scriptSrc = (csp.match(/(?:^|;)\s*script-src\s+([^;]+)/) || [])[1] || "";
  const scriptSrcAttr = (csp.match(/(?:^|;)\s*script-src-attr\s+([^;]+)/) || [])[1] || "";
  expect(scriptSrc).toContain("'self'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrcAttr).toBe("'none'");
  expect(html.headers()["x-content-type-options"]).toBe("nosniff");
  expect(html.headers()["referrer-policy"]).toBe("same-origin");

  const api = await request.post("/api/login", { data: { usuario: "nadie", password: "incorrecta" } });
  expect(api.status()).toBe(401);
  expect(api.headers()["cache-control"]).toBe("no-store");

  const oculto = await request.get("/.env");
  expect(oculto.status()).toBe(404);
});

test("CSP estricto bloquea la ejecución de scripts inline", async ({ page }) => {
  await page.goto("/login.html");
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = 'document.body.setAttribute("data-csp-trap", "1")';
    document.head.appendChild(s);
  });
  await expect(page.locator("body")).not.toHaveAttribute("data-csp-trap", "1");
});

test("sesión de larga duración: el access token expirado se renueva solo", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await expect(page.locator("#stat-cards .stat-card")).toHaveCount(5, { timeout: 8000 });

  const tokenAntes = await page.evaluate(() => JSON.parse(localStorage.getItem("lc_sesion")).token);
  expect(tokenAntes).toBeTruthy();

  // El servidor e2e firma access tokens de 3s: tras esperar, el dashboard debe
  // renovar la sesión con el refresh token y reintentar con éxito.
  await page.waitForTimeout(4000);
  await page.reload();
  await expect(page.locator("#stat-cards .stat-card")).toHaveCount(5, { timeout: 10000 });

  const tokenDespues = await page.evaluate(() => JSON.parse(localStorage.getItem("lc_sesion")).token);
  expect(tokenDespues).toBeTruthy();
  expect(tokenDespues).not.toBe(tokenAntes);
});

test("modo offline: el SW sirve el shell y los assets desde caché y degrada a datos demo", async ({ page, context }) => {
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));

  await login(page, "INSUCO", "Insuco1336");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator(".sidebar")).toBeVisible();

  const cache = await page.evaluate(async () => {
    const claves = await caches.keys();
    const cache = await caches.open(claves.find((k) => k.startsWith("labcontrol")));
    return (await cache.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, ""));
  });
  expect(cache).toContain("index.html");
  expect(cache).toContain("style.css");
  expect(cache).toContain("app.js");

  await context.setOffline(true);
  const offline = await page.evaluate(async () => {
    const resultados = {};
    for (const r of ["index.html", "style.css?v=3.2", "app.js?v=3.2"]) {
      try { resultados[r] = (await fetch(r)).ok; }
      catch { resultados[r] = false; }
    }
    return resultados;
  });
  expect(offline["index.html"]).toBe(true);
  expect(offline["style.css?v=3.2"]).toBe(true);
  expect(offline["app.js?v=3.2"]).toBe(true);

  const degradacion = await page.evaluate(() =>
    window.cargarLaboratorios().then(
      () => "datos",
      () => "error-capturado"
    )
  );
  expect(degradacion).toBe("error-capturado");
  await context.setOffline(false);

  expect(errores).toEqual([]);
});