# Trip Itinerary Displayer

SPA para visualizar itinerarios de viaje compartidos. Autenticación con Google, datos sincronizados en Firestore y control de acceso por viaje.

**Live:** https://mi-itinerario.web.app

---

## Requisitos

- Node.js 18+ (`node --version`)
- npm 9+ (`npm --version`)
- Python 3.11+ (solo si corrés el backend local)

---

## Stack

| Capa | Tecnología |
|------|-----------|
| UI | React 18 + Material-UI v5 |
| Build | Vite 5 |
| Auth | Firebase Auth (Google Sign-In) |
| Base de datos | Firestore |
| Hosting | Firebase Hosting |
| Sync script | Node.js + Firebase Admin SDK |
| Backend AI | Python (FastAPI) + Gemini API |

---

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

Copiá `.env.example` → `.env` y completá los valores:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_EMAIL=tu@email.com
VITE_TRIP_ID=canada-2026

# Sync script
LOCAL_TRIP_FILE=src/data/canada/canada-trip.json
GOOGLE_APPLICATION_CREDENTIALS=/ruta/absoluta/service-account.json
```

Las credenciales Firebase están en **Firebase Console → Configuración del proyecto → General → Tus apps**.

El `service-account.json` se descarga en **Firebase Console → Configuración → Cuentas de servicio → Generar nueva clave privada**. Guardalo fuera del repo.

### 3. Levantar en desarrollo

```bash
npm run dev
# → http://localhost:5173
```

---

## Comandos

```bash
npm run dev           # Servidor de desarrollo
npm run build         # Build de producción → dist/
npm run preview       # Preview del build local

npm run sync:status   # Muestra versión local vs Firestore
npm run sync:upload   # Sube datos locales si versión local > cloud
npm run sync:download # Baja datos de Firestore si versión cloud > local
```

Para deploy usar el comando `/deploy` en Claude Code, que ejecuta automáticamente sync → build → firebase deploy.

```bash
npm run test:e2e      # Ejecuta tests E2E con Playwright
```

---

## Tests

Los tests E2E viven en `e2e/` y usan **Playwright**. En modo test, Firebase se reemplaza por mocks — el estado de auth y Firestore se controla via `window.__mockAuth` / `window.__mockFirestore` (ver `e2e/helpers.js`).

```bash
# Instalar browsers de Playwright (solo primera vez)
npx playwright install

# Correr todos los tests
npm run test:e2e

# Correr un test específico
npx playwright test e2e/nombre-test.spec.js

# Ver reporte HTML del último run
npx playwright show-report
```

---

## Arquitectura

```
src/
  components/
    AdminPanel.jsx          # Gestión de usuarios con acceso
    DayCard.jsx             # Tarjeta por día (acordeón editable)
    Header.jsx              # Encabezado con controles de admin
    LoginScreen.jsx         # Pantalla de login con Google
    PartSection.jsx         # Sección por parte del viaje
    TripEditorModal.jsx     # Editor JSON completo
    VersionHistoryModal.jsx # Historial de versiones (solo admin)
  data/
    canada/
      canada-trip.json      # Itinerario ruta Calgary (GATEWAY_TRIP_ID)
      canada-trip-2.json    # Itinerario ruta Vancouver
  utils/
    registry.js             # Gestión de viajes en localStorage
  App.jsx                   # Raíz: auth, carga de datos, sync de versión
  firebase.js               # Init Firebase
  theme.js                  # Tema MUI (paleta verde/rojo)
  main.jsx                  # Entry point

scripts/
  sync-data.mjs             # Sync local ↔ Firestore (Node.js + Admin SDK)

firestore.rules             # Reglas de seguridad Firestore
```

---

## Estructura Firestore

```
trips/{tripId}/
  data/
    itinerary               # Itinerario activo (JSON completo)
  versions/
    {auto-id}               # Snapshot por cada publicación
      version: number
      savedAt: timestamp
      savedBy: email
      source: "local_push" | "restore"
      data: { ...itinerary }
  allowed_users/
    {email}                 # Usuarios con acceso al viaje
      addedAt: timestamp
      addedBy: email
```

---

## Sistema de versiones

Cada JSON local tiene un campo `"version": N`. La regla es simple: **el número mayor gana**.

| Situación | Resultado |
|-----------|-----------|
| Local v5 > Cloud v4 | Se sube local a Firestore + snapshot |
| Local v3 < Cloud v10 | Se usa Firestore, local se ignora |
| Local v4 = Cloud v4 | Sin cambios |

**Para publicar cambios locales:** incrementar `"version"` en el JSON y correr `npm run sync:upload` (o `/deploy`).

**Para bajar cambios del cloud:** `npm run sync:download`.

Los admins pueden ver el historial completo y restaurar cualquier versión desde el botón **Versiones** en la app.

---

## Control de acceso

- Solo usuarios en `allowed_users/{email}` pueden ver el itinerario
- El admin (`VITE_ADMIN_EMAIL`) tiene acceso automático y puede agregar/quitar usuarios desde el panel **Accesos**
- Las Firestore rules bloquean todo acceso no autorizado a nivel de servidor

---

## Datos del itinerario

Estructura del JSON:

```json
{
  "version": 4,
  "title": "Itinerario Canadá",
  "subtitle": "Sep 12 – Sep 30, 2026",
  "stats": ["19 días", "3 provincias", "5 ciudades", "SJO → YYZ"],
  "parts": [
    {
      "id": 1,
      "emoji": "🏔️",
      "title": "Las Rocosas",
      "color": "#2E7D32",
      "daysRange": "Días 1 – 7",
      "days": [
        {
          "dayNumber": 1,
          "date": "Sáb 12 Sep",
          "location": "Calgary",
          "subtitle": "Llegada",
          "logistics": [{ "type": "flight", "label": "Vuelo", "value": "SJO → YYC" }],
          "activities": ["..."],
          "tips": ["..."],
          "warnings": ["..."],
          "links": [{ "label": "Nombre", "url": "https://..." }],
          "images": [{ "url": "https://...", "caption": "..." }]
        }
      ]
    }
  ]
}
```

Los tipos de logística válidos: `flight`, `drive`, `stay`, `train`.

---

## Backend (Agente IA)

El backend es un servicio Python (FastAPI) que expone endpoints para generar y editar itinerarios usando Gemini.

```
backend/
  main.py          # Entry point FastAPI
  chat.py          # Endpoint /agent/chat — agente de itinerarios
  create.py        # Endpoint /agent/create — creación desde cero
  auth.py          # Verificación de tokens Firebase
  config.py        # Configuración desde variables de entorno
  requirements.txt # Dependencias Python
  Dockerfile       # Para Cloud Run
```

### Correr el backend localmente

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # Completar las variables
uvicorn main:app --reload       # → http://localhost:8000
```

El frontend (Vite) ya proxea `/agent/**`, `/auth/**` y `/health` hacia `localhost:8000` en modo dev.

---

## Firebase rules

Después de modificar `firestore.rules`, deployar por separado:

```bash
firebase deploy --only firestore:rules
```
