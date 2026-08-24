# LabControl Liceo

Sitio web para el control y supervisión de los 5 laboratorios de computación del liceo, con inicio de sesión, roles de profesor, acceso diferenciado a la información técnica y una **base de datos real (SQLite)** en el backend. Proyecto de la asignatura *Diseño y Aplicaciones Web*.

Link web: https://dereckyql.github.io/Insuco-LabControl/login.html

## Objetivo

Que los profesores de la carrera de Programación (y, con menos permisos, el resto de profesores) puedan consultar y administrar los laboratorios desde un solo sistema: disponibilidad, mapa, equipos, reportes y usuarios — simple de usar y adaptable a cualquier dispositivo.

## Roles y permisos

Todo profesor con cuenta puede ver el estado y la disponibilidad de los laboratorios, cambiar su estado y agendar reservas de uso.

Los profesores de **Programación** (y el Administrador) pueden además ver la información técnica completa de los equipos, usar el control remoto y generar reportes. Los profesores de otras áreas solo ven información superficial.

Solo el **Administrador** puede gestionar usuarios y acceder a la configuración avanzada del sitio.

## Cambios

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

1. **Seguridad**: hashear las contraseñas (ej. `bcrypt`) y mover la sesión a cookies firmadas o JWT en vez de guardar todo en `localStorage`. Hoy, por simplicidad de demostración, la contraseña viaja igual que en la versión anterior (sin hash).
2. Subir fotos reales de cada laboratorio.
3. Conectar el control remoto a un agente real instalado en cada equipo (hoy solo registra el comando en un log simulado, no se guarda en la base de datos).
4. Agregar un `backend/database/schema.sql` versionado en control de código si se quiere llevar historial de migraciones.
5. Evaluar la app móvil (etapa 2 del proyecto), consumiendo la misma API REST.
