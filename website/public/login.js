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

const $ = (id) => document.getElementById(id);

// ============================================================
// Cambio de vistas (login / registrar / recuperar)
// ============================================================
const vistas = {
  login: $("vista-login"),
  registrar: $("vista-registrar"),
  recuperar: $("vista-recuperar")
};
const loginHint = $("login-hint");

function cambiarVista(nombre) {
  Object.entries(vistas).forEach(([k, sec]) => {
    sec.style.display = k === nombre ? "" : "none";
    sec.setAttribute("aria-hidden", k === nombre ? "false" : "true");
  });
  loginHint.style.display = nombre === "login" ? "" : "none";
  if (nombre === "login") $("input-user").focus();
  else if (nombre === "registrar") $("reg-nombre").focus();
  else if (nombre === "recuperar" && $("restablecer-form").style.display === "none") $("rec-email").focus();
}

// ============================================================
// Ingreso con dos pasos (2FA)
// ============================================================
const pasoUno = $("paso-1");
const pasoDos = $("paso-2");
const errorUno = $("login-error");
const errorDos = $("login-2fa-error");
const inputCodigo = $("input-2fa");
let desafio2FA = null;

function completarCredencial(cuenta) {
  $("input-user").value = cuenta.u;
  $("input-pass").value = cuenta.p;
  $("input-user").focus();
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
    $("input-user").focus();
  }
}

document.querySelectorAll(".login-hint__btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (desafio2FA) {
      desafio2FA = null;
      mostrarPaso(false);
    }
    if (vistas.login.style.display === "none") cambiarVista("login");
    completarCredencial(USUARIOS_DEMO[Number(btn.dataset.demo) ?? 0]);
  });
});

document.querySelector(".login-back")?.addEventListener("click", () => {
  desafio2FA = null;
  mostrarPaso(false);
});

$("login-form").addEventListener("submit", async (e) => {
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
        $("input-user").value.trim(),
        $("input-pass").value
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

// ============================================================
// Registro autónomo
// ============================================================
const registroForm = $("registro-form");
const registroError = $("registro-error");
const registroOk = $("registro-ok");
const PATRON_USUARIO = /^[A-Za-z0-9_]{3,80}$/;
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mostrarBox(el, msg) {
  if (!msg) {
    el.style.display = "none";
    return;
  }
  el.textContent = msg;
  el.style.display = "block";
}

registroForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("reg-nombre").value.trim();
  const apellido = $("reg-apellido").value.trim();
  const usuario = $("reg-usuario").value.trim();
  const email = $("reg-email").value.trim();
  const area = $("reg-area").value.trim();
  const especialidad = $("reg-especialidad").value.trim();
  const pass = $("reg-pass").value;
  const pass2 = $("reg-pass2").value;
  const terminos = $("reg-terminos").checked;

  mostrarBox(registroError, null);
  mostrarBox(registroOk, null);
  let msg = null;
  if (nombre.length < 2 || apellido.length < 2) msg = "Ingresa tu nombre y apellido.";
  else if (!PATRON_USUARIO.test(usuario)) msg = "El usuario debe tener al menos 3 caracteres, con solo letras, números y guion bajo.";
  else if (!PATRON_EMAIL.test(email)) msg = "Ingresa un correo válido.";
  else if (pass.length < 6) msg = "La contraseña debe tener al menos 6 caracteres.";
  else if (pass !== pass2) msg = "Las contraseñas no coinciden.";
  else if (!terminos) msg = "Debes aceptar los términos de uso y la política de privacidad para continuar.";
  if (msg) {
    mostrarBox(registroError, msg);
    return;
  }

  const btn = registroForm.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Registrando…";
  try {
    await AUTH.registro({ id: usuario, nombre, apellido, email, area, especialidad, password: pass });
    mostrarBox(registroOk, "Cuenta creada correctamente. Iniciando sesión…");
    const r = await AUTH.login(usuario, pass);
    window.location.href = r && !r.requires2FA ? "index.html" : "login.html";
  } catch (err) {
    mostrarBox(registroError, (err && err.message) ? err.message : "No se pudo crear la cuenta.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Registrarse";
  }
});

// ============================================================
// Recuperación de contraseña
// ============================================================
const recuperarForm = $("recuperar-form");
const recuperarError = $("recuperar-error");
const recuperarOk = $("recuperar-ok");
const recuperarDemo = $("recuperar-demo");
const restablecerForm = $("restablecer-form");
const restablecerError = $("restablecer-error");
let tokenRestablecer = null;

function entrarModoRestablecer() {
  $("rec-desc").textContent = "Escribe tu nueva contraseña para continuar.";
  recuperarForm.style.display = "none";
  restablecerForm.style.display = "";
  restablecerError.style.display = "none";
  $("rec-pass").focus();
}

function salirModoRestablecer() {
  $("rec-desc").textContent = "Ingresa tu correo y te enviaremos un enlace para restablecerla.";
  recuperarForm.style.display = "";
  restablecerForm.style.display = "none";
  recuperarOk.style.display = "none";
  recuperarDemo.style.display = "none";
  mostrarBox(recuperarError, null);
  tokenRestablecer = null;
}

recuperarForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("rec-email").value.trim();
  if (!PATRON_EMAIL.test(email)) {
    mostrarBox(recuperarError, "Ingresa un correo válido.");
    return;
  }
  mostrarBox(recuperarError, null);
  recuperarOk.style.display = "none";
  recuperarDemo.style.display = "none";
  const btn = recuperarForm.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    const result = await AUTH.solicitarRecuperacion(email);
    recuperarOk.style.display = "block";
    if (result && result.demo) {
      // En modo demo no se envía correo: se muestra el botón para continuar.
      recuperarDemo.style.display = "block";
    }
  } catch (err) {
    mostrarBox(recuperarError, (err && err.message) ? err.message : "No se pudo enviar el correo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar instrucciones";
  }
});

$("btn-rec-demo").addEventListener("click", () => {
  tokenRestablecer = "demo_reset_token";
  entrarModoRestablecer();
});

restablecerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pass = $("rec-pass").value;
  const pass2 = $("rec-pass2").value;
  let msg = null;
  if (pass.length < 6) msg = "La contraseña debe tener al menos 6 caracteres.";
  else if (pass !== pass2) msg = "Las contraseñas no coinciden.";
  if (msg) {
    mostrarBox(restablecerError, msg);
    return;
  }
  const btn = restablecerForm.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Restableciendo…";
  try {
    await AUTH.restablecerContrasena(tokenRestablecer, pass);
    window.location.href = "login.html";
  } catch (err) {
    mostrarBox(restablecerError, (err && err.message) ? err.message : "El enlace es inválido o expiró.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Restablecer contraseña";
  }
});

// Enlace desde el correo: ?reset=<token> abre directamente el paso final.
(function () {
  const valor = new URLSearchParams(window.location.search).get("reset");
  if (valor) {
    tokenRestablecer = valor;
    cambiarVista("recuperar");
    entrarModoRestablecer();
  }
})();

// ============================================================
// Call to action: Google
// ============================================================
$("btn-google").addEventListener("click", () => {
  const aviso = $("aviso-google");
  aviso.style.display = aviso.style.display === "none" ? "block" : "none";
});

// ============================================================
// Navegación entre vistas
// ============================================================
$("btn-ir-registrar").addEventListener("click", () => cambiarVista("registrar"));
$("btn-ir-recuperar").addEventListener("click", () => { salirModoRestablecer(); cambiarVista("recuperar"); });
$("btn-reg-volver").addEventListener("click", () => cambiarVista("login"));
$("btn-rec-volver").addEventListener("click", () => { salirModoRestablecer(); cambiarVista("login"); });
$("btn-rec-otro-volver").addEventListener("click", () => { salirModoRestablecer(); cambiarVista("login"); });

// ============================================================
// Modal de Términos y Privacidad
// ============================================================
const modal = $("modal-terminos");
const modalTitulo = $("modal-terminos-titulo");
const modalCuerpo = $("modal-terminos-cuerpo");

const CONTENIDO_TERMINOS = [
  "Términos de uso",
  `<p class="terminos-lead">Estos Términos de uso regulan tu acceso y uso de <strong>Insuco LabControl</strong>, el sistema de gestión de laboratorios del Liceo INSUCO. Al crear una cuenta, celebrar un acuerdo legal vinculante con el establecimiento.</p>
   <h3>1. Registro y requisitos de edad</h3>
   <p>Debes proporcionar datos institucionales reales y verificables. Si eres menor de 18 años, declaras que tu padre, madre o tutor legal te permite crear esta cuenta y acepta estos Términos de uso.</p>
   <h3>2. Credenciales y seguridad</h3>
   <p>Eres responsable de mantener confidenciales tu usuario y contraseña, y de todas las actividades realizadas con tu cuenta. Compártelas solo con el personal autorizado del establecimiento.</p>
   <h3>3. Uso aceptable</h3>
   <p>Usa el sistema para fines académicos y administrativos. Queda prohibido intentar vulnerar la seguridad, extraer información sin autorización o usar la plataforma para fines ajenos al liceo.</p>
   <h3>4. Disponibilidad</h3>
   <p>El servicio se presta sin garantías exigibles y puede requerir mantenimiento, actualizaciones o pausas temporales. La versión web se despliega de forma automática en GitHub Pages.</p>
   <h3>5. Resolución de controversias (arbitraje)</h3>
   <p>Cualquier controversia relacionada con estos Términos de uso se resolverá preferentemente por la vía interna del establecimiento y, en su defecto, ante los tribunales competentes de Chile.</p>
   <h3>6. Modificaciones</h3>
   <p>Podemos actualizar estos Términos de uso. La versión vigente estará siempre disponible en esta misma pantalla.</p>`
];

const CONTENIDO_PRIVACIDAD = [
  "Política de privacidad",
  `<p class="terminos-lead">En el Liceo INSUCO respetamos tu privacidad. Esta Política de privacidad explica qué información personal tratamos al usar <strong>Insuco LabControl</strong>.</p>
   <h3>1. Información que recopilamos</h3>
   <p>Datos de identificación (nombre, apellido), correo institucional, rol, área y especialidad, e información de uso como reservas, solicitudes y reportes de los laboratorios.</p>
   <h3>2. Cómo usamos la información</h3>
   <p>Solo la utilizamos para administrar los laboratorios de computación: validar accesos, registrar reservas y solicitudes, y generar reportes internos. Nunca la usamos con fines comerciales.</p>
   <h3>3. Compartir información</h3>
   <p>No vendemos ni compartimos tus datos con terceros. Solo pueden acceder a ellos los responsables informáticos del establecimiento y tú mismo, dentro del sistema.</p>
   <h3>4. Retención y eliminación</h3>
   <p>Conservamos tus datos mientras mantengas una cuenta activa. Puedes solicitar su corrección o eliminación contactando al administrador del liceo.</p>
   <h3>5. Seguridad</h3>
   <p>Las contraseñas se almacenan protegidas con cifrado y los accesos quedan registrados para auditoría. Ningún sistema es infalible, por lo que también te pedimos proteger tus propias credenciales.</p>
   <h3>6. Menores de edad</h3>
   <p>Si eres menor de 18 años, la creación de tu cuenta requiere la autorización de tu padre, madre o tutor legal, quien podrá solicitar el acceso o la eliminación de tus datos en cualquier momento.</p>
   <h3>7. Tus derechos</h3>
   <p>Tienes derecho a acceder, rectificar y suprimir tus datos, así como a solicitar mayor información al administrador: <strong>admin@liceo.cl</strong>.</p>`
];

function abrirModal(doc) {
  const [titulo, html] = doc === "privacidad" ? CONTENIDO_PRIVACIDAD : CONTENIDO_TERMINOS;
  modalTitulo.textContent = titulo;
  modalCuerpo.innerHTML = html;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

function cerrarModal() {
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}

document.querySelectorAll("[data-term]").forEach((btn) => {
  btn.addEventListener("click", () => abrirModal(btn.dataset.term));
});

document.querySelectorAll("[data-cerrar-modal]").forEach((btn) => {
  btn.addEventListener("click", cerrarModal);
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) cerrarModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.style.display !== "none") cerrarModal();
});