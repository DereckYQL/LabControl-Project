/* Imports (ES modules) */
import { AUTH, ESTADOS, actualizarConfig, actualizarUsuario, apiSend, cargarAuditoria, cargarConfig, cargarEquipos, cargarEstado2FA, cargarLaboratorios, cargarSolicitudEspecialidad, cargarSolicitudesEspecialidad, cargarUsuarios, desactivar2FA, exportarBackup, iniciarConfiguracion2FA, resolverSolicitudEspecialidad, restaurarBackup, solicitarCambioEspecialidad, verificarConfiguracion2FA } from "./data.js";
import { abrirModal, activarNotificacionesSistema, actualizarIconosLucide, esc, renderSidebar, rolLabel, showToast } from "./app.js";

/* Valores por defecto de configuración (espejo del backend, db.js). */
const CONFIG_DEFAULT = {
  sitio: { nombreInstitucion: "Instituto Superior de Comercio", nombreSistema: "LabControl", logo: "", tema: "claro", idioma: "es" },
  red: { subredLabs: "192.168.10.0/24", servidorDNS: "192.168.1.1", puertaEnlace: "192.168.1.254", wifiHabilitado: true },
  notificaciones: { emailAdmin: "admin@liceo.cl", alertaFallas: true, alertaDisponibilidad: true, alertaReservas: true, alertaReportes: true, alertaSolicitudes: true, recordatorioReserva: false },
  seguridad: { sesionTimeout: 30, intentosLoginMax: 5, registroActividad: true },
  laboratorios: { horaApertura: "07:30", horaCierre: "18:00", permitirReservaExterna: true, anticipacionMaxReserva: 7 },
  equipos: { habilitarControlRemoto: true, apagadoAutomatico: false, monitoreoTiempoReal: true, intervaloEncendido: 30 }
};

/* configuracion.js — lógica de la página Configuración. */
renderSidebar("configuracion.html");
const esAdmin = AUTH.esAdmin();
const sesion  = AUTH.getSesion();

// Se llenan cuando responde la API; las funciones de abajo los usan al interactuar.
let config = null;
let usuario = null;
let usuariosTotal = [];
let totalLaboratorios = 0;
let totalEquipos = 0;
let misSolicitudes = [];

let secciones = [];

async function cargarConteos() {
  const [labs, eqs] = await Promise.all([
    cargarLaboratorios().catch(() => []),
    cargarEquipos().catch(() => [])
  ]);
  totalLaboratorios = labs.length;
  totalEquipos = eqs.length;
}

Promise.all([
  cargarConfig(),
  cargarUsuarios(),
  cargarConteos(),
  cargarSolicitudesEspecialidad().catch(() => [])
]).then(([cfg, usuarios, , solicitudes]) => {
  config = cfg;
  usuariosTotal = usuarios;
  usuario = usuarios.find((u) => u.id === sesion?.id) || null;
  misSolicitudes = solicitudes || [];
  iniciarPantalla();
});

function iniciarPantalla() {
  if (esAdmin) {
    document.getElementById("cfg-subtitulo").textContent =
      "Configuración completa del sistema — modo Administrador";
  }

  /* Tema activo */
  const activo = temaActivo();
  document.documentElement.dataset.theme = activo;
  if (config?.sitio) config.sitio.tema = activo;

  /* Tamaño de texto accesible */
  aplicarTamanoTexto(tamanoTextoGuardado());

  /* Secciones */
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
    { id: "auditoria",        icon: "history",  label: "Auditoría" },
    { id: "backups",          icon: "database", label: "Respaldos" },
    { id: "sistema",          icon: "wrench",   label: "Sistema" },
  ];

  secciones = esAdmin ? [...SECCIONES_BASE, ...SECCIONES_ADMIN] : SECCIONES_BASE;

  /* Menú lateral */
  const sidenav = document.getElementById("cfg-sidenav");
  sidenav.innerHTML = secciones.map((s, i) => `
    <button class="cfg-nav-btn ${i === 0 ? "is-active" : ""}"
      data-section="${s.id}">
      <i data-lucide="${s.icon}"></i> ${s.label}
    </button>
  `).join("");

  /* Paneles */
  const panels = document.getElementById("cfg-panels");
  panels.innerHTML = secciones.map((s, i) => `
    <div class="cfg-panel ${i === 0 ? "is-active" : ""}" id="panel-${s.id}">
      ${buildPanel(s.id)}
    </div>
  `).join("");

  actualizarEstadoNotifUI();
  const selTexto = document.getElementById("p-texto");
  if (selTexto) selTexto.value = tamanoTextoGuardado();
  refrescarHintsPerfil();
  actualizarIconosLucide();

  /* Contenido dinámico de secciones nuevas */
  refrescarEstado2FA();
  if (esAdmin) cargarAuditoriaPanel();
}

function refrescarHintsPerfil() {
  if (esAdmin) return;
  const areaHint = document.getElementById("p-area-hint");
  if (areaHint) areaHint.textContent = "El área/departamento solo la puede cambiar el administrador.";
  const especHint = document.getElementById("p-especialidad-hint");
  const campoEspec = document.getElementById("p-especialidad");
  if (!especHint || !campoEspec) return;
  const pendiente = (misSolicitudes || []).find((s) => s.estado === "pendiente");
  if (pendiente) {
    especHint.textContent = `Tienes una solicitud pendiente: "${pendiente.especialidadSolicitada}". Espera la respuesta del administrador.`;
    campoEspec.disabled = true;
  } else {
    especHint.textContent = "Los cambios de especialidad requieren aprobación del administrador.";
    campoEspec.disabled = false;
  }
}

function cambiarSeccion(id) {
  document.querySelectorAll(".cfg-nav-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.section === id)
  );
  document.querySelectorAll(".cfg-panel").forEach((p) =>
    p.classList.toggle("is-active", p.id === `panel-${id}`)
  );
  if (id === "perfil") refrescarHintsPerfil();
}

function buildPanel(id) {
  switch (id) {
    /* Perfil */
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
            <input class="form-input" id="p-nombre" value="${usuario?.nombre ?? ""}" required minlength="2" />
          </div>
          <div class="form-group">
            <label class="form-label">Apellido</label>
            <input class="form-input" id="p-apellido" value="${usuario?.apellido ?? ""}" required minlength="2" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Correo institucional</label>
          <input class="form-input" id="p-email" type="email" value="${usuario?.email ?? ""}" required />
        </div>
        <div class="form-row area-especialidad">
          ${esAdmin ? `
            <div class="form-group">
              <label class="form-label">Área / Departamento</label>
              <input class="form-input" id="p-area" value="${usuario?.area ?? ""}" />
            </div>
            <div class="form-group">
              <label class="form-label">Especialidad</label>
              <input class="form-input" id="p-especialidad" value="${usuario?.especialidad ?? ""}" />
            </div>
          ` : `
            <div class="form-group">
              <label class="form-label">Área / Departamento</label>
              <input class="form-input" id="p-area" value="${usuario?.area ?? ""}" disabled />
              <span class="form-hint" id="p-area-hint"></span>
            </div>
            <div class="form-group">
              <label class="form-label">Especialidad</label>
              <input class="form-input" id="p-especialidad" value="${usuario?.especialidad ?? ""}" />
              <span class="form-hint" id="p-especialidad-hint"></span>
            </div>
          `}
        </div>
      </div>
    `;

    /* Apariencia */
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
                data-tema="${t.id}" style="--tema-bg:${t.bg}">
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

    /* Notificaciones */
    case "notificaciones": return `
      <h2 class="cfg-panel__title">Notificaciones</h2>
      <div class="cfg-section">
        <div style="font-weight:600;margin-bottom:10px">Avisos dentro del sitio</div>
        ${[
          { id:"n-reservas",   label:"Confirmación y avisos de reservas",      checked: config.notificaciones?.alertaReservas ?? true },
          { id:"n-cambios",    label:"Cambios de estado de laboratorio",       checked: config.notificaciones?.alertaDisponibilidad ?? true },
          { id:"n-fallas",     label:"Alertas de fallas de equipos",           checked: config.notificaciones?.alertaFallas ?? true },
          { id:"n-reportes",   label:"Nuevos reportes y cambios en reportes",  checked: config.notificaciones?.alertaReportes ?? true },
          { id:"n-solicitudes", label:"Solicitudes de cambio de especialidad",  checked: config.notificaciones?.alertaSolicitudes ?? true },
          { id:"n-recordator", label:"Recordatorio 30 min antes de reserva",   checked: config.notificaciones?.recordatorioReserva ?? false },
        ].map((n) => `
          <div class="toggle-row">
            <span>${n.label}</span>
<button type="button" role="switch" aria-checked="${n.checked}" class="toggle ${n.checked ? "toggle--on" : ""}" id="${n.id}">
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
        <button class="btn btn--primary" id="btn-activar-notif">
          <i data-lucide="bell-ring"></i> Activar notificaciones
        </button>
        <p id="estado-notif" style="font-size:.82rem;margin-top:10px;color:var(--color-text-muted)"></p>
      </div>
    `;

    /* Seguridad */
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
        <button class="btn btn--primary" id="btn-cambiar-contrasena" style="margin-top:4px">Cambiar contraseña</button>
        <hr style="margin:24px 0;border-color:var(--color-border)">
        <div style="font-weight:600;margin-bottom:6px">Verificación en dos pasos</div>
        <p id="s-2fa-desc" style="color:var(--color-text-muted);font-size:.88rem">Cargando estado…</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
          <button class="btn" id="btn-2fa-config"><i data-lucide="shield-plus"></i> Configurar 2FA</button>
          <button class="btn btn--danger" id="btn-2fa-desactivar" style="display:none"><i data-lucide="shield-off"></i> Desactivar 2FA</button>
        </div>
        <hr style="margin:24px 0;border-color:var(--color-border)">
        <div style="font-weight:600;margin-bottom:10px">Sesión activa</div>
        <p style="color:var(--color-text-muted);font-size:.88rem;margin-bottom:12px">Usuario: <strong>${sesion?.id}</strong> — Rol: ${rolLabel(sesion?.rol)}</p>
        <button class="btn btn--danger" id="btn-cerrar-sesion">Cerrar sesión</button>
      </div>
    `;

    /* Sitio (admin) */
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

    /* Laboratorios (admin) */
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
            id="tog-reserva-ext">
            <div class="toggle__knob"></div>
          </button>
        </div>
      </div>
    `;

    /* Equipos (admin) */
    case "equipos-cfg": return `
      <h2 class="cfg-panel__title">Configuración de equipos</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div class="toggle-row">
          <span>Habilitar control remoto global</span>
          <button type="button" role="switch" aria-checked="${config.equipos?.habilitarControlRemoto ?? true}" class="toggle ${(config.equipos?.habilitarControlRemoto ?? true) ? "toggle--on" : ""}" id="tog-remoto">
            <div class="toggle__knob"></div>
          </button>
        </div>
        <div class="toggle-row">
          <span>Apagado automático al cierre</span>
          <button type="button" role="switch" aria-checked="${config.equipos?.apagadoAutomatico ?? false}" class="toggle ${(config.equipos?.apagadoAutomatico ?? false) ? "toggle--on" : ""}" id="tog-apagado">
            <div class="toggle__knob"></div>
          </button>
        </div>
        <div class="toggle-row">
          <span>Monitoreo de estado en tiempo real</span>
          <button type="button" role="switch" aria-checked="${config.equipos?.monitoreoTiempoReal ?? true}" class="toggle ${(config.equipos?.monitoreoTiempoReal ?? true) ? "toggle--on" : ""}" id="tog-monitor">
            <div class="toggle__knob"></div>
          </button>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label class="form-label">Intervalo de actualización (segundos)</label>
          <input class="form-input" type="number" id="cfg-intervalo" value="${config.equipos?.intervaloEncendido ?? 30}" min="5" max="300" style="max-width:120px" />
        </div>
      </div>
    `;

    /* Red (admin) */
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
            id="tog-wifi">
            <div class="toggle__knob"></div>
          </button>
        </div>
      </div>
    `;

    /* Usuarios (admin) */
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
            id="tog-registro">
            <div class="toggle__knob"></div>
          </button>
        </div>
      </div>
    `;

    /* Auditoría (admin) */
    case "auditoria": return `
      <h2 class="cfg-panel__title">Auditoría de actividad</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div class="cfg-aud-filtros">
          <div class="form-group">
            <label class="form-label" for="aud-q">Buscar</label>
            <input class="form-input" id="aud-q" placeholder="Acción, usuario, detalle…" />
          </div>
          <div class="form-group">
            <label class="form-label" for="aud-desde">Desde</label>
            <input class="form-input" type="date" id="aud-desde" />
          </div>
          <div class="form-group">
            <label class="form-label" for="aud-hasta">Hasta</label>
            <input class="form-input" type="date" id="aud-hasta" />
          </div>
          <div class="cfg-aud-filtros__acciones">
            <button class="btn btn--primary" id="btn-aud-filtrar"><i data-lucide="search"></i> Filtrar</button>
            <button class="btn" id="btn-aud-limpiar">Limpiar</button>
          </div>
        </div>
        <div class="cfg-aud-wrap">
          <table class="cfg-aud-table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
            <tbody id="aud-tbody"><tr><td colspan="6" class="cfg-aud-vacio">Cargando…</td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    /* Respaldos de la base de datos (admin) */
    case "backups": return `
      <h2 class="cfg-panel__title">Respaldos de la base de datos</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <p style="color:var(--color-text-muted);font-size:.88rem;margin:0 0 16px">
          Descarga una copia de seguridad de toda la base de datos (laboratorios, usuarios, reservas, reportes y configuración).
          Puedes restaurarla después desde un archivo <code>.db</code>.
        </p>
        <div class="cfg-backup-acciones">
          <button class="btn btn--primary" id="btn-backup-descargar"><i data-lucide="download"></i> Descargar respaldo (.db)</button>
          <label class="btn" for="input-backup-archivo"><i data-lucide="upload"></i> Restaurar respaldo…</label>
          <input type="file" id="input-backup-archivo" accept=".db,application/octet-stream" style="display:none" />
        </div>
        <p id="p-backup-estado" class="form-hint" style="margin-top:12px"></p>
        <p class="form-hint" style="margin-top:8px">
          <strong>Aviso:</strong> restaurar reemplaza por completo la base de datos actual y
          <strong>cierra todas las demás sesiones activas</strong>. Guarda una copia antes de restaurar.
        </p>
      </div>
    `;

    /* Sistema (admin) */
    case "sistema": return `
      <h2 class="cfg-panel__title">Sistema</h2>
      <div class="cfg-admin-badge"><i data-lucide="key-round"></i> Solo administradores</div>
      <div class="cfg-section">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px">
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Versión del sistema</div>
            <div class="cfg-sys-card__value">LabControl v3.4</div>
          </div>
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Total laboratorios</div>
            <div class="cfg-sys-card__value">${totalLaboratorios}</div>
          </div>
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Total equipos</div>
            <div class="cfg-sys-card__value">${totalEquipos}</div>
          </div>
          <div class="cfg-sys-card">
            <div class="cfg-sys-card__label">Usuarios registrados</div>
            <div class="cfg-sys-card__value">${usuariosTotal.length}</div>
          </div>
        </div>
        <hr style="border-color:var(--color-border);margin-bottom:16px">
        <div style="font-weight:600;margin-bottom:10px;color:var(--color-danger)">Zona peligrosa</div>
        <button class="btn btn--danger" id="btn-restablecer-cfg">
          <i data-lucide="triangle-alert"></i> Restablecer configuración de fábrica
        </button>
      </div>
    `;

    default: return `<p style="color:var(--color-text-muted)">Sección no disponible.</p>`;
  }
}

// Helpers de UI

function toggleSwitch(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const activo = el.classList.toggle("toggle--on");
  el.setAttribute("aria-checked", String(activo));
}

// Notificaciones del sistema
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

function tamanoTextoGuardado() {
  try { return localStorage.getItem("lc_texto") || "normal"; } catch (e) { return "normal"; }
}

function aplicarTamanoTexto(valor) {
  const v = valor === "grande" ? "grande" : "normal";
  document.documentElement.classList.toggle("texto-grande", v === "grande");
  try { localStorage.setItem("lc_texto", v); } catch (e) {}
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

// Guardar cambios
document.getElementById("btn-guardar-cfg").addEventListener("click", () => {
  const tareas = [];
  const errs = [];
  const cambiosCfg = {};

  // Perfil (nombre, apellido, correo y, solo para admin, área y especialidad)
  const nombre   = document.getElementById("p-nombre")?.value.trim();
  const apellido = document.getElementById("p-apellido")?.value.trim();
  const correo   = document.getElementById("p-email")?.value.trim();
  const area     = document.getElementById("p-area")?.value.trim();
  const espec    = document.getElementById("p-especialidad")?.value.trim();
  const cambioUsr = {};
  if (nombre) cambioUsr.nombre = nombre;
  if (apellido) cambioUsr.apellido = apellido;
  if (correo && usuario && correo !== usuario.email) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) cambioUsr.email = correo;
    else errs.push("El correo del perfil no es válido.");
  }
  if (usuario && esAdmin && area !== undefined) cambioUsr.area = area;
  if (usuario && esAdmin && espec !== undefined) cambioUsr.especialidad = espec;
  if (usuario && Object.keys(cambioUsr).length) {
    tareas.push(actualizarUsuario(usuario.id, cambioUsr).then((res) => {
      if (res && res.token) {
        const prev = AUTH.getSesion();
        if (prev) {
          localStorage.setItem("lc_sesion", JSON.stringify({
            ...prev, token: res.token,
            nombre: res.nombre, apellido: res.apellido, iniciales: res.iniciales
          }));
        }
      }
      return res;
    }));
  }

  // Los no-admins cambian la especialidad mediante una solicitud que el
  // administrador aprueba o rechaza; el área no la pueden modificar.
  if (usuario && !esAdmin && espec !== undefined && espec && espec !== usuario.especialidad) {
    tareas.push(solicitarCambioEspecialidad(espec).then((sol) => {
      misSolicitudes = (misSolicitudes || []).filter((s) => s.usuarioId === usuario.id);
      misSolicitudes.unshift(sol);
      refrescarHintsPerfil();
      return sol;
    }));
  }

  // Tamaño de texto (preferencia local)
  aplicarTamanoTexto(document.getElementById("p-texto")?.value);

  const toggles = (id) => { const el = document.getElementById(id); return el ? el.classList.contains("toggle--on") : undefined; };

  // Sitio
  const sit = {};
  if (config?.sitio) {
    const inst = document.getElementById("cfg-inst")?.value.trim();
    const sist = document.getElementById("cfg-sistema")?.value.trim();
    const idioma = document.getElementById("cfg-idioma")?.value;
    if (inst)  sit.nombreInstitucion = inst;
    if (sist)  sit.nombreSistema = sist;
    if (idioma !== undefined) sit.idioma = idioma;
    sit.tema = config.sitio.tema;
  }
  if (Object.keys(sit).length) cambiosCfg.sitio = sit;

  // Red
  const red = {};
  if (config?.red) {
    const subred  = document.getElementById("cfg-subred")?.value.trim();
    const dns     = document.getElementById("cfg-dns")?.value.trim();
    const gateway = document.getElementById("cfg-gateway")?.value.trim();
    if (subred)   red.subredLabs = subred;
    if (dns)      red.servidorDNS = dns;
    if (gateway)  red.puertaEnlace = gateway;
    const wifi = toggles("tog-wifi");
    if (wifi !== undefined) red.wifiHabilitado = wifi;
  }
  if (Object.keys(red).length) cambiosCfg.red = red;

  // Laboratorios
  const labs = {};
  if (config?.laboratorios) {
    const apertura = document.getElementById("cfg-apertura")?.value;
    const cierre   = document.getElementById("cfg-cierre")?.value;
    const anticip  = Number(document.getElementById("cfg-anticip")?.value);
    if (apertura) labs.horaApertura = apertura;
    if (cierre)   labs.horaCierre = cierre;
    if (document.getElementById("cfg-anticip") !== null) {
      if (Number.isInteger(anticip) && anticip >= 1 && anticip <= 30) labs.anticipacionMaxReserva = anticip;
      else errs.push("La anticipación máxima debe ser un número entre 1 y 30 días.");
    }
    const ext = toggles("tog-reserva-ext");
    if (ext !== undefined) labs.permitirReservaExterna = ext;
  }
  if (Object.keys(labs).length) cambiosCfg.laboratorios = labs;

  // Equipos
  const eqs = {};
  const remoto    = toggles("tog-remoto");
  const apagado   = toggles("tog-apagado");
  const monitor   = toggles("tog-monitor");
  const intervalo = Number(document.getElementById("cfg-intervalo")?.value);
  if (remoto !== undefined) eqs.habilitarControlRemoto = remoto;
  if (apagado !== undefined) eqs.apagadoAutomatico = apagado;
  if (monitor !== undefined) eqs.monitoreoTiempoReal = monitor;
  if (document.getElementById("cfg-intervalo") !== null) {
    if (Number.isInteger(intervalo) && intervalo >= 5 && intervalo <= 300) eqs.intervaloEncendido = intervalo;
    else errs.push("El intervalo de actualización debe ser un número entre 5 y 300 segundos.");
  }
  if (Object.keys(eqs).length) cambiosCfg.equipos = eqs;

  // Notificaciones
  const notif = {};
  const togglesNotif = {
    "n-reservas":    "alertaReservas",
    "n-cambios":     "alertaDisponibilidad",
    "n-fallas":      "alertaFallas",
    "n-reportes":    "alertaReportes",
    "n-solicitudes": "alertaSolicitudes",
    "n-recordator":  "recordatorioReserva"
  };
  for (const [idToggle, clave] of Object.entries(togglesNotif)) {
    const v = toggles(idToggle);
    if (v !== undefined) notif[clave] = v;
  }
  const emailAdmin = document.getElementById("cfg-email-admin")?.value.trim();
  if (emailAdmin) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAdmin)) notif.emailAdmin = emailAdmin;
    else errs.push("El correo del administrador no es válido.");
  }
  if (Object.keys(notif).length) cambiosCfg.notificaciones = notif;

  // Seguridad
  const seg = {};
  const timeout  = Number(document.getElementById("cfg-timeout")?.value);
  const intentos = Number(document.getElementById("cfg-intentos")?.value);
  if (document.getElementById("cfg-timeout") !== null) {
    if (Number.isInteger(timeout) && timeout >= 5 && timeout <= 120) seg.sesionTimeout = timeout;
    else errs.push("El tiempo de inactividad debe ser entre 5 y 120 minutos.");
  }
  if (document.getElementById("cfg-intentos") !== null) {
    if (Number.isInteger(intentos) && intentos >= 3 && intentos <= 10) seg.intentosLoginMax = intentos;
    else errs.push("Los intentos de login deben ser entre 3 y 10.");
  }
  const reg = toggles("tog-registro");
  if (reg !== undefined) seg.registroActividad = reg;
  if (Object.keys(seg).length) cambiosCfg.seguridad = seg;

  if (errs.length) { showToast(errs[0], "error"); return; }

  // La configuración avanzada (sitio, red, laboratorios, equipos, notificaciones y
  // seguridad) es exclusiva del administrador; los demás solo guardan su perfil.
  if (esAdmin && Object.keys(cambiosCfg).length) tareas.push(actualizarConfig(cambiosCfg));

  if (!tareas.length) {
    showToast("No hay cambios para guardar.");
    return;
  }

  Promise.all(tareas)
    .then(() => showToast("Configuración guardada correctamente."))
    .catch(() => showToast("No se pudo guardar la configuración.", "error"));
});

function restablecerConfiguracion() {
  if (!config) return;
  const nuevo = {
    sitio:           { ...CONFIG_DEFAULT.sitio,           tema: config.sitio?.tema },
    red:             { ...CONFIG_DEFAULT.red },
    laboratorios:    { ...CONFIG_DEFAULT.laboratorios },
    equipos:         { ...CONFIG_DEFAULT.equipos },
    notificaciones:  { ...CONFIG_DEFAULT.notificaciones },
    seguridad:       { ...CONFIG_DEFAULT.seguridad }
  };
  actualizarConfig(nuevo)
    .then((cfg) => {
      config = cfg;
      document.documentElement.dataset.theme = cfg.sitio?.tema;
      try { localStorage.setItem("lc_tema", cfg.sitio.tema); } catch (e) {}
      iniciarPantalla();
      showToast("Configuración restablecida a valores de fábrica.", "success");
    })
    .catch(() => showToast("No se pudo restablecer la configuración.", "error"));
}

// Menú de ayuda (?)
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
        <div class="cfg-sys-card__value">LabControl v3.4</div>
      </div>
      <div class="cfg-sys-card" style="margin:10px auto 0;max-width:260px">
        <div class="cfg-sys-card__label">Institución</div>
        <div class="cfg-sys-card__value">${esc(usuario)}</div>
      </div>
      <p style="font-size:.78rem;color:var(--color-text-muted);margin-top:16px">Más información disponible próximamente.</p>
    </div>`;
}

/* Delegación de eventos: el CSP estricto bloquea atributos onclick/onchange
   inline, incluso los generados por innerHTML, así que los manejadores se
   registran aquí una sola vez sobre el documento. */
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-section]");
  if (nav) { cambiarSeccion(nav.dataset.section); return; }

  const tema = e.target.closest(".tema-item[data-tema]");
  if (tema) { seleccionarTema(tema.dataset.tema, tema); return; }

  const sw = e.target.closest("[role='switch']");
  if (sw) { toggleSwitch(sw.id); return; }

  if (e.target.closest("#btn-activar-notif")) { activarNotificacionesDesdeConfig(); return; }
  if (e.target.closest("#btn-cambiar-contrasena")) { cambiarContrasena(); return; }
  if (e.target.closest("#btn-cerrar-sesion")) { AUTH.logout(); return; }
  if (e.target.closest("#btn-restablecer-cfg")) {
    if (confirm("¿Restablecer la configuración a valores de fábrica?")) restablecerConfiguracion();
    return;
  }
  if (e.target.closest("#btn-2fa-config")) { configurar2FA(); return; }
  if (e.target.closest("#btn-2fa-desactivar")) { abrirModal2FA("desactivar"); return; }
  if (e.target.closest("#btn-2fa-confirmar")) { confirmarModal2FA(); return; }
  if (e.target.closest("#btn-backup-descargar")) { descargarBackup(); return; }
  if (e.target.closest("#btn-aud-filtrar") || e.target.closest("#btn-aud-limpiar")) {
    if (e.target.closest("#btn-aud-limpiar")) {
      const q = document.getElementById("aud-q");
      const d = document.getElementById("aud-desde");
      const h = document.getElementById("aud-hasta");
      if (q) q.value = "";
      if (d) d.value = "";
      if (h) h.value = "";
    }
    cargarAuditoriaPanel();
    return;
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "p-texto") aplicarTamanoTexto(e.target.value);
  if (e.target.id === "input-backup-archivo") { restaurarBackupDesdeInput(); return; }
});

/* ===== Verificación en dos pasos ===== */

async function refrescarEstado2FA() {
  const desc = document.getElementById("s-2fa-desc");
  const btnConfig = document.getElementById("btn-2fa-config");
  const btnDesac = document.getElementById("btn-2fa-desactivar");
  if (!desc) return;
  try {
    const estado = await cargarEstado2FA();
    if (estado?.habilitado) {
      desc.textContent = "Activa. Necesitarás tu aplicación de autenticación al iniciar sesión.";
      if (btnConfig) btnConfig.style.display = "none";
      if (btnDesac) btnDesac.style.display = "";
    } else {
      desc.textContent = esAdmin
        ? "Inactiva. Protégete con un código desde tu aplicación de autenticación (Google Authenticator, Aegis, etc.)."
        : "Solo el administrador puede activar la verificación en dos pasos.";
      if (btnConfig) btnConfig.style.display = esAdmin ? "" : "none";
      if (btnDesac) btnDesac.style.display = "none";
    }
  } catch {
    desc.textContent = "No se pudo consultar el estado de la verificación.";
  }
}

async function configurar2FA() {
  try {
    const r = await iniciarConfiguracion2FA();
    const img = document.getElementById("modal-2fa-qr-img");
    if (img) {
      img.src = r.qrDataUrl || "";
      img.style.display = r.qrDataUrl ? "" : "none";
    }
    const secreto = document.getElementById("modal-2fa-secreto");
    if (secreto) secreto.value = r.secreto || "";
    abrirModal2FA("activar");
  } catch (err) {
    showToast(err?.message || "No se pudo iniciar la configuración 2FA", "error");
  }
}

async function abrirModal2FA(accion) {
  const cuerpo = document.getElementById("modal-2fa-cuerpo");
  if (!cuerpo) return;
  cuerpo.dataset.accion = accion;
  const qr = document.getElementById("modal-2fa-qr-box");
  const secreto = document.getElementById("modal-2fa-secreto");
  const info = document.getElementById("modal-2fa-info");
  document.getElementById("modal-2fa-titulo").textContent =
    accion === "activar" ? "Activar verificación en dos pasos" : "Desactivar verificación en dos pasos";
  if (qr) qr.style.display = accion === "activar" ? "" : "none";
  if (secreto) secreto.style.display = accion === "activar" ? "" : "none";
  if (info) {
    info.textContent = accion === "activar"
      ? "Escanea el código QR con tu aplicación de autenticación o ingresa el secreto manualmente. Luego escribe el código de 6 dígitos para confirmar."
      : "Escribe el código actual de tu aplicación de autenticación para desactivar la verificación.";
  }
  document.getElementById("modal-2fa-codigo").value = "";
  document.getElementById("modal-2fa-error").style.display = "none";
  abrirModal("modal-2fa");
}

async function confirmarModal2FA() {
  const cuerpo = document.getElementById("modal-2fa-cuerpo");
  const accion = cuerpo?.dataset.accion || "activar";
  const codigo = document.getElementById("modal-2fa-codigo").value.trim();
  const errorEl = document.getElementById("modal-2fa-error");
  if (errorEl) errorEl.style.display = "none";
  if (!/^\d{6}$/.test(codigo)) {
    if (errorEl) {
      errorEl.textContent = "Ingresa el código de 6 dígitos.";
      errorEl.style.display = "block";
    }
    return;
  }
  const btn = document.getElementById("btn-2fa-confirmar");
  if (btn) btn.disabled = true;
  try {
    if (accion === "activar") await verificarConfiguracion2FA(codigo);
    else await desactivar2FA(codigo);
    // Cierra el modal por su botón (libera también los listeners de abrirModal).
    const cierreBoton = document.querySelector("#modal-2fa .modal__close");
    if (cierreBoton) cierreBoton.click();
    showToast(
      accion === "activar" ? "Verificación en dos pasos activada" : "Verificación en dos pasos desactivada",
      "success"
    );
    refrescarEstado2FA();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err?.message || "Ocurrió un error al guardar.";
      errorEl.style.display = "block";
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ===== Auditoría ===== */

const ACCIONES_LEGIBLE = {
  login_ok: "Inicio de sesión",
  login_fallido: "Intento de acceso fallido",
  login_2fa_pendiente: "Verificación 2FA solicitada",
  login_2fa_codigo_invalido: "Código 2FA inválido",
  logout: "Cierre de sesión",
  password_cambiada: "Cambio de contraseña",
  laboratorio_estado_cambiado: "Estado de laboratorio",
  usuario_creado: "Usuario creado",
  usuario_editado: "Usuario modificado",
  reserva_creada: "Reserva creada",
  reserva_cancelada: "Reserva cancelada",
  configuracion_actualizada: "Configuración actualizada",
  solicitud_aceptada: "Solicitud aprobada",
  solicitud_rechazada: "Solicitud rechazada",
  backup_descargado: "Respaldo descargado",
  backup_restaurado: "Respaldo restaurado",
  "2fa_configuracion_iniciada": "Configuración 2FA iniciada",
  "2fa_activada": "Verificación 2FA activada",
  "2fa_desactivada": "Verificación 2FA desactivada"
};

function formatearFechaAud(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function detalleLegible(detalle) {
  try {
    const obj = typeof detalle === "string" ? JSON.parse(detalle) : detalle;
    if (!obj || typeof obj !== "object" || !Object.keys(obj).length) return "—";
    return Object.entries(obj).map(([k, v]) => `${k}=${String(v)}`).join(", ");
  } catch {
    return "—";
  }
}

async function cargarAuditoriaPanel() {
  const tbody = document.getElementById("aud-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="cfg-aud-vacio">Cargando…</td></tr>`;
  const q = document.getElementById("aud-q");
  const desde = document.getElementById("aud-desde");
  const hasta = document.getElementById("aud-hasta");
  try {
    const res = await cargarAuditoria({
      q: q?.value.trim() || "",
      desde: desde?.value || "",
      hasta: hasta?.value || "",
      limite: 100
    });
    const lista = Array.isArray(res) ? res : res?.data || [];
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="cfg-aud-vacio">Sin registros para los criterios seleccionados.</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map((e) => `
      <tr>
        <td title="${esc(e.fecha || "")}">${formatearFechaAud(e.fecha)}</td>
        <td>${esc(e.usuarioId ?? "—")}</td>
        <td>${esc(e.rol ?? "—")}</td>
        <td>${esc(ACCIONES_LEGIBLE[e.accion] || e.accion)}</td>
        <td class="cfg-aud-detalle">${esc(detalleLegible(e.detalle))}</td>
        <td>${esc(e.ip || "—")}</td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" class="cfg-aud-vacio">No se pudo cargar la auditoría.</td></tr>`;
  }
}

/* ===== Respaldos ===== */

async function descargarBackup() {
  try {
    const blob = await exportarBackup();
    const a = document.createElement("a");
    const nombre = `labcontrol-backup-${new Date().toISOString().slice(0, 10)}.db`;
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast("Respaldo descargado", "success");
  } catch (err) {
    showToast(err?.message || "No se pudo descargar el respaldo", "error");
  }
}

async function restaurarBackupDesdeInput() {
  const input = document.getElementById("input-backup-archivo");
  const archivo = input?.files?.[0];
  if (!archivo) return;
  if (!confirm("Restaurar reemplazará TODA la base de datos actual y cerrará las demás sesiones activas. ¿Continuar?")) {
    input.value = "";
    return;
  }
  const estadoP = document.getElementById("p-backup-estado");
  try {
    if (estadoP) estadoP.textContent = "Restaurando respaldo…";
    await restaurarBackup(archivo);
    if (estadoP) estadoP.textContent = "Respaldo restaurado. Cerrando sesión para proteger tu cuenta…";
    showToast("Respaldo restaurado correctamente", "success");
    setTimeout(() => AUTH.logout(), 1500);
  } catch (err) {
    if (estadoP) estadoP.textContent = "";
    showToast(err?.message || "No se pudo restaurar el respaldo", "error");
  } finally {
    input.value = "";
  }
}