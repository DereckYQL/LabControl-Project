/* Imports (ES modules) */
import { AUTH, ESTADOS, actualizarEstadoLaboratorio, cargarAgenda, cargarLaboratorios, cargarUsuarios } from "./data.js";
import { abrirModal, cerrarModal, esc, formatFecha, getQueryParam, initTabs, renderLabGrid, renderSidebar, showToast } from "./app.js";


  renderSidebar("laboratorios.html");
  initTabs();
  const idSeleccionado = getQueryParam("id");
  let labsCache = [];
  let usuariosCache = [];

  Promise.all([cargarLaboratorios(), cargarUsuarios()]).then(([labs, usuarios]) => {
    labsCache = labs;
    usuariosCache = usuarios;
    if (idSeleccionado) {
      mostrarDetalle(Number(idSeleccionado));
    } else {
      document.getElementById("vista-listado").style.display = "block";
      renderLabGrid(labs, "lab-grid", { linkTo: "laboratorios.html" });
    }
  }).catch(() => showToast("No se pudieron cargar los datos.", "error"));

  // Filtros
  ["filtro-busqueda", "filtro-estado"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", filtrarLabs);
  });

  function filtrarLabs() {
    const q      = document.getElementById("filtro-busqueda").value.toLowerCase();
    const estado = document.getElementById("filtro-estado").value;
    const filtrados = labsCache.filter((l) =>
      (!q || l.nombre.toLowerCase().includes(q) || l.sala.toLowerCase().includes(q)) &&
      (!estado || l.estado === estado)
    );
    renderLabGrid(filtrados, "lab-grid", { linkTo: "laboratorios.html" });
  }

  function mostrarDetalle(id) {
    const lab = labsCache.find((l) => l.id === id);
    if (!lab) return;

    document.getElementById("vista-listado").style.display = "none";
    document.getElementById("vista-detalle").style.display = "block";
    document.title = `${lab.nombre} · LabControl`;

    const estado = ESTADOS[lab.estado];
    document.getElementById("detalle-nombre").textContent      = lab.nombre;
    document.getElementById("detalle-sala").textContent        = lab.sala;
    document.getElementById("detalle-ubicacion").textContent   = lab.ubicacion;

    ["detalle-badge", "detalle-badge-header"].forEach((elId) => {
      const b = document.getElementById(elId);
      b.textContent = estado.label;
      b.className   = `badge badge--${lab.estado}`;
    });

    // Info general
    document.getElementById("detalle-info-general").innerHTML = `
      <div><dt>Sala</dt><dd>${esc(lab.sala)}</dd></div>
      <div><dt>Ubicación</dt><dd>${esc(lab.ubicacion)}</dd></div>
      <div><dt>Capacidad</dt><dd>${esc(lab.equipos)} equipos</dd></div>
      <div><dt>Responsable</dt><dd>${esc(lab.responsable)}</dd></div>
      <div><dt>Horario disponible</dt><dd>${esc(lab.horario)}</dd></div>
      <div style="grid-column:1/-1"><dt>Descripción</dt><dd style="font-weight:400">${esc(lab.descripcion)}</dd></div>
    `;

    // Hardware — solo si tiene permisos técnicos
    const hardwareEl   = document.getElementById("detalle-info-hardware");
    const lockEl       = document.getElementById("bloque-tecnico-lock");
    if (AUTH.puedeVerTecnico()) {
      lockEl.style.display = "none";
      hardwareEl.innerHTML = `
        <div><dt>Sistema operativo</dt><dd>${esc(lab.so)}</dd></div>
        <div><dt>Procesador</dt><dd>${esc(lab.procesador)}</dd></div>
        <div><dt>Memoria RAM</dt><dd>${esc(lab.ram)}</dd></div>
        <div><dt>Almacenamiento</dt><dd>${esc(lab.almacenamiento)}</dd></div>
        <div><dt>Red / Conectividad</dt><dd>${esc(lab.red)}</dd></div>
        <div><dt>Estado de red</dt><dd>Operativa</dd></div>
      `;
    } else {
      hardwareEl.innerHTML = "";
      lockEl.style.display = "flex";
    }

    // Servicios
    document.getElementById("detalle-servicios").innerHTML =
      lab.servicios.map((s) => `<li><i data-lucide="check"></i>${esc(s)}</li>`).join("");

    // Agenda del laboratorio
    cargarAgenda().then((agenda) => {
      const reservas = agenda.filter((r) => r.labId === lab.id);
      const tbody = document.getElementById("detalle-agenda");
      if (!reservas.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:20px">Sin reservas para este laboratorio</td></tr>`;
        return;
      }
      tbody.innerHTML = reservas.map((r) => {
        const usr = usuariosCache.find((u) => u.id === r.usuarioId);
        return `<tr>
          <td>${formatFecha(r.fecha)}</td>
          <td>${esc(r.horaInicio)} – ${esc(r.horaFin)}</td>
          <td>${esc(r.motivo)}</td>
          <td>${usr ? `${esc(usr.nombre)} ${esc(usr.apellido)}` : esc(r.usuarioId)}</td>
          <td><span class="badge ${r.estado === "confirmada" ? "badge--disponible" : "badge--mantencion"}">${esc(r.estado)}</span></td>
        </tr>`;
      }).join("");
    }).catch(() => {});

    // Enlace de equipos
    document.getElementById("btn-ver-equipos").href = `equipos.html?lab=${lab.id}`;
  }

  // Modal estado
  document.getElementById("btn-cambiar-estado")?.addEventListener("click", () => {
    const lab = labsCache.find((l) => l.id === Number(idSeleccionado));
    if (lab) document.getElementById("select-estado").value = lab.estado;
    abrirModal("modal-estado");
  });
  document.getElementById("btn-cerrar-modal").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-estado"))
  );
  document.getElementById("btn-modal-cancelar").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-estado"))
  );
  document.getElementById("btn-modal-guardar").addEventListener("click", () => {
    const nuevoEstado = document.getElementById("select-estado").value;
    actualizarEstadoLaboratorio(Number(idSeleccionado), nuevoEstado)
      .then((labActualizado) => {
        const idx = labsCache.findIndex((l) => l.id === labActualizado.id);
        if (idx !== -1) labsCache[idx] = labActualizado;
        mostrarDetalle(labActualizado.id);
        showToast(`Estado actualizado a "${ESTADOS[nuevoEstado].label}".`);
      })
      .catch(() => showToast("No se pudo actualizar el estado.", "error"));
    cerrarModal(document.getElementById("modal-estado"));
  });

  document.getElementById("modal-estado").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-estado"))
      cerrarModal(document.getElementById("modal-estado"));
  });
