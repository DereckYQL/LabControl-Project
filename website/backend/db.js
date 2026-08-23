/**
 * db.js
 * Conexión a la base de datos SQLite de LabControl Liceo.
 *
 * Usa el módulo "node:sqlite", incluido en Node.js (>= 22.5) — por eso no
 * hace falta instalar ningún paquete de base de datos ni tener un
 * compilador instalado. Solo se necesita `npm install` para Express.
 *
 * La primera vez que se ejecuta el servidor (cuando database/labcontrol.db
 * todavía no existe) se crean las tablas y se cargan los mismos datos de
 * ejemplo que antes vivían "hardcodeados" en el data.js del frontend.
 *
 * Para inspeccionar o editar la base de datos a mano se puede abrir el
 * archivo database/labcontrol.db con una herramienta gratuita como
 * "DB Browser for SQLite" (https://sqlitebrowser.org/) — no hace falta
 * saber SQL para ver o modificar los datos ahí.
 */

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_DIR = path.join(__dirname, "database");
const DB_PATH = path.join(DB_DIR, "labcontrol.db");
const esNueva = !fs.existsSync(DB_PATH);

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/* ==========================================================================
   ESQUEMA
   ========================================================================== */

db.exec(`
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
  datos         TEXT DEFAULT '{}'
);

-- Configuración del sitio: una sola fila con un JSON (fácil de leer/editar).
CREATE TABLE IF NOT EXISTS config (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  data  TEXT NOT NULL
);
`);

/* ==========================================================================
   SEED — datos de ejemplo (solo se insertan la primera vez)
   ========================================================================== */

if (esNueva) {
  console.log("Base de datos nueva: cargando datos de ejemplo…");
  seed();
}

function seed() {
  const LABORATORIOS = [
    {
      id: 1, nombre: "Laboratorio 1", sala: "Sala B-201", ubicacion: "Segundo piso, ala B",
      equipos: 30, estado: "disponible", so: "Windows 11", procesador: "Intel Core i5-10400",
      ram: "8 GB DDR4", almacenamiento: "512 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Juan Pérez", responsableId: "prof_juan", horario: "07:30 - 18:00",
      servicios: ["Internet", "Impresora de red", "Proyector", "Pizarra digital"],
      descripcion: "Laboratorio equipado para clases de informática, programación, ofimática y navegación segura.",
      foto: "assets/lab-generico.svg", posicion: { x: 20, y: 60, w: 180, h: 120 }
    },
    {
      id: 2, nombre: "Laboratorio 2", sala: "Sala B-202", ubicacion: "Segundo piso, ala B",
      equipos: 30, estado: "disponible", so: "Windows 11", procesador: "Intel Core i5-10400",
      ram: "8 GB DDR4", almacenamiento: "512 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Ana López", responsableId: "prof_ana", horario: "07:30 - 18:00",
      servicios: ["Internet", "Impresora de red", "Proyector"],
      descripcion: "Laboratorio de uso general para asignaturas de la carrera de Programación.",
      foto: "assets/lab-generico.svg", posicion: { x: 220, y: 60, w: 180, h: 120 }
    },
    {
      id: 3, nombre: "Laboratorio 3", sala: "Sala B-203", ubicacion: "Segundo piso, ala B",
      equipos: 30, estado: "ocupado", so: "Ubuntu 22.04 LTS", procesador: "Intel Core i5-10400",
      ram: "8 GB DDR4", almacenamiento: "256 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Diego Rojas", responsableId: "prof_diego", horario: "08:00 - 17:00",
      servicios: ["Internet", "Proyector"],
      descripcion: "Laboratorio orientado a programación y entornos Linux.",
      foto: "assets/lab-generico.svg", posicion: { x: 420, y: 60, w: 180, h: 120 }
    },
    {
      id: 4, nombre: "Laboratorio 4", sala: "Sala B-205", ubicacion: "Segundo piso, ala B",
      equipos: 25, estado: "mantencion", so: "Windows 11", procesador: "Intel Core i3-10100",
      ram: "8 GB DDR4", almacenamiento: "256 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Camila Soto", responsableId: "prof_camila", horario: "07:30 - 18:00",
      servicios: ["Internet", "Proyector"],
      descripcion: "Laboratorio de apoyo para talleres y evaluaciones prácticas.",
      foto: "assets/lab-generico.svg", posicion: { x: 620, y: 60, w: 150, h: 120 }
    },
    {
      id: 5, nombre: "Laboratorio de Redes", sala: "Sala B-204", ubicacion: "Segundo piso, ala B",
      equipos: 30, estado: "disponible", so: "Windows Server 2022", procesador: "Intel Core i7-10700",
      ram: "16 GB DDR4", almacenamiento: "1 TB SSD NVMe", red: "Rack de switches y patch panel propio",
      responsable: "Juan Pérez", responsableId: "prof_juan", horario: "07:30 - 18:00",
      servicios: ["Internet", "Rack de servidores", "Proyector"],
      descripcion: "Laboratorio especializado en redes: cableado estructurado, switches y servidores.",
      foto: "assets/lab-generico.svg", posicion: { x: 220, y: 220, w: 180, h: 120 }
    }
  ];

  const USUARIOS = [
    { id: "admin", nombre: "Administrador", apellido: "Sistema", iniciales: "AD", email: "admin@liceo.cl", password: "admin123", rol: "admin", area: "Administración", especialidad: "Gestión de sistemas y redes", nivelAcceso: "total" },
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
    { id: "res_005", labId: 5, usuarioId: "prof_juan", fecha: "2026-08-27", horaInicio: "09:00", horaFin: "11:00", motivo: "Práctica de cableado estructurado", estado: "confirmada" }
  ];

  const REPORTES = [
    {
      id: "rep_001", tipo: "uso", titulo: "Uso mensual de laboratorios",
      descripcion: "Reporte de horas de uso por laboratorio en el mes de julio 2026.",
      fecha: "2026-07-31", generadoPor: "admin",
      datos: { labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab Redes"], valores: [72, 68, 55, 20, 80] }
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
      fecha: "2026-08-21", generadoPor: "admin",
      datos: { labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab Redes"], valores: [85, 90, 60, 0, 95] }
    },
    {
      id: "rep_004", tipo: "inventario", titulo: "Inventario de equipos actualizado",
      descripcion: "Listado completo del estado de todos los equipos en los laboratorios.",
      fecha: "2026-08-20", generadoPor: "admin",
      datos: { total: 145, activos: 141, enFalla: 3, enMantencion: 1 }
    }
  ];

  const CONFIG_DEFAULT = {
    sitio: { nombreInstitucion: "Instituto Superior de Comercio", nombreSistema: "LabControl", logo: "", tema: "claro", idioma: "es" },
    red: { subredLabs: "192.168.10.0/24", servidorDNS: "192.168.1.1", puertaEnlace: "192.168.1.254", wifiHabilitado: true },
    notificaciones: { emailAdmin: "admin@liceo.cl", alertaFallas: true, alertaDisponibilidad: true, alertaReservas: true },
    seguridad: { sesionTimeout: 30, intentosLoginMax: 5, registroActividad: true },
    laboratorios: { horaApertura: "07:30", horaCierre: "18:00", permitirReservaExterna: true, anticipacionMaxReserva: 7 }
  };

  const insertLab = db.prepare(`
    INSERT INTO laboratorios (id,nombre,sala,ubicacion,equipos,estado,so,procesador,ram,almacenamiento,red,responsable,responsable_id,horario,servicios,descripcion,foto,pos_x,pos_y,pos_w,pos_h)
    VALUES (@id,@nombre,@sala,@ubicacion,@equipos,@estado,@so,@procesador,@ram,@almacenamiento,@red,@responsable,@responsable_id,@horario,@servicios,@descripcion,@foto,@pos_x,@pos_y,@pos_w,@pos_h)
  `);
  const insertUsr = db.prepare(`
    INSERT INTO usuarios (id,nombre,apellido,iniciales,email,password,rol,area,especialidad,nivel_acceso,activo)
    VALUES (@id,@nombre,@apellido,@iniciales,@email,@password,@rol,@area,@especialidad,@nivel_acceso,1)
  `);
  const insertEquipo = db.prepare(`
    INSERT INTO equipos (id,lab_id,nombre,tipo,fabricante,modelo,serie,procesador,ram,almacenamiento,so,ip,mac,monitor,teclado,mouse,estado,ultimo_encendido,observaciones)
    VALUES (@id,@lab_id,@nombre,@tipo,@fabricante,@modelo,@serie,@procesador,@ram,@almacenamiento,@so,@ip,@mac,@monitor,@teclado,@mouse,@estado,@ultimo_encendido,@observaciones)
  `);
  const insertAgenda = db.prepare(`
    INSERT INTO agenda (id,lab_id,usuario_id,fecha,hora_inicio,hora_fin,motivo,estado)
    VALUES (@id,@lab_id,@usuario_id,@fecha,@hora_inicio,@hora_fin,@motivo,@estado)
  `);
  const insertReporte = db.prepare(`
    INSERT INTO reportes (id,tipo,titulo,descripcion,fecha,generado_por,datos)
    VALUES (@id,@tipo,@titulo,@descripcion,@fecha,@generado_por,@datos)
  `);

  db.exec("BEGIN");
  try {
    for (const l of LABORATORIOS) {
      insertLab.run({
        id: l.id, nombre: l.nombre, sala: l.sala, ubicacion: l.ubicacion, equipos: l.equipos,
        estado: l.estado, so: l.so, procesador: l.procesador, ram: l.ram,
        almacenamiento: l.almacenamiento, red: l.red, responsable: l.responsable,
        responsable_id: l.responsableId, horario: l.horario, servicios: JSON.stringify(l.servicios),
        descripcion: l.descripcion, foto: l.foto,
        pos_x: l.posicion.x, pos_y: l.posicion.y, pos_w: l.posicion.w, pos_h: l.posicion.h
      });

      // Genera los equipos de cada laboratorio (mismo criterio que la versión anterior)
      for (let i = 1; i <= l.equipos; i++) {
        const idEq = `${l.id}-PC${String(i).padStart(2, "0")}`;
        insertEquipo.run({
          id: idEq, lab_id: l.id, nombre: `PC-${l.id}${String(i).padStart(2, "0")}`,
          tipo: "Desktop", fabricante: "HP",
          modelo: i <= 10 ? "ProDesk 400 G7" : "EliteDesk 800 G6",
          serie: `SN${l.id}${String(1000 + i)}`,
          procesador: l.procesador, ram: l.ram, almacenamiento: l.almacenamiento, so: l.so,
          ip: `192.168.${10 + l.id}.${100 + i}`,
          mac: `AA:BB:CC:${String(l.id).padStart(2, "0")}:${String(i).padStart(2, "0")}:FF`,
          monitor: '22" Full HD', teclado: "USB estándar", mouse: "USB óptico",
          estado: i === 3 && l.id === 4 ? "falla" : l.estado === "mantencion" ? "mantencion" : "activo",
          ultimo_encendido: "2026-08-20 08:15",
          observaciones: i === 3 && l.id === 4 ? "Disco duro con sectores defectuosos" : ""
        });
      }
    }

    for (const u of USUARIOS) {
      insertUsr.run({
        id: u.id, nombre: u.nombre, apellido: u.apellido, iniciales: u.iniciales,
        email: u.email, password: u.password, rol: u.rol, area: u.area,
        especialidad: u.especialidad, nivel_acceso: u.nivelAcceso
      });
    }

    for (const r of AGENDA) {
      insertAgenda.run({
        id: r.id, lab_id: r.labId, usuario_id: r.usuarioId, fecha: r.fecha,
        hora_inicio: r.horaInicio, hora_fin: r.horaFin, motivo: r.motivo, estado: r.estado
      });
    }

    for (const r of REPORTES) {
      insertReporte.run({
        id: r.id, tipo: r.tipo, titulo: r.titulo, descripcion: r.descripcion,
        fecha: r.fecha, generado_por: r.generadoPor, datos: JSON.stringify(r.datos)
      });
    }

    db.prepare("INSERT INTO config (id, data) VALUES (1, ?)").run(JSON.stringify(CONFIG_DEFAULT));

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  console.log("Datos de ejemplo cargados: 5 laboratorios, equipos, 7 usuarios, agenda y reportes.");
}

module.exports = db;
