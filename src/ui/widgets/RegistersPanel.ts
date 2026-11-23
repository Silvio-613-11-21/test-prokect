/**
 * Панель регистров.
 *
 * Показывает семейства регистров в 4 представлениях одновременно
 * (RAX / EAX / AX / AH / AL), как в DOSBox-отладчике, плюс флаги.
 */

import type { CpuSnapshot } from '../../types'
import { formatHex } from '../../core/registers'

export type RegisterFormat = 'hex' | 'dec'

interface FamilyDefinition {
  /** Имя семейства: ax, bx, … */
  family: string
  /** Полные имена в 64-битном режиме */
  names: { r64: string; r32: string; r16: string; high8?: string; low8: string }
  /** Подпись для 16-битного режима */
  label16: string
}

const FAMILIES: FamilyDefinition[] = [
  { family: 'ax', names: { r64: 'RAX', r32: 'EAX', r16: 'AX', high8: 'AH', low8: 'AL' }, label16: 'AX' },
  { family: 'bx', names: { r64: 'RBX', r32: 'EBX', r16: 'BX', high8: 'BH', low8: 'BL' }, label16: 'BX' },
  { family: 'cx', names: { r64: 'RCX', r32: 'ECX', r16: 'CX', high8: 'CH', low8: 'CL' }, label16: 'CX' },
  { family: 'dx', names: { r64: 'RDX', r32: 'EDX', r16: 'DX', high8: 'DH', low8: 'DL' }, label16: 'DX' },
  { family: 'si', names: { r64: 'RSI', r32: 'ESI', r16: 'SI', low8: 'SIL' }, label16: 'SI' },
  { family: 'di', names: { r64: 'RDI', r32: 'EDI', r16: 'DI', low8: 'DIL' }, label16: 'DI' },
  { family: 'bp', names: { r64: 'RBP', r32: 'EBP', r16: 'BP', low8: 'BPL' }, label16: 'BP' },
  { family: 'sp', names: { r64: 'RSP', r32: 'ESP', r16: 'SP', low8: 'SPL' }, label16: 'SP' },
]

const INDEX_FAMILIES: FamilyDefinition[] = [
  { family: 'r8', names: { r64: 'R8', r32: 'R8D', r16: 'R8W', low8: 'R8B' }, label16: 'R8' },
  { family: 'r9', names: { r64: 'R9', r32: 'R9D', r16: 'R9W', low8: 'R9B' }, label16: 'R9' },
  { family: 'r10', names: { r64: 'R10', r32: 'R10D', r16: 'R10W', low8: 'R10B' }, label16: 'R10' },
  { family: 'r11', names: { r64: 'R11', r32: 'R11D', r16: 'R11W', low8: 'R11B' }, label16: 'R11' },
  { family: 'r12', names: { r64: 'R12', r32: 'R12D', r16: 'R12W', low8: 'R12B' }, label16: 'R12' },
  { family: 'r13', names: { r64: 'R13', r32: 'R13D', r16: 'R13W', low8: 'R13B' }, label16: 'R13' },
  { family: 'r14', names: { r64: 'R14', r32: 'R14D', r16: 'R14W', low8: 'R14B' }, label16: 'R14' },
  { family: 'r15', names: { r64: 'R15', r32: 'R15D', r16: 'R15W', low8: 'R15B' }, label16: 'R15' },
]

const FLAGS: Array<{ key: bigint; name: string; description: string }> = [
  { key: 1n, name: 'CF', description: 'Carry — перенос/заимствование' },
  { key: 4n, name: 'PF', description: 'Parity — чётность младшего байта' },
  { key: 0x10n, name: 'AF', description: 'Auxiliary carry — перенос из 3-го бита' },
  { key: 0x40n, name: 'ZF', description: 'Zero — результат равен нулю' },
  { key: 0x80n, name: 'SF', description: 'Sign — знак результата' },
  { key: 0x100n, name: 'TF', description: 'Trap — пошаговый режим' },
  { key: 0x400n, name: 'DF', description: 'Direction — направление строковых операций' },
  { key: 0x800n, name: 'OF', description: 'Overflow — переполнение знакового результата' },
]

/** Индекс регистра в снимке gpr */
const GPR_INDEX: Record<string, number> = {
  ax: 0, bx: 1, cx: 2, dx: 3, si: 4, di: 5, bp: 6, sp: 7,
  r8: 8, r9: 9, r10: 10, r11: 11, r12: 12, r13: 13, r14: 14, r15: 15,
}

const MASK64 = 0xffffffffffffffffn

function slice(value: bigint, bits: 8 | 16 | 32, shift = 0): bigint {
  const width = BigInt(bits)
  return (value >> BigInt(shift)) & ((1n << width) - 1n)
}

export class RegistersPanel {
  readonly root: HTMLElement
  private body: HTMLElement
  private flagsRow: HTMLElement
  private format: RegisterFormat = 'hex'
  private lastSnapshot: CpuSnapshot | null = null
  private cells = new Map<string, HTMLElement>()

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'panel panel--registers'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Регистры</h2>'

    const controls = document.createElement('div')
    controls.className = 'panel__controls'

    const formatButton = document.createElement('button')
    formatButton.type = 'button'
    formatButton.className = 'chip'
    formatButton.textContent = 'HEX'
    formatButton.title = 'Переключить систему счисления'
    formatButton.addEventListener('click', () => {
      this.format = this.format === 'hex' ? 'dec' : 'hex'
      formatButton.textContent = this.format === 'hex' ? 'HEX' : 'DEC'
      if (this.lastSnapshot) this.update(this.lastSnapshot)
    })
    controls.appendChild(formatButton)
    header.appendChild(controls)

    this.body = document.createElement('div')
    this.body.className = 'registers'

    this.flagsRow = document.createElement('div')
    this.flagsRow.className = 'flags'

    this.root.append(header, this.body, this.flagsRow)
    this.buildTable()
  }

  private buildTable(): void {
    const table = document.createElement('div')
    table.className = 'registers__table'

    const headerRow = document.createElement('div')
    headerRow.className = 'registers__row registers__row--head'
    for (const label of ['reg', '64', '32', '16', 'hi', 'lo']) {
      const cell = document.createElement('div')
      cell.textContent = label
      headerRow.appendChild(cell)
    }
    table.appendChild(headerRow)

    for (const family of [...FAMILIES, ...INDEX_FAMILIES]) {
      const row = document.createElement('div')
      row.className = 'registers__row'
      row.dataset.family = family.family

      const label = document.createElement('div')
      label.className = 'registers__label'
      label.textContent = family.names.r64
      row.appendChild(label)

      const columns: Array<[string, string, number, number]> = [
        ['r64', family.names.r64, 64, 0],
        ['r32', family.names.r32, 32, 0],
        ['r16', family.names.r16, 16, 0],
        ['high8', family.names.high8 ?? '—', 8, 8],
        ['low8', family.names.low8, 8, 0],
      ]

      for (const [key, name, bits, shift] of columns) {
        const cell = document.createElement('div')
        cell.className = 'registers__value'
        if (key === 'high8' && !family.names.high8) cell.classList.add('is-empty')
        cell.dataset.register = name
        cell.dataset.bits = String(bits)
        cell.dataset.shift = String(shift)
        cell.title = `${name} — ${bits} бит`
        cell.textContent = bits === 64 ? '0000000000000000' : '0000'
        if (!(key === 'high8' && !family.names.high8)) {
          this.cells.set(`${family.family}:${key}`, cell)
        }
        row.appendChild(cell)
      }
      table.appendChild(row)
    }

    this.body.appendChild(table)
  }

  /** Форматирует значение регистра */
  private formatValue(value: bigint, bits: number): string {
    if (this.format === 'dec') {
      const width = BigInt(bits)
      return (value & ((1n << width) - 1n)).toString(10)
    }
    const hex = bits === 64 ? formatHex(value, 16) : formatHex(value, Math.ceil(bits / 4))
    return hex
  }

  /** Обновляет значения из снимка */
  update(snapshot: CpuSnapshot): void {
    this.lastSnapshot = snapshot
    const visible = this.root.dataset.mode === 'x16'

    for (const family of [...FAMILIES, ...INDEX_FAMILIES]) {
      const raw = snapshot.gpr[GPR_INDEX[family.family]] ?? 0n
      const value = raw & MASK64
      this.setCell(family.family, 'r64', this.formatValue(value, 64), value)
      this.setCell(family.family, 'r32', this.formatValue(slice(value, 32), 32), slice(value, 32))
      this.setCell(family.family, 'r16', this.formatValue(slice(value, 16), 16), slice(value, 16))
      this.setCell(family.family, 'high8', this.formatValue(slice(value, 8, 8), 8), slice(value, 8, 8))
      this.setCell(family.family, 'low8', this.formatValue(slice(value, 8), 8), slice(value, 8))
      void visible
    }

    this.updateFlags(snapshot.rflags)
  }

  private previousValues = new Map<string, bigint>()

  private setCell(family: string, key: string, text: string, raw: bigint): void {
    const cell = this.cells.get(`${family}:${key}`)
    if (!cell) return
    const id = `${family}:${key}`
    const changed = this.previousValues.get(id) !== raw
    this.previousValues.set(id, raw)
    cell.textContent = text
    if (changed) {
      cell.classList.add('is-changed')
      window.setTimeout(() => cell.classList.remove('is-changed'), 450)
    }
    // Для 32/16-битных проекций добавляем десятичное значение в подсказку
    if (raw !== 0n) {
      cell.title = `${cell.dataset.register}: ${text} (${BigInt.asUintN(Number(cell.dataset.bits), raw).toString(10)} dec)`
    } else {
      cell.title = `${cell.dataset.register}: 0`
    }
  }

  private flagCells = new Map<string, HTMLElement>()
  private previousFlags = 0n

  private updateFlags(rflags: bigint): void {
    if (this.flagsRow.childElementCount === 0) {
      for (const flag of FLAGS) {
        const wrapper = document.createElement('div')
        wrapper.className = 'flag'
        wrapper.title = flag.description

        const name = document.createElement('span')
        name.className = 'flag__name'
        name.textContent = flag.name

        const value = document.createElement('span')
        value.className = 'flag__value'
        value.textContent = '0'

        wrapper.append(name, value)
        this.flagCells.set(flag.name, value)
        this.flagsRow.appendChild(wrapper)
      }

      const hex = document.createElement('div')
      hex.className = 'flags__hex'
      hex.dataset.role = 'rflags'
      hex.textContent = 'RFLAGS=0000000000000000'
      this.flagsRow.appendChild(hex)
    }

    for (const flag of FLAGS) {
      const cell = this.flagCells.get(flag.name)
      if (!cell) continue
      const isSet = (rflags & flag.key) !== 0n
      cell.textContent = isSet ? '1' : '0'
      const changed = ((this.previousFlags & flag.key) !== 0n) !== isSet
      cell.parentElement?.classList.toggle('flag--set', isSet)
      if (changed) {
        cell.parentElement?.classList.add('is-changed')
        window.setTimeout(() => cell.parentElement?.classList.remove('is-changed'), 450)
      }
    }

    const hex = this.flagsRow.querySelector('[data-role="rflags"]') as HTMLElement | null
    if (hex) {
      const value = `RFLAGS=${formatHex(rflags, 16)}`
      if (hex.textContent !== value) hex.textContent = value
    }
    this.previousFlags = rflags
  }

  /** Сброс панели (например, при смене режима) */
  clear(): void {
    const empty: CpuSnapshot = {
      rip: 0, rsp: 0, rbp: 0,
      gpr: Array.from({ length: 16 }, () => 0n),
      rflags: 0n,
      cs: 0, ds: 0, es: 0, ss: 0, fs: 0, gs: 0,
    }
    this.previousValues.clear()
    this.previousFlags = -1n
    this.update(empty)
  }

  /** Переключение внешнего вида для 16-битного режима */
  setArchMode(mode: 'x64' | 'x16'): void {
    this.root.dataset.mode = mode
    this.root.classList.toggle('is-compact', mode === 'x16')
    for (const row of Array.from(this.body.querySelectorAll<HTMLElement>('.registers__row'))) {
      const family = row.dataset.family
      if (!family) continue
      const isExtended = family.startsWith('r') && /^r\d+$/.test(family)
      row.hidden = mode === 'x16' && isExtended
      row.classList.toggle('registers__row--compat', mode === 'x16' && !isExtended)
    }
  }
}
