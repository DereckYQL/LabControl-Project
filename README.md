# LabControl Liceo

Sitio web para el control y supervisión de los 5 laboratorios de computación del liceo, con inicio de sesión, roles de profesor, acceso diferenciado a la información técnica y una **base de datos real (SQLite)** en el backend. Proyecto de la asignatura *Diseño y Aplicaciones Web*.

## Objetivo

Que los profesores de la carrera de Programación (y, con menos permisos, el resto de profesores) puedan consultar y administrar los laboratorios desde un solo sistema: disponibilidad, mapa, equipos, reportes y usuarios — simple de usar y adaptable a cualquier dispositivo.

## Roles y permisos

Todo profesor con cuenta puede ver el estado y la disponibilidad de los laboratorios, cambiar su estado y agendar reservas de uso.

Los profesores de **Programación** (y el Administrador) pueden además ver la información técnica completa de los equipos, usar el control remoto y generar reportes. Los profesores de otras áreas solo ven información superficial.

Solo el **Administrador** puede gestionar usuarios y acceder a la configuración avanzada del sitio.

## Cambios

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
4. Agregar un `backend/database/schema.sql` versionado en control de código si se quiere llevar historial de migraciones.
5. Evaluar la app móvil (etapa 2 del proyecto), consumiendo la misma API REST.
6. Eliminar scripts inline de los HTML y migrar a módulos ES (mejora CSP y mantenibilidad).
7. Agregar tests automatizados (Jest para backend, Playwright para frontend).
8. Implementar refresh tokens para sesiones de larga duración.
