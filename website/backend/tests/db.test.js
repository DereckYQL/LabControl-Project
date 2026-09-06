import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-db-"));
  process.env.LC_DB_DIR = dir;
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

test("BD nueva: crea esquema, aplica migraciones y hace seed", async () => {
  const { default: db } = await import(`../db.js?v=${Date.now()}`);
  const versiones = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((r) => r.version);
  expect(versiones).toEqual([2, 3, 4, 5, 6]);

  const columnas = db
    .prepare("PRAGMA table_info(reportes)")
    .all()
    .map((c) => c.name);
  expect(columnas).toContain("adjuntos");

  const tablaRefresh = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'refresh_tokens'")
    .get();
  expect(tablaRefresh).toBeTruthy();

  const notifCols = db
    .prepare("PRAGMA table_info(notificaciones)")
    .all()
    .map((c) => c.name);
  expect(notifCols).toContain("solicitud_id");

  const tablaSolicitudes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'solicitudes_especialidad'")
    .get();
  expect(tablaSolicitudes).toBeTruthy();

  const admin = db.prepare("SELECT password, rol FROM usuarios WHERE id = 'INSUCO'").get();
  expect(admin.rol).toBe("admin");
  expect(String(admin.password)).toMatch(/^\$2[ab]\$/);

  const labs = db.prepare("SELECT COUNT(*) AS n FROM laboratorios").get().n;
  expect(Number(labs)).toBeGreaterThanOrEqual(1);

  const configEquipos = JSON.parse(
    db.prepare("SELECT data FROM config WHERE id = 1").get().data
  ).equipos;
  expect(configEquipos).toMatchObject({
    habilitarControlRemoto: true,
    apagadoAutomatico: false,
    monitoreoTiempoReal: true,
    intervaloEncendido: 30,
  });
});

test("es idempotente: reabrir la misma BD no re-aplica migraciones", async () => {
  const { default: db } = await import(`../db.js?v=${Date.now()}`);
  const versiones = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((r) => r.version);
  expect(versiones).toEqual([2, 3, 4, 5, 6]);

  const admin = db.prepare("SELECT password FROM usuarios WHERE id = 'INSUCO'").get();
  expect(String(admin.password)).toMatch(/^\$2[ab]\$/);
});