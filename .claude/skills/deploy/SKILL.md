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

**Never inline `GEMINI_API_KEY` on the command line** (e.g. via `--set-env-vars`):
the secret would leak into the shell transcript / process args and the sandbox
blocks it as credential leakage. Pass env vars through a temp `--env-vars-file`
instead, then delete it.

Build the env file from `backend/.env` without echoing secret values:
```
ENVFILE=$(mktemp -t agent-env-XXXXXX).yaml
python3 - "$ENVFILE" <<'PY'
import sys, json
out = sys.argv[1]
vals = {}
with open("backend/.env") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        vals[k.strip()] = v.strip().strip('"').strip("'")
env = {
    "GEMINI_API_KEY":      vals.get("GEMINI_API_KEY", ""),
    "ADMIN_EMAIL":         vals.get("ADMIN_EMAIL", ""),
    "FRONTEND_ORIGIN":     "https://mi-itinerario.web.app",
    "FIREBASE_PROJECT_ID": "canada-trip-e7056",
}
missing = [k for k in ("GEMINI_API_KEY", "ADMIN_EMAIL") if not env[k]]
if missing:
    sys.exit("MISSING in backend/.env: " + ",".join(missing))
with open(out, "w") as fh:
    for k, v in env.items():
        fh.write(f"{k}: {json.dumps(v)}\n")  # JSON-encoded = YAML-safe quoting
print("env file keys:", ", ".join(env.keys()))
PY
```

Deploy with the file, then remove it:
```
gcloud run deploy agent \
  --source backend/ \
  --region us-central1 \
  --project canada-trip-e7056 \
  --allow-unauthenticated \
  --min-instances 1 \
  --memory 512Mi \
  --timeout 300 \
  --clear-base-image \
  --env-vars-file "$ENVFILE"
rm -f "$ENVFILE"
```

## 6. Verify + report results
Health-check both services, then report:
```
curl -s -o /dev/null -w "frontend %{http_code}\n" https://mi-itinerario.web.app
curl -s -o /dev/null -w "backend  %{http_code}\n" <SERVICE_URL>/health
```
Show the live URL (`https://mi-itinerario.web.app`) and the Cloud Run service
URL from the deploy output. Both should return `200`.
