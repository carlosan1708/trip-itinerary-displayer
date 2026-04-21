import { createContext, useContext, useMemo } from 'react'
import en from './en'
import es from './es'

const dicts = { en, es }

const I18nContext = createContext({ lang: 'en', t: k => k, changeLang: () => {} })

export function I18nProvider({ lang = 'en', onLangChange, children }) {
  const t = useMemo(() => {
    const dict = dicts[lang] ?? dicts.en
    return (key, vars = {}) => {
      let str = dict[key] ?? dicts.en[key] ?? key
      for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v))
      return str
    }
  }, [lang])

  const value = useMemo(
    () => ({ lang, t, changeLang: onLangChange ?? (() => {}) }),
    [lang, t, onLangChange]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  return useContext(I18nContext).t
}

export function useLang() {
  return useContext(I18nContext).lang
}

export function useChangeLang() {
  return useContext(I18nContext).changeLang
}
