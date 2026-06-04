// Main-process translation helper. Resolves the current UI language from settings
// (falling back to the OS locale, then English) and translates with the shared dictionary.
import { app } from 'electron'
import { resolveLocale, translate, type Locale, type LanguageSetting } from '@shared/i18n'
import { getSettings } from './settings'

export function mainLocale(): Locale {
  let setting: LanguageSetting = 'system'
  try {
    setting = getSettings().language
  } catch {
    // settings store not initialized yet — fall back to the OS locale
  }
  return resolveLocale(setting, app.getLocale())
}

export function mt(key: string, vars?: Record<string, string | number>): string {
  return translate(mainLocale(), key, vars)
}
