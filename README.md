# LabControl Liceo

Sitio web para el control y supervisión de los 5 laboratorios de computación del liceo, con inicio de sesión, roles de profesor, acceso diferenciado a la información técnica y una **base de datos real (SQLite)** en el backend. Proyecto de la asignatura *Diseño y Aplicaciones Web*.

## Objetivo

Que los profesores de la carrera de Programación (y, con menos permisos, el resto de profesores) puedan consultar y administrar los laboratorios desde un solo sistema: disponibilidad, mapa, equipos, reportes y usuarios — simple de usar y adaptable a cualquier dispositivo.

## Roles y permisos

Todo profesor con cuenta puede ver el estado y la disponibilidad de los laboratorios, cambiar su estado y agendar reservas de uso.

Los profesores de **Programación** (y el Administrador) pueden además ver la información técnica completa de los equipos, usar el control remoto y generar reportes. Los profesores de otras áreas solo ven información superficial.

Solo el **Administrador** puede gestionar usuarios y acceder a la configuración avanzada del sitio.

## Cambios

> **v2.8** — **Ajustes de notificaciones y botones**:
> > - **Panel de notificaciones sobre todo y translúcido**: el recuadro ya no queda debajo de otros elementos y ahora es semi-transparente con desenfoque del fondo. Se corrigió la causa real: el sidebar no apilaba sobre el contenido (que conserva un contexto por la animación `page-in`), ahora tiene `z-index: 90` por debajo de modales y toasts.
> > - **Botón de ayuda (?) más grande**: el símbolo de interrogación ahora llena mejor el círculo del botón (26px), venciendo la regla genérica `.btn svg.lucide` que lo reducía a 15px. El botón pasó a ser un círculo de exactamente 26px, del mismo tamaño que el símbolo y centrado.
> > - **Iconos de botones corregidos en todos los botones**: se eliminó la regla genérica `.btn svg.lucide { width:15px }` que encogía cada símbolo dentro de un `.btn` (Encender/Apagar/Reiniciar en equipos, Imprimir/Editar/Eliminar en reportes, etc.); ahora cada icono usa su tamaño real (base 20px).
> > - **Botones 100% clicables**: se corrigió que los iconos de lucide interceptaran el clic y se re-renderizaran en bucle; ahora toda la superficie de los botones de ayuda, notificaciones y cerrar sesión responde al clic.
> > - **Título más pegado al logo**: el nombre de LabControl en el sidebar sube más hacia el logo.
> > - *Hotfix*: la versión visible sigue siendo `v2.8`; el cache busting pasa por `?v=2.8.1` y `?v=2.8.2` (y la caché del service worker a `labcontrol-v2.8.1`/`labcontrol-v2.8.2`) para que los arreglos lleguen a PC y celular.

> **v2.7** — **Ventana de notificaciones y ayuda en Configuración**:
> > - **Ventana de notificaciones corregida**: el panel ya no sale recortado. En escritorio se abre hacia la derecha de la campana (antes se anclaba a la izquierda y quedaba cortado por el borde de la pantalla) y en celular se ajusta su ancho para que siempre quede completa, tirándola hacia la derecha.
> > - **Botón de ayuda (?) en Configuración**: un botón de interrogación junto a "Guardar cambios" despliega un menú con tres opciones: **Ayuda / FAQ** (preguntas frecuentes), **Términos y condiciones** y **Acerca de**.
> > - **Ayuda / FAQ y Términos y condiciones completos**: el modal muestra las preguntas frecuentes (reservas, estados, reportes, notificaciones, contraseñas) y las condiciones de uso del sistema.
> > - **Acerca de (base)**: por ahora muestra el logo, el nombre del sistema, la institución y la versión; se completará más adelante.
> > - Cache busting `?v=2.7` y caché del service worker (`labcontrol-v2.7`) para que la nueva versión cargue sin problemas en PC y celular.

> **v2.6** — **Deuda técnica (P4)**:
> > - **Backend 100% ES Modules** (`import`/`export` en `server.js` y `db.js`) y **Express 5**. La app se exporta para testing sin abrir puerto.
> > - **Migraciones de base de datos versionadas**: tabla `schema_migrations` y sistema de migraciones en `db.js` (v2: columna `adjuntos`; v3: hash bcrypt de contraseñas en texto plano). Idempotentes sobre bases existentes. Soporte `LC_DB_DIR` para tests.
> > - **Paginación en listados**: los GET de listas aceptan `?pagina=` y `?limite=` (1–100) devolviendo un sobre `{ data, total, pagina, totalPaginas, limite }`; sin parámetros siguen devolviendo el arreglo plano (compatible hacia atrás).
> > - **Scripts extraídos del HTML**: el bloque de `configuracion.html` ahora vive en `configuracion.js` y el selector de tema en `theme.js` (las 9 páginas lo usan). Cache busting unificado `?v=2.6` en toda la web. Los scripts inline restantes por página quedan como deuda documentada.
> > - **Tests automatizados**: Jest + Supertest para el backend (`npm test`, 12 pruebas: auth, paginación, migraciones, protección de `password`); Playwright e2e para el flujo real de login y configuración (`npm run test:e2e`).
> > - **Calidad y CI**: ESLint (config plana por archivo), typecheck con TypeScript (`tsc --noEmit`), revisión de sintaxis con `node --check` y workflow nuevo `.github/workflows/ci.yml` en GitHub Actions.

> **v2.5** — **Accesibilidad y UX (P3) completado**:
> > - **Toggles accesibles por teclado (final)**: la inicialización de los interruptores con `role="switch"` ahora se ejecuta de verdad — antes la función existía pero nunca se llamaba. Se activan con `Espacio`/`Enter` en `Configuración` y en cualquier página.
> > - **Mapa 2D accesible por teclado**: cada laboratorio del mapa ahora es enfocable (`tabindex="0"`), anuncia su nombre y estado (`aria-label`, `role="button"`) y responde a `Enter`/`Espacio`, con anillo de foco visible.
> > - **Tabs con roles ARIA**: las pestañas (`laboratorios`, `usuarios`) ahora usan `role="tablist"`/`tab`/`tabpanel`, `aria-selected` y navegación por teclado con flechas, `Home` y `End`.
> > - **`aria-expanded` en notificaciones**: la campana lateral indica si el panel está abierto o cerrado para lectores de pantalla.
> > - **`minlength` adicional**: límites mínimos en login (usuario y contraseña), nuevo usuario y campos de reportes/reservas que aún no lo tenían.

> **v2.4** — **Accesibilidad y UX (P3)**:
> > - **Skip-nav y ARIA**: en todas las páginas se agregó un enlace "Saltar al contenido" y roles/atributos ARIA (`role="main"`, `aria-labelledby` en modales, etc.) para mejorar la navegación con teclado y lectores de pantalla.
> > - **Toggles accesibles por teclado**: los interruptores de *Configuración* ahora son botones con `role="switch"` y `aria-checked`, operables con `Espacio`/`Enter`.
> > - **Focus trap en modales**: al abrir un modal se enfoca el primer control, `Tab`/`Shift+Tab` se mantienen dentro, `Escape` cierra y el foco vuelve al elemento que abrió el modal.
> > - **Contraste corregido**: se mejoró el color del texto y del código en las sugerencias de login (`.login-hint code`), claro y oscuro.
> > - **`prefers-reduced-motion`**: si el usuario pide menos movimiento en su sistema, se desactivan animaciones y transiciones.
> > - **SEO y metadatos**: `<meta description>`, `favicon` y Open Graph tags en todas las páginas.
> > - **Validación HTML5**: se agregaron `required`/`minlength` a los formularios de usuarios, reservas, reportes y cambio de contraseña.
> - **Mejora visual del sidebar**: se eliminó el prefijo `//` del nombre de marca y el título "LabControl" ahora es más grande y queda más pegado al logo.

> **v2.3** — **Estabilidad y Calidad (P2)**:
> > - **Tabs corregidos con múltiples grupos**: cada grupo `.tabs` ahora solo afecta a sus propios paneles (en `laboratorios` y `usuarios`), evitando que un cambio en una pestaña desactive la de otra sección.
> > - **División por cero corregida en `renderDonut`**: se filtran los laboratorios con 0 equipos antes de calcular porcentajes; con total 0 se muestra "Sin equipos". También se protege `drawBarChart`.
> > - **Se eliminó `new Function()` y la carga síncrona (`XMLHttpRequest`)** en `data.js`: el modo demo ahora carga `datos-demo.js` de forma asíncrona y dinámica (sin ejecutar código como texto ni bloquear el hilo).
> > - **Manejo de errores con UI**: todas las operaciones de carga de datos (`index`, `laboratorios`, `usuarios`, `equipos`, `disponibilidad`, `reportes`) ahora muestran un aviso visual (toast) si algo falla en lugar de fallar en silencio.
> > - **Event listeners de navegación limpios**: se evitan listeners duplicados en el sidebar y se gestiona correctamente el temporizador de notificaciones.
> > - **Selectores CSS duplicados resueltos**: se eliminaron las reglas repetidas de reportes y el `font-family` duplicado del tema oscuro.
> > - **Service Worker real con offline caching**: además de notificaciones, ahora precachea los assets estáticos y sirve la app en modo offline (network-first para páginas, cache-first para estáticos).

> **v2.2** — **Seguridad P1 — Capa de autenticación y protección completa**:
> - **JWT (JSON Web Tokens)**: la sesión ahora usa tokens firmados en el servidor. El token se almacena en `localStorage` y se envía en el header `Authorization` de cada petición. Si el token expira, el usuario es redirigido a login automáticamente.
> - **Contraseñas hasheadas con bcrypt**: todas las contraseñas se almacenan con hash bcrypt (incluidas las del seed). Las contraseñas en texto plano de versiones anteriores se hashean automáticamente al migrar.
> - **Autorización server-side**: todos los endpoints verifican el token JWT. Los endpoints de escritura (crear, editar, eliminar) requieren rol de administrador. La autorización de reportes y reservas se valida contra el ID del usuario en el token, no del cliente.
> - **Rate limiting**: 10 intentos de login cada 15 minutos; 200 peticiones generales cada 15 minutos.
> - **Headers de seguridad (helmet)**: CSP, X-Frame-Options, HSTS, X-Content-Type-Options y más.
> - **CORS configurado**: solo permite peticiones del mismo origen.
> - **Validación de entradas**: `express-validator` en todos los endpoints de escritura (usuarios, reportes, agenda).
> - **Passwords nunca expuestos**: `GET /api/usuarios` y `GET /api/usuarios/:id` ya no retornan el campo `password`.
> - **Nuevo endpoint**: `POST /api/change-password` para cambio de contraseña server-side con verificación de la contraseña actual.
> - **Modo demo actualizado**: el login en demo ahora retorna un token y el usuario. Las funciones de eliminación ya no necesitan `usuarioId` como parámetro (el servidor lo obtiene del token).
> - Se corrige `renderDonut` para manejar división por cero cuando no hay equipos.
> - Se añade función `esc()` en `app.js` para escape de HTML (prevención XSS).
> - Se corrige el tab system para que solo afecte paneles dentro de su propio grupo `.tabs`.
> - Se remueve `autocomplete="off"` del login para permitir gestores de contraseñas.
> - Se agrega `autocomplete="username"` y `autocomplete="current-password"` en los campos de login.

> **v2.0** — **Identidad visual oficial de INSUCO**: la interfaz adopta los colores
> institucionales del liceo — **amarillo** (`#ffc300` / dorado `#ff8f00`), **blanco**
> y **negro/gris oscuro** — presentes en el escudo y la web del instituto. El tema por
> defecto usa fondo blanco crema con acentos amarillos y sidebar oscuro; el tema
> **Oscuro** presenta la misma identidad en negro con acentos dorados. El tema "Azul"
> pasa a llamarse **Dorado** en el selector de apariencia.
> La tipografía también cambia a las familias del sitio del liceo: **Outfit** para
> títulos y cuerpo y **ABeeZee** como respaldo. Se corrige además un error que impedía
> crear la base de datos la primera vez (los reportes de ejemplo referenciaban al
> usuario `admin`, ya renombrado a `INSUCO`).

> **v1.9** — **Nombre del sitio en el sidebar**: la barra lateral ahora muestra el
> nombre **"Insuco LabControl"** junto al logo, con una **fuente tecnológica**
> (*Orbitron*) y un efecto de brillo neón que refuerza la identidad visual del
> sistema. Se adapta a celular manteniendo el estilo.

> **v1.8** — **Notificaciones completas en PC y celular**: la campana lateral ahora avisa
> de todo — nuevos reportes, **fallas de equipos**, **cambios de estado de los laboratorios**
> y **reservas confirmadas o canceladas** — cada tipo con su interruptor en
> *Configuración → Notificaciones* (incluido un **recordatorio 30 min antes de tu reserva**).
> Además se pueden activar las **notificaciones del sistema operativo**: llegan como avisos
> nativos tanto en el **PC** como en el **celular**, aunque la pestaña esté en segundo plano.

> **v1.7** — **Sistema de reportes renovado**: tarjetas más resumidas que despliegan el
> detalle completo al seleccionarlas, creación de reportes con **título + descripción
> obligatoria y archivos adjuntos** (imágenes, PDF y otros documentos), **edición y
> eliminación** por parte del creador (o del administrador, que controla todos) y un
> sistema de **notificaciones** con campana lateral que avisa a los demás usuarios cada
> vez que se crea, edita o elimina un reporte.

## Estructura del proyecto

```
labcontrol/
├── login.html            Inicio de sesión
├── index.html             Dashboard: resumen, estado en tiempo real, distribución de equipos
├── laboratorios.html      Listado + detalle de laboratorio (tabs: general/hardware/servicios/agenda)
├── disponibilidad.html    Estado actual + agenda de reservas (cambiar estado, agendar uso)
├── mapa.html               Mapa 2D interactivo del establecimiento (SVG)
├── equipos.html            Inventario de equipos, con control remoto para Programación/Admin
├── reportes.html           Reportes de uso, disponibilidad, fallas e inventario
├── usuarios.html           Profesores, área, especialidad y nivel de acceso
├── configuracion.html      Configuración personal + configuración avanzada (solo Admin)
├── style.css               Estilos compartidos
├── app.js                   Sidebar dinámico por rol + funciones de render reutilizadas
├── data.js                  Cliente de la API (fetch) — reemplaza al antiguo array hardcodeado
└── backend/                 Servidor + base de datos
    ├── server.js             API REST (Express) — también sirve el sitio estático
    ├── db.js                  Conexión SQLite + creación de tablas + datos de ejemplo
    ├── package.json
    └── database/
        └── labcontrol.db      (se crea solo la primera vez que se ejecuta el servidor)
```

## Próximos pasos sugeridos

1. ~~Seguridad: hashear las contraseñas y mover la sesión a JWT~~ **(v2.2 completado)**.
2. Subir fotos reales de cada laboratorio.
3. Conectar el control remoto a un agente real instalado en cada equipo (hoy solo registra el comando en un log simulado, no se guarda en la base de datos).
4. ~~Agregar un `backend/database/schema.sql` versionado en control de código~~ **(v2.6: sustituido por el sistema de migraciones sobre `schema_migrations` en `db.js`)**.
5. Evaluar la app móvil (etapa 2 del proyecto), consumiendo la misma API REST.
6. ~~Eliminar scripts inline de los HTML y migrar a módulos ES~~ **(v2.6: backend migrado a ES Modules y extraídos `theme.js` y `configuracion.js`; aún restan scripts inline por página como deuda documentada)**.
7. ~~Agregar tests automatizados (Jest para backend, Playwright para frontend)~~ **(v2.6 completado)**.
8. Implementar refresh tokens para sesiones de larga duración.
