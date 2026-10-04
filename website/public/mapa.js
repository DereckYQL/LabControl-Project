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
let pisoActual = 2;

function mostrarPiso(piso) {
  pisoActual = piso;
  const grupo2 = document.getElementById("piso-2-group");
  const grupo3 = document.getElementById("piso-3-group");
  const boton2 = document.getElementById("piso-2");
  const boton3 = document.getElementById("piso-3");
  const indicador = document.getElementById("piso-indicador");

  if (piso === 2) {
    grupo2.style.display = "";
    grupo3.style.display = "none";
    boton2.classList.add("active");
    boton3.classList.remove("active");
    indicador.textContent = "2do Piso";
  } else {
    grupo2.style.display = "none";
    grupo3.style.display = "";
    boton2.classList.remove("active");
    boton3.classList.add("active");
    indicador.textContent = "3er Piso";
  }

  document.querySelectorAll(".sala-lab").forEach((g) => g.classList.remove("selected"));
  document.getElementById("panel-lab").style.display = "none";
}

document.getElementById("piso-2").addEventListener("click", () => mostrarPiso(2));
document.getElementById("piso-3").addEventListener("click", () => mostrarPiso(3));

cargarLaboratorios().then((labs) => {
  labsCache = labs;

  labs.forEach((lab) => {
    const g = document.querySelector('[data-lab-id="' + lab.id + '"]');
    if (!g) return;
    const rect = g.querySelector("rect");
    rect.style.fill = COLORES_MAPA[lab.estado];
    rect.setAttribute("stroke", "#ffc300");
    rect.setAttribute("stroke-width", "3");
    rect.setAttribute("aria-hidden", "true");
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-label", `${lab.nombre} (${lab.sala}) — ${ESTADOS[lab.estado].label}`);
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

  mostrarPiso(2);
}).catch(() => showToast("No se pudieron cargar los laboratorios.", "error"));

function seleccionarLab(id) {
  const lab = labsCache.find((l) => l.id === id);
  if (!lab) return;

  const pisoDelLab = id === 1 || id === 3 ? 2 : 3;
  if (pisoActual !== pisoDelLab) {
    mostrarPiso(pisoDelLab);
  }

  setTimeout(() => {
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
  }, 50);
}
