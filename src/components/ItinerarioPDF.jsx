import {
  Document, Page, Text, View, StyleSheet, Link, Image,
} from '@react-pdf/renderer'

// ── Section labels ──────────────────────────────────────────────────
// react-pdf renders outside the React tree, so it can't use the i18n
// context. Labels are passed in based on the app's active language.
const PDF_LABELS = {
  en: {
    logistics: 'Logistics', activities: 'Activities', tips: 'Tips',
    warnings: 'Warnings', links: 'Useful links', images: 'Reference photos',
  },
  es: {
    logistics: 'Logística', activities: 'Actividades', tips: 'Tips',
    warnings: 'Advertencias', links: 'Links útiles', images: 'Fotos de referencia',
  },
}

// ── Helpers ─────────────────────────────────────────────────────────
const logisticIcon = { flight: '✈  ', drive: '⬤  ', stay: '⌂  ', train: '⬤  ' }

function stripBold(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '$1')
}

function RichText({ text, style }) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>{p}</Text>
          : p
      )}
    </Text>
  )
}

// ── Styles ───────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Pages
  page: {
    paddingTop: 42, paddingBottom: 52, paddingHorizontal: 44,
    fontFamily: 'Helvetica', fontSize: 9.5, color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  coverPage: {
    paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0,
    backgroundColor: '#0d1b2a',
  },

  // Cover
  coverBar:     { height: 6, backgroundColor: '#2E7D32' },
  coverBody:    { paddingHorizontal: 55, paddingTop: 90 },
  coverTitle:   { fontSize: 36, fontFamily: 'Helvetica-Bold', color: '#fff', marginBottom: 10 },
  coverSub:     { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 48, letterSpacing: 1.5 },
  coverStat:    { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 7 },
  coverStatVal: { fontFamily: 'Helvetica-Bold', color: 'rgba(255,255,255,0.8)' },
  coverFooter: {
    position: 'absolute', bottom: 36, left: 55, right: 55,
    borderTop: '0.5px solid rgba(255,255,255,0.15)', paddingTop: 14,
  },
  coverFooterText: { fontSize: 8.5, color: 'rgba(255,255,255,0.25)' },

  // Part header
  partHeader: {
    paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 4, borderRadius: 4,
  },
  partEmoji: { fontSize: 18, marginBottom: 5, color: '#fff' },
  partTitle: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: '#fff', marginBottom: 3 },
  partRange: { fontSize: 9.5, color: 'rgba(255,255,255,0.72)' },

  // Day
  daySection:   { marginBottom: 20, paddingBottom: 16 },
  dayDivider:   { borderBottom: '0.5px solid #e0e0e0', marginBottom: 14 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 },
  dayBadge: {
    width: 38, minHeight: 38, borderRadius: 19,
    backgroundColor: '#f2f2f2',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, flexShrink: 0,
  },
  dayBadgeNum:  { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#333' },
  dayInfo:      { flex: 1 },
  dayDate:      { fontSize: 8.5, color: '#999', marginBottom: 2 },
  dayLocation:  { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 1 },
  daySubtitle:  { fontSize: 9, color: '#666', fontFamily: 'Helvetica-Oblique' },

  // Section label
  sLabel: {
    fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#aaa',
    letterSpacing: 0.7, marginTop: 9, marginBottom: 5,
  },

  // Logistics
  logRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  logLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#555', width: 68, flexShrink: 0 },
  logValue: { fontSize: 9.5, color: '#1a1a1a', flex: 1, lineHeight: 1.4 },

  // Activity
  actRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3.5 },
  actDot: {
    width: 4, height: 4, borderRadius: 2,
    marginRight: 8, marginTop: 3.5, flexShrink: 0,
  },
  actText: { fontSize: 9.5, flex: 1, lineHeight: 1.45, color: '#1a1a1a' },

  // Tip
  tipBox:  {
    backgroundColor: '#f0f6ff', borderRadius: 3,
    paddingVertical: 5, paddingHorizontal: 8, marginBottom: 4,
  },
  tipText: { fontSize: 9, color: '#1455a4', lineHeight: 1.4 },

  // Warning
  warnBox: {
    backgroundColor: '#fff5f0', borderRadius: 3,
    paddingVertical: 5, paddingHorizontal: 8, marginBottom: 4,
  },
  warnText: { fontSize: 9, color: '#b71c1c', lineHeight: 1.4 },

  // Links
  linkText: { fontSize: 9, color: '#0277BD', marginBottom: 2 },

  // Images
  imagesGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 },
  imgWrapper: { width: '49%', marginBottom: 5 },
  imgWrapperLeft:  { marginRight: '2%' },
  dayImage: { width: '100%', height: 88, objectFit: 'cover', borderRadius: 3 },
  imgCaption: { fontSize: 7, color: '#999', textAlign: 'center', marginTop: 2 },

  // Footer
  footer: {
    position: 'absolute', bottom: 22, left: 44, right: 44,
    borderTop: '0.5px solid #e8e8e8', paddingTop: 6,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  footerText: { fontSize: 7.5, color: '#c0c0c0' },
})

// ── Sub-components ───────────────────────────────────────────────────
function PageFooter({ title }) {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>{title}</Text>
      <Text style={S.footerText} render={({ pageNumber, totalPages }) =>
        `${pageNumber} / ${totalPages}`
      } />
    </View>
  )
}

function SectionLabel({ children }) {
  return <Text style={S.sLabel}>{children}</Text>
}

function DaySection({ day, partColor, labels }) {
  const hasLogistics  = day.logistics?.length > 0
  const hasActivities = day.activities?.length > 0
  const hasTips       = day.tips?.length > 0
  const hasWarnings   = day.warnings?.length > 0
  const hasLinks      = day.links?.length > 0
  const hasImages     = day.images?.length > 0

  return (
    <View style={S.daySection} wrap={false}>
      {/* Header */}
      <View style={S.dayHeaderRow}>
        <View style={[S.dayBadge, { backgroundColor: partColor + '22' }]}>
          <Text style={[S.dayBadgeNum, { color: partColor }]}>{day.dayNumber}</Text>
        </View>
        <View style={S.dayInfo}>
          <Text style={S.dayDate}>{day.date}</Text>
          <Text style={S.dayLocation}>{day.location}</Text>
          {day.subtitle ? <Text style={S.daySubtitle}>{day.subtitle}</Text> : null}
        </View>
      </View>

      {/* Logistics */}
      {hasLogistics && (
        <>
          <SectionLabel>{labels.logistics}</SectionLabel>
          {day.logistics.map((l, i) => (
            <View key={i} style={S.logRow}>
              <Text style={S.logLabel}>{l.label}</Text>
              <Text style={S.logValue}>{l.value}</Text>
            </View>
          ))}
        </>
      )}

      {/* Activities */}
      {hasActivities && (
        <>
          <SectionLabel>{labels.activities}</SectionLabel>
          {day.activities.map((a, i) => (
            <View key={i} style={S.actRow}>
              <View style={[S.actDot, { backgroundColor: partColor }]} />
              <RichText text={a} style={S.actText} />
            </View>
          ))}
        </>
      )}

      {/* Tips */}
      {hasTips && (
        <>
          <SectionLabel>{labels.tips}</SectionLabel>
          {day.tips.map((t, i) => (
            <View key={i} style={S.tipBox}>
              <RichText text={t} style={S.tipText} />
            </View>
          ))}
        </>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <>
          <SectionLabel>{labels.warnings}</SectionLabel>
          {day.warnings.map((w, i) => (
            <View key={i} style={S.warnBox}>
              <RichText text={w} style={S.warnText} />
            </View>
          ))}
        </>
      )}

      {/* Links */}
      {hasLinks && (
        <>
          <SectionLabel>{labels.links}</SectionLabel>
          {day.links.map((l, i) => (
            <Link key={i} src={l.url} style={S.linkText}>{l.label}</Link>
          ))}
        </>
      )}

      {/* Images */}
      {hasImages && (
        <>
          <SectionLabel>{labels.images}</SectionLabel>
          <View style={S.imagesGrid}>
            {day.images.map((img, i) => (
              <View
                key={i}
                style={[S.imgWrapper, i % 2 === 0 ? S.imgWrapperLeft : {}]}
              >
                <Image src={img.url} style={S.dayImage} />
                {img.caption ? <Text style={S.imgCaption}>{img.caption}</Text> : null}
              </View>
            ))}
          </View>
        </>
      )}

      <View style={S.dayDivider} />
    </View>
  )
}

// ── Main Document ────────────────────────────────────────────────────
export function ItinerarioPDF({ itinerary, lang = 'es' }) {
  const labels = PDF_LABELS[lang] ?? PDF_LABELS.es
  return (
    <Document title={itinerary.title} author="Mi Itinerario" language={lang}>

      {/* ── Cover page ── */}
      <Page size="A4" style={S.coverPage}>
        <View style={S.coverBar} />
        <View style={S.coverBody}>
          <Text style={S.coverTitle}>{itinerary.title}</Text>
          <Text style={S.coverSub}>{itinerary.subtitle}</Text>
          {itinerary.stats?.map((stat, i) => (
            <Text key={i} style={S.coverStat}>
              <Text style={S.coverStatVal}>{stat}</Text>
            </Text>
          ))}
        </View>
        <View style={S.coverFooter}>
          <Text style={S.coverFooterText}>mi-itinerario.web.app</Text>
        </View>
      </Page>

      {/* ── One page(s) per Part ── */}
      {itinerary.parts.map((part, pi) => (
        <Page key={part.id} size="A4" style={S.page}>
          {/* Part header */}
          <View style={[S.partHeader, { backgroundColor: part.color }]} fixed={false}>
            <Text style={S.partEmoji}>{part.emoji} {part.title}</Text>
            <Text style={S.partRange}>{part.daysRange}</Text>
          </View>

          {/* Days */}
          {part.days.map(day => (
            <DaySection key={day.dayNumber} day={day} partColor={part.color} labels={labels} />
          ))}

          <PageFooter title={itinerary.title} />
        </Page>
      ))}

    </Document>
  )
}
