# LabControl Liceo

Sitio web para el control y supervisión de los 5 laboratorios de computación del liceo, con inicio de sesión, roles de profesor, acceso diferenciado a la información técnica y una **base de datos real (SQLite)** en el backend. Proyecto de la asignatura *Diseño y Aplicaciones Web*.

## Objetivo

Que los profesores de la carrera de Programación (y, con menos permisos, el resto de profesores) puedan consultar y administrar los laboratorios desde un solo sistema: disponibilidad, mapa, equipos, reportes y usuarios — simple de usar y adaptable a cualquier dispositivo.

## Roles y permisos

Todo profesor con cuenta puede ver el estado y la disponibilidad de los laboratorios, cambiar su estado y agendar reservas de uso.

Los profesores de **Programación** (y el Administrador) pueden además ver la información técnica completa de los equipos, usar el control remoto y generar reportes. Los profesores de otras áreas solo ven información superficial.

Solo el **Administrador** puede gestionar usuarios y acceder a la configuración avanzada del sitio.

## Cambios

> **v3.5** — **Registro de cuentas, recuperación de contraseña e inicio con Google en el login**:
> > - **Login como en la vida real**: bajo el botón "Ingresar" ahora hay dos enlaces pequeños — *¿Olvidaste tu contraseña?* y *Crear cuenta* — y, debajo, un divisor con el botón **Continuar con Google**. El texto legal del registro está adaptado al estilo Roblox (Términos de uso, Política de privacidad y consentimiento de menores), y ambos documentos se muestran en un modal accesible directamente desde el formulario.
> > - **Crear cuenta (funcional)**: formulario con nombre, apellido, usuario, correo, área y especialidad. La cuenta se crea al instante con rol *otra área* y nivel de acceso básico, ya puede iniciar sesión, rechaza usuarios o correos duplicados (409) y notifica a los administradores con el nuevo aviso *"Nuevos usuarios registrados"* (*Configuración → Notificaciones*). El mismo comportamiento está replicado en modo demo y verificado con tests de API.
> > - **Recuperar contraseña (base lista)**: la solicitud siempre responde lo mismo, sin revelar si el correo existe. Si la cuenta existe, se genera un enlace con token de 30 minutos (tabla `contrasena_resets`), se revocan todas sus sesiones y el evento queda en la auditoría. El enlace llega por correo vía **Resend** cuando existe `RESEND_API_KEY`; sin esa clave se imprime en la consola del servidor para probar el flujo en desarrollo (ver *Correo de recuperación* más abajo). Incluye límite de peticiones (5/hora por IP y correo).
> > - **Google**: el botón "Continuar con Google" queda visible en el login y explica en la propia interfaz que requiere conectar un cliente OAuth de Google en el backend (ver *Inicio con Google*), por lo que todavía no permite autenticar.
> > - **Verificación completa en v3.5**: lint 0 errores, typecheck OK, sintaxis OK y suite backend 38/38.

> **v3.4** — **Verificación en dos pasos (2FA), auditoría de actividad, respaldos, y mejoras de reportes y disponibilidad**:
> > - **Verificación en dos pasos (2FA) para el administrador**: al iniciar sesión se solicita un código TOTP de 6 dígitos desde la aplicación de autenticación (Google Authenticator, Aegis, etc.). El administrador activa/desactiva la 2FA desde *Configuración → Seguridad* con un código QR; mientras está activa, cada inicio de sesión exige el código de su aplicación. Queda fuera del alcance de la contraseña única y verificado con pruebas de backend y e2e.
> > - **Auditoría de actividad**: los eventos importantes (inicios de sesión, cierres, cambios de contraseña, laboratorios, usuarios, reservas, configuración y solicitudes) se registran con fecha, usuario, acción, detalle y dirección IP. El panel *Configuración → Auditoría* (solo admin) permite buscar y filtrar por rango de fechas (hasta 200 registros visibles).
> > - **Respaldos de la base de datos**: *Configuración → Respaldos* (solo admin) permite descargar una copia completa de la base de datos (`.db`) y restaurar un respaldo subiendo un archivo. Restaurar reemplaza la base actual, cierra todas las demás sesiones y fuerza un cierre de sesión; la descarga y restauración también quedan registradas en la auditoría.
> > - **Exportar reportes a CSV**: cada reporte abreto en *Reportes* incluye el botón "Exportar CSV" (descarga el reporte en formato de valores separados por comas, compatible con Excel — UTF-8 con BOM).
> > - **Calendario semanal de reservas**: *Disponibilidad* agrega una vista de cuadrícula por días de la semana y laboratorio, con navegación a semanas anteriores/siguientes, la semana actual resaltada y chips de reserva que pueden cancelarse con un clic.
> > - **PWA completa**: `manifest.webmanifest` e iconos 192/512 recién generados del logo; `theme-color`, `apple-touch-icon` y `canonical` en las 9 páginas; `robots.txt` permite indexar. El Service Worker precachea el manifest y los iconos nuevos.
> > - **Verificación completa en v3.4**: lint 0 errores, typecheck OK, sintaxis OK, suite backend 35/35 y e2e 20/20.

> **v3.3** — **Accesibilidad (P3) y migración del frontend a ES Modules (P4)**:
> > - **Accesibilidad completa (prioridad P3)**: enlace "Saltar al contenido" al inicio de sesión y en las 9 páginas, foco gestionado con `tabindex="-1"` en el contenido principal, foco atrapado en los modales y restaurado al cerrar, interruptores (switch) operables con teclado (espacio/enter), formularios con atributos `required`/`minlength` correctos y contraste de `.login-hint code` corregido en el tema claro. Acreditado con 3 pruebas e2e nuevas de accesibilidad (teclado, foco y skip-nav).
> > - **Frontend migrado a ES Modules (prioridad P4)**: `data.js`, `app.js` y los 9 scripts de página usan `import`/`export` reales (módulos, `type="module"`), eliminando la dependencia implícita del orden de carga y los globales; `theme.js` y `lucide.min.js` siguen como scripts clásicos para evitar el flash de tema. El Service Worker precachea las rutas de módulos (con y sin versión) y la degradación sin conexión se verificó recargando el módulo desde la caché.
> > - **Bug corregido**: `restablecerConfiguración` en Configuración fallaba porque `CONFIG_DEFAULT` no estaba definido en el frontend; ahora se define espejando el seed del backend (antes habría lanzado un error en tiempo de ejecución).
> > - **Verificación completa en v3.3**: lint 0 errores, typecheck OK, suite backend 30/30 y e2e 15/15 incluyendo los nuevos tests de accesibilidad.

> **v3.2** — **Sesiones seguras con refresh tokens y estabilidad general**:
> > - **Renovación automática de sesión (refresh tokens)**: al expirar el token de acceso (2 h), la aplicación renueva la sesión sola mediante un token de larga duración (30 días) con **rotación**: cada renovación invalida el token anterior, reutilizar un token ya usado es rechazado, y cerrar sesión o cambiar la contraseña revocan todos los tokens al instante. Verificado con una prueba e2e real que expira el token mientras se usa la web y confirma que la sesión se mantiene.
> > - **Peticiones resilientes**: la renovación es single-flight (las peticiones paralelas comparten un único refresco) y las peticiones que fallaron por token vencido se reintentan automáticamente.
> > - **Errores siempre visibles**: se agregó recuperación de errores con aviso en el mapa de laboratorios y en el formulario de inicio de sesión; la aplicación ya no falla en silencio en ninguna página.
> > - **Descarga sin conexión (offline) verificada**: el Service Worker precachea el 100 % de los archivos estáticos (páginas, estilos, scripts e imágenes); acreditado con prueba e2e que sirve la interfaz y los assets desde la caché sin conexión y, si la API no responde, muestra un aviso en lugar de quedarse en blanco.
> > - **Prioridades P1 y P2 completadas**: autenticación robusta (bcrypt + JWT con token de acceso y refresco), autorización verificada en el servidor, saneamiento con express-validator, helmet, CORS restrictivo, límites de peticiones, contraseñas nunca expuestas, tabs con varios grupos, gráficos sin división por cero y manejo de errores con interfaz — todo cubierto por pruebas (jest 30/30 y e2e 12/12).

> **v3.1** — **Corrección de vulnerabilidades**:
> > - **CSP estricto (sin `unsafe-inline`)**: los scripts inline y los manejadores `onclick` de todas las páginas se migraron a archivos `.js` externos con eventos delegados, y ahora la política `script-src 'self'` bloquea cualquier ejecución de JavaScript inyectado. Verificado con una prueba e2e que inyecta un script malicioso y confirma que no se ejecuta.
> > - **Respuestas de la API sin caché**: `Cache-Control: no-store` en todas las rutas `/api` para que el navegador no almacene datos sensibles (usuario, correo, configuraciones).
> > - **Protección contra prototype pollution**: el guardado de configuración ignora claves peligrosas (`__proto__`, `constructor`, `prototype`) al fusionar el JSON recibido.
> > - **Fuerza bruta por cuenta**: el límite de intentos de inicio de sesión ahora se aplica por IP **y por usuario**, bloqueando el ataque aunque las IP roten.
> > - **Más cabeceras de seguridad**: `Referrer-Policy: same-origin` y `Permissions-Policy` (sin cámara, micrófono, geolocalización, pagos ni USB).
> > - **Servidor estático endurecido**: se deniegan los archivos ocultos (`dotfiles: deny`) y se explicita el index; el manejo de errores nunca revela trazas internas.
> > - **Auditoría `npm audit` limpia** (0 vulnerabilidades) en `website/config` y `website/backend` re-verificada en esta versión.

> **v3.0** — **Solicitudes administrativas y correcciones**:
> > - **Botón "Editar" y "Desactivar" de usuarios arreglado**: antes no respondían al clic; ahora abren el modal precargado (edición con ID bloqueado y contraseña opcional) y la desactivación pide confirmación y evita que un administrador se dé de baja a sí mismo.
> > - **Cambio de especialidad mediante solicitud administrativa**: los profesores ya no modifican su especialidad directamente; envían una solicitud que el administrador aprueba o rechaza desde el panel de notificaciones ("Revisar solicitud"), con alerta activada por defecto.
> > - **Área solo administrable por el Administrador**: el campo "Área / Departamento" dejó de ser editable por el propio profesor; la API rechaza el intento (403) y la interfaz lo muestra deshabilitado con sugerencias.
> > - **Revisión de seguridad**: auditoría `npm audit` limpia (0 vulnerabilidades) en el frontend y el backend, validación de todos los datos renders con escapes HTML, prepared statements en SQLite y el endurecimiento previo (helmet/CSP, rate limiting, bcrypt, JWT con clave aleatoria) verificado e intacto. El perfil de los profesores no expone hash de contraseña en ninguna respuesta.
> > - **Pruebas ampliadas**: se agregaron tests del flujo completo de solicitudes (crear → notificar → aprobar/rechazar → aplicar) y de la edición de un usuario existente; e2e con base de datos temporal por corrida.

> **v2.9** — **Corrección de errores y endurecimiento de seguridad**:
> > - **XSS almacenado eliminado**: todos los datos de usuario se escapan al renderizar (notificaciones, reportes, laboratorios, equipos, usuarios y agenda). Los títulos de reportes, motivos de reserva y nombres ya no pueden inyectar HTML ni JavaScript.
> > - **Adjuntos validados de verdad**: allowlist de tipos MIME (PNG/JPEG/GIF/WebP/PDF/DOC/DOCX/TXT/CSV/ZIP/RAR), máximo 6 MB por archivo y 10 archivos, con contenido verificado como data-URL base64 válido.
> > - **Botón "Control" de equipos corregido**: antes lanzaba un error (`PC01 is not defined`) e impedía abrir el panel remoto; ahora usa delegación de eventos e identificadores seguros.
> > - **Configuración 100% operativa**: "Guardar cambios" persiste todos los paneles (perfil, sitio, red, laboratorios, equipos, notificaciones y seguridad) y "Restablecer a valores de fábrica" restaura la configuración real. Los totales de laboratorios/equipos del panel Sistema se calculan en vivo.
> > - **Perfil editable por cualquier profesor**: cada usuario puede actualizar su nombre, apellido, correo, área y especialidad (antes solo el administrador; las demás cuentas recibían 403).
> > - **Permisos coherentes**: cualquier profesor puede cambiar el estado de un laboratorio (Disponible / Ocupado / Mantención), tal como mostraban la interfaz y el README. La API además redacta la información técnica (hardware, IP/MAC) para cuentas no técnicas.
> > - **Reservas con validación completa**: laboratorio existente, fecha no pasada ni más allá de la anticipación máxima, horas con formato `HH:MM` y fin posterior al inicio, y detección de solapamientos.
> > - **IDs y correos saneados**: los IDs de usuario solo aceptan letras, números y guion bajo; los ids de reportes/reservas venidos del cliente se validan, y el correo institucional debe ser único.
> > - **Endurecimiento de seguridad**: CSP habilitado, CORS bloqueado a orígenes externos por defecto, `JWT_SECRET` aleatorio si no está definido en el entorno, y límites de peticiones en todas las rutas de escritura.
> > - **Temas corregidos**: solo existen "Claro" y "Oscuro" (los valores Azul/Verde/legados se migran a Claro) y se agrega tamaño de texto accesible (Normal/Grande) aplicado en todo el sitio.
> > - **Sugerencias en el login**: la pantalla de inicio muestra las cuentas de demostración con un clic para rellenarlas automáticamente.

> **v2.8** — **Ajustes de notificaciones y botones**:
> > - **Panel de notificaciones sobre todo y translúcido**: el recuadro ya no queda debajo de otros elementos y ahora es semi-transparente con desenfoque del fondo. Se corrigió la causa real: el sidebar no apilaba sobre el contenido (que conserva un contexto por la animación `page-in`), ahora tiene `z-index: 90` por debajo de modales y toasts.
> > - **Botón de ayuda (?) más grande**: el símbolo de interrogación ahora llena mejor el círculo del botón (26px), venciendo la regla genérica `.btn svg.lucide` que lo reducía a 15px. El botón pasó a ser un círculo de exactamente 26px, del mismo tamaño que el símbolo y centrado.
> > - **Iconos de botones corregidos en todos los botones**: se eliminó la regla genérica `.btn svg.lucide { width:15px }` que encogía cada símbolo dentro de un `.btn` (Encender/Apagar/Reiniciar en equipos, Imprimir/Editar/Eliminar en reportes, etc.); ahora cada icono usa su tamaño real (base 20px).
> > - **Botones 100% clicables**: se corrigió que los iconos de lucide interceptaran el clic y se re-renderizaran en bucle; ahora toda la superficie de los botones de ayuda, notificaciones y cerrar sesión responde al clic.
> > - **Título más pegado al logo**: el nombre de LabControl en el sidebar sube más hacia el logo.
> > - **Espaciado y color del botón de ayuda**: en Configuración el botón de ayuda queda un poco más separado de "Guardar cambios" y usa el mismo color de fondo/borde que el recuadro del usuario de la barra lateral. El símbolo de interrogación es gris claro.
> > - *Hotfix*: la versión visible sigue siendo `v2.8`; el cache busting pasa por `?v=2.8.1`–`?v=2.8.4` (y la caché del service worker a `labcontrol-v2.8.1`–`...4`) para que los arreglos lleguen a PC y celular.

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
├── Abrir LabControl.bat              Acceso directo: inicia el servidor y abre la web
├── Abrir LabControl en el celular.bat Inicia el servidor y muestra el QR para el celular
├── .github/workflows/                CI y despliegue automático a GitHub Pages
└── website/
    ├── public/                        Sitio servido (local y GitHub Pages)
    │   ├── login.html                 Inicio de sesión
    │   ├── index.html                 Dashboard: resumen, estado en tiempo real, distribución de equipos
    │   ├── laboratorios.html          Listado + detalle de laboratorio (tabs: general/hardware/servicios/agenda)
    │   ├── disponibilidad.html        Estado actual + agenda de reservas (cambiar estado, agendar uso)
    │   ├── mapa.html                  Mapa 2D interactivo del establecimiento (SVG)
    │   ├── equipos.html               Inventario de equipos, con control remoto para Programación/Admin
    │   ├── reportes.html              Reportes de uso, disponibilidad, fallas e inventario
    │   ├── usuarios.html              Profesores, área, especialidad y nivel de acceso
    │   ├── configuracion.html         Configuración personal + configuración avanzada (solo Admin)
    │   ├── style.css                  Estilos compartidos
    │   ├── app.js                     Sidebar dinámico por rol + funciones de render reutilizadas
    │   ├── data.js                    Cliente de la API (fetch) — reemplaza al antiguo array hardcodeado
    │   ├── theme.js · configuracion.js · datos-demo.js · lucide.min.js · service-worker.js
    │   └── img/                       Logo e imágenes del sitio
    ├── config/                        Tooling y scripts auxiliares (package.json, eslint, playwright)
    │   ├── package.json               Scripts de calidad y e2e (npm test/lint/typecheck/check)
    │   ├── package-lock.json
    │   ├── eslint.config.mjs          Reglas ESLint del repositorio
    │   ├── playwright.config.mjs      Configuración de los tests e2e
    │   ├── e2e/                       Tests e2e de Playwright (smoke)
    │   └── celular.js                 Muestra el código QR para abrir la web desde el celular
    └── backend/                       Servidor + base de datos
        ├── server.js                  API REST (Express) — también sirve el sitio de public/
        ├── db.js                      Conexión SQLite + creación de tablas + datos de ejemplo
        ├── package.json
        └── database/
            └── labcontrol.db          (se crea solo la primera vez que se ejecuta el servidor)
```

## Correo de recuperación (Resend) e inicio con Google

### Activar el correo de recuperación (base construida en v3.5)

El backend ya resuelve todo el flujo: genera el token, lo guarda 30 minutos en `contrasena_resets`, revoca las sesiones y registra en auditoría. Solo falta el proveedor de correo:

1. Crea una cuenta en [Resend](https://resend.com), verifica un dominio (o usa el dominio `onboarding@resend.dev` de prueba) y genera una API Key.
2. Define la variable de entorno al iniciar el servidor:
   ```
   RESEND_API_KEY=re_xxxx___   RESEND_FROM="LabControl <noresponder@liceo.cl>"
   ```
   (`RESEND_FROM` es opcional; por defecto usa `LabControl <onboarding@resend.dev>`.)
3. Reinicia el servidor. Desde ese momento el formulario *¿Olvidaste tu contraseña?* envía un correo con el enlace `…/login.html?reset=<token>`. Sin la clave, el enlace se imprime en la consola del servidor (útil para desarrollo).

### Activar el inicio con Google (pendiente de implementar)

El botón del login está listo en la interfaz, pero la autenticación OAuth aún no está conectada. Para implementarla:

1. En [Google Cloud Console](https://console.cloud.google.com), crea un proyecto y un **OAuth Client** de tipo *Web application* con URI de redirección, p. ej. `http://localhost:3000/api/auth/google/callback`.
2. Define `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en el backend e instala el paquete OAuth (p. ej. `google-auth-library`).
3. Agrega en `server.js` (o un router aparte) dos rutas públicas:
   - `GET /api/auth/google` → redirige a la pantalla de consentimiento de Google.
   - `GET /api/auth/google/callback` → intercambia el código, verifica el `id_token`/perfil, busca o crea el usuario (con `email` de dominio institucional), firma la sesión igual que `/api/login` y redirige a `index.html`.
4. En `login.js`, conecta el botón `#btn-google` a esa ruta (hoy solo muestra el aviso). Se recomienda crear la cuenta con dominio `@liceo.cl` para distinguir cuentas institucionales de personales.

## Próximos pasos sugeridos

1. ~~Seguridad: hashear las contraseñas y mover la sesión a JWT~~ **(v2.2 completado)**.
2. Subir fotos reales de cada laboratorio.
3. Conectar el control remoto a un agente real instalado en cada equipo (hoy solo registra el comando en un log simulado, no se guarda en la base de datos).
4. ~~Agregar un `backend/database/schema.sql` versionado en control de código~~ **(v2.6: sustituido por el sistema de migraciones sobre `schema_migrations` en `db.js`)**.
5. Evaluar la app móvil (etapa 2 del proyecto), consumiendo la misma API REST.
6. ~~Eliminar scripts inline de los HTML y migrar a módulos ES~~ **(v2.6: backend migrado a ES Modules y extraídos `theme.js` y `configuracion.js`; aún restan scripts inline por página como deuda documentada)**.
7. ~~Agregar tests automatizados (Jest para backend, Playwright para frontend)~~ **(v2.6 completado)**.
8. Implementar refresh tokens para sesiones de larga duración.
