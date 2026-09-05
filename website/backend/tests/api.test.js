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

afterAll(() => {
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

test("autenticación: rechaza credenciales incorrectas (401)", async () => {
  const res = await request(app).post("/api/login").send({ usuario: "INSUCO", password: "incorrecta" });
  expect(res.status).toBe(401);
});

test("autenticación: login correcto devuelve token y sin password", async () => {
  const res = await request(app).post("/api/login").send({ usuario: "INSUCO", password: "Insuco1336" });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
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