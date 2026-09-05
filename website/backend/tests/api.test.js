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

async function login() {
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
  const token = await login();
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