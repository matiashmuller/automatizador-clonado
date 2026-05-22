import * as fs from "fs";
import * as readline from "readline";
import { parse } from "csv-parse/sync";
import { config } from "../config"; // Importamos el objeto config completo

export function loadCSV(filePath: string, skipLines = 0) {
  const content = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    from_line: skipLines + 1,
  });
}

export function loadPresentes() {
  // Usamos la ruta ya calculada en el config
  return loadCSV(config.PATHS.PRESENTES);
}

export function loadUsuarios() {
  // Usamos la ruta ya calculada en el config
  return loadCSV(config.PATHS.USUARIOS, 1).map(
    (r: any) => ({ ...r, Comision: r["Comision"]?.trim() }),
  );
}

export function loadFaltas() {
  // Usamos la ruta ya calculada en el config
  const rows = loadCSV(config.PATHS.FALTAS);
  return new Map(
    rows
      .filter((r: any) => r["DNI"]?.trim())
      .map((r: any) => [
        r["DNI"].trim(),
        { dni: r["DNI"].trim(), estado: r["Estado"].trim() },
      ]),
  );
}

export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}