/**
 * Обёртка над WASM-движком blink (x86-64 emulator).
 *
 * blink — это патченный эмулятор, собранный в WebAssembly (см. LICENSE-blink.txt).
 * Внутри эмулятора запускаются настоящие статические бинарники NASM и GNU ld,
 * поэтому компиляция и исполнение происходят целиком в браузере.
 *
 * Все методы асинхронны и не блокируют интерфейс: тяжёлая работа идёт
 * в wasm, а управление возвращается через SIGTRAP-preempt.
 */

import { BlinkStruct } from './struct'

export type BlinkState =
  | 'NOT_READY'
  | 'READY'
  | 'ASSEMBLING'
  | 'LINKING'
  | 'PROGRAM_LOADED'
  | 'PROGRAM_RUNNING'
  | 'PROGRAM_READLINE_PAUSE'
  | 'PROGRAM_STOPPED'

export interface BlinkStopReason {
  loadFail: boolean
  exitCode: number
  details: string
}

export interface BlinkOptions {
  /** URL JS-обёртки emscripten */
  scriptUrl: string
  /** JS-обёртка напрямую (если bundler уже её импортировал) */
  scriptModule?: unknown
  /** URL бинарника wasm (если не указан — ищется рядом со скриптом) */
  wasmUrl: string
  /** URL статического NASM */
  assemblerUrl: string
  /** URL статического GNU ld */
  linkerUrl: string
  /** Колбэк stdout/stderr эмулятора */
  onOutput?: (text: string) => void
  /** Колбэк смены состояния */
  onStateChange?: (state: BlinkState) => void
}

const SIGTRAP = 5
const SIGTRAP_PREEMPT = 40
const SIGTRAP_STEP = 41
const SIGTRAP_FAKE_TTY = 42

const SIGNALS: Record<number, string> = {
  1: 'SIGHUP',
  2: 'SIGINT',
  3: 'SIGQUIT',
  4: 'SIGILL',
  5: 'SIGTRAP',
  6: 'SIGABRT',
  7: 'SIGBUS',
  8: 'SIGFPE',
  9: 'SIGKILL',
  11: 'SIGSEGV',
  13: 'SIGPIPE',
  15: 'SIGTERM',
  24: 'SIGXCPU',
}

export function describeSignal(signal: number): string {
  return SIGNALS[signal] ?? `сигнал ${signal}`
}

interface EmscriptenModule {
  FS: any
  callMain: (args: string[]) => void
  addFunction: (fn: (...args: number[]) => void, signature: string) => number
  wasmExports: { memory: WebAssembly.Memory }
  _blinkenlib_run_fast: () => void
  _blinkenlib_run: () => void
  _blinkenlib_start: () => void
  _blinkenlib_starti: () => void
  _blinkenlib_stepi: () => void
  _blinkenlib_continue: () => void
  _blinkenlib_preempt_resume: () => void
  _blinkenlib_faketty_resume: () => void
  _blinkenlib_get_clstruct: () => number
  _blinkenlib_get_argc_string: () => number
  _blinkenlib_get_argv_string: () => number
  _blinkenlib_get_progname_string: () => number
  _blinkenlib_spy_address: (address: number, size?: number) => number
}

type BlinkFactory = (moduleArg?: Record<string, unknown>) => Promise<EmscriptenModule>

export class Blink {
  readonly states = {
    NOT_READY: 'NOT_READY',
    READY: 'READY',
    ASSEMBLING: 'ASSEMBLING',
    LINKING: 'LINKING',
    PROGRAM_LOADED: 'PROGRAM_LOADED',
    PROGRAM_RUNNING: 'PROGRAM_RUNNING',
    PROGRAM_READLINE_PAUSE: 'PROGRAM_READLINE_PAUSE',
    PROGRAM_STOPPED: 'PROGRAM_STOPPED',
  } as const

  state: BlinkState = 'NOT_READY'
  stopReason: BlinkStopReason | null = null
  struct: BlinkStruct | null = null
  /** Накопленный вывод ассемблера/линкера */
  assemblerLogs = ''
  /** Программа загружена через startDebug и не завершилась */
  private programLoaded = false

  private module: EmscriptenModule | null = null
  private options: BlinkOptions
  private initPromise: Promise<void> | null = null
  private onOutput: (text: string) => void
  private onStateChange: (state: BlinkState) => void
  private stdinBytes: number[] = []
  private runResolver: (() => void) | null = null
  /** Пользователь запросил остановку: следующий preempt не продолжит выполнение */
  private stopRequested = false
  private binaryCache = new Map<string, Uint8Array>()
  /** Колбэк «эмулятор отдал управление» — для обновления интерфейса во время выполнения */
  refreshCallback: (() => Promise<void> | void) | null = null

  constructor(options: BlinkOptions) {
    this.options = options
    this.onOutput = options.onOutput ?? (() => {})
    this.onStateChange = options.onStateChange ?? (() => {})
  }

  /** Загружает wasm-модуль. Повторные вызовы возвращают тот же промис. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((error) => {
        this.initPromise = null
        this.setState('NOT_READY')
        throw error
      })
    }
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    const factory = (this.options.scriptModule ?? (await import(/* @vite-ignore */ this.options.scriptUrl))) as {
      default: BlinkFactory
    }
    const [assembler, linker, wasmBinary] = await Promise.all([
      this.fetchBinary(this.options.assemblerUrl),
      this.fetchBinary(this.options.linkerUrl),
      this.fetchBinary(this.options.wasmUrl),
    ])

    const self = this
    const module = await factory.default({
      noInitialRun: true,
      wasmBinary,
      // emscripten определяет путь к wasm от import.meta.url, а у бандла он
      // может быть data:-URL — указываем расположение рядом с обёрткой явно.
      locateFile: (file: string) => this.resolveAsset(file),
      print: (text: string) => self.emit(text + '\n', false),
      printErr: (text: string) => self.emit(text + '\n', true),
      preRun: (M: { FS: any }) => {
        M.FS.init(
          () => self.readStdinByte(),
          (charCode: number) => self.handleStdout(charCode),
          (charCode: number) => self.handleStderr(charCode),
        )
      },
    })

    this.module = module
    this.writeFile('/assembler', assembler)
    this.writeFile('/linker', linker)

    const signalCallback = module.addFunction(this.externSignalCallback.bind(this), 'vii')
    const exitCallback = module.addFunction(this.externExitCallback.bind(this), 'vi')
    module.callMain([String(signalCallback), String(exitCallback)])

    const memory = module.wasmExports.memory
    this.struct = new BlinkStruct(memory, module._blinkenlib_get_clstruct())
    this.setState('READY')
  }

  /** Абсолютный URL ассета рядом с JS-обёрткой (не зависит от import.meta.url бандла) */
  private resolveAsset(file: string): string {
    const base = typeof document !== 'undefined' ? document.baseURI : undefined
    const script = new URL(this.options.scriptUrl, base).href
    return new URL(file, script).href
  }

  private async fetchBinary(url: string): Promise<Uint8Array> {
    const cached = this.binaryCache.get(url)
    if (cached) return cached
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Не удалось загрузить ${url}: HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    this.binaryCache.set(url, bytes)
    return bytes
  }

  private requireModule(): EmscriptenModule {
    if (!this.module) throw new Error('blink: модуль ещё не инициализирован')
    return this.module
  }

  private writeFile(name: string, data: Uint8Array): void {
    const FS = this.requireModule().FS
    const stream = FS.open(name, 'w+')
    FS.write(stream, data, 0, data.length, 0)
    FS.close(stream)
    FS.chmod(name, 0o777)
  }

  /** Читает файл из виртуальной ФС */
  readFile(name: string): Uint8Array | null {
    const FS = this.requireModule().FS
    try {
      return FS.readFile(name)
    } catch {
      return null
    }
  }

  fileExists(name: string): boolean {
    const FS = this.requireModule().FS
    try {
      FS.stat(name)
      return true
    } catch {
      return false
    }
  }

  deleteFile(name: string): void {
    const FS = this.requireModule().FS
    try {
      FS.unlink(name)
    } catch {
      /* файла нет — это нормально */
    }
  }

  /** Кладёт исходник в виртуальную ФС */
  writeSource(source: string): void {
    const FS = this.requireModule().FS
    FS.writeFile('/assembly.s', source)
  }

  writeLinkerScript(script: string): void {
    this.requireModule().FS.writeFile('/link.ld', script)
  }

  /**
   * Запускает программу внутри эмулятора и ждёт завершения.
   * Возвращает код выхода или null, если завершилось по сигналу.
   */
  async runProgram(program: string, args: string[]): Promise<number | null> {
    const module = this.requireModule()
    this.makeExecutable(program)
    this.stopReason = null
    await this.emulate(program, args, () => module._blinkenlib_run_fast())
    return this.currentExitCode()
  }

  /** Код выхода последнего запуска (null, если завершилось по сигналу) */
  private currentExitCode(): number | null {
    const reason: BlinkStopReason | null = this.stopReason
    return reason ? reason.exitCode : null
  }

  /** Загружает программу и останавливается на первой инструкции */
  async startDebug(program: string, args: string[]): Promise<void> {
    const module = this.requireModule()
    // Файл, созданный NASM/ld, не имеет бита исполнения — без него exec вернёт 127
    this.makeExecutable(program)
    this.assemblerLogs = ''
    this.stopReason = null
    this.writeCommandLine(program, args)
    // starti только загружает программу и не запускает ни одной инструкции:
    // сигнала не будет, поэтому отдельный waitForStop здесь не нужен.
    module._blinkenlib_starti()
    this.programLoaded = true
    // Загрузка могла вырастить память — перечитываем структуру
    this.struct = new BlinkStruct(module.wasmExports.memory, module._blinkenlib_get_clstruct())
    this.setState('PROGRAM_STOPPED')
  }

  /** Программа загружена и приостановлена (можно продолжить или шагать) */
  get isPaused(): boolean {
    return this.programLoaded && this.state === 'PROGRAM_STOPPED'
  }

  private makeExecutable(program: string): void {
    const FS = this.requireModule().FS
    try {
      FS.chmod(program, 0o777)
    } catch {
      /* файла нет — ошибку покажет загрузка программы */
    }
  }

  /** Один шаг выполнения */
  step(): void {
    const module = this.requireModule()
    if (this.state !== 'PROGRAM_RUNNING' && this.state !== 'PROGRAM_STOPPED') return
    this.stopRequested = false
    module._blinkenlib_stepi()
  }

  /**
   * Запрос остановки длительного выполнения.
   * blink отдаёт управление браузеру на каждом preempt (каждые MAX_CYCLES),
   * поэтому здесь достаточно не продолжать выполнение.
   */
  requestStop(): void {
    this.stopRequested = true
  }

  /** Продолжить выполнение с текущей инструкции до конца/сигнала */
  async continueRun(): Promise<number | null> {
    const module = this.requireModule()
    if (!this.programLoaded) return null
    await this.waitForStop(() => {
      this.setState('PROGRAM_RUNNING')
      module._blinkenlib_continue()
    })
    this.setState('PROGRAM_STOPPED')
    return this.currentExitCode()
  }

  /** Передаёт строку в fake-tty (чтение из stdin программой) */
  readLine(line: string): void {
    const module = this.requireModule()
    this.stdinBytes = Array.from(new TextEncoder().encode(line)).reverse()
    this.setState('PROGRAM_RUNNING')
    module._blinkenlib_faketty_resume()
  }

  private emulate(program: string, args: string[], trigger: () => void): Promise<void> {
    const module = this.requireModule()
    this.assemblerLogs = ''
    this.writeCommandLine(program, args)
    return this.waitForStop(() => {
      this.setState('PROGRAM_RUNNING')
      trigger()
      void module
    })
  }

  private waitForStop(trigger: () => void): Promise<void> {
    return new Promise<void>((resolve) => {
      this.runResolver = () => {
        this.runResolver = null
        resolve()
      }
      trigger()
    })
  }

  private writeCommandLine(program: string, args: string[]): void {
    const module = this.requireModule()
    const struct = this.struct
    if (!struct) return
    const commandLine = args.join(' ')
    struct.writeCString(module._blinkenlib_get_progname_string(), program, 200)
    struct.writeCString(module._blinkenlib_get_argc_string(), commandLine, 200)
    struct.writeCString(module._blinkenlib_get_argv_string(), '', 200)
  }

  /** Запуск ассемблера/линкера (быстрый режим без отладчика) */
  async runTool(program: string, args: string[]): Promise<{ exitCode: number | null; log: string }> {
    const module = this.requireModule()
    this.assemblerLogs = ''
    this.programLoaded = false
    const previousState = this.state
    this.setState('ASSEMBLING')
    await this.emulate(program, args, () => module._blinkenlib_run_fast())
    const log = this.assemblerLogs
    const exitCode = this.stopReason ? this.stopReason.exitCode : null
    this.setState(previousState === 'NOT_READY' ? 'READY' : previousState)
    return { exitCode, log }
  }

  private readStdinByte(): number | null {
    const byte = this.stdinBytes.pop()
    return byte === undefined ? null : byte
  }

  private handleStdout(charCode: number): void {
    if (this.state === 'ASSEMBLING' || this.state === 'LINKING') {
      this.assemblerLogs += String.fromCharCode(charCode)
      return
    }
    this.onOutput(String.fromCharCode(charCode))
  }

  private handleStderr(charCode: number): void {
    if (this.state === 'ASSEMBLING' || this.state === 'LINKING') {
      this.assemblerLogs += String.fromCharCode(charCode)
      return
    }
    this.onOutput(String.fromCharCode(charCode))
  }

  private emit(text: string, _isError: boolean): void {
    if (this.state === 'ASSEMBLING' || this.state === 'LINKING') {
      this.assemblerLogs += text
    }
  }

  private externSignalCallback(signal: number, code: number): void {
    if (signal !== SIGTRAP) {
      this.stopReason = {
        loadFail: false,
        exitCode: 128 + signal,
        details: `Программа остановлена сигналом ${describeSignal(signal)} (${signal})`,
      }
      this.emit(`\n[${describeSignal(signal)}]\n`, true)
      this.setState('PROGRAM_STOPPED')
      this.runResolver?.()
      return
    }

    if (code === SIGTRAP_PREEMPT) {
      if (this.stopRequested) {
        this.stopRequested = false
        this.stopReason = {
          loadFail: false,
          exitCode: 0,
          details: 'Выполнение остановлено пользователем',
        }
        this.setState('PROGRAM_STOPPED')
        this.runResolver?.()
        return
      }
      // Эмулятор отдал управление браузеру: даём отрисоваться кадру и продолжаем
      requestAnimationFrame(() => {
        const resume = () => this.requireModule()._blinkenlib_preempt_resume()
        const result = this.refreshCallback?.()
        if (result && typeof (result as Promise<void>).then === 'function') {
          void (result as Promise<void>).then(resume, resume)
        } else {
          resume()
        }
      })
      return
    }

    if (code === SIGTRAP_STEP) {
      this.setState('PROGRAM_STOPPED')
      this.runResolver?.()
      return
    }

    if (code === SIGTRAP_FAKE_TTY) {
      this.setState('PROGRAM_READLINE_PAUSE')
      this.onOutput('\n[программа ожидает ввод]\n')
      this.runResolver?.()
      return
    }

    this.setState('PROGRAM_STOPPED')
    this.runResolver?.()
  }

  private externExitCallback(exitCode: number): void {
    this.programLoaded = false
    this.stopReason = {
      loadFail: false,
      exitCode,
      details: `Программа завершилась с кодом ${exitCode}`,
    }
    this.setState('PROGRAM_STOPPED')
    this.runResolver?.()
  }

  private setState(state: BlinkState): void {
    if (this.state === state) return
    this.state = state
    this.onStateChange(state)
  }

  /** Прочитать 8 байт гостевой памяти по виртуальному адресу */
  readVirtual(address: number, length: number): Uint8Array | null {
    const module = this.requireModule()
    const struct = this.struct
    if (!struct) return null
    const pointer = module._blinkenlib_spy_address(address, 0)
    if (!pointer) return null
    return struct.readBytes(pointer, length)
  }
}
