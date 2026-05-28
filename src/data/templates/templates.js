// Bundled trip templates — content-empty skeletons.
// Each entry exposes a build(label) function that returns a fresh itinerary
// matching the schema in specs/as-built.md. Activities/tips/warnings/links/
// images are intentionally left as empty arrays — templates ship structure,
// not substance, so they don't rot.

const TRIP_COLORS = ['#2E7D32', '#0277BD', '#AD1457', '#F57C00', '#7B1FA2', '#00838F']

function emptyDay(dayNumber) {
  return {
    dayNumber,
    date: '',
    location: '',
    subtitle: '',
    logistics: [],
    activities: [],
    tips: [],
    warnings: [],
    links: [],
    images: [],
  }
}

function buildPart({ id, emoji, title, color, daysRange, dayNumbers }) {
  return {
    id,
    emoji,
    title,
    color,
    daysRange,
    days: dayNumbers.map(emptyDay),
  }
}

function range(from, to) {
  const out = []
  for (let i = from; i <= to; i += 1) out.push(i)
  return out
}

function buildItinerary({ label, totalDays, parts }) {
  return {
    version: 1,
    title: label,
    label,
    subtitle: '',
    stats: [`${totalDays} days`],
    parts,
  }
}

function buildCityBreak3d(label) {
  return buildItinerary({
    label,
    totalDays: 3,
    parts: [
      buildPart({
        id: 1,
        emoji: '🏙️',
        title: 'Arrival & exploration',
        color: TRIP_COLORS[1],
        daysRange: 'Days 1 – 3',
        dayNumbers: range(1, 3),
      }),
    ],
  })
}

function buildRoadTrip7d(label) {
  return buildItinerary({
    label,
    totalDays: 7,
    parts: [
      buildPart({
        id: 1,
        emoji: '🚗',
        title: 'On the road',
        color: TRIP_COLORS[3],
        daysRange: 'Days 1 – 4',
        dayNumbers: range(1, 4),
      }),
      buildPart({
        id: 2,
        emoji: '🏁',
        title: 'Destination',
        color: TRIP_COLORS[0],
        daysRange: 'Days 5 – 7',
        dayNumbers: range(5, 7),
      }),
    ],
  })
}

function buildBeachWeek(label) {
  return buildItinerary({
    label,
    totalDays: 7,
    parts: [
      buildPart({
        id: 1,
        emoji: '🏖️',
        title: 'Beach week',
        color: TRIP_COLORS[5],
        daysRange: 'Days 1 – 7',
        dayNumbers: range(1, 7),
      }),
    ],
  })
}

function buildFamily7d(label) {
  return buildItinerary({
    label,
    totalDays: 7,
    parts: [
      buildPart({
        id: 1,
        emoji: '👨‍👩‍👧',
        title: 'Family arrival',
        color: TRIP_COLORS[2],
        daysRange: 'Days 1 – 3',
        dayNumbers: range(1, 3),
      }),
      buildPart({
        id: 2,
        emoji: '🎢',
        title: 'Adventures',
        color: TRIP_COLORS[3],
        daysRange: 'Days 4 – 7',
        dayNumbers: range(4, 7),
      }),
    ],
  })
}

function buildSkiWeek(label) {
  return buildItinerary({
    label,
    totalDays: 7,
    parts: [
      buildPart({
        id: 1,
        emoji: '⛷️',
        title: 'Mountain week',
        color: TRIP_COLORS[1],
        daysRange: 'Days 1 – 7',
        dayNumbers: range(1, 7),
      }),
    ],
  })
}

export const templates = [
  { id: 'city-break-3d', emoji: '🏙️', days: 3, nameKey: 'tplCityBreak3dName', descKey: 'tplCityBreak3dDesc', build: buildCityBreak3d },
  { id: 'road-trip-7d', emoji: '🚗', days: 7, nameKey: 'tplRoadTrip7dName', descKey: 'tplRoadTrip7dDesc', build: buildRoadTrip7d },
  { id: 'beach-week', emoji: '🏖️', days: 7, nameKey: 'tplBeachWeekName', descKey: 'tplBeachWeekDesc', build: buildBeachWeek },
  { id: 'family-with-kids-7d', emoji: '👨‍👩‍👧', days: 7, nameKey: 'tplFamily7dName', descKey: 'tplFamily7dDesc', build: buildFamily7d },
  { id: 'ski-week', emoji: '⛷️', days: 7, nameKey: 'tplSkiWeekName', descKey: 'tplSkiWeekDesc', build: buildSkiWeek },
]

export function getTemplate(id) {
  return templates.find(t => t.id === id) || null
}
