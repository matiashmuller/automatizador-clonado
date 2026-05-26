import * as fs from "fs";
import * as path from "path";
import { checkbox, confirm, input } from "@inquirer/prompts";
import { Alumno } from "../types";
import { getAlumnoState } from "../services/stateManager";
import { getPaths } from "../services/fileManager";

export async function publishIssuesFlow(matcheados: Alumno[]): Promise<void> {
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

  for (const alumno of seleccionados) {
    console.log(
      `- ${alumno.nombre} (@${alumno.usuario["Usuario Github Registrado"]})`,
    );
  }

  console.log("\n✅ Simulación finalizada.\n");

  await input({
    message: "Presioná Enter para volver...",
  });
}
