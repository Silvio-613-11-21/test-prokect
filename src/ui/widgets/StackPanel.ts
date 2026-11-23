/**
 * Панель стека: значения от RSP вверх (по 8 байт, little-endian).
 * Показывает адрес, значение и ASCII-представление байтов.
 */

import type { StackEntry } from '../../types'
import { formatHex } from '../../core/registers'

function toAscii(bytes: Uint8Array, offset: number, length = 8): string {
  let text = ''
  for (let i = 0; i < length; i++) {
    const byte = bytes[offset + i]
    if (byte === undefined) break
    text += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
  }
  return text
}

export class StackPanel {
  readonly root: HTMLElement
  private body: HTMLElement
  private rspLabel: HTMLElement
  private count = 12

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'panel panel--stack'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Стек</h2>'

    this.rspLabel = document.createElement('span')
    this.rspLabel.className = 'panel__badge'
    this.rspLabel.textContent = 'RSP=--------'
    header.appendChild(this.rspLabel)

    this.body = document.createElement('div')
    this.body.className = 'stack'

    const empty = document.createElement('div')
    empty.className = 'panel__empty'
    empty.textContent = 'Стек пуст: программа не запущена'
    this.body.appendChild(empty)

    this.root.append(header, this.body)
  }

  /** Обновление из сессии: entries — значения по адресам от rsp */
  update(rsp: number, entries: StackEntry[], rawBytes: Uint8Array | null): void {
    this.rspLabel.textContent = `RSP=${formatHex(BigInt(rsp), 8)}`
    const fragment = document.createDocumentFragment()

    entries.slice(0, this.count).forEach((entry, index) => {
      const row = document.createElement('div')
      row.className = 'stack__row'
      if (index === 0) row.classList.add('is-top')

      const address = document.createElement('span')
      address.className = 'stack__address'
      address.textContent = formatHex(BigInt(entry.address), 8)

      const value = document.createElement('span')
      value.className = 'stack__value'
      value.textContent = formatHex(entry.value, 16)

      const ascii = document.createElement('span')
      ascii.className = 'stack__ascii'
      ascii.textContent = rawBytes ? toAscii(rawBytes, index * 8) : '........'

      row.append(address, value, ascii)
      fragment.appendChild(row)
    })

    if (entries.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'panel__empty'
      empty.textContent = 'Нет данных: запустите отладчик'
      fragment.appendChild(empty)
    }

    this.body.replaceChildren(fragment)
  }

  clear(): void {
    this.rspLabel.textContent = 'RSP=--------'
    const empty = document.createElement('div')
    empty.className = 'panel__empty'
    empty.textContent = 'Стек пуст: программа не запущена'
    this.body.replaceChildren(empty)
  }

  /** Сколько строк показывать */
  setCount(count: number): void {
    this.count = count
  }
}
