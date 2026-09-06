/* Imports (ES modules) */
import { AUTH, ESTADOS_EQUIPO, cargarEquipos, cargarLaboratorios } from "./data.js";
import { getQueryParam, renderSidebar, showToast } from "./app.js";


  renderSidebar("equipos.html");

  const puedeTecnico = AUTH.puedeVerTecnico();
  const labFiltroInicial = getQueryParam("lab");

  let equiposCache = [];
  let labsCache = [];
  let eqSeleccionado = null;

  function e_esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  if (!puedeTecnico) {
    document.getElementById("aviso-sin-permiso").style.display = "flex";
    document.getElementById("seccion-remoto").style.display = "none";
    document.getElementById("th-tecnico").textContent = "Hardware";
    document.getElementById("th-red").textContent = "Red";
  }

  Promise.all([cargarLaboratorios(), cargarEquipos()]).then(([labs, equipos]) => {
    labsCache = labs;
    equiposCache = equipos;

    const sel = document.getElementById("filtro-lab");
    sel.innerHTML =
      '<option value="">Todos los laboratorios</option>' +
      labs.map((l) => `<option value="${e_esc(l.id)}">${e_esc(l.nombre)}</option>`).join("");
    if (labFiltroInicial) sel.value = labFiltroInicial;

    renderEqStats();
    renderTabla();
  }).catch(() => showToast("No se pudieron cargar los equipos.", "error"));

  ["filtro-lab", "filtro-busq-eq"].forEach((id) =>
    document.getElementById(id).addEventListener("input", () => { renderEqStats(); renderTabla(); })
  );

  function equiposFiltrados() {
    const labId = document.getElementById("filtro-lab").value;
    const q = document.getElementById("filtro-busq-eq").value.toLowerCase();
    return equiposCache.filter((e) => {
      const lab = labsCache.find((l) => l.id === e.labId);
      return (!labId || String(e.labId) === labId) &&
        (!q || `${e.nombre} ${e.tipo} ${lab ? lab.nombre : ""}`.toLowerCase().includes(q));
    });
  }

  function renderEqStats() {
    const lista = equiposFiltrados();
    const activos = lista.filter((e) => e.estado === "activo").length;
    const enFalla = lista.filter((e) => e.estado === "falla").length;
    const enMant  = lista.filter((e) => e.estado === "mantencion").length;
    document.getElementById("eq-stats").innerHTML = `
      <div class="card stat-card"><div><div class="stat-card__label">Equipos mostrados</div><div class="stat-card__value">${lista.length}</div></div><div class="stat-card__icon stat-card__icon--primary"><i data-lucide="monitor"></i></div></div>
      <div class="card stat-card"><div><div class="stat-card__label">Activos</div><div class="stat-card__value">${activos}</div></div><div class="stat-card__icon stat-card__icon--success"><i data-lucide="circle-check"></i></div></div>
      <div class="card stat-card"><div><div class="stat-card__label">En falla</div><div class="stat-card__value">${enFalla}</div></div><div class="stat-card__icon stat-card__icon--danger"><i data-lucide="triangle-alert"></i></div></div>
      <div class="card stat-card"><div><div class="stat-card__label">Mantención</div><div class="stat-card__value">${enMant}</div></div><div class="stat-card__icon stat-card__icon--warning"><i data-lucide="wrench"></i></div></div>
    `;
  }

  function renderTabla() {
    const tbody = document.getElementById("tabla-equipos");
    const lista = equiposFiltrados();

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:24px">Sin equipos que mostrar.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map((e) => {
      const lab = labsCache.find((l) => l.id === e.labId);
      const estEq = ESTADOS_EQUIPO[e.estado] ?? { label: e.estado, clase: "badge--muted" };
      const tecnico = puedeTecnico
        ? `<span class="tech-cell">${e_esc(e.procesador)}<br>${e_esc(e.ram)} · ${e_esc(e.almacenamiento)}</span>`
        : `<span class="locked-cell"><i data-lucide="lock"></i> Restringido</span>`;
      const red = puedeTecnico
        ? `<span class="tech-cell">${e_esc(e.ip)}<br>${e_esc(e.mac)}</span>`
        : `<span class="locked-cell"><i data-lucide="lock"></i> Restringido</span>`;
      return `
        <tr>
          <td><strong>${e_esc(e.nombre)}</strong><br><span style="font-size:.74rem;color:var(--color-text-muted)">${lab ? e_esc(lab.nombre) : "—"}</span></td>
          <td>${e_esc(e.tipo ?? "PC")}</td>
          <td><span class="badge ${estEq.clase}">${e_esc(estEq.label)}</span></td>
          <td>${tecnico}</td>
          <td>${red}</td>
          <td>${puedeTecnico
            ? `<button class="btn btn--sm" data-control="${e_esc(e.nombre)}">Control</button>`
            : "—"}</td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-control]").forEach((btn) => {
      btn.addEventListener("click", () => abrirControl(btn.dataset.control));
    });
  }

  /* ---------- Control remoto simulado ---------- */

  function abrirControl(eqNombre) {
    const eq = equiposCache.find((e) => e.nombre === eqNombre);
    if (!eq) return;
    eqSeleccionado = eq;

    const lab = labsCache.find((l) => l.id === eq.labId);
    const estEq = ESTADOS_EQUIPO[eq.estado] ?? { label: eq.estado, clase: "badge--muted" };

    document.getElementById("seccion-remoto").style.display = "block";
    document.getElementById("panel-remoto-vacio").style.display = "none";
    document.getElementById("panel-remoto").style.display = "block";
    document.getElementById("rem-nombre").textContent = eq.nombre;
    document.getElementById("rem-detalle").textContent =
      `${lab ? lab.nombre : "Lab"} · ${eq.so} · ${eq.ip}`;
    document.getElementById("rem-badge").textContent = estEq.label;
    document.getElementById("rem-badge").className = "badge " + estEq.clase;

    logRemoto(`Sesión de control iniciada sobre ${eq.nombre}.`);
    document.getElementById("panel-remoto").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function logRemoto(msg) {
    const log = document.getElementById("remote-log");
    const hora = new Date().toLocaleTimeString("es-CL", { hour12: false });
    const line = document.createElement("div");
    line.textContent = `[${hora}]${msg}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  const MENSAJES_CMD = {
    encender:     (eq) => `Comando ENCIENDER enviado a ${eq.nombre}… respuesta OK.`,
    apagar:       (eq) => `Comando APAGAR enviado a ${eq.nombre}… apagado correcto.`,
    reiniciar:    (eq) => `Comando REINICIAR enviado a ${eq.nombre}… reinicio en curso.`,
    bloquear:     (eq) => `Comando BLOQUEAR enviado a ${eq.nombre}… pantalla bloqueada.`,
    captura:      (eq) => `Captura de pantalla de ${eq.nombre} obtenida (simulada).`,
    apagar_todos: (eq) => `Apagando TODOS los equipos del laboratorio de ${eq.nombre}…`
  };

  if (puedeTecnico) {
    document.querySelectorAll("[data-cmd]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!eqSeleccionado) return;
        const cmd = btn.dataset.cmd;
        logRemoto(MENSAJES_CMD[cmd](eqSeleccionado));
        showToast(`Comando ejecutado: ${cmd.replaceAll("_", " ")}`);
      });
    });

    // Abrir panel automáticamente si viene ?lab=N&equipo=ID (futuro)
    if (getQueryParam("lab")) {
      document.getElementById("seccion-remoto").style.display = "block";
    }
  }
