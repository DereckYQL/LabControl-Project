/* db.js — conexión SQLite (node:sqlite), esquema, migraciones y datos de ejemplo. */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// LC_DB_DIR permite apuntar la base a otra carpeta (lo usan los tests).
const DB_DIR = process.env.LC_DB_DIR
  ? path.resolve(process.env.LC_DB_DIR)
  : path.join(__dirname, "database");
const DB_PATH = path.join(DB_DIR, "labcontrol.db");
const esNueva = !fs.existsSync(DB_PATH);

fs.mkdirSync(DB_DIR, { recursive: true });

let db = null;
// `true` mientras se reemplaza la base por un respaldo: durante esa ventana la
// conexión vigente se cierra y cualquier petición que toque la base debe
// recibir 503 en lugar de un error 500.
let reemplazando = false;
// Ganchos que el servidor registra para purgar su estado en memoria (desafíos
// 2FA) cuando la base se sustituye por una de otra versión.
const ganchosAlRestaurar = new Set();

// ¿La base está disponible para atender peticiones?
export function baseDisponible() {
  return db !== null && !reemplazando;
}

// Registra una función que se ejecutará tras restaurar un respaldo.
export function alRestaurar(fn) {
  ganchosAlRestaurar.add(fn);
}

const PREFIJO_TEMPORAL = ".labcontrol-temporal-";
const rutaTemporal = (sufijo) => path.join(DB_DIR, `${PREFIJO_TEMPORAL}${sufijo}`);

// Borra los temporales que hubiera dejado una restauración interrumpida, para
// que un corte de luz no ensucie la carpeta de datos (idempotente).
function limpiarTemporales() {
  try {
    for (const nombre of fs.readdirSync(DB_DIR)) {
      if (nombre.startsWith(PREFIJO_TEMPORAL)) {
        try { fs.rmSync(path.join(DB_DIR, nombre), { force: true }); } catch { /* en uso */ }
      }
    }
  } catch { /* la carpeta puede no existir todavía */ }
}

// Abre una base, aplica esquema y migraciones y devuelve la conexión lista.
// Es async porque `aplicarMigraciones` puede necesitar bcrypt al adaptar una
// base antigua; separarla de la inicialización permite reabrir la base tras un
// respaldo y preparar una copia temporal antes de sustituir la original.
async function abrirConexion(ruta = DB_PATH) {
  const d = new DatabaseSync(ruta);
  // journal DELETE (sin WAL): la app es de un único proceso/usuario y así se
  // evita que Windows deje handles de -wal/-shm que bloquean copias/restauros.
  d.exec("PRAGMA journal_mode = DELETE");
  d.exec("PRAGMA foreign_keys = ON");
  // Windows libera handles con retardo; esperar en lugar de fallar.
  d.exec("PRAGMA busy_timeout = 15000");
  crearEsquema(d);
  await aplicarMigraciones(d);
  return d;
}

/* Esquema */

// Todo el esquema se crea dentro de una transacción: si una sentencia falla, no
// queda una base con la mitad de las tablas (antes el `exec` dejaba lo que
// hubiera aplicado hasta el error).
function crearEsquema(sesion) {
  sesion.exec("BEGIN");
  try {
    sesion.exec(`
CREATE TABLE IF NOT EXISTS laboratorios (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT NOT NULL,
  sala            TEXT NOT NULL,
  ubicacion       TEXT,
  equipos         INTEGER NOT NULL DEFAULT 0,
  estado          TEXT NOT NULL DEFAULT 'disponible',
  so              TEXT,
  procesador      TEXT,
  ram             TEXT,
  almacenamiento  TEXT,
  red             TEXT,
  responsable     TEXT,
  responsable_id  TEXT,
  horario         TEXT,
  servicios       TEXT DEFAULT '[]',
  descripcion     TEXT,
  foto            TEXT,
  imagenes        TEXT DEFAULT '[]',
  pos_x INTEGER, pos_y INTEGER, pos_w INTEGER, pos_h INTEGER
);

CREATE TABLE IF NOT EXISTS equipos (
  id                TEXT PRIMARY KEY,
  lab_id            INTEGER NOT NULL REFERENCES laboratorios(id) ON DELETE CASCADE,
  nombre            TEXT,
  tipo              TEXT,
  fabricante        TEXT,
  modelo            TEXT,
  serie             TEXT,
  procesador        TEXT,
  ram               TEXT,
  almacenamiento    TEXT,
  so                TEXT,
  ip                TEXT,
  mac               TEXT,
  monitor           TEXT,
  teclado           TEXT,
  mouse             TEXT,
  estado            TEXT DEFAULT 'activo',
  ultimo_encendido  TEXT,
  observaciones     TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  apellido      TEXT NOT NULL,
  iniciales     TEXT,
  email         TEXT UNIQUE,
  password      TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'otro_area',
  area          TEXT,
  especialidad  TEXT,
  nivel_acceso  TEXT DEFAULT 'basico',
  activo        INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS agenda (
  id           TEXT PRIMARY KEY,
  lab_id       INTEGER NOT NULL REFERENCES laboratorios(id) ON DELETE CASCADE,
  usuario_id   TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha        TEXT,
  hora_inicio  TEXT,
  hora_fin     TEXT,
  motivo       TEXT,
  estado       TEXT DEFAULT 'pendiente'
);

CREATE TABLE IF NOT EXISTS reportes (
  id            TEXT PRIMARY KEY,
  tipo          TEXT,
  titulo        TEXT,
  descripcion   TEXT,
  fecha         TEXT,
  generado_por  TEXT REFERENCES usuarios(id),
  datos         TEXT DEFAULT '{}',
  adjuntos      TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,
  titulo       TEXT NOT NULL,
  mensaje      TEXT,
  reporte_id   TEXT,
  fecha        TEXT,
  leida        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS config (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  data  TEXT NOT NULL
);

-- Registro de qué semilla de datos de ejemplo se ha aplicado (ver SEMILLA).
CREATE TABLE IF NOT EXISTS seed_history (
  version     INTEGER PRIMARY KEY,
  aplicada_en TEXT NOT NULL,
  resumen     TEXT DEFAULT ''
);
`);
    sesion.exec("COMMIT");
  } catch (err) {
    sesion.exec("ROLLBACK");
    throw err;
  }
}

/* Migraciones (cada una se aplica una sola vez) */
//
// Cada migración declara:
//   version    número de esquema que introduce (orden de aplicación)
//   nombre     descripción legible (queda en `schema_migrations`)
//   migrar(d)  qué hace al subir; puede ser async
//   revertir(d) qué hace al bajar. Si no existe o `reversible: false`, la
//              migración se considera irreversible: no se puede deshacer porque
//              transformó datos que ya no se pueden recuperar, y el rollback se
//              detiene ahí en lugar de dejar la base a medias.
//   nota       por qué es irreversible, o qué se pierde al revertirla.
//
// El motor usa SAVEPOINT en lugar de BEGIN/COMMIT para poder envolver cada
// migración aunque ya haya una transacción abierta, y comprueba versión a
// versión en lugar de fiarse solo de MAX(version): así un hueco en
// `schema_migrations` (por ejemplo, una copia parcial) se completa en vez de
// saltarse migraciones enteras.

const CONFIG_DEFAULT = {
  sitio: { nombreInstitucion: "Instituto Superior de Comercio", nombreSistema: "LabControl", logo: "", tema: "claro", idioma: "es" },
  red: { subredLabs: "192.168.10.0/24", servidorDNS: "192.168.1.1", puertaEnlace: "192.168.1.254", wifiHabilitado: true },
  notificaciones: { emailAdmin: "admin@liceo.cl", alertaFallas: true, alertaDisponibilidad: true, alertaReservas: true, alertaReportes: true, alertaSolicitudes: true, alertaNuevosUsuarios: true, recordatorioReserva: false },
  seguridad: { sesionTimeout: 30, intentosLoginMax: 5, registroActividad: true },
  laboratorios: { horaApertura: "07:30", horaCierre: "18:00", permitirReservaExterna: true, anticipacionMaxReserva: 7 },
  equipos: { habilitarControlRemoto: true, apagadoAutomatico: false, monitoreoTiempoReal: true, intervaloEncendido: 30 }
};

/* Ficha de los laboratorios (única fuente de verdad) */

// `so`, `equipos` y `servicios` provienen del documento de inventario de
// laboratorios. Sala, ubicación, hardware, responsable y horario se conservan
// tal como estaban.
const LABORATORIOS = [
  {
    id: 1, nombre: "Laboratorio 1", sala: "Sala B-201", ubicacion: "Segundo piso, ala B",
    equipos: 30, estado: "disponible", so: "Windows 11 Pro", procesador: "Intel Core i5-10400",
    ram: "8 GB DDR4", almacenamiento: "512 GB SSD", red: "Conectado a la red interna (VLAN 10)",
    responsable: "Juan Pérez", responsableId: "prof_juan", horario: "07:30 - 18:00",
    servicios: ["Pizarra", "Proyectos"],
    descripcion: "Laboratorio equipado para clases de informática, programación, ofimática y navegación segura.",
    foto: "assets/lab-generico.svg", posicion: { x: 20, y: 60, w: 180, h: 120 },
    imagenes: ["img/labs/Trasera_lab1.jpg", "img/labs/Frontal_lab1.jpg"]
  },
  {
    id: 2, nombre: "Laboratorio 2", sala: "Sala B-202", ubicacion: "Segundo piso, ala B",
    equipos: 27, estado: "disponible", so: "Windows 11 Pro", procesador: "Intel Core i5-10400",
    ram: "8 GB DDR4", almacenamiento: "512 GB SSD", red: "Conectado a la red interna (VLAN 10)",
    responsable: "Ana López", responsableId: "prof_ana", horario: "07:30 - 18:00",
    servicios: ["Pizarra", "Proyector"],
    descripcion: "Laboratorio de uso general para asignaturas de la carrera de Programación.",
    foto: "assets/lab-generico.svg", posicion: { x: 220, y: 60, w: 180, h: 120 },
    imagenes: ["img/labs/Trasero Derecho_lab2.png", "img/labs/Frontal Derecho_lab2.png"]
  },
  {
    id: 3, nombre: "Laboratorio 3", sala: "Sala B-203", ubicacion: "Segundo piso, ala B",
    equipos: 23, estado: "ocupado", so: "Linux Mint", procesador: "Intel Core i5-10400",
    ram: "8 GB DDR4", almacenamiento: "256 GB SSD", red: "Conectado a la red interna (VLAN 10)",
    responsable: "Diego Rojas", responsableId: "prof_diego", horario: "08:00 - 17:00",
    servicios: ["Pizarra"],
    descripcion: "Laboratorio orientado a programación y entornos Linux.",
    foto: "assets/lab-generico.svg", posicion: { x: 420, y: 60, w: 180, h: 120 },
    imagenes: ["img/labs/Trasera_lab3.jpg", "img/labs/Frontal_lab3.jpg"]
  },
  {
    id: 4, nombre: "Laboratorio 4", sala: "Sala B-205", ubicacion: "Segundo piso, ala B",
    equipos: 28, estado: "mantencion", so: "Windows 11 Pro", procesador: "Intel Core i3-10100",
    ram: "8 GB DDR4", almacenamiento: "256 GB SSD", red: "Conectado a la red interna (VLAN 10)",
    responsable: "Camila Soto", responsableId: "prof_camila", horario: "07:30 - 18:00",
    servicios: ["Pizarra"],
    descripcion: "Laboratorio de apoyo para talleres y evaluaciones prácticas.",
    foto: "assets/lab-generico.svg", posicion: { x: 620, y: 60, w: 150, h: 120 },
    imagenes: ["img/labs/Trasera_lab4.jpg", "img/labs/Frontal_lab4.jpg"]
  },
  {
    id: 5, nombre: "Laboratorio 5", sala: "Sala B-204", ubicacion: "Segundo piso, ala B",
    equipos: 30, estado: "disponible", so: "Linux Mint y Windows 10", procesador: "Intel Core i7-10700",
    ram: "16 GB DDR4", almacenamiento: "1 TB SSD NVMe", red: "Rack de switches y patch panel propio",
    responsable: "Juan Pérez", responsableId: "prof_juan", horario: "07:30 - 18:00",
    servicios: ["Pizarra", "Proyector"],
    descripcion: "Laboratorio con doble sistema operativo (Linux Mint y Windows 10) para clases de informática, ofimática y navegación segura.",
    foto: "assets/lab-generico.svg", posicion: { x: 220, y: 220, w: 180, h: 120 },
    imagenes: ["img/labs/Trasera_lab5.jpg", "img/labs/Frontal_lab5.jpg"]
  }
];

// Proyección de la ficha para poder aplicarla también sobre bases que ya existían.
const DATOS_INVENTARIO = LABORATORIOS.map((l) => ({
  id: l.id, nombre: l.nombre, equipos: l.equipos, so: l.so, servicios: l.servicios
}));

const TOTAL_EQUIPOS_INVENTARIO = LABORATORIOS.reduce((n, l) => n + l.equipos, 0);

// Desglose que usan los reportes de inventario de ejemplo (no son datos reales).
const INVENTARIO_EJEMPLO = { enFalla: 3, enMantencion: 1 };

// Fila de un equipo del laboratorio l, numerado desde 1 (PC-101, PC-102, …).
function datosEquipo(l, i) {
  const n = String(i).padStart(2, "0");
  return {
    id: `${l.id}-PC${n}`, lab_id: l.id, nombre: `PC-${l.id}${n}`,
    tipo: "Desktop", fabricante: "HP",
    modelo: i <= 10 ? "ProDesk 400 G7" : "EliteDesk 800 G6",
    serie: `SN${l.id}${String(1000 + i)}`,
    procesador: l.procesador, ram: l.ram, almacenamiento: l.almacenamiento, so: l.so,
    ip: `192.168.${10 + l.id}.${100 + i}`,
    mac: `AA:BB:CC:${String(l.id).padStart(2, "0")}:${n}:FF`,
    monitor: '22" Full HD', teclado: "USB estándar", mouse: "USB óptico",
    estado: i === 3 && l.id === 4 ? "falla" : l.estado === "mantencion" ? "mantencion" : "activo",
    ultimo_encendido: "2026-08-20 08:15",
    observaciones: i === 3 && l.id === 4 ? "Disco duro con sectores defectuosos" : ""
  };
}

const MIGRACIONES = [
  {
    version: 2,
    nombre: "columna adjuntos en reportes",
    migrar(d) {
      const columnas = d.prepare("PRAGMA table_info(reportes)").all();
      if (!columnas.some((c) => c.name === "adjuntos")) {
        d.exec("ALTER TABLE reportes ADD COLUMN adjuntos TEXT DEFAULT '[]'");
      }
    },
    revertir(d) {
      const columnas = d.prepare("PRAGMA table_info(reportes)").all();
      if (columnas.some((c) => c.name === "adjuntos")) {
        d.exec("ALTER TABLE reportes DROP COLUMN adjuntos");
      }
    },
    nota: "Se pierden los adjuntos guardados en los reportes."
  },
  {
    version: 3,
    nombre: "hashear contraseñas en texto plano con bcrypt",
    async migrar(d) {
      const usuarios = d.prepare("SELECT id, password FROM usuarios").all();
      for (const u of usuarios) {
        if (u.password && !u.password.startsWith("$2a$") && !u.password.startsWith("$2b$")) {
          // bcrypt asíncrono: hashear en bloque detendría el event loop.
          const hashed = await bcrypt.hash(u.password, 10);
          d.prepare("UPDATE usuarios SET password = ? WHERE id = ?").run(hashed, u.id);
        }
      }
    },
    reversible: false,
    nota: "No se puede deshacer: un hash bcrypt no permite recuperar el texto plano de la contraseña."
  },
  {
    version: 4,
    nombre: "completar configuracion por defecto (seccion equipos y claves nuevas)",
    migrar(d) {
      const fila = d.prepare("SELECT data FROM config WHERE id = 1").get();
      if (!fila) return;
      let actual = {};
      try { actual = JSON.parse(fila.data || "{}"); } catch (e) { actual = {}; }
      if (typeof actual !== "object" || actual === null) actual = {};
      let adicion = false;
      for (const [seccion, defs] of Object.entries(CONFIG_DEFAULT)) {
        const destino = (actual[seccion] && typeof actual[seccion] === "object") ? actual[seccion] : {};
        for (const [k, v] of Object.entries(defs)) {
          if (!(k in destino)) { destino[k] = v; adicion = true; }
        }
        actual[seccion] = destino;
      }
      if (adicion) {
        d.prepare("UPDATE config SET data = ? WHERE id = 1").run(JSON.stringify(actual));
      }
    },
    reversible: false,
    nota: "No se puede deshacer: las claves que añadió se mezclan con las que el administrador escribió después, así que no hay forma de saber cuáles retirar."
  },
  {
    version: 5,
    nombre: "solicitudes de cambio de especialidad (tabla nueva + enlace en notificaciones)",
    migrar(d) {
      d.exec(`
        CREATE TABLE IF NOT EXISTS solicitudes_especialidad (
          id                      INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id              TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          especialidad_actual     TEXT,
          especialidad_solicitada TEXT NOT NULL,
          estado                  TEXT NOT NULL DEFAULT 'pendiente',
          creada_en               TEXT,
          resuelta_por            TEXT REFERENCES usuarios(id),
          resuelta_en             TEXT
        )
      `);
      const columnas = d.prepare("PRAGMA table_info(notificaciones)").all();
      if (!columnas.some((c) => c.name === "solicitud_id")) {
        d.exec("ALTER TABLE notificaciones ADD COLUMN solicitud_id INTEGER REFERENCES solicitudes_especialidad(id)");
      }
    },
    revertir(d) {
      // El orden importa con `foreign_keys` activo: primero se suelta la
      // columna que referencia a la tabla, y solo después se elimina la tabla.
      // Al revés, DROP TABLE puede fallar o dejar la referencia colgando.
      const columnas = d.prepare("PRAGMA table_info(notificaciones)").all();
      if (columnas.some((c) => c.name === "solicitud_id")) {
        d.exec("ALTER TABLE notificaciones DROP COLUMN solicitud_id");
      }
      d.exec("DROP TABLE IF EXISTS solicitudes_especialidad");
    },
    nota: "Se pierden las solicitudes de cambio de especialidad guardadas."
  },
  {
    version: 6,
    nombre: "refresh tokens para sesiones de larga duración",
    migrar(d) {
      d.exec(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id         TEXT PRIMARY KEY,
          usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          creado_en  INTEGER NOT NULL,
          expira_en  INTEGER NOT NULL,
          revocado   INTEGER NOT NULL DEFAULT 0
        )
      `);
      d.exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_usuario ON refresh_tokens(usuario_id)");
    },
    revertir(d) {
      d.exec("DROP INDEX IF EXISTS idx_refresh_tokens_usuario");
      d.exec("DROP TABLE IF EXISTS refresh_tokens");
    },
    nota: "Se invalidan las sesiones de larga duración: todos los usuarios tendrán que iniciar sesión de nuevo."
  },
  {
    version: 7,
    nombre: "verificación en dos pasos (2FA) y tabla de auditoría de actividad",
    migrar(d) {
      d.exec(`
        CREATE TABLE IF NOT EXISTS auditoria (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          fecha      TEXT NOT NULL,
          usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
          rol        TEXT,
          accion     TEXT NOT NULL,
          detalle    TEXT DEFAULT '{}',
          ip         TEXT
        )
      `);
      d.exec("CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha)");
      d.exec("CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id)");
      const colUsuarios = d.prepare("PRAGMA table_info(usuarios)").all();
      if (!colUsuarios.some((c) => c.name === "totp_secreto")) {
        d.exec("ALTER TABLE usuarios ADD COLUMN totp_secreto TEXT");
      }
      if (!colUsuarios.some((c) => c.name === "totp_habilitado")) {
        d.exec("ALTER TABLE usuarios ADD COLUMN totp_habilitado INTEGER DEFAULT 0");
      }
    },
    revertir(d) {
      d.exec("DROP INDEX IF EXISTS idx_auditoria_fecha");
      d.exec("DROP INDEX IF EXISTS idx_auditoria_usuario");
      d.exec("DROP TABLE IF EXISTS auditoria");
      for (const col of ["totp_habilitado", "totp_secreto"]) {
        const columnas = d.prepare("PRAGMA table_info(usuarios)").all();
        if (columnas.some((c) => c.name === col)) {
          d.exec(`ALTER TABLE usuarios DROP COLUMN ${col}`);
        }
      }
    },
    nota: "Se pierde el historial de auditoría y las claves 2FA: quien las tenía activas deberá volver a configurarlas."
  },
  {
    version: 8,
    nombre: "restablecimiento de contraseña (tabla contrasena_resets)",
    migrar(d) {
      d.exec(`
        CREATE TABLE IF NOT EXISTS contrasena_resets (
          token        TEXT PRIMARY KEY,
          usuario_id   TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          expira_en    INTEGER NOT NULL,
          usado        INTEGER NOT NULL DEFAULT 0
        )
      `);
    },
    revertir(d) {
      d.exec("DROP TABLE IF EXISTS contrasena_resets");
    },
    nota: "Los enlaces de restablecimiento en curso quedan invalidados."
  },
  {
    version: 9,
    nombre: "ficha real de laboratorios (sistema operativo, cantidad de equipos y servicios)",
    migrar(d) {
      const updLab = d.prepare(`
        UPDATE laboratorios
        SET nombre = @nombre, equipos = @equipos, so = @so, servicios = @servicios
        WHERE id = @id
      `);
      const updSo = d.prepare("UPDATE equipos SET so = ? WHERE lab_id = ?");
      // El id sigue el patrón "<labId>-PC<NN>", así que los 2 últimos caracteres
      // son el número del equipo. El LIKE evita tocar equipos con otro id.
      const borrarSobrantes = d.prepare(`
        DELETE FROM equipos
        WHERE lab_id = ? AND id LIKE ?
          AND CAST(SUBSTR(id, LENGTH(id) - 1) AS INTEGER) > ?
      `);
      const existeEquipo = d.prepare("SELECT 1 AS ok FROM equipos WHERE id = ?");
      const hayLab = d.prepare("SELECT equipos FROM laboratorios WHERE id = ?");
      const insertEq = d.prepare(`
        INSERT INTO equipos (id,lab_id,nombre,tipo,fabricante,modelo,serie,procesador,ram,almacenamiento,so,ip,mac,monitor,teclado,mouse,estado,ultimo_encendido,observaciones)
        VALUES (@id,@lab_id,@nombre,@tipo,@fabricante,@modelo,@serie,@procesador,@ram,@almacenamiento,@so,@ip,@mac,@monitor,@teclado,@mouse,@estado,@ultimo_encendido,@observaciones)
      `);

      for (const l of DATOS_INVENTARIO) {
        if (!hayLab.get(l.id)) continue; // esa base no tiene ese laboratorio
        updLab.run({
          id: l.id, nombre: l.nombre, equipos: l.equipos, so: l.so,
          servicios: JSON.stringify(l.servicios)
        });
        updSo.run(l.so, l.id);
        borrarSobrantes.run(l.id, `${l.id}-PC%`, l.equipos);
        const completo = LABORATORIOS.find((x) => x.id === l.id);
        for (let i = 1; i <= l.equipos; i++) {
          const eq = datosEquipo(completo, i);
          if (!existeEquipo.get(eq.id)) insertEq.run(eq);
        }
      }

      // Reportes de ejemplo que citan el nombre y el total de la ficha anterior.
      const updReporte = d.prepare("UPDATE reportes SET datos = ? WHERE id = ?");
      for (const id of ["rep_001", "rep_003"]) {
        const fila = d.prepare("SELECT datos FROM reportes WHERE id = ?").get(id);
        if (!fila) continue;
        let datos = {};
        try { datos = JSON.parse(fila.datos || "{}"); } catch (e) { continue; }
        if (!Array.isArray(datos.labels)) continue;
        datos.labels = datos.labels.map((x) => (x === "Lab Redes" ? "Lab 5" : x));
        updReporte.run(JSON.stringify(datos), id);
      }
      const inv = d.prepare("SELECT datos FROM reportes WHERE id = 'rep_004'").get();
      if (inv) {
        let datos = {};
        try { datos = JSON.parse(inv.datos || "{}"); } catch (e) { datos = {}; }
        if (typeof datos.total === "number") {
          datos.total = TOTAL_EQUIPOS_INVENTARIO;
          if (typeof datos.activos === "number") {
            datos.activos = TOTAL_EQUIPOS_INVENTARIO
              - INVENTARIO_EJEMPLO.enFalla - INVENTARIO_EJEMPLO.enMantencion;
          }
          updReporte.run(JSON.stringify(datos), "rep_004");
        }
      }
    },
    reversible: false,
    nota: "No se puede deshacer: sobrescribe la ficha de los laboratorios, borra los equipos que sobraban y reescribe los reportes de ejemplo. Los valores anteriores no quedan guardados."
  },
  {
    version: 10,
    nombre: "alinear_columnas_con_el_esquema",
    migrar: async (d) => {
      // `CREATE TABLE IF NOT EXISTS` crea la tabla si falta, pero nunca le añade
      // columnas a una que ya existe: una columna nueva del esquema solo existe
      // en las bases creadas a partir de ese momento. Como ninguna migración
      // cubría `laboratorios.imagenes`, quedó fuera de todas las bases ya en
      // uso y, al escribirla la semilla, el programa no arrancaba sobre ellas
      // ("no such column: imagenes") aun con `schema_migrations` al día.
      //
      // El esquema canónico se reconstruye en memoria y se compara con el real,
      // así que la fuente de verdad sigue siendo el DDL de arriba: esta
      // migración no duplica la lista de columnas.
      const canonico = new DatabaseSync(":memory:");
      const anadidas = [];
      const omitidas = [];
      try {
        crearEsquema(canonico);
        const tablas = canonico
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
          .all();
        for (const { name } of tablas) {
          const ref = `"${String(name).replace(/"/g, '""')}"`;
          const reales = new Set(d.prepare(`PRAGMA table_info(${ref})`).all().map((c) => c.name));
          for (const col of canonico.prepare(`PRAGMA table_info(${ref})`).all()) {
            if (reales.has(col.name)) continue;
            // SQLite no admite añadir una PRIMARY KEY, ni un NOT NULL sin valor
            // por defecto: se avisa en vez de romper el arranque.
            if (col.pk || (col.notnull && col.dflt_value == null)) {
              omitidas.push(`${name}.${col.name}`);
              continue;
            }
            const tipo = col.type || "TEXT";
            const def = col.dflt_value != null
              ? `${col.name} ${tipo} NOT NULL DEFAULT ${col.dflt_value}`
              : `${col.name} ${tipo}`;
            d.exec(`ALTER TABLE ${ref} ADD COLUMN ${def}`);
            anadidas.push(`${name}.${col.name}`);
          }
        }
      } finally {
        canonico.close();
      }
      if (anadidas.length) console.log(`  Migración 10: columnas añadidas: ${anadidas.join(", ")}`);
  if (omitidas.length) {
        console.warn(
          `  Migración 10: no se pudieron añadir ${omitidas.join(", ")} (SQLite no admite ` +
          "añadir una clave primaria ni una columna obligatoria sin valor por defecto). Revísalas a mano."
        );
      }
    },
    // Sin `revertir`: las columnas añadidas no se pueden quitar sin perder lo que
    // se haya escrito en ellas, y dejarlas es inocuo. Forzar el rollback solo
    // desregistra la migración; la base conserva las columnas.
    nota: "Las columnas que añadió no se pueden quitar sin perder los datos que se hayan escrito en ellas, así que se dejan en su sitio. Forzar el rollback solo desregistra la migración: la base queda con las columnas añadidas, que no estorban."
  }
];

const ULTIMA_VERSION = MIGRACIONES[MIGRACIONES.length - 1].version;

// Una migración es reversible solo si declara `revertir` y no dice lo contrario.
const esReversible = (m) => Boolean(m.revertir) && m.reversible !== false;

function crearTablaMigraciones(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      nombre      TEXT NOT NULL,
      aplicada_en TEXT NOT NULL
    )
  `);
}

// Estado del esquema: qué migraciones constan como aplicadas y cuáles faltan.
export function estadoMigraciones(conexion = db) {
  crearTablaMigraciones(conexion);
  const aplicadas = new Set(
    conexion.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version))
  );
  const declaradas = new Set(MIGRACIONES.map((m) => m.version));
  return {
    aplicadas: [...aplicadas].sort((a, b) => a - b),
    faltantes: MIGRACIONES.filter((m) => !aplicadas.has(m.version)).map((m) => m.version),
    // Una base más nueva que el código (respaldo de una versión posterior) no
    // debe seguir adelante a ciegas: el código viejo no conoce esas columnas.
    masNueva: aplicadas.size > 0 && Math.max(...aplicadas) > ULTIMA_VERSION,
    desconocidas: [...aplicadas].filter((v) => !declaradas.has(v)).sort((a, b) => a - b),
    ultimaConocida: ULTIMA_VERSION
  };
}

// Aplica las migraciones que falten. Cada una va en su propio SAVEPOINT: si una
// falla, esa migración se deshace por completo y las anteriores quedan aplicadas
// (que es justo lo que permite volver a intentarlo al siguiente arranque).
async function aplicarMigraciones(conexion) {
  crearTablaMigraciones(conexion);
  const estado = estadoMigraciones(conexion);
  if (estado.masNueva) {
    const err = new Error(
      `La base de datos está en la versión de esquema ${Math.max(...estado.aplicadas)}, ` +
      `pero este programa solo conoce hasta la ${ULTIMA_VERSION}. Actualiza LabControl ` +
      "o restaura un respaldo de una versión compatible."
    );
    err.status = 409;
    throw err;
  }
  for (const m of MIGRACIONES) {
    if (estado.aplicadas.includes(m.version)) continue;
    conexion.exec(`SAVEPOINT migracion_${m.version}`);
    try {
      await m.migrar(conexion);
      conexion.prepare("INSERT INTO schema_migrations (version, nombre, aplicada_en) VALUES (?,?,?)")
        .run(m.version, m.nombre, new Date().toISOString());
      conexion.exec(`RELEASE migracion_${m.version}`);
      console.log(`  Migración ${m.version} aplicada: ${m.nombre}`);
    } catch (err) {
      conexion.exec(`ROLLBACK TO migracion_${m.version}`);
      conexion.exec(`RELEASE migracion_${m.version}`);
      console.error(`  Migración ${m.version} fallida y revertida: ${m.nombre}\n    ${err?.message || err}`);
      throw err;
    }
  }
}

// Deshace las migraciones aplicadas por encima de `objetivo` (0 = ninguna).
// Se detiene en la primera irreversible, informing de cuál es y por qué, en lugar
// de dejar el esquema a medias. Devuelve las versiones realmente revertidas.
//
// Todo el recorrido va dentro de un SAVEPOINT exterior: si una reversión falla a
// medias, se deshacen también las que ya se habían hecho en esta llamada. Sin él,
// un rollback a la 6 que fallara en la 7 dejaría la 8 revertida para siempre y
// el mensaje "no se revirtió nada" sería falso.
export async function revertirMigraciones(conexion, objetivo = 0, { forzar = false } = {}) {
  crearTablaMigraciones(conexion);
  const aplicadas = estadoMigraciones(conexion).aplicadas;
  const ordenadas = [...aplicadas].sort((a, b) => b - a);
  const revertidas = [];

  // Deshace el SAVEPOINT exterior: deja el esquema como estaba antes de esta
  // llamada, incluidas las reversiones que ya habían quedado a medias.
  const deshacerTodo = (err) => {
    try {
      conexion.exec("ROLLBACK TO revertir_todo");
      conexion.exec("RELEASE revertir_todo");
    } catch (rollback) {
      console.error("No se pudo deshacer el rollback:", rollback?.message || rollback);
    }
    return err;
  };

  conexion.exec("SAVEPOINT revertir_todo");
  for (const version of ordenadas) {
    if (version <= objetivo) break;
    const m = MIGRACIONES.find((x) => x.version === version);
    if (!m) {
      throw deshacerTodo(new Error(`No se puede revertir la migración ${version}: este programa no la conoce.`));
    }
    if (!esReversible(m) && !forzar) {
      throw deshacerTodo(new Error(
        `No se puede revertir la migración ${version} (${m.nombre}): ${m.nota || "no declara un paso de vuelta"}. ` +
        "Usa `forzar` solo si aceptas perder esos datos, y restaura un respaldo previo."
      ));
    }
    conexion.exec(`SAVEPOINT revertir_${version}`);
    try {
      if (m.revertir) await m.revertir(conexion);
      conexion.prepare("DELETE FROM schema_migrations WHERE version = ?").run(version);
      conexion.exec(`RELEASE revertir_${version}`);
      revertidas.push(version);
      console.log(`  Migración ${version} revertida: ${m.nombre}`);
    } catch (err) {
      conexion.exec(`ROLLBACK TO revertir_${version}`);
      conexion.exec(`RELEASE revertir_${version}`);
      throw deshacerTodo(new Error(`Falló la reversión de la migración ${version} (${m.nombre}): ${err?.message || err}`));
    }
  }
  conexion.exec("RELEASE revertir_todo");
  return revertidas;
}

// Abre la conexión inicial y aplica esquema + migraciones (después de que
// MIGRACIONES ya está definido; de ahí su posición).
// Barre los temporales que hubiera dejado una restauración interrumpida.
limpiarTemporales();
db = await abrirConexion();

/* Semilla: datos de ejemplo
   ------------------------------------------------------------------
   Antes se cargaba una sola vez (solo si el archivo no existía) y con
   INSERT a pelo: en una base existente no se actualizaba nunca, y si se
   repetía a mano fallaba con "UNIQUE constraint failed".

   Ahora la semilla es un proceso versionado e idempotente que se revisa en
   cada arranque:
     · `SEMILLA_VERSION` sube cuando el juego de datos de ejemplo cambia.
     · Solo INSERTA lo que falta: nunca pisa un registro ya existente ni un
       valor que el administrador haya editado.
     · Solo completa los campos vacíos (NULL o "") de los registros que ya
       estaban: así una versión nueva puede rellenar la ficha de un
       laboratorio sin borrar lo que el usuario ajustó.
     · Guarda lo que hizo en `seed_history`, así que repetirla no cambia nada
       y se puede auditar qué versión de datos hay en cada base. */

const SEMILLA_VERSION = 2;

const USUARIOS = [
  { id: "INSUCO", nombre: "Administrador", apellido: "Sistema", iniciales: "AD", email: "admin@liceo.cl", password: "Insuco1336", rol: "admin", area: "Administración", especialidad: "Gestión de sistemas y redes", nivelAcceso: "total" },
  { id: "prof_juan", nombre: "Juan", apellido: "Pérez", iniciales: "JP", email: "jperez@liceo.cl", password: "juan123", rol: "programacion", area: "Programación", especialidad: "Desarrollo Web y Redes", nivelAcceso: "tecnico" },
  { id: "prof_ana", nombre: "Ana", apellido: "López", iniciales: "AL", email: "alopez@liceo.cl", password: "ana123", rol: "programacion", area: "Programación", especialidad: "Bases de Datos y Programación", nivelAcceso: "tecnico" },
  { id: "prof_diego", nombre: "Diego", apellido: "Rojas", iniciales: "DR", email: "drojas@liceo.cl", password: "diego123", rol: "programacion", area: "Programación", especialidad: "Sistemas Operativos y Linux", nivelAcceso: "tecnico" },
  { id: "prof_camila", nombre: "Camila", apellido: "Soto", iniciales: "CS", email: "csoto@liceo.cl", password: "camila123", rol: "otro_area", area: "Matemáticas", especialidad: "Matemáticas y Estadística", nivelAcceso: "basico" },
  { id: "prof_marcos", nombre: "Marcos", apellido: "Vera", iniciales: "MV", email: "mvera@liceo.cl", password: "marcos123", rol: "otro_area", area: "Ciencias", especialidad: "Física y Química", nivelAcceso: "basico" },
  { id: "prof_lucia", nombre: "Lucía", apellido: "Fuentes", iniciales: "LF", email: "lfuentes@liceo.cl", password: "lucia123", rol: "otro_area", area: "Lenguaje", especialidad: "Lengua y Literatura", nivelAcceso: "basico" }
];

const AGENDA = [
  { id: "res_001", labId: 1, usuarioId: "prof_juan", fecha: "2026-08-25", horaInicio: "08:00", horaFin: "10:00", motivo: "Clase de Programación Web", estado: "confirmada" },
  { id: "res_002", labId: 2, usuarioId: "prof_camila", fecha: "2026-08-25", horaInicio: "10:30", horaFin: "12:00", motivo: "Taller de Estadística aplicada", estado: "confirmada" },
  { id: "res_003", labId: 3, usuarioId: "prof_diego", fecha: "2026-08-22", horaInicio: "08:00", horaFin: "12:00", motivo: "Clase de Sistemas Operativos Linux", estado: "confirmada" },
  { id: "res_004", labId: 1, usuarioId: "prof_marcos", fecha: "2026-08-26", horaInicio: "14:00", horaFin: "16:00", motivo: "Laboratorio de Física computacional", estado: "pendiente" },
  { id: "res_005", labId: 5, usuarioId: "prof_juan", fecha: "2026-08-27", horaInicio: "09:00", horaFin: "11:00", motivo: "Clase de ofimática y navegación segura", estado: "confirmada" }
];

const REPORTES = [
  {
    id: "rep_001", tipo: "uso", titulo: "Uso mensual de laboratorios",
    descripcion: "Reporte de horas de uso por laboratorio en el mes de julio 2026.",
    fecha: "2026-07-31", generadoPor: "INSUCO",
    datos: { labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab 5"], valores: [72, 68, 55, 20, 80] }
  },
  {
    id: "rep_002", tipo: "fallas", titulo: "Registro de fallas de equipos",
    descripcion: "Equipos con fallas reportadas durante agosto 2026.",
    fecha: "2026-08-15", generadoPor: "prof_juan",
    datos: { fallas: [
      { equipo: "PC-403", lab: "Lab 4", descripcion: "Disco duro con sectores defectuosos", estado: "en reparación" },
      { equipo: "PC-105", lab: "Lab 1", descripcion: "Teclado no funciona", estado: "resuelto" },
      { equipo: "PC-312", lab: "Lab 3", descripcion: "Pantalla con líneas horizontales", estado: "pendiente" }
    ] }
  },
  {
    id: "rep_003", tipo: "disponibilidad", titulo: "Disponibilidad semanal",
    descripcion: "Porcentaje de disponibilidad por laboratorio — semana del 17 al 21 de agosto 2026.",
    fecha: "2026-08-21", generadoPor: "INSUCO",
    datos: { labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab 5"], valores: [85, 90, 60, 0, 95] }
  },
  {
    id: "rep_004", tipo: "inventario", titulo: "Inventario de equipos actualizado",
    descripcion: "Listado completo del estado de todos los equipos en los laboratorios.",
    fecha: "2026-08-20", generadoPor: "INSUCO",
    datos: {
      total: TOTAL_EQUIPOS_INVENTARIO,
      activos: TOTAL_EQUIPOS_INVENTARIO - INVENTARIO_EJEMPLO.enFalla - INVENTARIO_EJEMPLO.enMantencion,
      enFalla: INVENTARIO_EJEMPLO.enFalla,
      enMantencion: INVENTARIO_EJEMPLO.enMantencion
    }
  }
];

// Rellena un campo solo si está vacío. Devuelve true si cambió algo, para poder
// informar del detalle de la actualización.
function completarSiVacio(d, tabla, id, valores, clave) {
  const sets = [];
  const args = [];
  const pendientes = [];
  for (const [col, valor] of Object.entries(valores)) {
    // Sin valor con qué rellenar no hay nada que hacer. Y un "" de la semilla se
    // salta: dejaría la columna vacía para siempre, y cada arranque la
    // "completaría" otra vez.
    if (valor === null || valor === undefined || valor === "") continue;
    sets.push(`${col} = CASE WHEN ${col} IS NULL OR ${col} = '' THEN ? ELSE ${col} END`);
    args.push(valor);
    pendientes.push(`(${col} IS NULL OR ${col} = '')`);
  }
  if (!sets.length) return false;
  // El CASE protege cada columna por separado (rellenar un campo vacío no puede
  // pisar el valor de otro), y el WHERE limita la sentencia a las filas con
  // algo pendiente. El WHERE no es opcional: SQLite cuenta como modificadas
  // todas las filas que toca la sentencia, aunque el valor quede igual, y sin
  // él la semilla informaría "completó 150 fichas" en cada arranque.
  const info = d.prepare(
    `UPDATE ${tabla} SET ${sets.join(", ")} WHERE ${clave} = ? AND (${pendientes.join(" OR ")})`
  ).run(...args, id);
  return Number(info.changes || 0) > 0;
}

// Aplica la semilla. Es idempotente: ejecutarla N veces produce el mismo
// resultado que ejecutarla una, y devuelve un resumen de lo que hizo.
async function aplicarSemilla(conexion = db) {
  const resumen = { version: SEMILLA_VERSION, labs: 0, equipos: 0, usuarios: 0, agenda: 0, reportes: 0, completados: 0 };

  // Los hashes se calculan ANTES de abrir la transacción. Hashear 7 contraseñas
  // con bcrypt son ~600 ms de CPU: dejarlo dentro de la transacción mantendría
  // una escritura abierta mientras se cede el event loop, y cualquier otra
  // consulta que llegara en ese rato se encontraría con la base bloqueada.
  const existeUsuario = conexion.prepare("SELECT id FROM usuarios WHERE id = ?");
  const passwords = new Map();
  for (const u of USUARIOS) {
    if (!existeUsuario.get(u.id)) passwords.set(u.id, await bcrypt.hash(u.password, 10));
  }

  conexion.exec("BEGIN");
  try {
    const insertLab = conexion.prepare(`
      INSERT INTO laboratorios (id,nombre,sala,ubicacion,equipos,estado,so,procesador,ram,almacenamiento,red,responsable,responsable_id,horario,servicios,descripcion,foto,imagenes,pos_x,pos_y,pos_w,pos_h)
      VALUES (@id,@nombre,@sala,@ubicacion,@equipos,@estado,@so,@procesador,@ram,@almacenamiento,@red,@responsable,@responsable_id,@horario,@servicios,@descripcion,@foto,@imagenes,@pos_x,@pos_y,@pos_w,@pos_h)
    `);
    const insertUsr = conexion.prepare(`
      INSERT INTO usuarios (id,nombre,apellido,iniciales,email,password,rol,area,especialidad,nivel_acceso,activo)
      VALUES (@id,@nombre,@apellido,@iniciales,@email,@password,@rol,@area,@especialidad,@nivel_acceso,1)
    `);
    const insertEquipo = conexion.prepare(`
      INSERT INTO equipos (id,lab_id,nombre,tipo,fabricante,modelo,serie,procesador,ram,almacenamiento,so,ip,mac,monitor,teclado,mouse,estado,ultimo_encendido,observaciones)
      VALUES (@id,@lab_id,@nombre,@tipo,@fabricante,@modelo,@serie,@procesador,@ram,@almacenamiento,@so,@ip,@mac,@monitor,@teclado,@mouse,@estado,@ultimo_encendido,@observaciones)
    `);
    const insertAgenda = conexion.prepare(`
      INSERT INTO agenda (id, lab_id, usuario_id, fecha, hora_inicio, hora_fin, motivo, estado)
      VALUES (@id, @lab_id, @usuario_id, @fecha, @hora_inicio, @hora_fin, @motivo, @estado)
    `);
    const insertReporte = conexion.prepare(`
      INSERT INTO reportes (id,tipo,titulo,descripcion,fecha,generado_por,datos,adjuntos)
      VALUES (@id,@tipo,@titulo,@descripcion,@fecha,@generado_por,@datos,@adjuntos)
    `);
    const hayLab = conexion.prepare("SELECT id FROM laboratorios WHERE id = ?");
    const hayEquipo = conexion.prepare("SELECT id FROM equipos WHERE id = ?");
    const hayUsuario = conexion.prepare("SELECT id FROM usuarios WHERE id = ?");
    const hayAgenda = conexion.prepare("SELECT id FROM agenda WHERE id = ?");
    const hayReporte = conexion.prepare("SELECT id FROM reportes WHERE id = ?");

    for (const l of LABORATORIOS) {
      const ficha = {
        id: l.id, nombre: l.nombre, sala: l.sala, ubicacion: l.ubicacion, equipos: l.equipos,
        estado: l.estado, so: l.so, procesador: l.procesador, ram: l.ram,
        almacenamiento: l.almacenamiento, red: l.red, responsable: l.responsable,
        responsable_id: l.responsableId, horario: l.horario, servicios: JSON.stringify(l.servicios),
        descripcion: l.descripcion, foto: l.foto,
        imagenes: JSON.stringify(l.imagenes || []),
        pos_x: l.posicion.x, pos_y: l.posicion.y, pos_w: l.posicion.w, pos_h: l.posicion.h
      };
      if (hayLab.get(l.id)) {
        // El laboratorio ya existe: solo se completan los campos vacíos, nunca
        // se pisa lo que el administrador haya corregido.
        if (completarSiVacio(conexion, "laboratorios", l.id, {
          nombre: l.nombre, sala: l.sala, ubicacion: l.ubicacion, so: l.so,
          procesador: l.procesador, ram: l.ram, almacenamiento: l.almacenamiento,
          red: l.red, responsable: l.responsable, responsable_id: l.responsableId,
          horario: l.horario, servicios: ficha.servicios, descripcion: l.descripcion,
          foto: l.foto, imagenes: ficha.imagenes,
          pos_x: l.posicion.x, pos_y: l.posicion.y, pos_w: l.posicion.w, pos_h: l.posicion.h
        }, "id")) resumen.completados++;
      } else {
        insertLab.run(ficha);
        resumen.labs++;
      }

      // Los equipos se completan (nunca se pisa) para que la lista cuadre con
      // la cantidad declarada, sin tocar los que el usuario ya editó.
      for (let i = 1; i <= l.equipos; i++) {
        const eq = datosEquipo(l, i);
        if (hayEquipo.get(eq.id)) {
          if (completarSiVacio(conexion, "equipos", eq.id, {
            nombre: eq.nombre, tipo: eq.tipo, fabricante: eq.fabricante, modelo: eq.modelo,
            serie: eq.serie, procesador: eq.procesador, ram: eq.ram, almacenamiento: eq.almacenamiento,
            so: eq.so, ip: eq.ip, mac: eq.mac, monitor: eq.monitor, teclado: eq.teclado, mouse: eq.mouse
          }, "id")) resumen.completados++;
        } else {
          insertEquipo.run(eq);
          resumen.equipos++;
        }
      }
    }

    for (const u of USUARIOS) {
      if (hayUsuario.get(u.id)) {
        // Una cuenta existente solo se completa (nombre, correo, rol vacío);
        // su contraseña y su rol activo nunca se tocan.
        if (completarSiVacio(conexion, "usuarios", u.id, {
          nombre: u.nombre, apellido: u.apellido, iniciales: u.iniciales,
          email: u.email, area: u.area, especialidad: u.especialidad
        }, "id")) resumen.completados++;
        continue;
      }
      insertUsr.run({
        id: u.id, nombre: u.nombre, apellido: u.apellido, iniciales: u.iniciales,
        email: u.email, password: passwords.get(u.id), rol: u.rol, area: u.area,
        especialidad: u.especialidad, nivel_acceso: u.nivelAcceso
      });
      resumen.usuarios++;
    }

    for (const r of AGENDA) {
      if (hayAgenda.get(r.id)) continue;
      insertAgenda.run({
        id: r.id, lab_id: r.labId, usuario_id: r.usuarioId, fecha: r.fecha,
        hora_inicio: r.horaInicio, hora_fin: r.horaFin, motivo: r.motivo, estado: r.estado
      });
      resumen.agenda++;
    }

    for (const r of REPORTES) {
      if (hayReporte.get(r.id)) continue;
      insertReporte.run({
        id: r.id, tipo: r.tipo, titulo: r.titulo, descripcion: r.descripcion,
        fecha: r.fecha, generado_por: r.generadoPor, datos: JSON.stringify(r.datos),
        adjuntos: JSON.stringify(r.adjuntos || [])
      });
      resumen.reportes++;
    }

    // La configuración solo se crea si falta; una vez creada la gestiona el
    // administrador desde Configuración y la semilla no la pisa nunca.
    if (!conexion.prepare("SELECT id FROM config WHERE id = 1").get()) {
      conexion.prepare("INSERT INTO config (id, data) VALUES (1, ?)").run(JSON.stringify(CONFIG_DEFAULT));
    }

    conexion.prepare(
      "INSERT INTO seed_history (version, aplicada_en, resumen) VALUES (?,?,?) " +
      "ON CONFLICT(version) DO UPDATE SET aplicada_en = excluded.aplicada_en, resumen = excluded.resumen"
    ).run(SEMILLA_VERSION, new Date().toISOString(), JSON.stringify(resumen));

    conexion.exec("COMMIT");
  } catch (err) {
    conexion.exec("ROLLBACK");
    throw err;
  }
  return resumen;
}

if (esNueva) {
  console.log("Base de datos nueva: cargando datos de ejemplo…");
}
const resumenSemilla = await aplicarSemilla();
if (resumenSemilla.labs || resumenSemilla.usuarios || resumenSemilla.equipos || resumenSemilla.agenda || resumenSemilla.reportes || resumenSemilla.completados) {
  console.log(
    `Semilla v${resumenSemilla.version}: ${resumenSemilla.labs} laboratorios, ` +
    `${resumenSemilla.equipos} equipos, ${resumenSemilla.usuarios} usuarios, ` +
    `${resumenSemilla.agenda} reservas, ${resumenSemilla.reportes} reportes y ` +
    `${resumenSemilla.completados} fichas completadas.`
  );
}

export { DB_PATH, DB_DIR, db, abrirConexion, MIGRACIONES, SEMILLA_VERSION, aplicarSemilla };

function tieneLaTabla(d, tabla) {
  return Boolean(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla));
}

// Mantiene acotadas las tablas que crecen sin límite (auditoría, sesiones,
// notificaciones, solicitudes y enlaces de reseteo). Es idempotente: ejecutarla
// dos veces seguidas deja exactamente lo mismo. Devuelve lo que borró.
export function podarTablas(conexion = db) {
  const aplicadas = new Set(estadoMigraciones(conexion).aplicadas);
  const borradas = {};

  if (aplicadas.has(5) && tieneLaTabla(conexion, "solicitudes_especialidad")) {
    // Índice de apoyo para la poda por usuario (idempotente).
    conexion.exec("CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario ON solicitudes_especialidad(usuario_id, id)");
  }
  if (aplicadas.has(8) && tieneLaTabla(conexion, "contrasena_resets")) {
    conexion.exec("CREATE INDEX IF NOT EXISTS idx_resets_usuario ON contrasena_resets(usuario_id)");
  }

  if (aplicadas.has(7) && tieneLaTabla(conexion, "auditoria")) {
    const info = conexion.prepare(
      "DELETE FROM auditoria WHERE id NOT IN (SELECT id FROM auditoria ORDER BY id DESC LIMIT 5000)"
    ).run();
    borradas.auditoria = Number(info.changes || 0);
  }
  if (tieneLaTabla(conexion, "notificaciones")) {
    const info = conexion.prepare(
      "DELETE FROM notificaciones WHERE id NOT IN (SELECT id FROM notificaciones ORDER BY id DESC LIMIT 20000)"
    ).run();
    borradas.notificaciones = Number(info.changes || 0);
  }
  if (aplicadas.has(6) && tieneLaTabla(conexion, "refresh_tokens")) {
    const info = conexion.prepare("DELETE FROM refresh_tokens WHERE expira_en < ?").run(Date.now());
    borradas.refreshTokensVencidos = Number(info.changes || 0);
  }
  if (aplicadas.has(8) && tieneLaTabla(conexion, "contrasena_resets")) {
    const info = conexion.prepare("DELETE FROM contrasena_resets WHERE expira_en < ?").run(Date.now());
    borradas.resetsVencidos = Number(info.changes || 0);
    // Un usuario solo puede tener un enlace vivo: se acota por si acaso.
    const extra = conexion.prepare(`
      DELETE FROM contrasena_resets
      WHERE token NOT IN (
        SELECT token FROM contrasena_resets ORDER BY expira_en DESC LIMIT 200
      )
    `).run();
    borradas.resetsSobrantes = Number(extra.changes || 0);
  }
  if (aplicadas.has(5) && tieneLaTabla(conexion, "solicitudes_especialidad")) {
    // Se conservan las 100 más recientes de cada usuario y todas las pendientes.
    const info = conexion.prepare(`
      DELETE FROM solicitudes_especialidad
      WHERE estado != 'pendiente'
        AND id NOT IN (
          SELECT id FROM solicitudes_especialidad WHERE estado != 'pendiente'
          ORDER BY id DESC LIMIT 1000
        )
    `).run();
    borradas.solicitudes = Number(info.changes || 0);
    // Tope por usuario sobre lo ya resuelto. El filtro de estado tiene que
    // repetirse en el sub-SELECT: sin él, un usuario con más de 100 filas
    // pierde las pendientes más antiguas, que son justo las que hay que mirar.
    const porUsuario = conexion.prepare(`
      DELETE FROM solicitudes_especialidad
      WHERE estado != 'pendiente'
        AND id NOT IN (
          SELECT id FROM solicitudes_especialidad
          WHERE usuario_id = solicitudes_especialidad.usuario_id AND estado != 'pendiente'
          ORDER BY id DESC LIMIT 100
        )
    `).run();
    borradas.solicitudesPorUsuario = Number(porUsuario.changes || 0);
  }

  const total = Object.values(borradas).reduce((a, b) => a + b, 0);
  return total > 0 ? borradas : null;
}

// Obliga a volcar el journal al archivo principal: deja la BD consistente para
// copiarla. Es idempotente y no falla si la base ya está cerrada.
export function hacerCheckpoint() {
  if (!db) return false;
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    return true;
  } catch (err) {
    console.error("No se pudo volcar el journal a la base:", err?.message || err);
    return false;
  }
}

// En Windows, SQLite puede reportar "database is locked" o EPERM de forma
// transitoria justo tras cerrar/reabrir la conexión. Se reintenta con una espera
// real (no una espera activa), para no bloquear el event loop mientras se reintenta.
function esErrorTransitorio(err) {
  const mensaje = String(err?.message || err).toLowerCase();
  return mensaje.includes("locked") || mensaje.includes("eperm") || mensaje.includes("permission denied");
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function reintentar(fn, intentos = 6, pausaMs = 150) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      if (!esErrorTransitorio(err) || i === intentos - 1) throw err;
      await dormir(pausaMs);
    }
  }
  throw ultimoError;
}

// Tablas que la aplicación necesita para funcionar: un respaldo que no las
// tenga no es una base de LabControl y no debe sustituir a la actual.
const TABLAS_REQUERIDAS = [
  "laboratorios", "equipos", "usuarios", "agenda", "reportes", "notificaciones", "config"
];

// Abre una copia del archivo recibido en solo lectura y la somete a las
// comprobaciones de estructura, sin tocar la base que está en servicio.
function validarCopia(ruta) {
  let d;
  try {
    d = new DatabaseSync(ruta, { readOnly: true });
    d.exec("PRAGMA busy_timeout = 5000");
    const integridad = d.prepare("PRAGMA quick_check").all();
    if (!integridad.length || String(integridad[0].quick_check) !== "ok") {
      throw new Error("el archivo está dañado o incompleto");
    }
    const existentes = new Set(
      d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    );
    const faltantes = TABLAS_REQUERIDAS.filter((t) => !existentes.has(t));
    if (faltantes.length) {
      throw new Error(`le faltan las tablas ${faltantes.join(", ")}`);
    }
    return true;
  } finally {
    try { d?.close(); } catch { /* ya cerrada */ }
  }
}

function errorValidacion(mensaje) {
  const err = new Error(`El archivo recibido no es un respaldo utilizable: ${mensaje}.`);
  err.status = 400;
  return err;
}

// Sustituye la base por la de un respaldo subido (buffer con el contenido del
// archivo .db).
//
// El orden importa: primero se valida una COPIA del archivo recibido (cabecera,
// integridad y esquema) mientras la base en servicio sigue abierta; solo si esa
// copia es válida se cierra la conexión y se intercambian los archivos. Así un
// respaldo corrupto no deja el sistema sin base, y siempre queda una única copia
// `.prev` de la anterior (idempotente: no se acumulan copias).
export async function reemplazarBaseDesdeBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) {
    throw errorValidacion("es demasiado pequeño");
  }
  const cabecera = buffer.subarray(0, 16).toString("latin1");
  if (cabecera !== "SQLite format 3\u0000") {
    throw errorValidacion("no es una base de datos SQLite");
  }

  const temporal = rutaTemporal("restaurando.db");
  const prev = `${DB_PATH}.prev`;
  reemplazando = true;
  try {
    limpiarTemporales();
    fs.writeFileSync(temporal, buffer);
    try {
      validarCopia(temporal);
    } catch (err) {
      throw errorValidacion(err?.message || "no se pudo leer");
    }

    // La base en servicio sigue abierta mientras se prepara la nueva: si algo
    // falla aquí, el sistema nunca se queda sin responder.
    const nueva = await reintentar(() => abrirConexion(temporal));

    // Cerrar la conexión actual (ella misma elimina su journal; sin WAL no hay
    // archivos -wal/-shm que queden colgando en Windows). `db` pasa a null antes
    // de cerrar: si el intercambio de archivos falla más abajo, el bloque catch
    // sabe que hay que reabrir, y no que ya hay una conexión sana en pie.
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch { /* el journal ya no está o la base está cerrándose */ }
    const anterior = db;
    db = null;
    anterior.close();
    nueva.close();

    fs.copyFileSync(DB_PATH, prev);
    fs.copyFileSync(temporal, DB_PATH);
    fs.rmSync(temporal, { force: true });

    db = await reintentar(() => abrirConexion());

    // La base restaurada puede venir de otra versión: se le aplican las
    // migraciones que le falten (ya lo hizo abrirConexion) y se invalidan las
    // sesiones de la base anterior, que ya no sirven.
    if (tablaExiste(db, "refresh_tokens")) {
      db.prepare("UPDATE refresh_tokens SET revocado = 1 WHERE revocado = 0").run();
    }
    // El estado en memoria del servidor (desafíos 2FA) pertenece a la base
    // anterior: se purga para que no quede ningún desafío vivo.
    for (const fn of ganchosAlRestaurar) {
      try { fn(); } catch (err) {
        console.error("Error en un gancho de restauración:", err?.message || err);
      }
    }
    return { rutaAnterior: prev, versionEsquema: estadoMigraciones(db).aplicadas };
  } catch (err) {
    // Cualquier fallo deja la base anterior en su sitio.
    try { fs.rmSync(temporal, { force: true }); } catch { /* ya no existe */ }
    if (db === null) {
      // La conexión se cerró antes de fallar, así que hay que reabrir. Se
      // prefiere la copia `.prev`, que se sabe válida, y en todo caso se
      // valida el archivo antes de adoptarlo: si DB_PATH quedó a medias, abrirlo
      // tal cual crearía una base vacía con el esquema puesto y parecería sano.
      let recuperada = false;
      for (const ruta of [prev, DB_PATH]) {
        if (!fs.existsSync(ruta)) continue;
        try {
          validarCopia(ruta);
          if (ruta !== DB_PATH) fs.copyFileSync(ruta, DB_PATH);
          db = await reintentar(() => abrirConexion());
          recuperada = true;
          break;
        } catch (intento) {
          console.error(`No se pudo recuperar la base desde ${ruta}:`, intento?.message || intento);
        }
      }
      if (!recuperada) console.error("No quedó ninguna base válida: el servidor queda sin datos.");
    }
    throw err;
  } finally {
    reemplazando = false;
  }
}

function tablaExiste(d, tabla) {
  return Boolean(d?.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla));
}

export default db;
