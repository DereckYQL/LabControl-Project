"use strict";

/*
 * Insuco LabControl — acceso desde el celular.
 *
 * Muestra en la consola la dirección con la que el celular puede abrir
 * la web del servidor local (misma red Wi-Fi) y un código QR para
 * escanearla con la cámara, sin instalar nada más.
 *
 * Se ejecuta solo:  node celular.js
 */

const os = require("os");
const net = require("net");

const PUERTO = process.env.PORT || 3000;
const RUTA_INICIO = "/login.html";

/* ------------------------------------------------------------------ */
/* Detección de la IP local (LAN)                                      */
/* ------------------------------------------------------------------ */

function prioridadIp(ip) {
  if (/^192\.168\./.test(ip)) return 3;
  if (/^10\./.test(ip)) return 2;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 1;
  return 0;
}

function ipsLocales() {
  const resultado = [];
  for (const [nombre, interfaces] of Object.entries(os.networkInterfaces())) {
    for (const info of interfaces || []) {
      if (
        info.family === "IPv4" &&
        !info.internal &&
        !/^169\.254\./.test(info.address)
      ) {
        resultado.push({ nombre, direccion: info.address });
      }
    }
  }
  // La más probable primero (rango típico de router doméstico/liceo).
  resultado.sort((a, b) => prioridadIp(b.direccion) - prioridadIp(a.direccion));
  return resultado;
}

/* ------------------------------------------------------------------ */
/* Codificador de códigos QR (ISO/IEC 18004), sin dependencias.        */
/* Modo byte, niveles L/M, versiones 1 a 10 — de sobra para una URL.   */
/* ------------------------------------------------------------------ */

// Palabras de corrección de errores por bloque (nivel L y M).
const ECC_L = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
// Cantidad de bloques Reed-Solomon por versión.
const BLOQUES_L = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
const BLOQUES_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
// Total de codewords (datos + ECC) por versión.
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
// Posiciones de los patrones de alineamiento, indexadas por versión
// (la 1 no tiene; la coordenada grande siempre es tamaño - 7).
const ALINEAMIENTO = [
  [], // v1
  [], // v1 (índice = versión)
  [6, 18], // v2
  [6, 22], // v3
  [6, 26], // v4
  [6, 30], // v5
  [6, 34], // v6
  [6, 22, 38], // v7
  [6, 24, 42], // v8
  [6, 26, 46], // v9
  [6, 28, 50], // v10
];

function multiplicarRS(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisorRS(grado) {
  const res = new Array(grado).fill(0);
  res[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < res.length; j++) {
      res[j] = multiplicarRS(res[j], raiz);
      if (j + 1 < res.length) res[j] ^= res[j + 1];
    }
    raiz = multiplicarRS(raiz, 0x02);
  }
  return res;
}

function restoRS(datos, divisor) {
  const res = new Array(divisor.length).fill(0);
  for (const b of datos) {
    const factor = b ^ res.shift();
    res.push(0);
    for (let i = 0; i < res.length; i++) {
      res[i] ^= multiplicarRS(divisor[i], factor);
    }
  }
  return res;
}

function entrelazar(datos, version) {
  const numBloques = BLOQUES_M[version];
  const eccPorBloque = ECC_M[version];
  const totalCw = TOTAL_CODEWORDS[version];
  const numCortos = numBloques - (totalCw % numBloques);
  const largoCorto = Math.floor(totalCw / numBloques);

  const div = divisorRS(eccPorBloque);
  const bloques = [];
  for (let i = 0, k = 0; i < numBloques; i++) {
    const largoDatos = largoCorto - eccPorBloque + (i < numCortos ? 0 : 1);
    const parte = datos.slice(k, k + largoDatos);
    k += largoDatos;
    const bloque = parte.slice();
    if (i < numCortos) bloque.push(0); // relleno temporal de bloques cortos
    bloques.push({ cw: bloque.concat(restoRS(parte, div)), corto: i < numCortos });
  }

  const resultado = [];
  for (let i = 0; i < bloques[0].cw.length; i++) {
    for (const b of bloques) {
      if (!(b.corto && i === largoCorto - eccPorBloque)) resultado.push(b.cw[i]);
    }
  }
  return resultado;
}

function matrizQR(texto, nivel, forzarMascara) {
  const ECL = nivel === "L" ? ECC_L : ECC_M;
  const BLOQUES = nivel === "L" ? BLOQUES_L : BLOQUES_M;

  const datos = Buffer.from(texto, "utf8");

  // Versión más chica que alcance (los bits de modo + contador + datos).
  // La capacidad de datos es el total de codewords menos los de corrección.
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const ccBits = v < 10 ? 8 : 16;
    const datosCw = TOTAL_CODEWORDS[v] - ECL[v] * BLOQUES[v];
    if (4 + ccBits + datos.length * 8 <= datosCw * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error("El texto es demasiado largo para el código QR");
  const ccBits = version < 10 ? 8 : 16;
  const capacidadBits =
    (TOTAL_CODEWORDS[version] - ECL[version] * BLOQUES[version]) * 8;

  // Flujo de bits: modo byte + largo + datos + terminador + relleno.
  const bits = [];
  const pushBits = (valor, largo) => {
    for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  pushBits(4, 4); // indicador de modo "byte"
  pushBits(datos.length, ccBits);
  for (const b of datos) pushBits(b, 8);
  pushBits(0, Math.min(4, capacidadBits - bits.length));
  pushBits(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacidadBits; pad ^= 0xec ^ 0x11) {
    pushBits(pad, 8);
  }
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }

  const tamano = version * 4 + 17;
  const modulos = Array.from({ length: tamano }, () => new Array(tamano).fill(false));
  const esFuncion = Array.from({ length: tamano }, () => new Array(tamano).fill(false));

  function ponerModulo(x, y, oscuro) {
    modulos[y][x] = oscuro;
    esFuncion[y][x] = true;
  }

  function dibujarBuscador(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < tamano && y >= 0 && y < tamano) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          ponerModulo(x, y, d !== 2 && d !== 4);
        }
      }
    }
  }

  function dibujarAlineacion(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        ponerModulo(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function dibujarInfoFormato(mascara) {
    const bitsNivel = nivel === "L" ? 1 : 0; // L = 01, M = 00
    const data = (bitsNivel << 3) | mascara;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bitsF = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => (bitsF >>> i) & 1;
    for (let i = 0; i <= 5; i++) ponerModulo(8, i, bit(i));
    ponerModulo(8, 7, bit(6));
    ponerModulo(8, 8, bit(7));
    ponerModulo(7, 8, bit(8));
    for (let i = 9; i < 15; i++) ponerModulo(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) ponerModulo(tamano - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) ponerModulo(8, tamano - 15 + i, bit(i));
    ponerModulo(8, tamano - 8, true); // módulo oscuro fijo
  }

  function dibujarInfoVersion() {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bitsV = (version << 12) | rem;
    const bit = (i) => (bitsV >>> i) & 1;
    for (let i = 0; i < 18; i++) {
      const a = tamano - 11 + (i % 3);
      const b = Math.floor(i / 3);
      ponerModulo(a, b, bit(i));
      ponerModulo(b, a, bit(i));
    }
  }

  // Patrones fijos
  for (let i = 0; i < tamano; i++) {
    ponerModulo(6, i, i % 2 === 0); // patrón de sincronización vertical
    ponerModulo(i, 6, i % 2 === 0); // horizontal
  }
  dibujarBuscador(3, 3);
  dibujarBuscador(tamano - 4, 3);
  dibujarBuscador(3, tamano - 4);
  const posiciones = ALINEAMIENTO[version];
  for (let i = 0; i < posiciones.length; i++) {
    for (let j = 0; j < posiciones.length; j++) {
      const esEsquina =
        (i === 0 && j === 0) ||
        (i === 0 && j === posiciones.length - 1) ||
        (i === posiciones.length - 1 && j === 0);
      if (!esEsquina) dibujarAlineacion(posiciones[i], posiciones[j]);
    }
  }
  dibujarInfoFormato(0); // provisorio; se redibuja con la máscara final
  dibujarInfoVersion();

  // Datos entrelazados, en zigzag evitando módulos de función
  const todos = entrelazar(codewords, version);
  let idxBit = 0;
  const totalBits = todos.length * 8;
  for (let derecha = tamano - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let vert = 0; vert < tamano; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const haciaArriba = ((derecha + 1) & 2) === 0;
        const y = haciaArriba ? tamano - 1 - vert : vert;
        if (!esFuncion[y][x] && idxBit < totalBits) {
          modulos[y][x] = ((todos[idxBit >>> 3] >>> (7 - (idxBit & 7))) & 1) !== 0;
          idxBit++;
        }
      }
    }
  }

  // Máscara: probar las 8 y quedarse con la de menor penalización.
  function aplicarMascara(m) {
    for (let y = 0; y < tamano; y++) {
      for (let x = 0; x < tamano; x++) {
        if (esFuncion[y][x]) continue;
        let condicion;
        switch (m) {
          case 0: condicion = (x + y) % 2 === 0; break;
          case 1: condicion = y % 2 === 0; break;
          case 2: condicion = x % 3 === 0; break;
          case 3: condicion = (x + y) % 3 === 0; break;
          case 4: condicion = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: condicion = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: condicion = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: condicion = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        modulos[y][x] = modulos[y][x] !== condicion; // XOR
      }
    }
  }

  function penalizacion() {
    let total = 0;
    const linea = (obtener) => {
      let previa = null;
      let largo = 0;
      const cerrar = () => {
        if (previa !== null && largo >= 5) total += 3 + (largo - 5);
      };
      for (let i = 0; i < tamano; i++) {
        const c = obtener(i);
        if (c === previa) largo++;
        else {
          cerrar();
          previa = c;
          largo = 1;
        }
      }
      cerrar();
    };
    // Regla 1: filas y columnas con tramos largos del mismo color
    for (let y = 0; y < tamano; y++) linea((i) => modulos[y][i]);
    for (let x = 0; x < tamano; x++) linea((i) => modulos[i][x]);
    // Regla 2: bloques 2x2 iguales
    for (let y = 1; y < tamano; y++) {
      for (let x = 1; x < tamano; x++) {
        const c = modulos[y][x];
        if (c === modulos[y][x - 1] && c === modulos[y - 1][x] && c === modulos[y - 1][x - 1]) {
          total += 3;
        }
      }
    }
    // Regla 3: patrones parecidos a los buscadores
    const patrones = ["00001011101", "10111010000"];
    const buscar = (obtener) => {
      const s = [];
      for (let i = 0; i < tamano; i++) s.push(obtener(i) ? "1" : "0");
      const textoLinea = "0000" + s.join("") + "0000";
      for (const p of patrones) {
        let at = textoLinea.indexOf(p);
        while (at !== -1) {
          total += 40;
          at = textoLinea.indexOf(p, at + 1);
        }
      }
    };
    for (let y = 0; y < tamano; y++) buscar((i) => modulos[y][i]);
    for (let x = 0; x < tamano; x++) buscar((i) => modulos[i][x]);
    // Regla 4: proporción de módulos oscuros cerca del 50 %
    let oscuros = 0;
    for (const fila of modulos) for (const c of fila) if (c) oscuros++;
    const celdas = tamano * tamano;
    total += Math.floor(Math.abs(oscuros * 20 - celdas * 10) / celdas) * 10;
    return total;
  }

  let mejorMascara = 0;
  if (typeof forzarMascara === "number") {
    mejorMascara = forzarMascara;
    aplicarMascara(mejorMascara);
    dibujarInfoFormato(mejorMascara);
  } else {
    let menorPenalizacion = Infinity;
    for (let m = 0; m < 8; m++) {
      aplicarMascara(m);
      dibujarInfoFormato(m);
      const p = penalizacion();
      if (p < menorPenalizacion) {
        menorPenalizacion = p;
        mejorMascara = m;
      }
      aplicarMascara(m); // revertir (XOR)
    }
    aplicarMascara(mejorMascara);
    dibujarInfoFormato(mejorMascara);
  }

  return modulos;
}

function renderConsola(matriz) {
  const silencio = 4; // margen blanco alrededor
  const n = matriz.length + silencio * 2;
  const lineas = [];
  lineas.push("");
  for (let y = 0; y < n; y++) {
    let linea = "";
    for (let x = 0; x < n; x++) {
      const oscura =
        y >= silencio &&
        x >= silencio &&
        y < n - silencio &&
        x < n - silencio &&
        matriz[y - silencio][x - silencio];
      linea += oscura ? "\u2588\u2588" : "  ";
    }
    lineas.push(linea);
  }
  lineas.push("");
  return lineas.join("\n");
}

/* ------------------------------------------------------------------ */
/* Verificación rápida de que el servidor está arriba                  */
/* ------------------------------------------------------------------ */

function puertoAbierto(puerto) {
  return new Promise((resuelve) => {
    const socket = net.connect(puerto, "127.0.0.1", () => {
      socket.destroy();
      resuelve(true);
    });
    socket.on("error", () => resuelve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resuelve(false);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Programa principal                                                  */
/* ------------------------------------------------------------------ */

async function principal() {
  console.log("======================================================");
  console.log("  Insuco LabControl \u2014 abrir la web desde el celular");
  console.log("======================================================\n");

  if (!(await puertoAbierto(PUERTO))) {
    console.log("  ATENCION: el servidor no responde en el puerto " + PUERTO + ".");
    console.log("  Ejecuta antes 'Abrir LabControl.bat' y vuelve a intentar.\n");
  }

  const ips = ipsLocales();
  if (ips.length === 0) {
    console.log("  No se encontró ninguna conexión de red (Wi-Fi o cable).");
    console.log("  Conecta esta PC a la misma red que el celular y reintenta.");
    process.exitCode = 1;
    return;
  }

  const url = `http://${ips[0].direccion}:${PUERTO}${RUTA_INICIO}`;

  console.log("  Escanea este c\u00f3digo QR con la c\u00e1mara del celular:\n");
  console.log(renderConsola(matrizQR(url, "M")));
  console.log(`  ${url}`);
  const alternativas =
    ips.length > 1
      ? ` (alternativas: ${ips.slice(1).map((i) => `${i.direccion} [${i.nombre}]`).join(", ")})`
      : "";
  console.log(`  Interfaz de red: ${ips[0].nombre}${alternativas}`);
  console.log(`
  Consejos:
   - El celular debe estar en la MISMA red Wi-Fi que esta PC.
   - Si no abre, permite Node.js en el Firewall de Windows cuando lo pregunte.
   - Tambi\u00e9n puedes escribir la direcci\u00f3n a mano en el navegador del celular.`);
}

if (require.main === module) {
  principal().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = { matrizQR };
