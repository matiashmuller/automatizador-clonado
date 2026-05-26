export type Alumno = Presente & { usuario: Usuario };
export type Falta = { dni: string; estado: string };
export type EstadoCorreccion = "PENDIENTE" | "EN_CORRECCION" | "CORREGIDO" | "ARCHIVADO" | "PUBLICADO";

export type Presente = {
  dni: string;
  nombre: string;
  presente: string;
};

export type Usuario = {
  DNI: string;
  "Usuario Github Registrado": string;
  Comision: string;
};

export type RegistroCorreccion = {
  dni: string;
  nombre: string;
  github: string;
  estado: EstadoCorreccion;
  fechaClonado?: string;
  fechaArchivado?: string;
};