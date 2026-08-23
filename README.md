# LabControl Liceo

Sitio web para el control y supervisión de los 5 laboratorios de computación del liceo, con inicio de sesión, roles de profesor y acceso diferenciado a la información técnica. Proyecto de la asignatura *Diseño y Aplicaciones Web*.

## Objetivo

Que los profesores de la carrera de Programación (y, con menos permisos, el resto de profesores) puedan consultar y administrar los laboratorios desde un solo sistema: disponibilidad, mapa, equipos, reportes y usuarios — simple de usar y adaptable a cualquier dispositivo.

## Roles y permisos

Todo profesor con cuenta puede ver el estado y la disponibilidad de los laboratorios, cambiar su estado y agendar reservas de uso.

Los profesores de **Programación** (y el Administrador) pueden además ver la información técnica completa de los equipos, usar el control remoto y generar reportes. Los profesores de otras áreas solo ven información superficial.

Solo el **Administrador** puede gestionar usuarios y acceder a la configuración avanzada del sitio.

## Estructura del proyecto

```
Website/
│
├── Base/
│   ├── login.html            # Inicio de sesión de profesores y administradores
│   ├── index.html            # Dashboard principal con resumen general del sistema
│   └── style.css             # Estilos globales compartidos por todo el sitio
│
├── Config/
│   ├── app.js                # Funciones generales, navegación y control de interfaz
│   ├── data.js               # Datos simulados (laboratorios, equipos, usuarios, reservas)
│   └── configuracion.html    # Configuración personal y ajustes avanzados del sistema
│
├── Info/
│   ├── laboratorios.html     # Información detallada de cada laboratorio
│   ├── disponibilidad.html   # Estado actual de las salas y gestión de reservas
│   ├── equipos.html          # Inventario de computadores y dispositivos
│   └── reportes.html         # Estadísticas, uso, fallas e historial de actividad
│
├── Shift/
│   ├── mapa.html             # Mapa interactivo del establecimiento con ubicación de laboratorios
│   └── usuarios.html         # Gestión de usuarios, roles y permisos de acceso
│
└── Assets/
    ├── img/                  # Imágenes utilizadas en el sistema
    ├── icons/                # Iconos para menús y tarjetas
    ├── logos/                # Logotipos institucionales
    └── svg/                  # Recursos SVG para el mapa interactivo y gráficos
```

## Próximos pasos sugeridos

1. Reemplazar las funciones `cargar*()` de `data.js` por `fetch()` a una API real (Node/Express + base de datos).
2. Hashear contraseñas y mover la autenticación a un backend real (hoy es solo demostrativa, en el cliente).
3. Subir fotos reales de cada laboratorio.
4. Conectar el control remoto a un agente real instalado en cada equipo (hoy solo registra el comando en un log simulado).
5. Evaluar la app móvil (etapa 2 del proyecto), reutilizando `data.js` como capa de datos.
