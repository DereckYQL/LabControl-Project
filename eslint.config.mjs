import globals from "globals";

export default [
  {
    files: ["**/*.{js,mjs}"],
    rules: {
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-cond-assign": "error",
      "no-extra-bind": "error",
      "no-unreachable": "error",
      "no-unexpected-multiline": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }]
    }
  },
  {
    files: ["website/backend/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node
    }
  },
  {
    files: ["website/backend/tests/**/*.js"],
    languageOptions: {
      globals: { ...globals.jest }
    }
  },
  {
    files: ["e2e/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node
    }
  },
  {
    // Los JS del frontend son scripts clásicos compartidos entre archivos
    // (app.js usa variables definidas en data.js, etc.). Por eso no
    // activamos no-undef: las referencias cruzadas no son errores aquí,
    // solo se controlan reglas que no dependen del orden de carga.
    files: ["website/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...globals.serviceworker }
    },
    rules: {
      // Las funciones se comparten entre archivos y se usan además desde
      // handlers inline (onclick="...") generados en plantillas de texto,
      // por lo que no-unused-vars produce falsos positivos aquí.
      "no-unused-vars": "off"
    }
  },
  {
    files: ["celular.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node
    }
  }
];