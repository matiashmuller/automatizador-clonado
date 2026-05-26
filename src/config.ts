import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

export const config = {
  // Flags de ejecución
  DRY_RUN: process.argv.includes("--dry-run"),
  ALL_COMISIONES: process.argv.includes("--all-comisiones"),

  // Variables de entorno / configuraciones
  PARCIAL_PREFIX: process.env.PARCIAL_PREFIX ?? "parcial",
  GITHUB_ORG: process.env.GITHUB_ORG ?? "",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",
  ISSUE_TITLE: process.env.ISSUE_TITLE ?? "",

  // Directorios
  DATA_DIR,
  OUTPUT_DIR: path.join(process.cwd(), "entregas"),
  FEEDBACK_TEMPLATE: path.join(process.cwd(), "templates", "feedback.md"),

  // Nombres de archivos
  FILES: {
    FALTAS: process.env.FILE_FALTAS ?? "estado_faltas.csv",
    PRESENTES: process.env.FILE_PRESENTES ?? "presentes.csv",
    USUARIOS: process.env.FILE_USUARIOS ?? "usuarios_activos.csv",
  },

  // Rutas completas calculadas
  PATHS: {
    FALTAS: path.join(DATA_DIR, process.env.FILE_FALTAS ?? "estado_faltas.csv"),
    PRESENTES: path.join(DATA_DIR, process.env.FILE_PRESENTES ?? "presentes.csv"),
    USUARIOS: path.join(DATA_DIR, process.env.FILE_USUARIOS ?? "usuarios_activos.csv"),
  }
};