/**
 * Панель памяти в стиле hex-дампера DOSBox: 16 байт в строке,
 * ASCII-колонка справа, подсветка изменённых байтов.
 */

import { formatHex } from '../../core/registers'

export interface MemoryPanelOptions {
  /** Сколько строк показывать */
  rows?: number
  /** Байт в строке */
  columns?: number
}

export class MemoryPanel {
  readonly root: HTMLElement
  private body: HTMLElement
  private headerBadge: HTMLElement
  private addressInput: HTMLInputElement
  private rows: number
  private columns: number
  private previousBytes = new Uint8Array()
  private currentAddress = 0
  private onChangeAddress?: (address: number) => void

  constructor(options: MemoryPanelOptions = {}) {
    this.rows = options.rows ?? 16
    this.columns = options.columns ?? 16

    this.root = document.createElement('section')
    this.root.className = 'panel panel--memory'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Память</h2>'

    const controls = document.createElement('div')
    controls.className = 'panel__controls'

    this.headerBadge = document.createElement('span')
    this.headerBadge.className = 'panel__badge'
    this.headerBadge.textContent = '00000000'

    this.addressInput = document.createElement('input')
    this.addressInput.type = 'text'
    this.addressInput.className = 'memory__address-input'
    this.addressInput.placeholder = 'адрес (hex)'
    this.addressInput.spellcheck = false
    this.addressInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      const parsed = Number.parseInt(this.addressInput.value.replace(/^0x/i, ''), 16)
      if (!Number.isNaN(parsed)) {
        this.onChangeAddress?.(parsed)
      }
    })

    const goto = document.createElement('button')
    goto.type = 'button'
    goto.className = 'chip'
    goto.textContent = 'Перейти'
    goto.addEventListener('click', () => {
      const parsed = Number.parseInt(this.addressInput.value.replace(/^0x/i, ''), 16)
      if (!Number.isNaN(parsed)) this.onChangeAddress?.(parsed)
    })

    controls.append(this.headerBadge, this.addressInput, goto)
    header.appendChild(controls)

    this.body = document.createElement('div')
    this.body.className = 'memory'

    const empty = document.createElement('div')
    empty.className = 'panel__empty'
    empty.textContent = 'Память недоступна: запустите программу'
    this.body.appendChild(empty)

    this.root.append(header, this.body)
  }

  /** Колбэк перехода по адресу (стрелка/ввод) */
  setAddressHandler(handler: (address: number) => void): void {
    this.onChangeAddress = handler
  }

  /** Обновление содержимого памяти */
  update(address: number, bytes: Uint8Array): void {
    this.currentAddress = address
    this.headerBadge.textContent = `${formatHex(BigInt(address), 8)}`
    this.addressInput.value = formatHex(BigInt(address), 8)

    const fragment = document.createDocumentFragment()
    const table = document.createElement('div')
    table.className = 'memory__grid'

    // Заголовок колонок
    const head = document.createElement('div')
    head.className = 'memory__row memory__row--head'
    const offsetHead = document.createElement('span')
    offsetHead.className = 'memory__offset'
    offsetHead.textContent = 'OFFSET'
    head.appendChild(offsetHead)
    for (let column = 0; column < this.columns; column++) {
      const cell = document.createElement('span')
      cell.className = 'memory__hex'
      cell.textContent = column.toString(16).toUpperCase()
      head.appendChild(cell)
    }
    const asciiHead = document.createElement('span')
    asciiHead.className = 'memory__ascii'
    asciiHead.textContent = 'ASCII'
    head.appendChild(asciiHead)
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
        if (this.previousBytes[index] !== byte) cell.classList.add('is-changed')
        rowElement.appendChild(cell)
        ascii += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
      }

      const asciiCell = document.createElement('span')
      asciiCell.className = 'memory__ascii'
      asciiCell.textContent = ascii
      rowElement.appendChild(asciiCell)

      table.appendChild(rowElement)
    }

    fragment.append(table)
    this.body.replaceChildren(fragment)
    this.previousBytes = bytes.slice()
  }

  /** Сброс панели */
  clear(): void {
    this.previousBytes = new Uint8Array()
    this.headerBadge.textContent = '00000000'
    const empty = document.createElement('div')
    empty.className = 'panel__empty'
    empty.textContent = 'Память недоступна: запустите программу'
    this.body.replaceChildren(empty)
  }

  get address(): number {
    return this.currentAddress
  }
}
