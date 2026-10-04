/**
 * datos-demo.js
 * Datos de respaldo para cuando el sitio se publica SIN servidor propio
 * (por ejemplo, en GitHub Pages). El contenido replica la semilla de
 * backend/db.js, de modo que la versión demo se ve igual que la real.
 *
 * Solo se carga si data.js detecta que la API no está disponible.
 */

(function () {
  const LABORATORIOS = [
    {
      id: 1, nombre: "LAB COMP 1", sala: "Sala 2-7", ubicacion: "Segundo piso, ala derecha",
      equipos: 30, estado: "disponible", so: "Windows 11 Pro", procesador: "Intel Core i5-10400",
      ram: "8 GB DDR4", almacenamiento: "512 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Juan Pérez", responsableId: "prof_juan", horario: "07:30 - 18:00",
      servicios: ["Pizarra", "Proyectos"],
      descripcion: "Laboratorio de Computación 1 equipado para clases de informática, programación, ofimática y navegación segura.",
      imagenes: ["img/labs/Trasera_lab1.jpg", "img/labs/Frontal_lab1.jpg"]
    },
    {
      id: 2, nombre: "LAB COMP 2", sala: "Sala 3-8", ubicacion: "Tercer piso, ala derecha",
      equipos: 27, estado: "disponible", so: "Windows 11 Pro", procesador: "Intel Core i5-10400",
      ram: "8 GB DDR4", almacenamiento: "512 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Ana López", responsableId: "prof_ana", horario: "07:30 - 18:00",
      servicios: ["Pizarra", "Proyector"],
      descripcion: "Laboratorio de Computación 2 para asignaturas de la carrera de Programación.",
      imagenes: ["img/labs/Trasero Derecho_lab2.png", "img/labs/Frontal Derecho_lab2.png"]
    },
    {
      id: 3, nombre: "LAB CIENCIAS", sala: "Sala 3-11", ubicacion: "Tercer piso, ala derecha",
      equipos: 23, estado: "ocupado", so: "Linux Mint", procesador: "Intel Core i5-10400",
      ram: "8 GB DDR4", almacenamiento: "256 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Diego Rojas", responsableId: "prof_diego", horario: "08:00 - 17:00",
      servicios: ["Pizarra"],
      descripcion: "Laboratorio de Ciencias orientado a programación y entornos Linux.",
      imagenes: ["img/labs/Trasera_lab3.jpg", "img/labs/Frontal_lab3.jpg"]
    },
    {
      id: 4, nombre: "LAB COMP 4", sala: "Sala 3-9", ubicacion: "Tercer piso, ala derecha",
      equipos: 28, estado: "mantencion", so: "Windows 11 Pro", procesador: "Intel Core i3-10100",
      ram: "8 GB DDR4", almacenamiento: "256 GB SSD", red: "Conectado a la red interna (VLAN 10)",
      responsable: "Camila Soto", responsableId: "prof_camila", horario: "07:30 - 18:00",
      servicios: ["Pizarra"],
      descripcion: "Laboratorio de Computación 4 de apoyo para talleres y evaluaciones prácticas.",
      imagenes: ["img/labs/Trasera_lab4.jpg", "img/labs/Frontal_lab4.jpg"]
    },
    {
      id: 5, nombre: "LAB COMP 5", sala: "Sala 3-10", ubicacion: "Tercer piso, ala derecha",
      equipos: 30, estado: "disponible", so: "Linux Mint y Windows 10", procesador: "Intel Core i7-10700",
      ram: "16 GB DDR4", almacenamiento: "1 TB SSD NVMe", red: "Rack de switches y patch panel propio",
      responsable: "Juan Pérez", responsableId: "prof_juan", horario: "07:30 - 18:00",
      servicios: ["Pizarra", "Proyector"],
      descripcion: "Laboratorio de Computación 5 con doble sistema operativo (Linux Mint y Windows 10) para clases de informática, ofimática y navegación segura.",
      imagenes: ["img/labs/Trasera_lab5.jpg", "img/labs/Frontal_lab5.jpg"]
    }
  ];

  const USUARIOS = [
    { id: "INSUCO", nombre: "Administrador", apellido: "Sistema", iniciales: "AD", email: "admin@liceo.cl", password: "Insuco1336", rol: "admin", area: "Administración", especialidad: "Gestión de sistemas y redes", nivelAcceso: "total", activo: true },
    { id: "prof_juan", nombre: "Juan", apellido: "Pérez", iniciales: "JP", email: "jperez@insuco.cl", password: "juan123", rol: "programacion", area: "Programación", especialidad: "Desarrollo Web y Redes", nivelAcceso: "tecnico", activo: true },
    { id: "prof_ana", nombre: "Ana", apellido: "López", iniciales: "AL", email: "alopez@insuco.cl", password: "ana123", rol: "programacion", area: "Programación", especialidad: "Bases de Datos y Programación", nivelAcceso: "tecnico", activo: true },
    { id: "prof_diego", nombre: "Diego", apellido: "Rojas", iniciales: "DR", email: "drojas@insuco.cl", password: "diego123", rol: "programacion", area: "Programación", especialidad: "Sistemas Operativos y Linux", nivelAcceso: "tecnico", activo: true },
    { id: "prof_camila", nombre: "Camila", apellido: "Soto", iniciales: "CS", email: "csoto@insuco.cl", password: "camila123", rol: "otro_area", area: "Matemáticas", especialidad: "Matemáticas y Estadística", nivelAcceso: "basico", activo: true },
    { id: "prof_marcos", nombre: "Marcos", apellido: "Vera", iniciales: "MV", email: "mvera@insuco.cl", password: "marcos123", rol: "otro_area", area: "Ciencias", especialidad: "Física y Química", nivelAcceso: "basico", activo: true },
    { id: "prof_lucia", nombre: "Lucía", apellido: "Fuentes", iniciales: "LF", email: "lfuentes@insuco.cl", password: "lucia123", rol: "otro_area", area: "Lenguaje", especialidad: "Lengua y Literatura", nivelAcceso: "basico", activo: true }
  ];

  const AGENDA = [
    { id: "res_001", labId: 1, usuarioId: "prof_juan", fecha: "2026-08-25", horaInicio: "08:00", horaFin: "10:00", motivo: "Clase de Programación Web", estado: "confirmada" },
    { id: "res_002", labId: 2, usuarioId: "prof_camila", fecha: "2026-08-25", horaInicio: "10:30", horaFin: "12:00", motivo: "Taller de Estadística aplicada", estado: "confirmada" },
    { id: "res_003", labId: 3, usuarioId: "prof_diego", fecha: "2026-08-22", horaInicio: "08:00", horaFin: "12:00", motivo: "Clase de Sistemas Operativos Linux", estado: "confirmada" },
    { id: "res_004", labId: 1, usuarioId: "prof_marcos", fecha: "2026-08-26", horaInicio: "14:00", horaFin: "16:00", motivo: "Laboratorio de Física computacional", estado: "pendiente" },
    { id: "res_005", labId: 5, usuarioId: "prof_juan", fecha: "2026-08-27", horaInicio: "09:00", horaFin: "11:00", motivo: "Clase de ofimática y navegación segura", estado: "confirmada" }
  ];

  const REPORTES = [
    {
      id: "rep_001", tipo: "uso", titulo: "Uso mensual de laboratorios",
      descripcion: "Reporte de horas de uso por laboratorio en el mes de julio 2026.",
      fecha: "2026-07-31", generadoPor: "INSUCO",
      datos: { labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab 5"], valores: [72, 68, 55, 20, 80] }
    },
    {
      id: "rep_002", tipo: "fallas", titulo: "Registro de fallas de equipos",
      descripcion: "Equipos con fallas reportadas durante agosto 2026.",
      fecha: "2026-08-15", generadoPor: "prof_juan",
      datos: { fallas: [
        { equipo: "PC-403", lab: "Lab 4", descripcion: "Disco duro con sectores defectuosos", estado: "en reparación" },
        { equipo: "PC-105", lab: "Lab 1", descripcion: "Teclado no funciona", estado: "resuelto" },
        { equipo: "PC-312", lab: "Lab 3", descripcion: "Pantalla con líneas horizontales", estado: "pendiente" }
      ] }
    },
    {
      id: "rep_003", tipo: "disponibilidad", titulo: "Disponibilidad semanal",
      descripcion: "Porcentaje de disponibilidad por laboratorio — semana del 17 al 21 de agosto 2026.",
      fecha: "2026-08-21", generadoPor: "INSUCO",
      datos: { labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab 5"], valores: [85, 90, 60, 0, 95] }
    },
    {
      id: "rep_004", tipo: "inventario", titulo: "Inventario de equipos actualizado",
      descripcion: "Listado completo del estado de todos los equipos en los laboratorios.",
      fecha: "2026-08-20", generadoPor: "INSUCO",
      datos: { total: 138, activos: 134, enFalla: 3, enMantencion: 1 }
    }
  ];

  // Los reportes de ejemplo no traen archivos adjuntos
  for (const r of REPORTES) r.adjuntos = [];

  const CONFIG = {
    sitio: { nombreInstitucion: "Instituto Superior de Comercio", nombreSistema: "Insuco LabControl", logo: "", tema: "claro", idioma: "es" },
    red: { subredLabs: "192.168.10.0/24", servidorDNS: "192.168.1.1", puertaEnlace: "192.168.1.254", wifiHabilitado: true },
    notificaciones: { emailAdmin: "admin@liceo.cl", alertaFallas: true, alertaDisponibilidad: true, alertaReservas: true, alertaReportes: true, alertaSolicitudes: true, alertaNuevosUsuarios: true, recordatorioReserva: false },
    seguridad: { sesionTimeout: 30, intentosLoginMax: 5, registroActividad: true },
    laboratorios: { horaApertura: "07:30", horaCierre: "18:00", permitirReservaExterna: true, anticipacionMaxReserva: 7 },
    equipos: { habilitarControlRemoto: true, apagadoAutomatico: false, monitoreoTiempoReal: true, intervaloEncendido: 30 }
  };

  // Genera los mismos equipos que crea db.js en la base de datos real
  const EQUIPOS = [];
  for (const l of LABORATORIOS) {
    for (let i = 1; i <= l.equipos; i++) {
      EQUIPOS.push({
        id: `${l.id}-PC${String(i).padStart(2, "0")}`,
        labId: l.id,
        nombre: `PC-${l.id}${String(i).padStart(2, "0")}`,
        tipo: "Desktop",
        fabricante: "HP",
        modelo: i <= 10 ? "ProDesk 400 G7" : "EliteDesk 800 G6",
        serie: `SN${l.id}${String(1000 + i)}`,
        procesador: l.procesador,
        ram: l.ram,
        almacenamiento: l.almacenamiento,
        so: l.so,
        ip: `192.168.${10 + l.id}.${100 + i}`,
        mac: `AA:BB:CC:${String(l.id).padStart(2, "0")}:${String(i).padStart(2, "0")}:FF`,
        monitor: '22" Full HD',
        teclado: "USB estándar",
        mouse: "USB óptico",
        estado: i === 3 && l.id === 4 ? "falla" : l.estado === "mantencion" ? "mantencion" : "activo"
      });
    }
  }

  window.DEMO = {
    laboratorios: LABORATORIOS,
    usuarios: USUARIOS,
    agenda: AGENDA,
    reportes: REPORTES,
    notificaciones: [],
    solicitudes: [],
    config: CONFIG,
    equipos: EQUIPOS,
    contadores: { agenda: 100, reportes: 100, usuarios: 100, notificaciones: 100, solicitudes: 100 }
  };
})();
