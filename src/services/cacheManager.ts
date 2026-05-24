import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { Alumno } from '../types';

const CACHE_FILE = path.join(process.cwd(), '.cache_datos.json');

// Obtiene la fecha exacta de última modificación de los 3 CSV
function getArchivosMtime() {
  try {
    return {
      faltas: fs.statSync(config.PATHS.FALTAS).mtimeMs,
      presentes: fs.statSync(config.PATHS.PRESENTES).mtimeMs,
      usuarios: fs.statSync(config.PATHS.USUARIOS).mtimeMs,
    };
  } catch (e) {
    // Si algún archivo no existe aún, devolvemos null
    return null;
  }
}

export function loadCache(): { matcheados: Alumno[], repoMap: Map<string, string> } | null {
  if (!fs.existsSync(CACHE_FILE)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const currentMtimes = getArchivosMtime();

    if (!currentMtimes) return null;

    // Comparamos si algún CSV fue modificado después de crear el caché
    if (
      currentMtimes.faltas !== data.mtimes.faltas ||
      currentMtimes.presentes !== data.mtimes.presentes ||
      currentMtimes.usuarios !== data.mtimes.usuarios
    ) {
      return null; // El caché es viejo, hay que reescanear
    }

    // Reconstruimos el Map de repositorios
    const repoMap = new Map<string, string>(Object.entries(data.repoMap));
    return { matcheados: data.matcheados as Alumno[], repoMap };
  } catch (e) {
    return null; // Si hay error parseando, forzamos reescaneo
  }
}

export function saveCache(matcheados: Alumno[], repoMap: Map<string, string>) {
  const currentMtimes = getArchivosMtime();
  if (!currentMtimes) return;

  const data = {
    mtimes: currentMtimes,
    matcheados,
    repoMap: Object.fromEntries(repoMap), // Convertimos el Map a un objeto para el JSON
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}