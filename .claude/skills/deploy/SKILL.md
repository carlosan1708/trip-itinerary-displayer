---
name: deploy
description: Build the app and deploy frontend to Firebase Hosting and backend to Cloud Run. Use when the user wants to ship changes live.
tools: Bash
disable-model-invocation: true
---

# Deploy

## 1. Read env vars (needed for backend deploy)
Load from `backend/.env` (not the root `.env`):
- `GEMINI_API_KEY`
- `ADMIN_EMAIL`

## 2. Sync data to Firestore (optional)
If `GOOGLE_APPLICATION_CREDENTIALS` is set in `.env` and the file exists, run:
```
npm run sync:upload
```
Otherwise skip and warn the user.

## 3. Build frontend
```
npm run build
```
Verify `dist/` was produced. If the build fails, stop — do not continue.

## 4. Deploy frontend
```
firebase deploy --only hosting
```

## 5. Deploy backend to Cloud Run
Read env vars from `backend/.env` and pass them explicitly:
```
GEMINI_API_KEY=$(grep "^GEMINI_API_KEY=" backend/.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
ADMIN_EMAIL=$(grep "^ADMIN_EMAIL=" backend/.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
gcloud run deploy agent \
  --source backend/ \
  --region us-central1 \
  --project canada-trip-e7056 \
  --allow-unauthenticated \
  --min-instances 1 \
  --memory 512Mi \
  --timeout 300 \
  --clear-base-image \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY},ADMIN_EMAIL=${ADMIN_EMAIL},FRONTEND_ORIGIN=https://mi-itinerario.web.app,FIREBASE_PROJECT_ID=canada-trip-e7056"
```

## 6. Report results
Show the live URL (`https://mi-itinerario.web.app`) and Cloud Run service URL from the output.
