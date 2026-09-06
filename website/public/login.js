/* Imports (ES modules) */
import { AUTH } from "./data.js";

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

const pasoUno = document.getElementById("paso-1");
const pasoDos = document.getElementById("paso-2");
const errorUno = document.getElementById("login-error");
const errorDos = document.getElementById("login-2fa-error");
const inputCodigo = document.getElementById("input-2fa");
let desafio2FA = null;

function completarCredencial(cuenta) {
  document.getElementById("input-user").value = cuenta.u;
  document.getElementById("input-pass").value = cuenta.p;
  document.getElementById("input-user").focus();
}

function mostrarPaso(esSegundo) {
  pasoUno.style.display = esSegundo ? "none" : "";
  pasoDos.style.display = esSegundo ? "" : "none";
  if (esSegundo) {
    document.querySelector(".login-submit").textContent = "Verificar";
    inputCodigo.focus();
  } else {
    document.querySelector(".login-submit").textContent = "Ingresar";
    inputCodigo.value = "";
    document.getElementById("input-user").focus();
  }
}

document.querySelectorAll(".login-hint__btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (desafio2FA) {
      desafio2FA = null;
      mostrarPaso(false);
    }
    completarCredencial(USUARIOS_DEMO[Number(btn.dataset.demo) ?? 0]);
  });
});

document.querySelector(".login-back")?.addEventListener("click", () => {
  desafio2FA = null;
  mostrarPaso(false);
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.querySelector(".login-submit");
  btn.disabled = true;
  try {
    if (desafio2FA) {
      // Segundo paso: validar el código TOTP del desafío pendiente.
      errorDos.style.display = "none";
      btn.textContent = "Verificando…";
      const usuario = await AUTH.verificar2fa(desafio2FA.loginId, inputCodigo.value).catch(() => null);
      if (usuario) {
        window.location.href = "index.html";
        return;
      }
      errorDos.textContent = "Código incorrecto o sesión expirada. Intenta de nuevo.";
      errorDos.style.display = "block";
    } else {
      // Primer paso: credenciales.
      errorUno.style.display = "none";
      btn.textContent = "Ingresando…";
      const result = await AUTH.login(
        document.getElementById("input-user").value.trim(),
        document.getElementById("input-pass").value
      ).catch(() => null);
      if (result && result.requires2FA) {
        desafio2FA = result;
        mostrarPaso(true);
      } else if (result) {
        window.location.href = "index.html";
      } else {
        errorUno.style.display = "block";
      }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = desafio2FA ? "Verificar" : "Ingresar";
  }
});