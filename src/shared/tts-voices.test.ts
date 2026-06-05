import { describe, it, expect } from 'vitest'
import { detectScriptLang, resolveVoice, VOICE_BY_LANG } from './tts-voices'

describe('detectScriptLang', () => {
  it('detects language by script', () => {
    expect(detectScriptLang('Привет, как дела?')).toBe('ru')
    expect(detectScriptLang('Hello world')).toBe(null) // Latin → undetectable by script
    expect(detectScriptLang('你好世界')).toBe('zh')
    expect(detectScriptLang('こんにちは')).toBe('ja')
    expect(detectScriptLang('안녕하세요')).toBe('ko')
    expect(detectScriptLang('مرحبا')).toBe('ar')
    expect(detectScriptLang('नमस्ते')).toBe('hi')
  })

  it('prefers Japanese kana over Han when both present', () => {
    expect(detectScriptLang('日本語のテスト')).toBe('ja')
  })
})

describe('resolveVoice', () => {
  it('auto: Cyrillic text → Russian voice', () => {
    expect(resolveVoice('auto', 'Привет')).toBe(VOICE_BY_LANG.ru)
  })

  it('auto: Latin text → English fallback voice', () => {
    expect(resolveVoice('auto', 'Hello there')).toBe(VOICE_BY_LANG.en)
  })

  it('explicit language overrides the text', () => {
    expect(resolveVoice('de', 'Привет')).toBe(VOICE_BY_LANG.de)
    expect(resolveVoice('ja', 'Hello')).toBe(VOICE_BY_LANG.ja)
  })
})
