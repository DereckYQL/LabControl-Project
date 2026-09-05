/* theme.js — detección de tema compartida por todas las páginas (P4).
   Se carga de forma síncrona en el <head> antes que el CSS, igual que el
   script inline que reemplaza: aplica el tema guardado en localStorage sin
   destellos. Las páginas pueden declarar un conjunto distinto de temas con
   `window.LC_TEMAS` (configuracion.html declara claro/azul/verde/oscuro). */
try {
  var t = localStorage.getItem("lc_tema");
  if (t === "dark-sidebar") t = "oscuro";
  if (t === "blue-sidebar") t = "azul";
  if (t === "green-sidebar") t = "verde";
  var temas = window.LC_TEMAS || ["claro", "oscuro"];
  if (!temas.includes(t)) t = "claro";
  document.documentElement.dataset.theme = t;
} catch (e) {}