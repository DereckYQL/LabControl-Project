/* Pruebas del motor de migraciones, de la semilla versionada y de la poda.
   Cada prueba trabaja sobre su propia base temporal (LC_DB_DIR), de modo que no
   tocan la base real del programa. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dirs = [];

function dirNuevo(prefijo) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefijo));
  dirs.push(d);
  return d;
}

function borrarDir(d) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    // Windows puede mantener el archivo de SQLite abierto hasta el cierre del
    // proceso; el directorio restante es inofensivo.
  }
}

afterAll(() => {
  for (const d of dirs) borrarDir(d);
});

/* Importa db.js contra un directorio concreto y devuelve sus exportaciones.
   El query de cache-busting fuerza una instancia nueva del módulo: cada una
   tiene su propia conexión y su propio juego de migraciones en memoria. */
async function cargarComo(prefijo) {
  const dir = dirNuevo(prefijo);
  process.env.LC_DB_DIR = dir;
  const mod = await import(`../db.js?v=${Date.now()}-${Math.random()}`);
  return { ...mod, dir };
}

const columnasDe = (d, tabla) => d.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
const existeTabla = (d, tabla) =>
  Boolean(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla));
const versionesDe = (d) =>
  d.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((r) => r.version);

/* ------------------------------------------------------------------ */
/* Migraciones reversibles                                              */
/* ------------------------------------------------------------------ */

test("las migraciones declaran su reversibilidad y su nota", async () => {
  const { MIGRACIONES } = await cargarComo("lc-mig-meta-");
  for (const m of MIGRACIONES) {
    expect(typeof m.version).toBe("number");
    expect(m.nombre).toBeTruthy();
    expect(typeof m.migrar).toBe("function");
    if (m.revertir) {
      expect(typeof m.revertir).toBe("function");
    } else {
      // Una irreversible tiene que explicar por qué: sin la nota, el rollback
      // fallaría sin decir nada útil.
      expect(m.nota).toBeTruthy();
    }
  }
  // Sin paso de vuelta están exactamente la 3, la 4, la 9 y la 10.
  expect(MIGRACIONES.filter((m) => !m.revertir).map((m) => m.version).sort((a, b) => a - b))
    .toEqual([3, 4, 9, 10]);
});

test("las migraciones se aplican en orden y quedan registradas", async () => {
  const { db, estadoMigraciones } = await cargarComo("lc-mig-orden-");
  try {
    expect(versionesDe(db)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(estadoMigraciones(db)).toMatchObject({ faltantes: [], aplicadas: [2, 3, 4, 5, 6, 7, 8, 9, 10] });
    // Y la base recién creada cumple el contrato de datos de la aplicación.
    expect(columnasDe(db, "reportes")).toContain("adjuntos");
    expect(columnasDe(db, "laboratorios")).toContain("imagenes");
    expect(existeTabla(db, "refresh_tokens")).toBe(true);
    expect(existeTabla(db, "auditoria")).toBe(true);
    expect(existeTabla(db, "solicitudes_especialidad")).toBe(true);
    expect(existeTabla(db, "contrasena_resets")).toBe(true);
  } finally {
    db.close();
  }
});

test("rollback: sin `forzar` se detiene en la primera irreversible y no toca nada", async () => {
  const { db, revertirMigraciones } = await cargarComo("lc-mig-alto-");
  try {
    // La 10 (alineación de columnas) no tiene paso de vuelta: cualquier objetivo
    // por debajo de 10 se topa con ella antes de revertir nada.
    await expect(revertirMigraciones(db, 9)).rejects.toThrow(/migración 10/);
    expect(versionesDe(db)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  } finally {
    db.close();
  }
});

test("rollback: con `forzar` baja hasta el objetivo pedido y ni una más", async () => {
  const { db, revertirMigraciones } = await cargarComo("lc-mig-forzar-");
  try {
    const revertidas = await revertirMigraciones(db, 6, { forzar: true });

    // La 10 y la 9 solo se "olvidan" (no tienen vuelta que ejecutar); la 8 y la
    // 7 sí se deshacen de verdad.
    expect(revertidas).toEqual([10, 9, 8, 7]);
    expect(versionesDe(db)).toEqual([2, 3, 4, 5, 6]);
    expect(existeTabla(db, "auditoria")).toBe(false);
    expect(columnasDe(db, "usuarios")).not.toContain("totp_secreto");
    // La 6 sigue aplicada: no se pasó del objetivo.
    expect(existeTabla(db, "refresh_tokens")).toBe(true);
  } finally {
    db.close();
  }
});

test("rollback: la 5 se deshace sin dejar la referencia de notificaciones colgando", async () => {
  const { db, revertirMigraciones } = await cargarComo("lc-mig-v5-");
  try {
    db.prepare(
      "INSERT INTO solicitudes_especialidad (usuario_id, especialidad_actual, especialidad_solicitada, estado) VALUES ('prof_juan','A','B','pendiente')"
    ).run();
    const id = db.prepare("SELECT id FROM solicitudes_especialidad").get().id;
    db.prepare(
      "INSERT INTO notificaciones (usuario_id, tipo, titulo, solicitud_id) VALUES ('prof_juan','info','Cambio de especialidad',?)"
    ).run(id);

    const revertidas = await revertirMigraciones(db, 4, { forzar: true });
    expect(revertidas).toEqual([10, 9, 8, 7, 6, 5]);
    expect(existeTabla(db, "solicitudes_especialidad")).toBe(false);
    expect(columnasDe(db, "notificaciones")).not.toContain("solicitud_id");
    // Con foreign_keys activo, si la tabla se borrara antes de soltar la
    // columna el DROP fallaría: comprueba que la base quedó sana.
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA quick_check").all()[0].quick_check).toBe("ok");
    expect(versionesDe(db)).toEqual([2, 3, 4]);
  } finally {
    db.close();
  }
});

test("rollback: es idempotente (revertir dos veces no cambia la segunda)", async () => {
  const { db, revertirMigraciones } = await cargarComo("lc-mig-idem-");
  try {
    const primera = await revertirMigraciones(db, 6, { forzar: true });
    const segunda = await revertirMigraciones(db, 6, { forzar: true });
    expect(primera).toEqual([10, 9, 8, 7]);
    expect(segunda).toEqual([]);
    expect(versionesDe(db)).toEqual([2, 3, 4, 5, 6]);
    // Y pedir el estado actual no hace nada.
    expect(await revertirMigraciones(db, 9, { forzar: true })).toEqual([]);
  } finally {
    db.close();
  }
});

test("rollback: si un paso de vuelta falla, se deshacen también los anteriores", async () => {
  const { db, revertirMigraciones } = await cargarComo("lc-mig-fallo-");
  try {
    // Se crea un índice sobre una columna que la reversión de la 7 intenta
    // eliminar. SQLite no permite quitar una columna indexada, así que el paso
    // de vuelta falla DESPUÉS de haber deshecho la 10, la 9 y la 8: ninguna de
    // las tres puede quedar a medias.
    db.exec("CREATE INDEX idx_prueba_totp ON usuarios(totp_habilitado)");

    await expect(revertirMigraciones(db, 6, { forzar: true })).rejects.toThrow(
      /Falló la reversión de la migración 7/
    );

    expect(versionesDe(db)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(existeTabla(db, "contrasena_resets")).toBe(true);
    expect(existeTabla(db, "auditoria")).toBe(true);
    expect(columnasDe(db, "usuarios")).toContain("totp_secreto");
    const indices = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'auditoria'"
    ).all().map((r) => r.name);
    expect(indices).toContain("idx_auditoria_fecha");
    expect(indices).toContain("idx_auditoria_usuario");

    // Quitado el obstáculo, la reversión vuelve a funcionar y completa el camino.
    db.exec("DROP INDEX idx_prueba_totp");
    const revertidas = await revertirMigraciones(db, 6, { forzar: true });
    expect(revertidas).toEqual([10, 9, 8, 7]);
    expect(versionesDe(db)).toEqual([2, 3, 4, 5, 6]);
  } finally {
    db.close();
  }
});

test("aplicar migraciones: completa huecos en schema_migrations en vez de saltarlos", async () => {
  const dir = dirNuevo("lc-mig-hueco-");
  const ruta = path.join(dir, "labcontrol.db");
  // Se simula una base a medio migrar: constan 2, 3 y 5, falta la 4.
  const previa = new DatabaseSync(ruta);
  previa.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, nombre TEXT NOT NULL, aplicada_en TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (2,'a','2020-01-01'),(3,'b','2020-01-01'),(5,'c','2020-01-01');
  `);
  previa.close();

  process.env.LC_DB_DIR = dir;
  const { db, estadoMigraciones } = await import(`../db.js?v=${Date.now()}-${Math.random()}`);
  try {
    // Fiarse solo de MAX(version) habría dejado la 4 sin aplicar para siempre;
    // el motor la completa porque compara el conjunto, no el máximo.
    expect(versionesDe(db)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(estadoMigraciones(db).faltantes).toEqual([]);
  } finally {
    db.close();
  }
});

test("aplicar migraciones: una base más nueva que el programa se rechaza con un mensaje claro", async () => {
  const dir = dirNuevo("lc-mig-nueva-");
  const ruta = path.join(dir, "labcontrol.db");
  const previa = new DatabaseSync(ruta);
  previa.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, nombre TEXT NOT NULL, aplicada_en TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (2,'a','2030-01-01'),(99,'del futuro','2030-01-01');
  `);
  previa.close();

  process.env.LC_DB_DIR = dir;
  // Importar db.js debe fallar: es mejor no arrancar que escribir sobre un
  // esquema de una versión que este programa no conoce.
  await expect(import(`../db.js?v=${Date.now()}-${Math.random()}`)).rejects.toThrow(/esquema 99/);
});

test("migración 10: repara una base que dice estar al día pero perdió una columna del esquema", async () => {
  const dir = dirNuevo("lc-mig-repara-");
  process.env.LC_DB_DIR = dir;
  // Base completa creada por el propio programa (esquema y semilla al día).
  const inicial = await import(`../db.js?v=${Date.now()}-${Math.random()}`);
  inicial.db.close();

  // Se simula el caso que se vio en producción: una base cuyo
  // `schema_migrations` está al día pero cuya tabla `laboratorios` no tiene
  // `imagenes`, columna que el esquema actual declara y que la semilla escribe.
  // En estas bases el programa ni siquiera arrancaba ("no such column").
  const ruta = path.join(dir, "labcontrol.db");
  const manipulada = new DatabaseSync(ruta);
  manipulada.exec("ALTER TABLE laboratorios DROP COLUMN imagenes");
  manipulada.exec("DELETE FROM schema_migrations WHERE version = 10");
  manipulada.close();

  // Reabrir: la 10 se aplica de nuevo, devuelve la columna y arranca.
  const reparada = await import(`../db.js?v=${Date.now()}-${Math.random()}`);
  try {
    expect(columnasDe(reparada.db, "laboratorios")).toContain("imagenes");
    expect(versionesDe(reparada.db)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(reparada.estadoMigraciones(reparada.db).faltantes).toEqual([]);
    // La semilla sigue funcionando sobre la base reparada y es idempotente.
    const resumen = await reparada.aplicarSemilla(reparada.db);
    expect(resumen).toMatchObject({ labs: 0, equipos: 0, usuarios: 0, agenda: 0, reportes: 0 });
  } finally {
    reparada.db.close();
  }
});

test("migración 10: en una base sana no encuentra columnas que añadir", async () => {
  const { db } = await cargarComo("lc-mig-sana-");
  try {
    // Abrir la base ya aplicó la 10; al reentrar en estado no debe cambiar nada
    // ni fallar (la comparación contra el esquema canónico no tiene fugas).
    const migracion = db.prepare("SELECT version FROM schema_migrations WHERE version = 10").get();
    expect(migracion).toBeTruthy();
    expect(columnasDe(db, "laboratorios")).toContain("imagenes");
  } finally {
    db.close();
  }
});

/* ------------------------------------------------------------------ */
/* Semilla versionada e idempotente                                     */
/* ------------------------------------------------------------------ */

test("semilla: es idempotente, ejecutarla dos veces no cambia nada", async () => {
  const { db, aplicarSemilla, SEMILLA_VERSION } = await cargarComo("lc-seed-idem-");
  try {
    const totalUsuarios = db.prepare("SELECT COUNT(*) AS n FROM usuarios").get().n;
    const totalEquipos = db.prepare("SELECT COUNT(*) AS n FROM equipos").get().n;
    const totalReportes = db.prepare("SELECT COUNT(*) AS n FROM reportes").get().n;

    const segunda = await aplicarSemilla(db);
    // Ni una inserción, ni una ficha "completada": la segunda pasada no tiene
    // nada que hacer. (SQLite cuenta como modificadas las filas que toca la
    // sentencia aunque el valor no cambie; el motor filtra con un WHERE para
    // que este contador signifique algo.)
    expect(segunda).toMatchObject({
      labs: 0, equipos: 0, usuarios: 0, agenda: 0, reportes: 0, completados: 0
    });

    expect(db.prepare("SELECT COUNT(*) AS n FROM usuarios").get().n).toBe(totalUsuarios);
    expect(db.prepare("SELECT COUNT(*) AS n FROM equipos").get().n).toBe(totalEquipos);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reportes").get().n).toBe(totalReportes);

    // Y queda registrada una sola vez, con su versión.
    const historial = db.prepare("SELECT version FROM seed_history ORDER BY version").all().map((r) => r.version);
    expect(historial).toEqual([SEMILLA_VERSION]);
  } finally {
    db.close();
  }
});

test("semilla: rellena lo que faltaba sin pisar lo editado", async () => {
  const { db, aplicarSemilla } = await cargarComo("lc-seed-actualiza-");
  try {
    // El administrador edita el laboratorio 1, deja un campo vacío y da de baja
    // una cuenta; además borra un equipo.
    db.prepare("UPDATE laboratorios SET nombre = 'Sala EDITADA', descripcion = NULL WHERE id = 1").run();
    db.prepare("UPDATE usuarios SET nombre = 'Nombre EDITADO', area = NULL WHERE id = 'prof_juan'").run();
    db.prepare("UPDATE usuarios SET activo = 0 WHERE id = 'prof_camila'").run();
    db.prepare("DELETE FROM equipos WHERE id = '1-PC01'").run();

    const resumen = await aplicarSemilla(db);
    expect(resumen.completados).toBeGreaterThan(0);
    expect(resumen.equipos).toBe(1);

    const lab = db.prepare("SELECT nombre, descripcion FROM laboratorios WHERE id = 1").get();
    expect(lab.nombre).toBe("Sala EDITADA"); // lo editado se respeta…
    expect(lab.descripcion).toBeTruthy(); // …y lo vacío se completa

    const juan = db.prepare("SELECT nombre, area, activo FROM usuarios WHERE id = 'prof_juan'").get();
    expect(juan.nombre).toBe("Nombre EDITADO");
    expect(juan.area).toBe("Programación");

    // La semilla nunca reactiva una cuenta que el administrador dio de baja.
    expect(db.prepare("SELECT activo FROM usuarios WHERE id = 'prof_camila'").get().activo).toBe(0);
    // El equipo borrado vuelve a crearse.
    expect(db.prepare("SELECT id FROM equipos WHERE id = '1-PC01'").get()).toBeTruthy();
  } finally {
    db.close();
  }
});

test("semilla: no toca la configuración que ya existe", async () => {
  const { db, aplicarSemilla } = await cargarComo("lc-seed-config-");
  try {
    db.prepare("UPDATE config SET data = ? WHERE id = 1")
      .run(JSON.stringify({ sitio: { nombreSistema: "Nombre EDITADO" } }));
    await aplicarSemilla(db);
    const cfg = JSON.parse(db.prepare("SELECT data FROM config WHERE id = 1").get().data);
    expect(cfg.sitio.nombreSistema).toBe("Nombre EDITADO");
  } finally {
    db.close();
  }
});

test("semilla: crea la cuenta de administrador con la contraseña hasheada", async () => {
  const { db } = await cargarComo("lc-seed-admin-");
  try {
    const admin = db.prepare("SELECT password, rol, nivel_acceso FROM usuarios WHERE id = 'INSUCO'").get();
    expect(admin.rol).toBe("admin");
    expect(admin.nivel_acceso).toBe("total");
    // bcrypt, pero asíncrono: el resultado sigue siendo un hash bcrypt válido.
    expect(String(admin.password)).toMatch(/^\$2[aby]\$\d{2}\$/);
  } finally {
    db.close();
  }
});

/* ------------------------------------------------------------------ */
/* Poda de tablas que crecen sin cota                                    */
/* ------------------------------------------------------------------ */

test("poda: acota auditoría, notificaciones, sesiones, solicitudes y reseteos", async () => {
  const { db, podarTablas } = await cargarComo("lc-poda-");
  try {
    const ahora = Date.now();
    // Todo el montaje va en una transacción: son ~35 000 filas y a una en una
    // la prueba tardaría minutos.
    db.exec("BEGIN");
    for (let i = 0; i < 5200; i++) {
      db.prepare("INSERT INTO auditoria (fecha, usuario_id, rol, accion, detalle, ip) VALUES (?,?,?,?,?,?)")
        .run("2026-01-01T00:00:00.000Z", null, "admin", "prueba", "{}", "127.0.0.1");
    }
    for (let i = 0; i < 20100; i++) {
      db.prepare("INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, fecha, leida) VALUES (?,?,?,?,?,0)")
        .run("INSUCO", "aviso", `n${i}`, "", "2026-01-01");
    }
    for (let i = 0; i < 30; i++) {
      db.prepare("INSERT INTO refresh_tokens (id, usuario_id, creado_en, expira_en, revocado) VALUES (?,?,?,?,0)")
        .run(`t${i}`, "INSUCO", ahora, ahora - 1000);
    }
    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO contrasena_resets (token, usuario_id, expira_en, usado) VALUES (?,?,?,0)")
        .run(`r${i}`, "INSUCO", ahora - 1000);
    }
    // 250 solicitudes del mismo usuario: 125 pendientes y 125 resueltas, para
    // que el tope de 100 resueltas por usuario tenga algo que recortar.
    for (let i = 0; i < 250; i++) {
      db.prepare(
        "INSERT INTO solicitudes_especialidad (usuario_id, especialidad_actual, especialidad_solicitada, estado, creada_en) VALUES (?,?,?,?,?)"
      ).run("prof_juan", "A", `B${i}`, i % 2 === 0 ? "pendiente" : "aceptada", "2026-01-01");
    }
    db.exec("COMMIT");

    const primera = podarTablas(db);
    expect(primera).toBeTruthy();
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria").get().n).toBe(5000);
    expect(db.prepare("SELECT COUNT(*) AS n FROM notificaciones").get().n).toBe(20000);
    // Vencidos y sin límite de uno vivo: se van todos.
    expect(db.prepare("SELECT COUNT(*) AS n FROM refresh_tokens").get().n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM contrasena_resets").get().n).toBe(0);
    // De las 250 solicitudes se quedan las 125 pendientes y las 100 resueltas
    // más recientes. Lo que de verdad importa es que no se pierda ninguna
    // pendiente, aunque el usuario tenga muchísimas.
    expect(db.prepare("SELECT COUNT(*) AS n FROM solicitudes_especialidad WHERE estado = 'pendiente'").get().n)
      .toBe(125);
    expect(db.prepare("SELECT COUNT(*) AS n FROM solicitudes_especialidad").get().n).toBe(225);

    // Segunda pasada: ya no hay nada que borrar, la poda es idempotente.
    expect(podarTablas(db)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria").get().n).toBe(5000);
  } finally {
    db.close();
  }
});
