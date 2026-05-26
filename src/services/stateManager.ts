import * as fs from 'fs';
import * as path from 'path';
import { RegistroCorreccion, EstadoCorreccion, Alumno } from '../types';
import { getPaths } from './fileManager'; 

const STATE_FILE = path.join(process.cwd(), '.estado_correcciones.json');

// Carga el estado actual (o crea uno vacío si no existe)
export function loadState(): Record<string, RegistroCorreccion> {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

// Guarda el estado en disco
export function saveState(state: Record<string, RegistroCorreccion>) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Actualiza el estado de un alumno
export function updateAlumnoState(alumno: Alumno, estado: EstadoCorreccion) {
  const state = loadState();
  const dni = alumno.dni;
  
  if (!state[dni]) {
    state[dni] = {
      dni: alumno.dni,
      nombre: alumno.nombre,
      github: alumno.usuario["Usuario Github Registrado"],
      estado: estado,
    };
  } else {
    state[dni].estado = estado;
  }

  if (estado === "EN_CORRECCION") state[dni].fechaClonado = new Date().toISOString();
  if (estado === "ARCHIVADO") state[dni].fechaArchivado = new Date().toISOString();

  saveState(state);
}

// Devuelve el estado actual de un alumno (por defecto PENDIENTE)
export function getAlumnoState(dni: string): EstadoCorreccion {
  const state = loadState();
  return state[dni]?.estado || "PENDIENTE";
}

// Sincroniza el JSON con lo que realmente hay en el disco
export function syncStateWithFileSystem(matcheados: Alumno[]) {
  let sincronizadosEnProceso = 0;
  let sincronizadosCorregidos = 0;
  let sincronizadosArchivados = 0;
  let devueltosAPendiente = 0; // <- Nuevo contador para el caso que mencionás

  for (const alumno of matcheados) {
    const { folderPath } = getPaths(alumno);
    const estadoActual = getAlumnoState(alumno.dni); 

    if (fs.existsSync(folderPath)) {
      const feedbackPath = path.join(folderPath, 'feedback.md');
      let nuevoEstado: EstadoCorreccion = estadoActual;

      if (fs.existsSync(feedbackPath)) {
        const contenido = fs.readFileSync(feedbackPath, 'utf-8');
        const notaMatch = contenido.match(/##\s*Nota:\s*([^\s]+)/i);
        
        if (notaMatch && notaMatch[1]) {
          nuevoEstado = "CORREGIDO";
        } else if (estadoActual === "PENDIENTE" || estadoActual === "ARCHIVADO") {
          // Si existe la carpeta pero estaba pendiente o archivado por error, pasa a estar activo
          nuevoEstado = "EN_CORRECCION";
        }
      } else if (estadoActual === "PENDIENTE" || estadoActual === "ARCHIVADO") {
        nuevoEstado = "EN_CORRECCION";
      }

      if (estadoActual !== nuevoEstado) {
        updateAlumnoState(alumno, nuevoEstado);
        if (nuevoEstado === "CORREGIDO") sincronizadosCorregidos++;
        if (nuevoEstado === "EN_CORRECCION") sincronizadosEnProceso++;
      }
    } else {
      // --- TU NUEVA LÓGICA AQUÍ ---
      // Si la carpeta NO existe físicamente:
      
      if (estadoActual === "CORREGIDO") {
        // Solo pasa a ARCHIVADO si previamente ya se había detectado como CORREGIDO (con nota)
        updateAlumnoState(alumno, "ARCHIVADO");
        sincronizadosArchivados++;
      } else if (estadoActual === "EN_CORRECCION") {
        // Si estaba a mitad de camino ("EN_CORRECCION") y la borraste,
        // vuelve a "PENDIENTE" para que puedas re-clonarlo sin problemas.
        updateAlumnoState(alumno, "PENDIENTE");
        devueltosAPendiente++;
      }
    }
  }

  return { 
    sincronizadosEnProceso, 
    sincronizadosCorregidos, 
    sincronizadosArchivados, 
    devueltosAPendiente 
  };
}