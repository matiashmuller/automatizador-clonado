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

export type Alumno = Presente & { usuario: Usuario };
export type Falta = { dni: string; estado: string };