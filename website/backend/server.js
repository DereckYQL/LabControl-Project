/**
 * server.js
 * API REST de LabControl Liceo, sobre SQLite (ver db.js), y sirve además
 * el sitio estático (../) para no tener que levantar dos servidores.
 *
 * Arranque:
 *   cd backend
 *   npm install
 *   npm start
 * Luego abrir: http://localhost:3000/login.html
 */

const path = require("path");
const express = require("express");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* ==========================================================================
   Helpers: fila de SQLite (snake_case) -> objeto que espera el frontend (camelCase)
   ========================================================================== */

function labFromRow(row) {
  return {
    id: row.id, nombre: row.nombre, sala: row.sala, ubicacion: row.ubicacion,
    equipos: row.equipos, estado: row.estado, so: row.so, procesador: row.procesador,
    ram: row.ram, almacenamiento: row.almacenamiento, red: row.red,
    responsable: row.responsable, responsableId: row.responsable_id,
    horario: row.horario, servicios: JSON.parse(row.servicios || "[]"),
    descripcion: row.descripcion, foto: row.foto,
    posicion: { x: row.pos_x, y: row.pos_y, w: row.pos_w, h: row.pos_h }
  };
}

function eqFromRow(row) {
  return {
    id: row.id, labId: row.lab_id, nombre: row.nombre, tipo: row.tipo,
    fabricante: row.fabricante, modelo: row.modelo, serie: row.serie,
    procesador: row.procesador, ram: row.ram, almacenamiento: row.almacenamiento,
    so: row.so, ip: row.ip, mac: row.mac, monitor: row.monitor,
    teclado: row.teclado, mouse: row.mouse, estado: row.estado,
    ultimoEncendido: row.ultimo_encendido, observaciones: row.observaciones
  };
}

function usrFromRow(row, { conPassword = false } = {}) {
  const u = {
    id: row.id, nombre: row.nombre, apellido: row.apellido, iniciales: row.iniciales,
    email: row.email, rol: row.rol, area: row.area, especialidad: row.especialidad,
    nivelAcceso: row.nivel_acceso, activo: !!row.activo
  };
  if (conPassword) u.password = row.password;
  return u;
}

function agFromRow(row) {
  return {
    id: row.id, labId: row.lab_id, usuarioId: row.usuario_id, fecha: row.fecha,
    horaInicio: row.hora_inicio, horaFin: row.hora_fin, motivo: row.motivo, estado: row.estado
  };
}

function repFromRow(row) {
  return {
    id: row.id, tipo: row.tipo, titulo: row.titulo, descripcion: row.descripcion,
    fecha: row.fecha, generadoPor: row.generado_por, datos: JSON.parse(row.datos || "{}")
  };
}

/* ==========================================================================
   LABORATORIOS
   ========================================================================== */

app.get("/api/laboratorios", (req, res) => {
  const rows = db.prepare("SELECT * FROM laboratorios ORDER BY id").all();
  res.json(rows.map(labFromRow));
});

app.get("/api/laboratorios/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM laboratorios WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Laboratorio no encontrado" });
  res.json(labFromRow(row));
});

app.patch("/api/laboratorios/:id", (req, res) => {
  const { estado } = req.body;
  if (!["disponible", "ocupado", "mantencion"].includes(estado)) {
    return res.status(400).json({ error: "Estado inválido" });
  }
  const info = db.prepare("UPDATE laboratorios SET estado = ? WHERE id = ?").run(estado, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Laboratorio no encontrado" });
  res.json(labFromRow(db.prepare("SELECT * FROM laboratorios WHERE id = ?").get(req.params.id)));
});

/* ==========================================================================
   EQUIPOS
   ========================================================================== */

app.get("/api/equipos", (req, res) => {
  const { labId } = req.query;
  const rows = labId
    ? db.prepare("SELECT * FROM equipos WHERE lab_id = ? ORDER BY id").all(labId)
    : db.prepare("SELECT * FROM equipos ORDER BY id").all();
  res.json(rows.map(eqFromRow));
});

/* ==========================================================================
   USUARIOS
   ========================================================================== */

app.get("/api/usuarios", (req, res) => {
  const rows = db.prepare("SELECT * FROM usuarios ORDER BY nombre").all();
  // Se incluye la contraseña para mantener el mismo comportamiento que la
  // versión anterior (verificación de "contraseña actual" en el navegador).
  // Ver README para cómo endurecer esto con sesiones reales en el backend.
  res.json(rows.map((r) => usrFromRow(r, { conPassword: true })));
});

app.get("/api/usuarios/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(usrFromRow(row, { conPassword: true }));
});

app.post("/api/usuarios", (req, res) => {
  const u = req.body;
  if (!u.id || !u.nombre || !u.apellido || !u.email || !u.password) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  const existe = db.prepare("SELECT id FROM usuarios WHERE id = ?").get(u.id);
  if (existe) return res.status(409).json({ error: "Ya existe un usuario con ese ID" });

  db.prepare(`
    INSERT INTO usuarios (id,nombre,apellido,iniciales,email,password,rol,area,especialidad,nivel_acceso,activo)
    VALUES (@id,@nombre,@apellido,@iniciales,@email,@password,@rol,@area,@especialidad,@nivel_acceso,1)
  `).run({
    id: u.id, nombre: u.nombre, apellido: u.apellido,
    iniciales: u.iniciales || `${u.nombre[0]}${u.apellido[0]}`.toUpperCase(),
    email: u.email, password: u.password, rol: u.rol || "otro_area",
    area: u.area || "", especialidad: u.especialidad || "",
    nivel_acceso: u.nivelAcceso || "basico"
  });

  const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(u.id);
  res.status(201).json(usrFromRow(row, { conPassword: true }));
});

app.patch("/api/usuarios/:id", (req, res) => {
  const actual = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.params.id);
  if (!actual) return res.status(404).json({ error: "Usuario no encontrado" });

  const map = {
    nombre: "nombre", apellido: "apellido", email: "email", password: "password",
    area: "area", especialidad: "especialidad", rol: "rol",
    nivelAcceso: "nivel_acceso", activo: "activo"
  };
  const sets = [];
  const valores = {};
  for (const [key, col] of Object.entries(map)) {
    if (req.body[key] !== undefined) { sets.push(`${col} = @${col}`); valores[col] = req.body[key]; }
  }
  if (!sets.length) return res.json(usrFromRow(actual, { conPassword: true }));

  valores.id = req.params.id;
  db.prepare(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = @id`).run(valores);
  res.json(usrFromRow(db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.params.id), { conPassword: true }));
});

/* ==========================================================================
   AGENDA / RESERVAS
   ========================================================================== */

app.get("/api/agenda", (req, res) => {
  const rows = db.prepare("SELECT * FROM agenda ORDER BY fecha, hora_inicio").all();
  res.json(rows.map(agFromRow));
});

app.post("/api/agenda", (req, res) => {
  const r = req.body;
  if (!r.labId || !r.usuarioId || !r.fecha || !r.motivo) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  const id = r.id || `res_${Date.now()}`;
  db.prepare(`
    INSERT INTO agenda (id, lab_id, usuario_id, fecha, hora_inicio, hora_fin, motivo, estado)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, r.labId, r.usuarioId, r.fecha, r.horaInicio, r.horaFin, r.motivo, r.estado || "pendiente");

  res.status(201).json(agFromRow(db.prepare("SELECT * FROM agenda WHERE id = ?").get(id)));
});

app.delete("/api/agenda/:id", (req, res) => {
  const info = db.prepare("DELETE FROM agenda WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Reserva no encontrada" });
  res.status(204).end();
});

/* ==========================================================================
   REPORTES
   ========================================================================== */

app.get("/api/reportes", (req, res) => {
  const rows = db.prepare("SELECT * FROM reportes ORDER BY fecha DESC").all();
  res.json(rows.map(repFromRow));
});

app.post("/api/reportes", (req, res) => {
  const r = req.body;
  if (!r.tipo || !r.titulo) return res.status(400).json({ error: "Faltan campos obligatorios" });
  const id = r.id || `rep_${Date.now()}`;
  db.prepare(`
    INSERT INTO reportes (id, tipo, titulo, descripcion, fecha, generado_por, datos)
    VALUES (?,?,?,?,?,?,?)
  `).run(id, r.tipo, r.titulo, r.descripcion || "", r.fecha, r.generadoPor || null, JSON.stringify(r.datos || {}));

  res.status(201).json(repFromRow(db.prepare("SELECT * FROM reportes WHERE id = ?").get(id)));
});

/* ==========================================================================
   CONFIGURACIÓN (una fila con un JSON)
   ========================================================================== */

app.get("/api/config", (req, res) => {
  const row = db.prepare("SELECT data FROM config WHERE id = 1").get();
  res.json(JSON.parse(row.data));
});

app.patch("/api/config", (req, res) => {
  const row = db.prepare("SELECT data FROM config WHERE id = 1").get();
  const actual = JSON.parse(row.data);
  const nuevo = { ...actual };

  // Fusión de un nivel (sitio / red / notificaciones / seguridad / laboratorios)
  for (const [key, valor] of Object.entries(req.body)) {
    nuevo[key] = (typeof valor === "object" && valor !== null && actual[key])
      ? { ...actual[key], ...valor }
      : valor;
  }

  db.prepare("UPDATE config SET data = ? WHERE id = 1").run(JSON.stringify(nuevo));
  res.json(nuevo);
});

/* ==========================================================================
   LOGIN
   ========================================================================== */

app.post("/api/login", (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: "Faltan credenciales" });

  const row = db.prepare(`
    SELECT * FROM usuarios WHERE (id = ? OR email = ?) AND password = ? AND activo = 1
  `).get(usuario, usuario, password);

  if (!row) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  res.json(usrFromRow(row));
});

/* ==========================================================================
   Frontend estático (la carpeta que contiene login.html, index.html, etc.)
   ========================================================================== */

app.use(express.static(path.join(__dirname, "..")));

app.listen(PORT, () => {
  console.log(`\n  LabControl Liceo`);
  console.log(`  API + sitio corriendo en: http://localhost:${PORT}/login.html\n`);
});
