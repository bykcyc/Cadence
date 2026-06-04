import { describe, it, expect } from 'vitest'
import {
  LOCALES,
  TRANSLATE_LANGUAGES,
  messages,
  translate,
  resolveLocale,
  isRtl
} from './i18n'

const en = messages.en
const enKeys = Object.keys(en)

describe('i18n dictionary', () => {
  it('declares all 14 locales and each has a dictionary', () => {
    expect(LOCALES.length).toBe(14)
    for (const { code } of LOCALES) expect(messages[code]).toBeTruthy()
  })

  it('no locale defines a key missing from the English base (so fallback always resolves)', () => {
    for (const [code, dict] of Object.entries(messages)) {
      for (const key of Object.keys(dict!)) {
        expect(en, `${code}.${key} should exist in en`).toHaveProperty(key)
      }
    }
  })

  it('translate() never returns empty or the raw key for any (locale, key)', () => {
    for (const { code } of LOCALES) {
      for (const key of enKeys) {
        const out = translate(code, key)
        expect(out, `${code}.${key}`).toBeTruthy()
        expect(out, `${code}.${key} leaked the raw key`).not.toBe(key)
      }
    }
  })

  it('preserves interpolation placeholders in every locale that defines the key', () => {
    const placeholder = /\{\{?\w+\}?\}/g
    for (const key of enKeys) {
      const enP = (en[key].match(placeholder) || []).sort()
      if (enP.length === 0) continue
      for (const { code } of LOCALES) {
        const value = messages[code]?.[key]
        if (value === undefined) continue
        expect((value.match(placeholder) || []).sort(), `${code}.${key}`).toEqual(enP)
      }
    }
  })
})

describe('translate() / resolveLocale() / isRtl()', () => {
  it('substitutes variables', () => {
    const out = translate('en', 'meetings.count', { n: 7 })
    expect(out).toContain('7')
    expect(out).not.toContain('{n}')
  })

  it('falls back to English for a key only present in en', () => {
    // ml.cpuWarning exists in en (+ru); a non-en/ru locale falls back to the en text.
    expect(translate('zh', 'ml.cpuWarning')).toBe(en['ml.cpuWarning'])
  })

  it('resolves system locale to a supported code, else English', () => {
    expect(resolveLocale('system', 'ru-RU')).toBe('ru')
    expect(resolveLocale('system', 'pt-BR')).toBe('pt')
    expect(resolveLocale('system', 'xx-YY')).toBe('en')
    expect(resolveLocale('de', 'ru-RU')).toBe('de') // explicit choice wins
  })

  it('marks only Arabic as RTL', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('en')).toBe(false)
    expect(isRtl('ru')).toBe(false)
  })
})

describe('TRANSLATE_LANGUAGES', () => {
  it('is a broad list that includes the default', () => {
    expect(TRANSLATE_LANGUAGES).toContain('English')
    expect(TRANSLATE_LANGUAGES.length).toBeGreaterThan(50)
    expect(new Set(TRANSLATE_LANGUAGES).size).toBe(TRANSLATE_LANGUAGES.length) // no dupes
  })
})
