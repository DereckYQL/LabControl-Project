/* data.js — cliente de la API; si no hay servidor usa los datos locales (demo). */

const API_BASE = "/api";

/* Modo demo (respaldo sin servidor) */

let MODO_DEMO = false;

function activarModoDemo() {
  if (MODO_DEMO) return Promise.resolve();
  if (window.DEMO) {
    MODO_DEMO = true;
    console.warn("[LabControl] API no disponible — usando modo demo con datos locales.");
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.onload = () => {
      if (!window.DEMO) {
        reject(new Error("datos-demo.js cargado pero window.DEMO no definido."));
        return;
      }
      MODO_DEMO = true;
      console.warn("[LabControl] API no disponible — usando modo demo con datos locales.");
      resolve();
    };
    s.onerror = () => reject(new Error("Sin API ni datos de respaldo disponibles."));
    s.src = "datos-demo.js";
    document.head.appendChild(s);
  });
}

const copia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

function notificarDemo({ toggle, tipo, titulo, mensaje, actorId, destinatario, referencia = null, solicitudId = null }) {
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
    solicitudId,
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

function notificarDemoAAdmins(opciones) {
  for (const u of window.DEMO.usuarios) {
    if (u.activo === false || u.rol !== "admin") continue;
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

  const demoEsTecnico = (() => {
    const s = AUTH.getSesion();
    return !!(s && (s.rol === "admin" || s.rol === "programacion"));
  })();

  // Rutas con sub-acción (recurso/acción): el switch principal agrupa por
  // recurso e id (clave "metodo recurso[_x]"), así que estas se atienden por
  // su ruta completa para no colisionar entre sí.
  // Estado 2FA simulado en modo demo: se persiste para que sobreviva a
  // recargas de página (igual que el servidor lo guarda en la BD).
  const demo2faEstado = () => {
    try { return localStorage.getItem("lc_2fa_demo") === "1"; } catch { return false; }
  };

  const claveRuta = `${metodo} ${ruta.split("?")[0].replace(/^\/+/, "")}`;
  const sesionDemo = (usr) => ({
    token: `demo_token_${usr.id}`,
    refreshToken: `demo_refresh_${usr.id}`,
    usuario: copia((({ password, ...resto }) => resto)(usr))
  });

  switch (claveRuta) {
    case "POST login/2fa": {
      const idDesafio = D._2faChallengeUsuario;
      const usr = D.usuarios.find((u) => u.id === idDesafio);
      const codigo = String(cuerpo?.codigo ?? "").trim();
      if (!usr || !/^\d{6}$/.test(codigo)) {
        throw new Error("El código de verificación es incorrecto");
      }
      return sesionDemo(usr);
    }
    case "GET 2fa/estado":
      return { habilitado: demo2faEstado() };
    case "POST 2fa/setup":
      return {
        secreto: "JBSWY3DPEHPK3PXP",
        otpauthUrl: "otpauth://totp/Liceo%20INSUCO%20-%20LabControl:INSUCO?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30",
        qrDataUrl: ""
      };
    case "POST 2fa/verificar":
      if (!/^\d{6}$/.test(String(cuerpo?.codigo ?? "").trim())) {
        throw new Error("El código de verificación es incorrecto");
      }
      try { localStorage.setItem("lc_2fa_demo", "1"); } catch {}
      return { ok: true };
    case "POST 2fa/desactivar":
      if (!/^\d{6}$/.test(String(cuerpo?.codigo ?? "").trim())) {
        throw new Error("El código de verificación es incorrecto");
      }
      try { localStorage.removeItem("lc_2fa_demo"); } catch {}
      return { ok: true };
    case "GET backups/exportar":
      throw new Error("La descarga de respaldos no está disponible en modo demo");
    case "POST backups/restaurar":
      return { ok: true };
  }

  switch (clave) {
    case "GET laboratorios":
      if (demoEsTecnico) return copia(D.laboratorios);
      return copia(D.laboratorios.map(({ so, procesador, ram, almacenamiento, red, ...vis }) => vis));

    case "GET laboratorios_x": {
      const lab = D.laboratorios.find((l) => l.id === Number(id));
      if (!lab) return undefined;
      if (demoEsTecnico) return copia(lab);
      const { so, procesador, ram, almacenamiento, red, ...vis } = lab;
      return copia(vis);
    }

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
      const lista = labId ? D.equipos.filter((e) => e.labId === Number(labId)) : D.equipos;
      if (demoEsTecnico) return copia(lista);
      return copia(lista.map(({ procesador, ram, almacenamiento, so, serie, ip, mac, ...vis }) => vis));
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

    case "GET solicitudes-especialidad": {
      const s = AUTH.getSesion();
      if (!s) return [];
      const lista = s.rol === "admin"
        ? D.solicitudes
        : D.solicitudes.filter((x) => x.usuarioId === s.id);
      return copia([...lista].reverse());
    }

    case "GET solicitudes-especialidad_x": {
      const sol = D.solicitudes.find((x) => String(x.id) === String(id));
      if (!sol) throw new Error("Solicitud no encontrada");
      const s = AUTH.getSesion();
      if (s?.rol !== "admin" && sol.usuarioId !== s?.id) {
        throw new Error("No tienes permiso para ver esta solicitud");
      }
      const usr = D.usuarios.find((u) => u.id === sol.usuarioId);
      if (!usr) throw new Error("Solicitante no encontrado");
      const { password, ...solicitante } = usr;
      return copia({
        id: sol.id, usuarioId: sol.usuarioId,
        especialidadActual: sol.especialidadActual,
        especialidadSolicitada: sol.especialidadSolicitada,
        estado: sol.estado, creadaEn: sol.creadaEn, solicitante
      });
    }

    case "POST solicitudes-especialidad": {
      const s = AUTH.getSesion();
      if (!s) throw new Error("Debes iniciar sesión");
      if (s.rol === "admin") {
        throw new Error("Los administradores editan su especialidad directamente desde el perfil");
      }
      const actual = D.usuarios.find((u) => u.id === s.id);
      if (!actual) throw new Error("Usuario no encontrado");
      const solicitada = String(cuerpo?.especialidad ?? "").trim();
      if (!solicitada) throw new Error("La especialidad solicitada es obligatoria");
      if (solicitada === actual.especialidad) {
        throw new Error("La especialidad solicitada es la misma que ya tienes asignada");
      }
      const pendiente = D.solicitudes.find((x) => x.usuarioId === s.id && x.estado === "pendiente");
      if (pendiente) throw new Error("Ya tienes una solicitud de especialidad pendiente de aprobación");
      const sol = {
        id: ++D.contadores.solicitudes,
        usuarioId: s.id,
        especialidadActual: actual.especialidad,
        especialidadSolicitada: solicitada,
        estado: "pendiente",
        creadaEn: new Date().toISOString()
      };
      D.solicitudes.push(sol);
      notificarDemoAAdmins({
        toggle: "alertaSolicitudes",
        tipo: "solicitud_especialidad",
        titulo: "Solicitud de cambio de especialidad",
        mensaje: `{quien} solicita cambiar su especialidad de "${actual.especialidad ?? "—"}" a "${solicitada}". Abre la notificación para revisarla en detalle y aprobarla o rechazarla.`,
        actorId: s.id,
        solicitudId: sol.id
      });
      return copia(sol);
    }

    case "POST solicitudes-especialidad_x": {
      const sol = D.solicitudes.find((x) => String(x.id) === String(id));
      if (!sol) throw new Error("Solicitud no encontrada");
      const s = AUTH.getSesion();
      if (s?.rol !== "admin") throw new Error("Solo el administrador puede resolver solicitudes");
      if (sol.estado !== "pendiente") throw new Error("La solicitud ya fue resuelta");
      const accion = seg[2];
      if (accion !== "aceptar" && accion !== "rechazar") throw new Error("Acción inválida");
      sol.estado = accion === "aceptar" ? "aceptada" : "rechazada";
      if (accion === "aceptar") {
        const usr = D.usuarios.find((u) => u.id === sol.usuarioId);
        if (usr) usr.especialidad = sol.especialidadSolicitada;
        notificarDemo({
          toggle: "alertaSolicitudes",
          tipo: "solicitud_especialidad_resolucion",
          titulo: "Especialidad actualizada",
          mensaje: `El administrador aprobó tu solicitud de cambio de especialidad: ahora tu especialidad es "${sol.especialidadSolicitada}".`,
          destinatario: sol.usuarioId
        });
      } else {
        notificarDemo({
          toggle: "alertaSolicitudes",
          tipo: "solicitud_especialidad_resolucion",
          titulo: "Solicitud de especialidad rechazada",
          mensaje: `El administrador rechazó tu solicitud para cambiar la especialidad a "${sol.especialidadSolicitada}". Tu especialidad no cambió.`,
          destinatario: sol.usuarioId
        });
      }
      return copia(sol);
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
      if (demo2faEstado()) {
        D._2faChallengeUsuario = usr.id;
        return { requires2FA: true, loginId: "demo_" + usr.id, usuario: copia(sinPassword) };
      }
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

    case "POST registro": {
      const u = cuerpo ?? {};
      const id = String(u.id ?? "").trim();
      const email = String(u.email ?? "").trim().toLowerCase();
      if (!/[a-zA-Z0-9_]{1,80}/.test(id)) throw new Error("El usuario solo puede contener letras, números y guion bajo");
      if (D.usuarios.some((x) => x.id === id)) throw new Error("Ya existe una cuenta con ese usuario");
      if (D.usuarios.some((x) => String(x.email).toLowerCase() === email)) throw new Error("El correo ya está en uso por otra cuenta");
      const nuevo = {
        id,
        nombre: String(u.nombre ?? ""),
        apellido: String(u.apellido ?? ""),
        iniciales: `${(u.nombre?.[0] ?? "?")}${(u.apellido?.[0] ?? "")}`.toUpperCase(),
        email,
        password: String(u.password ?? ""),
        rol: "otro_area",
        area: String(u.area ?? ""),
        especialidad: String(u.especialidad ?? ""),
        nivelAcceso: "basico",
        activo: true
      };
      D.usuarios.push(nuevo);
      notificarDemoAAdmins({
        toggle: "alertaNuevosUsuarios",
        tipo: "usuario_registrado",
        titulo: "Nuevo profesor registrado",
        mensaje: `{quien} se registró en el sistema (${id}). Revisa sus datos: área "${u.area || "—"}", especialidad "${u.especialidad || "—"}".`,
        actorId: id
      });
      const { password, ...publico } = nuevo;
      return copia(publico);
    }

    case "POST recuperar-contrasena": {
      const email = String(cuerpo?.email ?? "").trim().toLowerCase();
      const usr = D.usuarios.find((x) => String(x.email).toLowerCase() === email);
      if (!usr) return { ok: true };
      try { sessionStorage.setItem("lc_reset_demo", usr.id); } catch { /* sin almacenamiento */ }
      return { ok: true, demo: true, usuario: usr.id };
    }

    case "POST recuperar-contrasena_x": {
      let uid = null;
      try { uid = sessionStorage.getItem("lc_reset_demo"); } catch { /* sin almacenamiento */ }
      const usr = D.usuarios.find((x) => x.id === uid && String(id) === "demo_reset_token");
      if (!usr) throw new Error("El enlace de restablecimiento es inválido o expiró");
      const pass = String(cuerpo?.newPassword ?? "");
      if (pass.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
      usr.password = pass;
      try { sessionStorage.removeItem("lc_reset_demo"); } catch { /* sin almacenamiento */ }
      return { ok: true, usuario: usr.id };
    }

    case "GET auditoria": {
      const ahora = new Date().toISOString();
      return [
        { id: 1, fecha: ahora, usuarioId: "INSUCO", rol: "admin", accion: "login_ok", detalle: { usuario: "INSUCO" }, ip: "127.0.0.1" },
        { id: 2, fecha: ahora, usuarioId: "prof_camila", rol: "otro_area", accion: "reserva_creada", detalle: { lab: 1, fecha: ahora.slice(0, 10) }, ip: "127.0.0.1" }
      ];
    }

    default:
      throw new Error(`Endpoint no disponible en modo demo: ${metodo} ${ruta}`);
  }
}

/* Peticiones a la API (con JWT) */

// Renovación de sesión (single-flight): evita refrescar dos veces en paralelo.
let _refrescando = null;

async function renovarSesion() {
  if (_refrescando) return _refrescando;
  _refrescando = pedirRefresh().finally(() => { _refrescando = null; });
  return _refrescando;
}

async function pedirRefresh() {
  const sesion = AUTH.getSesion();
  if (!sesion?.refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: sesion.refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.token || !data?.refreshToken) return false;
    localStorage.setItem("lc_sesion", JSON.stringify({
      ...sesion,
      token: data.token,
      refreshToken: data.refreshToken
    }));
    return true;
  } catch {
    return false;
  }
}

async function pedir(ruta, opciones = {}, _reintentado = false) {
  const metodo = opciones.method ?? "GET";
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;

  if (!MODO_DEMO) {
    try {
      const res = await fetch(`${API_BASE}${ruta}`, opciones);

      // Token de acceso expirado: se renueva una sola vez con el refresh token
      // y se reintenta la petición original antes de cerrar la sesión.
      if (res.status === 401 && !_reintentado && (await renovarSesion())) {
        return pedir(ruta, { ...opciones, headers: authHeaders() }, true);
      }

      if (res.status === 401) {
        AUTH.logout();
        return null;
      }

      const tipo = res.headers.get("content-type") ?? "";
      if (!tipo.includes("json")) {
        await activarModoDemo();
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${ruta} → ${res.status}`);
      } else {
        return res.status === 204 ? null : res.json();
      }
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;
      await activarModoDemo();
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

export async function apiGet(path) {
  return pedir(path, { headers: authHeaders() });
}

export async function apiSend(method, path, body) {
  return pedir(path, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

/* Estados */

export const ESTADOS = {
  disponible: { label: "Disponible", color: "#48bb78" },
  ocupado:    { label: "Ocupado",    color: "#f56565" },
  mantencion: { label: "Mantención", color: "#ed8936" }
};

export const ESTADOS_EQUIPO = {
  activo:     { label: "Activo",     clase: "badge--disponible" },
  mantencion: { label: "Mantención", clase: "badge--mantencion" },
  falla:      { label: "Falla",      clase: "badge--ocupado" },
  apagado:    { label: "Apagado",    clase: "badge--muted" }
};

/* Laboratorios */

export function cargarLaboratorios() {
  return apiGet("/laboratorios");
}

export function obtenerLaboratorioPorId(id) {
  return apiGet(`/laboratorios/${id}`);
}

export function actualizarEstadoLaboratorio(id, estado) {
  return apiSend("PATCH", `/laboratorios/${id}`, { estado });
}

/* Equipos */

export function cargarEquipos(labId = null) {
  return apiGet(labId ? `/equipos?labId=${labId}` : "/equipos");
}

/* Usuarios */

export function cargarUsuarios() {
  return apiGet("/usuarios");
}

export async function obtenerUsuarioPorId(id) {
  if (!id) return null;
  try {
    return await apiGet(`/usuarios/${id}`);
  } catch {
    return null;
  }
}

export function crearUsuario(usuario) {
  return apiSend("POST", "/usuarios", usuario);
}

export function actualizarUsuario(id, cambios) {
  return apiSend("PATCH", `/usuarios/${id}`, cambios);
}

/* Agenda / reservas */

export function cargarAgenda() {
  return apiGet("/agenda");
}

export function crearReserva(reserva) {
  return apiSend("POST", "/agenda", reserva);
}

export function eliminarReserva(id) {
  return pedir(`/agenda/${id}`, { method: "DELETE", headers: authHeaders() });
}

/* Reportes */

export function cargarReportes() {
  return apiGet("/reportes");
}

export function crearReporte(reporte) {
  return apiSend("POST", "/reportes", reporte);
}

export function actualizarReporte(id, cambios) {
  return apiSend("PATCH", `/reportes/${id}`, cambios);
}

export function eliminarReporte(id) {
  return pedir(`/reportes/${id}`, { method: "DELETE", headers: authHeaders() });
}

/* Notificaciones */

export function cargarNotificaciones(usuarioId) {
  return apiGet("/notificaciones");
}

export function marcarNotificacionLeida(id) {
  return apiSend("PATCH", `/notificaciones/${id}`, { leida: true });
}

export function marcarTodasNotificaciones() {
  return apiSend("POST", "/notificaciones/leer-todas", {});
}

/* Solicitudes de cambio de especialidad */

export function cargarSolicitudesEspecialidad() {
  return apiGet("/solicitudes-especialidad");
}

export function cargarSolicitudEspecialidad(id) {
  return apiGet(`/solicitudes-especialidad/${id}`);
}

export function solicitarCambioEspecialidad(especialidad) {
  return apiSend("POST", "/solicitudes-especialidad", { especialidad });
}

export function resolverSolicitudEspecialidad(id, accion) {
  return apiSend("POST", `/solicitudes-especialidad/${id}/${accion}`, {});
}

/* Auditoría, verificación en dos pasos y respaldos */

export async function cargarAuditoria(filtros = {}) {
  const q = new URLSearchParams();
  for (const clave of ["q", "usuario", "desde", "hasta", "pagina", "limite"]) {
    if (filtros[clave] !== undefined && filtros[clave] !== null && filtros[clave] !== "")
      q.set(clave, filtros[clave]);
  }
  const sufijo = q.toString() ? `?${q.toString()}` : "";
  return apiGet(`/auditoria${sufijo}`);
}

export function cargarEstado2FA() {
  return apiGet("/2fa/estado");
}

export function iniciarConfiguracion2FA() {
  return apiSend("POST", "/2fa/setup", {});
}

export function verificarConfiguracion2FA(codigo) {
  return apiSend("POST", "/2fa/verificar", { codigo });
}

export function desactivar2FA(codigo) {
  return apiSend("POST", "/2fa/desactivar", { codigo });
}

// Descarga el respaldo de la BD como blob binario.
export async function exportarBackup() {
  const res = await fetch(`${API_BASE}/backups/exportar`, { headers: authHeaders() });
  if (!res.ok) throw new Error("No se pudo generar el respaldo");
  return res.blob();
}

// Restaura la BD desde un archivo .db (el servidor revoca las demás sesiones).
export async function restaurarBackup(archivo) {
  try {
    const res = await fetch(`${API_BASE}/backups/restaurar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/octet-stream" },
      body: archivo
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "No se pudo restaurar el respaldo");
    }
    return true;
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    await activarModoDemo();
    await demoRequest("POST", "backups/restaurar", {});
    return true;
  }
}

/* Configuración */

export function cargarConfig() {
  return apiGet("/config");
}

export function actualizarConfig(cambios) {
  return apiSend("PATCH", "/config", cambios);
}

/* Sesión (AUTH) */

export const AUTH = {
  // Inicia sesión en la API. Si el admin tiene 2FA devuelve { requires2FA,
  // loginId, usuario } para completar el segundo paso; si no, el usuario.
  async login(username, password) {
    try {
      const data = await apiSend("POST", "/login", { usuario: username, password });
      if (!data) return null;
      if (data.requires2FA) return data;
      if (!data.token) return null;
      const sesion = {
        token: data.token,
        refreshToken: data.refreshToken,
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

  // Segundo paso del login (código TOTP) para sesiones con 2FA.
  async verificar2fa(loginId, codigo) {
    try {
      if (MODO_DEMO) {
        const data = await demoRequest("POST", "/login/2fa", { loginId, codigo: String(codigo).trim() });
        const sesion = {
          token: data.token,
          refreshToken: data.refreshToken,
          id: data.usuario.id,
          rol: data.usuario.rol,
          nombre: data.usuario.nombre,
          apellido: data.usuario.apellido,
          iniciales: data.usuario.iniciales,
          nivelAcceso: data.usuario.nivelAcceso
        };
        localStorage.setItem("lc_sesion", JSON.stringify(sesion));
        return data.usuario;
      }
      const res = await fetch(`${API_BASE}/login/2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, codigo: String(codigo).trim() })
      });
      if (res.status === 401 || res.status === 429) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "El código de verificación es incorrecto");
      }
      if (!res.ok) throw new Error("No se pudo completar la verificación");
      const data = await res.json();
      const sesion = {
        token: data.token,
        refreshToken: data.refreshToken,
        id: data.usuario.id,
        rol: data.usuario.rol,
        nombre: data.usuario.nombre,
        apellido: data.usuario.apellido,
        iniciales: data.usuario.iniciales,
        nivelAcceso: data.usuario.nivelAcceso
      };
      localStorage.setItem("lc_sesion", JSON.stringify(sesion));
      return data.usuario;
    } catch (err) {
      if (err instanceof TypeError) await activarModoDemo();
      throw err;
    }
  },

  // Registro autónomo: crea la cuenta con rol "otro_area" y nivel básico.
  async registro(datos) {
    return apiSend("POST", "/registro", datos);
  },

  // Solicita un enlace de restablecimiento para el correo dado. La respuesta
  // es genérica (nunca revela si la cuenta existe); en modo demo incluye la
  // marca `demo: true` para permitir completar el flujo sin servidor.
  async solicitarRecuperacion(email) {
    const data = await apiSend("POST", "/recuperar-contrasena", { email });
    return data || { ok: true };
  },

  // Completa el restablecimiento con el token del enlace y la nueva contraseña.
  async restablecerContrasena(token, newPassword) {
    return apiSend("POST", `/recuperar-contrasena/${token}`, { newPassword });
  },

  logout() {
    // Revoca el refresh token en el servidor (best-effort) antes de cerrar.
    const sesion = this.getSesion();
    if (sesion?.refreshToken) {
      fetch(`${API_BASE}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: sesion.refreshToken })
      }).catch(() => {});
    }
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
