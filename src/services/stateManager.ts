import * as fs from 'fs';
import * as path from 'path';
import { RegistroCorreccion, EstadoCorreccion, Alumno } from '../types';
import { getPaths } from './fileManager';

const STATE_FILE    = path.join(process.cwd(), '.estado_correcciones.json');
const HISTORIAL_DIR = path.join(process.cwd(), 'historial_correcciones');

// ─────────────────────────────────────────────
// Estado en disco
// ─────────────────────────────────────────────

export function loadState(): Record<string, RegistroCorreccion> {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveState(state: Record<string, RegistroCorreccion>) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function updateAlumnoState(alumno: Alumno, estado: EstadoCorreccion) {
  const state = loadState();
  const dni   = alumno.dni;

  if (!state[dni]) {
    state[dni] = {
      dni:    alumno.dni,
      nombre: alumno.nombre,
      github: alumno.usuario['Usuario Github Registrado'],
      estado,
    };
  } else {
    state[dni].estado = estado;
  }

  if (estado === 'EN_CORRECCION') state[dni].fechaClonado   = new Date().toISOString();
  if (estado === 'ARCHIVADO')     state[dni].fechaArchivado = new Date().toISOString();

  saveState(state);
}

export function getAlumnoState(dni: string): EstadoCorreccion {
  const state = loadState();
  return state[dni]?.estado || 'PENDIENTE';
}

// ─────────────────────────────────────────────
// Historial de correcciones
// ─────────────────────────────────────────────

/** Devuelve la ruta esperada del .md en historial_correcciones para un alumno. */
export function getHistorialMdPath(alumno: Alumno): string {
  const { comisionFolder } = getPaths(alumno);
  return path.join(
    HISTORIAL_DIR,
    comisionFolder,
    `${alumno.dni}_${alumno.nombre}_feedback.md`
  );
}

/**
 * Elimina el feedback.md de historial_correcciones si existe.
 * Debe llamarse cuando se revierte un alumno de ARCHIVADO → EN_CORRECCION,
 * para que no quede como "ya corregido" en la próxima ronda de envío de issues.
 * @returns true si el archivo existía y fue eliminado.
 */
export function deleteHistorialMd(alumno: Alumno): boolean {
  const mdPath = getHistorialMdPath(alumno);
  if (fs.existsSync(mdPath)) {
    try {
      fs.unlinkSync(mdPath);
      // Si la carpeta comisión quedó vacía, la limpiamos también
      const dir = path.dirname(mdPath);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// Sincronización con el sistema de archivos
// ─────────────────────────────────────────────

export function syncStateWithFileSystem(matcheados: Alumno[]) {
  let sincronizadosEnProceso  = 0;
  let sincronizadosCorregidos = 0;
  let sincronizadosArchivados = 0;
  let devueltosAPendiente     = 0;
  let reabiertosDeArchivado   = 0; // ← NUEVO: ARCHIVADO→EN_CORRECCION con limpieza del .md

  for (const alumno of matcheados) {
    const { folderPath } = getPaths(alumno);
    const estadoActual   = getAlumnoState(alumno.dni);

    if (fs.existsSync(folderPath)) {
      // ── La carpeta existe en disco ──
      const feedbackPath = path.join(folderPath, 'feedback.md');
      let nuevoEstado: EstadoCorreccion = estadoActual;

      if (fs.existsSync(feedbackPath)) {
        const contenido  = fs.readFileSync(feedbackPath, 'utf-8');
        const notaMatch  = contenido.match(/##\s*Nota:\s*([^\s]+)/i);

        if (notaMatch && notaMatch[1]) {
          nuevoEstado = 'CORREGIDO';
        } else if (estadoActual === 'PENDIENTE' || estadoActual === 'ARCHIVADO') {
          nuevoEstado = 'EN_CORRECCION';
        }
      } else if (estadoActual === 'PENDIENTE' || estadoActual === 'ARCHIVADO') {
        nuevoEstado = 'EN_CORRECCION';
      }

      if (estadoActual !== nuevoEstado) {
        // Si venía de ARCHIVADO y se reabre, eliminar el .md del historial
        // para que no aparezca en el próximo envío de issues como "ya corregido".
        if (estadoActual === 'ARCHIVADO' && nuevoEstado === 'EN_CORRECCION') {
          const eliminado = deleteHistorialMd(alumno);
          if (eliminado) reabiertosDeArchivado++;
        }

        updateAlumnoState(alumno, nuevoEstado);
        if (nuevoEstado === 'CORREGIDO')     sincronizadosCorregidos++;
        if (nuevoEstado === 'EN_CORRECCION') sincronizadosEnProceso++;
      }

    } else {
      // ── La carpeta NO existe en disco ──
      if (estadoActual === 'CORREGIDO') {
        updateAlumnoState(alumno, 'ARCHIVADO');
        sincronizadosArchivados++;
      } else if (estadoActual === 'EN_CORRECCION') {
        updateAlumnoState(alumno, 'PENDIENTE');
        devueltosAPendiente++;
      }
    }
  }

  return {
    sincronizadosEnProceso,
    sincronizadosCorregidos,
    sincronizadosArchivados,
    devueltosAPendiente,
    reabiertosDeArchivado,
  };
}