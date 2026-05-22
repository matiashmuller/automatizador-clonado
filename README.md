# Automatizador de corrección de entregas GitHub

Herramienta CLI desarrollada en TypeScript para automatizar la preparación de correcciones de exámenes o trabajos prácticos entregados mediante repositorios de GitHub.

El script:

- procesa listados de alumnos desde archivos CSV,
- cruza información de asistencia, faltas y usuarios GitHub,
- detecta alumnos ausentes o libres,
- busca automáticamente los repositorios correspondientes,
- clona las entregas,
- genera una estructura ordenada por comisión,
- y crea archivos `feedback.md` listos para corregir.

Pensado para cátedras con muchas entregas y necesidad de preparar correcciones rápidamente.

---

# Funcionalidades

- ✅ Carga automática de alumnos presentes
- ✅ Filtrado por comisión
- ✅ Modo `--all-comisiones`
- ✅ Detección de alumnos en condición `LIBRE`
- ✅ Confirmación manual para incluir alumnos libres
- ✅ Cruce automático con usuarios GitHub
- ✅ Búsqueda de repositorios vía API de GitHub
- ✅ Soporte para organizaciones (`GITHUB_ORG`)
- ✅ Clonado automático de repositorios
- ✅ Generación de estructura ordenada de carpetas
- ✅ Creación automática de `feedback.md`
- ✅ Modo `--dry-run` (sin escribir archivos)
- ✅ Configuración flexible mediante `.env` y `config.ts`

---

# Stack utilizado

- TypeScript
- Node.js
- GitHub REST API
- `csv-parse`
- `tsx`
- `dotenv`

---

# Estructura del proyecto

```txt
.
├── data/
│   ├── estado_faltas.csv
│   ├── presentes.csv
│   └── usuarios_activos.csv
│
├── entregas/
│   └── Comisión - X/
│       └── DNI - Nombre Alumno/
│           ├── feedback.md
│           └── parcial-usuarioGithub/
│
├── src/
│   ├── services/
│   │   ├── fileManager.ts
│   │   └── gitService.ts
│   │
│   ├── utils/
│   │   └── dataParser.ts
│   │
│   ├── config.ts
│   ├── main.ts
│   └── types.ts
│
├── templates/
│   └── feedback.md
│
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

---

# Instalación

## 1. Clonar el repositorio

```bash
git clone <repo>
cd <repo>
```

---

## 2. Instalar dependencias

```bash
npm install
```

---

## 3. Crear archivo `.env`

```env
GITHUB_TOKEN=tu_token
GITHUB_ORG=nombre_org
PARCIAL_PREFIX=parcial
```

---

# Variables de entorno

| Variable | Descripción |
|---|---|
| `GITHUB_TOKEN` | Token personal de GitHub para acceder a la API y clonar repos privados |
| `GITHUB_ORG` | Organización donde buscar repositorios. Si no se define, el script buscará los repositorios directamente en las cuentas personales de los alumnos |
| `PARCIAL_PREFIX` | Prefijo esperado de los repositorios |

---

# Archivos CSV requeridos

Los nombres pueden cambiarse desde `src/config.ts` o mediante variables de entorno.

---

## `estado_faltas.csv`

Archivo que muestra los alumnos al límite de faltas o libres hasta el día del examen.

### Formato

```csv
DNI,Apellido y Nombre,Inasistencias,Estado
```

### Ejemplo

```csv
"40123456","PEREZ, LUCAS MARTIN","7","LIMITE"
"39888777","GOMEZ, VALENTINA","9","LIBRE"
```

### Uso

El script detecta automáticamente alumnos en condición `LIBRE` y pregunta si deben incluirse igualmente.

### Obtención

Se obtiene scrapeando el SIU Guaraní en la página de “inasistencias acumuladas” o armando manualmente el CSV.

---

## `presentes.csv`

Archivo que contiene los alumnos presentes el día del examen.

### Formato

```csv
dni,nombre,presente
```

### Ejemplo

```csv
"41222333","RODRIGUEZ, TOMAS","true"
"40999111","MARTINEZ, SOFIA","false"
```

### Uso

Solo se procesan alumnos con:

```txt
presente = true
```

### Obtención

Se obtiene scrapeando el SIU Guaraní desde la pantalla de asistencia del examen o armando manualmente el CSV.

---

## `usuarios_activos.csv`

Archivo maestro con los usuarios GitHub registrados por alumno.

### Formato

```csv
DNI,APELLIDO Y NOMBRE,Usuario Github Registrado,Actividad,Comision,GRUPO
```

### Ejemplo

```csv
40123456,PEREZ LUCAS,lucasp-dev,Active,Comisión - 1,Grupo Alpha
```

### Uso

El script utiliza este archivo para:

- cruzar DNI ↔ usuario GitHub,
- detectar comisión,
- encontrar repositorios.

### Obtención

Se obtiene descargando la hoja correspondiente desde la planilla de seguimiento de la cátedra.

---

# Configuración (`src/config.ts`)

Toda la configuración centralizada se encuentra en:

```ts
src/config.ts
```

## Configuración actual

```ts
export const config = {
  DRY_RUN: process.argv.includes("--dry-run"),
  ALL_COMISIONES: process.argv.includes("--all-comisiones"),

  PARCIAL_PREFIX: process.env.PARCIAL_PREFIX ?? "parcial",
  GITHUB_ORG: process.env.GITHUB_ORG ?? "",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",

  DATA_DIR,
  OUTPUT_DIR: path.join(process.cwd(), "entregas"),

  FILES: {
    FALTAS: process.env.FILE_FALTAS ?? "estado_faltas.csv",
    PRESENTES: process.env.FILE_PRESENTES ?? "presentes.csv",
    USUARIOS: process.env.FILE_USUARIOS ?? "usuarios_activos.csv",
  }
};
```

---

# Uso

## Ejecución normal

```bash
npx tsx src/main.ts
```

El script preguntará:

```txt
Comisiones a procesar (ej: 1,3):
```

---

## Procesar todas las comisiones

```bash
npx tsx src/main.ts --all-comisiones
```

---

## Ejecutar en modo simulación

No escribe archivos ni clona repos.

```bash
npx tsx src/main.ts --dry-run
```

---

## Combinar flags

```bash
npx tsx src/main.ts --all-comisiones --dry-run
```

---

# Cómo busca repositorios

El sistema espera repositorios con el formato:

```txt
<PARCIAL_PREFIX>-<usuarioGithub>
```

Por ejemplo:

```txt
parcial-lucasp-dev
```

---

## Con organización (`GITHUB_ORG`)

Busca repositorios dentro de una organización.

Por ejemplo:

```txt
mi-catedra/parcial-lucasp-dev
```

Este modo es útil cuando todas las entregas están centralizadas en una organización de GitHub.

---

## Sin organización

Si `GITHUB_ORG` no está definido, el script buscará los repositorios directamente en las cuentas personales de los alumnos.

Por ejemplo:

```txt
lucasp-dev/parcial-lucasp-dev
```

---

# Estructura generada

El script genera automáticamente:

```txt
entregas/
└── Comisión - 1/
    └── 40123456 - PEREZ LUCAS/
        ├── feedback.md
        └── parcial-lucasp-dev/
```

---

# Plantilla de feedback

Cada alumno recibe automáticamente un archivo:

```txt
feedback.md
```

basado en:

```txt
templates/feedback.md
```

La plantilla incluye:

- estado general,
- observaciones,
- tests,
- nota,
- publicación,
- checklist.

---

# Flujo completo del programa

## 1. Carga de CSVs

- presentes
- usuarios
- faltas

---

## 2. Filtrado de alumnos

- presentes reales
- comisión elegida
- alumnos libres

---

## 3. Cruce de información

```txt
DNI → usuario GitHub
```

---

## 4. Búsqueda de repositorios

Usando GitHub API.

---

## 5. Confirmación de clonado

El usuario decide continuar o abortar.

---

## 6. Generación de estructura

- carpetas
- feedbacks
- clonación de repos

---

# Ejemplo de salida

```txt
Presentes confirmados: 42
Matcheados con GitHub: 40
Sin match:             2

📋 Alumnos a procesar:
  - Lucas Perez → @lucasp-dev

✅ parcial-lucasp-dev

¿Proceder a clonar 40 repos encontrados? (s/N):
```

---

# GitHub token recomendado

Para evitar límites de rate-limit de la API de GitHub, se recomienda generar un token personal.

Permisos sugeridos:

- `repo` si los repositorios son privados

---

# Archivos ignorados

El proyecto ignora automáticamente:

```txt
/data
/entregas
/node_modules
.env
```

---

# Posibles mejoras futuras

- Exportar reportes CSV/Excel
- Interfaz web
- Corrección automática básica
- Integración con GitHub Classroom
- Pull automático de repos existentes
- Soporte para múltiples parciales
- Paralelización de clones
- Dashboard de corrección

---

# Licencia

MIT

---

# Objetivo

Reducir drásticamente el tiempo operativo de preparación de correcciones masivas y minimizar errores manuales al organizar entregas de alumnos.