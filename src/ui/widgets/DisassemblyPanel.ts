/**
 * Панель дизассемблера: адрес, байты, инструкция. Текущая строка (RIP)
 * подсвечивается и автоматически прокручивается в видимую область.
 */

import type { DisasmLine } from '../../types'

const MAX_ROWS = 400

export class DisassemblyPanel {
  readonly root: HTMLElement
  private body: HTMLElement
  private currentRow = -1
  private rows: HTMLElement[] = []
  private followRip = true

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'panel panel--disasm'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Дизассемблер</h2>'

    const controls = document.createElement('div')
    controls.className = 'panel__controls'

    const follow = document.createElement('button')
    follow.type = 'button'
    follow.className = 'chip is-active'
    follow.textContent = 'Следить за RIP'
    follow.addEventListener('click', () => {
      this.followRip = !this.followRip
      follow.classList.toggle('is-active', this.followRip)
    })
    controls.appendChild(follow)
    header.appendChild(controls)

    this.body = document.createElement('div')
    this.body.className = 'disasm'
    this.body.setAttribute('role', 'list')

    const empty = document.createElement('div')
    empty.className = 'panel__empty'
    empty.textContent = 'Скомпилируйте и запустите программу, чтобы увидеть код'
    this.body.appendChild(empty)

    this.root.append(header, this.body)
  }

  /** Полная перерисовка списка (при загрузке/смене программы) */
  render(lines: DisasmLine[], currentLine: number): void {
    this.rows = []
    const fragment = document.createDocumentFragment()

    let index = 0
    for (const line of lines) {
      if (index >= MAX_ROWS) break

      if (line.label) {
        const row = document.createElement('div')
        row.className = 'disasm__label'
        row.textContent = line.label
        fragment.appendChild(row)
        continue
      }

      const row = document.createElement('div')
      row.className = 'disasm__row'
      row.setAttribute('role', 'listitem')

      const address = document.createElement('span')
      address.className = 'disasm__address'
      address.textContent = line.address.toString(16).toUpperCase().padStart(8, '0')

      const bytes = document.createElement('span')
      bytes.className = 'disasm__bytes'
      bytes.textContent = line.bytes.padEnd(20, ' ')

      const text = document.createElement('span')
      text.className = 'disasm__text'
      text.innerHTML = colorizeInstruction(line.text)

      row.append(address, bytes, text)
      fragment.appendChild(row)
      this.rows.push(row)
      index++
    }

    this.body.replaceChildren(fragment)
    this.highlight(currentLine)
  }

  /** Только перенос подсветки текущей строки */
  highlight(currentLine: number): void {
    if (this.currentRow === currentLine) return
    this.rows[this.currentRow]?.classList.remove('is-current')
    this.currentRow = currentLine
    const row = this.rows[currentLine]
    if (!row) return
    row.classList.add('is-current')
    if (this.followRip) {
      // jsdom/старые движки не реализуют scrollIntoView
      if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
    }
  }

  clear(): void {
    this.rows = []
    this.currentRow = -1
    const empty = document.createElement('div')
    empty.className = 'panel__empty'
    empty.textContent = 'Программа не загружена'
    this.body.replaceChildren(empty)
  }
}

/** Лёгкая раскраска ассемблерного текста из blink */
function colorizeInstruction(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const parts = escaped.split(/^(\S+)/)
  if (parts.length < 3) return escaped

  const mnemonic = parts[1]
  const rest = parts.slice(2).join('')

  const coloredRest = rest
    .replace(/\b(rax|rbx|rcx|rdx|rsi|rdi|rbp|rsp|eax|ebx|ecx|edx|esi|edi|ebp|esp|ax|bx|cx|dx|si|di|bp|sp|ah|al|bh|bl|ch|cl|dh|dl|r\d+[dwb]?)\b/gi, '<span class="tok-register-inline">$1</span>')
    .replace(/\b(0x[0-9a-f]+|[0-9a-f]+h)\b/gi, '<span class="tok-number-inline">$1</span>')

  return `<span class="tok-mnemonic-inline">${mnemonic}</span>${coloredRest}`
}
