
  renderSidebar("reportes.html");

  const ICONOS_TIPO  = { uso: "bar-chart-3", fallas: "triangle-alert", disponibilidad: "clock", inventario: "package", otro: "file-text" };
  const COLORES_TIPO = { uso: "primary", fallas: "danger", disponibilidad: "success", inventario: "warning", otro: "neutral" };
  const LABELS_TIPO  = {
    uso: "Uso de laboratorios", disponibilidad: "Disponibilidad",
    fallas: "Registro de fallas", inventario: "Inventario de equipos", otro: "Otro"
  };

  let reportesCache = [];
  let usuariosCache = [];
  let repAbiertoId  = null;

  /* Estado del modal (crear / editar) */
  let modoModal = "crear";
  let editandoId = null;
  let archivosTemporales = [];

  Promise.all([cargarReportes(), cargarUsuarios()]).then(([reportes, usuarios]) => {
    reportesCache = reportes;
    usuariosCache = usuarios;
    renderRepGrid(reportes);

    const destino = getQueryParam("id");
    if (destino && reportes.some((r) => r.id === destino)) abrirReporte(destino);
  }).catch(() => showToast("No se pudieron cargar los reportes.", "error"));

  /* ======================================================
     LISTA RESUMIDA DE REPORTES
     ====================================================== */

  function renderRepGrid(reportes) {
    const grid = document.getElementById("rep-grid");
    if (!reportes.length) {
      grid.innerHTML = `<p style="color:var(--color-text-muted)">No hay reportes generados.</p>`;
      return;
    }
    grid.innerHTML = reportes.map((rep) => {
      const autor   = usuariosCache.find((u) => u.id === rep.generadoPor);
      const color   = COLORES_TIPO[rep.tipo] ?? "primary";
      const nAdj    = (rep.adjuntos ?? []).length;
      return `
        <div class="card rep-card" role="button" tabindex="0" data-id="${esc(rep.id)}">
          <div class="rep-card__icon stat-card__icon--${color}">
            <i data-lucide="${ICONOS_TIPO[rep.tipo] ?? "file-text"}"></i>
          </div>
          <div class="rep-card__body">
            <div class="rep-card__titulo" title="${esc(rep.titulo)}">${esc(rep.titulo)}</div>
            <div class="rep-card__meta">
              <span class="rep-chip rep-chip--${color}">${LABELS_TIPO[rep.tipo] ?? "Reporte"}</span>
              <span><i data-lucide="calendar-days"></i> ${formatFecha(rep.fecha)}</span>
              <span><i data-lucide="user"></i> ${autor ? `${esc(autor.nombre)} ${esc(autor.apellido)}` : esc(rep.generadoPor)}</span>
              ${nAdj ? `<span><i data-lucide="paperclip"></i> ${nAdj}</span>` : ""}
            </div>
          </div>
          <i class="rep-card__arrow" data-lucide="chevron-right"></i>
        </div>
      `;
    }).join("");

    grid.addEventListener("click", (e) => {
      const tar = e.target.closest(".rep-card");
      if (tar) abrirReporte(tar.dataset.id);
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const tar = e.target.closest(".rep-card");
      if (tar) abrirReporte(tar.dataset.id);
    });
  }

  /* ======================================================
     VISTA DETALLE (con más información)
     ====================================================== */

  function puedeModificar(rep) {
    const sesion = AUTH.getSesion();
    return !!sesion && (sesion.rol === "admin" || rep.generadoPor === sesion.id);
  }

  function abrirReporte(id) {
    const rep = reportesCache.find((r) => r.id === id);
    if (!rep) return;
    repAbiertoId = id;
    const autor = usuariosCache.find((u) => u.id === rep.generadoPor);

    document.getElementById("rep-grid").style.display       = "none";
    document.getElementById("vista-reporte").style.display  = "block";
    document.querySelector(".page-header").style.display    = "none";

    document.getElementById("rep-titulo").textContent = rep.titulo;
    document.getElementById("rep-descripcion").textContent = rep.descripcion || "";
    document.getElementById("rep-fecha").innerHTML =
      `<i data-lucide="calendar-days"></i> ${formatFecha(rep.fecha)}`;
    document.getElementById("rep-autor").innerHTML =
      `<i data-lucide="user"></i> ${autor ? `${esc(autor.nombre)} ${esc(autor.apellido)}` : esc(rep.generadoPor)}`;

    // Botones de acción: solo el creador o un administrador pueden editar/eliminar
    const acciones = document.getElementById("rep-acciones");
    const botones  = [`<button class="btn" data-acc="imprimir"><i data-lucide="printer"></i> Imprimir</button>`];
    if (puedeModificar(rep)) {
      botones.push(`<button class="btn" data-acc="editar"><i data-lucide="pencil"></i> Editar</button>`);
      botones.push(`<button class="btn btn--danger" data-acc="eliminar"><i data-lucide="trash-2"></i> Eliminar</button>`);
    }
    acciones.innerHTML = botones.join("");
    acciones.onclick = (e) => {
      const b = e.target.closest("[data-acc]");
      if (!b) return;
      if (b.dataset.acc === "imprimir") imprimirReporte();
      else if (b.dataset.acc === "editar") editarReporteActual();
      else if (b.dataset.acc === "eliminar") eliminarReporteActual();
    };

    renderAdjuntosDetalle(rep);

    const contenidoEl = document.getElementById("rep-contenido");
    contenidoEl.innerHTML = buildReporteHTML(rep);
    contenidoEl.style.display = contenidoEl.innerHTML.trim() ? "" : "none";

    if (rep.datos?.labels && rep.datos?.valores) {
      setTimeout(() => drawBarChart(rep.datos.labels, rep.datos.valores, "canvas-chart"), 50);
    }
  }

  function renderAdjuntosDetalle(rep) {
    const cont   = document.getElementById("rep-adjuntos");
    const adj    = rep.adjuntos ?? [];
    if (!adj.length) { cont.innerHTML = ""; return; }

    const imagenes = adj.filter((a) => (a.tipo ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(a.nombre));
    const otros    = adj.filter((a) => !imagenes.includes(a));

    cont.innerHTML = `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--color-border)">
        <div style="font-weight:700;font-size:.85rem;margin-bottom:10px">
          <i data-lucide="paperclip"></i> Archivos adjuntos (${adj.length})
        </div>
        ${imagenes.length ? `
          <div class="adj-grid">
            ${imagenes.map((a, i) => `
              <figure class="adj-thumb" title="${esc(a.nombre)}">
                <img src="${a.data}" alt="${esc(a.nombre)}" loading="lazy"
                  data-adj="${rep.adjuntos.indexOf(a)}" />
                <figcaption>${esc(a.nombre)}</figcaption>
              </figure>
            `).join("")}
          </div>` : ""}
        ${otros.length ? `
          <div class="adj-chips" style="margin-top:${imagenes.length ? 10 : 0}px">
            ${otros.map((a) => `
              <a class="adj-file" href="${a.data}" download="${esc(a.nombre)}" title="Descargar ${esc(a.nombre)}">
                <i data-lucide="file-text"></i>
                <span>${esc(a.nombre)}</span>
                <small>${formatoBytes(a.tamano)}</small>
                <i data-lucide="download"></i>
              </a>
            `).join("")}
          </div>` : ""}
      </div>
    `;
    cont.onclick = (e) => {
      const img = e.target.closest(".adj-thumb img");
      if (!img) return;
      verImagenLightbox(rep.id, Number(img.dataset.adj));
    };
  }

  function verImagenLightbox(reporteId, indice) {
    const rep = reportesCache.find((r) => r.id === reporteId);
    const adj = rep?.adjuntos?.[indice];
    if (!adj) return;
    document.getElementById("lightbox-img").src = adj.data;
    document.getElementById("lightbox-img").alt = adj.nombre;
    document.getElementById("lightbox").style.display = "flex";
  }

  /* ======================================================
     ACCIONES: EDITAR / ELIMINAR
     ====================================================== */

  async function recargarReportes() {
    try {
      reportesCache = await cargarReportes();
      renderRepGrid(reportesCache);
    } catch {
      showToast("No se pudieron recargar los reportes.", "error");
    }
  }

  function editarReporteActual() {
    const rep = reportesCache.find((r) => r.id === repAbiertoId);
    if (!rep) return;
    if (!puedeModificar(rep)) { showToast("Solo el administrador o el creador pueden editar este reporte.", "error"); return; }

    modoModal    = "editar";
    editandoId   = rep.id;
    archivosTemporales = [...(rep.adjuntos ?? [])];

    document.getElementById("modal-rep-titulo").textContent = "Editar reporte";
    document.getElementById("btn-generar-rep").textContent  = "Guardar cambios";
    document.getElementById("nuevo-rep-tipo").value         = rep.tipo ?? "uso";
    document.getElementById("nuevo-rep-titulo").value       = rep.titulo ?? "";
    document.getElementById("nuevo-rep-descripcion").value  = rep.descripcion ?? "";
    actualizarHintOtro();
    renderArchivosTemporales();
    abrirModal("modal-reporte");
  }

  async function eliminarReporteActual() {
    const rep    = reportesCache.find((r) => r.id === repAbiertoId);
    const sesion = AUTH.getSesion();
    if (!rep || !sesion) return;
    if (!puedeModificar(rep)) { showToast("Solo el administrador o el creador pueden eliminar este reporte.", "error"); return; }
    if (!confirm(`¿Eliminar el reporte "${rep.titulo}"? Esta acción no se puede deshacer.`)) return;

    try {
      await eliminarReporte(rep.id);
      repAbiertoId = null;
      document.getElementById("vista-reporte").style.display = "none";
      document.getElementById("rep-grid").style.display      = "grid";
      document.querySelector(".page-header").style.display   = "flex";
      await recargarReportes();
      refrescarNotificaciones();
      showToast("Reporte eliminado.");
    } catch (err) {
      showToast(err.message || "No se pudo eliminar el reporte.", "error");
    }
  }

  /* ======================================================
     NAVEGACIÓN VISTA LISTA ↔ DETALLE
     ====================================================== */

  document.getElementById("btn-volver-rep").addEventListener("click", () => {
    repAbiertoId = null;
    document.getElementById("vista-reporte").style.display = "none";
    document.getElementById("rep-grid").style.display      = "grid";
    document.querySelector(".page-header").style.display   = "flex";
  });

  /* ======================================================
     MODAL NUEVO / EDITAR REPORTE
     ====================================================== */

  function abrirModalNuevo() {
    modoModal    = "crear";
    editandoId   = null;
    archivosTemporales = [];
    const hoy = new Date().toISOString().split("T")[0];
    document.getElementById("nuevo-rep-hasta").value = hoy;
    document.getElementById("modal-rep-titulo").textContent = "Generar nuevo reporte";
    document.getElementById("btn-generar-rep").textContent  = "Generar";
    document.getElementById("nuevo-rep-tipo").value         = "uso";
    document.getElementById("nuevo-rep-titulo").value       = "";
    document.getElementById("nuevo-rep-descripcion").value  = "";
    actualizarHintOtro();
    renderArchivosTemporales();
    abrirModal("modal-reporte");
  }

  function cerrarModalReporte() {
    cerrarModal(document.getElementById("modal-reporte"));
  }

  document.getElementById("btn-nuevo-reporte").addEventListener("click", abrirModalNuevo);
  document.getElementById("btn-cerrar-rep-modal").addEventListener("click", cerrarModalReporte);
  document.getElementById("btn-cancelar-rep").addEventListener("click", cerrarModalReporte);

  // Aviso cuando el reporte es de tipo libre ("Otro")
  document.getElementById("nuevo-rep-tipo").addEventListener("change", actualizarHintOtro);

  function actualizarHintOtro() {
    const esOtro = document.getElementById("nuevo-rep-tipo").value === "otro";
    document.getElementById("hint-otro").hidden = !esOtro;
  }

  document.getElementById("modal-reporte").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-reporte")) cerrarModalReporte();
  });

  /* ---- Adjuntos del modal ---- */

  document.getElementById("nuevo-rep-archivos").addEventListener("change", (e) => agregarArchivos(e.target.files));

  const dz = document.querySelector(".dropzone");
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", (e) => agregarArchivos(e.dataTransfer.files));

  function leerArchivo(file) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload  = () => resolve({
        nombre: file.name,
        tipo: file.type || "application/octet-stream",
        tamano: file.size,
        data: lector.result
      });
      lector.onerror = reject;
      lector.readAsDataURL(file);
    });
  }

  async function agregarArchivos(files) {
    for (const f of [...files]) {
      if (f.size > 10 * 1024 * 1024) { showToast(`"${f.name}" supera el máximo de 10 MB.`, "error"); continue; }
      if (archivosTemporales.length >= 10) { showToast("Máximo 10 archivos por reporte.", "error"); break; }
      try { archivosTemporales.push(await leerArchivo(f)); }
      catch { showToast(`No se pudo leer "${f.name}".`, "error"); }
    }
    limpiarInputArchivos();
    renderArchivosTemporales();
  }
  function limpiarInputArchivos() { document.getElementById("nuevo-rep-archivos").value = ""; }

  function quitarArchivoTemporal(indice) {
    archivosTemporales.splice(indice, 1);
    renderArchivosTemporales();
  }

  function renderArchivosTemporales() {
    document.getElementById("lista-adjuntos").innerHTML = archivosTemporales.map((a, i) => `
      <span class="adj-file adj-file--estatica" title="${esc(a.nombre)}">
        ${(a.tipo ?? "").startsWith("image/") ? '<i data-lucide="image"></i>' : '<i data-lucide="file-text"></i>'}
        <span>${esc(a.nombre)}</span>
        <small>${formatoBytes(a.tamano)}</small>
        <button type="button" class="adj-file__quitar" data-quitar="${i}" aria-label="Quitar archivo"><i data-lucide="x"></i></button>
      </span>
    `).join("");
  }

  document.getElementById("lista-adjuntos").onclick = (e) => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    quitarArchivoTemporal(Number(b.dataset.quitar));
  };

  /* ---- Guardar (crear o editar) ---- */

  document.getElementById("btn-generar-rep").addEventListener("click", async () => {
    const tipo        = document.getElementById("nuevo-rep-tipo").value;
    const titulo      = document.getElementById("nuevo-rep-titulo").value.trim();
    const descripcion = document.getElementById("nuevo-rep-descripcion").value.trim();

    if (!titulo)      { showToast("Escribe un título para el reporte.", "error"); return; }
    if (!descripcion) { showToast("Agrega una descripción al reporte.", "error"); return; }

    const sesion = AUTH.getSesion();
    const btn    = document.getElementById("btn-generar-rep");
    btn.disabled = true;

    try {
      if (modoModal === "crear") {
        await crearReporte({
          tipo,
          titulo,
          descripcion,
          fecha: new Date().toISOString().split("T")[0],
          generadoPor: sesion?.id ?? "desconocido",
          datos: generarDatosMock(tipo),
          adjuntos: archivosTemporales
        });
        showToast("Reporte generado correctamente.");
      } else {
        // Al editar no se regeneran los datos ni la fecha original
        await actualizarReporte(editandoId, {
          tipo, titulo, descripcion,
          adjuntos: archivosTemporales,
          usuarioId: sesion?.id
        });
        showToast("Reporte actualizado correctamente.");
      }

      const idVisto = modoModal === "editar" ? editandoId : null;
      await recargarReportes();
      refrescarNotificaciones();
      cerrarModalReporte();
      if (repAbiertoId && repAbiertoId === idVisto) abrirReporte(idVisto);
    } catch (err) {
      showToast(err.message || "No se pudo guardar el reporte.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  /* ======================================================
     CONTENIDO DEL REPORTE (gráficos y tablas)
     ====================================================== */

  function generarDatosMock(tipo) {
    // Tipo "Otro": reporte libre, sin datos automáticos
    if (tipo === "otro") return {};
    if (tipo === "uso" || tipo === "disponibilidad") {
      return {
        labels:  ["Lab 1","Lab 2","Lab 3","Lab 4","Lab Redes"],
        valores: [70,65,50,15,85].map((v) => v + Math.floor(Math.random() * 15))
      };
    }
    if (tipo === "fallas") {
      return { fallas: [{ equipo:"PC-nuevo", lab:"Lab 1", descripcion:"Falla simulada", estado:"pendiente" }] };
    }
    return { total:145, activos:141, enFalla:3, enMantencion:1 };
  }

  function buildReporteHTML(rep) {
    // Reporte libre ("Otro"): sin gráficos ni tablas generadas por el sistema
    if (rep.tipo === "otro") return "";
    if (rep.tipo === "uso" || rep.tipo === "disponibilidad") {
      return `
        <h3 style="margin:0 0 16px;font-size:.95rem">${rep.tipo === "uso" ? "Horas de uso por laboratorio" : "Porcentaje de disponibilidad por laboratorio"}</h3>
        <canvas id="canvas-chart" width="600" height="220" style="max-width:100%"></canvas>
        <div style="margin-top:16px">
          <table>
            <thead><tr><th>Laboratorio</th><th>${rep.tipo === "uso" ? "Horas de uso" : "Disponibilidad (%)"}</th></tr></thead>
            <tbody>
              ${rep.datos.labels.map((l, i) => `<tr><td>${esc(l)}</td><td><strong>${esc(rep.datos.valores[i])}${rep.tipo === "disponibilidad" ? "%" : " h"}</strong></td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      `;
    }
    if (rep.tipo === "fallas") {
      return `
        <h3 style="margin:0 0 16px;font-size:.95rem">Registro de fallas</h3>
        <table>
          <thead><tr><th>Equipo</th><th>Laboratorio</th><th>Descripción</th><th>Estado</th></tr></thead>
          <tbody>
            ${rep.datos.fallas.map((f) => `
              <tr>
                <td><strong>${esc(f.equipo)}</strong></td>
                <td>${esc(f.lab)}</td>
                <td>${esc(f.descripcion)}</td>
                <td><span class="badge ${f.estado === "resuelto" ? "badge--disponible" : f.estado === "en reparación" ? "badge--mantencion" : "badge--ocupado"}">${esc(f.estado)}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }
    if (rep.tipo === "inventario") {
      const d = rep.datos;
      return `
        <h3 style="margin:0 0 16px;font-size:.95rem">Resumen de inventario</h3>
        <div class="stat-grid">
          <div class="card stat-card"><div><div class="stat-card__label">Total equipos</div><div class="stat-card__value">${esc(d.total)}</div></div><div class="stat-card__icon stat-card__icon--primary"><i data-lucide="monitor"></i></div></div>
          <div class="card stat-card"><div><div class="stat-card__label">Activos</div><div class="stat-card__value">${esc(d.activos)}</div></div><div class="stat-card__icon stat-card__icon--success"><i data-lucide="circle-check"></i></div></div>
          <div class="card stat-card"><div><div class="stat-card__label">Con falla</div><div class="stat-card__value">${esc(d.enFalla)}</div></div><div class="stat-card__icon stat-card__icon--danger"><i data-lucide="triangle-alert"></i></div></div>
          <div class="card stat-card"><div><div class="stat-card__label">En mantención</div><div class="stat-card__value">${esc(d.enMantencion)}</div></div><div class="stat-card__icon stat-card__icon--warning"><i data-lucide="wrench"></i></div></div>
        </div>
      `;
    }
    return `<p style="color:var(--color-text-muted)">Sin datos para mostrar.</p>`;
  }

  function drawBarChart(labels, valores, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx    = canvas.getContext("2d");
    const W      = canvas.width;
    const H      = canvas.height;
    const maxVal = Math.max(...valores) || 1;
    const pad    = 40;
    const barW   = (W - pad * 2) / labels.length - 10;
    const colores= ["#2f6fed","#16a34a","#ef4444","#f59e0b","#8b5cf6"];
    const estilos = getComputedStyle(document.documentElement);
    const cFondo  = estilos.getPropertyValue("--chart-bg").trim()    || "#f4f6fb";
    const cEje    = estilos.getPropertyValue("--chart-axis").trim()  || "#667085";
    const cValor  = estilos.getPropertyValue("--chart-value").trim() || "#101828";

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cFondo;
    ctx.fillRect(0, 0, W, H);

    labels.forEach((label, i) => {
      const x   = pad + i * ((W - pad * 2) / labels.length) + 5;
      const pct = valores[i] / maxVal;
      const bH  = pct * (H - 60);
      const y   = H - bH - 30;

      ctx.fillStyle = colores[i % colores.length];
      ctx.beginPath();
      ctx.roundRect(x, y, barW, bH, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = cValor;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(valores[i], x + barW / 2, y - 6);

      ctx.fillStyle = cEje;
      ctx.font = "10px sans-serif";
      ctx.fillText(label, x + barW / 2, H - 10);
    });
  }

  /* ======================================================
     UTILIDADES
     ====================================================== */

  function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function formatoBytes(n) {
    if (!n && n !== 0) return "";
    const unidades = ["B", "KB", "MB", "GB"];
    let v = n, i = 0;
    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${unidades[i]}`;
  }

  function imprimirReporte() {
    window.print();
  }

  document.getElementById("lightbox")?.addEventListener("click", () => {
    const lb = document.getElementById("lightbox");
    if (lb) lb.style.display = "none";
  });
