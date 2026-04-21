# Trip Planning Skill

Use this skill when the user asks to plan a new trip, add a new itinerary, or generate a JSON for a new destination.

## Your role
You are a travel planning assistant. Help the user build a complete, well-structured itinerary JSON that works with this app.

---

## Step 1 — Gather trip info

Ask the user the following questions **one by one** (wait for each answer before asking the next):

1. What is the trip name and dates (start – end)?
2. How many days total?
3. Origin and destination airports/cities (e.g. SJO → YVR)?
4. How many parts/stages does the trip have? (e.g. Part 1: Rockies, Part 2: Cities)
5. For each part: name, day range, emoji, preferred color (#hex)
6. For each day: date, location, day subtitle, transport used (flights, drives, trains, accommodation), activities, tips, warnings

---

## Step 2 — Generate the JSON

Produce a JSON with **exactly** this structure:

```json
{
  "version": 1,
  "author": "<current user email>",
  "title": "Trip Name",
  "subtitle": "Sep 12 – Sep 30, 2026",
  "stats": ["19 días", "3 regiones", "5 ciudades", "SJO → YYZ"],
  "parts": [
    {
      "id": 1,
      "emoji": "🏔️",
      "title": "Part Name",
      "color": "#2E7D32",
      "daysRange": "Días 1 – 7",
      "days": [
        {
          "dayNumber": 1,
          "date": "Sáb 12 Sep",
          "location": "City",
          "subtitle": "Short day description",
          "logistics": [
            { "type": "flight", "label": "Vuelo",      "value": "SJO → YYZ" },
            { "type": "drive",  "label": "Drive",       "value": "Airport → Hotel: 30 min" },
            { "type": "stay",   "label": "Alojamiento", "value": "Hotel name" },
            { "type": "train",  "label": "Tren",        "value": "City A → City B" }
          ],
          "activities": [
            "Activity 1 — include estimated duration and practical tip",
            "Activity 2"
          ],
          "tips":     ["Practical tip for the day"],
          "warnings": ["Important warning if any"],
          "links":    [{ "label": "Name", "url": "https://..." }],
          "images":   [
            { "url": "https://...", "caption": "Description" }
          ],
          "optional_alternatives": ["Optional activity if time permits"]
        }
      ]
    }
  ]
}
```

---

## JSON Rules

- `type` in logistics: only `"flight"`, `"drive"`, `"stay"`, or `"train"`
- `tips`, `warnings`, `links`, `images`, `optional_alternatives` can be empty arrays `[]`
- Suggested part colors: `"#2E7D32"` green, `"#0277BD"` blue, `"#AD1457"` pink, `"#F57C00"` orange, `"#7B1FA2"` purple, `"#00838F"` teal
- Activities: aim for 3–5 per day with practical detail (duration, booking tips, best time)
- Include `optional_alternatives` for days with spare time

---

## Image rules (CRITICAL — learned from experience)

Images are optional but greatly improve the experience. When adding images:

### Always use Wikimedia Commons
Use the Wikimedia Commons API to get **pre-cached thumbnail URLs**. Never guess or construct URLs manually.

**API call to get the correct URL:**
```
https://commons.wikimedia.org/w/api.php?action=query&titles=File:FILENAME.jpg&prop=imageinfo&iiprop=url&iiurlwidth=1024&format=json
```
Use the `thumburl` field from the response — **do not modify the size** in it (Wikimedia returns whatever size is pre-cached; typically 1280px).

### Why this matters
- Wikimedia caches thumbnails at specific sizes (commonly 1280px). Requesting a non-cached size (e.g. 1024px) causes 429 errors for users.
- If the API returns a direct URL (no `/thumb/` path), the image is too small to thumbnail — use that direct URL as-is.
- Never manually construct `/thumb/HASH/FILENAME/1024px-FILENAME` URLs — always get them from the API.

### Verify before adding
Always verify each file exists via the API before adding it. A wrong filename → 404 for all users.

### Format
```json
{ "url": "<thumburl from API>", "caption": "Brief description" }
```
Aim for 2–3 images per day, landscape orientation preferred.

---

## Step 3 — Save the file

After generating the JSON, save it to:
```
src/data/{destination-folder}/{destination-id}.json
```

Then register it in `src/data/trips-registry.js` under the appropriate folder. Use an `id` that matches the filename (without `.json`). Set `author` in the registry entry to the same email used in the JSON.

Then run `/sync` to push to the cloud.
