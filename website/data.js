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
      Object.assign(lab, cuerpo);
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
      return copia(res);
    }

    case "DELETE agenda_x": {
      const i = D.agenda.findIndex((r) => r.id === id);
      if (i !== -1) D.agenda.splice(i, 1);
      return null;
    }

    case "GET reportes":
      return copia(D.reportes);

    case "POST reportes": {
      const rep = { id: `rep_demo${++D.contadores.reportes}`, ...cuerpo };
      D.reportes.push(rep);
      return copia(rep);
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
  disponible: { label: "Disponible", color: "var(--color-success)" },
  ocupado:    { label: "Ocupado",    color: "var(--color-danger)" },
  mantencion: { label: "Mantención", color: "var(--color-warning)" }
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
  return apiSend("DELETE", `/agenda/${id}`);
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
