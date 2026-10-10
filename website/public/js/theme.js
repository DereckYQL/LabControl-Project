/* theme.js — aplica el tema guardado antes de pintar para evitar destellos. */
try {
  var t = localStorage.getItem("lc_tema");
  if (t === "dark-sidebar") t = "oscuro";
  if (t === "blue-sidebar") t = "claro";
  if (t === "green-sidebar") t = "claro";
  if (t === "azul") t = "claro";
  if (t === "verde") t = "claro";
  var temas = window.LC_TEMAS || ["claro", "oscuro"];
  if (!temas.includes(t)) t = "claro";
  document.documentElement.dataset.theme = t;
} catch (e) {}