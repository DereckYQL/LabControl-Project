// Si ya hay sesión activa, redirigir al inicio
if (AUTH.getSesion()) {
  window.location.href = "index.html";
}

// Cuentas de demostración
const USUARIOS_DEMO = [
  { u: "INSUCO",     p: "Insuco1336", rol: "Administrador" },
  { u: "prof_juan",  p: "juan123",    rol: "Prof. Programación" },
  { u: "prof_camila",p: "camila123",  rol: "Otra área" }
];

function completarCredencial(cuenta) {
  document.getElementById("input-user").value = cuenta.u;
  document.getElementById("input-pass").value = cuenta.p;
  document.getElementById("input-user").focus();
}

document.querySelectorAll(".login-hint__btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    completarCredencial(USUARIOS_DEMO[Number(btn.dataset.demo) ?? 0]);
  });
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("input-user").value.trim();
  const pass = document.getElementById("input-pass").value;
  const btn = document.querySelector(".login-submit");
  document.getElementById("login-error").style.display = "none";
  btn.disabled = true;
  btn.textContent = "Ingresando…";
  const result = await AUTH.login(user, pass);
  btn.disabled = false;
  btn.textContent = "Ingresar";
  if (result) {
    window.location.href = "index.html";
  } else {
    document.getElementById("login-error").style.display = "block";
  }
});