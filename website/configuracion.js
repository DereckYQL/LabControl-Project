/**
 * configuracion.js
 * Lógica de la página de Configuración (extraída del <script> inline de
 * configuracion.html en v2.6 — P4). Carga data.js + lucide + app.js.
 */
renderSidebar("configuracion.html");
const esAdmin = AUTH.esAdmin();
const sesion  = AUTH.getSesion();

// Estos tres se llenan una vez que llega la respuesta de la API;
// las funciones de abajo (buildPanel, guardar, etc.) los usan luego,
// cuando el usuario ya interactuó con la pantalla.
let config = null;
let usuario = null;
let usuariosTotal = [];

let secciones = [];

Promise.all([cargarConfig(), cargarUsuarios()]).then(([cfg, usuarios]) => {
  config = cfg;
  usuariosTotal = usuarios;
  usuario = usuarios.find((u) => u.id === sesion?.id) || null;
  iniciarPantalla();
});

function iniciarPantalla() {
  if (esAdmin) {
    document.getElementById("cfg-subtitulo").textContent =
      "Configuración completa del sistema — modo Administrador";
  }

  /* -------- Sincronizar tema activo -------- */
  const activo = temaActivo();
  document.documentElement.dataset.theme = activo;
  if (config?.sitio) config.sitio.tema = activo;

  /* -------- Definición de secciones -------- */
  const SECCIONES_BASE = [
    { id: "perfil",           icon: "user",     label: "Mi perfil" },
    { id: "apariencia",       icon: "palette",  label: "Apariencia" },
    { id: "notificaciones",   icon: "bell",     label: "Notificaciones" },
    { id: "seguridad",        icon: "shield",   label: "Seguridad" },
  ];

  const SECCIONES_ADMIN = [
    { id: "sitio",            icon: "school",   label: "Sitio web" },
    { id: "laboratorios-cfg", icon: "monitor",  label: "Laboratorios" },
    { id: "equipos-cfg",      icon: "laptop",   label: "Equipos" },
    { id: "red",              icon: "globe",    label: "Red" },
    { id: "usuarios-cfg",     icon: "users",    label: "Usuarios" },
    { id: "sistema",          icon: "wrench",   label: "Sistema" },
  ];

  secciones = esAdmin ? [...SECCIONES_BASE, ...SECCIONES_ADMIN] : SECCIONES_BASE;

  /* -------- Construir nav lateral -------- */
  const sidenav = document.getElementById("cfg-sidenav");
  sidenav.innerHTML = secciones.map((s, i) => `
    <button class="cfg-nav-btn ${i === 0 ? "is-active" : ""}"
      data-section="${s.id}" onclick="cambiarSeccion('${s.id}')">
      <i data-lucide="${s.icon}"></i> ${s.label}
    </button>
  `).join("");

  /* -------- Construir paneles -------- */
  const panels = document.getElementById("cfg-panels");
  panels.innerHTML = secciones.map((s, i) => `
    <div class="cfg-panel ${i === 0 ? "is-active" : ""}" id="panel-${s.id}">
      ${buildPanel(s.id)}
    </div>
  `).join("");

  actualizarEstadoNotifUI();
  actualizarIconosLucide();
}

function cambiarSeccion(id) {
  document.querySelectorAll(".cfg-nav-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.section === id)
  );
  document.querySelectorAll(".cfg-panel").forEach((p) =>
    p.classList.toggle("is-active", p.id === `panel-${id}`)
  );
}

function buildPanel(id) {
  switch (id) {
    /* ===== PERFIL ===== */
    case "perfil": return `
      <h2 class="cfg-panel__title">Mi perfil</h2>
      <div class="cfg-section">
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
          <div class="usr-avatar-lg" style="font-size:1.6rem">${usuario?.iniciales ?? "??"}</div>
          <div>
            <div style="font-weight:700;font-size:1rem">${usuario ? `${usuario.nombre} ${usuario.apellido}` : "—"}</div>
            <div style="color:var(--color-text-muted);font-size:.85rem">${usuario?.email ?? "—"}</div>
            <span class="badge" style="margin-top:6px">${rolLabel(sesion?.rol)}</span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input class="form-input" id="p-nombre" value="${usuario?.nombre ?? ""}" />
          </div>
          <div class="form-group">
            <label class="form-label">Apellido</label>
            <input class="form-input" id="p-apellido" value="${usuario?.apellido ?? ""}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Correo institucional</label>
          <input class="form-input" id="p-email" type="email" value="${usuario?.email ?? ""}" />
        </div>
        <div class="form-group">
          <label class="form-label">Área / Departamento</label>
          <input class="form-input" id="p-area" value="${usuario?.area ?? ""}" />
        </div>
        <div class="form-group">
          <label class="form-label">Especialidad</label>
          <input class="form-input" id="p-especialidad" value="${usuario?.especialidad ?? ""}" />
        </div>
      </div>
    `;

    /* ===== APARIENCIA ===== */
    case "apariencia": return `
      <h2 class="cfg-panel__title">Apariencia</h2>
      <div class="cfg-section">
        <div class="form-group">
          <label class="form-label">Tema de color</label>
          <div class="tema-grid" id="tema-grid">
            ${[
              { id:"claro",  label:"Claro (por defecto)", bg:"#fffdf0" },
              { id:"oscuro", label:"Oscuro",              bg:"#141414" },
            ].map((t) => `
              <div class="tema-item ${temaActivo() === t.id ? "is-active" : ""}"
                onclick="seleccionarTema('${t.id}', this)"
                style="--tema-bg:${t.bg}">
                <div class="tema-preview"></div>
                <span>${t.label}</span>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Tamaño de texto</label>
          <select class="form-input" id="p-texto" style="max-width:200px">
            <option value="normal">Normal</option>
            <option value="grande">Grande</option>
          </select>
        </div>
      </div>
    `;

    /* ===== NOTIFICACIONES ===== */
    case "notificaciones": return `
      <h2 class="cfg-panel__title">Notificaciones</h2>
      <div class="cfg-section">
        <div style="font-weight:600;margin-bottom:10px">Avisos dentro del sitio</div>
        ${[
          { id:"n-reservas",   label:"Confirmación y avisos de reservas",      checked: config.notificaciones?.alertaReservas ?? true },
          { id:"n-cambios",    label:"Cambios de estado de laboratorio",       checked: config.notificaciones?.alertaDisponibilidad ?? true },
          { id:"n-fallas",     label:"Alertas de fallas de equipos",           checked: config.notificaciones?.alertaFallas ?? true },
          { id:"n-reportes",   label:"Nuevos reportes y cambios en reportes",  checked: config.notificaciones?.alertaReportes ?? true },
          { id:"n-recordator", label:"Recordatorio 30 min antes de reserva",   checked: config.notificaciones?.recordatorioReserva ?? false },
        ].map((n) => `
          <div class="toggle-row">
            <span>${n.label}</span>
            <button type="button" role="switch" aria-checked="${n.checked}" class="toggle ${n.checked ? "toggle--on" : ""}" id="${n.id}"
              onclick="toggleSwitch('${n.id}')">
              <div class="toggle__knob"></div>
            </button>
          </div>
        `).join("")}
      </div>
      <div class="cfg-section">
        <div style="font-weight:600;margin-bottom:6px">Notificaciones del sistema</div>
        <p style="color:var(--color-text-muted);font-size:.85rem;margin-bottom:12px">
          Recibe los mismos avisos como notificaciones del sistema operativo,
          tanto en tu PC como en tu celular, aunque la pestaña esté en segundo plano.
        </p>
        <button class="btn btn--primary" id="btn-activar-notif" onclick="activarNotificacionesDesdeConfig()">
          <i data-lucide="bell-ring"></i> Activar notificaciones
        </button>
        <p id="estado-notif" style="font-size:.82rem;margin-top:10px;color:var(--color-text-muted)"></p>
      </div>
    `;

    /* ===== SEGURIDAD ===== */
    case "seguridad": return `
      <h2 class="cfg-panel__title">Seguridad de la cuenta</h2>
      <div class="cfg-section">
        <div class="form-group">
          <label class="form-label">Contraseña actual</label>
          <input class="form-input" id="s-pass-actual" type="password" placeholder="••••••••" style="max-width:280px" required />
        </div>
        <div class="form-group">
          <label class="form-label">Nueva contraseña</label>
          <input class="form-input" id="s-pass-nueva" type="password" placeholder="Mínimo 6 caracteres" style="max-width:280px" required minlength="6" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar contraseña</label>
          <input class="form-input" id="s-pass-confirm" type="password" placeholder="Repite la nueva contraseña" style="max-width:280px" required minlength="6" />
        </div>
        <button class="btn btn--primary" onclick="cambiarContrasena()" style="margin-top:4px">Cambiar contraseña</button>
        <hr style="margin:24px 0;border-color:var(--color-border)">
        <div style="font-weight:600;margin-bottom:10px">Sesión activa</div>
        <p style="color:var(--color-text-muted);font-size:.88rem;margin-bottom:12px">Usuario: <strong>${sesion?.id}</strong> — Rol: ${rolLabel(sesion?.rol)}</p>
        <button class="btn btn--danger" onclick="AUTH.logout()">Cerrar sesión</button>
      </div>
    `;

    /* ===== SITIO (solo admin) ===== */
    case "sitio": return `
      <h2 class="cfg-panel__title">Configuración del sitio web</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div class="form-group">
          <label class="form-label">Nombre de la institución</label>
          <input class="form-input" id="cfg-inst" value="${config.sitio.nombreInstitucion}" />
        </div>
        <div class="form-group">
          <label class="form-label">Nombre del sistema</label>
          <input class="form-input" id="cfg-sistema" value="${config.sitio.nombreSistema}" />
        </div>
        <div class="form-group">
          <label class="form-label">Idioma</label>
          <select class="form-input" id="cfg-idioma" style="max-width:200px">
            <option value="es" selected>Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    `;

    /* ===== LABORATORIOS CFG (solo admin) ===== */
    case "laboratorios-cfg": return `
      <h2 class="cfg-panel__title">Configuración de laboratorios</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Hora de apertura</label>
            <input class="form-input" type="time" id="cfg-apertura" value="${config.laboratorios.horaApertura}" />
          </div>
          <div class="form-group">
            <label class="form-label">Hora de cierre</label>
            <input class="form-input" type="time" id="cfg-cierre" value="${config.laboratorios.horaCierre}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Anticipación máxima para reservas (días)</label>
          <input class="form-input" type="number" id="cfg-anticip" value="${config.laboratorios.anticipacionMaxReserva}" style="max-width:120px" min="1" max="30" />
        </div>
        <div class="toggle-row">
          <span>Permitir reservas de otras áreas</span>
          <button type="button" role="switch" aria-checked="${config.laboratorios.permitirReservaExterna}" class="toggle ${config.laboratorios.permitirReservaExterna ? "toggle--on" : ""}"
            id="tog-reserva-ext" onclick="toggleSwitch('tog-reserva-ext')">
            <div class="toggle__knob"></div>
          </button>
        </div>
      </div>
    `;

    /* ===== EQUIPOS CFG (solo admin) ===== */
    case "equipos-cfg": return `
      <h2 class="cfg-panel__title">Configuración de equipos</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div class="toggle-row">
          <span>Habilitar control remoto global</span>
          <button type="button" role="switch" aria-checked="true" class="toggle toggle--on" id="tog-remoto" onclick="toggleSwitch('tog-remoto')">
            <div class="toggle__knob"></div>
          </button>
        </div>
        <div class="toggle-row">
          <span>Apagado automático al cierre</span>
          <button type="button" role="switch" aria-checked="false" class="toggle" id="tog-apagado" onclick="toggleSwitch('tog-apagado')">
            <div class="toggle__knob"></div>
          </button>
        </div>
        <div class="toggle-row">
          <span>Monitoreo de estado en tiempo real</span>
          <button type="button" role="switch" aria-checked="true" class="toggle toggle--on" id="tog-monitor" onclick="toggleSwitch('tog-monitor')">
            <div class="toggle__knob"></div>
          </button>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label class="form-label">Intervalo de actualización (segundos)</label>
          <input class="form-input" type="number" id="cfg-intervalo" value="30" min="5" max="300" style="max-width:120px" />
        </div>
      </div>
    `;

    /* ===== RED (solo admin) ===== */
    case "red": return `
      <h2 class="cfg-panel__title">Configuración de red</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div class="form-group">
          <label class="form-label">Subred de laboratorios</label>
          <input class="form-input" id="cfg-subred" value="${config.red.subredLabs}" />
        </div>
        <div class="form-group">
          <label class="form-label">Servidor DNS</label>
          <input class="form-input" id="cfg-dns" value="${config.red.servidorDNS}" />
        </div>
        <div class="form-group">
          <label class="form-label">Puerta de enlace</label>
          <input class="form-input" id="cfg-gateway" value="${config.red.puertaEnlace}" />
        </div>
        <div class="toggle-row">
          <span>Red WiFi habilitada en laboratorios</span>
          <button type="button" role="switch" aria-checked="${config.red.wifiHabilitado}" class="toggle ${config.red.wifiHabilitado ? "toggle--on" : ""}"
            id="tog-wifi" onclick="toggleSwitch('tog-wifi')">
            <div class="toggle__knob"></div>
          </button>
        </div>
      </div>
    `;

    /* ===== USUARIOS CFG (solo admin) ===== */
    case "usuarios-cfg": return `
      <h2 class="cfg-panel__title">Configuración de usuarios</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div class="form-group">
          <label class="form-label">Correo del administrador</label>
          <input class="form-input" id="cfg-email-admin" type="email" value="${config.notificaciones.emailAdmin}" />
        </div>
        <div class="form-group">
          <label class="form-label">Tiempo de inactividad para cierre de sesión (minutos)</label>
          <input class="form-input" type="number" id="cfg-timeout" value="${config.seguridad.sesionTimeout}" min="5" max="120" style="max-width:120px" />
        </div>
        <div class="form-group">
          <label class="form-label">Intentos de login antes de bloqueo</label>
          <input class="form-input" type="number" id="cfg-intentos" value="${config.seguridad.intentosLoginMax}" min="3" max="10" style="max-width:120px" />
        </div>
        <div class="toggle-row">
          <span>Registro de actividad de usuarios</span>
          <button type="button" role="switch" aria-checked="${config.seguridad.registroActividad}" class="toggle ${config.seguridad.registroActividad ? "toggle--on" : ""}"
            id="tog-registro" onclick="toggleSwitch('tog-registro')">
            <div class="toggle__knob"></div>
          </button>
        </div>
      </div>
    `;

    /* ===== SISTEMA (solo admin) ===== */
    case "sistema": return `
      <h2 class="cfg-panel__title">Sistema</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px">
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Versión del sistema</div>
            <div class="cfg-sys-card__value">LabControl v2.7</div>
          </div>
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Total laboratorios</div>
            <div class="cfg-sys-card__value">5</div>
          </div>
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Total equipos</div>
            <div class="cfg-sys-card__value">145</div>
          </div>
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Usuarios registrados</div>
            <div class="cfg-sys-card__value">${usuariosTotal.length}</div>
          </div>
        </div>
        <hr style="border-color:var(--color-border);margin-bottom:16px">
        <div style="font-weight:600;margin-bottom:10px;color:var(--color-danger)">Zona peligrosa</div>
        <button class="btn btn--danger" onclick="if(confirm('¿Restablecer configuración de fábrica?'))showToast('Configuración restablecida.','success')">
          <i data-lucide="triangle-alert"></i> Restablecer configuración de fábrica
        </button>
      </div>
    `;

    default: return `<p style="color:var(--color-text-muted)">Sección no disponible.</p>`;
  }
}

/* -------- Helpers de UI -------- */

function toggleSwitch(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const activo = el.classList.toggle("toggle--on");
  el.setAttribute("aria-checked", String(activo));
}

/* -------- Notificaciones del sistema (PC y celular) -------- */
function actualizarEstadoNotifUI() {
  const btn   = document.getElementById("btn-activar-notif");
  const estado = document.getElementById("estado-notif");
  if (!btn || !estado || !("Notification" in window)) {
    if (estado) estado.textContent = "Tu navegador no soporta notificaciones del sistema.";
    return;
  }
  if (Notification.permission === "granted") {
    btn.style.display = "none";
    estado.textContent = "Notificaciones del sistema activadas en este dispositivo.";
    estado.style.color = "var(--color-success, #16a34a)";
  } else if (Notification.permission === "denied") {
    btn.style.display = "none";
    estado.textContent = "Las notificaciones están bloqueadas: habilítalas en los ajustes del navegador.";
  } else {
    btn.style.display = "";
    estado.textContent = "";
  }
}

async function activarNotificacionesDesdeConfig() {
  await activarNotificacionesSistema();
  actualizarEstadoNotifUI();
}

const TEMAS_VALIDOS = ["claro", "oscuro"];
const MAPA_TEMAS_LEGADO = {
  "dark-sidebar": "oscuro",
  "blue-sidebar": "claro",
  "green-sidebar": "claro",
  "azul": "claro",
  "verde": "claro",
};

function temaActivo() {
  let t;
  try { t = localStorage.getItem("lc_tema"); } catch (e) {}
  if (!TEMAS_VALIDOS.includes(t)) {
    t = MAPA_TEMAS_LEGADO[config?.sitio?.tema] || config?.sitio?.tema;
  }
  return TEMAS_VALIDOS.includes(t) ? t : "claro";
}

function seleccionarTema(temaId, el) {
  document.querySelectorAll(".tema-item").forEach((t) => t.classList.remove("is-active"));
  el.classList.add("is-active");
  document.documentElement.dataset.theme = temaId;
  try { localStorage.setItem("lc_tema", temaId); } catch (e) {}
  config.sitio.tema = temaId;
}

async function cambiarContrasena() {
  const actual   = document.getElementById("s-pass-actual").value;
  const nueva    = document.getElementById("s-pass-nueva").value;
  const confirma = document.getElementById("s-pass-confirm").value;
  if (!actual || !nueva) { showToast("Completa todos los campos.", "error"); return; }
  if (nueva !== confirma) { showToast("Las contraseñas no coinciden.", "error"); return; }
  if (nueva.length < 6)   { showToast("La contraseña debe tener al menos 6 caracteres.", "error"); return; }
  try {
    await apiSend("POST", "/change-password", { currentPassword: actual, newPassword: nueva });
    showToast("Contraseña actualizada correctamente.");
    ["s-pass-actual", "s-pass-nueva", "s-pass-confirm"].forEach((id) =>
      document.getElementById(id).value = ""
    );
  } catch (e) {
    showToast(e.message || "No se pudo actualizar la contraseña.", "error");
  }
}

/* -------- Guardar cambios -------- */
document.getElementById("btn-guardar-cfg").addEventListener("click", () => {
  const tareas = [];

  // Perfil (nombre / apellido)
  const nombre   = document.getElementById("p-nombre")?.value.trim();
  const apellido = document.getElementById("p-apellido")?.value.trim();
  const cambiosUsr = {};
  if (nombre)   cambiosUsr.nombre = nombre;
  if (apellido) cambiosUsr.apellido = apellido;
  if (usuario && Object.keys(cambiosUsr).length) {
    tareas.push(actualizarUsuario(usuario.id, cambiosUsr));
  }

  // Configuración (solo aplica si hay algo cargado, y solo lo que exista en la pantalla actual)
  const cambiosCfg = {};
  const apertura = document.getElementById("cfg-apertura")?.value;
  const cierre   = document.getElementById("cfg-cierre")?.value;
  if (apertura || cierre) {
    cambiosCfg.laboratorios = { ...config.laboratorios };
    if (apertura) cambiosCfg.laboratorios.horaApertura = apertura;
    if (cierre)   cambiosCfg.laboratorios.horaCierre   = cierre;
  }
  // El tema elegido en "Apariencia" (seleccionarTema) ya quedó guardado en config.sitio
  if (config?.sitio) cambiosCfg.sitio = { ...config.sitio };

  // Notificaciones: interruptores presentes en la pantalla actual
  const togglesNotif = {
    "n-reservas":   "alertaReservas",
    "n-cambios":    "alertaDisponibilidad",
    "n-fallas":     "alertaFallas",
    "n-reportes":   "alertaReportes",
    "n-recordator": "recordatorioReserva"
  };
  for (const [idToggle, clave] of Object.entries(togglesNotif)) {
    const el = document.getElementById(idToggle);
    if (el) cambiosCfg.notificaciones = { ...cambiosCfg.notificaciones, [clave]: el.classList.contains("toggle--on") };
  }

  if (Object.keys(cambiosCfg).length) {
    tareas.push(actualizarConfig(cambiosCfg));
  }

  if (!tareas.length) {
    showToast("No hay cambios para guardar.");
    return;
  }

  Promise.all(tareas)
    .then(() => showToast("Configuración guardada correctamente."))
    .catch(() => showToast("No se pudo guardar la configuración.", "error"));
});

/* -------- Botón de ayuda (?) y su menú -------- */
(function iniciarMenuAyuda() {
  const btn  = document.getElementById("btn-ayuda");
  const menu = document.getElementById("cfg-ayuda-menu");
  if (!btn || !menu) return;

  const alternar = (abierto) => {
    menu.classList.toggle("is-open", abierto);
    btn.setAttribute("aria-expanded", String(abierto));
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    alternar(!menu.classList.contains("is-open"));
  });

  document.addEventListener("click", (e) => {
    if (menu.classList.contains("is-open") && !menu.contains(e.target) && !btn.contains(e.target)) {
      alternar(false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) {
      alternar(false);
      btn.focus();
    }
  });

  menu.addEventListener("click", (e) => {
    const opcion = e.target.closest("button")?.dataset.opcion;
    if (!opcion) return;
    alternar(false);
    abrirAyuda(opcion);
  });
})();

function abrirAyuda(opcion) {
  const titulo = document.getElementById("modal-ayuda-titulo");
  const cuerpo = document.getElementById("modal-ayuda-cuerpo");
  if (!titulo || !cuerpo) return;

  if (opcion === "faq") {
    titulo.textContent = "Ayuda / FAQ";
    cuerpo.innerHTML = contenidoFaq();
  } else if (opcion === "terminos") {
    titulo.textContent = "Términos y condiciones";
    cuerpo.innerHTML = contenidoTerminos();
  } else if (opcion === "acerca") {
    titulo.textContent = "Acerca de";
    cuerpo.innerHTML = contenidoAcerca();
  }

  actualizarIconosLucide();
  abrirModal("modal-ayuda");
}

function contenidoFaq() {
  const items = [
    { p: "¿Cómo reservo un laboratorio?", r: "Anda a la página Disponibilidad, elige la fecha y el bloque horario disponible y confirma la reserva. Te llegará una notificación cuando se confirme." },
    { p: "¿Cómo cambio el estado de un laboratorio?", r: "En Disponibilidad o Laboratorios usa el selector de estado (Disponible / Ocupado / Mantención). El cambio se refleja al instante y avisa a los demás usuarios." },
    { p: "¿Por qué no veo la sección de Reportes?", r: "Los reportes están disponibles para el administrador y los profesores de Programación. Si tu cuenta es de otra área, esa sección no se muestra." },
    { p: "¿Cómo activo las notificaciones en mi celular?", r: "Anda a Configuración → Notificaciones, pulsa “Activar notificaciones” y acepta el permiso del navegador. Funciona tanto en el PC como en el celular." },
    { p: "¿Cómo recupero o cambio mi contraseña?", r: "Desde tu cuenta usa Configuración → Seguridad para cambiarla. Si la olvidaste, solicita el restablecimiento al administrador del sistema (INSUCO)." },
    { p: "¿Qué hago si un equipo falla?", r: "Crea un reporte desde la página Reportes indicando el equipo y la falla. Los demás usuarios recibirán una notificación automática." },
  ];
  return `<div class="ayuda-faq">` + items.map((i) => `
    <details>
      <summary>${esc(i.p)}</summary>
      <p>${esc(i.r)}</p>
    </details>
  `).join("") + `</div>`;
}

function contenidoTerminos() {
  return `
    <div class="ayuda-texto">
      <p>Al usar el sistema <strong>Insuco LabControl</strong> aceptas las siguientes condiciones:</p>
      <h3>1. Uso del sistema</h3>
      <p>La plataforma es de uso exclusivo de los profesores y el personal autorizado del liceo. Las cuentas son personales e intransferibles.</p>
      <h3>2. Reservas y disponibilidad</h3>
      <p>Las reservas de laboratorios deben corresponder a actividades reales de clases o talleres. El administrador puede cancelar o modificar una reserva cuando sea necesario.</p>
      <h3>3. Reportes de fallas</h3>
      <p>Los reportes de equipos deben describir de forma clara y precisa la falla detectada para facilitar su reparación.</p>
      <h3>4. Responsabilidad</h3>
      <p>El liceo no se hace responsable por el mal uso de la información o por el incumplimiento de las normas de convivencia escolar al usar los laboratorios.</p>
      <h3>5. Datos y privacidad</h3>
      <p>Los datos personales se usan únicamente dentro del sistema para identificar a los usuarios y gestionar las operaciones del establecimiento.</p>
    </div>`;
}

function contenidoAcerca() {
  const usuario  = config?.sitio?.nombreInstitucion ?? "Insuco";
  const sistema  = config?.sitio?.nombreSistema  ?? "LabControl";
  return `
    <div class="ayuda-acerca">
      <img src="img/logo-insuco.png" alt="Logo del liceo">
      <div style="font-weight:800;font-size:1.1rem">${esc(sistema)}</div>
      <div style="font-size:.85rem;color:var(--color-text-muted)">Sistema de control y supervisión de los laboratorios de computación del liceo.</div>
      <div class="cfg-sys-card" style="margin:18px auto 0;max-width:260px">
        <div class="cfg-sys-card__label">Versión del sistema</div>
        <div class="cfg-sys-card__value">LabControl v2.7</div>
      </div>
      <div class="cfg-sys-card" style="margin:10px auto 0;max-width:260px">
        <div class="cfg-sys-card__label">Institución</div>
        <div class="cfg-sys-card__value">${esc(usuario)}</div>
      </div>
      <p style="font-size:.78rem;color:var(--color-text-muted);margin-top:16px">Más información disponible próximamente.</p>
    </div>`;
}