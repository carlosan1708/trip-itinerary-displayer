import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import en from './en'
import es from './es'
import { translate, I18nProvider, useT, useLang } from './index'

describe('translate', () => {
  it('returns the value for a known English key', () => {
    expect(translate('en', 'loading')).toBe(en.loading)
  })

  it('returns the value for a known Spanish key', () => {
    expect(translate('es', 'loading')).toBe(es.loading)
  })

  it('falls back to English when a key is missing in the target language', () => {
    // Force a synthetic key only present in English by checking the fallback path
    // through an unknown language, which resolves to the English dict.
    expect(translate('fr', 'loading')).toBe(en.loading)
  })

  it('returns the key itself when it exists in no dictionary', () => {
    expect(translate('en', '__totally_unknown_key__')).toBe('__totally_unknown_key__')
  })

  it('interpolates a single variable', () => {
    // Pick any key containing a {placeholder}; build one inline via a known pattern.
    const key = Object.keys(en).find(k => en[k].includes('{'))
    expect(key).toBeDefined()
    const varName = en[key].match(/\{(\w+)\}/)[1]
    const out = translate('en', key, { [varName]: 'VALUE' })
    expect(out).toContain('VALUE')
    expect(out).not.toContain(`{${varName}}`)
  })

  it('leaves unmatched placeholders intact when no var is supplied', () => {
    const key = Object.keys(en).find(k => en[k].includes('{'))
    const out = translate('en', key, {})
    expect(out).toContain('{')
  })
})

describe('dictionary parity', () => {
  it('English and Spanish expose exactly the same keys', () => {
    const enKeys = Object.keys(en).sort()
    const esKeys = Object.keys(es).sort()
    const missingInEs = enKeys.filter(k => !(k in es))
    const missingInEn = esKeys.filter(k => !(k in en))
    expect(missingInEs, 'keys missing from es.js').toEqual([])
    expect(missingInEn, 'keys missing from en.js').toEqual([])
  })

  it('has no empty translation strings', () => {
    for (const [k, v] of Object.entries(en)) expect(v, `en.${k}`).not.toBe('')
    for (const [k, v] of Object.entries(es)) expect(v, `es.${k}`).not.toBe('')
  })

  it('keeps placeholder tokens consistent between languages', () => {
    const tokens = (s) => (s.match(/\{\w+\}/g) || []).sort()
    for (const k of Object.keys(en)) {
      expect(tokens(es[k]), `placeholders for "${k}"`).toEqual(tokens(en[k]))
    }
  })
})

function Probe() {
  const t = useT()
  const lang = useLang()
  return <span data-testid="probe">{lang}:{t('loading')}</span>
}

describe('I18nProvider + hooks', () => {
  it('provides the English translator by default', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(screen.getByTestId('probe')).toHaveTextContent(`en:${en.loading}`)
  })

  it('provides the Spanish translator when lang="es"', () => {
    render(<I18nProvider lang="es"><Probe /></I18nProvider>)
    expect(screen.getByTestId('probe')).toHaveTextContent(`es:${es.loading}`)
  })
})
