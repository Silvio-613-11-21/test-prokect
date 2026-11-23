/**
 * Разбор параметров ссылки (SPA-навигация).
 *
 * Поддерживаются два вида ссылок:
 *  - ?lab=3&z=4          — включить ограничения лабораторной;
 *  - ?code=...           — загрузить код (LZ-сжатый base64, см. share.ts);
 *  а также ?example=id, ?mode=x64|x16, ?theme=dark|light.
 *
 * Всё состояние живёт в query-параметрах, поэтому ссылкой можно
 * поделиться, не имея сервера.
 */

import type { ArchMode } from '../core/asm/modes'

export interface RouteState {
  lab?: number
  z?: number
  code?: string
  example?: string
  mode?: ArchMode
  theme?: 'dark' | 'light'
}

export function parseRoute(search: string = window.location.search): RouteState {
  const params = new URLSearchParams(search)
  const readInt = (key: string): number | undefined => {
    const raw = params.get(key)
    if (raw === null || raw.trim() === '') return undefined
    const value = Number.parseInt(raw, 10)
    return Number.isNaN(value) ? undefined : value
  }

  const modeRaw = params.get('mode')
  const themeRaw = params.get('theme')

  const state: RouteState = {
    lab: readInt('lab'),
    z: readInt('z'),
    code: params.get('code') ?? undefined,
    example: params.get('example') ?? undefined,
    mode: modeRaw === 'x16' || modeRaw === 'x64' ? modeRaw : undefined,
    theme: themeRaw === 'light' || themeRaw === 'dark' ? themeRaw : undefined,
  }

  if (state.lab === undefined) {
    // В старом формате ограничения назывались labNumber/taskNumber
    state.lab = readInt('labNumber')
    state.z = state.z ?? readInt('taskNumber')
  }

  return state
}

/** Собирает query-строку из состояния, отбрасывая пустые поля */
export function buildRoute(state: RouteState): string {
  const params = new URLSearchParams()
  if (state.lab !== undefined) {
    params.set('lab', String(state.lab))
    if (state.z !== undefined) params.set('z', String(state.z))
  }
  if (state.mode) params.set('mode', state.mode)
  if (state.theme) params.set('theme', state.theme)
  if (state.example) params.set('example', state.example)
  if (state.code) params.set('code', state.code)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Обновляет адресную строку без перезагрузки (SPA) */
export function syncRoute(state: RouteState): void {
  const query = buildRoute(state)
  const next = `${window.location.pathname}${query}`
  window.history.replaceState(null, '', next)
}
