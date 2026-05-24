import * as fs from 'fs';
import * as path from 'path';
import { RegistroCorreccion, EstadoCorreccion, Alumno } from '../types';

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