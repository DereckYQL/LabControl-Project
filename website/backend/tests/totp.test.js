/* Pruebas de totp.mjs. El módulo es de funciones puras: no escribe nada, no
   guarda estado entre llamadas y no toca la base de datos, así que estas
   pruebas cubren directamente lo que el informe señalaba como "sin límite de
   registros" (en este caso, sin persistencia que acotar). */

import { generaSecreto, codificarBase32, codigoActual, contadorActual, verificarCodigo } from "../totp.mjs";

test("generaSecreto: devuelve un base32 válido y distinto cada vez", () => {
  const a = generaSecreto();
  const b = generaSecreto();
  expect(a).toMatch(/^[A-Z2-7]+$/);
  expect(a).not.toBe(b);
});

test("generaSecreto: acota longitudes absurdas en vez de lanzar", () => {
  // Antes, randomBytes(0) o randomBytes(-5) lanzaban; ahora se normalizan.
  expect(generaSecreto(0)).toMatch(/^[A-Z2-7]{10,}$/);
  expect(generaSecreto(-5)).toMatch(/^[A-Z2-7]{10,}$/);
  expect(generaSecreto(1_000_000).length).toBeLessThanOrEqual(128);
  expect(generaSecreto(NaN)).toMatch(/^[A-Z2-7]+$/);
  expect(generaSecreto("basura")).toMatch(/^[A-Z2-7]+$/);
});

test("codificarBase32: coincide con los vectores de prueba de RFC 4648", () => {
  // La implementación no rellena con "=", que es lo que espera TOTP (el relleno
  // nunca aparece en la clave de un autenticador).
  const vectores = [
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"]
  ];
  for (const [entrada, esperado] of vectores) {
    expect(codificarBase32(Buffer.from(entrada, "ascii"))).toBe(esperado);
  }
  // Solo usa el alfabeto base32 estándar, sin relleno.
  expect(codificarBase32(Buffer.from("Hola"))).toMatch(/^[A-Z2-7]+$/);
});

test("codigoActual: es determinista dentro de la misma ventana de 30 s", () => {
  const secreto = generaSecreto();
  // Un instante alineado a la ventana: 29 s más tarde sigue siendo el mismo
  // código, 31 s después ya es el siguiente.
  const t0 = 1_699_999_980_000;
  expect(contadorActual(t0)).toBe(Math.floor(t0 / 30000));
  const a = codigoActual(secreto, t0);
  const b = codigoActual(secreto, t0 + 29_000);
  const c = codigoActual(secreto, t0 + 31_000);
  expect(a).toBe(b);
  expect(c).not.toBe(a);
  // Y el código del paso anterior es el que se acepta como desfase de reloj.
  expect(codigoActual(secreto, t0 - 30_000)).not.toBe(a);
});

test("contadorActual: avanza un paso cada 30 s", () => {
  expect(contadorActual(0)).toBe(0);
  expect(contadorActual(29_999)).toBe(0);
  expect(contadorActual(30_000)).toBe(1);
});

test("verificarCodigo: acepta el código actual y el de la ventana vecina", () => {
  const secreto = generaSecreto();
  const t0 = 1_700_000_000_000;
  const ahora = codigoActual(secreto, t0);
  const anterior = codigoActual(secreto, t0 - 30_000);
  const siguiente = codigoActual(secreto, t0 + 30_000);

  expect(verificarCodigo(secreto, ahora, 1, t0)).toBe(true);
  expect(verificarCodigo(secreto, anterior, 1, t0)).toBe(true);
  expect(verificarCodigo(secreto, siguiente, 1, t0)).toBe(true);
  // Fuera de la ventana, no.
  expect(verificarCodigo(secreto, siguiente, 0, t0)).toBe(false);
  expect(verificarCodigo(secreto, anterior, 0, t0)).toBe(false);
});

test("verificarCodigo: tolera espacios en el código escrito por el usuario", () => {
  const secreto = generaSecreto();
  const t0 = 1_700_000_000_000;
  const codigo = codigoActual(secreto, t0);
  const conEspacios = ` ${codigo.slice(0, 3)} ${codigo.slice(3)} `;
  expect(verificarCodigo(secreto, conEspacios, 1, t0)).toBe(true);
});

test("verificarCodigo: rechaza lo que no es un código de 6 dígitos", () => {
  const secreto = generaSecreto();
  const t0 = 1_700_000_000_000;
  for (const malo of ["", "   ", "12345", "1234567", "abcdef", "12a456", null, undefined, 12345678]) {
    expect(verificarCodigo(secreto, malo, 1, t0)).toBe(false);
  }
});

test("verificarCodigo: rechaza un secreto vacío o inválido sin lanzar", () => {
  const codigo = codigoActual(generaSecreto(), 1_700_000_000_000);
  for (const secreto of ["", "0000", "!!!!", null, undefined, {}]) {
    expect(verificarCodigo(secreto, codigo, 1, 1_700_000_000_000)).toBe(false);
  }
});

test("verificarCodigo: la ventana se acota, un valor absurdo no la convierte en un barrido largo", () => {
  const secreto = generaSecreto();
  const t0 = 1_700_000_000_000;
  const codigo = codigoActual(secreto, t0);

  // 1.000.000 de pasos de un lado y de otro serían 2 millones de HMAC; el tope
  // lo deja en 10. La comprobación sigue siendo instantánea y el resultado es
  // el mismo que con la ventana por defecto para el código actual.
  expect(verificarCodigo(secreto, codigo, 1_000_000, t0)).toBe(true);
  // Y una ventana negativa o no numérica se trata como la de por defecto.
  expect(verificarCodigo(secreto, codigo, -5, t0)).toBe(true);
  expect(verificarCodigo(secreto, codigo, "basura", t0)).toBe(true);
});

test("verificarCodigo: con ventana 0 solo vale el código del instante exacto", () => {
  const secreto = generaSecreto();
  const t0 = 1_700_000_000_000;
  expect(verificarCodigo(secreto, codigoActual(secreto, t0), 0, t0)).toBe(true);
  expect(verificarCodigo(secreto, codigoActual(secreto, t0 + 30_000), 0, t0)).toBe(false);
});

test("dos secretos distintos generan códigos distintos", () => {
  const t0 = 1_700_000_000_000;
  const a = generaSecreto();
  const b = generaSecreto();
  const codigoA = codigoActual(a, t0);
  expect(verificarCodigo(b, codigoA, 0, t0)).toBe(false);
});
