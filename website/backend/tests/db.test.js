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
  expect(versiones).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const columnas = db
    .prepare("PRAGMA table_info(reportes)")
    .all()
    .map((c) => c.name);
  expect(columnas).toContain("adjuntos");

  const tablaRefresh = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'refresh_tokens'")
    .get();
  expect(tablaRefresh).toBeTruthy();

  const tablaResets = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contrasena_resets'")
    .get();
  expect(tablaResets).toBeTruthy();

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
  expect(versiones).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const admin = db.prepare("SELECT password FROM usuarios WHERE id = 'INSUCO'").get();
  expect(String(admin.password)).toMatch(/^\$2[ab]\$/);
});

test("los laboratorios tienen la ficha real de inventario", async () => {
  const { default: db } = await import(`../db.js?v=${Date.now()}`);

  const labs = db
    .prepare("SELECT id, nombre, equipos, so, servicios FROM laboratorios ORDER BY id")
    .all()
    .map((l) => ({
      id: l.id,
      nombre: l.nombre,
      equipos: l.equipos,
      so: l.so,
      servicios: JSON.parse(l.servicios || "[]"),
    }));

  expect(labs).toEqual([
    { id: 1, nombre: "LAB COMP 1", equipos: 30, so: "Windows 11 Pro", servicios: ["Pizarra", "Proyectos"] },
    { id: 2, nombre: "LAB COMP 2", equipos: 27, so: "Windows 11 Pro", servicios: ["Pizarra", "Proyector"] },
    { id: 3, nombre: "LAB CIENCIAS", equipos: 23, so: "Linux Mint", servicios: ["Pizarra"] },
    { id: 4, nombre: "LAB COMP 4", equipos: 28, so: "Windows 11 Pro", servicios: ["Pizarra"] },
    { id: 5, nombre: "LAB COMP 5", equipos: 30, so: "Linux Mint y Windows 10", servicios: ["Pizarra", "Proyector"] },
  ]);

  // La lista de equipos debe cuadrar con la cantidad declarada por laboratorio.
  for (const l of labs) {
    const n = db
      .prepare("SELECT COUNT(*) AS n FROM equipos WHERE lab_id = ?")
      .get(l.id).n;
    expect(Number(n)).toBe(l.equipos);
  }

  const soDistintos = db
    .prepare("SELECT COUNT(DISTINCT so) AS n FROM equipos")
    .get().n;
  expect(Number(soDistintos)).toBeGreaterThan(1);
});