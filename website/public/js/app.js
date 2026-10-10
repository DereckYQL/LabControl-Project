/* app.js — funciones compartidas por todas las páginas. */

import {
  AUTH, ESTADOS,
  cargarAgenda, cargarConfig, cargarNotificaciones, cargarSolicitudEspecialidad,
  marcarNotificacionLeida, marcarTodasNotificaciones, obtenerUsuarioPorId,
  resolverSolicitudEspecialidad
} from "./data.js";

/* Navegación (según rol) */

const NAV_ITEMS_ALL = [
  { href: "index.html",          label: "Inicio",         icon: "layout-dashboard", roles: ["admin","programacion","otro_area"] },
  { href: "laboratorios.html",   label: "Laboratorios",   icon: "building-2",       roles: ["admin","programacion","otro_area"] },
  { href: "disponibilidad.html", label: "Disponibilidad", icon: "clock",            roles: ["admin","programacion","otro_area"] },
  { href: "mapa.html",           label: "Mapa 2D",        icon: "map",              roles: ["admin","programacion","otro_area"] },
  { href: "equipos.html",        label: "Equipos",        icon: "monitor",          roles: ["admin","programacion","otro_area"] },
  { href: "reportes.html",       label: "Reportes",       icon: "bar-chart-3",      roles: ["admin","programacion"] },
  { href: "usuarios.html",       label: "Usuarios",       icon: "users",            roles: ["admin","programacion","otro_area"] },
  { href: "configuracion.html",  label: "Configuración",  icon: "settings",         roles: ["admin","programacion","otro_area"] }
];

let __iconsObserver = null;
let __sidebarListenersAdded = false;

/* En el celular la barra lateral se convierte en una barra con solo el botón de
   menú: el bloque de usuario y la campana de notificaciones se muestran dentro
   del desplegable. El corte es el mismo que usa el CSS (860px). */
const MQ_MOVIL = window.matchMedia("(max-width: 860px)");
let __bloqueUsuario = null;

export function actualizarIconosLucide() {
  if (!window.lucide || typeof window.lucide.createIcons !== "function") return;
  try {
    // quito el atributo para que lucide no reconvierta los mismos iconos en cada pasada
    document.querySelectorAll("svg[data-lucide]").forEach((svg) =>
      svg.removeAttribute("data-lucide")
    );
    window.lucide.createIcons();
    initKeyboardToggles(document.body);
    if (!__iconsObserver) {
      let pendiente = null;
      __iconsObserver = new MutationObserver(() => {
        clearTimeout(pendiente);
        pendiente = setTimeout(actualizarIconosLucide, 60);
      });
      __iconsObserver.observe(document.body, { childList: true, subtree: true });
    }
  } catch (e) {}
}

// Pinta avatar, nombre, rol y correo del usuario en la barra lateral, y deja
// listo el botón de cerrar sesión.
function pintarUsuario(sesion) {
  const userEl = document.querySelector(".sidebar__user");
  if (!userEl || !sesion) return;

  const avatarEl = userEl.querySelector(".avatar");
  const nameEl   = userEl.querySelector(".name");
  const roleEl   = userEl.querySelector(".role");

  if (avatarEl) avatarEl.textContent = sesion.iniciales ?? (sesion.nombre?.slice(0, 2) ?? "??").toUpperCase();
  if (nameEl)   nameEl.textContent   = `${sesion.nombre} ${sesion.apellido ?? ""}`.trim();
  if (roleEl) {
    const labels = { admin: "Administrador", programacion: "Prof. Programación", otro_area: "Profesor" };
    roleEl.textContent = labels[sesion.rol] ?? sesion.rol;
  }

  // El correo acompaña al nombre en el menú del celular.
  let emailEl = userEl.querySelector(".email");
  if (!emailEl) {
    const contenedor = roleEl?.parentElement;
    if (contenedor) {
      emailEl = document.createElement("div");
      emailEl.className = "email";
      contenedor.appendChild(emailEl);
    }
  }
  if (emailEl) emailEl.textContent = sesion.email ?? "";

  if (!userEl.querySelector(".logout-btn")) {
    const btn = document.createElement("button");
    btn.className = "logout-btn";
    btn.title = "Cerrar sesión";
    btn.innerHTML = '<i data-lucide="log-out"></i>';
    btn.addEventListener("click", () => AUTH.logout());
    userEl.appendChild(btn);
  }
}

// La sesión guarda el correo; si viene de una versión anterior que no lo
// guardaba, se pide una vez al servidor y se conserva para el resto de páginas.
async function completarCorreoSesion(sesion) {
  if (!sesion || sesion.email) return;
  try {
    const usuario = await obtenerUsuarioPorId(sesion.id);
    if (!usuario?.email) return;
    const actual = AUTH.getSesion();
    if (actual) {
      // Se descartan tokens heredados de versiones anteriores que los guardaban
      // en localStorage: ahora la sesión vive en cookies HttpOnly.
      const { token, refreshToken, ...limpia } = actual;
      void token; void refreshToken;
      localStorage.setItem("lc_sesion", JSON.stringify({ ...limpia, email: usuario.email }));
    }
    pintarUsuario({ ...sesion, email: usuario.email });
  } catch {}
}

// Agrupa el bloque de usuario con la campana de notificaciones. En escritorio
// el contenedor no genera caja (CSS `display: contents`) y todo queda igual
// que antes: usuario al pie de la barra lateral y campana en su esquina.
function ubicarBloqueUsuario() {
  const sidebar = document.querySelector(".sidebar");
  const nav = document.getElementById("sidebar-nav");
  const userEl = document.querySelector(".sidebar__user");
  if (!sidebar || !nav || !userEl) return;

  if (!__bloqueUsuario) {
    __bloqueUsuario = document.createElement("div");
    __bloqueUsuario.className = "sidebar__me";
  }

  const wrap = sidebar.querySelector(".notif-wrap");

  if (MQ_MOVIL.matches) {
    // Arriba del menú desplegable, por delante de los enlaces de navegación.
    if (__bloqueUsuario.parentElement !== nav) nav.insertBefore(__bloqueUsuario, nav.firstChild);
    if (userEl.parentElement !== __bloqueUsuario) __bloqueUsuario.appendChild(userEl);
    if (wrap && wrap.parentElement !== __bloqueUsuario) __bloqueUsuario.appendChild(wrap);
  } else {
    if (__bloqueUsuario.parentElement) __bloqueUsuario.remove();
    if (userEl.parentElement !== sidebar) sidebar.appendChild(userEl);
    if (wrap && wrap.parentElement !== sidebar) sidebar.appendChild(wrap);
  }
}

MQ_MOVIL.addEventListener("change", ubicarBloqueUsuario);

// Cierra la ventana de notificaciones (al plegar el menú móvil o al pulsar
// fuera de ella).
function cerrarNotificaciones() {
  const panel = document.querySelector(".notif-panel");
  const btn = document.querySelector(".notif-btn");
  if (panel) panel.style.display = "none";
  if (btn) btn.setAttribute("aria-expanded", "false");
}

// Arma el sidebar; si la página exige login y no hay sesión, redirige.
export function renderSidebar(activeHref, requireAuth = true) {
  const sesion = AUTH.getSesion();

  if (requireAuth && !sesion) {
    window.location.href = "login.html";
    return;
  }

  const rol = sesion?.rol ?? "otro_area";
  const nav = document.getElementById("sidebar-nav");
  if (!nav) return;

  const items = NAV_ITEMS_ALL.filter((item) => item.roles.includes(rol));

  nav.innerHTML = items.map((item) => `
    <a class="sidebar__link ${item.href === activeHref ? "is-active" : ""}" href="${item.href}">
      <span class="icon" aria-hidden="true"><i data-lucide="${item.icon}"></i></span>
      <span class="label">${item.label}</span>
    </a>
  `).join("");

  actualizarIconosLucide();

  if (sesion) {
    pintarUsuario(sesion);
    completarCorreoSesion(sesion);
  }
  ubicarBloqueUsuario();

  const sidebar = document.querySelector(".sidebar");
  if (sidebar && !sidebar.querySelector(".sidebar__toggle")) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sidebar__toggle";
    toggle.setAttribute("aria-label", "Abrir menú de navegación");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<i data-lucide="menu"></i>';

    const setMenu = (open) => {
      sidebar.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.innerHTML = open ? '<i data-lucide="x"></i>' : '<i data-lucide="menu"></i>';
      if (!open) cerrarNotificaciones();
    };

    toggle.addEventListener("click", () =>
      setMenu(!sidebar.classList.contains("nav-open"))
    );

    nav.addEventListener("click", (e) => {
      if (e.target.closest(".sidebar__link")) setMenu(false);
    });

    if (!__sidebarListenersAdded) {
      document.addEventListener("click", (e) => {
        const sb = document.querySelector(".sidebar");
        if (sb && sb.classList.contains("nav-open") && !sb.contains(e.target)) {
          sb.classList.remove("nav-open");
          const t = sb.querySelector(".sidebar__toggle");
          if (t) {
            t.setAttribute("aria-expanded", "false");
            t.innerHTML = '<i data-lucide="menu"></i>';
          }
          cerrarNotificaciones();
        }
      });
      __sidebarListenersAdded = true;
    }

    sidebar.appendChild(toggle);
  }

  inicializarNotificaciones();

  return sesion;
}

/* Notificaciones */

let __notifsCache = [];
let __notifsTimer = null;
let __notifsVistas = null;
let __recordatoriosUltima = 0;

function inicializarNotificaciones() {
  const sesion = AUTH.getSesion();
  const sidebar = document.querySelector(".sidebar");
  if (!sesion || !sidebar || sidebar.querySelector(".notif-wrap")) return;

  registrarServiceWorker();

  const wrap = document.createElement("div");
  wrap.className = "notif-wrap";
  wrap.innerHTML = `
    <button class="notif-btn" type="button" title="Notificaciones" aria-label="Notificaciones" aria-expanded="false">
      <i data-lucide="bell"></i>
      <span class="notif-btn__badge" style="display:none"></span>
    </button>
    <div class="notif-panel" style="display:none">
      <div class="notif-panel__head">
        <span>Notificaciones</span>
        <span style="display:flex;gap:10px;align-items:center">
          <button class="notif-panel__activar" type="button" hidden>
            <i data-lucide="bell-ring"></i> Activar
          </button>
          <button class="notif-panel__todas" type="button">Marcar todas como leídas</button>
        </span>
      </div>
      <div class="notif-panel__lista"></div>
    </div>
  `;
  sidebar.appendChild(wrap);
  ubicarBloqueUsuario();

  const btn   = wrap.querySelector(".notif-btn");
  const panel = wrap.querySelector(".notif-panel");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierta = panel.style.display !== "none";
    panel.style.display = abierta ? "none" : "block";
    btn.setAttribute("aria-expanded", abierta ? "false" : "true");
    if (!abierta) renderListaNotificaciones();
  });

  document.addEventListener("click", (e) => {
    if (panel.style.display === "block" && !panel.contains(e.target)) {
      cerrarNotificaciones();
    }
  });

  wrap.querySelector(".notif-panel__todas").addEventListener("click", async () => {
    try {
      await marcarTodasNotificaciones();
      await refrescarNotificaciones();
    } catch {}
  });

  const btnActivar = wrap.querySelector(".notif-panel__activar");
  const revisarBtnActivar = () => {
    if (!("Notification" in window)) { btnActivar.hidden = true; return; }
    btnActivar.hidden = Notification.permission !== "default";
  };
  btnActivar.addEventListener("click", async (e) => {
    e.stopPropagation();
    await activarNotificacionesSistema();
    revisarBtnActivar();
  });
  document.addEventListener("lc-notif-permiso", revisarBtnActivar);
  revisarBtnActivar();
  actualizarIconosLucide();

  refrescarNotificaciones();
  if (__notifsTimer) clearInterval(__notifsTimer);
  __notifsTimer = setInterval(refrescarNotificaciones, 30000);
}

/* Notificaciones del sistema */

const NOTIF_ICONO = "img/logo-insuco.png";

async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("service-worker.js");
  } catch {
    return null;
  }
}

export async function activarNotificacionesSistema() {
  if (!("Notification" in window)) {
    showToast("Este navegador no soporta notificaciones del sistema.", "error");
    return false;
  }
  let permiso = Notification.permission;
  if (permiso === "denied") {
    showToast("Las notificaciones están bloqueadas: habilítalas en los ajustes del navegador.", "error");
    return false;
  }
  if (permiso === "default") permiso = await Notification.requestPermission();
  if (permiso !== "granted") return false;

  await registrarServiceWorker();
  showToast("Notificaciones del sistema activadas.");
  document.dispatchEvent(new CustomEvent("lc-notif-permiso"));
  return true;
}

async function mostrarNotificacionNativa(titulo, cuerpo, urlDestino = "") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const opciones = {
    body: cuerpo ?? "",
    icon: NOTIF_ICONO,
    badge: NOTIF_ICONO,
    tag: `lc-${titulo}`.slice(0, 60),
    data: { url: urlDestino }
  };

  try {
    if ("serviceWorker" in navigator && Notification.requestPermission) {
      const registro = await navigator.serviceWorker.getRegistration();
      if (registro) {
        await registro.showNotification(titulo, opciones);
        return;
      }
    }
  } catch {}

  try { new Notification(titulo, opciones); } catch {}
}

function destinoNotificacion(n) {
  if ((n.tipo === "creado" || n.tipo === "editado") && n.reporteId) {
    return `reportes.html?id=${encodeURIComponent(n.reporteId)}`;
  }
  if (["laboratorio", "reserva", "reserva_confirmada", "reserva_cancelada"].includes(n.tipo)) {
    return "disponibilidad.html";
  }
  return "";
}

export async function refrescarNotificaciones() {
  const sesion = AUTH.getSesion();
  if (!sesion || typeof cargarNotificaciones !== "function") return;
  try {
    __notifsCache = await cargarNotificaciones(sesion.id) ?? [];

    const vistasPrevias = __notifsVistas;
    __notifsVistas = new Set(__notifsCache.map((n) => String(n.id)));
    if (vistasPrevias !== null) {
      const nuevas = __notifsCache.filter((n) => !n.leida && !vistasPrevias.has(String(n.id))).slice(0, 3);
      for (const n of nuevas) {
        mostrarNotificacionNativa(n.titulo, n.mensaje, destinoNotificacion(n));
      }
    }

    actualizarBadgeNotif();
    revisarRecordatoriosReserva(sesion);
    const panel = document.querySelector(".notif-panel");
    if (panel && panel.style.display === "block") renderListaNotificaciones();
  } catch {}
}

async function revisarRecordatoriosReserva(sesion) {
  if (typeof cargarAgenda !== "function" || typeof cargarConfig !== "function") return;

  const ahora = Date.now();
  if (ahora - __recordatoriosUltima < 60000) return;
  __recordatoriosUltima = ahora;

  try {
    const cfg = await cargarConfig();
    if (cfg?.notificaciones?.recordatorioReserva === false) return;

    const agenda = await cargarAgenda();
    const claveVistas = "lc_recordatorios_vistos";
    let vistas = [];
    try { vistas = JSON.parse(localStorage.getItem(claveVistas)) ?? []; } catch {}

    for (const r of agenda) {
      if (r.usuarioId !== sesion.id) continue;
      const idClave = String(r.id);
      if (vistas.includes(idClave)) continue;

      const horaLimpia = (r.horaInicio || "00:00").slice(0, 5);
      const inicio = new Date(`${r.fecha}T${horaLimpia}:00`);
      const minutos = Math.round((inicio.getTime() - Date.now()) / 60000);

      if (minutos > 0 && minutos <= 30) {
        vistas.push(idClave);
        const msj = `Tu reserva empieza a las ${r.horaInicio} (${minutos} min).`;
        mostrarNotificacionNativa("Recordatorio de reserva", msj, "disponibilidad.html");
        showToast(msj, "success");
      }
    }
    localStorage.setItem(claveVistas, JSON.stringify(vistas.slice(-50)));
  } catch {}
}

function notifsNoLeidas() {
  return __notifsCache.filter((n) => !n.leida);
}

function actualizarBadgeNotif() {
  const badge = document.querySelector(".notif-btn__badge");
  if (!badge) return;
  const n = notifsNoLeidas().length;
  badge.textContent = n > 9 ? "9+" : String(n);
  badge.style.display = n > 0 ? "flex" : "none";
}

function renderListaNotificaciones() {
  const lista = document.querySelector(".notif-panel__lista");
  if (!lista) return;

  if (!__notifsCache.length) {
    lista.innerHTML = `
      <div class="notif-vacia">
        <i data-lucide="bell-off"></i>
        <p>No hay notificaciones todavía.<br/>Aquí aparecerán los reportes, reservas,<br/>fallas y cambios de laboratorio.</p>
      </div>`;
    return;
  }

  const esAdminSesion = AUTH.getSesion()?.rol === "admin";

  lista.innerHTML = __notifsCache.map((n) => {
    const abrirSolicitud = esAdminSesion && n.tipo === "solicitud_especialidad" && n.solicitudId;
    return `
    <button class="notif-item ${n.leida ? "" : "notif-item--nueva"}" type="button"
      data-id="${esc(n.id)}" data-destino="${esc(destinoNotificacion(n))}"
      ${abrirSolicitud ? `data-sol="${esc(String(n.solicitudId))}"` : ""}>
      <span class="notif-item__punto"></span>
      <span class="notif-item__cuerpo">
        <span class="notif-item__titulo">${esc(n.titulo)}</span>
        <span class="notif-item__msj">${esc(n.mensaje ?? "")}</span>
        ${abrirSolicitud ? `<span class="notif-item__accion"><i data-lucide="file-search"></i> Revisar solicitud</span>` : ""}
        <span class="notif-item__fecha"><i data-lucide="calendar-days"></i> ${formatFecha(n.fecha)}</span>
      </span>
    </button>
  `;
  }).join("");

  lista.querySelectorAll(".notif-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const solicitudId = item.dataset.sol;
      if (solicitudId) {
        try { await marcarNotificacionLeida(item.dataset.id); } catch {}
        mostrarModalSolicitud(solicitudId);
        return;
      }
      const destino = item.dataset.destino;
      try { await marcarNotificacionLeida(item.dataset.id); } catch {}
      if (destino) window.location.href = destino;
      else await refrescarNotificaciones();
    });
  });
}

/* Modal de revisión de una solicitud de cambio de especialidad (admin) */

async function mostrarModalSolicitud(id) {
  let sol = null;
  try {
    sol = await cargarSolicitudEspecialidad(id);
  } catch {}
  if (!sol) {
    showToast("No se pudo cargar la solicitud.", "error");
    return;
  }

  const previo = document.getElementById("modal-solicitud");
  if (previo) previo.remove();

  const s = sol.solicitante ?? {};
  const pendiente = sol.estado === "pendiente";
  const estadoEtiqueta = sol.estado === "pendiente" ? "Pendiente" : sol.estado === "aceptada" ? "Aceptada" : "Rechazada";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modal-solicitud";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "sol-titulo");
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal__header">
        <span class="modal__title" id="sol-titulo">Revisar solicitud de especialidad</span>
        <button class="modal__close" type="button" aria-label="Cerrar"><i data-lucide="x"></i></button>
      </div>
      <div class="modal__body">
        <dl class="info-grid">
          <div><dt>Solicitante</dt><dd>${esc(s.nombre ?? "")} ${esc(s.apellido ?? "")}</dd></div>
          <div><dt>Usuario</dt><dd>${esc(s.id ?? "")}</dd></div>
          <div><dt>Correo</dt><dd>${esc(s.email ?? "—")}</dd></div>
          <div><dt>Área / Departamento</dt><dd>${esc(s.area ?? "—")}</dd></div>
          <div><dt>Especialidad actual</dt><dd>${esc(sol.especialidadActual ?? "—")}</dd></div>
          <div><dt>Especialidad solicitada</dt><dd>${esc(sol.especialidadSolicitada ?? "—")}</dd></div>
          <div><dt>Solicitado el</dt><dd>${formatFecha(String(sol.creadaEn ?? "").slice(0, 10))}</dd></div>
          <div><dt>Estado</dt><dd><span class="badge ${pendiente ? "badge--mantencion" : sol.estado === "aceptada" ? "badge--disponible" : "badge--ocupado"}">${estadoEtiqueta}</span></dd></div>
        </dl>
      </div>
      <div class="modal__footer">
        <button class="btn" id="sol-cerrar" type="button">Cerrar</button>
        ${pendiente ? `
          <button class="btn btn--danger" id="sol-rechazar" type="button">Rechazar</button>
          <button class="btn btn--primary" id="sol-aceptar" type="button">Aprobar cambio</button>
        ` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cerrar = () => {
    const el = document.getElementById("modal-solicitud");
    if (el) el.remove();
  };
  overlay.querySelector(".modal__close").addEventListener("click", cerrar);
  overlay.querySelector("#sol-cerrar").addEventListener("click", cerrar);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(); });

  if (pendiente) {
    const resolver = async (accion) => {
      try {
        await resolverSolicitudEspecialidad(sol.id, accion);
        cerrar();
        showToast(accion === "aceptar"
          ? "Solicitud aprobada. El usuario ya tiene la nueva especialidad."
          : "Solicitud rechazada. La especialidad del usuario no cambió.");
        refrescarNotificaciones();
      } catch (e) {
        showToast(e.message || "No se pudo resolver la solicitud.", "error");
      }
    };
    overlay.querySelector("#sol-aceptar").addEventListener("click", () => resolver("aceptar"));
    overlay.querySelector("#sol-rechazar").addEventListener("click", () => resolver("rechazar"));
  }

  abrirModal("modal-solicitud");
  actualizarIconosLucide();
}

/* Tarjetas de resumen */

export function renderStatCards(labs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totalEquipos = labs.reduce((a, l) => a + l.equipos, 0);
  const disponibles  = labs.filter((l) => l.estado === "disponible").length;
  const ocupados     = labs.filter((l) => l.estado === "ocupado").length;
  const mantencion   = labs.filter((l) => l.estado === "mantencion").length;

  el.innerHTML = `
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Laboratorios</div>
        <div class="stat-card__value">${labs.length}</div>
        <div class="stat-card__sub">Total</div>
      </div>
      <div class="stat-card__icon stat-card__icon--primary"><i data-lucide="building-2"></i></div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Equipos</div>
        <div class="stat-card__value">${totalEquipos}</div>
        <div class="stat-card__sub">Total</div>
      </div>
      <div class="stat-card__icon stat-card__icon--primary"><i data-lucide="monitor"></i></div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Disponibles</div>
        <div class="stat-card__value">${disponibles}</div>
        <div class="stat-card__sub">En este momento</div>
      </div>
      <div class="stat-card__icon stat-card__icon--success"><i data-lucide="circle-check"></i></div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Ocupados</div>
        <div class="stat-card__value">${ocupados}</div>
        <div class="stat-card__sub">En este momento</div>
      </div>
      <div class="stat-card__icon stat-card__icon--danger"><i data-lucide="ban"></i></div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Mantención</div>
        <div class="stat-card__value">${mantencion}</div>
        <div class="stat-card__sub">Fuera de servicio</div>
      </div>
      <div class="stat-card__icon stat-card__icon--warning"><i data-lucide="wrench"></i></div>
    </div>
  `;
}

/* Estado en tiempo real */

export function renderStatusList(labs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = labs.map((lab) => {
    const estado = ESTADOS[lab.estado];
    const pct    = lab.estado === "ocupado" ? 100 : lab.estado === "mantencion" ? 50 : 15;
    return `
      <div class="status-row">
        <div class="status-row__icon" style="background:${estado.color}22;color:${estado.color}"><i data-lucide="monitor"></i></div>
        <div style="flex:1">
          <div class="status-row__name">${esc(lab.nombre)}</div>
          <div class="status-row__room">${esc(lab.sala)}</div>
        </div>
        <div class="status-row__bar-wrap">
          <span class="badge badge--${lab.estado}">${estado.label}</span>
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;background:${estado.color}"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* Donut de distribución de equipos */

export function renderDonut(labs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const palette = ["#2f6fed", "#16a34a", "#ef4444", "#f59e0b", "#8b5cf6"];
  const validLabs = labs.filter((l) => l.equipos > 0);
  const total   = validLabs.reduce((a, l) => a + l.equipos, 0);
  if (total === 0) { el.innerHTML = "<p style='color:var(--color-text-muted)'>Sin equipos</p>"; return; }
  let acc = 0;
  const stops = validLabs.map((lab, i) => {
    const pct   = (lab.equipos / total) * 100;
    const start = acc;
    acc += pct;
    return `${palette[i % palette.length]} ${start}% ${acc}%`;
  }).join(", ");

  el.innerHTML = `
    <div class="donut-wrap">
      <div style="width:120px;height:120px;border-radius:50%;background:conic-gradient(${stops});
           display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <div style="width:74px;height:74px;border-radius:50%;background:var(--color-surface);
             display:flex;flex-direction:column;align-items:center;justify-content:center">
          <strong style="font-size:1.15rem">${total}</strong>
          <span style="font-size:0.68rem;color:var(--color-text-muted)">Total</span>
        </div>
      </div>
      <div class="donut-legend">
        ${validLabs.map((lab, i) => `
          <span>
            <span class="donut-legend__dot" style="background:${palette[i % palette.length]}"></span>
            ${esc(lab.nombre)} (${lab.equipos})
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

/* Cuadrícula de laboratorios */

export function renderLabGrid(labs, containerId, { linkTo = "laboratorios.html" } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = labs.map((lab) => {
    const estado = ESTADOS[lab.estado];
    const imagenTrasera = lab.imagenes && lab.imagenes.length > 0
      ? `<img src="${esc(lab.imagenes[0])}" alt="${esc(lab.nombre)}" class="lab-card__img" data-lab-id="${esc(lab.id)}" style="width:100%;height:100%;object-fit:cover;cursor:pointer" />`
      : `<span class="photo-icon"><i data-lucide="monitor"></i></span>`;
    return `
      <div class="card lab-card">
        <div class="lab-card__photo">
          ${imagenTrasera}
        </div>
        <div class="lab-card__body">
          <div class="lab-card__title">${esc(lab.nombre)}</div>
          <div class="lab-card__room">${esc(lab.sala)}</div>
          <div class="lab-card__row"><span>Equipos</span><strong style="color:var(--color-text)">${lab.equipos}</strong></div>
          <div class="lab-card__row"><span>Estado</span><span class="badge badge--${lab.estado}">${estado.label}</span></div>
          <a class="lab-card__link" href="${linkTo}?id=${encodeURIComponent(lab.id)}">Ver detalles →</a>
        </div>
      </div>
    `;
  }).join("");
  if (window.lucide) window.lucide.createIcons();
}

/* Utilidades */

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Solo acepta AAAA-MM-DD. Aunque el backend ya valida el formato, cualquier valor
// con otra forma se interpolaba tal cual en `innerHTML` (por ejemplo en
// reportes.js), lo que abría XSS almacenado a través de una fecha manipulada.
export function formatFecha(fechaStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaStr ?? ""));
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Fecha en zona horaria LOCAL (AAAA-MM-DD). `toISOString()` devuelve UTC: en Chile
// después de las 21:00 el día local ya es el siguiente.
export function fechaLocalISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function rolLabel(rol) {
  const labels = { admin: "Administrador", programacion: "Prof. Programación", otro_area: "Profesor área" };
  return labels[rol] ?? rol;
}

export function nivelLabel(nivel) {
  const labels = { total: "Acceso total", tecnico: "Acceso técnico", basico: "Acceso básico" };
  return labels[nivel] ?? nivel;
}

export function showToast(mensaje, tipo = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast--${tipo}`;
  toast.textContent = mensaje;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("toast--show"), 10);
  setTimeout(() => {
    toast.classList.remove("toast--show");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Escape para interpolar en HTML. Cubre también las comillas porque la salida
// se usa dentro de atributos con comillas dobles (p. ej. title="${esc(...)}"):
// sin ellas, un valor con `"` cierra el atributo y permite XSS almacenado.
export function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function __scopeDeTabs(group) {
  return group.closest(".card") || group.parentElement || document;
}

function __instalarARIAEnTabs(scope) {
  scope.querySelectorAll(".tabs").forEach((group, gi) => {
    if (group.getAttribute("role") === "tablist") return;
    group.setAttribute("role", "tablist");
    if (!group.getAttribute("aria-label")) group.setAttribute("aria-label", "Pestañas");
    group.querySelectorAll(".tab-btn").forEach((btn, i) => {
      const pid = `${group.id || "tablist-" + gi}-${btn.dataset.tab}`;
      btn.id = `tab-${pid}`;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", btn.classList.contains("is-active") ? "true" : "false");
      btn.setAttribute("aria-controls", `panel-${pid}`);
      btn.setAttribute("tabindex", btn.classList.contains("is-active") ? "0" : "-1");
    });
    __scopeDeTabs(group).querySelectorAll(".tab-panel").forEach((panel) => {
      if (!panel.dataset.panel || panel.id) return;
      const pid = `${group.id || "tablist-" + gi}-${panel.dataset.panel}`;
      panel.id = `panel-${pid}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `tab-${pid}`);
      panel.setAttribute("tabindex", "0");
      panel.setAttribute("aria-hidden", panel.classList.contains("is-active") ? "false" : "true");
    });
  });
}

export function __activarTab(btn, moverFoco) {
  const group = btn.closest(".tabs");
  if (!group) return;
  group.querySelectorAll(".tab-btn").forEach((b) => {
    const activo = b === btn;
    b.classList.toggle("is-active", activo);
    b.setAttribute("aria-selected", activo ? "true" : "false");
    b.setAttribute("tabindex", activo ? "0" : "-1");
  });
  const panel = btn.dataset.tab;
  __scopeDeTabs(group).querySelectorAll(".tab-panel").forEach((p) => {
    const activo = p.dataset.panel === panel;
    p.classList.toggle("is-active", activo);
    p.setAttribute("aria-hidden", activo ? "false" : "true");
  });
  if (moverFoco && typeof btn.focus === "function") btn.focus();
}

export function initTabs(container = document) {
  __instalarARIAEnTabs(container);
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    __activarTab(btn, false);
  });
  container.addEventListener("keydown", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const group = btn.closest(".tabs");
    if (!group) return;
    const tabs = Array.from(group.querySelectorAll(".tab-btn"));
    const idx = tabs.indexOf(btn);
    let siguiente = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") siguiente = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") siguiente = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") siguiente = 0;
    else if (e.key === "End") siguiente = tabs.length - 1;
    else return;
    e.preventDefault();
    __activarTab(tabs[siguiente], true);
  });
}

/* Accesibilidad: modales y toggles por teclado */

export function obtenerFocusables(overlay) {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(", ");
  return Array.from(overlay.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);
}

export function cerrarModal(overlay, ultimoFoco) {
  overlay.style.display = "none";
  if (ultimoFoco && typeof ultimoFoco.focus === "function") ultimoFoco.focus();
}

// Abre el modal, enfoca el primer control, atrapa Tab y cierra con Escape.
export function abrirModal(overlayId, closeSelector = ".modal__close") {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.style.display = "flex";
  const ultimoFoco = document.activeElement;
  const focusables = obtenerFocusables(overlay);
  if (focusables.length) {
    let primero = focusables[0];
    if (primero.matches?.(".modal__close") && focusables.length > 1) primero = focusables[1];
    primero.focus();
  }

  const close = (e) => {
    if (e && e.type === "keydown" && e.key !== "Escape") return;
    const overlayClean = document.getElementById(overlayId);
    if (overlayClean) cerrarModal(overlayClean, ultimoFoco);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", onCierre);
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const focus = obtenerFocusables(overlay);
    if (!focus.length) return;
    const first = focus[0];
    const last = focus[focus.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const onCierre = (e) => {
    if (e.target === overlay) close();
    const boton = e.target.closest(closeSelector);
    if (boton) close();
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("click", onCierre);
}

export function initKeyboardToggles(root = document) {
  root.querySelectorAll(".toggle[role='switch']").forEach((toggle) => {
    if (toggle.dataset.keyInit) return;
    toggle.dataset.keyInit = "1";
    toggle.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle.click();
      }
    });
  });
}
