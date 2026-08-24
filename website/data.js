/**
 * data.js
 * Cliente de la API de LabControl Liceo.
 *
 * Antes toda la información vivía "hardcodeada" en este archivo. Ahora vive
 * en una base de datos SQLite (backend/database/labcontrol.db) servida por
 * backend/server.js. Este archivo solo pide esos datos por fetch() y expone
 * las mismas funciones que ya usaban las páginas (cargarLaboratorios,
 * obtenerUsuarioPorId, AUTH.login, etc.), para no tener que reescribir cada
 * página desde cero.
 */

const API_BASE = "/api";

/* ======================================================
   MODO DEMO (respaldo sin servidor)
   Si la API no responde —por ejemplo cuando el sitio está
   publicado en GitHub Pages— se cargan los mismos datos de
   ejemplo de backend/db.js desde datos-demo.js y todas las
   operaciones funcionan en memoria hasta recargar la página.
   ====================================================== */

let MODO_DEMO = false;

function activarModoDemo() {
  if (MODO_DEMO) return;
  if (!window.DEMO) {
    // Carga síncrona del archivo de respaldo (mismo origen, funciona en GitHub Pages)
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "datos-demo.js", false);
    xhr.send();
    if (xhr.status !== 200 && xhr.status !== 0)
      throw new Error("Sin API ni datos de respaldo disponibles.");
    new Function(xhr.responseText)();
  }
  MODO_DEMO = true;
  console.warn("[LabControl] API no disponible — usando modo demo con datos locales.");
}

/** Copia profunda simple, para imitar respuestas JSON de la API */
const copia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/**
 * En modo demo replica las notificaciones que generaría server.js:
 * reportes (y fallas), cambios de estado de laboratorios y reservas.
 * Cada tipo respeta su interruptor en Configuración → Notificaciones.
 */
function notificarDemo({ toggle, tipo, titulo, mensaje, actorId, destinatario, referencia = null }) {
  const D = window.DEMO;
  if (!D || !titulo || !destinatario) return;
  if (D.config?.notificaciones?.[toggle] === false) return;

  const actor = D.usuarios.find((u) => u.id === actorId);
  const quien = actor ? `${actor.nombre} ${actor.apellido}` : "Alguien";

  D.notificaciones.push({
    id: ++D.contadores.notificaciones,
    usuarioId: destinatario,
    tipo: tipo ?? toggle,
    titulo,
    mensaje: String(mensaje ?? "").replace(/\{quien\}/g, quien),
    reporteId: referencia,
    fecha: new Date().toISOString().slice(0, 10),
    leida: false
  });
}

/** Notifica un cambio a todos los usuarios activos menos al autor (igual que server.js) */
function notificarDemoATodos(opciones) {
  for (const u of window.DEMO.usuarios) {
    if (u.activo === false || u.id === opciones.actorId) continue;
    notificarDemo({ ...opciones, destinatario: u.id });
  }
}

/** Cambios de reportes: si el tipo es "fallas" se usa la alerta de fallas */
function notificarDemoCambioReporte(accion, rep, actorId) {
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
  notificarDemoATodos({
    toggle: esFalla ? "alertaFallas" : "alertaReportes",
    tipo: accion,
    titulo: texto.titulo,
    mensaje: texto.mensaje,
    actorId,
    referencia: accion === "eliminado" ? null : rep.id
  });
}

/**
 * Router de peticiones contra los datos demo (en memoria).
 * Devuelve lo mismo que devolvería server.js para cada endpoint.
 */
function demoRequest(metodo, ruta, cuerpo) {
  const D = window.DEMO;
  const seg = ruta.split("?")[0].split("/").filter(Boolean); // ["laboratorios", "1"]
  const [recurso, id] = seg;
  const qs = new URLSearchParams(ruta.split("?")[1] ?? "");
  // "_x" indica que la ruta incluye un id (p.ej. /laboratorios/3)
  const clave = `${metodo} ${recurso}${id !== undefined ? "_x" : ""}`;

  switch (clave) {
    case "GET laboratorios":
      return copia(D.laboratorios);

    case "GET laboratorios_x":
      return copia(D.laboratorios.find((l) => l.id === Number(id)));

    case "PATCH laboratorios_x": {
      const lab = D.laboratorios.find((l) => l.id === Number(id));
      if (!lab) throw new Error("Laboratorio no encontrado");
      const estadoAnterior = lab.estado;
      Object.assign(lab, cuerpo);
      // Aviso de disponibilidad a los demás usuarios (igual que server.js)
      if (cuerpo.estado && cuerpo.estado !== estadoAnterior) {
        const ETIQUETAS = { disponible: "Disponible", ocupado: "Ocupado", mantencion: "Mantención" };
        notificarDemoATodos({
          toggle: "alertaDisponibilidad",
          tipo: "laboratorio",
          titulo: "Estado de laboratorio actualizado",
          mensaje: `{quien} marcó ${lab.nombre} como "${ETIQUETAS[cuerpo.estado] ?? cuerpo.estado}".`,
          actorId: cuerpo.usuarioId,
          referencia: String(lab.id)
        });
      }
      return copia(lab);
    }

    case "GET equipos": {
      const labId = qs.get("labId");
      return copia(labId ? D.equipos.filter((e) => e.labId === Number(labId)) : D.equipos);
    }

    case "GET usuarios":
      return copia(D.usuarios.map(({ password, ...u }) => u));

    case "GET usuarios_x":
      return copia(D.usuarios.find((u) => u.id === id));

    case "POST usuarios": {
      const nuevo = {
        iniciales: `${(cuerpo.nombre?.[0] ?? "?")}${(cuerpo.apellido?.[0] ?? "")}`.toUpperCase(),
        activo: true,
        ...cuerpo
      };
      D.usuarios.push(nuevo);
      return copia(nuevo);
    }

    case "PATCH usuarios_x": {
      const usr = D.usuarios.find((u) => u.id === id);
      if (!usr) throw new Error("Usuario no encontrado");
      Object.assign(usr, cuerpo);
      const { password, ...publico } = usr;
      return copia(publico);
    }

    case "GET agenda":
      return copia(D.agenda);

    case "POST agenda": {
      const res = { id: `res_demo${++D.contadores.agenda}`, ...cuerpo };
      D.agenda.push(res);
      // Confirmación al autor + aviso al resto (igual que server.js)
      const nombreLab = D.laboratorios.find((l) => l.id === Number(res.labId))?.nombre ?? "laboratorio";
      const horario = `${res.horaInicio ?? "—"}${res.horaFin ? ` - ${res.horaFin}` : ""}`;
      notificarDemo({
        toggle: "alertaReservas",
        tipo: "reserva_confirmada",
        titulo: "Reserva confirmada",
        mensaje: `Tu reserva de ${nombreLab} para el ${res.fecha} (${horario}) quedó registrada.`,
        destinatario: res.usuarioId
      });
      notificarDemoATodos({
        toggle: "alertaReservas",
        tipo: "reserva",
        titulo: "Nueva reserva de laboratorio",
        mensaje: `{quien} reservó ${nombreLab} para el ${res.fecha} (${horario}).`,
        actorId: res.usuarioId
      });
      return copia(res);
    }

    case "DELETE agenda_x": {
      const i = D.agenda.findIndex((r) => r.id === id);
      if (i !== -1) {
        const [res] = D.agenda.splice(i, 1);
        const nombreLab = D.laboratorios.find((l) => l.id === Number(res.labId))?.nombre ?? "laboratorio";
        notificarDemoATodos({
          toggle: "alertaReservas",
          tipo: "reserva_cancelada",
          titulo: "Reserva cancelada",
          mensaje: `{quien} canceló la reserva de ${nombreLab} para el ${res.fecha}.`,
          actorId: qs.get("usuarioId")
        });
      }
      return null;
    }

    case "GET reportes":
      return copia(D.reportes);

    case "POST reportes": {
      const rep = {
        adjuntos: [],
        ...cuerpo,
        id: `rep_demo${++D.contadores.reportes}`
      };
      D.reportes.unshift(rep);
      notificarDemoCambioReporte("creado", rep, cuerpo.generadoPor);
      return copia(rep);
    }

    case "PATCH reportes_x": {
      const rep = D.reportes.find((r) => r.id === id);
      if (!rep) throw new Error("Reporte no encontrado");
      Object.assign(rep, cuerpo);
      delete rep.usuarioId; // dato de control, no se guarda en el reporte
      notificarDemoCambioReporte("editado", rep, cuerpo.usuarioId);
      return copia(rep);
    }

    case "DELETE reportes_x": {
      const i = D.reportes.findIndex((r) => r.id === id);
      if (i === -1) throw new Error("Reporte no encontrado");
      const [rep] = D.reportes.splice(i, 1);
      notificarDemoCambioReporte("eliminado", rep, qs.get("usuarioId"));
      return null;
    }

    case "GET notificaciones": {
      const uid = qs.get("usuarioId");
      const lista = uid ? D.notificaciones.filter((n) => n.usuarioId === uid) : D.notificaciones;
      return copia([...lista].reverse());
    }

    case "POST notificaciones_x": {
      // Ruta especial: /notificaciones/leer-todas
      for (const n of D.notificaciones)
        if (n.usuarioId === cuerpo?.usuarioId) n.leida = true;
      return { ok: true };
    }

    case "PATCH notificaciones_x": {
      const notif = D.notificaciones.find((n) => String(n.id) === id);
      if (!notif) throw new Error("Notificación no encontrada");
      if (cuerpo?.leida !== undefined) notif.leida = !!cuerpo.leida;
      return copia(notif);
    }

    case "GET config":
      return copia(D.config);

    case "PATCH config":
      for (const [clave, valor] of Object.entries(cuerpo ?? {}))
        if (typeof valor === "object" && !Array.isArray(valor))
          Object.assign(D.config[clave] ??= {}, valor);
        else D.config[clave] = valor;
      return copia(D.config);

    case "POST login": {
      const usr = D.usuarios.find(
        (u) => u.id === (cuerpo?.usuario ?? "").trim() && u.password === cuerpo?.password
      );
      if (!usr) throw new Error("Credenciales incorrectas");
      return copia(usr);
    }

    default:
      throw new Error(`Endpoint no disponible en modo demo: ${metodo} ${ruta}`);
  }
}

/** Petición unificada: primero intenta la API; si está inaccesible, cambia a modo demo */
async function pedir(ruta, opciones = {}) {
  const metodo = opciones.method ?? "GET";
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;

  if (!MODO_DEMO) {
    try {
      const res = await fetch(`${API_BASE}${ruta}`, opciones);

      // Un servidor que responde con HTML (p.ej. el 404 de GitHub Pages)
      // significa que la API no existe en este hosting
      const tipo = res.headers.get("content-type") ?? "";
      if (!tipo.includes("json")) {
        activarModoDemo();
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${ruta} → ${res.status}`);
      } else {
        return res.status === 204 ? null : res.json();
      }
    } catch (err) {
      if (!(err instanceof TypeError)) throw err; // errores reales de la API se propagan
      activarModoDemo();                          // fetch rechazado: red/servidor caído
    }
  }

  return demoRequest(metodo, ruta, cuerpo);
}

async function apiGet(path) {
  return pedir(path);
}

async function apiSend(method, path, body) {
  return pedir(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

/* ======================================================
   ESTADOS (solo etiquetas de presentación, no van en la BD)
   ====================================================== */

const ESTADOS = {
  disponible: { label: "Disponible", color: "#48bb78" },
  ocupado:    { label: "Ocupado",    color: "#f56565" },
  mantencion: { label: "Mantención", color: "#ed8936" }
};

const ESTADOS_EQUIPO = {
  activo:     { label: "Activo",     clase: "badge--disponible" },
  mantencion: { label: "Mantención", clase: "badge--mantencion" },
  falla:      { label: "Falla",      clase: "badge--ocupado" },
  apagado:    { label: "Apagado",    clase: "badge--muted" }
};

/* ======================================================
   LABORATORIOS
   ====================================================== */

function cargarLaboratorios() {
  return apiGet("/laboratorios");
}

function obtenerLaboratorioPorId(id) {
  return apiGet(`/laboratorios/${id}`);
}

function actualizarEstadoLaboratorio(id, estado) {
  // Se incluye el usuario en sesión para poder avisar a los demás del cambio
  const sesion = AUTH.getSesion();
  return apiSend("PATCH", `/laboratorios/${id}`, { estado, usuarioId: sesion?.id });
}

/* ======================================================
   EQUIPOS
   ====================================================== */

function cargarEquipos(labId = null) {
  return apiGet(labId ? `/equipos?labId=${labId}` : "/equipos");
}

/* ======================================================
   USUARIOS
   ====================================================== */

function cargarUsuarios() {
  return apiGet("/usuarios");
}

async function obtenerUsuarioPorId(id) {
  if (!id) return null;
  try {
    return await apiGet(`/usuarios/${id}`);
  } catch {
    return null;
  }
}

function crearUsuario(usuario) {
  return apiSend("POST", "/usuarios", usuario);
}

function actualizarUsuario(id, cambios) {
  return apiSend("PATCH", `/usuarios/${id}`, cambios);
}

/* ======================================================
   AGENDA / RESERVAS
   ====================================================== */

function cargarAgenda() {
  return apiGet("/agenda");
}

function crearReserva(reserva) {
  return apiSend("POST", "/agenda", reserva);
}

function eliminarReserva(id) {
  const sesion = AUTH.getSesion();
  return pedir(`/agenda/${id}?usuarioId=${encodeURIComponent(sesion?.id ?? "")}`, { method: "DELETE" });
}

/* ======================================================
   REPORTES
   ====================================================== */

function cargarReportes() {
  return apiGet("/reportes");
}

function crearReporte(reporte) {
  return apiSend("POST", "/reportes", reporte);
}

function actualizarReporte(id, cambios) {
  return apiSend("PATCH", `/reportes/${id}`, cambios);
}

function eliminarReporte(id, usuarioId) {
  return pedir(`/reportes/${id}?usuarioId=${encodeURIComponent(usuarioId ?? "")}`, { method: "DELETE" });
}

/* ======================================================
   NOTIFICACIONES
   ====================================================== */

function cargarNotificaciones(usuarioId) {
  return apiGet(`/notificaciones?usuarioId=${encodeURIComponent(usuarioId ?? "")}`);
}

function marcarNotificacionLeida(id) {
  return apiSend("PATCH", `/notificaciones/${id}`, { leida: true });
}

function marcarTodasNotificaciones(usuarioId) {
  return apiSend("POST", "/notificaciones/leer-todas", { usuarioId });
}

/* ======================================================
   CONFIGURACIÓN
   ====================================================== */

function cargarConfig() {
  return apiGet("/config");
}

function actualizarConfig(cambios) {
  return apiSend("PATCH", "/config", cambios);
}

/* ======================================================
   SESIÓN (AUTH)
   La sesión activa se guarda en localStorage del navegador (como antes),
   pero la validación de usuario/contraseña ahora ocurre en el backend,
   contra la base de datos.
   ====================================================== */

const AUTH = {
  /** Intenta iniciar sesión contra la API. Devuelve el usuario o null. */
  async login(username, password) {
    try {
      const usuario = await apiSend("POST", "/login", { usuario: username, password });
      const sesion = {
        id: usuario.id,
        rol: usuario.rol,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        iniciales: usuario.iniciales,
        nivelAcceso: usuario.nivelAcceso
      };
      localStorage.setItem("lc_sesion", JSON.stringify(sesion));
      return usuario;
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem("lc_sesion");
    window.location.href = "login.html";
  },

  /** Devuelve el objeto de sesión activo o null. */
  getSesion() {
    try {
      return JSON.parse(localStorage.getItem("lc_sesion"));
    } catch {
      return null;
    }
  },

  /** Redirige a login si no hay sesión activa. */
  requiereLogin() {
    const sesion = this.getSesion();
    if (!sesion) {
      window.location.href = "login.html";
      return null;
    }
    return sesion;
  },

  /** Verifica si el usuario actual puede ver info técnica de equipos. */
  puedeVerTecnico() {
    const s = this.getSesion();
    return s && (s.rol === "admin" || s.rol === "programacion");
  },

  /** Verifica si el usuario actual puede usar control remoto. */
  puedeControlRemoto() {
    const s = this.getSesion();
    return s && (s.rol === "admin" || s.rol === "programacion");
  },

  /** Verifica si el usuario actual es admin. */
  esAdmin() {
    const s = this.getSesion();
    return s && s.rol === "admin";
  }
};
