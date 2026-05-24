import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import {
  loadPresentes,
  loadUsuarios,
  loadFaltas,
  prompt,
} from "./utils/dataParser";
import { fetchReposForUsers } from "./services/gitService";
import { scaffoldFolder, isRepoCloned, getPaths } from "./services/fileManager";
import { Alumno, Presente, Usuario } from "./types";
import { select, checkbox, confirm } from "@inquirer/prompts";
import search from "@inquirer/search";
import { getAlumnoState, updateAlumnoState } from "./services/stateManager";

async function main() {
  if (config.DRY_RUN)
    console.log("\n🔍 MODO DRY-RUN — no se escribirá nada en disco\n");

  const presentes = loadPresentes() as Presente[];
  const usuarios = loadUsuarios() as Usuario[];
  const faltas = loadFaltas();

  console.log(`Presentes cargados: ${presentes.length}`);
  console.log(`Usuarios cargados:  ${usuarios.length}`);

  let usuariosFiltrados: Usuario[];

  if (config.ALL_COMISIONES) {
    usuariosFiltrados = usuarios;
    console.log("\n⚡ Modo --all-comisiones: sin filtro de comisión\n");
  } else {
    const input = await prompt("\nComisiones a procesar (ej: 1,3): ");
    if (!input) {
      console.error("❌ Ingresá al menos una comisión.");
      process.exit(1);
    }
    const comisiones = input.split(",").map((c) => `Comisión - ${c.trim()}`);
    usuariosFiltrados = usuarios.filter((u) => comisiones.includes(u.Comision));
  }

  const usuariosMap = new Map(
    usuariosFiltrados.map((u) => [u["DNI"].trim(), u]),
  );
  const presentesConfirmados = presentes.filter((p) => p.presente === "true");

  const matcheados: Alumno[] = [];
  const sinMatch: Presente[] = [];

  for (const p of presentesConfirmados) {
    const usuario = usuariosMap.get(p.dni.trim());
    if (!usuario) {
      sinMatch.push(p);
      continue;
    }

    const falta = faltas.get(p.dni.trim());
    if (falta?.estado === "LIBRE") {
      console.log(
        `\n  🚨 LIBRE: ${p.nombre} (DNI: ${p.dni}) está en condición LIBRE`,
      );
      const resp = await prompt("    ¿Incluir de todas formas? (s/N): ");
      if (resp.toLowerCase() !== "s") continue;
    }
    matcheados.push({ ...p, usuario });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Presentes confirmados: ${presentesConfirmados.length}`);
  console.log(`Matcheados con GitHub: ${matcheados.length}`);
  console.log(`Sin match:             ${sinMatch.length}`);
  console.log("=".repeat(60));

  if (sinMatch.length) {
    console.log("\n⚠️  Sin usuario GitHub conocido:");
    sinMatch.forEach((p) => console.log(`  - ${p.nombre} (DNI: ${p.dni})`));
  }

  if (!matcheados.length) return;

  const usernames = matcheados.map(
    (a) => a.usuario["Usuario Github Registrado"],
  );
  const repoMap = await fetchReposForUsers(usernames);

  if (!config.DRY_RUN) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });

  // === BUCLE PRINCIPAL DEL MENÚ ===
  let enMenu = true;

  while (enMenu) {
    const modoClonado = await select({
      message: "\n¿Qué acción deseás realizar?",
      choices: [
        {
          name: "🤖 Automático (Clonar todos los pendientes de corrido)",
          value: "auto",
          description: "Clonará todos los repos que aún no estén en el disco.",
        },
        {
          name: "👆 Paso a paso (Preguntar antes de cada uno)",
          value: "paso_a_paso",
          description: "Irá alumno por alumno pidiendo confirmación.",
        },
        {
          name: "🔎 Buscar y clonar un repo en particular",
          value: "individual",
          description:
            "Abrirá un buscador dinámico para encontrar a un alumno rápido.",
        },
        {
          name: "✅ Marcar / Desmarcar corregidos",
          value: "gestionar_corregidos",
          description:
            "Cambiar el estado de las entregas y decidir si archivarlas.",
        },
        {
          name: "❌ Salir",
          value: "salir",
        },
      ],
    });

    if (modoClonado === "salir") {
      enMenu = false;
      break;
    }

    const total = matcheados.length;

    // ==========================================
    // LÓGICA: MARCAR / DESMARCAR Y ARCHIVAR
    // ==========================================
    if (modoClonado === "gestionar_corregidos") {
      const activos = matcheados.filter(
        (a) =>
          getAlumnoState(a.dni) === "EN_CORRECCION" ||
          getAlumnoState(a.dni) === "CORREGIDO",
      );

      if (activos.length === 0) {
        console.log("\nℹ️ No hay repositorios en corrección para gestionar.");
        continue;
      }

      // Armamos la lista y PRE-MARCAMOS los que ya estaban corregidos
      const opcionesCheckbox = activos.map((alumno) => {
        const estadoActual = getAlumnoState(alumno.dni);
        const yaCorregido = estadoActual === "CORREGIDO";
        return {
          name: `${yaCorregido ? "✅ (Corregido)" : "📂 (En proceso)"} ${alumno.nombre} (${alumno.dni})`,
          value: alumno,
          checked: yaCorregido, // La magia de Inquirer: pre-marca la casilla
        };
      });

      const alumnosSeleccionados = await checkbox({
        message:
          "Marcá con Espacio los corregidos y desmarcá para revertir (Enter para confirmar):",
        choices: opcionesCheckbox,
      });

      // Detectamos cuáles quedaron DESMARCADOS en comparación a la lista total
      const desmarcados = activos.filter(
        (a) => !alumnosSeleccionados.find((sel) => sel.dni === a.dni),
      );

      // 1. Revertimos los desmarcados a EN_CORRECCION
      let revertidos = 0;
      for (const alumno of desmarcados) {
        if (getAlumnoState(alumno.dni) === "CORREGIDO") {
          updateAlumnoState(alumno, "EN_CORRECCION");
          revertidos++;
        }
      }
      if (revertidos > 0) {
        console.log(
          `\n⏪ Se revirtieron ${revertidos} entregas al estado "En proceso".`,
        );
      }

      // Si no quedó nadie seleccionado, volvemos al menú
      if (alumnosSeleccionados.length === 0) {
        console.log(
          "\nNingún alumno quedó marcado como corregido. Volviendo al menú...",
        );
        continue;
      }

      // 2. Preguntamos qué hacer con los que SÍ quedaron seleccionados
      const archivar = await confirm({
        message: `Tenés ${alumnosSeleccionados.length} entregas marcadas como corregidas. ¿Querés archivarlas AHORA?\n  (⚠️ Esto guardará los feedback.md y BORRARÁ las carpetas del disco)`,
      });

      if (archivar) {
        console.log(
          `\nArchivando y limpiando ${alumnosSeleccionados.length} repositorios...`,
        );
        const historialDir = path.join(process.cwd(), "historial_correcciones");
        if (!fs.existsSync(historialDir))
          fs.mkdirSync(historialDir, { recursive: true });

        for (const alumno of alumnosSeleccionados) {
          const { folderPath, comisionFolder } = getPaths(alumno);

          const feedbackOrigen = path.join(folderPath, "feedback.md");
          const comisionHistorialDir = path.join(historialDir, comisionFolder);
          if (!fs.existsSync(comisionHistorialDir))
            fs.mkdirSync(comisionHistorialDir, { recursive: true });

          const feedbackDestino = path.join(
            comisionHistorialDir,
            `${alumno.dni}_${alumno.nombre}_feedback.md`,
          );

          if (fs.existsSync(feedbackOrigen)) {
            fs.copyFileSync(feedbackOrigen, feedbackDestino);
          }

          if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
          }

          updateAlumnoState(alumno, "ARCHIVADO");
          console.log(`✅ Archivado y borrado: ${alumno.nombre}`);
        }

        console.log("\n🧹 ¡Limpieza completa! Espacio en disco recuperado.");
      } else {
        // Solo los actualizamos a CORREGIDO
        for (const alumno of alumnosSeleccionados) {
          updateAlumnoState(alumno, "CORREGIDO");
        }
        console.log(
          `\n✅ ${alumnosSeleccionados.length} entregas marcadas como "Corregidas". Los repositorios siguen en tu disco.`,
        );
      }

      continue;
    }

    // ==========================================
    // LÓGICA DE CLONADO
    // ==========================================
    if (modoClonado === "individual") {
      const alumnoElegido = await search({
        message:
          "Escribí el DNI, Nombre o GitHub para buscar (flechas para elegir, Enter para confirmar):",
        source: async (input) => {
          const opciones = matcheados.map((alumno) => {
            const estado = getAlumnoState(alumno.dni);
            let icono = "⬜";
            if (estado === "EN_CORRECCION") icono = "📂";
            if (estado === "ARCHIVADO") icono = "✅";

            return {
              name: `${icono} ${alumno.nombre} (${alumno.dni}) [@${alumno.usuario["Usuario Github Registrado"]}]`,
              value: alumno,
            };
          });

          if (!input) return opciones;
          const termino = input.toLowerCase();
          return opciones.filter((op) =>
            op.name.toLowerCase().includes(termino),
          );
        },
      });

      console.log(`\nProcesando a ${alumnoElegido.nombre}...`);
      const cloneUrl = repoMap.get(
        alumnoElegido.usuario["Usuario Github Registrado"].toLowerCase(),
      );
      scaffoldFolder(alumnoElegido, cloneUrl);
      updateAlumnoState(alumnoElegido, "EN_CORRECCION");
      console.log(`🎉 ¡Listo! Volviendo al menú principal...`);
    } else {
      const pasoAPaso = modoClonado === "paso_a_paso";
      let cancelado = false;

      console.log("\n📁 Procesando carpetas...\n");

      for (let i = 0; i < total; i++) {
        const alumno = matcheados[i];
        const porcentaje = Math.round(((i + 1) / total) * 100);
        const cloneUrl = repoMap.get(
          alumno.usuario["Usuario Github Registrado"].toLowerCase(),
        );
        const estado = getAlumnoState(alumno.dni);

        if (!config.DRY_RUN && estado !== "PENDIENTE") {
          const motivo =
            estado === "ARCHIVADO" ? "Ya corregido" : "En corrección";
          console.log(
            `👤 [${i + 1}/${total}] (${porcentaje}%) ⏭️  Saltando (${motivo}): ${alumno.nombre}`,
          );
          continue;
        }

        if (pasoAPaso) {
          const resp = await prompt(
            `\n👤 [${i + 1}/${total}] (${porcentaje}%) ¿Clonar entrega de ${alumno.nombre}? (s/N): `,
          );
          if (resp.toLowerCase() !== "s") {
            console.log("🛑 Proceso detenido por el usuario.");
            cancelado = true;
            break;
          }
        } else {
          console.log(
            `👤 [${i + 1}/${total}] (${porcentaje}%) Procesando ${alumno.nombre}...`,
          );
        }

        scaffoldFolder(alumno, cloneUrl);
        updateAlumnoState(alumno, "EN_CORRECCION");
      }

      if (!cancelado) {
        console.log(
          `\n✅ Proceso por lotes finalizado. Encontrarás todo en: ${config.OUTPUT_DIR}`,
        );
      }
    }
  }

  console.log(`\n👋 ¡Hasta luego! Script finalizado.\n`);
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
