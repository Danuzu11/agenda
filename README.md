# Agenda Trabajo

Tracker personal de horas de trabajo con CRUD real sincronizado a Google Sheets con google.

## Estructura del proyecto

```
agenda/
├── index.html          # Página principal
├── css/
│   └── styles.css      # Estilos
├── js/
│   ├── app.js          # Lógica de la aplicación
│   ├── config.js       # Credenciales (generado, no se sube a git)
│   └── config.example.js
├── scripts/
│   └── build-config.js # Lee .env y genera config.js + dist/
├── .env.example        # Plantilla de credenciales
└── dist/               # Build para GitHub Pages (generado)
```

## Requisitos

- [Node.js](https://nodejs.org/) 18+
- Una API Key de Google Cloud con **Google Sheets API** habilitada
- Un **OAuth Client ID (Web application)** del mismo proyecto de Google Cloud
- Un Google Spreadsheet con pestañas por mes (ej: `Junio 2026`)

### Formato del spreadsheet

Cada pestaña debe tener estas columnas para funcionar:

| A (día) | B (horas) | C (actividades) |
|---------|-----------|-----------------|
| 1       | 4.5       | Descripción...  |

## Configuración local

1. Clona el repositorio:

```bash
git clone https://github.com/TU_USUARIO/agenda.git
cd agenda
```

2. Instala dependencias:

```bash
npm install
```

3. Crea tu archivo `.env` a partir del ejemplo:

```bash
cp .env.example .env
```

4. Edita `.env` con tus credenciales:

```env
GOOGLE_API_KEY=AIza...
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_SHEET_ID=1IuUw-C4nx9daHfBFLzArKIKhd0UmFzQr61Djj5Pu0rU
```

> **Sheet ID**: es la parte larga de la URL del spreadsheet:
> `https://docs.google.com/spreadsheets/d/ESTE_ID/edit`

5. Genera la configuración y arranca el servidor local:

```bash
npm run dev
```

Abre `http://localhost:3000` en el navegador.

6. Pulsa **iniciar sesión** para autorizar con Google OAuth.

## Despliegue en GitHub Pages

Las credenciales se inyectan en build time desde **GitHub Secrets** (no hay panel de configuración en la UI).

### 1. Configura los secrets del repositorio

En GitHub → **Settings → Secrets and variables → Actions → Repository secrets**, agrega:

| Secret | Valor |
|--------|-------|
| `GOOGLE_API_KEY` | Tu API Key de Google |
| `GOOGLE_CLIENT_ID` | Tu OAuth Client ID |
| `GOOGLE_SHEET_ID` | ID de tu spreadsheet |

> Deben ser **Secrets**, no Variables. Los nombres deben ser exactos.

### 2. Activa GitHub Pages desde `gh-pages`

En **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `gh-pages` → `/ (root)`

El workflow publica la carpeta `dist/` (con `config.js` generado) en la rama `gh-pages`.

### 3. Verifica el deploy

1. Ve a **Actions** → **Deploy to GitHub Pages** (debe estar en verde)
2. Abre `https://TU_USUARIO.github.io/agenda/js/config.js` — no debe dar 404 ni tener `clientId: ""`
3. Abre la app y pulsa **iniciar sesión**

Tu app quedará disponible en:
`https://TU_USUARIO.github.io/agenda/`

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run build` | Lee `.env` y genera `js/config.js` + carpeta `dist/` |
| `npm run dev` | Build + servidor local en el proyecto |
| `npm run preview` | Build + servidor local con la carpeta `dist/` |

## Notas de seguridad

- El archivo `.env` y `js/config.js` **nunca** se suben a git (están en `.gitignore`)
- En producción (GitHub Pages), las credenciales se inyectan vía **GitHub Secrets** durante el build
- El OAuth Client ID y API Key son públicos por diseño en apps frontend
- Restringe tu API Key en Google Cloud Console → **API restrictions** y **HTTP referrers**
- Configura también los **Authorized JavaScript origins** de tu OAuth Client ID (localhost + dominio de GitHub Pages)

## Funcionalidades

- CRUD completo sincronizado a Google Sheets (sin edición manual en Sheets)
- Crear y borrar pestañas directamente desde la app
- Agregar, editar y eliminar filas directamente en Sheets
- Estadísticas: total horas, días trabajados, promedio
- Exportación a CSV
- Login con Google OAuth (sin exponer credenciales en la UI)
