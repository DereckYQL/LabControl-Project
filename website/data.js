/**
 * data.js
 * Cliente de la API de LabControl Liceo.
 *
 * v2.2 — Autenticación JWT:
 *   - El token se almacena en localStorage con la sesión
 *   - Todas las peticiones envían Authorization: Bearer <token>
 *   - Si el backend responde 401, se redirige a login
 *   - En modo demo se mantiene la funcionalidad sin backend
 */

const API_BASE = "/api";

/* ======================================================
   MODO DEMO (respaldo sin servidor)
   ====================================================== */

let MODO_DEMO = false;

function activarModoDemo() {
  if (MODO_DEMO) return;
  if (!window.DEMO) {
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

const copia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

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

function notificarDemoATodos(opciones) {
  for (const u of window.DEMO.usuarios) {
    if (u.activo === false || u.id === opciones.actorId) continue;
    notificarDemo({ ...opciones, destinatario: u.id });
  }
}

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

function demoRequest(metodo, ruta, cuerpo) {
  const D = window.DEMO;
  const seg = ruta.split("?")[0].split("/").filter(Boolean);
  const [recurso, id] = seg;
  const qs = new URLSearchParams(ruta.split("?")[1] ?? "");
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
      if (cuerpo.estado && cuerpo.estado !== estadoAnterior) {
        const ETIQUETAS = { disponible: "Disponible", ocupado: "Ocupado", mantencion: "Mantención" };
        notificarDemoATodos({
          toggle: "alertaDisponibilidad",
          tipo: "laboratorio",
          titulo: "Estado de laboratorio actualizado",
          mensaje: `{quien} marcó ${lab.nombre} como "${ETIQUETAS[cuerpo.estado] ?? cuerpo.estado}".`,
          actorId: AUTH.getSesion()?.id,
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

    case "GET usuarios_x": {
      const u = D.usuarios.find((u) => u.id === id);
      return u ? copia(({ password, ...usr }) => usr)(u) : undefined;
    }

    case "POST usuarios": {
      const nuevo = {
        iniciales: `${(cuerpo.nombre?.[0] ?? "?")}${(cuerpo.apellido?.[0] ?? "")}`.toUpperCase(),
        activo: true,
        ...cuerpo
      };
      delete nuevo.password;
      D.usuarios.push({ ...nuevo, password: cuerpo.password || "" });
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
      const sesion = AUTH.getSesion();
      const res = { id: `res_demo${++D.contadores.agenda}`, ...cuerpo, usuarioId: sesion?.id || cuerpo.usuarioId };
      D.agenda.push(res);
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
          actorId: AUTH.getSesion()?.id
        });
      }
      return null;
    }

    case "GET reportes":
      return copia(D.reportes);

    case "POST reportes": {
      const sesion = AUTH.getSesion();
      const rep = {
        adjuntos: [],
        ...cuerpo,
        generadoPor: sesion?.id || cuerpo.generadoPor,
        id: `rep_demo${++D.contadores.reportes}`
      };
      D.reportes.unshift(rep);
      notificarDemoCambioReporte("creado", rep, sesion?.id);
      return copia(rep);
    }

    case "PATCH reportes_x": {
      const rep = D.reportes.find((r) => r.id === id);
      if (!rep) throw new Error("Reporte no encontrado");
      Object.assign(rep, cuerpo);
      const sesion = AUTH.getSesion();
      notificarDemoCambioReporte("editado", rep, sesion?.id);
      return copia(rep);
    }

    case "DELETE reportes_x": {
      const i = D.reportes.findIndex((r) => r.id === id);
      if (i === -1) throw new Error("Reporte no encontrado");
      const [rep] = D.reportes.splice(i, 1);
      const sesion = AUTH.getSesion();
      notificarDemoCambioReporte("eliminado", rep, sesion?.id);
      return null;
    }

    case "GET notificaciones": {
      const sesion = AUTH.getSesion();
      const uid = sesion?.id;
      const lista = uid ? D.notificaciones.filter((n) => n.usuarioId === uid) : D.notificaciones;
      return copia([...lista].reverse());
    }

    case "POST notificaciones_x": {
      for (const n of D.notificaciones)
        if (n.usuarioId === AUTH.getSesion()?.id) n.leida = true;
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
      const { password, ...sinPassword } = usr;
      return { token: "demo_token_" + usr.id, usuario: copia(sinPassword) };
    }

    case "POST change-password": {
      const sesion = AUTH.getSesion();
      const usr = D.usuarios.find((u) => u.id === sesion?.id);
      if (!usr) throw new Error("Usuario no encontrado");
      if (usr.password !== cuerpo?.currentPassword) throw new Error("La contraseña actual es incorrecta");
      usr.password = cuerpo.newPassword;
      return { ok: true };
    }

    default:
      throw new Error(`Endpoint no disponible en modo demo: ${metodo} ${ruta}`);
  }
}

/* ======================================================
   PETICIONES A LA API (con JWT)
   ====================================================== */

async function pedir(ruta, opciones = {}) {
  const metodo = opciones.method ?? "GET";
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;

  if (!MODO_DEMO) {
    try {
      const res = await fetch(`${API_BASE}${ruta}`, opciones);

      // Si responde 401, sesión expirada o token inválido
      if (res.status === 401) {
        AUTH.logout();
        return null;
      }

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
      if (!(err instanceof TypeError)) throw err;
      activarModoDemo();
    }
  }

  return demoRequest(metodo, ruta, cuerpo);
}

function getToken() {
  try {
    const sesion = JSON.parse(localStorage.getItem("lc_sesion"));
    return sesion?.token || null;
  } catch { return null; }
}

function authHeaders(extra = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...extra };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function apiGet(path) {
  return pedir(path, { headers: authHeaders() });
}

async function apiSend(method, path, body) {
  return pedir(path, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

/* ======================================================
   ESTADOS
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
  return apiSend("PATCH", `/laboratorios/${id}`, { estado });
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
  return pedir(`/agenda/${id}`, { method: "DELETE", headers: authHeaders() });
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

function eliminarReporte(id) {
  return pedir(`/reportes/${id}`, { method: "DELETE", headers: authHeaders() });
}

/* ======================================================
   NOTIFICACIONES
   ====================================================== */

function cargarNotificaciones(usuarioId) {
  return apiGet("/notificaciones");
}

function marcarNotificacionLeida(id) {
  return apiSend("PATCH", `/notificaciones/${id}`, { leida: true });
}

function marcarTodasNotificaciones() {
  return apiSend("POST", "/notificaciones/leer-todas", {});
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
   SESIÓN (AUTH) — JWT
   ====================================================== */

const AUTH = {
  /** Intenta iniciar sesión contra la API. Devuelve el usuario o null. */
  async login(username, password) {
    try {
      const data = await apiSend("POST", "/login", { usuario: username, password });
      if (!data || !data.token) return null;
      const sesion = {
        token: data.token,
        id: data.usuario.id,
        rol: data.usuario.rol,
        nombre: data.usuario.nombre,
        apellido: data.usuario.apellido,
        iniciales: data.usuario.iniciales,
        nivelAcceso: data.usuario.nivelAcceso
      };
      localStorage.setItem("lc_sesion", JSON.stringify(sesion));
      return data.usuario;
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem("lc_sesion");
    window.location.href = "login.html";
  },

  getSesion() {
    try {
      return JSON.parse(localStorage.getItem("lc_sesion"));
    } catch {
      return null;
    }
  },

  requiereLogin() {
    const sesion = this.getSesion();
    if (!sesion) {
      window.location.href = "login.html";
      return null;
    }
    return sesion;
  },

  puedeVerTecnico() {
    const s = this.getSesion();
    return s && (s.rol === "admin" || s.rol === "programacion");
  },

  puedeControlRemoto() {
    const s = this.getSesion();
    return s && (s.rol === "admin" || s.rol === "programacion");
  },

  esAdmin() {
    const s = this.getSesion();
    return s && s.rol === "admin";
  }
};
