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

import { scaffoldFolder, getPaths } from "./services/fileManager";

import { Alumno, Presente, RepoData, Usuario } from "./types";

import { checkbox, confirm, input } from "@inquirer/prompts";

import search from "@inquirer/search";

import {
  getAlumnoState,
  updateAlumnoState,
  syncStateWithFileSystem,
  deleteHistorialMd,
} from "./services/stateManager";

import { loadCache, saveCache } from "./services/cacheManager";

import { menuSelect } from "./utils/menuUtils";

import { publishIssuesFlow } from "./flows/publishIssuesFlow";

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (config.DRY_RUN) {
    console.log("\n🔍 MODO DRY-RUN — no se escribirá nada en disco\n");
  }

  if (!config.DRY_RUN) {
    fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  }

  // ── Caché ──────────────────────────────────────────────────────────────────

  let datosCargados = false;

  let matcheados: Alumno[] = [];

  let repoMap: Map<string, RepoData> = new Map();

  const cacheGuardado = loadCache();

  if (cacheGuardado) {
    console.log(
      "\n📦 Caché detectado: tus archivos CSV no cambiaron desde la última ejecución.",
    );

    matcheados = cacheGuardado.matcheados;
    repoMap = cacheGuardado.repoMap;

    datosCargados = true;
  }

  // ── Bucle principal ────────────────────────────────────────────────────────

  let enMenu = true;

  while (enMenu) {
    const opcionesMenu: {
      name: string;
      value: string;
      description?: string;
    }[] = [];

    // ── Menú ────────────────────────────────────────────────────────────────

    if (!datosCargados) {
      opcionesMenu.push({
        name: "🗂️  Escanear archivos de datos  (paso requerido para iniciar)",
        value: "escanear",
        description:
          "Lee los CSV, cruza los datos y busca los repos en GitHub.",
      });
    } else {
      opcionesMenu.push(
        {
          name: "🤖 Automático  —  clonar todos los pendientes de corrido",
          value: "auto",
          description: "Clona todos los repos que aún no estén en disco.",
        },

        {
          name: "👆 Paso a paso  —  preguntar antes de cada uno",
          value: "paso_a_paso",
          description: "Irá alumno por alumno pidiendo confirmación.",
        },

        {
          name: "🔎 Buscar y clonar un repo en particular",
          value: "individual",
          description: "Buscador dinámico para encontrar un alumno rápido.",
        },

        {
          name: "🔄 Sincronizar carpetas locales",
          value: "sincronizar",
          description:
            "Escanea las carpetas y actualiza el JSON si pegaste entregas a mano.",
        },

        {
          name: "✅ Marcar / Desmarcar corregidos",
          value: "gestionar_corregidos",
          description: "Cambiar estado de entregas y decidir si archivarlas.",
        },

        {
          name: "📦 Reabrir archivados",
          value: "reabrir_archivados",
          description:
            "Devuelve a PENDIENTE entregas archivadas y elimina su .md del historial.",
        },

        {
          name: "📨 Publicar issues",
          value: "publicar_issues",
          description: "Publica devoluciones archivadas como issues en GitHub.",
        },

        {
          name: "🔄 Forzar reescaneo de datos / cambiar comisiones",
          value: "escanear",
          description:
            "Vuelve a leer los CSV por si querés procesar otra comisión.",
        },
      );
    }

    opcionesMenu.push({
      name: "❌ Salir",
      value: "salir",
    });

    // ── Mostrar menú ─────────────────────────────────────────────────────────

    let modoClonado: string | null;

    try {
      modoClonado = await menuSelect(
        datosCargados
          ? "¿Qué acción deseás realizar?"
          : "¡Bienvenido! Empecemos por cargar los datos:",
        opcionesMenu,
      );
    } catch (e: any) {
      if (e?.name === "ExitPromptError") {
        continue;
      }

      throw e;
    }

    // ── Salida ───────────────────────────────────────────────────────────────

    if (modoClonado === null || modoClonado === "salir") {
      enMenu = false;
      break;
    }

    // ── Flujos ───────────────────────────────────────────────────────────────

    try {
      // ── PUBLICAR ISSUES ────────────────────────────────────────────────────

      if (modoClonado === "publicar_issues") {
        await publishIssuesFlow(matcheados, repoMap);

        await input({
          message: "Presioná Enter para volver al menú...",
        });

        continue;
      }

      // ── ESCANEAR ───────────────────────────────────────────────────────────

      if (modoClonado === "escanear") {
        console.log("\n⏳ Leyendo archivos CSV...");

        const presentes = loadPresentes() as Presente[];

        const usuarios = loadUsuarios() as Usuario[];

        const faltas = loadFaltas();

        const presentesConfirmados = presentes.filter(
          (p) => p.presente === "true",
        );

        const dnisPresentes = new Set(
          presentesConfirmados.map((p) => p.dni.trim()),
        );

        const usuariosPresentes = usuarios.filter((u) =>
          dnisPresentes.has(u["DNI"].trim()),
        );

        const comisionesDisponibles = Array.from(
          new Set(usuariosPresentes.map((u) => u.Comision)),
        )
          .filter(Boolean)
          .sort();

        let comisionesElegidas: string[] = [];

        if (config.ALL_COMISIONES) {
          comisionesElegidas = comisionesDisponibles;

          console.log(
            "⚡ Modo --all-comisiones: procesando todas las comisiones.\n",
          );
        } else {
          comisionesElegidas = await checkbox({
            message: "Seleccioná las comisiones a procesar:",

            choices: comisionesDisponibles.map((c) => ({
              name: c,
              value: c,
              checked: true,
            })),
          });

          if (comisionesElegidas.length === 0) {
            console.log(
              "\n⚠️  No seleccionaste ninguna comisión. Volviendo al menú...",
            );

            continue;
          }
        }

        const usuariosFiltrados = usuarios.filter((u) =>
          comisionesElegidas.includes(u.Comision),
        );

        const usuariosMap = new Map(
          usuariosFiltrados.map((u) => [u["DNI"].trim(), u]),
        );

        matcheados = [];

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
              `\n 🚨 LIBRE: ${p.nombre} (DNI: ${p.dni}) está en condición LIBRE`,
            );

            const resp = await prompt("    ¿Incluir de todas formas? (s/N): ");

            if (resp.toLowerCase() !== "s") {
              continue;
            }
          }

          matcheados.push({
            ...p,
            usuario,
          });
        }

        console.log(`\n${"=".repeat(60)}`);
        console.log(`Presentes confirmados: ${presentesConfirmados.length}`);
        console.log(`Matcheados a procesar: ${matcheados.length}`);
        console.log(`Sin match (ignorado):  ${sinMatch.length}`);
        console.log("=".repeat(60));

        if (matcheados.length > 0) {
          console.log("\n🔍 Buscando repositorios en GitHub...");

          repoMap = await fetchReposForUsers(
            matcheados.map((a) => a.usuario["Usuario Github Registrado"]),
          );

          datosCargados = true;

          saveCache(matcheados, repoMap);

          console.log("✅ ¡Datos escaneados, cacheados y listos!");
        } else {
          console.log("\n❌ No quedaron alumnos con esos filtros.");

          datosCargados = false;
        }

        await input({
          message: "Presioná Enter para volver al menú...",
        });

        continue;
      }

      // ── SINCRONIZAR ────────────────────────────────────────────────────────

      if (modoClonado === "sincronizar") {
        console.log("\n🔍 Escaneando carpetas locales y leyendo feedbacks...");

        const {
          sincronizadosEnProceso,
          sincronizadosCorregidos,
          sincronizadosArchivados,
          devueltosAPendiente,
          reabiertosDeArchivado,
        } = syncStateWithFileSystem(matcheados);

        const huboCambios =
          sincronizadosEnProceso > 0 ||
          sincronizadosCorregidos > 0 ||
          sincronizadosArchivados > 0 ||
          devueltosAPendiente > 0 ||
          reabiertosDeArchivado > 0;

        if (huboCambios) {
          console.log("✅ Estados actualizados según carpetas locales:");

          if (sincronizadosEnProceso > 0) {
            console.log(
              `   📂 ${sincronizadosEnProceso} pasaron a "En proceso".`,
            );
          }

          if (sincronizadosCorregidos > 0) {
            console.log(
              `   ✅ ${sincronizadosCorregidos} detectadas como "Corregidas" (tienen nota).`,
            );
          }

          if (sincronizadosArchivados > 0) {
            console.log(
              `   📦 ${sincronizadosArchivados} pasaron a "Archivado" (carpetas removidas con nota).`,
            );
          }

          if (devueltosAPendiente > 0) {
            console.log(
              `   ⏰ ${devueltosAPendiente} devueltos a "Pendiente" (carpetas eliminadas sin nota).`,
            );
          }

          if (reabiertosDeArchivado > 0) {
            console.log(
              `   🔓 ${reabiertosDeArchivado} reabiertos desde "Archivado" → "En proceso" (y .md eliminado del historial).`,
            );
          }
        } else {
          console.log("ℹ️  Todo al día. No se encontraron discrepancias.");
        }

        await input({
          message: "Presioná Enter para volver al menú...",
        });

        continue;
      }

      // ── GESTIONAR CORREGIDOS ───────────────────────────────────────────────

      if (modoClonado === "gestionar_corregidos") {
        const activos = matcheados.filter(
          (a) =>
            getAlumnoState(a.dni) === "EN_CORRECCION" ||
            getAlumnoState(a.dni) === "CORREGIDO",
        );

        if (activos.length === 0) {
          console.log(
            "\nℹ️  No hay repositorios en corrección para gestionar.",
          );

          await input({
            message: "Presioná Enter para volver al menú...",
          });

          continue;
        }

        const alumnosSeleccionados = await checkbox({
          message:
            "Marcá con Espacio los corregidos y desmarcá para revertir (Enter confirma):",

          choices: activos.map((alumno) => {
            const yaCorregido = getAlumnoState(alumno.dni) === "CORREGIDO";

            return {
              name: `${yaCorregido ? "✅ (Corregido)" : "📂 (En proceso)"} ${alumno.nombre} (${alumno.dni})`,
              value: alumno,
              checked: yaCorregido,
            };
          }),
        });

        // ── Desmarcar = volver a EN_CORRECCION ──────────────────────────────

        const desmarcados = activos.filter(
          (a) => !alumnosSeleccionados.find((sel) => sel.dni === a.dni),
        );

        let revertidos = 0;

        for (const alumno of desmarcados) {
          if (getAlumnoState(alumno.dni) === "CORREGIDO") {
            updateAlumnoState(alumno, "EN_CORRECCION");

            revertidos++;
          }
        }

        if (revertidos > 0) {
          console.log(
            `\n⏪ Se revirtieron ${revertidos} entregas a "En proceso".`,
          );
        }

        if (alumnosSeleccionados.length === 0) {
          console.log("\nNingún alumno quedó marcado como corregido.");

          await input({
            message: "Presioná Enter para volver al menú...",
          });

          continue;
        }

        const archivar = await confirm({
          message: `Tenés ${alumnosSeleccionados.length} entregas marcadas. ¿Archivar AHORA?\n  (⚠️  Guardará los feedback.md y BORRARÁ las carpetas del disco)`,
        });

        if (archivar) {
          console.log("\nArchivando y limpiando repositorios...");

          const historialDir = path.join(
            process.cwd(),
            "historial_correcciones",
          );

          if (!fs.existsSync(historialDir)) {
            fs.mkdirSync(historialDir, { recursive: true });
          }

          const archivadosExito: string[] = [];

          const archivadosFallidos: string[] = [];

          for (const alumno of alumnosSeleccionados) {
            const { folderPath, comisionFolder } = getPaths(alumno);

            const feedbackOrigen = path.join(folderPath, "feedback.md");

            // ── Validar nota ────────────────────────────────────────────────

            let tieneNotaValida = false;

            if (fs.existsSync(feedbackOrigen)) {
              const contenido = fs.readFileSync(feedbackOrigen, "utf-8");

              const notaMatch = contenido.match(/##\s*Nota:\s*([^\s]+)/i);

              if (
                notaMatch &&
                notaMatch[1] &&
                notaMatch[1].toLowerCase() !== "pendiente"
              ) {
                tieneNotaValida = true;
              }
            }

            if (!tieneNotaValida) {
              archivadosFallidos.push(`${alumno.nombre} (DNI: ${alumno.dni})`);

              updateAlumnoState(alumno, "EN_CORRECCION");

              continue;
            }

            // ── Guardar feedback ────────────────────────────────────────────

            const comisionHistorialDir = path.join(
              historialDir,
              comisionFolder,
            );

            if (!fs.existsSync(comisionHistorialDir)) {
              fs.mkdirSync(comisionHistorialDir, {
                recursive: true,
              });
            }

            const feedbackDestino = path.join(
              comisionHistorialDir,
              `${alumno.dni}_${alumno.nombre}_feedback.md`,
            );

            fs.copyFileSync(feedbackOrigen, feedbackDestino);

            if (fs.existsSync(folderPath)) {
              fs.rmSync(folderPath, {
                recursive: true,
                force: true,
              });
            }

            updateAlumnoState(alumno, "ARCHIVADO");

            archivadosExito.push(alumno.nombre);
          }

          console.clear();

          console.log(`\n${"=".repeat(60)}`);
          console.log("📋 REPORTE DE ARCHIVADO");
          console.log("=".repeat(60));

          if (archivadosExito.length > 0) {
            console.log(
              `✅ Archivados con éxito: ${archivadosExito.length} entregas.`,
            );
          }

          if (archivadosFallidos.length > 0) {
            console.log(
              `\n❌ OMITIDOS POR FALTA DE NOTA: ${archivadosFallidos.length}`,
            );

            console.log('   (Carpetas protegidas, devueltas a "En proceso")');

            archivadosFallidos.forEach((n) => console.log(`   - ${n}`));
          }

          console.log(`${"=".repeat(60)}\n`);

          await input({
            message: "Presioná Enter para volver al menú...",
          });
        } else {
          for (const alumno of alumnosSeleccionados) {
            updateAlumnoState(alumno, "CORREGIDO");
          }

          console.log(
            `\n✅ ${alumnosSeleccionados.length} entregas marcadas como "Corregidas".`,
          );

          await input({
            message: "Presioná Enter para volver al menú...",
          });
        }

        continue;
      }

      // ── REABRIR ARCHIVADOS ────────────────────────────────────────────────

      if (modoClonado === "reabrir_archivados") {
        const archivados = matcheados.filter(
          (a) => getAlumnoState(a.dni) === "ARCHIVADO",
        );

        if (archivados.length === 0) {
          console.log("\nℹ️  No hay entregas archivadas para reabrir.");

          await input({
            message: "Presioná Enter para volver al menú...",
          });

          continue;
        }

        const seleccionados = await checkbox({
          message: "Seleccioná las entregas archivadas que querés reabrir:",

          choices: archivados.map((alumno) => ({
            name: `📦 ${alumno.nombre} (${alumno.dni}) [@${alumno.usuario["Usuario Github Registrado"]}]`,
            value: alumno,
            checked: false,
          })),
        });

        if (seleccionados.length === 0) {
          console.log("\nNo seleccionaste ninguna entrega.");

          await input({
            message: "Presioná Enter para volver al menú...",
          });

          continue;
        }

        let eliminados = 0;

        for (const alumno of seleccionados) {
          const eliminado = deleteHistorialMd(alumno);

          if (eliminado) {
            eliminados++;
          }

          updateAlumnoState(alumno, "PENDIENTE");
        }

        console.log(
          `\n🔓 ${seleccionados.length} entregas devueltas a "Pendiente".`,
        );

        if (eliminados > 0) {
          console.log(
            `   🗑️  ${eliminados} archivos eliminados de historial_correcciones.`,
          );
        }

        console.log(
          '\n   Podés re-clonarlas con "Automático" o "Buscar repo individual".',
        );

        await input({
          message: "Presioná Enter para volver al menú...",
        });

        continue;
      }

      // ── INDIVIDUAL ─────────────────────────────────────────────────────────

      if (modoClonado === "individual") {
        const alumnoElegido = await search({
          message: "Escribí DNI, Nombre o GitHub para buscar:",

          source: async (inputStr) => {
            const opciones = matcheados.map((alumno) => {
              const estado = getAlumnoState(alumno.dni);

              const icono =
                {
                  EN_CORRECCION: "📂",
                  CORREGIDO: "✅",
                  ARCHIVADO: "🧹",
                  PUBLICADO: "📨",
                  PENDIENTE: "⬜",
                }[estado] ?? "⬜";

              return {
                name: `${icono} ${alumno.nombre} (${alumno.dni}) [@${alumno.usuario["Usuario Github Registrado"]}]`,
                value: alumno,
              };
            });

            if (!inputStr) {
              return opciones;
            }

            const term = inputStr.toLowerCase();

            return opciones.filter((op) =>
              op.name.toLowerCase().includes(term),
            );
          },
        });

        console.log(`\nProcesando a ${alumnoElegido.nombre}...`);

        const repoData = repoMap.get(
          alumnoElegido.usuario["Usuario Github Registrado"].toLowerCase(),
        );

        if (!repoData) {
          console.log("❌ Repo no encontrado.");
          continue;
        }

        scaffoldFolder(alumnoElegido, repoData.cloneUrl);

        updateAlumnoState(alumnoElegido, "EN_CORRECCION");

        console.log("🎉 ¡Listo!");

        await input({
          message: "Enter para volver...",
        });

        continue;
      }

      // ── AUTO / PASO A PASO ────────────────────────────────────────────────

      if (modoClonado === "auto" || modoClonado === "paso_a_paso") {
        const pasoAPaso = modoClonado === "paso_a_paso";

        let cancelado = false;

        console.log("\n📁 Procesando carpetas...\n");

        for (let i = 0; i < matcheados.length; i++) {
          const alumno = matcheados[i];

          const porcentaje = Math.round(((i + 1) / matcheados.length) * 100);

          const repoData = repoMap.get(
            alumno.usuario["Usuario Github Registrado"].toLowerCase(),
          );

          if (!repoData) {
            console.log("❌ Repo no encontrado.");
            continue;
          }
          const estado = getAlumnoState(alumno.dni);

          if (!config.DRY_RUN && estado !== "PENDIENTE") {
            console.log(
              `👤 [${i + 1}/${matcheados.length}] (${porcentaje}%) ⏭️  Saltando (${estado}): ${alumno.nombre}`,
            );

            continue;
          }

          if (pasoAPaso) {
            const resp = await prompt(
              `\n👤 [${i + 1}/${matcheados.length}] (${porcentaje}%) ¿Clonar entrega de ${alumno.nombre}? (s/N): `,
            );

            if (resp.toLowerCase() !== "s") {
              console.log("🛑 Proceso detenido por el usuario.");

              cancelado = true;

              break;
            }
          } else {
            console.log(
              `👤 [${i + 1}/${matcheados.length}] (${porcentaje}%) Procesando ${alumno.nombre}...`,
            );
          }

          scaffoldFolder(alumno, repoData.cloneUrl);

          updateAlumnoState(alumno, "EN_CORRECCION");
        }

        if (!cancelado) {
          console.log("\n✅ Proceso por lotes finalizado.");
        }

        await input({
          message: "Presioná Enter para volver...",
        });

        continue;
      }
    } catch (e: any) {
      if (e?.name === "ExitPromptError") {
        console.log("\n⬅️  Volviendo al menú principal...\n");

        continue;
      }

      throw e;
    }
  }

  console.log("\n👋 ¡Hasta luego!\n");
}

main().catch((e) => {
  console.error("Error fatal:", e);

  process.exit(1);
});
