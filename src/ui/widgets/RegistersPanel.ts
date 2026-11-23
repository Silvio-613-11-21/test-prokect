/**
 * Панель регистров в стиле Insight: имя регистра и его значение.
 *
 * Для каждого семейства показываются все представления x86-64 —
 * RAX / EAX / AX / AH / AL — так, как этого требует задание.
 */

import type { CpuSnapshot } from '../../types'
import { formatHex } from '../../core/registers'

interface FamilyDefinition {
  family: string
  names: { r64: string; r32: string; r16: string; high8?: string; low8: string }
}

const FAMILIES: FamilyDefinition[] = [
  { family: 'ax', names: { r64: 'RAX', r32: 'EAX', r16: 'AX', high8: 'AH', low8: 'AL' } },
  { family: 'bx', names: { r64: 'RBX', r32: 'EBX', r16: 'BX', high8: 'BH', low8: 'BL' } },
  { family: 'cx', names: { r64: 'RCX', r32: 'ECX', r16: 'CX', high8: 'CH', low8: 'CL' } },
  { family: 'dx', names: { r64: 'RDX', r32: 'EDX', r16: 'DX', high8: 'DH', low8: 'DL' } },
  { family: 'si', names: { r64: 'RSI', r32: 'ESI', r16: 'SI', low8: 'SIL' } },
  { family: 'di', names: { r64: 'RDI', r32: 'EDI', r16: 'DI', low8: 'DIL' } },
  { family: 'bp', names: { r64: 'RBP', r32: 'EBP', r16: 'BP', low8: 'BPL' } },
  { family: 'sp', names: { r64: 'RSP', r32: 'ESP', r16: 'SP', low8: 'SPL' } },
]

const INDEX_FAMILIES: FamilyDefinition[] = [
  { family: 'r8', names: { r64: 'R8', r32: 'R8D', r16: 'R8W', low8: 'R8B' } },
  { family: 'r9', names: { r64: 'R9', r32: 'R9D', r16: 'R9W', low8: 'R9B' } },
  { family: 'r10', names: { r64: 'R10', r32: 'R10D', r16: 'R10W', low8: 'R10B' } },
  { family: 'r11', names: { r64: 'R11', r32: 'R11D', r16: 'R11W', low8: 'R11B' } },
  { family: 'r12', names: { r64: 'R12', r32: 'R12D', r16: 'R12W', low8: 'R12B' } },
  { family: 'r13', names: { r64: 'R13', r32: 'R13D', r16: 'R13W', low8: 'R13B' } },
  { family: 'r14', names: { r64: 'R14', r32: 'R14D', r16: 'R14W', low8: 'R14B' } },
  { family: 'r15', names: { r64: 'R15', r32: 'R15D', r16: 'R15W', low8: 'R15B' } },
]

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
  private table: HTMLElement
  private cells = new Map<string, HTMLElement>()
  private previousValues = new Map<string, bigint>()
  private lastSnapshot: CpuSnapshot | null = null

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'panel panel--registers'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Registers</h2>'

    this.table = document.createElement('div')
    this.table.className = 'regtable'

    this.root.append(header, this.table)
    this.buildTable()
  }

  private buildTable(): void {
    // Заголовок столбцов: 64 / 32 / 16 / AH / AL
    const head = document.createElement('div')
    head.className = 'regtable__row regtable__row--head'
    for (const label of ['', '64', '32', '16', 'hi', 'lo']) {
      const cell = document.createElement('span')
      cell.textContent = label
      head.appendChild(cell)
    }
    this.table.appendChild(head)

    for (const family of [...FAMILIES, ...INDEX_FAMILIES]) {
      const row = document.createElement('div')
      row.className = 'regtable__row'
      row.dataset.family = family.family

      const label = document.createElement('span')
      label.className = 'regtable__label'
      label.textContent = family.names.r16
      row.appendChild(label)

      const columns: Array<[string, string, 8 | 16 | 32 | 64, number]> = [
        ['r64', family.names.r64, 64, 0],
        ['r32', family.names.r32, 32, 0],
        ['r16', family.names.r16, 16, 0],
        ['high8', family.names.high8 ?? '—', 8, 8],
        ['low8', family.names.low8, 8, 0],
      ]

      for (const [key, name, bits, shift] of columns) {
        const cell = document.createElement('span')
        cell.className = 'regtable__value'
        cell.dataset.register = name
        cell.dataset.bits = String(bits)
        if (key === 'high8' && !family.names.high8) {
          cell.classList.add('is-empty')
          cell.textContent = '—'
        } else {
          cell.textContent = bits === 64 ? '0000000000000000' : bits === 32 ? '00000000' : '0000'
          this.cells.set(`${family.family}:${key}`, cell)
        }
        cell.title = `${name} — ${bits === 64 ? '64' : bits === 32 ? '32' : '8'} бит${shift ? ' (старший байт)' : ''}`
        row.appendChild(cell)
      }

      this.table.appendChild(row)
    }
  }

  /** Обновляет значения из снимка */
  update(snapshot: CpuSnapshot): void {
    this.lastSnapshot = snapshot
    for (const family of [...FAMILIES, ...INDEX_FAMILIES]) {
      const raw = snapshot.gpr[GPR_INDEX[family.family]] ?? 0n
      const value = raw & MASK64
      this.setCell(family.family, 'r64', formatHex(value, 16), value)
      this.setCell(family.family, 'r32', formatHex(slice(value, 32), 8), slice(value, 32))
      this.setCell(family.family, 'r16', formatHex(slice(value, 16), 4), slice(value, 16))
      if (family.names.high8) {
        this.setCell(family.family, 'high8', formatHex(slice(value, 8, 8), 2), slice(value, 8, 8))
      }
      this.setCell(family.family, 'low8', formatHex(slice(value, 8), 2), slice(value, 8))
    }
  }

  private setCell(family: string, key: string, text: string, raw: bigint): void {
    const cell = this.cells.get(`${family}:${key}`)
    if (!cell) return
    const id = `${family}:${key}`
    const changed = this.previousValues.get(id) !== raw
    this.previousValues.set(id, raw)
    if (cell.textContent !== text) cell.textContent = text
    if (changed) {
      cell.classList.add('is-changed')
      window.setTimeout(() => cell.classList.remove('is-changed'), 400)
    }
    const bits = Number(cell.dataset.bits)
    cell.title = `${cell.dataset.register} = ${text} (${BigInt.asUintN(bits, raw).toString(10)} dec)`
  }

  /** Сброс панели */
  clear(): void {
    this.previousValues.clear()
    this.update({
      rip: 0, rsp: 0, rbp: 0,
      gpr: Array.from({ length: 16 }, () => 0n),
      rflags: 0n,
      cs: 0, ds: 0, es: 0, ss: 0, fs: 0, gs: 0,
    })
  }

  /** В 16-битном режиме скрываем расширенные регистры R8–R15 */
  setArchMode(mode: 'x64' | 'x16'): void {
    this.root.dataset.mode = mode
    for (const row of Array.from(this.table.querySelectorAll<HTMLElement>('.regtable__row'))) {
      const family = row.dataset.family
      if (!family) continue
      const isExtended = /^r\d+$/.test(family)
      row.hidden = mode === 'x16' && isExtended
    }
    if (this.lastSnapshot) this.update(this.lastSnapshot)
  }
}
