/**
 * Дамп памяти в стиле Insight: слева адрес, далее 16 байт hex
 * и ASCII-представление строки. Дамп можно листать по страницам
 * и адресовать вручную.
 */

import { formatHex } from '../../core/registers'

export interface MemoryPanelOptions {
  rows?: number
  columns?: number
}

export class MemoryPanel {
  readonly root: HTMLElement
  private body: HTMLElement
  private addressLabel: HTMLElement
  private addressInput: HTMLInputElement
  private rows: number
  private columns: number
  private previousBytes = new Uint8Array()
  private currentAddress = 0
  private lastBytes = new Uint8Array()
  private onChangeAddress?: (address: number) => void

  constructor(options: MemoryPanelOptions = {}) {
    this.rows = options.rows ?? 14
    this.columns = options.columns ?? 16

    this.root = document.createElement('section')
    this.root.className = 'panel panel--memory'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Data segment</h2>'

    this.addressLabel = document.createElement('span')
    this.addressLabel.className = 'panel__badge'
    this.addressLabel.textContent = '00000000'

    const prev = document.createElement('button')
    prev.type = 'button'
    prev.className = 'mini'
    prev.textContent = '◀'
    prev.title = 'Предыдущая страница'
    prev.addEventListener('click', () => this.goTo(this.currentAddress - this.rows * this.columns))

    this.addressInput = document.createElement('input')
    this.addressInput.type = 'text'
    this.addressInput.className = 'memory__address-input'
    this.addressInput.placeholder = 'адрес'
    this.addressInput.spellcheck = false
    this.addressInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return
      this.commitAddress()
    })

    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'mini'
    next.textContent = '▶'
    next.title = 'Следующая страница'
    next.addEventListener('click', () => this.goTo(this.currentAddress + this.rows * this.columns))

    header.append(this.addressLabel, prev, this.addressInput, next)

    this.body = document.createElement('div')
    this.body.className = 'memory'

    this.root.append(header, this.body)
    this.renderEmpty()
  }

  private commitAddress(): void {
    const parsed = Number.parseInt(this.addressInput.value.replace(/^0x/i, ''), 16)
    if (!Number.isNaN(parsed)) this.goTo(parsed)
  }

  private goTo(address: number): void {
    const aligned = Math.max(0, Math.floor(address / 16) * 16)
    this.onChangeAddress?.(aligned)
  }

  setAddressHandler(handler: (address: number) => void): void {
    this.onChangeAddress = handler
  }

  private renderEmpty(): void {
    const empty = document.createElement('div')
    empty.className = 'panel__empty'
    empty.textContent = 'память недоступна'
    this.body.replaceChildren(empty)
  }

  update(address: number, bytes: Uint8Array): void {
    this.currentAddress = address
    this.lastBytes = bytes.slice()
    this.addressLabel.textContent = formatHex(BigInt(address), 8)
    if (document.activeElement !== this.addressInput) {
      this.addressInput.value = formatHex(BigInt(address), 8)
    }

    const table = document.createElement('div')
    table.className = 'memory__grid'

    const head = document.createElement('div')
    head.className = 'memory__row memory__row--head'
    const offsetHead = document.createElement('span')
    offsetHead.className = 'memory__offset'
    offsetHead.textContent = ' '
    head.appendChild(offsetHead)
    for (let column = 0; column < this.columns; column++) {
      const cell = document.createElement('span')
      cell.className = 'memory__hex'
      cell.textContent = column.toString(16).toUpperCase()
      head.appendChild(cell)
    }
    table.appendChild(head)

    for (let row = 0; row < this.rows; row++) {
      const rowElement = document.createElement('div')
      rowElement.className = 'memory__row'

      const offset = document.createElement('span')
      offset.className = 'memory__offset'
      offset.textContent = formatHex(BigInt(address + row * this.columns), 8)
      rowElement.appendChild(offset)

      let ascii = ''
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column
        const byte = bytes[index] ?? 0
        const cell = document.createElement('span')
        cell.className = 'memory__hex'
        cell.textContent = byte.toString(16).toUpperCase().padStart(2, '0')
        if (byte === 0) cell.classList.add('is-zero')
        if (this.previousBytes[index] !== undefined && this.previousBytes[index] !== byte) {
          cell.classList.add('is-changed')
        }
        rowElement.appendChild(cell)
        ascii += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
      }

      const asciiCell = document.createElement('span')
      asciiCell.className = 'memory__ascii'
      asciiCell.textContent = ascii
      rowElement.appendChild(asciiCell)

      table.appendChild(rowElement)
    }

    this.body.replaceChildren(table)
    this.previousBytes = bytes.slice()
  }

  clear(): void {
    this.previousBytes = new Uint8Array()
    this.addressLabel.textContent = '00000000'
    this.renderEmpty()
  }

  get address(): number {
    return this.currentAddress
  }

  /** Принудительная перерисовка последнего дампа (после смены адреса) */
  redraw(): void {
    if (this.lastBytes.length) this.update(this.currentAddress, this.lastBytes)
  }
}
