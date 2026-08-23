/* ------- LABORATORIOS ------- */
const LABORATORIOS = [
  {
    id: 1,
    nombre: "Laboratorio 1",
    sala: "Sala B-201",
    ubicacion: "Segundo piso, ala B",
    equipos: 30,
    estado: "disponible",
    so: "Windows 11",
    procesador: "Intel Core i5-10400",
    ram: "8 GB DDR4",
    almacenamiento: "512 GB SSD",
    red: "Conectado a la red interna (VLAN 10)",
    responsable: "Juan Pérez",
    responsableId: "prof_juan",
    horario: "07:30 - 18:00",
    servicios: ["Internet", "Impresora de red", "Proyector", "Pizarra digital"],
    descripcion: "Laboratorio equipado para clases de informática, programación, ofimática y navegación segura.",
    foto: "assets/lab-generico.svg",
    posicion: { x: 20, y: 60, w: 180, h: 120 }
  },
  {
    id: 2,
    nombre: "Laboratorio 2",
    sala: "Sala B-202",
    ubicacion: "Segundo piso, ala B",
    equipos: 30,
    estado: "disponible",
    so: "Windows 11",
    procesador: "Intel Core i5-10400",
    ram: "8 GB DDR4",
    almacenamiento: "512 GB SSD",
    red: "Conectado a la red interna (VLAN 10)",
    responsable: "Ana López",
    responsableId: "prof_ana",
    horario: "07:30 - 18:00",
    servicios: ["Internet", "Impresora de red", "Proyector"],
    descripcion: "Laboratorio de uso general para asignaturas de la carrera de Programación.",
    foto: "assets/lab-generico.svg",
    posicion: { x: 220, y: 60, w: 180, h: 120 }
  },
  {
    id: 3,
    nombre: "Laboratorio 3",
    sala: "Sala B-203",
    ubicacion: "Segundo piso, ala B",
    equipos: 30,
    estado: "ocupado",
    so: "Ubuntu 22.04 LTS",
    procesador: "Intel Core i5-10400",
    ram: "8 GB DDR4",
    almacenamiento: "256 GB SSD",
    red: "Conectado a la red interna (VLAN 10)",
    responsable: "Diego Rojas",
    responsableId: "prof_diego",
    horario: "08:00 - 17:00",
    servicios: ["Internet", "Proyector"],
    descripcion: "Laboratorio orientado a programación y entornos Linux.",
    foto: "assets/lab-generico.svg",
    posicion: { x: 420, y: 60, w: 180, h: 120 }
  },
  {
    id: 4,
    nombre: "Laboratorio 4",
    sala: "Sala B-205",
    ubicacion: "Segundo piso, ala B",
    equipos: 25,
    estado: "mantencion",
    so: "Windows 11",
    procesador: "Intel Core i3-10100",
    ram: "8 GB DDR4",
    almacenamiento: "256 GB SSD",
    red: "Conectado a la red interna (VLAN 10)",
    responsable: "Camila Soto",
    responsableId: "prof_camila",
    horario: "07:30 - 18:00",
    servicios: ["Internet", "Proyector"],
    descripcion: "Laboratorio de apoyo para talleres y evaluaciones prácticas.",
    foto: "assets/lab-generico.svg",
    posicion: { x: 620, y: 60, w: 150, h: 120 }
  },
  {
    id: 5,
    nombre: "Laboratorio de Redes",
    sala: "Sala B-204",
    ubicacion: "Segundo piso, ala B",
    equipos: 30,
    estado: "disponible",
    so: "Windows Server 2022",
    procesador: "Intel Core i7-10700",
    ram: "16 GB DDR4",
    almacenamiento: "1 TB SSD NVMe",
    red: "Rack de switches y patch panel propio",
    responsable: "Juan Pérez",
    responsableId: "prof_juan",
    horario: "07:30 - 18:00",
    servicios: ["Internet", "Rack de servidores", "Proyector"],
    descripcion: "Laboratorio especializado en redes: cableado estructurado, switches y servidores.",
    foto: "assets/lab-generico.svg",
    posicion: { x: 220, y: 220, w: 180, h: 120 }
  }
];

/* ------- EQUIPOS (inventario detallado por laboratorio) -------*/
const EQUIPOS = [];

// Genera equipos para cada laboratorio
LABORATORIOS.forEach((lab) => {
  for (let i = 1; i <= lab.equipos; i++) {
    EQUIPOS.push({
      id: `${lab.id}-PC${String(i).padStart(2, "0")}`,
      labId: lab.id,
      nombre: `PC-${lab.id}${String(i).padStart(2, "0")}`,
      tipo: "Desktop",
      fabricante: "HP",
      modelo: i <= 10 ? "ProDesk 400 G7" : "EliteDesk 800 G6",
      serie: `SN${lab.id}${String(1000 + i)}`,
      procesador: lab.procesador,
      ram: lab.ram,
      almacenamiento: lab.almacenamiento,
      so: lab.so,
      ip: `192.168.${10 + lab.id}.${100 + i}`,
      mac: `AA:BB:CC:${String(lab.id).padStart(2,"0")}:${String(i).padStart(2,"0")}:FF`,
      monitor: '22" Full HD',
      teclado: "USB estándar",
      mouse: "USB óptico",
      estado: i === 3 && lab.id === 4 ? "falla" : lab.estado === "mantencion" ? "mantencion" : "activo",
      ultimoEncendido: "2026-08-20 08:15",
      observaciones: i === 3 && lab.id === 4 ? "Disco duro con sectores defectuosos" : ""
    });
  }
});

/* ------- ESTADOS (para badges) ------- */
const ESTADOS = {
  disponible: { label: "Disponible", color: "var(--color-success)" },
  ocupado:    { label: "Ocupado",    color: "var(--color-danger)" },
  mantencion: { label: "Mantención", color: "var(--color-warning)" }
};

const ESTADOS_EQUIPO = {
  activo:     { label: "Activo",     clase: "badge--disponible" },
  mantencion: { label: "Mantención", clase: "badge--mantencion" },
  falla:      { label: "Falla",      clase: "badge--ocupado" },
  apagado:    { label: "Apagado",    clase: "badge--muted" }
};

/* ------- USUARIOS / PROFESORES ------- */
const USUARIOS = [
  {
    id: "admin",
    nombre: "Administrador",
    apellido: "Sistema",
    iniciales: "AD",
    email: "admin@liceo.cl",
    password: "admin123",
    rol: "admin",         // admin | programacion | otro_area
    area: "Administración",
    especialidad: "Gestión de sistemas y redes",
    nivelAcceso: "total", // total | tecnico | basico
    activo: true
  },
  {
    id: "prof_juan",
    nombre: "Juan",
    apellido: "Pérez",
    iniciales: "JP",
    email: "jperez@liceo.cl",
    password: "juan123",
    rol: "programacion",
    area: "Programación",
    especialidad: "Desarrollo Web y Redes",
    nivelAcceso: "tecnico",
    activo: true
  },
  {
    id: "prof_ana",
    nombre: "Ana",
    apellido: "López",
    iniciales: "AL",
    email: "alopez@liceo.cl",
    password: "ana123",
    rol: "programacion",
    area: "Programación",
    especialidad: "Bases de Datos y Programación",
    nivelAcceso: "tecnico",
    activo: true
  },
  {
    id: "prof_diego",
    nombre: "Diego",
    apellido: "Rojas",
    iniciales: "DR",
    email: "drojas@liceo.cl",
    password: "diego123",
    rol: "programacion",
    area: "Programación",
    especialidad: "Sistemas Operativos y Linux",
    nivelAcceso: "tecnico",
    activo: true
  },
  {
    id: "prof_camila",
    nombre: "Camila",
    apellido: "Soto",
    iniciales: "CS",
    email: "csoto@liceo.cl",
    password: "camila123",
    rol: "otro_area",
    area: "Matemáticas",
    especialidad: "Matemáticas y Estadística",
    nivelAcceso: "basico",
    activo: true
  },
  {
    id: "prof_marcos",
    nombre: "Marcos",
    apellido: "Vera",
    iniciales: "MV",
    email: "mvera@liceo.cl",
    password: "marcos123",
    rol: "otro_area",
    area: "Ciencias",
    especialidad: "Física y Química",
    nivelAcceso: "basico",
    activo: true
  },
  {
    id: "prof_lucia",
    nombre: "Lucía",
    apellido: "Fuentes",
    iniciales: "LF",
    email: "lfuentes@liceo.cl",
    password: "lucia123",
    rol: "otro_area",
    area: "Lenguaje",
    especialidad: "Lengua y Literatura",
    nivelAcceso: "basico",
    activo: true
  }
];

/* ------- AGENDA / RESERVAS ------- */
const AGENDA = [
  {
    id: "res_001",
    labId: 1,
    usuarioId: "prof_juan",
    fecha: "2026-08-25",
    horaInicio: "08:00",
    horaFin: "10:00",
    motivo: "Clase de Programación Web",
    estado: "confirmada"
  },
  {
    id: "res_002",
    labId: 2,
    usuarioId: "prof_camila",
    fecha: "2026-08-25",
    horaInicio: "10:30",
    horaFin: "12:00",
    motivo: "Taller de Estadística aplicada",
    estado: "confirmada"
  },
  {
    id: "res_003",
    labId: 3,
    usuarioId: "prof_diego",
    fecha: "2026-08-22",
    horaInicio: "08:00",
    horaFin: "12:00",
    motivo: "Clase de Sistemas Operativos Linux",
    estado: "confirmada"
  },
  {
    id: "res_004",
    labId: 1,
    usuarioId: "prof_marcos",
    fecha: "2026-08-26",
    horaInicio: "14:00",
    horaFin: "16:00",
    motivo: "Laboratorio de Física computacional",
    estado: "pendiente"
  },
  {
    id: "res_005",
    labId: 5,
    usuarioId: "prof_juan",
    fecha: "2026-08-27",
    horaInicio: "09:00",
    horaFin: "11:00",
    motivo: "Práctica de cableado estructurado",
    estado: "confirmada"
  }
];

/* ------- REPORTES ------- */
const REPORTES = [
  {
    id: "rep_001",
    tipo: "uso",
    titulo: "Uso mensual de laboratorios",
    descripcion: "Reporte de horas de uso por laboratorio en el mes de julio 2026.",
    fecha: "2026-07-31",
    generadoPor: "admin",
    datos: {
      labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab Redes"],
      valores: [72, 68, 55, 20, 80]
    }
  },
  {
    id: "rep_002",
    tipo: "fallas",
    titulo: "Registro de fallas de equipos",
    descripcion: "Equipos con fallas reportadas durante agosto 2026.",
    fecha: "2026-08-15",
    generadoPor: "prof_juan",
    datos: {
      fallas: [
        { equipo: "PC-403", lab: "Lab 4", descripcion: "Disco duro con sectores defectuosos", estado: "en reparación" },
        { equipo: "PC-105", lab: "Lab 1", descripcion: "Teclado no funciona", estado: "resuelto" },
        { equipo: "PC-312", lab: "Lab 3", descripcion: "Pantalla con líneas horizontales", estado: "pendiente" }
      ]
    }
  },
  {
    id: "rep_003",
    tipo: "disponibilidad",
    titulo: "Disponibilidad semanal",
    descripcion: "Porcentaje de disponibilidad por laboratorio — semana del 17 al 21 de agosto 2026.",
    fecha: "2026-08-21",
    generadoPor: "admin",
    datos: {
      labels: ["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab Redes"],
      valores: [85, 90, 60, 0, 95]
    }
  },
  {
    id: "rep_004",
    tipo: "inventario",
    titulo: "Inventario de equipos actualizado",
    descripcion: "Listado completo del estado de todos los equipos en los laboratorios.",
    fecha: "2026-08-20",
    generadoPor: "admin",
    datos: {
      total: 145,
      activos: 141,
      enFalla: 3,
      enMantencion: 1
    }
  }
];

/* ------- CONFIGURACIÓN ------- */
const CONFIG = {
  sitio: {
    nombreInstitucion: "Liceo Industrial",
    nombreSistema: "LabControl",
    logo: "",
    tema: "dark-sidebar",
    idioma: "es"
  },
  red: {
    subredLabs: "192.168.10.0/24",
    servidorDNS: "192.168.1.1",
    puertaEnlace: "192.168.1.254",
    wifiHabilitado: true
  },
  notificaciones: {
    emailAdmin: "admin@liceo.cl",
    alertaFallas: true,
    alertaDisponibilidad: true,
    alertaReservas: true
  },
  seguridad: {
    sesionTimeout: 30,
    intentosLoginMax: 5,
    registroActividad: true
  },
  laboratorios: {
    horaApertura: "07:30",
    horaCierre: "18:00",
    permitirReservaExterna: true,
    anticipacionMaxReserva: 7
  }
};

/* ------- FUNCIONES DE ACCESO A DATOS ------- */

function cargarLaboratorios() {
  return Promise.resolve(LABORATORIOS);
}

function obtenerLaboratorioPorId(id) {
  return LABORATORIOS.find((lab) => lab.id === Number(id));
}

function cargarEquipos(labId = null) {
  const lista = labId ? EQUIPOS.filter((e) => e.labId === Number(labId)) : EQUIPOS;
  return Promise.resolve(lista);
}

function cargarUsuarios() {
  return Promise.resolve(USUARIOS);
}

function cargarAgenda() {
  return Promise.resolve(AGENDA);
}

function cargarReportes() {
  return Promise.resolve(REPORTES);
}

function obtenerUsuarioPorId(id) {
  return USUARIOS.find((u) => u.id === id);
}

/* ------- SESIÓN (simula login en localStorage) ------- */

const AUTH = {
  /**
   * Intenta iniciar sesión. Devuelve el usuario si las credenciales son válidas.
   */
  login(username, password) {
    const usuario = USUARIOS.find(
      (u) => (u.id === username || u.email === username) && u.password === password && u.activo
    );
    if (usuario) {
      const sesion = { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, nivelAcceso: usuario.nivelAcceso };
      localStorage.setItem("lc_sesion", JSON.stringify(sesion));
      return usuario;
    }
    return null;
  },

  logout() {
    localStorage.removeItem("lc_sesion");
    window.location.href = "login.html";
  },

  /** Devuelve el objeto de sesión activo o null. */
  getSesion() {
    try {
      return JSON.parse(localStorage.getItem("lc_sesion"));
    } catch {
      return null;
    }
  },

  /** Redirige a login si no hay sesión activa. */
  requiereLogin() {
    const sesion = this.getSesion();
    if (!sesion) {
      window.location.href = "login.html";
      return null;
    }
    return sesion;
  },

  /** Verifica si el usuario actual puede ver info técnica de equipos. */
  puedeVerTecnico() {
    const s = this.getSesion();
    return s && (s.rol === "admin" || s.rol === "programacion");
  },

  /** Verifica si el usuario actual puede usar control remoto. */
  puedeControlRemoto() {
    const s = this.getSesion();
    return s && (s.rol === "admin" || s.rol === "programacion");
  },

  /** Verifica si el usuario actual es admin. */
  esAdmin() {
    const s = this.getSesion();
    return s && s.rol === "admin";
  }
};
