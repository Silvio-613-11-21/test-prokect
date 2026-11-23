/**
 * Высокоуровневая сессия: WASM-инструменты (NASM + ld), загрузка программы,
 * пошаговое исполнение и чтение состояния процессора/памяти.
 */

import { Blink, describeSignal, type BlinkState } from './blink'
import type { CpuSnapshot, DisasmLine, Diagnostic, StackEntry } from '../../types'
import { LINKER_COMMAND, MINIMAL_LINKER_SCRIPT, NASM_COMMAND, OUTPUT_NAME, type ArchMode } from '../asm/modes'

export interface SessionOptions {
  scriptUrl: string
  /** Готовый модуль emscripten (передаётся из приложения, см. App.ts) */
  scriptModule?: unknown
  wasmUrl: string
  assemblerUrl: string
  linkerUrl: string
  onOutput?: (text: string) => void
  onStateChange?: (state: BlinkState) => void
}

export interface ToolResult {
  exitCode: number | null
  log: string
}

export class EmulatorSession {
  private blink: Blink
  private ready = false
  private currentProgram: string | null = null
  private currentArgs: string[] = []

  constructor(options: SessionOptions) {
    this.blink = new Blink({
      scriptUrl: options.scriptUrl,
      scriptModule: options.scriptModule,
      wasmUrl: options.wasmUrl,
      assemblerUrl: options.assemblerUrl,
      linkerUrl: options.linkerUrl,
      onOutput: options.onOutput,
      onStateChange: options.onStateChange,
    })
  }

  get state(): BlinkState {
    return this.blink.state
  }

  async init(): Promise<void> {
    await this.blink.init()
    this.blink.writeLinkerScript(MINIMAL_LINKER_SCRIPT)
    this.ready = true
  }

  get isReady(): boolean {
    return this.ready
  }

  /** Компилирует исходник: x64 → elf, x16 → flat bin */
  async compile(source: string, mode: ArchMode): Promise<ToolResult> {
    this.blink.writeSource(source)
    if (mode === 'x64') {
      this.blink.deleteFile('/program.o')
      this.blink.deleteFile('/program')
    } else {
      this.blink.deleteFile('/program.bin')
    }
    return this.blink.runTool('/assembler', NASM_COMMAND[mode].split(' '))
  }

  /** Линкует объектный файл x64 */
  async link(): Promise<ToolResult> {
    this.blink.deleteFile('/program')
    return this.blink.runTool('/linker', LINKER_COMMAND.split(' '))
  }

  getArtifact(mode: ArchMode): Uint8Array | null {
    return this.blink.readFile(OUTPUT_NAME[mode])
  }

  artifactExists(mode: ArchMode): boolean {
    return this.blink.fileExists(OUTPUT_NAME[mode])
  }

  /** Загружает скомпилированную программу и останавливается на первой инструкции */
  async loadProgram(mode: ArchMode): Promise<boolean> {
    if (mode !== 'x64') return false
    const program = OUTPUT_NAME[mode]
    if (!this.blink.fileExists(program)) return false
    this.currentProgram = program
    this.currentArgs = [program]
    await this.blink.startDebug(program, this.currentArgs)
    return true
  }

  /**
   * Запуск загруженной программы.
   *
   * Если программа уже загружена через startDebug (стоит на первой
   * инструкции), она продолжается с текущего места — так работают
   * «Шаг», «Сброс» и «Запуск» после отладки.
   */
  async runProgram(): Promise<number | null> {
    if (!this.currentProgram) return null
    if (this.blink.isPaused) return this.blink.continueRun()
    return this.blink.runProgram(this.currentProgram, this.currentArgs)
  }

  step(): void {
    this.blink.step()
  }

  async continueRun(): Promise<void> {
    await this.blink.continueRun()
  }

  /** Остановить длительное выполнение */
  stop(): void {
    this.blink.requestStop()
  }

  /** Колбэк обновления интерфейса между квантами выполнения */
  setRefreshCallback(callback: () => Promise<void> | void): void {
    this.blink.refreshCallback = callback
  }

  sendInput(line: string): void {
    this.blink.readLine(line)
  }

  stopReason(): string {
    const reason = this.blink.stopReason
    if (!reason) return ''
    return reason.details
  }

  /** Снимок регистров из WASM */
  snapshot(): CpuSnapshot | null {
    const struct = this.blink.struct
    if (!struct) return null
    const order = [
      'rax', 'rbx', 'rcx', 'rdx',
      'rsi', 'rdi', 'rbp', 'rsp',
      'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15',
    ] as const

    const gpr = order.map(name => struct.readU64(name))
    const rsp = struct.readU64('rsp')
    const rbp = struct.readU64('rbp')
    const rip = struct.readU64('rip')
    const flagsPointer = struct.pointerField('flags')
    const rflags = flagsPointer ? struct.readU64ByPointer(flagsPointer) : 0n
    const csBase = struct.readU64('cs__base')

    return {
      rip: Number(rip),
      rsp: Number(rsp & 0xffffffffffffn),
      rbp: Number(rbp & 0xffffffffffffn),
      gpr,
      rflags,
      cs: Number(csBase & 0xffffn),
      ds: 0,
      es: 0,
      ss: 0,
      fs: 0,
      gs: 0,
    }
  }

  /** Дизассемблер вокруг текущего RIP */
  disassembly(): DisasmLine[] {
    const struct = this.blink.struct
    if (!struct) return []
    const { maxLines, lineLength, buffer } = struct.disassemblyMeta()
    if (!buffer) return []

    const lines: DisasmLine[] = []
    for (let i = 0; i < maxLines; i++) {
      const raw = struct.readCString(buffer + i * lineLength, lineLength)
      if (!raw) continue
      const parsed = parseDisassemblyLine(raw)
      if (parsed) lines.push(parsed)
    }
    return lines
  }

  /** Номер текущей строки дизассемблера (указатель RIP) */
  disassemblyCurrentLine(): number {
    const struct = this.blink.struct
    if (!struct) return 0
    return struct.disassemblyMeta().currentLine
  }

  /** Чтение памяти процесса (байты) */
  readMemory(address: number, length: number): Uint8Array | null {
    return this.blink.readVirtual(address, length)
  }

  /** Стек от rsp вверх */
  readStack(count: number): StackEntry[] {
    const snapshot = this.snapshot()
    if (!snapshot) return []
    const entries: StackEntry[] = []
    const base = snapshot.rsp
    const bytes = this.blink.readVirtual(base, count * 8)
    for (let i = 0; i < count; i++) {
      if (!bytes) {
        entries.push({ address: base + i * 8, value: 0n })
        continue
      }
      let value = 0n
      for (let byte = 7; byte >= 0; byte--) {
        const index = i * 8 + byte
        if (index >= bytes.length) break
        value = (value << 8n) | BigInt(bytes[index])
      }
      entries.push({ address: base + i * 8, value })
    }
    return entries
  }

  /**
   * Регион памяти для дампа.
   *
   * Сначала пробуем запрошенный адрес (например, текущий RSP), затем —
   * секции .data и .text линкера: стек по адресу может быть ещё не
   * отображён в таблице страниц, а дамп памяти нужен всегда.
   */
  memoryWindow(preferredAddress: number, size = 16 * 14): { address: number; bytes: Uint8Array } | null {
    const candidates = [preferredAddress, 0x402000, 0x401000]
    for (const candidate of candidates) {
      const aligned = Math.max(0, Math.floor(candidate / 16) * 16)
      const bytes = this.blink.readVirtual(aligned, size)
      if (bytes) return { address: aligned, bytes }
    }
    return null
  }

  /** Текстовое описание завершения */
  describeStop(): string {
    const blink = this.blink
    if (!blink.stopReason) return ''
    const { exitCode, details } = blink.stopReason
    if (exitCode === 0) return `${details} (успешно)`
    return details
  }
}

/**
 * Строка дизассемблера от blink выглядит как HTML-фрагмент:
 * `<td class='addr'>00401000 </td><td class='hex'> b8 06 </td><td class='str'>mov eax, 6</td>`
 * или `<td class='addr'>00401000 </td><td class='label'>_start:</td>`
 */
function parseDisassemblyLine(raw: string): DisasmLine | null {
  const addressMatch = /class='addr'>([0-9a-fA-F]+)/.exec(raw)
  if (!addressMatch) return null
  const address = Number.parseInt(addressMatch[1], 16)

  const labelMatch = /class='label'>([^<]*)</.exec(raw)
  if (labelMatch) {
    return { address, bytes: '', text: '', label: labelMatch[1] }
  }

  const hexMatch = /class='hex'>([^<]*)</.exec(raw)
  const strMatch = /class='str'>([^<]*)</.exec(raw)
  if (!strMatch) return null

  return {
    address,
    bytes: (hexMatch?.[1] ?? '').trim().replace(/\s+/g, ' '),
    text: decodeEntities(strMatch[1]).trim(),
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Разбор диагностики NASM: `/assembly.s:12: error: ...` */
export function parseNasmDiagnostics(log: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const regex = /^.*?:(\d+): (error|warning): (.*)$/
  for (const line of log.split(/\r?\n/)) {
    const match = regex.exec(line)
    if (!match) continue
    diagnostics.push({
      line: Number.parseInt(match[1], 10),
      severity: match[2] === 'error' ? 'error' : 'warning',
      message: match[3].trim(),
    })
  }
  return diagnostics
}

/** Разбор ошибок линкера (у него нет номеров строк исходника) */
export function parseLinkerDiagnostics(log: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const line of log.split(/\r?\n/)) {
    if (/error|undefined reference|cannot/i.test(line)) {
      diagnostics.push({ line: 0, severity: 'error', message: line.trim() })
    }
  }
  return diagnostics
}

export { describeSignal }
