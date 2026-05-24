import "dotenv/config";
import * as fs from "fs";
import { config } from "./config";
import { loadPresentes, loadUsuarios, loadFaltas, prompt } from "./utils/dataParser";
import { fetchReposForUsers } from "./services/gitService";
import { scaffoldFolder, isRepoCloned } from "./services/fileManager";
import { Alumno, Presente, Usuario } from "./types";

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

  console.log("\n📋 Alumnos a procesar:");
  matcheados.forEach((a) =>
    console.log(`  - ${a.nombre} (DNI: ${a.dni}) → @${a.usuario["Usuario Github Registrado"]}`),
  );

  const usernames = matcheados.map((a) => a.usuario["Usuario Github Registrado"]);
  const repoMap = await fetchReposForUsers(usernames);

  matcheados.forEach((a) => {
    const username = a.usuario["Usuario Github Registrado"].toLowerCase();
    const found = repoMap.has(username);
    console.log(`  ${found ? "✅" : "❌"} ${config.PARCIAL_PREFIX}-${a.usuario["Usuario Github Registrado"]}`);
  });

  const modoClonado = await prompt(`\n¿Modo de clonado? (1: Automático todo junto, 2: Preguntar uno por uno) [1/2]: `);
  const pasoAPaso = modoClonado.trim() === "2";

  const confirmar = await prompt(`\n¿Empezar el proceso para ${repoMap.size} repos encontrados? (s/N): `);
  if (confirmar.toLowerCase() !== "s") {
    console.log("Abortado.");
    return;
  }

  if (!config.DRY_RUN) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });

  console.log("\n📁 Armando carpetas y procesando...\n");

  const total = matcheados.length;
  for (let i = 0; i < total; i++) {
    const alumno = matcheados[i];
    const porcentaje = Math.round(((i + 1) / total) * 100);
    const cloneUrl = repoMap.get(alumno.usuario["Usuario Github Registrado"].toLowerCase());

    // Validamos si ya existe para saltearlo (así es "resumible")
    if (!config.DRY_RUN && isRepoCloned(alumno)) {
      console.log(`👤 [${i + 1}/${total}] (${porcentaje}%) ⏭️  Saltando (Ya clonado): ${alumno.nombre}`);
      continue;
    }

    if (pasoAPaso) {
      const resp = await prompt(`\n👤 [${i + 1}/${total}] (${porcentaje}%) ¿Clonar entrega de ${alumno.nombre}? (s/N): `);
      if (resp.toLowerCase() !== "s") {
        console.log("🛑 Proceso detenido por el usuario. Podés volver a correr el script para retomar desde acá.");
        break; // Cortamos el bucle si decide no seguir
      }
    } else {
      console.log(`👤 [${i + 1}/${total}] (${porcentaje}%) Procesando ${alumno.nombre}...`);
    }

    scaffoldFolder(alumno, cloneUrl);
  }

  const clonados = matcheados.filter((a) =>
    repoMap.has(a.usuario["Usuario Github Registrado"].toLowerCase()),
  ).length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Proceso finalizado. Encontrarás todo en: ${config.OUTPUT_DIR}\n`);
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});