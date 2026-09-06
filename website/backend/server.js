/* server.js — API REST (Express + SQLite) y sirve el sitio de public/.
   Arranque: cd backend && npm install && npm start  (http://localhost:3000) */

import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { body, validationResult } from "express-validator";
import { db, DB_PATH, reemplazarBaseDesdeBuffer } from "./db.js";
import { generaSecreto, verificarCodigo } from "./totp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

// Clave JWT — en producción usar variable de entorno; si no existe, se genera
// una aleatoria por arranque (las sesiones se invalidan al reiniciar).
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(48).toString("hex");
// En producción los access tokens viven 2h; los tests e2e pueden acortarlo
// con LC_JWT_EXPIRES para ejercitar la renovación automática.
const JWT_EXPIRES = process.env.LC_JWT_EXPIRES || "2h";
const JWT_REFRESH_EXPIRES = "30d";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
if (!process.env.JWT_SECRET) {
  console.warn("  AVISO: JWT_SECRET no está definido. Se generó una clave aleatoria; las sesiones expiran al reiniciar el servidor.");
}

/* Seguridad */

// Headers de seguridad (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "same-origin" },
  permissionsPolicy: {
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
      usb: []
    }
  }
}));

// Respuestas de la API: no almacenables en caché (datos sensibles de sesión).
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// CORS — permitir mismo origen (frontend servido por el mismo server)
app.use(cors({
  origin: process.env.ORIGIN ? process.env.ORIGIN.split(",") : false,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Límite de body (reportes con adjuntos base64)
app.use(express.json({ limit: "10mb" }));

// Rate limiting general (los tests e2e pueden ampliarlo con LC_API_LIMIT).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.LC_API_LIMIT ? Number(process.env.LC_API_LIMIT) : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Intenta de nuevo en 15 minutos." }
});
app.use("/api/", generalLimiter);

// Rate limiting adicional en rutas de escritura (evita abusos de creación/PATCH/borrado)
const escrituraLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.LC_ESCRITURA_LIMIT ? Number(process.env.LC_ESCRITURA_LIMIT) : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en 1 minuto." }
});
app.use(["/api/usuarios", "/api/agenda", "/api/reportes", "/api/config", "/api/notificaciones", "/api/laboratorios", "/api/solicitudes-especialidad"], escrituraLimiter);

// Rate limiting estricto en login (por IP y por cuenta: bloquea fuerza bruta
// por usuario aunque las IP roten). LC_LOGIN_LIMIT permite ampliarlo en los
// tests e2e, que inician sesión muchas veces en la misma corrida.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LC_LOGIN_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.loginId ?? req.body?.usuario ?? "").toLowerCase().trim().slice(0, 24)}`,
  validate: false,
  message: { error: "Demasiados intentos de inicio de sesión. Espera 15 minutos." }
});

// Registro de cuentas nuevas: pocas cuentas por hora e IP (evita spam de cuentas).
const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.LC_REGISTRO_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de registro. Intenta de nuevo más tarde." }
});
app.use("/api/registro", registroLimiter);

// Recuperación de contraseña: por IP y por cuenta (evita abuso del envío de correos).
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.LC_RESET_LIMIT) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email ?? req.params?.token ?? "").toLowerCase().trim().slice(0, 80)}`,
  validate: false,
  message: { error: "Demasiadas solicitudes de recuperación de contraseña. Espera 1 hora." }
});
app.use("/api/recuperar-contrasena", resetLimiter);

// Rate limiting en renovación/cierre de sesión (token rotation es sensible).
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas renovaciones de sesión. Intenta de nuevo en 15 minutos." }
});

/* Autenticación y autorización */
// Verifica el JWT del header y deja el payload en req.user.
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token de autenticación requerido" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Solo los tokens de acceso pasan; un token de refresco jamás autentica.
    if (decoded.tipo && decoded.tipo !== "access") {
      return res.status(403).json({ error: "Token inválido" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Sesión expirada. Inicia sesión nuevamente." });
    }
    return res.status(403).json({ error: "Token inválido" });
  }
}

// Solo admin
function requireAdmin(req, res, next) {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ error: "Se requieren permisos de administrador" });
  }
  next();
}

/* Paginación opcional: ?pagina=1&limite=20 */

const LIMITE_MAX = 100;

function paginacionDe(req) {
  const tienePagina = req.query.pagina !== undefined || req.query.page !== undefined;
  const tieneLimite = req.query.limite !== undefined || req.query.limit !== undefined;
  if (!tienePagina && !tieneLimite) return null;

  const limite = Number.parseInt(req.query.limite ?? req.query.limit, 10);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) {
    const err = new Error(`El parámetro 'limite' debe ser un entero entre 1 y ${LIMITE_MAX}`);
    err.status = 400;
    throw err;
  }
  const pagina = Number.parseInt(req.query.pagina ?? req.query.page, 10);
  return { pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1, limite };
}

function responderLista(req, res, elementos) {
  const pag = paginacionDe(req);
  if (!pag) return res.json(elementos);
  const total = elementos.length;
  const inicio = (pag.pagina - 1) * pag.limite;
  res.json({
    data: elementos.slice(inicio, inicio + pag.limite),
    total,
    pagina: pag.pagina,
    totalPaginas: Math.max(1, Math.ceil(total / pag.limite)),
    limite: pag.limite
  });
}

/* Helpers */

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

// Usuario sin el campo password
function usrFromRow(row) {
  return {
    id: row.id, nombre: row.nombre, apellido: row.apellido, iniciales: row.iniciales,
    email: row.email, rol: row.rol, area: row.area, especialidad: row.especialidad,
    nivelAcceso: row.nivel_acceso, activo: !!row.activo
  };
}

// Roles con permiso para ver datos técnicos (hardware / red)
function esTecnico(rol) {
  return rol === "admin" || rol === "programacion";
}

function labFromRowVisible(row, req) {
  const lab = labFromRow(row);
  if (esTecnico(req.user?.rol)) return lab;
  const { so, procesador, ram, almacenamiento, red, ...visible } = lab;
  void so; void procesador; void ram; void almacenamiento; void red;
  return visible;
}

function eqFromRowVisible(row, req) {
  const eq = eqFromRow(row);
  if (esTecnico(req.user?.rol)) return eq;
  const { procesador, ram, almacenamiento, so, serie, ip, mac, ...visible } = eq;
  void procesador; void ram; void almacenamiento; void so; void serie; void ip; void mac;
  return visible;
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
    mensaje: row.mensaje, reporteId: row.reporte_id, solicitudId: row.solicitud_id ?? null,
    fecha: row.fecha, leida: !!row.leida
  };
}

function solicitudFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, usuarioId: row.usuario_id,
    especialidadActual: row.especialidad_actual,
    especialidadSolicitada: row.especialidad_solicitada,
    estado: row.estado,
    creadaEn: row.creada_en,
    resueltaPor: row.resuelta_por,
    resueltaEn: row.resuelta_en
  };
}

function nombreLab(labId) {
  return db.prepare("SELECT nombre FROM laboratorios WHERE id = ?").get(labId)?.nombre ?? "laboratorio";
}

function crearNotificacion({ toggle, tipo, titulo, mensaje, actorId = null, destinatario, referencia = null, solicitudId = null }) {
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
      INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, reporte_id, solicitud_id, fecha, leida)
      VALUES (?,?,?,?,?,?,?,0)
    `).run(
      destinatario,
      tipo ?? toggle,
      String(titulo),
      String(mensaje ?? "").replace(/\{quien\}/g, quien),
      referencia,
      solicitudId ?? null,
      fecha
    );
  } catch (e) {
    console.error("No se pudo registrar la notificación:", e.message);
  }
}

/* Auditoría de actividad */
// Respeta el interruptor config.seguridad.registroActividad; nunca rompe la petición.

function audFromRow(row) {
  return {
    id: row.id, fecha: row.fecha, usuarioId: row.usuario_id, rol: row.rol,
    accion: row.accion, detalle: JSON.parse(row.detalle || "{}"), ip: row.ip
  };
}

function registrarAuditoria(req, accion, detalle = {}, contexto = null) {
  try {
    const cfg = JSON.parse(db.prepare("SELECT data FROM config WHERE id = 1").get()?.data || "{}");
    if (cfg.seguridad?.registroActividad === false) return;
    // Antes del login no hay req.user (aún no hay token); el contexto permite
    // asociar el usuario aunque la sesión aún no exista.
    const origen = contexto ?? req.user ?? null;
    db.prepare(`INSERT INTO auditoria (fecha, usuario_id, rol, accion, detalle, ip) VALUES (?,?,?,?,?,?)`)
      .run(new Date().toISOString(), origen?.id ?? null, origen?.rol ?? null, accion, JSON.stringify(detalle), String(req.ip || ""));
  } catch {
    // La auditoría nunca debe tumbar la petición en curso.
  }
}

/* Verificación en dos pasos (2FA) */
// Desafíos de login (en memoria): un login con 2FA activo emite un desafío de
// corta duración y solo entrega tokens tras validar el código TOTP.
const DESAFIOS_2FA = new Map();          // loginId -> { usuarioId, expira, intentos }
const DESAFIO_TTL_MS = 5 * 60 * 1000;
const DESAFIO_MAX_INTENTOS = 5;
const PENDIENTES_2FA = new Map();        // usuarioId -> { secreto, otpauth, expira }

function limpiarDesafiosVencidos() {
  const ahora = Date.now();
  for (const [clave, dato] of DESAFIOS_2FA) if (dato.expira < ahora) DESAFIOS_2FA.delete(clave);
  for (const [clave, dato] of PENDIENTES_2FA) if (dato.expira < ahora) PENDIENTES_2FA.delete(clave);
}

function notificarATodos(opciones) {
  try {
    const destinatarios = db.prepare("SELECT id FROM usuarios WHERE activo = 1 AND id != ?").all(opciones.actorId ?? "");
    for (const d of destinatarios) crearNotificacion({ ...opciones, destinatario: d.id });
  } catch (e) {
    console.error("No se pudo registrar la notificación:", e.message);
  }
}

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

// Solo admin o el creador pueden editar el reporte
function puedeModificarReporte(rep, req) {
  const uid = req.user?.id;
  if (!uid) return false;
  if (req.user?.rol === "admin") return true;
  return rep.generado_por === uid;
}

// Adjuntos: validación estricta por allowlist de tipo MIME y tamaño máximo.
const MAX_ARCHIVO_ADJUNTO = 6 * 1024 * 1024; // 6 MB por archivo (body total 10 MB)
const MAX_ARCHIVOS = 10;
const TIPOS_ADJUNTO = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/csv",
  "application/zip", "application/x-rar-compressed"
]);

function sanitizarAdjuntos(adjuntos) {
  if (!Array.isArray(adjuntos)) return [];
  const resultado = [];
  for (const a of adjuntos.slice(0, MAX_ARCHIVOS)) {
    if (!a || typeof a !== "object") continue;
    const data = typeof a.data === "string" ? a.data : "";
    const t = String(a.tipo || "").toLowerCase();
    const tamano = Number(a.tamano) || 0;
    const valido =
      t && TIPOS_ADJUNTO.has(t) &&
      Number.isInteger(tamano) && tamano > 0 && tamano <= MAX_ARCHIVO_ADJUNTO &&
      data.length > 0 && data.length <= MAX_ARCHIVO_ADJUNTO &&
      /^data:(image|application|text)\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\r\n]*$/.test(data) &&
      data.startsWith(`data:${t};base64,`);
    if (!valido) continue;
    resultado.push({
      nombre: String(a.nombre ?? "archivo").replace(/[^\w.\- ]/gi, "").slice(0, 120) || "archivo",
      tipo: t,
      tamano,
      data
    });
  }
  return resultado;
}

// Texto libre: normaliza y limita el largo (el escape HTML se hace al renderizar).
function sanitizarTexto(valor, max = 5000) {
  if (typeof valor !== "string") return "";
  return String(valor).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
}

// Ids generados en cliente: solo se aceptan formatos seguros (evita inyección por atributo).
function nuevoId(prefijo, sugerido) {
  const candidato = typeof sugerido === "string" ? sugerido.trim() : "";
  if (candidato && /^[A-Za-z0-9_]{1,80}$/.test(candidato)) return candidato;
  return `${prefijo}_${Date.now()}`;
}

/* Login (con rate limit estricto) */

// Token de acceso: corto plazo, autentica las peticiones a la API.
function firmarAcceso(fila) {
  return jwt.sign(
    { tipo: "access", id: fila.id, rol: fila.rol, nombre: fila.nombre, apellido: fila.apellido, iniciales: fila.iniciales, nivelAcceso: fila.nivel_acceso },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// Token de refresco: largo plazo, se guarda en la tabla refresh_tokens y se
// rota en cada uso. Limpia además los tokens ya vencidos para no acumular filas.
function emitirRefreshToken(usuarioId) {
  db.prepare("DELETE FROM refresh_tokens WHERE expira_en < ?").run(Date.now());
  const id = randomBytes(32).toString("hex");
  const ahora = Date.now();
  db.prepare("INSERT INTO refresh_tokens (id, usuario_id, creado_en, expira_en, revocado) VALUES (?,?,?,?,0)")
    .run(id, usuarioId, ahora, ahora + REFRESH_TOKEN_TTL_MS);
  return jwt.sign(
    { tipo: "refresh", id, sub: usuarioId },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES }
  );
}

app.post("/api/login", loginLimiter, (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: "Faltan credenciales" });

  const row = db.prepare(`
    SELECT * FROM usuarios WHERE (id = ? OR email = ?) AND activo = 1
  `).get(usuario, usuario);

  if (!row || !bcrypt.compareSync(password, row.password)) {
    registrarAuditoria(req, "login_fallido", { usuario: String(usuario).slice(0, 60) });
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  // 2FA activo: se pide el código TOTP antes de emitir ningún token.
  if (row.totp_habilitado === 1 && row.totp_secreto) {
    limpiarDesafiosVencidos();
    const loginId = randomBytes(32).toString("hex");
    DESAFIOS_2FA.set(loginId, { usuarioId: row.id, expira: Date.now() + DESAFIO_TTL_MS, intentos: 0 });
    registrarAuditoria(req, "login_2fa_pendiente", { usuario: row.id }, { id: row.id, rol: row.rol });
    return res.json({ requires2FA: true, loginId, usuario: usrFromRow(row) });
  }

  registrarAuditoria(req, "login_ok", { usuario: row.id }, { id: row.id, rol: row.rol });
  const token = firmarAcceso(row);
  const refreshToken = emitirRefreshToken(row.id);

  res.json({ token, refreshToken, usuario: usrFromRow(row) });
});

// Segundo paso del login con 2FA: valida el código TOTP del desafío pendiente.
app.post("/api/login/2fa", loginLimiter, (req, res) => {
  const { loginId, codigo } = req.body || {};
  if (!loginId || !codigo) {
    return res.status(400).json({ error: "Faltan el identificador de inicio de sesión y el código" });
  }

  const desafio = DESAFIOS_2FA.get(loginId);
  if (!desafio || desafio.expira < Date.now()) {
    DESAFIOS_2FA.delete(loginId);
    return res.status(401).json({ error: "El intento de verificación expiró. Inicia sesión nuevamente." });
  }
  if (desafio.intentos >= DESAFIO_MAX_INTENTOS) {
    DESAFIOS_2FA.delete(loginId);
    return res.status(429).json({ error: "Demasiados intentos. Inicia sesión nuevamente." });
  }

  const row = db.prepare("SELECT * FROM usuarios WHERE id = ? AND activo = 1").get(desafio.usuarioId);
  if (!row || row.totp_habilitado !== 1 || !row.totp_secreto) {
    DESAFIOS_2FA.delete(loginId);
    return res.status(401).json({ error: "La verificación no está disponible. Inicia sesión nuevamente." });
  }

  if (!verificarCodigo(row.totp_secreto, String(codigo))) {
    desafio.intentos += 1;
    registrarAuditoria(req, "login_2fa_codigo_invalido", { usuario: row.id }, { id: row.id, rol: row.rol });
    return res.status(401).json({ error: "El código de verificación es incorrecto" });
  }

  DESAFIOS_2FA.delete(loginId);
  registrarAuditoria(req, "login_ok", { usuario: row.id, con2fa: true }, { id: row.id, rol: row.rol });
  const token = firmarAcceso(row);
  const refreshToken = emitirRefreshToken(row.id);
  res.json({ token, refreshToken, usuario: usrFromRow(row) });
});

/* Verificación en dos pasos (2FA) — gestión propia (entra a Configuración → Seguridad) */

// Estado del 2FA de la sesión actual.
app.get("/api/2fa/estado", authenticateToken, (req, res) => {
  const fila = db.prepare("SELECT totp_habilitado FROM usuarios WHERE id = ?").get(req.user.id);
  res.json({ habilitado: fila?.totp_habilitado === 1 });
});

// Inicia la configuración: genera un secreto nuevo (no se activa hasta verificar).
app.post("/api/2fa/setup", authenticateToken, requireAdmin, async (req, res) => {
  const fila = db.prepare("SELECT totp_habilitado FROM usuarios WHERE id = ?").get(req.user.id);
  if (fila?.totp_habilitado === 1) {
    return res.status(409).json({ error: "La verificación en dos pasos ya está activada" });
  }

  const secreto = generaSecreto();
  const emisor = "Liceo INSUCO - LabControl";
  const otpauth = `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(req.user.id)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`;

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220, color: { dark: "#1f2937", light: "#ffffff" } });
  } catch { /* el QR es opcional; el secreto se puede ingresar a mano */ }

  PENDIENTES_2FA.set(req.user.id, { secreto, otpauth, expira: Date.now() + DESAFIO_TTL_MS });
  registrarAuditoria(req, "2fa_configuracion_iniciada");
  res.json({ secreto, otpauthUrl: otpauth, qrDataUrl });
});

// Activa el 2FA tras verificar el código generado con el secreto pendiente.
app.post("/api/2fa/verificar", authenticateToken, requireAdmin, (req, res) => {
  const { codigo } = req.body || {};
  if (!codigo) return res.status(400).json({ error: "Falta el código de verificación" });

  const pendiente = PENDIENTES_2FA.get(req.user.id);
  if (!pendiente || pendiente.expira < Date.now()) {
    PENDIENTES_2FA.delete(req.user.id);
    return res.status(410).json({ error: "La configuración expiró. Vuelve a iniciarla." });
  }
  if (!verificarCodigo(pendiente.secreto, String(codigo))) {
    return res.status(401).json({ error: "El código de verificación es incorrecto" });
  }

  db.prepare("UPDATE usuarios SET totp_secreto = ?, totp_habilitado = 1 WHERE id = ?")
    .run(pendiente.secreto, req.user.id);
  PENDIENTES_2FA.delete(req.user.id);
  registrarAuditoria(req, "2fa_activada");
  res.json({ ok: true });
});

// Desactiva el 2FA (exige el código actual para confirmar).
app.post("/api/2fa/desactivar", authenticateToken, requireAdmin, (req, res) => {
  const { codigo } = req.body || {};
  const fila = db.prepare("SELECT totp_secreto, totp_habilitado FROM usuarios WHERE id = ?").get(req.user.id);
  if (!fila || fila.totp_habilitado !== 1) {
    return res.status(400).json({ error: "La verificación en dos pasos no está activada" });
  }
  if (!codigo) {
    return res.status(400).json({ error: "El código de verificación es obligatorio para desactivar" });
  }
  if (!verificarCodigo(fila.totp_secreto, String(codigo))) {
    return res.status(401).json({ error: "El código de verificación es incorrecto" });
  }

  db.prepare("UPDATE usuarios SET totp_secreto = NULL, totp_habilitado = 0 WHERE id = ?").run(req.user.id);
  registrarAuditoria(req, "2fa_desactivada");
  res.json({ ok: true });
});

/* Auditoría de actividad (solo administrador) */

app.get("/api/auditoria", authenticateToken, requireAdmin, (req, res) => {
  let rows = db.prepare("SELECT * FROM auditoria ORDER BY id DESC").all();

  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const usuario = typeof req.query.usuario === "string" ? req.query.usuario.trim() : "";
  const desde = typeof req.query.desde === "string" ? req.query.desde.trim() : "";
  const hasta = typeof req.query.hasta === "string" ? req.query.hasta.trim() : "";

  if (q || usuario || desde || hasta) {
    rows = rows.filter((r) => {
      const detalle = JSON.stringify(r.detalle || {});
      const criterio = `${r.accion} ${r.usuario_id || ""} ${r.rol || ""} ${detalle}`.toLowerCase();
      if (q && !criterio.includes(q)) return false;
      if (usuario && r.usuario_id !== usuario) return false;
      const fecha = (r.fecha || "").slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    });
  }

  responderLista(req, res, rows.map(audFromRow));
});

/* Respaldo de la base de datos (solo administrador) */

// Descargar: primero se vacía el WAL al archivo principal y se envía ese archivo.
app.get("/api/backups/exportar", authenticateToken, requireAdmin, (req, res) => {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const nombre = `labcontrol-backup-${new Date().toISOString().slice(0, 10)}-${Date.now()}.db`;
  registrarAuditoria(req, "backup_descargado");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  const stream = fs.createReadStream(DB_PATH);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "No se pudo leer la base de datos" });
    else res.end();
  });
  stream.pipe(res);
});

// Restaurar: se recibe el archivo .db como binario y se reemplaza la base actual.
app.post("/api/backups/restaurar", authenticateToken, requireAdmin,
  express.raw({ type: ["application/octet-stream", "application/x-sqlite3", "application/vnd.sqlite3"], limit: "60mb" }),
  (req, res) => {
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: "No se recibió ningún archivo" });
    }
    try {
      reemplazarBaseDesdeBuffer(buffer);
    } catch (err) {
      const status = err?.status || 400;
      return res.status(status).json({
        error: status === 400 ? err.message : "No se pudo restaurar el respaldo. La base anterior fue conservada."
      });
    }
    try { registrarAuditoria(req, "backup_restaurado"); } catch { /* tabla nueva en la base restaurada */ }
    res.json({ ok: true });
  }
);

// Renovación de sesión con rotación del refresh token: cada uso invalida el
// token anterior y emite uno nuevo, de modo que un token robado deja de servir
// en cuanto sea reutilizado o se cierre sesión.
app.post("/api/refresh", refreshLimiter, (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== "string" || !refreshToken) {
    return res.status(400).json({ error: "Falta el token de refresco" });
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Sesión expirada. Inicia sesión nuevamente." });
  }
  if (decoded.tipo !== "refresh" || !decoded.id) {
    return res.status(403).json({ error: "Token de refresco inválido" });
  }

  const fila = db.prepare("SELECT revocado, expira_en FROM refresh_tokens WHERE id = ?").get(decoded.id);
  if (!fila || fila.revocado === 1 || fila.expira_en < Date.now()) {
    return res.status(401).json({ error: "Sesión expirada. Inicia sesión nuevamente." });
  }

  const usuario = db.prepare("SELECT * FROM usuarios WHERE id = ? AND activo = 1").get(decoded.sub);
  if (!usuario) return res.status(401).json({ error: "Usuario no encontrado" });

  db.prepare("UPDATE refresh_tokens SET revocado = 1 WHERE id = ?").run(decoded.id);
  const nuevoRefresh = emitirRefreshToken(usuario.id);

  res.json({ token: firmarAcceso(usuario), refreshToken: nuevoRefresh, usuario: usrFromRow(usuario) });
});

// Cierre de sesión: revoca el refresh token entregado (best-effort).
app.post("/api/logout", refreshLimiter, (req, res) => {
  const { refreshToken } = req.body || {};
  let usuarioLogout = null;
  if (typeof refreshToken === "string" && refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      if (decoded.tipo === "refresh" && decoded.id) {
        usuarioLogout = decoded.sub ?? null;
        db.prepare("UPDATE refresh_tokens SET revocado = 1 WHERE id = ?").run(decoded.id);
      }
    } catch {
      // Token ya inválido o vencido: no hay nada que revocar.
    }
  }
  registrarAuditoria(req, "logout", { usuario: usuarioLogout });
  res.json({ ok: true });
});

// Cambio de contraseña (verifica la contraseña actual)
app.post("/api/change-password", authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
  }

  const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.user.id);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

  if (!bcrypt.compareSync(currentPassword, row.password)) {
    return res.status(401).json({ error: "La contraseña actual es incorrecta" });
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE usuarios SET password = ? WHERE id = ?").run(hashed, req.user.id);
  // Por seguridad, toda sesión de larga duración muere al cambiar la contraseña.
  db.prepare("UPDATE refresh_tokens SET revocado = 1 WHERE usuario_id = ?").run(req.user.id);
  registrarAuditoria(req, "password_cambiada");
  res.json({ ok: true, message: "Contraseña actualizada correctamente" });
});

/* Recuperación de contraseña (base lista; el correo real se envía con Resend) */
// El enlace de restablecimiento vive 30 minutos en `contrasena_resets`.
// Sin RESEND_API_KEY el servidor imprime el enlace en la consola (modo base);
// en producción define RESEND_API_KEY y, opcionalmente, RESEND_FROM.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function limpiarResetsExpirados() {
  db.prepare("DELETE FROM contrasena_resets WHERE expira_en < ?").run(Date.now());
}

async function enviarCorreoReseteo(email, enlace) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Base sin proveedor de correo: el enlace se muestra en la consola del server.
    console.log(`\n  [Recuperar contraseña] ${email}\n  Enlace de prueba: ${enlace}\n`);
    return;
  }
  const from = process.env.RESEND_FROM || "LabControl <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Restablece tu contraseña de LabControl",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
          <h2>Restablece tu contraseña</h2>
          <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en Insuco LabControl.</p>
          <p><a href="${enlace}">Restablecer mi contraseña</a></p>
          <p style="font-size:13px;color:#555">El enlace expira en 30 minutos. Si no solicitaste este cambio, ignora este correo.</p>
        </div>`
    })
  });
}

// Solicitar recuperación: siempre responde lo mismo (no revela si la cuenta existe).
app.post("/api/recuperar-contrasena", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Ingresa un correo válido" });
  }

  const usuario = db.prepare("SELECT id, email FROM usuarios WHERE lower(email) = ? AND activo = 1").get(email);
  if (usuario) {
    limpiarResetsExpirados();
    db.prepare("DELETE FROM contrasena_resets WHERE usuario_id = ?").run(usuario.id);
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO contrasena_resets (token, usuario_id, expira_en, usado) VALUES (?,?,?,0)")
      .run(token, usuario.id, Date.now() + RESET_TOKEN_TTL_MS);
    registrarAuditoria(req, "recuperacion_solicitada", { usuario: usuario.id });
    const enlace = `${req.protocol}://${req.get("host")}/login.html?reset=${token}`;
    enviarCorreoReseteo(usuario.email, enlace)
      .catch((e) => console.error("No se pudo enviar el correo de restablecimiento:", e?.message || e));
  }
  res.json({ ok: true });
});

// Completar restablecimiento con el token del enlace recibido por correo.
app.post("/api/recuperar-contrasena/:token", [
  body("newPassword").isLength({ min: 6 }).withMessage("La contraseña debe tener al menos 6 caracteres")
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Datos inválidos", details: errors.array() });
  }

  limpiarResetsExpirados();
  const fila = db.prepare("SELECT * FROM contrasena_resets WHERE token = ? AND usado = 0").get(req.params.token);
  if (!fila) return res.status(400).json({ error: "El enlace de restablecimiento es inválido o expiró" });

  const usuario = db.prepare("SELECT id FROM usuarios WHERE id = ? AND activo = 1").get(fila.usuario_id);
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

  db.prepare("UPDATE usuarios SET password = ? WHERE id = ?").run(bcrypt.hashSync(req.body.newPassword, 10), fila.usuario_id);
  db.prepare("UPDATE contrasena_resets SET usado = 1 WHERE token = ?").run(req.params.token);
  db.prepare("DELETE FROM contrasena_resets WHERE usuario_id = ? AND token != ?").run(fila.usuario_id, req.params.token);
  db.prepare("UPDATE refresh_tokens SET revocado = 1 WHERE usuario_id = ?").run(fila.usuario_id);
  registrarAuditoria(req, "password_restablecida", { usuario: fila.usuario_id });
  res.json({ ok: true, message: "Contraseña actualizada. Inicia sesión con tu nueva contraseña." });
});

/* Registro de cuenta propia (público, sin sesión) */
app.post("/api/registro", [
  body("id").trim().matches(/^[a-zA-Z0-9_]+$/).withMessage("El usuario solo puede contener letras, números y guion bajo"),
  body("nombre").trim().notEmpty().withMessage("El nombre es obligatorio"),
  body("apellido").trim().notEmpty().withMessage("El apellido es obligatorio"),
  body("email").isEmail().withMessage("El correo debe ser válido"),
  body("password").isLength({ min: 6 }).withMessage("La contraseña debe tener al menos 6 caracteres"),
  body("area").optional({ values: "falsy" }).trim().isLength({ max: 100 }).withMessage("El área no puede superar 100 caracteres"),
  body("especialidad").optional({ values: "falsy" }).trim().isLength({ max: 200 }).withMessage("La especialidad no puede superar 200 caracteres")
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Datos inválidos", details: errors.array() });
  }

  const u = req.body;
  u.id = String(u.id ?? "").trim();
  u.email = String(u.email ?? "").trim().toLowerCase();
  if (db.prepare("SELECT id FROM usuarios WHERE id = ?").get(u.id)) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese usuario" });
  }
  if (db.prepare("SELECT id FROM usuarios WHERE email = ?").get(u.email)) {
    return res.status(409).json({ error: "El correo ya está en uso por otra cuenta" });
  }

  const iniciales = `${(u.nombre[0] ?? "?")}${(u.apellido[0] ?? "")}`.toUpperCase();
  db.prepare(`
    INSERT INTO usuarios (id,nombre,apellido,iniciales,email,password,rol,area,especialidad,nivel_acceso,activo)
    VALUES (@id,@nombre,@apellido,@iniciales,@email,@password,@rol,@area,@especialidad,@nivel_acceso,1)
  `).run({
    id: u.id,
    nombre: sanitizarTexto(u.nombre, 100),
    apellido: sanitizarTexto(u.apellido, 100),
    iniciales,
    email: u.email,
    password: bcrypt.hashSync(u.password, 10),
    rol: "otro_area",
    area: sanitizarTexto(u.area, 100),
    especialidad: sanitizarTexto(u.especialidad, 200),
    nivel_acceso: "basico"
  });

  // Los administradores reciben una notificación con la cuenta nueva.
  const admins = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1").all();
  for (const a of admins) {
    crearNotificacion({
      toggle: "alertaNuevosUsuarios",
      tipo: "usuario_registrado",
      titulo: "Nuevo profesor registrado",
      mensaje: `{quien} se registró en el sistema (${u.id}). Revisa sus datos: área "${u.area || "—"}", especialidad "${u.especialidad || "—"}".`,
      actorId: u.id,
      destinatario: a.id
    });
  }

  registrarAuditoria(req, "usuario_registrado", { usuario: u.id, email: u.email });
  res.status(201).json(usrFromRow(db.prepare("SELECT * FROM usuarios WHERE id = ?").get(u.id)));
});

/* Laboratorios */

app.get("/api/laboratorios", authenticateToken, (req, res) => {
  const rows = db.prepare("SELECT * FROM laboratorios ORDER BY id").all();
  responderLista(req, res, rows.map((r) => labFromRowVisible(r, req)));
});

app.get("/api/laboratorios/:id", authenticateToken, (req, res) => {
  const row = db.prepare("SELECT * FROM laboratorios WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Laboratorio no encontrado" });
  res.json(labFromRowVisible(row, req));
});

// Cambio de estado: cualquier usuario autenticado (como permite la interfaz y el README).
// Otros campos requieren rol técnico y por ahora no están expuestos en la API.
app.patch("/api/laboratorios/:id", authenticateToken, (req, res) => {
  const campos = Object.keys(req.body || {});
  if (!campos.includes("estado")) {
    return res.status(400).json({ error: "Estado inválido" });
  }
  if (campos.some((k) => k !== "estado") && !esTecnico(req.user?.rol)) {
    return res.status(403).json({ error: "Se requieren permisos técnicos para modificar otros campos" });
  }
  const { estado } = req.body;
  if (!["disponible", "ocupado", "mantencion"].includes(estado)) {
    return res.status(400).json({ error: "Estado inválido" });
  }
  const anterior = db.prepare("SELECT * FROM laboratorios WHERE id = ?").get(req.params.id);
  if (!anterior) return res.status(404).json({ error: "Laboratorio no encontrado" });

  db.prepare("UPDATE laboratorios SET estado = ? WHERE id = ?").run(estado, req.params.id);
  const lab = labFromRowVisible(db.prepare("SELECT * FROM laboratorios WHERE id = ?").get(req.params.id), req);

  notificarCambioEstadoLab(lab, estado, anterior.estado, req.user.id);
  registrarAuditoria(req, "laboratorio_estado_cambiado", { lab: req.params.id, anterior: anterior.estado, estado });

  res.json(lab);
});

/* Equipos */

app.get("/api/equipos", authenticateToken, (req, res) => {
  const { labId } = req.query;
  const rows = labId
    ? db.prepare("SELECT * FROM equipos WHERE lab_id = ? ORDER BY id").all(labId)
    : db.prepare("SELECT * FROM equipos ORDER BY id").all();
  responderLista(req, res, rows.map((r) => eqFromRowVisible(r, req)));
});

/* Usuarios */

app.get("/api/usuarios", authenticateToken, (req, res) => {
  const rows = db.prepare("SELECT * FROM usuarios ORDER BY nombre").all();
  responderLista(req, res, rows.map(usrFromRow));
});

app.get("/api/usuarios/:id", authenticateToken, (req, res) => {
  const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(usrFromRow(row));
});

app.post("/api/usuarios", authenticateToken, requireAdmin, [
  body("id").trim().matches(/^[a-zA-Z0-9_]+$/).withMessage("El ID solo puede contener letras, números y guion bajo"),
  body("nombre").trim().notEmpty().withMessage("El nombre es obligatorio"),
  body("apellido").trim().notEmpty().withMessage("El apellido es obligatorio"),
  body("email").isEmail().withMessage("El email debe ser válido"),
  body("password").isLength({ min: 6 }).withMessage("La contraseña debe tener al menos 6 caracteres"),
  body("rol").optional().isIn(["admin", "programacion", "otro_area"]).withMessage("Rol inválido"),
  body("nivelAcceso").optional().isIn(["total", "tecnico", "basico"]).withMessage("Nivel de acceso inválido")
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Datos inválidos", details: errors.array() });
  }

  const u = req.body;
  const existe = db.prepare("SELECT id FROM usuarios WHERE id = ?").get(u.id);
  if (existe) return res.status(409).json({ error: "Ya existe un usuario con ese ID" });

  const emailUso = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(u.email);
  if (emailUso) return res.status(409).json({ error: "El email ya está en uso por otro usuario" });

  const hashed = bcrypt.hashSync(u.password, 10);
  db.prepare(`
    INSERT INTO usuarios (id,nombre,apellido,iniciales,email,password,rol,area,especialidad,nivel_acceso,activo)
    VALUES (@id,@nombre,@apellido,@iniciales,@email,@password,@rol,@area,@especialidad,@nivel_acceso,1)
  `).run({
    id: u.id, nombre: sanitizarTexto(u.nombre, 100), apellido: sanitizarTexto(u.apellido, 100),
    iniciales: u.iniciales || `${u.nombre[0]}${u.apellido[0]}`.toUpperCase(),
    email: u.email, password: hashed, rol: u.rol || "otro_area",
    area: sanitizarTexto(u.area, 100), especialidad: sanitizarTexto(u.especialidad, 200),
    nivel_acceso: u.nivelAcceso || "basico"
  });

  const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(u.id);
  registrarAuditoria(req, "usuario_creado", { usuario: u.id, rol: u.rol || "otro_area" });
  res.status(201).json(usrFromRow(row));
});

// Un usuario puede editar su propio perfil (nombre, apellido y email);
// el área y la especialidad las gestiona el admin (la especialidad de un
// no-admin se cambia mediante una solicitud que el admin debe aprobar).
app.patch("/api/usuarios/:id", authenticateToken, [
  body("nombre").optional().trim().notEmpty(),
  body("apellido").optional().trim().notEmpty(),
  body("email").optional().isEmail().withMessage("El email debe ser válido"),
  body("password").optional().isLength({ min: 6 }).withMessage("La contraseña debe tener al menos 6 caracteres"),
  body("rol").optional().isIn(["admin", "programacion", "otro_area"]).withMessage("Rol inválido"),
  body("nivelAcceso").optional().isIn(["total", "tecnico", "basico"]).withMessage("Nivel de acceso inválido")
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Datos inválidos", details: errors.array() });
  }

  const esSelf = String(req.params.id) === String(req.user.id);
  const esAdmin = req.user?.rol === "admin";
  if (!esSelf && !esAdmin) {
    return res.status(403).json({ error: "Solo puedes editar tu propio perfil o ser administrador" });
  }
  const camposAdmin = ["rol", "nivelAcceso", "activo", "password"];
  if (!esAdmin && camposAdmin.some((c) => req.body[c] !== undefined)) {
    return res.status(403).json({ error: "Solo el administrador puede modificar rol, nivel de acceso, usuario activo o contraseña" });
  }
  if (!esAdmin && req.body.area !== undefined) {
    return res.status(403).json({ error: "El área/departamento no se puede modificar desde el perfil; solo el administrador puede cambiarla" });
  }
  if (!esAdmin && req.body.especialidad !== undefined) {
    return res.status(403).json({ error: "La especialidad solo se puede cambiar mediante una solicitud que debe aprobar el administrador" });
  }

  const actual = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.params.id);
  if (!actual) return res.status(404).json({ error: "Usuario no encontrado" });

  if (req.body.email !== undefined && String(req.body.email).toLowerCase() !== String(actual.email).toLowerCase()) {
    const emailUso = db.prepare("SELECT id FROM usuarios WHERE email = ? AND id != ?").get(req.body.email, req.params.id);
    if (emailUso) return res.status(409).json({ error: "El email ya está en uso por otro usuario" });
  }

  const map = {
    nombre: "nombre", apellido: "apellido", email: "email", password: "password",
    area: "area", especialidad: "especialidad", rol: "rol",
    nivelAcceso: "nivel_acceso", activo: "activo"
  };
  const sets = [];
  const valores = {};
  for (const [key, col] of Object.entries(map)) {
    if (req.body[key] !== undefined) {
      if (key === "password") {
        valores[col] = bcrypt.hashSync(req.body[key], 10);
      } else if (key === "nombre" || key === "apellido" || key === "area") {
        valores[col] = sanitizarTexto(req.body[key], 100);
      } else if (key === "especialidad") {
        valores[col] = sanitizarTexto(req.body[key], 200);
      } else {
        valores[col] = req.body[key];
      }
      sets.push(`${col} = @${col}`);
    }
  }
  if (!sets.length) return res.json(usrFromRow(actual));

  valores.id = req.params.id;
  db.prepare(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = @id`).run(valores);
  registrarAuditoria(req, "usuario_editado", {
    usuario: req.params.id,
    campos: Object.keys(map).filter((k) => req.body[k] !== undefined)
  });

  // Si el propio usuario cambió su nombre/apellido, refrescar el JWT para que el menú se actualice.
  if (esSelf && (req.body.nombre !== undefined || req.body.apellido !== undefined)) {
    const fresca = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.user.id);
    const nuevoToken = jwt.sign(
      { id: fresca.id, rol: fresca.rol, nombre: fresca.nombre, apellido: fresca.apellido, iniciales: fresca.iniciales, nivelAcceso: fresca.nivel_acceso },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    return res.json({ ...usrFromRow(db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.params.id)), token: nuevoToken });
  }

  res.json(usrFromRow(db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.params.id)));
});

/* Agenda / reservas */

app.get("/api/agenda", authenticateToken, (req, res) => {
  const rows = db.prepare("SELECT * FROM agenda ORDER BY fecha, hora_inicio").all();
  responderLista(req, res, rows.map(agFromRow));
});

app.post("/api/agenda", authenticateToken, [
  body("labId").trim().notEmpty().withMessage("El laboratorio es obligatorio"),
  body("fecha").matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("La fecha debe tener formato AAAA-MM-DD"),
  body("motivo").trim().notEmpty().withMessage("El motivo es obligatorio"),
  body("horaInicio").optional({ values: "falsy" }).matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage("La hora de inicio debe tener formato HH:MM"),
  body("horaFin").optional({ values: "falsy" }).matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage("La hora de fin debe tener formato HH:MM")
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Datos inválidos", details: errors.array() });
  }

  const r = req.body;

  const lab = db.prepare("SELECT id FROM laboratorios WHERE id = ?").get(r.labId);
  if (!lab) return res.status(400).json({ error: "El laboratorio no existe" });

  // No reservar en fechas pasadas
  const hoy = new Date();
  const hoyISO = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (r.fecha < hoyISO) {
    return res.status(400).json({ error: "No se pueden agendar reservas en fechas pasadas" });
  }

  // Anticipación máxima configurable
  const cfg = JSON.parse(db.prepare("SELECT data FROM config WHERE id = 1").get()?.data || "{}");
  const anticipMax = Number(cfg.laboratorios?.anticipacionMaxReserva) || 7;
  const dias = Math.round((new Date(r.fecha + "T00:00:00") - new Date(hoyISO + "T00:00:00")) / 86400000);
  if (dias > anticipMax) {
    return res.status(400).json({ error: `Solo se permite reservar con hasta ${anticipMax} día(s) de anticipación` });
  }

  const hIni = r.horaInicio || "00:00";
  const hFin = r.horaFin || "23:59";
  if (r.horaInicio && r.horaFin && r.horaFin <= r.horaInicio) {
    return res.status(400).json({ error: "La hora de fin debe ser posterior a la de inicio" });
  }

  // Evitar solapamientos del mismo laboratorio en la misma fecha
  const previas = db.prepare(`
    SELECT * FROM agenda WHERE lab_id = ? AND fecha = ? AND estado != 'cancelada'
  `).all(r.labId, r.fecha);
  for (const p of previas) {
    const pIni = p.hora_inicio || "00:00";
    const pFin = p.hora_fin || "23:59";
    if (hIni < pFin && pIni < hFin) {
      return res.status(409).json({ error: "El laboratorio ya está reservado en ese horario" });
    }
  }

  const id = nuevoId("res", r.id);
  db.prepare(`
    INSERT INTO agenda (id, lab_id, usuario_id, fecha, hora_inicio, hora_fin, motivo, estado)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, r.labId, req.user.id, r.fecha, r.horaInicio ?? null, r.horaFin ?? null, sanitizarTexto(r.motivo, 500), r.estado || "pendiente");

  const reserva = agFromRow(db.prepare("SELECT * FROM agenda WHERE id = ?").get(id));
  notificarNuevaReserva(reserva, req.user.id);
  registrarAuditoria(req, "reserva_creada", { reserva: id, lab: r.labId, fecha: r.fecha });

  res.status(201).json(reserva);
});

app.delete("/api/agenda/:id", authenticateToken, (req, res) => {
  const actual = db.prepare("SELECT * FROM agenda WHERE id = ?").get(req.params.id);
  if (!actual) return res.status(404).json({ error: "Reserva no encontrada" });

  // Solo el creador o un admin pueden cancelar
  if (actual.usuario_id !== req.user.id && req.user.rol !== "admin") {
    return res.status(403).json({ error: "No tienes permiso para cancelar esta reserva" });
  }

  db.prepare("DELETE FROM agenda WHERE id = ?").run(req.params.id);
  notificarReservaCancelada(agFromRow(actual), req.user.id);
  registrarAuditoria(req, "reserva_cancelada", { reserva: req.params.id, lab: actual.lab_id, fecha: actual.fecha });
  res.status(204).end();
});

/* Reportes */

app.get("/api/reportes", authenticateToken, (req, res) => {
  const rows = db.prepare("SELECT * FROM reportes ORDER BY fecha DESC").all();
  responderLista(req, res, rows.map(repFromRow));
});

app.post("/api/reportes", authenticateToken, [
  body("tipo").trim().notEmpty().withMessage("El tipo es obligatorio"),
  body("titulo").trim().notEmpty().withMessage("El título es obligatorio"),
  body("descripcion").trim().notEmpty().withMessage("La descripción es obligatoria")
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Datos inválidos", details: errors.array() });
  }

  const r = req.body;
  const id = nuevoId("rep", r.id);
  db.prepare(`
    INSERT INTO reportes (id, tipo, titulo, descripcion, fecha, generado_por, datos, adjuntos)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, r.tipo, sanitizarTexto(r.titulo, 300), sanitizarTexto(r.descripcion, 5000), r.fecha, req.user.id,
         JSON.stringify(r.datos || {}), JSON.stringify(sanitizarAdjuntos(r.adjuntos)));

  const rep = repFromRow(db.prepare("SELECT * FROM reportes WHERE id = ?").get(id));
  notificarCambioReporte("creado", rep, req.user.id);
  res.status(201).json(rep);
});

app.patch("/api/reportes/:id", authenticateToken, [
  body("titulo").optional().trim().notEmpty(),
  body("descripcion").optional().trim().notEmpty()
], (req, res) => {
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
    r.titulo !== undefined ? sanitizarTexto(r.titulo, 300) : actual.titulo,
    r.descripcion !== undefined ? sanitizarTexto(r.descripcion, 5000) : actual.descripcion,
    r.fecha ?? actual.fecha,
    JSON.stringify(r.datos ?? JSON.parse(actual.datos || "{}")),
    JSON.stringify(r.adjuntos !== undefined ? sanitizarAdjuntos(r.adjuntos) : JSON.parse(actual.adjuntos || "[]")),
    req.params.id
  );

  const rep = repFromRow(db.prepare("SELECT * FROM reportes WHERE id = ?").get(req.params.id));
  notificarCambioReporte("editado", rep, req.user.id);
  res.json(rep);
});

app.delete("/api/reportes/:id", authenticateToken, (req, res) => {
  const actual = db.prepare("SELECT * FROM reportes WHERE id = ?").get(req.params.id);
  if (!actual) return res.status(404).json({ error: "Reporte no encontrado" });
  if (!puedeModificarReporte(actual, req)) {
    return res.status(403).json({ error: "Solo el administrador o el creador pueden eliminar este reporte" });
  }

  db.prepare("DELETE FROM reportes WHERE id = ?").run(req.params.id);
  notificarCambioReporte("eliminado", repFromRow(actual), req.user.id);
  res.status(204).end();
});

/* Notificaciones */

app.get("/api/notificaciones", authenticateToken, (req, res) => {
  const usuarioId = req.user.id;
  const rows = db.prepare("SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 50").all(usuarioId);
  responderLista(req, res, rows.map(notifFromRow));
});

app.patch("/api/notificaciones/:id", authenticateToken, (req, res) => {
  const row = db.prepare("SELECT * FROM notificaciones WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Notificación no encontrada" });
  if (row.usuario_id !== req.user.id) {
    return res.status(403).json({ error: "No tienes permiso para modificar esta notificación" });
  }
  db.prepare("UPDATE notificaciones SET leida = ? WHERE id = ?").run(req.body?.leida ? 1 : 0, req.params.id);
  res.json(notifFromRow(db.prepare("SELECT * FROM notificaciones WHERE id = ?").get(req.params.id)));
});

app.post("/api/notificaciones/leer-todas", authenticateToken, (req, res) => {
  db.prepare("UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?").run(req.user.id);
  res.json({ ok: true });
});

app.delete("/api/notificaciones/:id", authenticateToken, (req, res) => {
  const row = db.prepare("SELECT * FROM notificaciones WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Notificación no encontrada" });
  if (row.usuario_id !== req.user.id && req.user.rol !== "admin") {
    return res.status(403).json({ error: "No tienes permiso" });
  }
  db.prepare("DELETE FROM notificaciones WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

/* Solicitudes de cambio de especialidad */
// Los no-admins ya no cambian su área ni su especialidad directamente: la
// especialidad se solicita y el administrador la aprueba o rechaza desde
// la notificación que recibe.

app.get("/api/solicitudes-especialidad", authenticateToken, (req, res) => {
  const rows = req.user.rol === "admin"
    ? db.prepare("SELECT * FROM solicitudes_especialidad ORDER BY id DESC").all()
    : db.prepare("SELECT * FROM solicitudes_especialidad WHERE usuario_id = ? ORDER BY id DESC").all(req.user.id);
  res.json(rows.map(solicitudFromRow));
});

app.get("/api/solicitudes-especialidad/:id", authenticateToken, (req, res) => {
  const row = db.prepare("SELECT * FROM solicitudes_especialidad WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Solicitud no encontrada" });
  if (req.user.rol !== "admin" && row.usuario_id !== req.user.id) {
    return res.status(403).json({ error: "No tienes permiso para ver esta solicitud" });
  }
  const usr = db.prepare("SELECT id, nombre, apellido, email, area, especialidad, rol FROM usuarios WHERE id = ?").get(row.usuario_id);
  res.json({ ...solicitudFromRow(row), solicitante: usr ?? null });
});

app.post("/api/solicitudes-especialidad", authenticateToken, [
  body("especialidad").trim().notEmpty().withMessage("La especialidad solicitada es obligatoria"),
  body("especialidad").isLength({ max: 200 }).withMessage("La especialidad no puede superar 200 caracteres")
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Datos inválidos", details: errors.array() });
  }
  if (req.user.rol === "admin") {
    return res.status(403).json({ error: "Los administradores editan su especialidad directamente desde el perfil" });
  }

  const pendiente = db.prepare(
    "SELECT id FROM solicitudes_especialidad WHERE usuario_id = ? AND estado = 'pendiente'"
  ).get(req.user.id);
  if (pendiente) {
    return res.status(409).json({ error: "Ya tienes una solicitud de especialidad pendiente de aprobación" });
  }

  const actual = db.prepare("SELECT nombre, apellido, especialidad FROM usuarios WHERE id = ?").get(req.user.id);
  const solicitada = sanitizarTexto(req.body.especialidad, 200);
  if (actual && solicitada === actual.especialidad) {
    return res.status(400).json({ error: "La especialidad solicitada es la misma que ya tienes asignada" });
  }

  const info = db.prepare(`
    INSERT INTO solicitudes_especialidad (usuario_id, especialidad_actual, especialidad_solicitada, estado, creada_en)
    VALUES (?,?,?,?,?)
  `).run(req.user.id, actual?.especialidad ?? null, solicitada, "pendiente", new Date().toISOString());
  const solicitudId = Number(info.lastInsertRowid);

  const admins = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1").all();
  for (const a of admins) {
    crearNotificacion({
      toggle: "alertaSolicitudes",
      tipo: "solicitud_especialidad",
      titulo: "Solicitud de cambio de especialidad",
      mensaje: `{quien} solicita cambiar su especialidad de "${actual?.especialidad ?? "—"}" a "${solicitada}". Abre la notificación para revisarla en detalle y aprobarla o rechazarla.`,
      actorId: req.user.id,
      destinatario: a.id,
      solicitudId
    });
  }

  res.status(201).json(solicitudFromRow(db.prepare("SELECT * FROM solicitudes_especialidad WHERE id = ?").get(solicitudId)));
});

app.post("/api/solicitudes-especialidad/:id/aceptar", authenticateToken, requireAdmin, (req, res) => {
  const solicitud = db.prepare("SELECT * FROM solicitudes_especialidad WHERE id = ?").get(req.params.id);
  if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada" });
  if (solicitud.estado !== "pendiente") {
    return res.status(409).json({ error: "La solicitud ya fue resuelta" });
  }
  db.prepare(`
    UPDATE solicitudes_especialidad SET estado = 'aceptada', resuelta_por = ?, resuelta_en = ? WHERE id = ?
  `).run(req.user.id, new Date().toISOString(), solicitud.id);
  db.prepare("UPDATE usuarios SET especialidad = ? WHERE id = ?")
    .run(solicitud.especialidad_solicitada, solicitud.usuario_id);
  crearNotificacion({
    toggle: "alertaSolicitudes",
    tipo: "solicitud_especialidad_resolucion",
    titulo: "Especialidad actualizada",
    mensaje: `El administrador aprobó tu solicitud de cambio de especialidad: ahora tu especialidad es "${solicitud.especialidad_solicitada}".`,
    destinatario: solicitud.usuario_id
  });
  registrarAuditoria(req, "solicitud_aceptada", { solicitud: solicitud.id, usuario: solicitud.usuario_id });
  res.json(solicitudFromRow(db.prepare("SELECT * FROM solicitudes_especialidad WHERE id = ?").get(solicitud.id)));
});

app.post("/api/solicitudes-especialidad/:id/rechazar", authenticateToken, requireAdmin, (req, res) => {
  const solicitud = db.prepare("SELECT * FROM solicitudes_especialidad WHERE id = ?").get(req.params.id);
  if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada" });
  if (solicitud.estado !== "pendiente") {
    return res.status(409).json({ error: "La solicitud ya fue resuelta" });
  }
  db.prepare(`
    UPDATE solicitudes_especialidad SET estado = 'rechazada', resuelta_por = ?, resuelta_en = ? WHERE id = ?
  `).run(req.user.id, new Date().toISOString(), solicitud.id);
  crearNotificacion({
    toggle: "alertaSolicitudes",
    tipo: "solicitud_especialidad_resolucion",
    titulo: "Solicitud de especialidad rechazada",
    mensaje: `El administrador rechazó tu solicitud para cambiar la especialidad a "${solicitud.especialidad_solicitada}". Tu especialidad no cambió.`,
    destinatario: solicitud.usuario_id
  });
  registrarAuditoria(req, "solicitud_rechazada", { solicitud: solicitud.id, usuario: solicitud.usuario_id });
  res.json(solicitudFromRow(db.prepare("SELECT * FROM solicitudes_especialidad WHERE id = ?").get(solicitud.id)));
});

/* Configuración */

app.get("/api/config", authenticateToken, (req, res) => {
  const row = db.prepare("SELECT data FROM config WHERE id = 1").get();
  if (!row) return res.status(404).json({ error: "Configuración no encontrada" });
  res.json(JSON.parse(row.data));
});

app.patch("/api/config", authenticateToken, requireAdmin, (req, res) => {
  const row = db.prepare("SELECT data FROM config WHERE id = 1").get();
  if (!row) return res.status(404).json({ error: "Configuración no encontrada" });
  const actual = JSON.parse(row.data);
  const nuevo = { ...actual };

  // Merge de un nivel: se ignoran claves peligrosas (protección contra
  // prototype pollution vía JSON con `__proto__`, `constructor`, etc.).
  for (const [key, valor] of Object.entries(req.body)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    nuevo[key] = (typeof valor === "object" && valor !== null && actual[key])
      ? { ...actual[key], ...valor }
      : valor;
  }

  db.prepare("UPDATE config SET data = ? WHERE id = 1").run(JSON.stringify(nuevo));
  registrarAuditoria(req, "configuracion_actualizada", { claves: Object.keys(req.body) });
  res.json(nuevo);
});

/* Sitio estático (public/) — sin servir archivos ocultos (dotfiles) */

app.use(express.static(path.join(__dirname, "..", "public"), {
  dotfiles: "deny",
  index: ["index.html"]
}));

/* Manejo de errores */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.status) return res.status(err.status).json({ error: err.message });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido en el cuerpo de la petición" });
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

/* Arranque: solo si este archivo es el punto de entrada (node server.js) */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`\n  LabControl Liceo v3.5`);
    console.log(`  API + sitio corriendo en: http://localhost:${PORT}/login.html`);
    console.log(`  Seguridad: JWT + bcrypt + rate limiting + helmet\n`);
  });
}

export { app };