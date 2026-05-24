import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { loadPresentes, loadUsuarios, loadFaltas, prompt } from "./utils/dataParser";
import { fetchReposForUsers } from "./services/gitService";
import { scaffoldFolder, isRepoCloned, getPaths } from "./services/fileManager";
import { Alumno, Presente, Usuario } from "./types";
import { select, checkbox, confirm } from "@inquirer/prompts";
import search from "@inquirer/search";
import { getAlumnoState, updateAlumnoState } from "./services/stateManager";
import { loadCache, saveCache } from "./services/cacheManager";

async function main() {
  if (config.DRY_RUN) console.log("\n🔍 MODO DRY-RUN — no se escribirá nada en disco\n");

  if (!config.DRY_RUN) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });

  // ==========================================
  // VARIABLES DE ESTADO Y CACHÉ
  // ==========================================
  let datosCargados = false;
  let matcheados: Alumno[] = [];
  let repoMap: Map<string, string> = new Map();

  // INTENTAMOS CARGAR DESDE EL DISCO
  const cacheGuardado = loadCache();
  if (cacheGuardado) {
    console.log("\n📦 Caché detectado: Tus archivos CSV no sufrieron cambios desde la última ejecución.");
    matcheados = cacheGuardado.matcheados;
    repoMap = cacheGuardado.repoMap;
    datosCargados = true;
  }

  // === BUCLE PRINCIPAL DEL MENÚ ===
  let enMenu = true;

  while (enMenu) {
    const opcionesMenu = [];

    if (!datosCargados) {
      opcionesMenu.push({
        name: '🗂️ Escanear archivos de datos (Paso requerido para iniciar)',
        value: 'escanear',
        description: 'Lee los CSV, cruza los datos y busca los repos en GitHub.'
      });
    } else {
      opcionesMenu.push(
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
          name: '✅ Marcar / Desmarcar corregidos',
          value: 'gestionar_corregidos',
          description: 'Cambiar el estado de las entregas y decidir si archivarlas.'
        },
        {
          name: '🔄 Forzar reescaneo de datos / Cambiar comisiones',
          value: 'escanear',
          description: 'Vuelve a leer los CSV por si querés procesar otra comisión.'
        }
      );
    }

    opcionesMenu.push({ name: '❌ Salir', value: 'salir' });

    const modoClonado = await select({
      message: datosCargados ? '\n¿Qué acción deseás realizar?' : '\n¡Bienvenido! Empecemos por cargar los datos:',
      choices: opcionesMenu
    });

    if (modoClonado === 'salir') {
      enMenu = false;
      break;
    }

    // ==========================================
    // LÓGICA DE ESCANEO DE DATOS Y COMISIONES
    // ==========================================
    if (modoClonado === 'escanear') {
      console.log("\n⏳ Leyendo archivos CSV...");
      const presentes = loadPresentes() as Presente[];
      const usuarios = loadUsuarios() as Usuario[];
      const faltas = loadFaltas();

      const presentesConfirmados = presentes.filter((p) => p.presente === "true");
      const dnisPresentes = new Set(presentesConfirmados.map(p => p.dni.trim()));
      
      const usuariosPresentes = usuarios.filter(u => dnisPresentes.has(u["DNI"].trim()));
      const comisionesDisponibles = Array.from(new Set(usuariosPresentes.map(u => u.Comision)))
                                         .filter(Boolean)
                                         .sort();

      let comisionesElegidas: string[] = [];

      if (config.ALL_COMISIONES) {
        comisionesElegidas = comisionesDisponibles;
        console.log("⚡ Modo --all-comisiones: Procesando todas las comisiones encontradas.\n");
      } else {
        const opcionesComision = comisionesDisponibles.map(c => ({
          name: c,
          value: c,
          checked: true
        }));

        comisionesElegidas = await checkbox({
          message: 'Seleccioná las comisiones que querés procesar ahora:',
          choices: opcionesComision
        });

        if (comisionesElegidas.length === 0) {
          console.log("\n⚠️ No seleccionaste ninguna comisión. Volviendo al menú...");
          continue; 
        }
      }

      const usuariosFiltrados = usuarios.filter((u) => comisionesElegidas.includes(u.Comision));
      const usuariosMap = new Map(usuariosFiltrados.map((u) => [u["DNI"].trim(), u]));
      
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
          console.log(`\n  🚨 LIBRE: ${p.nombre} (DNI: ${p.dni}) está en condición LIBRE`);
          const resp = await prompt("    ¿Incluir de todas formas? (s/N): ");
          if (resp.toLowerCase() !== "s") continue;
        }
        matcheados.push({ ...p, usuario });
      }

      console.log(`\n${"=".repeat(60)}`);
      console.log(`Presentes confirmados: ${presentesConfirmados.length}`);
      console.log(`Matcheados a procesar: ${matcheados.length}`);
      console.log(`Sin match (ignorado):  ${sinMatch.length}`);
      console.log("=".repeat(60));

      if (matcheados.length > 0) {
        console.log("\n🔍 Buscando repositorios en GitHub...");
        const usernames = matcheados.map((a) => a.usuario["Usuario Github Registrado"]);
        repoMap = await fetchReposForUsers(usernames); 
        
        datosCargados = true;
        saveCache(matcheados, repoMap);
        console.log("✅ ¡Datos escaneados, cacheados y listos para trabajar!");
      } else {
        console.log("\n❌ No quedaron alumnos para procesar con esos filtros.");
        datosCargados = false;
      }
      
      continue; 
    }

    const total = matcheados.length;

    // ==========================================
    // LÓGICA: MARCAR / DESMARCAR Y ARCHIVAR
    // ==========================================
    if (modoClonado === 'gestionar_corregidos') {
      const activos = matcheados.filter(a => 
        getAlumnoState(a.dni) === "EN_CORRECCION" || getAlumnoState(a.dni) === "CORREGIDO"
      );
      
      if (activos.length === 0) {
        console.log("\nℹ️ No hay repositorios en corrección para gestionar.");
        continue;
      }

      const opcionesCheckbox = activos.map(alumno => {
        const estadoActual = getAlumnoState(alumno.dni);
        const yaCorregido = estadoActual === 'CORREGIDO';
        return {
          name: `${yaCorregido ? '✅ (Corregido)' : '📂 (En proceso)'} ${alumno.nombre} (${alumno.dni})`,
          value: alumno,
          checked: yaCorregido 
        };
      });

      const alumnosSeleccionados = await checkbox({
        message: 'Marcá con Espacio los corregidos y desmarcá para revertir (Enter para confirmar):',
        choices: opcionesCheckbox,
      });

      const desmarcados = activos.filter(a => !alumnosSeleccionados.find(sel => sel.dni === a.dni));

      let revertidos = 0;
      for (const alumno of desmarcados) {
         if (getAlumnoState(alumno.dni) === 'CORREGIDO') {
             updateAlumnoState(alumno, 'EN_CORRECCION');
             revertidos++;
         }
      }
      if (revertidos > 0) {
         console.log(`\n⏪ Se revirtieron ${revertidos} entregas al estado "En proceso".`);
      }

      if (alumnosSeleccionados.length === 0) {
         console.log("\nNingún alumno quedó marcado como corregido. Volviendo al menú...");
         continue;
      }

      const archivar = await confirm({
        message: `Tenés ${alumnosSeleccionados.length} entregas marcadas como corregidas. ¿Querés archivarlas AHORA?\n  (⚠️ Esto guardará los feedback.md y BORRARÁ las carpetas del disco)`
      });

      if (archivar) {
        console.log(`\nArchivando y limpiando ${alumnosSeleccionados.length} repositorios...`);
        const historialDir = path.join(process.cwd(), 'historial_correcciones');
        if (!fs.existsSync(historialDir)) fs.mkdirSync(historialDir, { recursive: true });

        for (const alumno of alumnosSeleccionados) {
           const { folderPath, comisionFolder } = getPaths(alumno);
           
           const feedbackOrigen = path.join(folderPath, 'feedback.md');
           const comisionHistorialDir = path.join(historialDir, comisionFolder);
           if (!fs.existsSync(comisionHistorialDir)) fs.mkdirSync(comisionHistorialDir, { recursive: true });
           
           const feedbackDestino = path.join(comisionHistorialDir, `${alumno.dni}_${alumno.nombre}_feedback.md`);
           
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
        for (const alumno of alumnosSeleccionados) {
           updateAlumnoState(alumno, "CORREGIDO");
        }
        console.log(`\n✅ ${alumnosSeleccionados.length} entregas marcadas como "Corregidas". Los repositorios siguen en tu disco.`);
      }
      
      continue;
    }

    // ==========================================
    // LÓGICA DE CLONADO (Buscador Individual)
    // ==========================================
    if (modoClonado === 'individual') {
      const alumnoElegido = await search({
        message: 'Escribí el DNI, Nombre o GitHub para buscar (flechas para elegir, Enter para confirmar):',
        source: async (input) => {
          const opciones = matcheados.map((alumno) => {
            const estado = getAlumnoState(alumno.dni);
            let icono = '⬜';
            if (estado === "EN_CORRECCION") icono = '📂';
            if (estado === "CORREGIDO") icono = '✅';
            if (estado === "ARCHIVADO") icono = '🧹';
            
            return {
              name: `${icono} ${alumno.nombre} (${alumno.dni}) [@${alumno.usuario["Usuario Github Registrado"]}]`,
              value: alumno,
            };
          });

          if (!input) return opciones;
          const termino = input.toLowerCase();
          return opciones.filter((op) => op.name.toLowerCase().includes(termino));
        },
      });

      console.log(`\nProcesando a ${alumnoElegido.nombre}...`);
      const cloneUrl = repoMap.get(alumnoElegido.usuario["Usuario Github Registrado"].toLowerCase());
      scaffoldFolder(alumnoElegido, cloneUrl);
      updateAlumnoState(alumnoElegido, "EN_CORRECCION");
      console.log(`🎉 ¡Listo! Volviendo al menú principal...`);

    } else if (modoClonado === 'auto' || modoClonado === 'paso_a_paso') {
      // ==========================================
      // LÓGICA DE CLONADO (Lotes)
      // ==========================================
      const pasoAPaso = modoClonado === "paso_a_paso";
      let cancelado = false;

      console.log("\n📁 Procesando carpetas...\n");

      for (let i = 0; i < total; i++) {
        const alumno = matcheados[i];
        const porcentaje = Math.round(((i + 1) / total) * 100);
        const cloneUrl = repoMap.get(alumno.usuario["Usuario Github Registrado"].toLowerCase());
        const estado = getAlumnoState(alumno.dni);

        if (!config.DRY_RUN && estado !== "PENDIENTE") {
          console.log(`👤 [${i + 1}/${total}] (${porcentaje}%) ⏭️  Saltando (${estado}): ${alumno.nombre}`);
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
        updateAlumnoState(alumno, "EN_CORRECCION");
      }

      if (!cancelado) {
        console.log(`\n✅ Proceso por lotes finalizado. Encontrarás todo en: ${config.OUTPUT_DIR}`);
      }
    }
  }

  console.log(`\n👋 ¡Hasta luego! Cuidate.\n`);
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});