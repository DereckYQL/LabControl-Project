import globals from "globals";

export default [
  {
    ignores: ["**/public/lucide.min.js"]
  },
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
    files: ["website/config/e2e/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node
    }
  },
  {
    // Frontend en ES modules (import/export entre data.js, app.js y las
    // páginas). no-undef detecta referencias sin import.
    files: ["website/public/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "off"
    }
  },
  {
    files: ["website/config/celular.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node
    }
  }
];