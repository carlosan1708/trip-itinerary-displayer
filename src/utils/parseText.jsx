/**
 * Parses **bold** markdown syntax into <strong> elements.
 * Returns a string if no bold markers are found, otherwise an array of React nodes.
 */
export function parseText(text) {
  if (!text || !text.includes('**')) return text
  const parts = text.split(/\*\*(.*?)\*\*/)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  )
}
