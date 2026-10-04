# LabControl Liceo

Sistema web para el control y la supervisión de los laboratorios de computación del Liceo
INSUCO. Permite consultar y administrar la disponibilidad, el inventario de equipos, el mapa
del establecimiento, las reservas de uso, los reportes y las cuentas de los profesores, con
autenticación por roles y base de datos real en el backend.

**Sitio publicado:** <https://insuco-labcontrol.pages.dev>

Proyecto de la asignatura *Diseño y Aplicaciones Web*. Lo que cambió en cada versión está en las
[releases](https://github.com/DereckYQL/LabControl-Project/releases); este README describe el
sistema, no su historial.

---

## Autores del proyecto

| Encargado | Área | Cargo |
|---|---|---|
| **Dereck Quiñonez** | Desarrollo web, técnico e informático | CTO — Chief Technology Officer |
| **Felipe Torres** | Branding, comunicación y relaciones institucionales | CMO — Chief Marketing Officer |

- **Dereck Quiñonez** se ocupa de la estrategia tecnológica: arquitectura del sitio y de la
  API, base de datos, despliegue, seguridad y rendimiento.
- **Felipe Torres** se ocupa de branding e identidad visual, publicidad y marketing, objetivos
  comerciales y la relación con el liceo y otras entidades.

---

## 1. Contenido del sistema

| Módulo | Qué permite |
|---|---|
| **Inicio de sesión** | Acceso con usuario y contraseña, renovación automática de sesión y registro de cuentas nuevas. |
| **Panel** | Resumen del estado de los laboratorios, actividad reciente y distribución de equipos. |
| **Laboratorios** | Ficha de cada laboratorio: estado, hardware, servicios disponibles y agenda de la semana. |
| **Disponibilidad** | Cambio de estado (disponible, ocupado, mantención) y reserva de horarios, con detección de solapamientos. |
| **Mapa** | Plano del establecimiento con los laboratorios marcados según su estado en vivo. |
| **Equipos** | Inventario por laboratorio con número de serie, sistema operativo y estado. El control remoto está simulado. |
| **Reportes** | Reportes de uso, disponibilidad, fallas e inventario, con adjuntos, edición, eliminación y exportación a CSV. |
| **Usuarios** | Alta, edición y baja de profesores, área, especialidad y solicitudes de cambio de especialidad. |
| **Configuración** | Perfil personal, apariencia del sitio, notificaciones, seguridad (2FA), auditoría, respaldos y configuración avanzada (solo administrador). |

La web es una **PWA**: se puede instalar en el teléfono y guarda una copia de los archivos
estáticos para trabajar sin conexión.

---

## 2. Roles y permisos

| Capacidad | Otra área | Programación | Administrador |
|---|:--:|:--:|:--:|
| Ver estado y disponibilidad de los laboratorios | Sí | Sí | Sí |
| Cambiar el estado de un laboratorio | Sí | Sí | Sí |
| Agendar y cancelar reservas propias | Sí | Sí | Sí |
| Editar los datos técnicos de un laboratorio | No | Sí | Sí |
| Ver datos técnicos del equipo (hardware, IP/MAC) | No | Sí | Sí |
| Control remoto de equipos | No | Sí | Sí |
| Consultar los reportes y exportarlos a CSV | Sí | Sí | Sí |
| Crear, editar y eliminar reportes propios | Sí | Sí | Sí |
| Editar o eliminar reportes de otros | No | No | Sí |
| Crear cuentas y editar las de otros | No | No | Sí |
| Auditoría, respaldos y verificación en dos pasos | No | No | Sí |

Editar el perfil propio está disponible para todos; cambiar el rol, el área, el estado de la
cuenta o la contraseña de otra persona es solo del administrador.

La información técnica se **redacta en el servidor**: una cuenta no técnica nunca la recibe,
aunque la interfaz la pida.

---

## 3. Arquitectura

El frontend es estático (HTML, CSS y JavaScript con módulos ES, sin compilación) y el backend
es una API REST sobre Express con SQLite.

### En producción

```
navegador
   │  HTTPS, mismo origen
   ▼
Cloudflare Pages ──── archivos estáticos (website/public)
   │
   └── /api/* ──► Pages Function (functions/api/[[path]].js) ──► API en Railway
                                                            │
                                                            └── SQLite en volumen
```

El frontend llama siempre a `api/...` por ruta relativa, así que no necesita saber dónde vive
el backend: una **Pages Function** reenvía `/api/*` al servicio real. El navegador nunca
habla directo con el backend, no hay que abrir CORS y la política de seguridad de la interfaz
no cambia.

El backend no puede vivir en el mismo hosting que la web porque usa `node:sqlite`, escribe
la base en disco y crea respaldos: necesita un proceso Node con sistema de archivos.

### En local (un solo proceso)

El mismo Express que expone la API también entrega el sitio estático, de modo que todo
funciona en una sola URL, sin proxy:

```
Express (website/backend/server.js)
   ├── /api/*      API REST + SQLite
   └── /*          sitio de website/public
```

Si el hosting no copia `public/` junto a `backend/`, se indica la ruta con `LC_PUBLIC_DIR`.

---

## 4. Estructura del proyecto

```
.
├── Abrir LabControl.bat                Inicia el servidor y abre el sitio en el navegador
├── Abrir LabControl en el celular.bat   Inicia el servidor y muestra un QR para el celular
├── .github/workflows/
│   ├── ci.yml                          Calidad y pruebas (backend, lint, tipos, interfaz)
│   └── deploy-cloudflare.yml           Publicación de la web + redespliegue de la API
├── functions/api/[[path]].js           Pages Function que reenvía /api/* al backend
├── website/
│   ├── public/                         Sitio publicado (web estática)
│   │   ├── login.html                  Inicio de sesión y registro
│   │   ├── index.html                  Panel
│   │   ├── laboratorios.html           Laboratorios y su ficha
│   │   ├── disponibilidad.html         Estado y agenda de reservas
│   │   ├── mapa.html                   Mapa del establecimiento
│   │   ├── equipos.html                Inventario de equipos
│   │   ├── reportes.html               Reportes
│   │   ├── usuarios.html               Usuarios
│   │   ├── configuracion.html          Configuración
│   │   ├── _headers                    Cabeceras de seguridad del hosting estático
│   │   ├── _redirects                  Sirve cada página con 200, sin redirecciones
│   │   ├── 404.html                    Página de error
│   │   ├── robots.txt                  Instrucciones para buscadores
│   │   ├── style.css                   Estilos compartidos
│   │   ├── app.js                      Navegación por rol y funciones de render
│   │   ├── data.js                     Cliente de la API
│   │   ├── service-worker.js           Caché y funcionamiento sin conexión
│   │   └── manifest.webmanifest        Datos de la PWA
│   ├── backend/                        API y base de datos
│   │   ├── server.js                   API REST (Express)
│   │   ├── db.js                       Esquema, migraciones, semilla y respaldo
│   │   ├── totp.mjs                    Códigos TOTP de la verificación en dos pasos
│   │   ├── tests/                      Pruebas de backend (Jest + Supertest)
│   │   └── scripts/                    Utilidades de línea de comandos
│   └── config/                         Calidad, pruebas de interfaz y utilidades
└── PENDIENTES.txt                      Pendientes y limitaciones conocidas
```

---

## 5. Requisitos

- **Node.js 22.5 o superior** (el backend usa el módulo `node:sqlite`, incorporado en Node).
- Un navegador moderno. Para el celular, acceso a la red local o un código QR.

---

## 6. Puesta en marcha local

```bash
cd website/backend
npm install
npm start
```

El sitio queda en <http://localhost:3000>. La base de datos se crea sola la primera vez, con
el esquema y los datos de ejemplo.

También sirve `npm run dev` para recargar el servidor al guardar cambios, y en Windows los
scripts `Abrir LabControl.bat` y `Abrir LabControl en el celular.bat` del raíz.

Para levantar solo la interfaz estática, sin backend, alcanza con servir `website/public`
con cualquier servidor de archivos; en ese caso el sitio funciona con los datos de ejemplo
y no se pueden guardar cambios.

---

## 7. Seguridad

- **Contraseñas** con hash bcrypt, mínimo de 8 caracteres en todos los caminos y nunca
  devueltas por la API.
- **Sesiones** con JWT: token de acceso de 2 horas y token de refresco de 30 días con
  rotación; reutilizar un token ya usado se rechaza, y cerrar sesión o cambiar la contraseña
  revoca todos los tokens.
- **Verificación en dos pasos (TOTP)** para el administrador, con clave QR y ventana de
  5 minutos.
- **Límites de peticiones** en el inicio de sesión, el registro, la recuperación y las rutas
  de escritura. El límite de sesión combina IP y usuario, así que dos profesores no se
  bloquean entre sí.
- **Validación de entrada** con `express-validator` en todas las rutas de escritura, y
  consultas preparadas en SQLite.
- **Cabeceras de seguridad** con `helmet`: CSP sin `unsafe-inline`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` y `Cache-Control: no-store` en la API. El sitio
  publicado replica la misma política en `website/public/_headers`; si se cambia en un lado,
  hay que cambiarla en el otro.
- **Escape de HTML** en todas las vistas y fechas validadas con formato estricto.
- **Adjuntos** de reportes con lista blanca de tipos, máximo 5 MB por archivo y 10 por
  reporte.
- **Auditoría** de los eventos relevantes con fecha, usuario, acción, detalle y dirección de
  origen, consultable desde *Configuración → Auditoría*.

---

## 8. Calidad y pruebas

Los comandos se ejecutan desde `website/config`:

```bash
npm test          # pruebas de backend (Jest + Supertest)
npm run test:e2e  # pruebas de interfaz (Playwright)
npm run lint      # ESLint
npm run typecheck # TypeScript en modo comprobación
npm run check     # sintaxis de todos los .js
```

GitHub Actions corre lo mismo en cada `push` a `master`: el flujo de calidad tiene un trabajo
para el backend (pruebas, lint y tipos) y otro para las pruebas de interfaz.

---

## 9. Publicación

Hay **un solo despliegue**, disparado por `push` a `master` desde
`.github/workflows/deploy-cloudflare.yml`:

1. Publica `website/public` en Cloudflare Pages.
2. Le pide a Railway que redespliegue la API por su API GraphQL y espera a que el despliegue
   quede en `SUCCESS`.
3. Comprueba que las nueve páginas respondan `200`, que `robots.txt` y el `404` existan y que
   `/api/salud` devuelva la misma versión que la web.

Si alguna comprobación falla, el flujo queda en rojo.

Configuración del repositorio, una sola vez:

```
gh secret set CLOUDFLARE_API_TOKEN          # token con permiso Account > Cloudflare Pages: Edit
gh secret set RAILWAY_API_TOKEN             # token de railway.app/account/tokens
gh variable set RAILWAY_PROJECT_ID          # identificadores del servicio, desde la URL del panel
gh variable set RAILWAY_SERVICE_ID
gh variable set RAILWAY_ENVIRONMENT_ID
```

El backend se configura en el hosting con `LC_DB_DIR` apuntando al volumen, `JWT_SECRET`,
`LC_TRUST_PROXY` y `LC_PUBLIC_URL`. El chequeo de vida es `GET /api/salud`.

**Cabeceras de seguridad**: al publicarse como archivos estáticos, `helmet` deja de afectar
al frontend, por eso `website/public/_headers` replica la misma política. Es el único punto
que hay que mantener sincronizado con el backend.

---

## 10. Pendientes

Lo que falta por hacer y las limitaciones conocidas del despliegue actual están en
[PENDIENTES.txt](PENDIENTES.txt).