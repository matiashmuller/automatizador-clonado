# Automatizador de corrección de entregas

CLI en TypeScript para preparar y gestionar la corrección de trabajos prácticos entregados vía GitHub. Cruza listas de alumnos con sus repos, los clona con estructura ordenada, y lleva el estado de cada entrega de punta a punta.

---

## Cómo funciona

1. Lee tres CSVs: presentes, usuarios GitHub y estado de faltas
2. Cruza los datos, filtra por comisión y detecta alumnos libres
3. Busca los repos en GitHub (por organización o por cuenta personal)
4. Clona cada repo y genera un `feedback.md` listo para corregir
5. Persiste el estado de cada entrega en `.estado_correcciones.json`

---

## Instalación

```bash
git clone <repo>
cd <repo>
npm install
```

Crear `.env` en la raíz:

```env
GITHUB_TOKEN=ghp_...                # Token con acceso a repos (requerido)
GITHUB_ORG=nombre-organizacion      # Si los repos están en una org (opcional)
PARCIAL_PREFIX=parcial              # Prefijo esperado de los repos
ISSUE_TITLE=Devolución TP           # Título del issue al publicar devoluciones
FILE_FALTAS=estado_faltas.csv       # Nombre de archivo que indica libres
FILE_PRESENTES=presentes.csv        # Nombre de archivo que indica presentes el día del examen
FILE_USUARIOS=usuarios_activos.csv  # Nombre de archivo que indica usuarios de github y comisión
```

---

## Archivos de datos requeridos

Deben estar en la carpeta `data/`. Los nombres se pueden cambiar desde `src/config.ts` o con variables de entorno (`FILE_PRESENTES`, `FILE_USUARIOS`, `FILE_FALTAS`).

| Archivo | Columnas mínimas |
|---|---|
| `presentes.csv` | `dni`, `nombre`, `presente` |
| `usuarios_activos.csv` | `DNI`, `Usuario Github Registrado`, `Comision` _(fila 1 se saltea)_ |
| `estado_faltas.csv` | `DNI`, `Estado` |

---

## Uso

```bash
npx tsx src/main.ts
```

Con flags opcionales:

```bash
npx tsx src/main.ts --dry-run          # Simula sin escribir nada en disco
npx tsx src/main.ts --all-comisiones   # Procesa todas las comisiones sin preguntar
```

Al iniciar, si los CSVs no cambiaron desde la última vez, los datos se cargan desde caché automáticamente.

---

## Menú principal

| Opción | Qué hace |
|---|---|
| 🤖 **Automático** | Clona todos los repos pendientes sin interrupciones |
| 👆 **Paso a paso** | Pide confirmación antes de cada alumno |
| 🔎 **Buscar repo individual** | Buscador dinámico por nombre, DNI o usuario GitHub |
| 🔄 **Sincronizar** | Escanea las carpetas locales y actualiza los estados (útil si pegaste repos a mano o borraste carpetas) |
| ✅ **Marcar / Desmarcar corregidos** | Cambia estados y archiva entregas (copia el `feedback.md` al historial y borra la carpeta) |
| 📦 **Reabrir archivados** | Devuelve entregas archivadas a Pendiente y elimina su `.md` del historial |
| 📨 **Publicar issues** | Publica la devolución como issue en el repo del alumno |
| 🗂️ **Reescanear datos** | Vuelve a leer los CSVs (útil para cambiar de comisión) |

Navegación: **↑↓** para moverse · **número** para entrar directo · **⌫** para volver.

---

## Estados de una entrega

```
PENDIENTE → EN_CORRECCION → CORREGIDO → ARCHIVADO → PUBLICADO
```

| Estado | Significa |
|---|---|
| `PENDIENTE` | Repo no clonado aún |
| `EN_CORRECCION` | Carpeta en disco, `feedback.md` sin nota |
| `CORREGIDO` | `feedback.md` tiene `## Nota:` completada |
| `ARCHIVADO` | Carpeta eliminada, `.md` guardado en `historial_correcciones/` |
| `PUBLICADO` | Issue publicado en el repo del alumno |

La sincronización detecta cambios automáticamente: si una carpeta reaparece en disco (re-clonado), vuelve a `EN_CORRECCION` y limpia su entrada del historial.

---

## Estructura de carpetas generada

```
entregas/
└── comision3/
    └── 12345678_APELLIDO-NOMBRE/
        ├── feedback.md
        └── parcial-usuariogithub/   ← repo clonado

historial_correcciones/
└── comision3/
    └── 12345678_APELLIDO-NOMBRE_feedback.md
```

---

## Archivos internos (no commitear)

| Archivo | Para qué |
|---|---|
| `.estado_correcciones.json` | Estado persistido de cada entrega |
| `.cache_datos.json` | Caché de CSVs + repos (se invalida si cambia algún CSV) |

Ambos están en `.gitignore`.
