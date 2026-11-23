/**
 * Связь с C-структурой blink (см. blinkenlib.h).
 *
 * JS-сторона читает массив 32-битных указателей на поля Machine:
 * адреса регистров, флагов, буфер дизассемблера и т.д.
 */

export type StructKey =
  | 'version'
  | 'codemem'
  | 'stackmem'
  | 'readaddr'
  | 'readsize'
  | 'writeaddr'
  | 'writesize'
  | 'flags'
  | 'cs__base'
  | 'rip'
  | 'rsp'
  | 'rbp'
  | 'rsi'
  | 'rdi'
  | 'r8'
  | 'r9'
  | 'r10'
  | 'r11'
  | 'r12'
  | 'r13'
  | 'r14'
  | 'r15'
  | 'rax'
  | 'rbx'
  | 'rcx'
  | 'rdx'
  | 'dis__max_lines'
  | 'dis__max_line_len'
  | 'dis__current_line'
  | 'dis__buffer'

interface KeySpec {
  index: number
  pointer: boolean
}

const KEYS: Record<StructKey, KeySpec> = {
  version: { index: 0, pointer: false },
  codemem: { index: 1, pointer: true },
  stackmem: { index: 2, pointer: true },
  readaddr: { index: 3, pointer: true },
  readsize: { index: 4, pointer: false },
  writeaddr: { index: 5, pointer: true },
  writesize: { index: 6, pointer: false },
  flags: { index: 7, pointer: false },
  cs__base: { index: 8, pointer: true },
  rip: { index: 9, pointer: true },
  rsp: { index: 10, pointer: true },
  rbp: { index: 11, pointer: true },
  rsi: { index: 12, pointer: true },
  rdi: { index: 13, pointer: true },
  r8: { index: 14, pointer: true },
  r9: { index: 15, pointer: true },
  r10: { index: 16, pointer: true },
  r11: { index: 17, pointer: true },
  r12: { index: 18, pointer: true },
  r13: { index: 19, pointer: true },
  r14: { index: 20, pointer: true },
  r15: { index: 21, pointer: true },
  rax: { index: 22, pointer: true },
  rbx: { index: 23, pointer: true },
  rcx: { index: 24, pointer: true },
  rdx: { index: 25, pointer: true },
  dis__max_lines: { index: 26, pointer: false },
  dis__max_line_len: { index: 27, pointer: false },
  dis__current_line: { index: 28, pointer: false },
  dis__buffer: { index: 29, pointer: true },
}

const STRUCT_VERSION = 1
const SIZEOF_KEY = 4

export class BlinkStruct {
  readonly memory: WebAssembly.Memory
  readonly pointer: number
  private memView: DataView
  private structView: DataView

  constructor(memory: WebAssembly.Memory, structPointer: number) {
    this.memory = memory
    this.pointer = structPointer
    this.memView = new DataView(memory.buffer)
    this.structView = new DataView(memory.buffer, structPointer, Object.keys(KEYS).length * SIZEOF_KEY)

    if (this.getNumber('version') !== STRUCT_VERSION) {
      throw new Error('blink: несовпадение версии разделяемой структуры')
    }
  }

  /** После роста памяти буферы WebAssembly.Memory пересоздаются */
  refresh(): void {
    if (this.memView.buffer !== this.memory.buffer) {
      this.memView = new DataView(this.memory.buffer)
      this.structView = new DataView(
        this.memory.buffer,
        this.pointer,
        Object.keys(KEYS).length * SIZEOF_KEY,
      )
    }
  }

  pointerField(key: StructKey): number {
    this.refresh()
    return this.structView.getUint32(KEYS[key].index * SIZEOF_KEY, true)
  }

  /** Числовое значение поля (не указатель) */
  getNumber(key: StructKey): number {
    this.refresh()
    return this.structView.getUint32(KEYS[key].index * SIZEOF_KEY, true)
  }

  /** 64-битное значение по указателю из поля */
  readU64(key: StructKey): bigint {
    this.refresh()
    const pointer = this.pointerField(key)
    return this.memView.getBigUint64(pointer, true)
  }

  readU32ByPointer(pointer: number): number {
    this.refresh()
    return this.memView.getUint32(pointer, true)
  }

  readU64ByPointer(pointer: number): bigint {
    this.refresh()
    return this.memView.getBigUint64(pointer, true)
  }

  /** Чтение байтов по wasm-указателю */
  readBytes(pointer: number, length: number): Uint8Array {
    this.refresh()
    return new Uint8Array(this.memory.buffer, pointer, length).slice()
  }

  /** Чтение C-строки по указателю */
  readCString(pointer: number, maxLength = 4096): string {
    this.refresh()
    const bytes = new Uint8Array(this.memory.buffer, pointer, maxLength)
    let end = 0
    while (end < bytes.length && bytes[end] !== 0) end++
    return new TextDecoder().decode(bytes.subarray(0, end))
  }

  /** Запись C-строки в heap (аргументы запуска программы) */
  writeCString(pointer: number, value: string, maxLength = 200): void {
    this.refresh()
    if (pointer === 0) return
    const length = Math.min(value.length, maxLength - 1)
    for (let i = 0; i < length; i++) {
      const code = value.charCodeAt(i)
      this.memView.setUint8(pointer + i, code >= 0x20 && code <= 0x7e ? code : 0x20)
    }
    this.memView.setUint8(pointer + length, 0)
  }

  /** Координаты буфера дизассемблера */
  disassemblyMeta() {
    return {
      maxLines: this.getNumber('dis__max_lines'),
      lineLength: this.getNumber('dis__max_line_len'),
      currentLine: this.getNumber('dis__current_line'),
      buffer: this.pointerField('dis__buffer'),
    }
  }
}
