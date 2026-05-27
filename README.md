🤖 Automatizador de entregas GitHub

CLI en TypeScript para automatizar la organización, clonación y gestión de entregas de alumnos desde GitHub a partir de CSVs de la cátedra.

Su objetivo es reducir el trabajo manual en correcciones masivas, mantener un estado local de cada entrega y facilitar la publicación de devoluciones como issues.

✨ Funcionalidades
📄 Lectura de CSVs (presentes, usuarios activos, faltas)
🎯 Filtrado por comisión y asistencia
🔗 Cruce automático DNI → usuario GitHub
🔎 Búsqueda de repositorios en GitHub (API)
📦 Clonado automático de entregas
🗂️ Estructura ordenada por comisión y alumno
📝 Generación de feedback.md por entrega
🧠 Sistema de estados de corrección
🔄 Sincronización con sistema de archivos
📨 Publicación de issues con devoluciones en GitHub
📁 Estructura generada

entregas/
└── comision/
└── DNI-Nombre-Apellido/
├── feedback.md
└── parcial-usuarioGithub/

⚙️ Instalación

npm install

Crear archivo .env en la raíz:

GITHUB_TOKEN=tu_token
GITHUB_ORG=tu_organizacion (opcional)
PARCIAL_PREFIX=parcial
ISSUE_TITLE=título de los issues (opcional)

📊 CSV requeridos

Colocar en la carpeta /data:

presentes.csv

Alumnos presentes el día del examen.

dni,nombre,presente
41222333,RODRIGUEZ TOMAS,true

usuarios_activos.csv

Relación DNI ↔ GitHub.

DNI,APELLIDO Y NOMBRE,Usuario Github Registrado,Actividad,Comision,GRUPO
40123456,PEREZ LUCAS,lucasp-dev,Active,Comisión - 1,Grupo Alpha

estado_faltas.csv

Control de inasistencias.

DNI,Apellido y Nombre,Inasistencias,Estado
39888777,GOMEZ VALENTINA,9,LIBRE

▶️ Ejecución

npx tsx src/main.ts

🔧 Flags

--dry-run → no escribe ni clona nada
--all-comisiones → procesa todo automáticamente

Ejemplo:

npx tsx src/main.ts --dry-run --all-comisiones

🧭 Flujo de uso
Carga de CSVs
Selección de comisiones
Matcheo de alumnos con GitHub
Clonado de repositorios
Corrección manual
Archivado de entregas
Publicación de issues con feedback
📌 Modos
Automático → clona todo lo pendiente
Paso a paso → confirma cada alumno
Individual → búsqueda manual
Sincronizar → actualiza estado desde disco
Gestionar corregidos → marcar/desmarcar
Reabrir archivados → restaurar entregas
Publicar issues → subir devoluciones
📦 Estados
PENDIENTE
EN_CORRECCION
CORREGIDO
ARCHIVADO
PUBLICADO
🔗 Repositorios

<PARCIAL_PREFIX>-<githubUser>

Ejemplo:

parcial-lucasp-dev

📝 Feedback

templates/feedback.md

🔐 GitHub Token

Requerido para:

buscar repositorios
clonar repos privados
crear issues

Permisos: repo

🎯 Objetivo

Optimizar el proceso de corrección de entregas masivas, reduciendo errores manuales y centralizando el flujo de trabajo.