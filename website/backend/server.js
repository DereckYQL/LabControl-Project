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

// Límite alto porque los reportes pueden llevar adjuntos (imágenes, PDF…) en base64
app.use(express.json({ limit: "30mb" }));

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
    fecha: row.fecha, generadoPor: row.generado_por, datos: JSON.parse(row.datos || "{}"),
    adjuntos: JSON.parse(row.adjuntos || "[]")
  };
}

function notifFromRow(row) {
  return {
    id: row.id, usuarioId: row.usuario_id, tipo: row.tipo, titulo: row.titulo,
    mensaje: row.mensaje, reporteId: row.reporte_id, fecha: row.fecha, leida: !!row.leida
  };
}

/** Nombre del laboratorio o "laboratorio" si no existe */
function nombreLab(labId) {
  return db.prepare("SELECT nombre FROM laboratorios WHERE id = ?").get(labId)?.nombre ?? "laboratorio";
}

/**
 * Crea una notificación y la guarda en la base de datos.
 *
 * - `toggle`      : interruptor de Configuración → Notificaciones que la controla
 *                   (alertaReportes / alertaFallas / alertaDisponibilidad / alertaReservas).
 * - `destinatario`: si se indica, la notificación va solo a ese usuario
 *                   (ej. confirmación de una reserva); si no, va a todos los
 *                   usuarios activos excepto al autor del cambio.
 */
function crearNotificacion({ toggle, tipo, titulo, mensaje, actorId = null, destinatario, referencia = null }) {
  try {
    const cfg = JSON.parse(db.prepare("SELECT data FROM config WHERE id = 1").get()?.data || "{}");
    if (cfg.notificaciones?.[toggle] === false) return;
    if (!titulo || !destinatario) return;

    let quien = "Alguien";
    if (actorId != null) {
      const actor = db.prepare("SELECT nombre, apellido FROM usuarios WHERE id = ?").get(actorId);
      if (actor) quien = `${actor.nombre} ${actor.apellido}`;
    }

    const fecha = new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, reporte_id, fecha, leida)
      VALUES (?,?,?,?,?,?,0)
    `).run(
      destinatario,
      tipo ?? toggle,
      String(titulo),
      String(mensaje ?? "").replace(/\{quien\}/g, quien),
      referencia,
      fecha
    );
  } catch (e) {
    console.error("No se pudo registrar la notificación:", e.message);
  }
}

/** Notifica un cambio a todos los usuarios activos menos al autor */
function notificarATodos(opciones) {
  try {
    const destinatarios = db.prepare("SELECT id FROM usuarios WHERE activo = 1 AND id != ?").all(opciones.actorId ?? "");
    for (const d of destinatarios) crearNotificacion({ ...opciones, destinatario: d.id });
  } catch (e) {
    console.error("No se pudo registrar la notificación:", e.message);
  }
}

/**
 * Notifica la creación, edición o eliminación de un reporte. Si el reporte es
 * de tipo "fallas" se usa el interruptor de fallas de equipos; el resto usa el
 * de nuevos reportes.
 */
function notificarCambioReporte(accion, rep, actorId) {
  const esFalla = rep?.tipo === "fallas";
  const textos = esFalla ? {
    creado:    { titulo: "Falla de equipo reportada", mensaje: `{quien} registró la falla "${rep.titulo}".` },
    editado:   { titulo: "Falla actualizada",         mensaje: `{quien} actualizó la falla "${rep.titulo}".` },
    eliminado: { titulo: "Falla eliminada",           mensaje: `{quien} eliminó el registro de falla "${rep.titulo}".` }
  } : {
    creado:    { titulo: "Nuevo reporte disponible",  mensaje: `{quien} generó el reporte "${rep.titulo}".` },
    editado:   { titulo: "Reporte actualizado",       mensaje: `{quien} editó el reporte "${rep.titulo}".` },
    eliminado: { titulo: "Reporte eliminado",         mensaje: `{quien} eliminó el reporte "${rep.titulo}".` }
  };
  const texto = textos[accion];
  if (!texto) return;
  notificarATodos({
    toggle: esFalla ? "alertaFallas" : "alertaReportes",
    tipo: accion,
    titulo: texto.titulo,
    mensaje: texto.mensaje,
    actorId,
    referencia: accion === "eliminado" ? null : rep.id
  });
}

/** Notifica un cambio de estado de un laboratorio (disponible/ocupado/mantención) */
const ETIQUETAS_ESTADO = { disponible: "Disponible", ocupado: "Ocupado", mantencion: "Mantención" };
function notificarCambioEstadoLab(lab, estadoNuevo, estadoAnterior, actorId) {
  if (!lab || estadoNuevo === estadoAnterior) return;
  notificarATodos({
    toggle: "alertaDisponibilidad",
    tipo: "laboratorio",
    titulo: "Estado de laboratorio actualizado",
    mensaje: `{quien} marcó ${lab.nombre} como "${ETIQUETAS_ESTADO[estadoNuevo] ?? estadoNuevo}".`,
    actorId,
    referencia: String(lab.id)
  });
}

/** Notifica una nueva reserva: confirmación al autor + aviso al resto */
function notificarNuevaReserva(reserva, actorId) {
  const lab = nombreLab(reserva.labId);
  const horario = `${reserva.horaInicio ?? "—"}${reserva.horaFin ? ` - ${reserva.horaFin}` : ""}`;
  crearNotificacion({
    toggle: "alertaReservas",
    tipo: "reserva_confirmada",
    titulo: "Reserva confirmada",
    mensaje: `Tu reserva de ${lab} para el ${reserva.fecha} (${horario}) quedó registrada.`,
    destinatario: reserva.usuarioId
  });
  notificarATodos({
    toggle: "alertaReservas",
    tipo: "reserva",
    titulo: "Nueva reserva de laboratorio",
    mensaje: `{quien} reservó ${lab} para el ${reserva.fecha} (${horario}).`,
    actorId
  });
}

/** Notifica la cancelación de una reserva a todos los usuarios menos a quien la canceló */
function notificarReservaCancelada(reserva, actorId) {
  if (!reserva) return;
  const lab = nombreLab(reserva.labId);
  notificarATodos({
    toggle: "alertaReservas",
    tipo: "reserva_cancelada",
    titulo: "Reserva cancelada",
    mensaje: `{quien} canceló la reserva de ${lab} para el ${reserva.fecha}.`,
    actorId
  });
}

/** Solo el administrador o el creador del reporte pueden modificarlo/eliminarlo */
function puedeModificarReporte(rep, req) {
  const uid = req.query.usuarioId || req.body?.usuarioId;
  if (!uid) return false;
  const usr = db.prepare("SELECT rol FROM usuarios WHERE id = ?").get(uid);
  return usr?.rol === "admin" || rep.generado_por === uid;
}

/** Valida la lista de adjuntos que llega desde el frontend */
function sanitizarAdjuntos(adjuntos) {
  if (!Array.isArray(adjuntos)) return [];
  return adjuntos.slice(0, 10).map((a) => ({
    nombre: String(a.nombre ?? "archivo").slice(0, 255),
    tipo: String(a.tipo ?? "application/octet-stream").slice(0, 100),
    tamano: Number(a.tamano) || 0,
    data: typeof a.data === "string" && a.data.length <= 15_000_000 ? a.data : ""
  })).filter((a) => a.data);
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
  const { estado, usuarioId } = req.body;
  if (!["disponible", "ocupado", "mantencion"].includes(estado)) {
    return res.status(400).json({ error: "Estado inválido" });
  }
  const anterior = db.prepare("SELECT * FROM laboratorios WHERE id = ?").get(req.params.id);
  if (!anterior) return res.status(404).json({ error: "Laboratorio no encontrado" });

  db.prepare("UPDATE laboratorios SET estado = ? WHERE id = ?").run(estado, req.params.id);
  const lab = labFromRow(db.prepare("SELECT * FROM laboratorios WHERE id = ?").get(req.params.id));

  // Avisa a los demás usuarios del cambio de disponibilidad
  notificarCambioEstadoLab(lab, estado, anterior.estado, usuarioId);

  res.json(lab);
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
  `).run(id, r.labId, r.usuarioId, r.fecha, r.horaInicio ?? null, r.horaFin ?? null, r.motivo, r.estado || "pendiente");

  const reserva = agFromRow(db.prepare("SELECT * FROM agenda WHERE id = ?").get(id));
  notificarNuevaReserva(reserva, r.usuarioId);

  res.status(201).json(reserva);
});

app.delete("/api/agenda/:id", (req, res) => {
  const actual = db.prepare("SELECT * FROM agenda WHERE id = ?").get(req.params.id);
  if (!actual) return res.status(404).json({ error: "Reserva no encontrada" });

  db.prepare("DELETE FROM agenda WHERE id = ?").run(req.params.id);
  notificarReservaCancelada(agFromRow(actual), req.query.usuarioId || req.body?.usuarioId);
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
  // Título y descripción son obligatorios (la descripción no tiene límite fijo)
  if (!r.tipo || !r.titulo?.trim() || !r.descripcion?.trim()) {
    return res.status(400).json({ error: "El título y la descripción son obligatorios" });
  }
  const id = r.id || `rep_${Date.now()}`;
  db.prepare(`
    INSERT INTO reportes (id, tipo, titulo, descripcion, fecha, generado_por, datos, adjuntos)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, r.tipo, r.titulo.trim(), r.descripcion, r.fecha, r.generadoPor || null,
         JSON.stringify(r.datos || {}), JSON.stringify(sanitizarAdjuntos(r.adjuntos)));

  const rep = repFromRow(db.prepare("SELECT * FROM reportes WHERE id = ?").get(id));
  notificarCambioReporte("creado", rep, r.generadoPor);
  res.status(201).json(rep);
});

app.patch("/api/reportes/:id", (req, res) => {
  const actual = db.prepare("SELECT * FROM reportes WHERE id = ?").get(req.params.id);
  if (!actual) return res.status(404).json({ error: "Reporte no encontrado" });
  if (!puedeModificarReporte(actual, req)) {
    return res.status(403).json({ error: "Solo el administrador o el creador pueden editar este reporte" });
  }

  const r = req.body;
  if ((r.titulo !== undefined && !String(r.titulo).trim()) ||
      (r.descripcion !== undefined && !String(r.descripcion).trim())) {
    return res.status(400).json({ error: "El título y la descripción son obligatorios" });
  }

  db.prepare(`
    UPDATE reportes SET
      tipo        = ?,
      titulo      = ?,
      descripcion = ?,
      fecha       = ?,
      datos       = ?,
      adjuntos    = ?
    WHERE id = ?
  `).run(
    r.tipo ?? actual.tipo,
    r.titulo?.trim() ?? actual.titulo,
    r.descripcion ?? actual.descripcion,
    r.fecha ?? actual.fecha,
    JSON.stringify(r.datos ?? JSON.parse(actual.datos || "{}")),
    JSON.stringify(r.adjuntos !== undefined ? sanitizarAdjuntos(r.adjuntos) : JSON.parse(actual.adjuntos || "[]")),
    req.params.id
  );

  const rep = repFromRow(db.prepare("SELECT * FROM reportes WHERE id = ?").get(req.params.id));
  notificarCambioReporte("editado", rep, r.usuarioId);
  res.json(rep);
});

app.delete("/api/reportes/:id", (req, res) => {
  const actual = db.prepare("SELECT * FROM reportes WHERE id = ?").get(req.params.id);
  if (!actual) return res.status(404).json({ error: "Reporte no encontrado" });
  if (!puedeModificarReporte(actual, req)) {
    return res.status(403).json({ error: "Solo el administrador o el creador pueden eliminar este reporte" });
  }

  db.prepare("DELETE FROM reportes WHERE id = ?").run(req.params.id);
  notificarCambioReporte("eliminado", repFromRow(actual), req.query.usuarioId);
  res.status(204).end();
});

/* ==========================================================================
   NOTIFICACIONES
   ========================================================================== */

app.get("/api/notificaciones", (req, res) => {
  const { usuarioId } = req.query;
  const rows = usuarioId
    ? db.prepare("SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 50").all(usuarioId)
    : db.prepare("SELECT * FROM notificaciones ORDER BY id DESC LIMIT 50").all();
  res.json(rows.map(notifFromRow));
});

app.patch("/api/notificaciones/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM notificaciones WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Notificación no encontrada" });
  db.prepare("UPDATE notificaciones SET leida = ? WHERE id = ?").run(req.body?.leida ? 1 : 0, req.params.id);
  res.json(notifFromRow(db.prepare("SELECT * FROM notificaciones WHERE id = ?").get(req.params.id)));
});

// Marcar como leídas todas las notificaciones de un usuario
app.post("/api/notificaciones/leer-todas", (req, res) => {
  const { usuarioId } = req.body || {};
  if (!usuarioId) return res.status(400).json({ error: "Falta usuarioId" });
  db.prepare("UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?").run(usuarioId);
  res.json({ ok: true });
});

app.delete("/api/notificaciones/:id", (req, res) => {
  const info = db.prepare("DELETE FROM notificaciones WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Notificación no encontrada" });
  res.status(204).end();
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
