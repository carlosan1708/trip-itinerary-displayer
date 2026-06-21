---
name: deploy
description: Build the app and deploy frontend to Firebase Hosting and backend to Cloud Run. Use when the user wants to ship changes live.
tools: Bash
disable-model-invocation: true
---

# Deploy

## 1. Backend env vars (Cloud Run)
The backend needs the WHOLE `backend/.env` at runtime, not just a couple of
keys. `--env-vars-file` REPLACES all env vars on the service, so any key you
omit is wiped — and several are required:
- `GEMINI_API_KEY`, `ADMIN_EMAIL`
- `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY`,
  `RECAPTCHA_MIN_SCORE` — demo mode fails closed (`recaptcha_failed`) without these
- `DEMO_TRIP_ID`, `DEMO_MAX_AI_CALLS`

Carry every key from `backend/.env` EXCEPT `GOOGLE_APPLICATION_CREDENTIALS`
(a local file path; on Cloud Run `auth.py` falls back to ApplicationDefault).
Override `FRONTEND_ORIGIN=https://mi-itinerario.web.app` and add
`FIREBASE_PROJECT_ID=canada-trip-e7056`. The step-5 script below does this.

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

Build the env file from `backend/.env` (carry ALL keys, drop GAC, add overrides)
without echoing secret values:
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

# Drop local-only keys that must NOT go to Cloud Run.
vals.pop("GOOGLE_APPLICATION_CREDENTIALS", None)

# Deploy-time overrides / additions.
vals["FRONTEND_ORIGIN"] = "https://mi-itinerario.web.app"
vals["FIREBASE_PROJECT_ID"] = "canada-trip-e7056"

required = ["GEMINI_API_KEY", "ADMIN_EMAIL",
            "RECAPTCHA_PROJECT_ID", "RECAPTCHA_API_KEY", "RECAPTCHA_SITE_KEY"]
missing = [k for k in required if not vals.get(k)]
if missing:
    sys.exit("MISSING required keys in backend/.env: " + ",".join(missing))

with open(out, "w") as fh:
    for k, v in vals.items():
        fh.write(f"{k}: {json.dumps(v)}\n")  # JSON-encoded = YAML-safe quoting
print("env file keys:", ", ".join(sorted(vals.keys())))
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
Health-check both services and confirm demo reCAPTCHA config is live:
```
curl -s -o /dev/null -w "frontend %{http_code}\n" https://mi-itinerario.web.app
curl -s -o /dev/null -w "backend  %{http_code}\n" <SERVICE_URL>/health
# Demo: a dummy token MUST reach Google (logs show "recaptcha: invalid token"),
# not fail closed on missing config. Confirm the env vars landed:
gcloud run services describe agent --region us-central1 --project canada-trip-e7056 \
  --format="value(spec.template.spec.containers[0].env[].name)" | tr ';' '\n' | grep -i recaptcha
```
There must be 3+ `RECAPTCHA_*` vars listed. Show the live URL
(`https://mi-itinerario.web.app`) and the Cloud Run service URL. Both health
checks should return `200`.
