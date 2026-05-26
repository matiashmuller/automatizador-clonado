import * as fs from "fs";
import * as path from "path";

import { checkbox, confirm, input } from "@inquirer/prompts";

import { Alumno, RepoData } from "../types";

import { getAlumnoState, updateAlumnoState } from "../services/stateManager";

import { getPaths } from "../services/fileManager";

import { createIssue } from "../services/gitService";

import { config } from "../config";

export async function publishIssuesFlow(
  matcheados: Alumno[],
  repoMap: Map<string, RepoData>,
): Promise<void> {
  console.clear();

  const archivados = matcheados.filter((a) => {
    if (getAlumnoState(a.dni) !== "ARCHIVADO") {
      return false;
    }

    const { comisionFolder } = getPaths(a);

    const feedbackPath = path.join(
      process.cwd(),
      "historial_correcciones",
      comisionFolder,
      `${a.dni}_${a.nombre}_feedback.md`,
    );

    return fs.existsSync(feedbackPath);
  });

  if (archivados.length === 0) {
    console.log("\nℹ️  No hay entregas archivadas para publicar.\n");

    await input({
      message: "Presioná Enter para volver...",
    });

    return;
  }

  const seleccionados = await checkbox({
    message: "Seleccioná las devoluciones a publicar como issue:",

    choices: archivados.map((alumno) => ({
      name: `📦 ${alumno.nombre} (@${alumno.usuario["Usuario Github Registrado"]})`,
      value: alumno,
    })),
  });

  if (seleccionados.length === 0) {
    console.log("\nℹ️  No seleccionaste ninguna devolución.\n");

    await input({
      message: "Presioná Enter para volver...",
    });

    return;
  }

  const confirmar = await confirm({
    message: `Esto publicará ${seleccionados.length} issue(s) en GitHub. ¿Continuar?`,
  });

  if (!confirmar) {
    console.log("\n❌ Operación cancelada.\n");

    return;
  }

  console.log("\n📨 Publicando issues...\n");

  let publicados = 0;
  let fallidos = 0;

  for (const alumno of seleccionados) {
    const githubUser =
      alumno.usuario["Usuario Github Registrado"].toLowerCase();

    const repoData = repoMap.get(githubUser);

    if (!repoData) {
      console.log(`❌ Repo no encontrado para ${alumno.nombre}`);

      fallidos++;

      continue;
    }

    const { comisionFolder } = getPaths(alumno);

    const feedbackPath = path.join(
      process.cwd(),
      "historial_correcciones",
      comisionFolder,
      `${alumno.dni}_${alumno.nombre}_feedback.md`,
    );

    if (!fs.existsSync(feedbackPath)) {
      console.log(`❌ feedback.md inexistente para ${alumno.nombre}`);

      fallidos++;

      continue;
    }

    const feedbackMd = fs.readFileSync(feedbackPath, "utf-8");

    const feedbackContent = `@${githubUser}\n\n${feedbackMd.trim()}`;

    const ok = await createIssue(
      repoData,
      `${config.ISSUE_TITLE}`,
      feedbackContent,
    );

    if (!ok) {
      console.log(`❌ Error publicando issue para ${alumno.nombre}`);

      fallidos++;

      continue;
    }

    updateAlumnoState(alumno, "PUBLICADO");

    console.log(`✅ Issue publicado para ${alumno.nombre}`);

    publicados++;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Publicados correctamente: ${publicados}`);
  console.log(`❌ Fallidos: ${fallidos}`);
  console.log(`${"=".repeat(60)}\n`);

  await input({
    message: "Presioná Enter para volver...",
  });
}
