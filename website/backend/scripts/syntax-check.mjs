import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..", "..");

const archivos = [
  "website/backend/server.js",
  "website/backend/db.js",
  "website/backend/scripts/syntax-check.mjs",
  "website/public/theme.js",
  "website/public/configuracion.js",
  "website/public/data.js",
  "website/public/app.js",
  "website/public/datos-demo.js",
  "website/public/service-worker.js",
  "website/public/lucide.min.js",
  "website/config/celular.js",
  "eslint.config.mjs",
  "playwright.config.mjs"
];

let fallos = 0;
for (const rel of archivos) {
  const abs = path.join(raiz, rel);
  if (!fs.existsSync(abs)) {
    console.error(`  [SKIP]  ${rel} (no existe)`);
    continue;
  }
  const r = spawnSync(process.execPath, ["--check", abs], { encoding: "utf8" });
  if (r.status === 0) {
    console.log(`  [OK]    ${rel}`);
  } else {
    fallos++;
    console.error(`  [FAIL]  ${rel}\n${r.stderr || r.stdout}`);
  }
}

if (fallos > 0) {
  console.error(`\n${fallos} archivo(s) con errores de sintaxis.`);
  process.exit(1);
}
console.log("\nSintaxis OK en todos los archivos de JavaScript.");