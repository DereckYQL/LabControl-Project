/* Imports (ES modules) */
import { cargarLaboratorios } from "./data.js";
import { renderDonut, renderLabGrid, renderSidebar, renderStatusList, renderStatCards, showToast } from "./app.js";


  const sesion = renderSidebar("index.html");

  if (sesion) {
    const hora = new Date().getHours();
    const saludo = hora < 13 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
    document.getElementById("saludo-titulo").textContent =
      `${saludo}, ${sesion.nombre}`;
  }

  cargarLaboratorios().then((labs) => {
    renderStatCards(labs, "stat-cards");
    renderStatusList(labs, "status-list");
    renderDonut(labs, "donut");
    renderLabGrid(labs, "labs-home", { linkTo: "laboratorios.html" });
  }).catch(() => showToast("No se pudieron cargar los laboratorios.", "error"));
