/**
 * Флаги процессора в стиле Insight: OF DF IF SF ZF AF PF CF.
 */

import { formatHex } from '../../core/registers'

const FLAGS: Array<{ key: bigint; name: string; description: string }> = [
  { key: 0x800n, name: 'OF', description: 'Overflow — переполнение знакового результата' },
  { key: 0x400n, name: 'DF', description: 'Direction — направление строковых операций' },
  { key: 0x200n, name: 'IF', description: 'Interrupt — разрешение прерываний' },
  { key: 0x80n, name: 'SF', description: 'Sign — знак результата' },
  { key: 0x40n, name: 'ZF', description: 'Zero — результат равен нулю' },
  { key: 0x10n, name: 'AF', description: 'Auxiliary carry — перенос из 3-го бита' },
  { key: 0x4n, name: 'PF', description: 'Parity — чётность младшего байта' },
  { key: 0x1n, name: 'CF', description: 'Carry — перенос/заимствование' },
]

export class FlagsPanel {
  readonly root: HTMLElement
  private cells = new Map<string, HTMLElement>()
  private previous = 0n
  private ripValue: HTMLElement
  private hexValue: HTMLElement

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'panel panel--flags'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Flags</h2>'

    this.hexValue = document.createElement('span')
    this.hexValue.className = 'flags__hex'
    this.hexValue.textContent = '00000000'
    this.hexValue.title = 'RFLAGS'
    header.appendChild(this.hexValue)

    const row = document.createElement('div')
    row.className = 'flags__row'
    for (const flag of FLAGS) {
      const cell = document.createElement('span')
      cell.className = 'flag'
      cell.title = flag.description
      cell.innerHTML = `<span class="flag__name">${flag.name}</span><span class="flag__value">0</span>`
      this.cells.set(flag.name, cell)
      row.appendChild(cell)
    }

    this.ripValue = document.createElement('div')
    this.ripValue.className = 'flags__ip'
    this.ripValue.innerHTML = '<span>IP</span><b>00000000</b>'

    this.root.append(header, row, this.ripValue)
  }

  update(rflags: bigint, rip: number): void {
    for (const flag of FLAGS) {
      const cell = this.cells.get(flag.name)
      if (!cell) continue
      const isSet = (rflags & flag.key) !== 0n
      const value = cell.querySelector('.flag__value')
      if (value) value.textContent = isSet ? '1' : '0'
      cell.classList.toggle('is-set', isSet)
      if (((this.previous & flag.key) !== 0n) !== isSet) {
        cell.classList.add('is-changed')
        window.setTimeout(() => cell.classList.remove('is-changed'), 400)
      }
    }
    this.hexValue.textContent = formatHex(rflags & 0xffffffffn, 8)
    const ip = this.ripValue.querySelector('b')
    if (ip) ip.textContent = formatHex(BigInt(rip >>> 0), 8)
    this.previous = rflags
  }

  clear(): void {
    this.previous = 0n
    this.update(0n, 0)
  }
}
