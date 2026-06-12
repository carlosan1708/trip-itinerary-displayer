# Media assets

GIFs referenced by the root `README.md`. **These are generated, not hand-recorded** —
to regenerate them after a UI change, run:

```bash
bash scripts/record-demos.sh
```

That drives the app (in mocked test mode) through each showcase flow with Playwright,
records video, and converts it to an optimized GIF with `ffmpeg`. Requires
`ffmpeg` (`brew install ffmpeg`) and Playwright's chromium (`npx playwright install chromium`).

| File | Flow | Recorder test |
|------|------|---------------|
| `ai-planner.gif` | Add-trip wizard → generated itinerary | `demo: ai-planner` |
| `ai-assistant.gif` | In-trip agent: ask → proposed diff | `demo: ai-assistant` |
| `dashboard.gif` | Admin My Trips + All Trips, open a trip | `demo: dashboard` |
| `edit-versions.gif` | Expand a day → logistics, files, notes | `demo: edit-versions` |

Flows live in `scripts/record-demos.spec.js`; config in `scripts/record-demos.config.js`.
