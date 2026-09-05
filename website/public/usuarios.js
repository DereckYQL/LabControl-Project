
  renderSidebar("usuarios.html");
  initTabs();

  const esAdmin = AUTH.esAdmin();
  const miRol   = AUTH.getSesion()?.rol ?? "otro_area";
  if (!esAdmin) {
    document.getElementById("btn-nuevo-usuario").style.display = "none";
  }

  // Restricciones de visibilidad entre roles:
  // - "otro_area": no ve Permisos ni Actividad de profes de Programación ni del Admin.
  // - "programacion": no ve Actividad del Admin.
  // - El admin ve todo.
  function puedeVerSeccion(rolUsuario, seccion) {
    if (miRol === "admin") return true;
    if (miRol === "programacion")
      return rolUsuario === "admin" ? seccion !== "actividad" : true;
    return !(rolUsuario === "admin" || rolUsuario === "programacion");
  }

  let usuariosCache = [];
  let detalleActualId = null;

  cargarUsuarios().then((usuarios) => {
    usuariosCache = usuarios;
    renderStats(usuarios);
    renderGrid(usuarios);
  }).catch(() => showToast("No se pudieron cargar los usuarios.", "error"));

  function volverAlListado() {
    document.getElementById("vista-usr-detalle").style.display = "none";
    document.getElementById("usr-grid").style.display          = "grid";
    document.getElementById("usr-stats").style.display         = "grid";
    document.querySelector(".page-header").style.display       = "flex";
    detalleActualId = null;
  }

  ["filtro-rol","filtro-busq-usr"].forEach((id) =>
    document.getElementById(id).addEventListener("input", filtrar)
  );

  function filtrar() {
    const rol = document.getElementById("filtro-rol").value;
    const q   = document.getElementById("filtro-busq-usr").value.toLowerCase();
    const f   = usuariosCache.filter((u) =>
      (!rol || u.rol === rol) &&
      (!q   || `${u.nombre} ${u.apellido} ${u.area}`.toLowerCase().includes(q))
    );
    renderGrid(f);
  }

  function renderStats(usuarios) {
    const admins = usuarios.filter((u) => u.rol === "admin").length;
    const prog   = usuarios.filter((u) => u.rol === "programacion").length;
    const otros  = usuarios.filter((u) => u.rol === "otro_area").length;
    document.getElementById("usr-stats").innerHTML = `
      <div class="card stat-card">
        <div><div class="stat-card__label">Total</div><div class="stat-card__value">${usuarios.length}</div></div>
        <div class="stat-card__icon stat-card__icon--primary"><i data-lucide="users"></i></div>
      </div>
      <div class="card stat-card">
        <div><div class="stat-card__label">Administradores</div><div class="stat-card__value">${admins}</div></div>
        <div class="stat-card__icon stat-card__icon--danger"><i data-lucide="key-round"></i></div>
      </div>
      <div class="card stat-card">
        <div><div class="stat-card__label">Programación</div><div class="stat-card__value">${prog}</div></div>
        <div class="stat-card__icon stat-card__icon--primary"><i data-lucide="monitor"></i></div>
      </div>
      <div class="card stat-card">
        <div><div class="stat-card__label">Otras áreas</div><div class="stat-card__value">${otros}</div></div>
        <div class="stat-card__icon stat-card__icon--success"><i data-lucide="book-open"></i></div>
      </div>
    `;
  }

  const ROL_COLOR  = { admin:"danger", programacion:"primary", otro_area:"success" };
  const ROL_ICON   = { admin:"key-round", programacion:"monitor", otro_area:"book-open" };

  function renderGrid(usuarios) {
    const grid = document.getElementById("usr-grid");
    if (!usuarios.length) {
      grid.innerHTML = `<p style="color:var(--color-text-muted)">Sin usuarios que mostrar.</p>`;
      return;
    }
    grid.innerHTML = usuarios.map((u) => {
      const color = ROL_COLOR[u.rol] ?? "primary";
      return `
        <div class="card usr-card" role="button" tabindex="0" data-id="${esc(u.id)}">
          <div class="usr-card__avatar" style="background:var(--color-${color === "danger" ? "danger-bg" : color === "success" ? "success-bg" : "primary-light"});color:var(--color-${color === "danger" ? "danger" : color === "success" ? "success" : "primary"})">
            ${esc(u.iniciales)}
          </div>
          <div class="usr-card__body">
            <div class="usr-card__nombre">${esc(u.nombre)} ${esc(u.apellido)}</div>
            <div class="usr-card__area">${esc(u.area)}</div>
            <div class="usr-card__especialidad">${esc(u.especialidad)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              <span class="badge badge--${color === "danger" ? "ocupado" : color === "success" ? "disponible" : ""}">
                <i data-lucide="${ROL_ICON[u.rol]}"></i> ${esc(rolLabel(u.rol))}
              </span>
              <span class="badge badge--muted">${esc(nivelLabel(u.nivelAcceso))}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    grid.querySelectorAll(".usr-card").forEach((card) => {
      card.addEventListener("click", () => abrirDetalle(card.dataset.id));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") abrirDetalle(card.dataset.id); });
    });
  }

  function abrirDetalle(id) {
    const u = usuariosCache.find((x) => x.id === id);
    if (!u) return;
    detalleActualId = id;

    document.getElementById("usr-grid").style.display        = "none";
    document.getElementById("usr-stats").style.display       = "none";
    document.querySelector(".page-header").style.display     = "none";
    document.querySelector(".stat-grid")?.style &&
      (document.querySelector("#usr-stats").style.display = "none");
    document.getElementById("vista-usr-detalle").style.display = "block";

    const color = ROL_COLOR[u.rol] ?? "primary";
    const avatarEl = document.getElementById("det-avatar");
    avatarEl.textContent    = u.iniciales;
    avatarEl.style.background = `var(--color-${color === "danger" ? "danger-bg" : color === "success" ? "success-bg" : "primary-light"})`;
    avatarEl.style.color      = `var(--color-${color === "danger" ? "danger" : color === "success" ? "success" : "primary"})`;

    document.getElementById("det-nombre").textContent = `${u.nombre} ${u.apellido}`;
    document.getElementById("det-email").textContent  = u.email;

    const rolBadge  = document.getElementById("det-rol-badge");
    rolBadge.innerHTML = `<i data-lucide="${ROL_ICON[u.rol]}"></i> ${rolLabel(u.rol)}`;
    rolBadge.className   = `badge badge--${color === "danger" ? "ocupado" : color === "success" ? "disponible" : ""}`;

    document.getElementById("det-nivel-badge").textContent = nivelLabel(u.nivelAcceso);

    // Acciones admin
    const accionesEl = document.getElementById("det-acciones-admin");
    accionesEl.style.display = esAdmin ? "flex" : "none";

    // Ocultar pestañas restringidas según el rol del usuario en sesión
    const btnPermisos  = document.querySelector('.tab-btn[data-tab="det-permisos"]');
    const btnActividad = document.querySelector('.tab-btn[data-tab="det-actividad"]');
    const verPermisos  = puedeVerSeccion(u.rol, "permisos");
    const verActividad = puedeVerSeccion(u.rol, "actividad");
    btnPermisos.style.display  = verPermisos  ? "" : "none";
    btnActividad.style.display = verActividad ? "" : "none";
    if ((!verPermisos && btnPermisos.classList.contains("is-active")) ||
        (!verActividad && btnActividad.classList.contains("is-active"))) {
      __activarTab(document.querySelector('.tab-btn[data-tab="det-info"]'), false);
    }

    // Info
    document.getElementById("det-info-grid").innerHTML = `
      <div><dt>Nombre completo</dt><dd>${esc(u.nombre)} ${esc(u.apellido)}</dd></div>
      <div><dt>ID usuario</dt><dd>${esc(u.id)}</dd></div>
      <div><dt>Correo</dt><dd>${esc(u.email)}</dd></div>
      <div><dt>Área</dt><dd>${esc(u.area)}</dd></div>
      <div><dt>Especialidad</dt><dd>${esc(u.especialidad)}</dd></div>
      <div><dt>Rol</dt><dd>${esc(rolLabel(u.rol))}</dd></div>
      <div><dt>Nivel de acceso</dt><dd>${esc(nivelLabel(u.nivelAcceso))}</dd></div>
      <div><dt>Estado</dt><dd>${u.activo ? "Activo" : "Inactivo"}</dd></div>
    `;

    // Permisos
    const perms = getPermisosPorRol(u.rol, u.nivelAcceso);
    document.getElementById("det-permisos-list").innerHTML = `
      <div class="permisos-grid">
        ${perms.map((p) => `
          <div class="permiso-item">
            <span class="permiso-item__icon"><i data-lucide="${p.ok ? "circle-check" : "lock"}"></i></span>
            <div>
              <div class="permiso-item__nombre">${p.nombre}</div>
              <div class="permiso-item__desc">${p.desc}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    // Actividad reciente (mock)
    document.getElementById("det-actividad-list").innerHTML = `
      <div class="actividad-lista">
        ${mockActividad(u).map((a) => `
          <div class="actividad-item">
            <span class="actividad-item__icono"><i data-lucide="${a.icono}"></i></span>
            <div>
              <div class="actividad-item__texto">${a.texto}</div>
              <div class="actividad-item__fecha">${a.fecha}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function getPermisosPorRol(rol, nivel) {
    const esProg  = rol === "programacion" || rol === "admin";
    const esAdm   = rol === "admin";
    return [
      { nombre:"Ver laboratorios",              desc:"Estado y disponibilidad básica",                ok: true },
      { nombre:"Ver mapa 2D",                   desc:"Plano del establecimiento",                     ok: true },
      { nombre:"Cambiar estado del laboratorio",desc:"Marcar disponible / ocupado / mantención",      ok: true },
      { nombre:"Agendar reserva",               desc:"Solicitar uso de un laboratorio",               ok: true },
      { nombre:"Ver info técnica de hardware",  desc:"CPU, RAM, almacenamiento, red, IP, MAC",        ok: esProg },
      { nombre:"Control remoto de equipos",     desc:"Encender, apagar, reiniciar, bloquear equipos", ok: esProg },
      { nombre:"Ver reportes",                  desc:"Acceso a reportes de uso y fallas",             ok: esProg },
      { nombre:"Generar reportes",              desc:"Crear nuevos reportes del sistema",             ok: esProg },
      { nombre:"Gestionar usuarios",            desc:"Crear, editar y desactivar usuarios",           ok: esAdm },
      { nombre:"Configuración del sistema",     desc:"Ajustes avanzados de red, seguridad y sitio",   ok: esAdm },
    ];
  }

  function mockActividad(u) {
    const base = [
      { icono:"log-in",        texto:"Inicio de sesión exitoso",               fecha:"22/08/2026 08:12" },
      { icono:"clock",         texto:"Consultó disponibilidad del Lab 2",       fecha:"21/08/2026 14:35" },
      { icono:"calendar-days", texto:"Agendó reserva en Laboratorio 1",         fecha:"20/08/2026 10:00" },
    ];
    if (u.rol === "programacion" || u.rol === "admin") {
      base.push({ icono:"monitor",     texto:"Ejecutó control remoto — PC-101",   fecha:"19/08/2026 09:45" });
      base.push({ icono:"bar-chart-3", texto:"Generó reporte de disponibilidad",   fecha:"18/08/2026 16:20" });
    }
    return base;
  }

  document.getElementById("btn-volver-usr").addEventListener("click", volverAlListado);

  // Modal nuevo / editar usuario
  let usuarioEditandoId = null;

  function resetearModalUsuario(opciones = {}) {
    const editar = !!opciones.editar;
    ["usr-nombre", "usr-apellido", "usr-email", "usr-id", "usr-pass", "usr-area", "usr-especialidad"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const inputId  = document.getElementById("usr-id");
    const inputPass = document.getElementById("usr-pass");
    inputId.disabled = editar;
    inputId.readOnly  = editar;
    inputPass.required = !editar;
    inputPass.placeholder = editar ? "Dejar en blanco para no cambiar" : "Mínimo 6 caracteres";
    document.getElementById("usr-rol").value = editar ? "" : "programacion";
    document.getElementById("usr-nivel").value = editar ? "" : "basico";
    usuarioEditandoId = null;
  }

  document.getElementById("btn-nuevo-usuario").addEventListener("click", () => {
    resetearModalUsuario();
    document.getElementById("modal-usr-titulo").textContent = "Nuevo usuario";
    abrirModal("modal-usuario");
  });

  function abrirEdicionUsuario(u) {
    resetearModalUsuario({ editar: true });
    usuarioEditandoId = u.id;
    document.getElementById("modal-usr-titulo").textContent = "Editar usuario";
    document.getElementById("usr-nombre").value = u.nombre || "";
    document.getElementById("usr-apellido").value = u.apellido || "";
    document.getElementById("usr-email").value = u.email || "";
    document.getElementById("usr-id").value = u.id;
    document.getElementById("usr-pass").value = "";
    document.getElementById("usr-area").value = u.area || "";
    document.getElementById("usr-especialidad").value = u.especialidad || "";
    document.getElementById("usr-rol").value = u.rol;
    document.getElementById("usr-nivel").value = u.nivelAcceso;
    abrirModal("modal-usuario");
  }

  document.getElementById("btn-editar-usr").addEventListener("click", () => {
    const u = usuariosCache.find((x) => x.id === detalleActualId);
    if (!u) { showToast("No se encontró el usuario.", "error"); return; }
    abrirEdicionUsuario(u);
  });

  document.getElementById("btn-desactivar-usr").addEventListener("click", () => {
    const u = usuariosCache.find((x) => x.id === detalleActualId);
    if (!u) return;
    if (u.id === AUTH.getSesion()?.id) {
      showToast("No puedes desactivar tu propio usuario.", "error");
      return;
    }
    const texto = u.activo
      ? { futuro: "Desactivar", pasado: "desactivado" }
      : { futuro: "Reactivar", pasado: "reactivado" };
    if (!window.confirm(`${texto.futuro} al usuario ${u.nombre} ${u.apellido}? Ya no podrá iniciar sesión.`)) return;
    actualizarUsuario(u.id, { activo: !u.activo })
      .then(() => cargarUsuarios())
      .then((usuarios) => {
        usuariosCache = usuarios;
        renderStats(usuarios);
        renderGrid(usuarios);
        volverAlListado();
        showToast(`Usuario ${u.nombre} ${u.apellido} ${texto.pasado} correctamente.`);
      })
      .catch((err) => showToast(err.message || "No se pudo actualizar el usuario.", "error"));
  });

  document.getElementById("btn-cerrar-usr-modal").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-usuario"))
  );
  document.getElementById("btn-cancelar-usr-modal").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-usuario"))
  );
  document.getElementById("btn-guardar-usr").addEventListener("click", () => {
    const nombre = document.getElementById("usr-nombre").value.trim();
    const apellido = document.getElementById("usr-apellido").value.trim();
    const email  = document.getElementById("usr-email").value.trim();
    const id     = document.getElementById("usr-id").value.trim();
    const pass   = document.getElementById("usr-pass").value;
    const area   = document.getElementById("usr-area").value.trim();
    const espec  = document.getElementById("usr-especialidad").value.trim();
    const rol    = document.getElementById("usr-rol").value;
    const nivel  = document.getElementById("usr-nivel").value;

    if (usuarioEditandoId) {
      const cambios = {};
      if (nombre) cambios.nombre = nombre;
      if (apellido) cambios.apellido = apellido;
      if (email) cambios.email = email;
      if (pass) {
        if (pass.length < 6) { showToast("La contraseña debe tener al menos 6 caracteres.", "error"); return; }
        cambios.password = pass;
      }
      cambios.area = area;
      cambios.especialidad = espec;
      cambios.rol = rol;
      cambios.nivelAcceso = nivel;

      actualizarUsuario(usuarioEditandoId, cambios)
        .then(() => cargarUsuarios())
        .then((usuarios) => {
          usuariosCache = usuarios;
          renderStats(usuarios);
          renderGrid(usuarios);
          cerrarModal(document.getElementById("modal-usuario"));
          abrirDetalle(usuarioEditandoId);
          showToast("Usuario actualizado correctamente.");
        })
        .catch((err) => showToast(err.message || "No se pudo actualizar el usuario.", "error"));
      return;
    }

    if (!nombre || !apellido || !email || !id || !pass) {
      showToast("Completa todos los campos obligatorios.", "error");
      return;
    }
    const nuevo = {
      id, nombre, apellido,
      iniciales: `${nombre[0]}${apellido[0]}`.toUpperCase(),
      email, password: pass, rol, area,
      especialidad: espec, nivelAcceso: nivel
    };
    crearUsuario(nuevo)
      .then(() => cargarUsuarios())
      .then((usuarios) => {
        usuariosCache = usuarios;
        renderStats(usuarios);
        renderGrid(usuarios);
        showToast(`Usuario ${nombre} ${apellido} creado correctamente.`);
        cerrarModal(document.getElementById("modal-usuario"));
      })
      .catch((err) => showToast(err.message || "No se pudo crear el usuario.", "error"));
  });

  document.getElementById("modal-usuario").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-usuario"))
      cerrarModal(document.getElementById("modal-usuario"));
  });
