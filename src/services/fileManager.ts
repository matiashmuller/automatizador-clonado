import * as fs from "fs";
import * as path from "path";
import { config } from "../config"; // Importamos el objeto config centralizado
import { Alumno } from "../types";
import { cloneRepo } from "./gitService";

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, "g"), v),
    template,
  );
}

export function scaffoldFolder(alumno: Alumno, cloneUrl: string | undefined) {
  // La estructura ahora es: OUTPUT_DIR / Comision / DNI - Nombre
  const comisionFolder = alumno.usuario.Comision || "Sin_Comision";
  const folderName = `${alumno.dni} - ${alumno.nombre}`;
  const folderPath = path.join(config.OUTPUT_DIR, comisionFolder, folderName);

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
    const repoName = `${config.PARCIAL_PREFIX}-${alumno.usuario["Usuario Github Registrado"]}`;
    const repoDir = path.join(folderPath, repoName);
    
    if (config.DRY_RUN) {
      console.log(`  📦 [dry-run] Clonaría: ${repoName} en ${comisionFolder}`);
    } else if (!fs.existsSync(repoDir)) {
      process.stdout.write(`  📦 Clonando ${repoName}...`);
      console.log(cloneRepo(cloneUrl, repoDir) ? " ✅" : " ❌");
    } else {
      console.log(`  ⏭️  Ya existe: ${repoName}`);
    }
  } else {
    console.log(`  ⚠️  Sin repo encontrado para ${alumno.nombre}`);
  }
}