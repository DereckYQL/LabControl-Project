import { test, expect } from "@playwright/test";

async function login(page, user, pass) {
  await page.goto("/login.html");
  await page.fill("#input-user", user);
  await page.fill("#input-pass", pass);
  await page.click("#btn-login-enviar");
  await page.waitForURL("**/index.html");
}

test("login como INSUCO y el dashboard carga los datos", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");

  await expect(page.locator("#saludo-titulo")).toContainText("Administrador", { timeout: 8000 });
  await expect(page.locator("#stat-cards .stat-card")).toHaveCount(5, { timeout: 8000 });
  await expect(page.locator(".sidebar__user .name")).not.toBeEmpty();
});

test("configuracion.html muestra la versión vigente", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");

  await page.goto("/configuracion.html");

  // La versión no se escribe a mano en el test: se toma del token `?v=` de los
  // propios assets (3.9.1 → "3.9"), que es el mismo que usa el service worker.
  // Si se fijara "v3.x" aquí, el test se caería en cada versión nueva.
  const visible = await page.evaluate(() => {
    const src = [...document.querySelectorAll("script[src]")]
      .map((s) => s.getAttribute("src"))
      .find((s) => s && s.includes("app.js"));
    const v = src ? new URL(src, location.href).searchParams.get("v") : null;
    return v ? `LabControl v${v.split(".").slice(0, 2).join(".")}` : null;
  });
  expect(visible).toBeTruthy();
  await expect(page.locator("body")).toContainText(visible, { timeout: 8000 });

  // El panel visible muestra la versión y el conteo en vivo de laboratorios/equipos.
  await page.click('#cfg-sidenav button[data-section="sistema"]');
  const panel = page.locator("#panel-sistema");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(visible);
  await expect(panel).toContainText("Total laboratorios");
  await expect(panel).toContainText("Total equipos");
});

test("login-hint autocompleta la cuenta de demostración", async ({ page }) => {
  await page.goto("/login.html");
  await page.click(".login-hint__btn:has-text('Admin')");
  await expect(page.locator("#input-user")).toHaveValue("INSUCO");
  await expect(page.locator("#input-pass")).toHaveValue("Insuco1336");
});

test("registro de cuenta propia: crea la cuenta, inicia sesión y llega al dashboard", async ({ page }) => {
  await page.goto("/login.html");
  await page.click("#btn-ir-registrar");
  const sufijo = Date.now().toString().slice(-6);
  await page.fill("#reg-nombre", "Estela");
  await page.fill("#reg-apellido", "Riquelme");
  await page.fill("#reg-usuario", `prof_estela_${sufijo}`);
  await page.fill("#reg-email", `estela${sufijo}@liceo.cl`);
  await page.fill("#reg-area", "Historia");
  await page.fill("#reg-especialidad", "Historia de Chile");
  await page.fill("#reg-pass", "estela123");
  await page.fill("#reg-pass2", "estela123");
  await page.check("#reg-terminos");
  await page.click("#vista-registrar button[type=submit]");
  await page.waitForURL("**/index.html");
  await expect(page.locator(".sidebar__user")).toBeVisible();
});

test("el formulario de recuperación responde de forma genérica", async ({ page }) => {
  await page.goto("/login.html");
  await page.click("#btn-ir-recuperar");
  await expect(page.locator("#recuperar-form")).toBeVisible();
  await page.fill("#rec-email", "nadie@liceo.cl");
  await page.click("#recuperar-form button[type=submit]");
  await expect(page.locator("#recuperar-ok")).toBeVisible();
});

test("el modal de términos abre desde el registro y cierra con la X", async ({ page }) => {
  await page.goto("/login.html");
  await page.click("#btn-ir-registrar");
  await page.click("[data-term='terminos']");
  await expect(page.locator("#modal-terminos")).toBeVisible();
  await expect(page.locator("#modal-terminos-titulo")).toHaveText("Términos de uso");
  await page.click("[data-cerrar-modal]");
  await expect(page.locator("#modal-terminos")).toBeHidden();
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
  expect(cache).toContain("css/style.css");
  expect(cache).toContain("js/app.js");

  // La versión se lee del propio index.html y se cruza con la del service worker.
  // Si cambia un asset hay que subir a la vez el `?v=` de las páginas y el
  // CACHE_NAME del SW; si no, quien ya visitó la web sigue con la copia cacheada
  // anterior y no recibe los arreglos de seguridad.
  const version = await page.evaluate(() => {
    const src = [...document.querySelectorAll("script[src]")]
      .map((s) => s.getAttribute("src"))
      .find((s) => s && s.includes("app.js"));
    return src ? new URL(src, location.href).searchParams.get("v") : null;
  });
  expect(version).toBeTruthy();

  const swCache = await page.evaluate(async (v) => {
    const claves = await caches.keys();
    const nombre = claves.find((k) => k.startsWith("labcontrol"));
    const guardada = await caches.open(nombre);
    const urls = (await guardada.keys()).map((r) => r.url);
    return { nombre, versionado: urls.some((u) => u.endsWith(`app.js?v=${v}`)) };
  }, version);
  expect(swCache.versionado).toBe(true);
  expect(swCache.nombre.endsWith(version)).toBe(true);

  await context.setOffline(true);
  const offline = await page.evaluate(async (v) => {
    const resultados = {};
    for (const r of ["index.html", `css/style.css?v=${v}`, `js/app.js?v=${v}`]) {
      try { resultados[r] = (await fetch(r)).ok; }
      catch { resultados[r] = false; }
    }
    return resultados;
  }, version);
  expect(offline["index.html"]).toBe(true);
  expect(offline[`css/style.css?v=${version}`]).toBe(true);
  expect(offline[`js/app.js?v=${version}`]).toBe(true);

  const degradacion = await page.evaluate(async () => {
    const mod = await import("./js/data.js");
    return mod.cargarLaboratorios().then(
      () => "datos",
      () => "error-capturado"
    );
  });
  expect(degradacion).toBe("error-capturado");
  await context.setOffline(false);

  expect(errores).toEqual([]);
});

test("accesibilidad: el enlace 'saltar al contenido' mueve el foco a main", async ({ page }) => {
  await page.goto("/login.html");
  await page.keyboard.press("Tab");
  const skip = page.locator(".skip-nav");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("accesibilidad: foco atrapado en el modal y restaurado al cerrar", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/usuarios.html");
  const btn = page.locator("#btn-nuevo-usuario");
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.locator("#modal-usuario")).toBeVisible();
  await expect(page.locator("#usr-nombre")).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  const enModoYEnModal = await page.evaluate(() => {
    const ace = document.activeElement;
    return !!ace && ace.id === "modal-usuario" ? "#modal-usuario" : (ace?.closest ? ace.closest("#modal-usuario")?.id ?? null : null);
  });
  expect(enModoYEnModal).toBe("modal-usuario");

  await page.keyboard.press("Escape");
  await expect(page.locator("#modal-usuario")).not.toBeVisible();
  await expect(btn).toBeFocused();
});

test("accesibilidad: interruptores (switch) operables con teclado", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/configuracion.html");
  await page.click('#cfg-sidenav button[data-section="notificaciones"]');
  const tog = page.locator('.toggle[role="switch"]').first();
  await expect(tog).toBeVisible();
  await tog.focus();
  const antes = await tog.getAttribute("aria-checked");
  await page.keyboard.press("Space");
  const despues = await tog.getAttribute("aria-checked");
  expect(despues).not.toBe(antes);
});

test("auditoría: el admin ve los registros de actividad y filtra", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/configuracion.html");
  await page.click('#cfg-sidenav button[data-section="auditoria"]');

  const tbody = page.locator("#aud-tbody");
  await expect(tbody).toBeVisible({ timeout: 8000 });
  await expect(tbody).not.toContainText("Sin registros", { timeout: 8000 });
  await expect(page.locator("#aud-tbody tr")).not.toHaveCount(0, { timeout: 8000 });

  // El login quedó registrado: filtrar "login_ok" debe devolver resultados.
  await page.fill("#aud-q", "login_ok");
  await page.click("#btn-aud-filtrar");
  await expect(page.locator("#aud-tbody").first()).toContainText("Inicio de sesión", { timeout: 8000 });
});

test("calendario semanal: navegación entre semanas y columna de hoy", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/disponibilidad.html");

  await expect(page.locator("#semana-wrap .semana-tabla")).toContainText("Laboratorio", { timeout: 8000 });
  await expect(page.locator(".semana-th--hoy")).toHaveCount(1, { timeout: 8000 });
  await expect(page.locator("#semana-label")).toContainText("(hoy)", { timeout: 8000 });

  await page.click("#btn-semana-sig");
  await expect(page.locator("#semana-label")).not.toContainText("(hoy)", { timeout: 8000 });
  await page.click("#btn-semana-ant");
  await expect(page.locator("#semana-label")).toContainText("(hoy)", { timeout: 8000 });
});

test("respaldos: el admin descarga un archivo .db", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/configuracion.html");
  await page.click('#cfg-sidenav button[data-section="backups"]');

  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.click("#btn-backup-descargar");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.db$/);
});

test("reportes: exportar el reporte a CSV", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/reportes.html");

  const tarjeta = page.locator(".rep-card").first();
  await expect(tarjeta).toBeVisible({ timeout: 8000 });
  await tarjeta.click();

  const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
  await page.click('button[data-acc="csv"]');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^reporte-.*\.csv$/);
});

test("2FA: el admin activa, verifica y desactiva en Configuración", async ({ page }) => {
  await login(page, "INSUCO", "Insuco1336");
  await page.goto("/configuracion.html");
  await page.click('#cfg-sidenav button[data-section="seguridad"]');

  const codigoTotp = ({ secreto, offset }) => page.evaluate(async ({ secreto, offset }) => {
    const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const bits = [];
    for (const c of (secreto.toUpperCase().replace(/=+$/g, ""))) {
      const v = B32.indexOf(c);
      for (let b = 4; b >= 0; b--) bits.push((v >> b) & 1);
    }
    const key = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < key.length; i++) {
      let x = 0;
      for (let b = 0; b < 8; b++) x = (x << 1) | bits[i * 8 + b];
      key[i] = x;
    }
    const counter = Math.floor(Date.now() / 1000 / 30) + offset;
    const msg = new Uint8Array(8);
    let c2 = counter;
    for (let i = 7; i >= 0; i--) { msg[i] = c2 & 0xff; c2 = Math.floor(c2 / 256); }
    const buf = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sign = new Uint8Array(await crypto.subtle.sign("HMAC", buf, msg));
    const off = sign[sign.length - 1] & 0x0f;
    const code = ((sign[off] & 0x7f) << 24 | (sign[off + 1] & 0xff) << 16 | (sign[off + 2] & 0xff) << 8 | (sign[off + 3] & 0xff)) % 1000000;
    return String(code).padStart(6, "0");
  }, { secreto, offset });

  const confirmarCodigo = async (btnId) => {
    const secreto = await page.locator("#modal-2fa-secreto").inputValue();
    for (const offset of [0, -1, 1]) {
      const codigo = await codigoTotp({ secreto, offset });
      await page.fill("#modal-2fa-codigo", codigo);
      await page.click(btnId);
      try {
        await page.waitForSelector("#modal-2fa", { state: "hidden", timeout: 2500 });
        return; // modal cerrado: código válido
      } catch {
        /* código inválido: reintentar con la siguiente ventana */
      }
    }
    throw new Error("No se pudo validar ningún código TOTP");
  };

  try {
    // Activar
    await page.click("#btn-2fa-config");
    await expect(page.locator("#modal-2fa")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#modal-2fa-secreto")).not.toHaveValue("");
    await confirmarCodigo("#btn-2fa-confirmar");
    await expect(page.locator("#s-2fa-desc")).toContainText("Activa", { timeout: 8000 });
    await expect(page.locator("#btn-2fa-desactivar")).toBeVisible();
  } finally {
    // Desactivar para no bloquear los demás inicios de sesión
    if (await page.locator("#btn-2fa-desactivar").isVisible().catch(() => false)) {
      await page.click("#btn-2fa-desactivar");
      await expect(page.locator("#modal-2fa")).toBeVisible({ timeout: 8000 });
      await confirmarCodigo("#btn-2fa-confirmar");
      await expect(page.locator("#s-2fa-desc")).toContainText("Inactiva", { timeout: 8000 });
    }
  }
});

test.describe("celular: el usuario y las notificaciones viven dentro del menú", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la barra superior queda solo con el botón de menú", async ({ page }) => {
    await login(page, "INSUCO", "Insuco1336");

    // Con el menú plegado, ni el usuario ni la campana ocupan la barra superior.
    await expect(page.locator(".sidebar__toggle")).toBeVisible();
    await expect(page.locator(".sidebar__user")).toBeHidden();
    await expect(page.locator(".notif-btn")).toBeHidden();

    const barra = await page.locator(".sidebar").boundingBox();
    const ancho = await page.evaluate(() => document.documentElement.clientWidth);
    expect(barra.width).toBe(ancho);
  });

  test("el menú muestra foto, nombre, correo y la campana a un lado", async ({ page }) => {
    await login(page, "INSUCO", "Insuco1336");

    await page.click(".sidebar__toggle");

    const cabecera = page.locator(".sidebar__me");
    await expect(cabecera).toBeVisible();
    await expect(cabecera.locator(".avatar")).toHaveText("AD");
    await expect(cabecera.locator(".name")).toHaveText("Administrador Sistema");
    await expect(cabecera.locator(".email")).toHaveText("admin@liceo.cl");

    // La campana está en la cabecera, a un lado del usuario, y no en la barra.
    const campana = cabecera.locator(".notif-btn");
    await expect(campana).toBeVisible();
    const avatar = await cabecera.locator(".avatar").boundingBox();
    const boton = await campana.boundingBox();
    expect(boton.x).toBeGreaterThan(avatar.x + avatar.width);

    // Separación entre la info del usuario y el resto de botones del menú.
    const separacion = await cabecera.evaluate((el) => getComputedStyle(el).borderBottomWidth);
    expect(Number.parseFloat(separacion)).toBeGreaterThan(0);
    const ultimoEnlace = await page.locator(".sidebar__link").last().boundingBox();
    const cabeceraBox = await cabecera.boundingBox();
    expect(cabeceraBox.y + cabeceraBox.height).toBeLessThan(ultimoEnlace.y);
  });

  test("las notificaciones se abren dentro del menú y se cierran al plegarlo", async ({ page }) => {
    await login(page, "INSUCO", "Insuco1336");

    await page.click(".sidebar__toggle");
    const panel = page.locator(".sidebar__me .notif-panel");
    await expect(panel).toBeHidden();

    await page.click(".sidebar__me .notif-btn");
    await expect(panel).toBeVisible();

    // Plegar el menú también cierra la ventana de notificaciones.
    await page.click(".sidebar__toggle");
    await expect(page.locator(".sidebar__me")).toBeHidden();
    await page.click(".sidebar__toggle");
    await expect(panel).toBeHidden();
  });

  test("al volver a escritorio el usuario y la campana salen del menú", async ({ page }) => {
    await login(page, "INSUCO", "Insuco1336");

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".sidebar__me")).toBeHidden();
    await expect(page.locator(".sidebar__user")).toBeVisible();
    await expect(page.locator(".notif-btn")).toBeVisible();

    // Y al plegar de nuevo, el menú vuelve a armar la cabecera del desplegable.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click(".sidebar__toggle");
    await expect(page.locator(".sidebar__me .sidebar__user")).toBeVisible();
  });
});
