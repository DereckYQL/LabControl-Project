/* migraciones.js — herramienta de esquema de la base de datos.
 *
 *   node scripts/migraciones.js estado
 *       Muestra qué migraciones constan como aplicadas y cuáles faltan.
 *
 *   node scripts/migraciones.js rollback <objetivo> [--forzar]
 *       Deshace las migraciones aplicadas por encima de <objetivo> (0 = todas).
 *       Antes de tocar nada hace una copia de seguridad .prev-de-rollback de la
 *       base, y se detiene en la primera migración irreversible informando de
 *       cuál es, en lugar de dejar el esquema a medias.
 *
 *   node scripts/migraciones.js semillar
 *       Vuelve a aplicar la semilla de datos de ejemplo. Es idempotente: solo
 *       completa lo que falta, nunca pisa lo que ya existe.
 *
 *   node scripts/migraciones.js podar
 *       Recorta las tablas que crecen sin límite (auditoría, notificaciones,
 *       sesiones, solicitudes y enlaces de reseteo).
 *
 * Las migraciones pendientes se aplican solas al arrancar el servidor; este
 * script existe para poder inspeccionarlas y deshacerlas.
 */

import fs from "node:fs";
import path from "node:path";
import { db, DB_PATH, DB_DIR, estadoMigraciones, revertirMigraciones, aplicarSemilla, podarTablas, MIGRACIONES } from "../db.js";

const [, , comando = "estado", ...resto] = process.argv;
const banderas = new Set(resto.filter((a) => a.startsWith("--")));
const posicionales = resto.filter((a) => !a.startsWith("--"));

function salir(mensaje, codigo = 0) {
  if (mensaje) console.log(mensaje);
  try { db.close(); } catch { /* ya cerrada */ }
  process.exit(codigo);
}

switch (comando) {
  case "estado": {
    const estado = estadoMigraciones();
    console.log(`\n  Base de datos: ${DB_PATH}`);
    console.log(`  Migraciones aplicadas: ${estado.aplicadas.join(", ") || "ninguna"}`);
    console.log(`  Migraciones faltantes: ${estado.faltantes.join(", ") || "ninguna"}`);
    console.log(`  Conocidas por este programa: 2 a ${estado.ultimaConocida}`);
    if (estado.masNueva) {
      console.log("\n  ATENCIÓN: la base es de una versión de esquema más nueva que este programa.");
    }
    if (estado.desconocidas.length) {
      console.log(`  Este programa no conoce las migraciones: ${estado.desconocidas.join(", ")}.`);
    }
    for (const m of MIGRACIONES) {
      const aplicada = estado.aplicadas.includes(m.version);
      const reversible = Boolean(m.revertir) && m.reversible !== false;
      const marca = aplicada ? "aplicada" : "pendiente";
      const vuelta = reversible ? "reversible" : "irreversible";
      console.log(`   ${String(m.version).padStart(2)}  ${marca.padEnd(9)} ${vuelta.padEnd(11)} ${m.nombre}`);
      if (!reversible && m.nota) console.log(`        └─ ${m.nota}`);
    }
    const semilla = db.prepare("SELECT version, aplicada_en FROM seed_history ORDER BY version DESC LIMIT 1").get();
    console.log(`\n  Semilla de datos de ejemplo: ${semilla ? `v${semilla.version} (${semilla.aplicada_en})` : "sin registro"}`);
    console.log("\n  Nota: abrir la base ya aplicó las migraciones que faltaban, igual que al arrancar el servidor.");
    salir("");
  }

  case "rollback": {
    const objetivo = Number(posicionales[0] ?? 0);
    if (!Number.isInteger(objetivo) || objetivo < 0) {
      salir("Uso: node scripts/migraciones.js rollback <objetivo> [--forzar]\n  <objetivo> es la versión de esquema a la que se quiere volver (0 = deshacer todas).", 1);
    }
    const forzar = banderas.has("--forzar");

    // Copia de seguridad previa: revertir migraciones puede eliminar tablas.
    const respaldo = path.join(DB_DIR, "labcontrol.db.prev-de-rollback");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    fs.copyFileSync(DB_PATH, respaldo);
    console.log(`\n  Copia de seguridad previa: ${respaldo}`);

    try {
      const revertidas = await revertirMigraciones(db, objetivo, { forzar });
      console.log(revertidas.length
        ? `\n  Migraciones revertidas: ${revertidas.join(", ")}.`
        : "\n  No había nada que revertir.");
      if (revertidas.length) {
        console.log("  El próximo arranque las volverá a aplicar. Si lo que quieres es quedarte en esta");
        console.log("  versión del esquema, no arranques el servidor: restaura la copia previa.");
      }
      salir("");
    } catch (err) {
      console.error(`\n  No se revirtió nada: ${err.message}`);
      console.error(`  La base quedó como estaba; la copia previa está en ${respaldo}.`);
      salir(null, 1);
    }
  }

  case "semillar": {
    const resumen = await aplicarSemilla();
    console.log(`\n  Semilla v${resumen.version} aplicada: ${resumen.labs} laboratorios, ${resumen.equipos} equipos, ${resumen.usuarios} usuarios, ${resumen.agenda} reservas, ${resumen.reportes} reportes y ${resumen.completados} fichas completadas.`);
    salir("");
  }

  case "podar": {
    const podadas = podarTablas();
    salir(podadas
      ? `\n  Registros eliminados: ${Object.entries(podadas).map(([k, v]) => `${k}=${v}`).join(", ")}.`
      : "\n  No había registros antiguos que recortar.");
  }

  default:
    salir(
      `  Uso: node scripts/migraciones.js <comando>\n` +
      "    estado                    migraciones aplicadas y faltantes\n" +
      "    rollback <objetivo>       deshace las migraciones sobre <objetivo> (0 = todas)\n" +
      "    semillar                  reaplica la semilla de ejemplo (idempotente)\n" +
      "    podar                     recorta las tablas que crecen sin cota\n",
      1
    );
}
