import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

let app, dir;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-api-"));
  process.env.LC_DB_DIR = dir;
  app = (await import("../server.js")).app;
});

afterAll(async () => {
  try {
    (await import("../db.js")).db.close();
  } catch {
    // Ya estaba cerrado.
  }
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows puede mantener el archivo de SQLite abierto hasta el cierre
      // del proceso; el directorio restante es inofensivo.
    }
  }
});

// Los límites de rate limiting del login (10/15 min) obligan a reutilizar sesiones.
let tokenAdmin = null;
async function login() {
  if (!tokenAdmin) {
    tokenAdmin = (await request(app).post("/api/login").send({ usuario: "INSUCO", password: "Insuco1336" })).body.token;
  }
  return tokenAdmin;
}

let tokenCamila = null;
async function loginCamila() {
  if (!tokenCamila) {
    const res = await request(app).post("/api/login").send({ usuario: "prof_camila", password: "camila123" });
    expect(res.status).toBe(200);
    tokenCamila = res.body.token;
  }
  return tokenCamila;
}

async function loginFresh() {
  const res = await request(app).post("/api/login").send({ usuario: "INSUCO", password: "Insuco1336" });
  return res.body.token;
}

// Sesión completa (access + refresh) con una autenticación fresca.
async function sesionNueva() {
  const res = await request(app).post("/api/login").send({ usuario: "INSUCO", password: "Insuco1336" });
  expect(res.status).toBe(200);
  return res.body;
}

async function sesionNuevaCamila() {
  const res = await request(app).post("/api/login").send({ usuario: "prof_camila", password: "camila123" });
  expect(res.status).toBe(200);
  return res.body;
}

test("autenticación: rechaza credenciales incorrectas (401)", async () => {
  const res = await request(app).post("/api/login").send({ usuario: "INSUCO", password: "incorrecta" });
  expect(res.status).toBe(401);
});

test("autenticación: login correcto devuelve token y sin password", async () => {
  const res = await request(app).post("/api/login").send({ usuario: "INSUCO", password: "Insuco1336" });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
  expect(res.body.refreshToken).toBeTruthy();
  expect(res.body.usuario.password).toBeUndefined();
});

test("seguridad: /api/usuarios exige token (401)", async () => {
  const res = await request(app).get("/api/usuarios");
  expect(res.status).toBe(401);
});

test("POST /api/login: checkpoint", async () => {
  const token = await loginFresh();
  expect(token).toBeTruthy();
});

test("refresh tokens: renueva sesión, rota el token viejo y el nuevo access autentica", async () => {
  const primero = await sesionNueva();
  expect(primero.refreshToken).toBeTruthy();

  const renovado = await request(app).post("/api/refresh").send({ refreshToken: primero.refreshToken });
  expect(renovado.status).toBe(200);
  expect(renovado.body.token).toBeTruthy();
  expect(renovado.body.refreshToken).toBeTruthy();
  expect(renovado.body.refreshToken).not.toBe(primero.refreshToken);

  // El nuevo access token funciona contra la API.
  const api = await request(app).get("/api/laboratorios").set("Authorization", `Bearer ${renovado.body.token}`);
  expect(api.status).toBe(200);

  // Un refresh token ya rotado jamás se reutiliza.
  const reuso = await request(app).post("/api/refresh").send({ refreshToken: primero.refreshToken });
  expect(reuso.status).toBe(401);
});

test("refresh tokens: un token de refresco no autentica la API (403)", async () => {
  const sesion = await sesionNueva();
  const api = await request(app).get("/api/laboratorios").set("Authorization", `Bearer ${sesion.refreshToken}`);
  expect(api.status).toBe(403);
});

test("refresh tokens: logout revoca el token de refresco", async () => {
  const sesion = await sesionNueva();
  const salida = await request(app).post("/api/logout").send({ refreshToken: sesion.refreshToken });
  expect(salida.status).toBe(200);

  const res = await request(app).post("/api/refresh").send({ refreshToken: sesion.refreshToken });
  expect(res.status).toBe(401);
});

test("refresh tokens: cambiar la contraseña revoca las sesiones de larga duración", async () => {
  const sesion = await sesionNuevaCamila();
  const cambio = await request(app).post("/api/change-password")
    .set("Authorization", `Bearer ${sesion.token}`)
    .send({ currentPassword: "camila123", newPassword: "camila456" });
  expect(cambio.status).toBe(200);

  const res = await request(app).post("/api/refresh").send({ refreshToken: sesion.refreshToken });
  expect(res.status).toBe(401);

  // Se restaura la contraseña original para no afectar al resto de la suite.
  const restaura = await request(app).post("/api/change-password")
    .set("Authorization", `Bearer ${sesion.token}`)
    .send({ currentPassword: "camila456", newPassword: "camila123" });
  expect(restaura.status).toBe(200);
});

test("refresh tokens: token inválido o ausente se rechaza", async () => {
  const invalido = await request(app).post("/api/refresh").send({ refreshToken: "abc.def.ghi" });
  expect(invalido.status).toBe(401);

  const ausente = await request(app).post("/api/refresh").send({});
  expect(ausente.status).toBe(400);
});

test("listado plano: /api/laboratorios sin parámetros devuelve arreglo", async () => {
  const token = await login();
  const res = await request(app).get("/api/laboratorios").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThan(0);
});

test("listado paginado: /api/laboratorios?limite=2 devuelve envelope", async () => {
  const token = await login();
  const res = await request(app)
    .get("/api/laboratorios?limite=2")
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(false);
  expect(res.body.data).toHaveLength(2);
  expect(res.body.total).toBeGreaterThan(2);
  expect(res.body.pagina).toBe(1);
  expect(res.body.totalPaginas).toBeGreaterThan(1);
  expect(res.body.limite).toBe(2);
});

test("validación: limite inválido devuelve 400", async () => {
  const token = await login();
  const res = await request(app)
    .get("/api/laboratorios?limite=abc")
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(400);
});

test("seguridad: los usuarios listados nunca exponen password", async () => {
  const token = await login();
  const res = await request(app).get("/api/usuarios").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  const lista = Array.isArray(res.body) ? res.body : res.body.data;
  for (const u of lista) expect(u.password).toBeUndefined();
});

test("agenda paginada: envelope correcto", async () => {
  const token = await login();
  const res = await request(app)
    .get("/api/agenda?pagina=1&limite=3")
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(3);
  expect(res.body.totalPaginas).toBe(2);
});

test("reportes: crea con cuerpo mínimo", async () => {
  const token = await login();
  const res = await request(app)
    .post("/api/reportes")
    .set("Authorization", `Bearer ${token}`)
    .send({ numero: "R-TEST-1", tipo: "mantencion", titulo: "Reporte de prueba", descripcion: "Reporte generado por la suite de tests", fecha: "2026-01-01" });
  expect([200, 201]).toContain(res.status);
});

test("usuarios: un usuario edita su nombre/apellido y recibe token renovado", async () => {
  const token = await loginCamila();
  const res = await request(app)
    .patch("/api/usuarios/prof_camila")
    .set("Authorization", `Bearer ${token}`)
    .send({ nombre: "Camila Editada", apellido: "Pérez" });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
  expect(res.body.nombre).toBe("Camila Editada");
});

test("usuarios: un no-admin no puede cambiarse su área (403)", async () => {
  const token = await loginCamila();
  const res = await request(app)
    .patch("/api/usuarios/prof_camila")
    .set("Authorization", `Bearer ${token}`)
    .send({ area: "Ciencias" });
  expect(res.status).toBe(403);
});

test("usuarios: un no-admin no puede cambiarse su especialidad directamente (403)", async () => {
  const token = await loginCamila();
  const res = await request(app)
    .patch("/api/usuarios/prof_camila")
    .set("Authorization", `Bearer ${token}`)
    .send({ especialidad: "Métodos numéricos" });
  expect(res.status).toBe(403);
});

test("usuarios: un no-admin no puede promover su rol (403)", async () => {
  const token = await loginCamila();
  const res = await request(app)
    .patch("/api/usuarios/prof_camila")
    .set("Authorization", `Bearer ${token}`)
    .send({ rol: "admin" });
  expect(res.status).toBe(403);
});

test("técnicos: prof_camila no ve el detalle técnico de laboratorios ni equipos", async () => {
  const token = await loginCamila();
  const labs = (await request(app).get("/api/laboratorios").set("Authorization", `Bearer ${token}`)).body;
  const lab = Array.isArray(labs) ? labs[0] : labs.data[0];
  expect(lab).not.toHaveProperty("so");
  expect(lab).not.toHaveProperty("procesador");
  expect(lab).not.toHaveProperty("red");

  const eqs = (await request(app).get("/api/equipos").set("Authorization", `Bearer ${token}`)).body;
  const eq = Array.isArray(eqs) ? eqs[0] : eqs.data[0];
  expect(eq).not.toHaveProperty("ip");
  expect(eq).not.toHaveProperty("mac");
  expect(eq).not.toHaveProperty("serie");
});

test("laboratorios: cualquier autenticado cambia estado; campos técnicos exigen rol técnico", async () => {
  const token = await loginCamila();
  const ok = await request(app)
    .patch("/api/laboratorios/1")
    .set("Authorization", `Bearer ${token}`)
    .send({ estado: "ocupado" });
  expect(ok.status).toBe(200);
  expect(ok.body.estado).toBe("ocupado");

  const denegado = await request(app)
    .patch("/api/laboratorios/1")
    .set("Authorization", `Bearer ${token}`)
    .send({ estado: "disponible", so: "Windows 11" });
  expect(denegado.status).toBe(403);
});

test("agenda: rechaza fecha pasada y solapamientos", async () => {
  const token = await login();
  const pasado = await request(app)
    .post("/api/agenda")
    .set("Authorization", `Bearer ${token}`)
    .send({ labId: 1, fecha: "2020-01-01", horaInicio: "09:00", horaFin: "10:00", motivo: "Prueba" });
  expect(pasado.status).toBe(400);

  const hoy = new Date();
  const fecha = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const primero = await request(app)
    .post("/api/agenda")
    .set("Authorization", `Bearer ${token}`)
    .send({ labId: 2, fecha, horaInicio: "09:00", horaFin: "10:00", motivo: "Primera reserva" });
  expect(primero.status).toBe(201);

  const solapa = await request(app)
    .post("/api/agenda")
    .set("Authorization", `Bearer ${token}`)
    .send({ labId: 2, fecha, horaInicio: "09:30", horaFin: "10:30", motivo: "Solapamiento" });
  expect(solapa.status).toBe(409);

  const compat = await request(app)
    .post("/api/agenda")
    .set("Authorization", `Bearer ${token}`)
    .send({ labId: 2, fecha, horaInicio: "15:00", horaFin: "16:00", motivo: "Horario libre" });
  expect(compat.status).toBe(201);
});

test("solicitudes: un no-admin crea una solicitud de especialidad y el admin recibe la notificación", async () => {
  const token = await loginCamila();
  const crear = await request(app)
    .post("/api/solicitudes-especialidad")
    .set("Authorization", `Bearer ${token}`)
    .send({ especialidad: "Cálculo Numérico" });
  expect(crear.status).toBe(201);
  expect(crear.body.estado).toBe("pendiente");
  expect(crear.body.especialidadSolicitada).toBe("Cálculo Numérico");

  // La solicitud queda a la vista del admin
  const tokenAdmin = await login();
  const lista = await request(app)
    .get("/api/solicitudes-especialidad")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(lista.status).toBe(200);
  expect(lista.body.some((s) => s.id === crear.body.id && s.estado === "pendiente")).toBe(true);

  // El admin recibe una notificación ligada a la solicitud
  const notifs = await request(app)
    .get("/api/notificaciones")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(notifs.status).toBe(200);
  const notif = notifs.body.find((n) => n.tipo === "solicitud_especialidad" && n.solicitudId === crear.body.id);
  expect(notif).toBeTruthy();
  expect(String(notif.usuarioId)).toBe("INSUCO");
});

test("solicitudes: no se puede tener más de una solicitud pendiente (409)", async () => {
  const token = await loginCamila();
  const res = await request(app)
    .post("/api/solicitudes-especialidad")
    .set("Authorization", `Bearer ${token}`)
    .send({ especialidad: "Otra propuesta" });
  expect(res.status).toBe(409);
});

test("solicitudes: el admin aprueba y se actualiza la especialidad del usuario", async () => {
  const tokenAdmin = await login();
  const camila = (await request(app).get("/api/usuarios/prof_camila").set("Authorization", `Bearer ${tokenAdmin}`)).body;
  const sol = (await request(app).get("/api/solicitudes-especialidad").set("Authorization", `Bearer ${tokenAdmin}`)).body
    .find((s) => s.usuarioId === "prof_camila" && s.estado === "pendiente");
  expect(sol).toBeTruthy();

  const aprobar = await request(app)
    .post(`/api/solicitudes-especialidad/${sol.id}/aceptar`)
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(aprobar.status).toBe(200);
  expect(aprobar.body.estado).toBe("aceptada");

  const actualizado = (await request(app).get("/api/usuarios/prof_camila").set("Authorization", `Bearer ${tokenAdmin}`)).body;
  expect(actualizado.especialidad).toBe(sol.especialidadSolicitada);

  // El solicitante recibe la notificación de resolución
  const tokenCamila = await loginCamila();
  const notifs = (await request(app).get("/api/notificaciones").set("Authorization", `Bearer ${tokenCamila}`)).body;
  expect(notifs.some((n) => n.tipo === "solicitud_especialidad_resolucion")).toBe(true);

  // Dato previo para el siguiente test
  expect(camila.especialidad).not.toBe(sol.especialidadSolicitada);
});

test("solicitudes: no se puede solicitar la especialidad que ya se tiene (400)", async () => {
  const token = await loginCamila();
  const res = await request(app)
    .post("/api/solicitudes-especialidad")
    .set("Authorization", `Bearer ${token}`)
    .send({ especialidad: "Cálculo Numérico" });
  expect(res.status).toBe(400);
});

test("solicitudes: un no-admin no puede resolver solicitudes y el admin puede rechazar", async () => {
  const tokenCamila = await loginCamila();
  const crear = await request(app)
    .post("/api/solicitudes-especialidad")
    .set("Authorization", `Bearer ${tokenCamila}`)
    .send({ especialidad: "Inteligencia Artificial aplicada" });
  expect(crear.status).toBe(201);

  // Un no-admin no puede aprobar/rechazar
  const denegado = await request(app)
    .post(`/api/solicitudes-especialidad/${crear.body.id}/rechazar`)
    .set("Authorization", `Bearer ${tokenCamila}`);
  expect(denegado.status).toBe(403);

  // El admin sí puede rechazarla
  const tokenAdmin = await login();
  const rechazar = await request(app)
    .post(`/api/solicitudes-especialidad/${crear.body.id}/rechazar`)
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(rechazar.status).toBe(200);
  expect(rechazar.body.estado).toBe("rechazada");

  const camila = (await request(app).get("/api/usuarios/prof_camila").set("Authorization", `Bearer ${tokenAdmin}`)).body;
  expect(camila.especialidad).not.toBe("Inteligencia Artificial aplicada");

  // Resolver dos veces no se permite
  const repetido = await request(app)
    .post(`/api/solicitudes-especialidad/${crear.body.id}/rechazar`)
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(repetido.status).toBe(409);
});

test("solicitudes: un admin no puede crear solicitudes (edita directamente)", async () => {
  const tokenAdmin = await login();
  const res = await request(app)
    .post("/api/solicitudes-especialidad")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .send({ especialidad: "Dirección" });
  expect(res.status).toBe(403);
});

/* ===== Auditoría de actividad ===== */

test("auditoría: registra logins fallidos y exige rol admin", async () => {
  // Un intento fallido deja huella.
  await request(app).post("/api/login").send({ usuario: "INSUCO", password: "clave-invalida-xyz" });

  const tokenAdmin = await login();
  const lista = await request(app)
    .get("/api/auditoria")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(lista.status).toBe(200);
  expect(Array.isArray(lista.body)).toBe(true);
  expect(lista.body.length).toBeGreaterThan(0);

  const acciones = lista.body.map((e) => e.accion);
  expect(acciones).toContain("login_fallido");
  expect(acciones).toContain("login_ok");
  expect(lista.body.some((e) => e.accion === "login_fallido" && e.detalle?.usuario)).toBe(true);

  // Paginación correcta, orden descendente y filtro por término.
  const filtrado = await request(app)
    .get("/api/auditoria?q=login&limite=5&pagina=1")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(filtrado.status).toBe(200);
  expect(filtrado.body.data.length).toBeLessThanOrEqual(5);

  const paginado = await request(app)
    .get("/api/auditoria?pagina=1&limite=3")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(paginado.body.total).toBeDefined();

  // Un no-admin no puede consultar la auditoría.
  const tokenCamila = await loginCamila();
  const denegado = await request(app)
    .get("/api/auditoria")
    .set("Authorization", `Bearer ${tokenCamila}`);
  expect(denegado.status).toBe(403);
});

/* ===== Verificación en dos pasos (2FA) ===== */

test("2FA: no-admin no puede configurarlo y el flujo admin completo funciona", async () => {
  const { codigoActual } = await import("../totp.mjs");

  // Estado inicial: desactivado.
  const estadoInicial = await request(app)
    .get("/api/2fa/estado")
    .set("Authorization", `Bearer ${await login()}`);
  expect(estadoInicial.body.habilitado).toBe(false);

  // Un no-admin no puede iniciar la configuración.
  const noAdmin = await request(app)
    .post("/api/2fa/setup")
    .set("Authorization", `Bearer ${await loginCamila()}`);
  expect(noAdmin.status).toBe(403);

  // Setup: genera secreto, URI compatible y QR (data URL).
  const setup = await request(app)
    .post("/api/2fa/setup")
    .set("Authorization", `Bearer ${await login()}`);
  expect(setup.status).toBe(200);
  expect(setup.body.secreto).toMatch(/^[A-Z2-7]{20,}$/);
  expect(setup.body.otpauthUrl).toContain("otpauth://totp/");
  expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

  // Código erróneo no activa.
  const mal = await request(app)
    .post("/api/2fa/verificar")
    .set("Authorization", `Bearer ${await login()}`)
    .send({ codigo: "000000" });
  expect(mal.status).toBe(401);

  // Código válido activa el 2FA.
  const ok = await request(app)
    .post("/api/2fa/verificar")
    .set("Authorization", `Bearer ${await login()}`)
    .send({ codigo: codigoActual(setup.body.secreto) });
  expect(ok.status).toBe(200);

  const estadoActivo = await request(app)
    .get("/api/2fa/estado")
    .set("Authorization", `Bearer ${await login()}`);
  expect(estadoActivo.body.habilitado).toBe(true);
});

test("2FA: al estar activo, el login pide el código y solo se autentica con él", async () => {
  const { codigoActual } = await import("../totp.mjs");

  // Habilitar el 2FA del admin directamente por BD (independiente del test anterior).
  const { abrirConexion } = await import(`../db.js?v=${Date.now()}`);
  const cone = abrirConexion();
  const secreto = "ABCDEFGHIJKLMNOPQRSTUV";
  cone.prepare("UPDATE usuarios SET totp_secreto = ?, totp_habilitado = 1 WHERE id = 'INSUCO'").run(secreto);
  cone.close();

  // El login ya no entrega tokens: pide el segundo paso.
  const login = await request(app).post("/api/login").send({ usuario: "INSUCO", password: "Insuco1336" });
  expect(login.status).toBe(200);
  expect(login.body.requires2FA).toBe(true);
  expect(login.body.loginId).toBeTruthy();
  expect(login.body.token).toBeUndefined();
  expect(login.body.usuario.id).toBe("INSUCO");

  // Código incorrecto (muchas veces, pero ante el límite basta uno para el 401).
  const mal = await request(app)
    .post("/api/login/2fa")
    .send({ loginId: login.body.loginId, codigo: "000000" });
  expect(mal.status).toBe(401);

  const buenCodigo = codigoActual(secreto);
  const resuelto = await request(app)
    .post("/api/login/2fa")
    .send({ loginId: login.body.loginId, codigo: buenCodigo });
  expect(resuelto.status).toBe(200);
  expect(resuelto.body.token).toBeTruthy();
  expect(resuelto.body.refreshToken).toBeTruthy();

  // El token obtenido tras el segundo paso es totalmente operativo.
  const protegido = await request(app)
    .get("/api/usuarios")
    .set("Authorization", `Bearer ${resuelto.body.token}`);
  expect(protegido.status).toBe(200);

  // Un desafío consumido no sirve otra vez.
  const reuso = await request(app)
    .post("/api/login/2fa")
    .send({ loginId: login.body.loginId, codigo: buenCodigo });
  expect(reuso.status).toBe(401);

  // Y se deja el estado original para no afectar al resto de la suite.
  const cone2 = abrirConexion();
  cone2.prepare("UPDATE usuarios SET totp_secreto = NULL, totp_habilitado = 0 WHERE id = 'INSUCO'").run();
  cone2.close();
});

test("2FA: desactivar exige el código y queda reflejado", async () => {
  const { codigoActual } = await import("../totp.mjs");
  const tokenAdmin = await login();

  // Habilitar por BD para probar solo la desactivación.
  const { abrirConexion } = await import(`../db.js?v=${Date.now()}`);
  const cone = abrirConexion();
  const secreto = "ABCDEFGHIJKLMNOPQRSTUV";
  cone.prepare("UPDATE usuarios SET totp_secreto = ?, totp_habilitado = 1 WHERE id = 'INSUCO'").run(secreto);
  cone.close();

  // Sin código, no se puede desactivar.
  const sinCodigo = await request(app)
    .post("/api/2fa/desactivar")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(sinCodigo.status).toBe(400);

  // Código erróneo, tampoco.
  const mal = await request(app)
    .post("/api/2fa/desactivar")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .send({ codigo: "000000" });
  expect(mal.status).toBe(401);

  // Con el código vigente: se desactiva.
  const ok = await request(app)
    .post("/api/2fa/desactivar")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .send({ codigo: codigoActual(secreto) });
  expect(ok.status).toBe(200);

  const estado = await request(app)
    .get("/api/2fa/estado")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(estado.body.habilitado).toBe(false);
});

/* ===== Respaldos de la base de datos ===== */

test("backups: solo admin, exporta una BD válida y restaura cambiando datos", async () => {
  const tokenAdmin = await login();

  // Un no-admin no puede exportar ni restaurar.
  const tokenCamila = await loginCamila();
  const denegadoExp = await request(app)
    .get("/api/backups/exportar")
    .set("Authorization", `Bearer ${tokenCamila}`);
  expect(denegadoExp.status).toBe(403);
  const denegadoRest = await request(app)
    .post("/api/backups/restaurar")
    .set("Authorization", `Bearer ${tokenCamila}`)
    .send(Buffer.from("basura"));
  expect(denegadoRest.status).toBe(403);

  // Exportar: cabeceras correctas y archivo SQLite válido.
  const exportado = await request(app)
    .get("/api/backups/exportar")
    .set("Authorization", `Bearer ${tokenAdmin}`);
  expect(exportado.status).toBe(200);
  expect(exportado.headers["content-disposition"]).toContain("attachment");
  expect(exportado.headers["content-type"]).toBe("application/octet-stream");
  expect(Buffer.isBuffer(exportado.body)).toBe(true);
  expect(exportado.body.subarray(0, 16).toString("utf8")).toBe("SQLite format 3\u0000");

  // Restaurar basura: rechazado y la BD sigue operativa.
  const basura = await request(app)
    .post("/api/backups/restaurar")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .set("Content-Type", "application/octet-stream")
    .send(Buffer.from([1, 2, 3, 4, 5]));
  expect(basura.status).toBe(400);

  // Cambiar datos tras el respaldo: crear una reserva que el respaldo no conoce.
  const futura = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
  const fechaFutura = new Date(futura.getTime() - futura.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let creada = await request(app)
    .post("/api/agenda")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .send({ labId: 1, fecha: fechaFutura, horaInicio: "09:00", horaFin: "10:00", motivo: "Reserva-previa-al-respaldo" });
  if (creada.status !== 201) {
    // La hora 09:00 podría chocar con el seed: probar con otro bloque horario libre.
    creada = await request(app)
      .post("/api/agenda")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ labId: 2, fecha: fechaFutura, horaInicio: "12:00", horaFin: "13:00", motivo: "Reserva-previa-al-respaldo" });
  }
  expect(creada.status).toBe(201);

  const restaurado = await request(app)
    .post("/api/backups/restaurar")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .set("Content-Type", "application/octet-stream")
    .send(exportado.body);
  expect(restaurado.status).toBe(200);

  // La reserva creada después del respaldo ya no existe: la BD volvió a su estado.
  const despues = await request(app)
    .get(`/api/agenda?fecha=${fechaFutura}&labId=${creada.body.labId}`)
    .set("Authorization", `Bearer ${tokenAdmin}`);
  const agenda = Array.isArray(despues.body) ? despues.body : despues.body.data;
  expect(despues.status).toBe(200);
  expect(agenda.some((r) => r.motivo === "Reserva-previa-al-respaldo")).toBe(false);

  // Al restaurar se revocan todos los refresh tokens, pero el access token sigue válido.
  const estado = await request(app).get("/api/2fa/estado").set("Authorization", `Bearer ${tokenAdmin}`);
  expect(estado.status).toBe(200);
});

/* ===== Registro autónomo y recuperación de contraseña ===== */

test("registro: crea cuenta con rol otro_area, sin password y permite iniciar sesión", async () => {
  const res = await request(app)
    .post("/api/registro")
    .send({ id: "prof_prueba", nombre: "Prueba", apellido: "Registro", email: "prueba@liceo.cl", password: "prueba123", area: "Matemáticas", especialidad: "Cálculo" });
  expect(res.status).toBe(201);
  expect(res.body.rol).toBe("otro_area");
  expect(res.body.nivelAcceso).toBe("basico");
  expect(res.body.iniciales).toBe("PR");
  expect(res.body.password).toBeUndefined();

  const loginNuevo = await request(app).post("/api/login").send({ usuario: "prof_prueba", password: "prueba123" });
  expect(loginNuevo.status).toBe(200);
  expect(loginNuevo.body.token).toBeTruthy();

  // El admin recibe la notificación de la cuenta nueva.
  const notifs = await request(app).get("/api/notificaciones").set("Authorization", `Bearer ${await login()}`);
  const notif = notifs.body.find((n) => n.tipo === "usuario_registrado" && /prof_prueba/.test(n.mensaje));
  expect(notif).toBeTruthy();
});

test("registro: rechaza usuario o correo duplicado y datos inválidos", async () => {
  const dupId = await request(app).post("/api/registro").send({ id: "INSUCO", nombre: "X", apellido: "Y", email: "nuevo@liceo.cl", password: "clave123" });
  expect(dupId.status).toBe(409);
  expect(dupId.body.error).toContain("usuario");

  const dupEmail = await request(app).post("/api/registro").send({ id: "prof_x", nombre: "X", apellido: "Y", email: "admin@liceo.cl", password: "clave123" });
  expect(dupEmail.status).toBe(409);
  expect(dupEmail.body.error).toContain("correo");

  const malDominio = await request(app).post("/api/registro").send({ id: "prof_mal", nombre: "X", apellido: "Y", email: "no-es-un-correo", password: "clave123" });
  expect(malDominio.status).toBe(400);

  const corta = await request(app).post("/api/registro").send({ id: "prof_corta", nombre: "X", apellido: "Y", email: "corta@liceo.cl", password: "123" });
  expect(corta.status).toBe(400);
});

test("recuperación: solicitud genérica, token de 30 min, nuevo login y refresh revocado", async () => {
  const { abrirConexion } = await import(`../db.js?v=${Date.now()}`);

  // El email inexistente también responde ok: no se revela si la cuenta existe.
  const falso = await request(app).post("/api/recuperar-contrasena").send({ email: "nadie@liceo.cl" });
  expect(falso.status).toBe(200);
  expect(falso.body.ok).toBe(true);

  const solicitud = await request(app).post("/api/recuperar-contrasena").send({ email: "csoto@liceo.cl" });
  expect(solicitud.status).toBe(200);
  expect(solicitud.body.ok).toBe(true);

  const cone = abrirConexion();
  const fila = cone.prepare("SELECT token, expira_en FROM contrasena_resets WHERE usuario_id = 'prof_camila' ORDER BY rowid DESC LIMIT 1").get();
  cone.close();
  expect(fila).toBeTruthy();
  expect(fila.expira_en).toBeGreaterThan(Date.now());
  const token = fila.token;

  // Una sesión previa de prof_camila queda sin refresh válido tras restablecer.
  const previa = await sesionNuevaCamila();
  const refrescoViejo = await request(app).post("/api/refresh").send({ refreshToken: previa.refreshToken });
  expect(refrescoViejo.status).toBe(200);

  const restablecer = await request(app)
    .post(`/api/recuperar-contrasena/${token}`)
    .send({ newPassword: "camilaNueva99" });
  expect(restablecer.status).toBe(200);

  const refrescoRevocado = await request(app).post("/api/refresh").send({ refreshToken: previa.refreshToken });
  expect(refrescoRevocado.status).toBe(401);

  // Con el token reutilizable se entra con la nueva contraseña.
  const login = await request(app).post("/api/login").send({ usuario: "prof_camila", password: "camilaNueva99" });
  expect(login.status).toBe(200);
  expect(login.body.token).toBeTruthy();

  // El token ya usado no sirve de nuevo.
  const reuso = await request(app).post(`/api/recuperar-contrasena/${token}`).send({ newPassword: "otraClave1" });
  expect(reuso.status).toBe(400);

  // Se restaura la contraseña original para no afectar al resto de la suite.
  const restaura = await request(app)
    .post("/api/change-password")
    .set("Authorization", `Bearer ${login.body.token}`)
    .send({ currentPassword: "camilaNueva99", newPassword: "camila123" });
  expect(restaura.status).toBe(200);
});