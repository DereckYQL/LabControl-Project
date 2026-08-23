/**
 * app.js
 * Funciones compartidas por todas las páginas de LabControl Liceo.
 * Incluye: sidebar dinámico por rol, tarjetas resumen, renders de
 * laboratorios y utilidades de render.
 */

/* ======================================================
   NAVEGACIÓN (filtrada por rol)
   ====================================================== */

const NAV_ITEMS_ALL = [
  { href: "index.html",          label: "Inicio",         icon: "🏠",  roles: ["admin","programacion","otro_area"] },
  { href: "laboratorios.html",   label: "Laboratorios",   icon: "🖥️",  roles: ["admin","programacion","otro_area"] },
  { href: "disponibilidad.html", label: "Disponibilidad", icon: "🕒",  roles: ["admin","programacion","otro_area"] },
  { href: "mapa.html",           label: "Mapa 2D",        icon: "🗺️",  roles: ["admin","programacion","otro_area"] },
  { href: "equipos.html",        label: "Equipos",        icon: "💻",  roles: ["admin","programacion","otro_area"] },
  { href: "reportes.html",       label: "Reportes",       icon: "📊",  roles: ["admin","programacion"] },
  { href: "usuarios.html",       label: "Usuarios",       icon: "👤",  roles: ["admin","programacion","otro_area"] },
  { href: "configuracion.html",  label: "Configuración",  icon: "⚙️",  roles: ["admin","programacion","otro_area"] }
];

/**
 * Construye el sidebar. Si se llama desde una página que requiere login,
 * redirige automáticamente si no hay sesión.
 * @param {string} activeHref  - Nombre del archivo actual (ej. "index.html")
 * @param {boolean} requireAuth - Si true, redirige a login si no hay sesión
 */
function renderSidebar(activeHref, requireAuth = true) {
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
      <span class="icon" aria-hidden="true">${item.icon}</span>
      <span class="label">${item.label}</span>
    </a>
  `).join("");

  // Actualizar bloque de usuario en sidebar (con lo que ya viene en la sesión,
  // sin pedirle otra vez el usuario a la API)
  if (sesion) {
    const avatarEl  = document.querySelector(".sidebar__user .avatar");
    const nameEl    = document.querySelector(".sidebar__user .name");
    const roleEl    = document.querySelector(".sidebar__user .role");
    if (avatarEl) avatarEl.textContent = sesion.iniciales ?? sesion.nombre.slice(0, 2).toUpperCase();
    if (nameEl)   nameEl.textContent   = `${sesion.nombre} ${sesion.apellido ?? ""}`.trim();
    if (roleEl) {
      const labels = { admin: "Administrador", programacion: "Prof. Programación", otro_area: "Profesor" };
      roleEl.textContent = labels[rol] ?? rol;
    }

    // Botón logout
    const userEl = document.querySelector(".sidebar__user");
    if (userEl && !userEl.querySelector(".logout-btn")) {
      const btn = document.createElement("button");
      btn.className = "logout-btn";
      btn.title = "Cerrar sesión";
      btn.textContent = "↩";
      btn.addEventListener("click", () => AUTH.logout());
      userEl.appendChild(btn);
    }
  }

  // Botón hamburguesa: menú desplegable en móvil
  const sidebar = document.querySelector(".sidebar");
  if (sidebar && !sidebar.querySelector(".sidebar__toggle")) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sidebar__toggle";
    toggle.setAttribute("aria-label", "Abrir menú de navegación");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "☰";

    const setMenu = (open) => {
      sidebar.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "✕" : "☰";
    };

    toggle.addEventListener("click", () =>
      setMenu(!sidebar.classList.contains("nav-open"))
    );

    nav.addEventListener("click", (e) => {
      if (e.target.closest(".sidebar__link")) setMenu(false);
    });

    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("nav-open") && !sidebar.contains(e.target)) {
        setMenu(false);
      }
    });

    sidebar.appendChild(toggle);
  }

  return sesion;
}

/* ======================================================
   STAT CARDS (resumen numérico)
   ====================================================== */

function renderStatCards(labs, containerId) {
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
      <div class="stat-card__icon stat-card__icon--primary">🖥️</div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Equipos</div>
        <div class="stat-card__value">${totalEquipos}</div>
        <div class="stat-card__sub">Total</div>
      </div>
      <div class="stat-card__icon stat-card__icon--primary">💻</div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Disponibles</div>
        <div class="stat-card__value">${disponibles}</div>
        <div class="stat-card__sub">En este momento</div>
      </div>
      <div class="stat-card__icon stat-card__icon--success">✅</div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Ocupados</div>
        <div class="stat-card__value">${ocupados}</div>
        <div class="stat-card__sub">En este momento</div>
      </div>
      <div class="stat-card__icon stat-card__icon--danger">⛔</div>
    </div>
    <div class="card stat-card">
      <div>
        <div class="stat-card__label">Mantención</div>
        <div class="stat-card__value">${mantencion}</div>
        <div class="stat-card__sub">Fuera de servicio</div>
      </div>
      <div class="stat-card__icon stat-card__icon--warning">🔧</div>
    </div>
  `;
}

/* ======================================================
   LISTA ESTADO EN TIEMPO REAL
   ====================================================== */

function renderStatusList(labs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = labs.map((lab) => {
    const estado = ESTADOS[lab.estado];
    const pct    = lab.estado === "ocupado" ? 100 : lab.estado === "mantencion" ? 50 : 15;
    return `
      <div class="status-row">
        <div class="status-row__icon" style="background:${estado.color}22;color:${estado.color}">🖥️</div>
        <div style="flex:1">
          <div class="status-row__name">${lab.nombre}</div>
          <div class="status-row__room">${lab.sala}</div>
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

/* ======================================================
   DONUT DISTRIBUCIÓN DE EQUIPOS
   ====================================================== */

function renderDonut(labs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const palette = ["#2f6fed", "#16a34a", "#ef4444", "#f59e0b", "#8b5cf6"];
  const total   = labs.reduce((a, l) => a + l.equipos, 0);
  let acc = 0;
  const stops = labs.map((lab, i) => {
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
        ${labs.map((lab, i) => `
          <span>
            <span class="donut-legend__dot" style="background:${palette[i % palette.length]}"></span>
            ${lab.nombre} (${lab.equipos})
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

/* ======================================================
   GRID DE LABORATORIOS (tarjetas)
   ====================================================== */

function renderLabGrid(labs, containerId, { linkTo = "laboratorios.html" } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = labs.map((lab) => {
    const estado = ESTADOS[lab.estado];
    return `
      <div class="card lab-card">
        <div class="lab-card__photo">
          <span style="font-size:2.5rem">🖥️</span>
        </div>
        <div class="lab-card__body">
          <div class="lab-card__title">${lab.nombre}</div>
          <div class="lab-card__room">${lab.sala}</div>
          <div class="lab-card__row"><span>Equipos</span><strong style="color:var(--color-text)">${lab.equipos}</strong></div>
          <div class="lab-card__row"><span>Estado</span><span class="badge badge--${lab.estado}">${estado.label}</span></div>
          <a class="lab-card__link" href="${linkTo}?id=${lab.id}">Ver detalles →</a>
        </div>
      </div>
    `;
  }).join("");
}

/* ======================================================
   UTILIDADES GENERALES
   ====================================================== */

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatFecha(fechaStr) {
  if (!fechaStr) return "—";
  const [y, m, d] = fechaStr.split("-");
  return `${d}/${m}/${y}`;
}

function rolLabel(rol) {
  const labels = { admin: "Administrador", programacion: "Prof. Programación", otro_area: "Profesor área" };
  return labels[rol] ?? rol;
}

function nivelLabel(nivel) {
  const labels = { total: "Acceso total", tecnico: "Acceso técnico", basico: "Acceso básico" };
  return labels[nivel] ?? nivel;
}

/** Muestra un toast de notificación temporal */
function showToast(mensaje, tipo = "success") {
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

/** Activa sistema de tabs genérico dentro de un contenedor */
function initTabs(container = document) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const group = btn.closest(".tabs");
    if (!group) return;
    group.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const panel = btn.dataset.tab;
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("is-active", p.dataset.panel === panel);
    });
  });
}
