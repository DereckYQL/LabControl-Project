/* Imports (ES modules) */
import { ESTADOS, cargarLaboratorios } from "./data.js";
import { renderSidebar, showToast } from "./app.js";


  renderSidebar("mapa.html");

  const COLORES_MAPA = {
    disponible: "#16a34a",
    ocupado: "#ef4444",
    mantencion: "#f59e0b"
  };

  let labsCache = [];

  cargarLaboratorios().then((labs) => {
    labsCache = labs;

    labs.forEach((lab) => {
      const g = document.querySelector('[data-lab-id="' + lab.id + '"]');
      if (!g) return;
      const rect = g.querySelector("rect");
      rect.style.fill = COLORES_MAPA[lab.estado];
      rect.setAttribute("stroke", "#ffffff");
      rect.setAttribute("stroke-width", "2");
      rect.setAttribute("aria-hidden", "true");
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label", `${lab.nombre} (${lab.sala}) — ${ESTADOS[lab.estado].label}`);
      // El rótulo del mapa venía escrito a mano en el SVG y quedó desincronizado
      // de la base de datos (salas distintas a las reales). La base manda.
      const tNombre = g.querySelector('[data-mapa-texto="nombre"]');
      const tSala = g.querySelector('[data-mapa-texto="sala"]');
      if (tNombre) tNombre.textContent = lab.nombre;
      if (tSala) tSala.textContent = lab.sala;
      g.addEventListener("click", () => seleccionarLab(lab.id));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          seleccionarLab(lab.id);
        }
      });
    });
  }).catch(() => showToast("No se pudieron cargar los laboratorios.", "error"));

  function seleccionarLab(id) {
    const lab = labsCache.find((l) => l.id === id);
    if (!lab) return;

    document.querySelectorAll(".sala-lab").forEach((g) => g.classList.remove("selected"));
    document.querySelector('[data-lab-id="' + id + '"]').classList.add("selected");

    document.getElementById("panel-lab").style.display = "block";
    document.getElementById("panel-nombre").textContent = lab.nombre;
    document.getElementById("panel-sala").textContent = lab.sala + " · " + lab.equipos + " equipos";

    const badge = document.getElementById("panel-badge");
    badge.textContent = ESTADOS[lab.estado].label;
    badge.className = "badge badge--" + lab.estado;

    document.getElementById("panel-link").href = "laboratorios.html?id=" + lab.id;

    document.getElementById("panel-lab").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
