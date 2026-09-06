/* totp.mjs — TOTP (RFC 6238 / HMAC-SHA1) con crypto nativo, sin dependencias.
   Usado por la verificación en dos pasos (2FA) para la cuenta de administrador. */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASO_MS = 30000;

export function generaSecreto(longitud = 20) {
  return codificarBase32(randomBytes(longitud));
}

export function codificarBase32(buffer) {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

function decodificarBase32(texto) {
  const limpio = String(texto).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const caracter of limpio) {
    const indice = ALFABETO.indexOf(caracter);
    if (indice === -1) continue;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codigoEnContador(secretoBase32, contador) {
  const clave = decodificarBase32(secretoBase32);
  if (!clave.length) return null;
  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac("sha1", clave).update(mensaje).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 1000000).padStart(6, "0");
}

export function contadorActual(fechaMs = Date.now()) {
  return Math.floor(fechaMs / PASO_MS);
}

export function codigoActual(secretoBase32, fechaMs = Date.now()) {
  return codigoEnContador(secretoBase32, contadorActual(fechaMs));
}

function igualSeguro(a, b) {
  const ia = Buffer.from(a);
  const ib = Buffer.from(b);
  if (ia.length !== ib.length) return false;
  return timingSafeEqual(ia, ib);
}

// Acepta el código dentro de una ventana de ± pasos (por defecto ±1 de 30 s).
export function verificarCodigo(secretoBase32, codigo, ventana = 1, fechaMs = Date.now()) {
  const codigoLimpio = String(codigo ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(codigoLimpio)) return false;
  const actual = contadorActual(fechaMs);
  for (let desvio = -ventana; desvio <= ventana; desvio++) {
    const esperado = codigoEnContador(secretoBase32, actual + desvio);
    if (esperado && igualSeguro(esperado, codigoLimpio)) return true;
  }
  return false;
}