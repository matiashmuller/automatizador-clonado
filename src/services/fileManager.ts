import * as fs from "fs";
import * as path from "path";
import { config } from "../config";
import { Alumno } from "../types";
import { cloneRepo } from "./gitService";

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, "g"), v),
    template,
  );
}

// Nueva función de ayuda para estandarizar rutas (Wollok-friendly)
export function getPaths(alumno: Alumno) {
  // Limpia "Comisión - 3" -> "comision3"
  const comisionFolder = alumno.usuario.Comision
    ? alumno.usuario.Comision.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // quita tildes
        .replace(/[^a-z0-9]/g, "")       // deja solo letras y números
    : "sincomision";

  // Limpia "LEIVAS, DIEGO" -> "LEIVAS-DIEGO"
  const sinTildes = alumno.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nombreLimpio = sinTildes
    .replace(/,\s*/g, "-")          // reemplaza coma y espacio por guion
    .replace(/\s+/g, "-")           // reemplaza espacios restantes por guion
    .replace(/[^a-zA-Z0-9\-]/g, "") // quita cualquier otro carácter raro
    .toUpperCase();

  const folderName = `${alumno.dni}_${nombreLimpio}`;
  const folderPath = path.join(config.OUTPUT_DIR, comisionFolder, folderName);
  const repoName = `${config.PARCIAL_PREFIX}-${alumno.usuario["Usuario Github Registrado"]}`;
  const repoDir = path.join(folderPath, repoName);

  return { comisionFolder, folderName, folderPath, repoName, repoDir };
}

// Función para saber si el repo ya fue descargado previamente
export function isRepoCloned(alumno: Alumno): boolean {
  const { repoDir } = getPaths(alumno);
  return fs.existsSync(repoDir);
}

export function scaffoldFolder(alumno: Alumno, cloneUrl: string | undefined) {
  const { comisionFolder, folderName, folderPath, repoName, repoDir } = getPaths(alumno);

  if (!config.DRY_RUN) {
    fs.mkdirSync(folderPath, { recursive: true });
    const template = fs.readFileSync(config.FEEDBACK_TEMPLATE, "utf-8");
    const filled = renderTemplate(template, {
      nombre: alumno.nombre,
      dni: alumno.dni,
      github: alumno.usuario["Usuario Github Registrado"],
      repo: cloneUrl ?? "No encontrado",
      comision: alumno.usuario.Comision,
    });
    fs.writeFileSync(path.join(folderPath, "feedback.md"), filled, "utf-8");
  }

  if (cloneUrl) {
    if (config.DRY_RUN) {
      console.log(`  📦 [dry-run] Clonaría: ${repoName} en ${comisionFolder}/${folderName}`);
    } else if (!fs.existsSync(repoDir)) {
      process.stdout.write(`  📦 Clonando ${repoName}...`);
      console.log(cloneRepo(cloneUrl, repoDir) ? " ✅" : " ❌");
    }
  } else {
    console.log(`  ⚠️  Sin repo encontrado para ${alumno.nombre}`);
  }
}