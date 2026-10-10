/* Imports (ES modules) */
import { cargarLaboratorios } from "./data.js";
import { esc, renderDonut, renderLabGrid, renderSidebar, renderStatusList, renderStatCards, showToast } from "./app.js";


  const sesion = renderSidebar("index.html");

  if (sesion) {
    const hora = new Date().getHours();
    const saludo = hora < 13 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
    document.getElementById("saludo-titulo").textContent =
      `${saludo}, ${sesion.nombre}`;
  }

  let labsCache = [];

  cargarLaboratorios().then((labs) => {
    labsCache = labs;
    renderStatCards(labs, "stat-cards");
    renderStatusList(labs, "status-list");
    renderDonut(labs, "donut");
    renderLabGrid(labs, "labs-home", { linkTo: "laboratorios.html" });
  }).catch(() => showToast("No se pudieron cargar los laboratorios.", "error"));

  // Lightbox de imágenes de laboratorios
  const lightbox = document.getElementById("lightbox-lab");
  const lightboxImg = document.getElementById("lightbox-lab-img");
  const lightboxCounter = document.getElementById("lightbox-lab-counter");
  const lightboxThumbs = document.getElementById("lightbox-lab-thumbs");
  let lightboxImages = [];
  let lightboxIndex = 0;

  function openLightbox(images, startIndex = 0) {
    if (!images || images.length === 0) return;
    lightboxImages = images;
    lightboxIndex = startIndex;
    updateLightbox();
    lightbox.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.style.display = "none";
    document.body.style.overflow = "";
  }

  function updateLightbox() {
    const src = lightboxImages[lightboxIndex];
    lightboxImg.src = src;
    lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    lightboxThumbs.innerHTML = lightboxImages.map((img, i) =>
      `<img src="${esc(img)}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer;opacity:${i === lightboxIndex ? 1 : 0.5};border:2px solid ${i === lightboxIndex ? "#ffc300" : "transparent"}" data-index="${i}" />`
    ).join("");
    lightboxThumbs.querySelectorAll("img").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        lightboxIndex = Number(thumb.dataset.index);
        updateLightbox();
      });
    });
  }

  function navLightbox(dir) {
    lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
    updateLightbox();
  }

  document.getElementById("lightbox-lab-close").addEventListener("click", closeLightbox);
  document.getElementById("lightbox-lab-prev").addEventListener("click", () => navLightbox(-1));
  document.getElementById("lightbox-lab-next").addEventListener("click", () => navLightbox(1));
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (lightbox.style.display !== "flex") return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") navLightbox(-1);
    if (e.key === "ArrowRight") navLightbox(1);
  });

  document.getElementById("labs-home").addEventListener("click", (e) => {
    const img = e.target.closest(".lab-card__img");
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      let images = [];
      const labId = Number(img.dataset.labId);
      const lab = labsCache.find(l => l.id === labId);
      if (lab && lab.imagenes) images = lab.imagenes;
      if (images.length > 0) openLightbox(images, 0);
    }
  });
