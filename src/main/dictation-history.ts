import Store from 'electron-store'
import type { DictationHistoryItem } from '@shared/types'
import { getSettings } from './settings'

let store: Store<{ items: DictationHistoryItem[] }>

export function initHistory(): void {
  store = new Store<{ items: DictationHistoryItem[] }>({
    name: 'dictation-history',
    defaults: { items: [] }
  })
}

export function addHistory(item: DictationHistoryItem): void {
  const limit = getSettings().dictationHistoryLimit || 5
  const items = [item, ...store.get('items')].slice(0, limit)
  store.set('items', items)
}

export function getHistory(): DictationHistoryItem[] {
  return store.get('items')
}

export function clearHistory(): void {
  store.set('items', [])
}
