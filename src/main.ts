import "dotenv/config";
import * as fs from "fs";
import { config } from "./config";
import { loadPresentes, loadUsuarios, loadFaltas, prompt } from "./utils/dataParser";
import { fetchReposForUsers } from "./services/gitService";
import { scaffoldFolder, isRepoCloned } from "./services/fileManager";
import { Alumno, Presente, Usuario } from "./types";
import { select } from "@inquirer/prompts";
import search  from "@inquirer/search"; // Importamos el buscador dinámico

async function main() {
  if (config.DRY_RUN) console.log("\n🔍 MODO DRY-RUN — no se escribirá nada en disco\n");

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

  const usuariosMap = new Map(usuariosFiltrados.map((u) => [u["DNI"].trim(), u]));
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
      console.log(`\n  🚨 LIBRE: ${p.nombre} (DNI: ${p.dni}) está en condición LIBRE`);
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

  const usernames = matcheados.map((a) => a.usuario["Usuario Github Registrado"]);
  const repoMap = await fetchReposForUsers(usernames);

  if (!config.DRY_RUN) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });

  // === BUCLE PRINCIPAL DEL MENÚ ===
  let enMenu = true;

  while (enMenu) {
    const modoClonado = await select({
      message: '\n¿Qué acción deseás realizar?',
      choices: [
        {
          name: '🤖 Automático (Clonar todos los pendientes de corrido)',
          value: 'auto',
          description: 'Clonará todos los repos que aún no estén en el disco.'
        },
        {
          name: '👆 Paso a paso (Preguntar antes de cada uno)',
          value: 'paso_a_paso',
          description: 'Irá alumno por alumno pidiendo confirmación.'
        },
        {
          name: '🔎 Buscar y clonar un repo en particular',
          value: 'individual',
          description: 'Abrirá un buscador dinámico para encontrar a un alumno rápido.'
        },
        {
          name: '❌ Salir',
          value: 'salir',
        }
      ]
    });

    if (modoClonado === 'salir') {
      enMenu = false;
      break;
    }

    const total = matcheados.length;

    if (modoClonado === 'individual') {
      // === BUSCADOR DINÁMICO ===
      const alumnoElegido = await search({
        message: 'Escribí el DNI, Nombre o GitHub para buscar (flechas para elegir, Enter para confirmar):',
        source: async (input) => {
          // Generamos las opciones en tiempo real para que el ✅ se actualice
          const opciones = matcheados.map((alumno) => {
            const clonado = !config.DRY_RUN && isRepoCloned(alumno);
            return {
              name: `${clonado ? '✅' : '⬜'} ${alumno.nombre} (${alumno.dni}) [@${alumno.usuario["Usuario Github Registrado"]}]`,
              value: alumno,
            };
          });

          // Si no hay texto, mostramos todos
          if (!input) return opciones;

          // Filtramos ignorando mayúsculas y minúsculas
          const termino = input.toLowerCase();
          return opciones.filter((op) => op.name.toLowerCase().includes(termino));
        },
      });

      console.log(`\nProcesando a ${alumnoElegido.nombre}...`);
      const cloneUrl = repoMap.get(alumnoElegido.usuario["Usuario Github Registrado"].toLowerCase());
      scaffoldFolder(alumnoElegido, cloneUrl);
      console.log(`🎉 ¡Listo! Volviendo al menú principal...`);

    } else {
      // Modos Automático y Paso a paso
      const pasoAPaso = modoClonado === "paso_a_paso";
      let cancelado = false;

      for (let i = 0; i < total; i++) {
        const alumno = matcheados[i];
        const porcentaje = Math.round(((i + 1) / total) * 100);
        const cloneUrl = repoMap.get(alumno.usuario["Usuario Github Registrado"].toLowerCase());

        if (!config.DRY_RUN && isRepoCloned(alumno)) {
          console.log(`👤 [${i + 1}/${total}] (${porcentaje}%) ⏭️  Saltando (Ya clonado): ${alumno.nombre}`);
          continue;
        }

        if (pasoAPaso) {
          const resp = await prompt(`\n👤 [${i + 1}/${total}] (${porcentaje}%) ¿Clonar entrega de ${alumno.nombre}? (s/N): `);
          if (resp.toLowerCase() !== "s") {
            console.log("🛑 Proceso detenido por el usuario.");
            cancelado = true;
            break; 
          }
        } else {
          console.log(`👤 [${i + 1}/${total}] (${porcentaje}%) Procesando ${alumno.nombre}...`);
        }

        scaffoldFolder(alumno, cloneUrl);
      }

      if (!cancelado) {
        console.log(`\n✅ Proceso por lotes finalizado. Encontrarás todo en: ${config.OUTPUT_DIR}`);
      }
    }
  }

  console.log(`\n👋 ¡Hasta luego! Script finalizado.\n`);
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});