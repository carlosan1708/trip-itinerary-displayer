// Lazy-loaded — only imported when the user clicks "Download PDF"
import { pdf } from '@react-pdf/renderer'
import { ItinerarioPDF } from '../components/ItinerarioPDF'

export async function generateItinerarioPdf(itinerary, lang = 'es') {
  const blob = await pdf(<ItinerarioPDF itinerary={itinerary} lang={lang} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${itinerary.title.toLowerCase().replace(/\s+/g, '-')}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
