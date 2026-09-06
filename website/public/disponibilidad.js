/* Imports (ES modules) */
import { AUTH, ESTADOS, actualizarEstadoLaboratorio, cargarAgenda, cargarLaboratorios, cargarUsuarios, crearReserva, eliminarReserva } from "./data.js";
import { abrirModal, cerrarModal, esc, formatFecha, renderSidebar, showToast } from "./app.js";


  renderSidebar("disponibilidad.html");
  const sesion = AUTH.getSesion();
  let labSeleccionado = null;
  let labsCache = [];
  let usuariosCache = [];

  function renderDispStats(labs) {
    const el = document.getElementById("disp-stats");
    const disponibles = labs.filter((l) => l.estado === "disponible").length;
    const ocupados    = labs.filter((l) => l.estado === "ocupado").length;
    const mantencion  = labs.filter((l) => l.estado === "mantencion").length;
    el.innerHTML = `
      <div class="card stat-card">
        <div><div class="stat-card__label">Disponibles</div><div class="stat-card__value">${disponibles}</div></div>
        <div class="stat-card__icon stat-card__icon--success"><i data-lucide="circle-check"></i></div>
      </div>
      <div class="card stat-card">
        <div><div class="stat-card__label">Ocupados</div><div class="stat-card__value">${ocupados}</div></div>
        <div class="stat-card__icon stat-card__icon--danger"><i data-lucide="ban"></i></div>
      </div>
      <div class="card stat-card">
        <div><div class="stat-card__label">Mantención</div><div class="stat-card__value">${mantencion}</div></div>
        <div class="stat-card__icon stat-card__icon--warning"><i data-lucide="wrench"></i></div>
      </div>
      <div class="card stat-card">
        <div><div class="stat-card__label">Total</div><div class="stat-card__value">${labs.length}</div></div>
        <div class="stat-card__icon stat-card__icon--primary"><i data-lucide="school"></i></div>
      </div>
    `;
  }

  function renderTablaDisp(labs) {
    const tbody = document.getElementById("tabla-disponibilidad");
    tbody.innerHTML = labs.map((lab) => {
      const est = ESTADOS[lab.estado];
      return `
        <tr>
          <td><strong>${esc(lab.nombre)}</strong></td>
          <td>${esc(lab.sala)}</td>
          <td>${esc(lab.equipos)}</td>
          <td><span class="badge badge--${lab.estado}">${esc(est.label)}</span></td>
          <td>${esc(lab.horario)}</td>
          <td>${esc(lab.responsable)}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn--sm" data-estado="${esc(lab.id)}">Cambiar estado</button>
            <a class="btn btn--sm" href="laboratorios.html?id=${esc(lab.id)}">Ver detalles</a>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-estado]").forEach((btn) => {
      btn.addEventListener("click", () => abrirModalEstado(Number(btn.dataset.estado)));
    });
  }

  function renderTablaAgenda(agenda, labs) {
    const tbody = document.getElementById("tabla-agenda");
    if (!agenda.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:24px">Sin reservas registradas</td></tr>`;
      return;
    }
    tbody.innerHTML = agenda.map((res) => {
      const lab = labs.find((l) => l.id === res.labId);
      const usr = usuariosCache.find((u) => u.id === res.usuarioId);
      const claseEstado = res.estado === "confirmada" ? "badge--disponible" : "badge--mantencion";
      return `
        <tr>
          <td>${esc(lab?.nombre ?? "—")}</td>
          <td>${formatFecha(res.fecha)}</td>
          <td>${esc(res.horaInicio)} – ${esc(res.horaFin)}</td>
          <td>${esc(res.motivo)}</td>
          <td>${usr ? `${esc(usr.nombre)} ${esc(usr.apellido)}` : esc(res.usuarioId)}</td>
          <td><span class="badge ${claseEstado}">${esc(res.estado)}</span></td>
          <td>${res.usuarioId === sesion?.id || AUTH.esAdmin()
            ? `<button class="btn btn--sm btn--danger" data-cancelar-id="${esc(res.id)}">Cancelar</button>`
            : "—"}</td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-cancelar-id]").forEach((btn) => {
      btn.addEventListener("click", () => cancelarReserva(btn.dataset.cancelarId));
    });
  }

  function abrirModalEstado(labId) {
    labSeleccionado = labId;
    const lab = labsCache.find((l) => l.id === labId);
    document.getElementById("modal-estado-lab").textContent = `Laboratorio: ${lab.nombre} (${lab.sala})`;
    document.getElementById("select-nuevo-estado").value = lab.estado;
    abrirModal("modal-estado");
  }

  function cancelarReserva(id) {
    eliminarReserva(id)
      .then(() => cargarAgenda())
      .then((ag) => {
        renderTablaAgenda(ag, labsCache);
        showToast("Reserva cancelada correctamente.");
      })
      .catch(() => showToast("No se pudo cancelar la reserva.", "error"));
  }

  // Modal estado
  document.getElementById("btn-cerrar-estado").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-estado"))
  );
  document.getElementById("btn-cancelar-estado").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-estado"))
  );
  document.getElementById("btn-guardar-estado").addEventListener("click", () => {
    const nuevoEstado = document.getElementById("select-nuevo-estado").value;
    actualizarEstadoLaboratorio(labSeleccionado, nuevoEstado)
      .then(() => cargarLaboratorios())
      .then((labs) => {
        labsCache = labs;
        renderDispStats(labs);
        renderTablaDisp(labs);
        showToast(`Estado actualizado a "${ESTADOS[nuevoEstado].label}".`);
      })
      .catch(() => showToast("No se pudo actualizar el estado.", "error"));
    cerrarModal(document.getElementById("modal-estado"));
  });

  // Modal reserva
  document.getElementById("btn-nueva-reserva").addEventListener("click", () => {
    const sel = document.getElementById("res-lab");
    sel.innerHTML = labsCache.map((l) => `<option value="${esc(l.id)}">${esc(l.nombre)} — ${esc(l.sala)}</option>`).join("");
    // Fecha mínima: hoy
    const hoy = new Date().toISOString().split("T")[0];
    document.getElementById("res-fecha").value = hoy;
    document.getElementById("res-fecha").min = hoy;
    abrirModal("modal-reserva");
  });
  document.getElementById("btn-cerrar-reserva").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-reserva"))
  );
  document.getElementById("btn-cancelar-reserva").addEventListener("click", () =>
    cerrarModal(document.getElementById("modal-reserva"))
  );
  document.getElementById("btn-guardar-reserva").addEventListener("click", () => {
    const labId   = Number(document.getElementById("res-lab").value);
    const fecha   = document.getElementById("res-fecha").value;
    const inicio  = document.getElementById("res-inicio").value;
    const fin     = document.getElementById("res-fin").value;
    const motivo  = document.getElementById("res-motivo").value.trim();
    if (!fecha || !motivo) { showToast("Completa todos los campos.", "error"); return; }
    const nuevaRes = {
      labId,
      fecha,
      horaInicio: inicio,
      horaFin: fin,
      motivo,
      estado: "pendiente"
    };
    crearReserva(nuevaRes)
      .then(() => cargarAgenda())
      .then((ag) => {
        renderTablaAgenda(ag, labsCache);
        showToast("Reserva agendada correctamente.");
      })
      .catch(() => showToast("No se pudo agendar la reserva.", "error"));
    cerrarModal(document.getElementById("modal-reserva"));
  });

  // Cerrar modal al hacer clic en overlay
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cerrarModal(overlay);
    });
  });

  // Carga inicial
  Promise.all([cargarLaboratorios(), cargarAgenda(), cargarUsuarios()]).then(([labs, agenda, usuarios]) => {
    labsCache = labs;
    usuariosCache = usuarios;
    renderDispStats(labs);
    renderTablaDisp(labs);
    renderTablaAgenda(agenda, labs);
  }).catch(() => showToast("No se pudieron cargar los datos de disponibilidad.", "error"));
