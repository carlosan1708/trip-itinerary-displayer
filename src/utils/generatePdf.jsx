// Lazy-loaded — only imported when user clicks "Descargar PDF"
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { ItinerarioPDF } from '../components/ItinerarioPDF'

export async function generateItinerarioPdf(itinerary) {
  const blob = await pdf(<ItinerarioPDF itinerary={itinerary} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${itinerary.title.toLowerCase().replace(/\s+/g, '-')}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
