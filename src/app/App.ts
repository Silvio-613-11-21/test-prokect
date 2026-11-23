/**
 * Корневой контроллер SPA.
 *
 * Раскладка повторяет diplom_ / DOSBox Insight:
 *   ┌──────────────────────────────────────────────┐
 *   │ заголовок + режим                            │
 *   ├──────────────────────────────────────────────┤
 *   │ [Скомпилировать] [Запустить] …   ограничения  │
 *   ├──────────────────┬───────────────────────────┤
 *   │ редактор         │ дизассемблер + регистры   │
 *   │                  │ флаги, память, стек       │
 *   │                  ├───────────────────────────┤
 *   │                  │ консоль                   │
 *   └──────────────────┴───────────────────────────┘
 *
 * Никаких селекторов лабораторной/задачи: ограничения приходят
 * только из ссылки (?lab=N&z=M), а текст задания студент получает
 * отдельно, поэтому в интерфейсе его нет.
 */

import { CodeEditor } from '../ui/editor/CodeEditor'
import { DisassemblyPanel } from '../ui/widgets/DisassemblyPanel'
import { MemoryPanel } from '../ui/widgets/MemoryPanel'
import { RegistersPanel } from '../ui/widgets/RegistersPanel'
import { RestrictionPanel } from '../ui/widgets/RestrictionPanel'
import { FlagsPanel } from '../ui/widgets/FlagsPanel'
import { StackPanel } from '../ui/widgets/StackPanel'
import { TerminalPanel } from '../ui/widgets/TerminalPanel'
import { DebuggerView } from '../ui/widgets/DebuggerView'
import { Toolbar, type ToolbarState } from '../ui/widgets/Toolbar'

import { EmulatorSession, parseLinkerDiagnostics, parseNasmDiagnostics } from '../core/blink/session'
import { canExecute, NO_EXECUTION_REASON, type ArchMode } from '../core/asm/modes'
import { checkRestrictions, getLabTask, isRegisterAllowed, type LabTask } from '../core/restrictions'
import { defaultExample, findExample, findExampleForLab } from '../examples'
import { parseRoute, syncRoute, type RouteState } from './route'
import { decodeCode, encodeCode } from './share'
import type { Diagnostic, MachineState } from '../types'

// blinkenlib.js — обычный ES-модуль, его импорт не ломает сборку,
// а URL нужен для поиска .wasm рядом со скриптом
import * as blinkModule from '../assets/blinkenlib.js'
import blinkScriptUrl from '../assets/blinkenlib.js?url'
import blinkWasmUrl from '../assets/blinkenlib.wasm?url'
import nasmUrl from '../assets/nasm.elf?url'
import linkerUrl from '../assets/gnu-ld.elf?url'

import './app.css'

const MODE_STORAGE_KEY = 'asm-lab:mode'
const SPLIT_STORAGE_KEY = 'asm-lab:split'

/** Задержка между инструкциями в режиме «Пошагово (анимация)» */
const ANIMATION_DELAY = 60

export class App {
  private root: HTMLElement
  private toolbar: Toolbar
  private editor: CodeEditor
  private view: DebuggerView

  private disassembly: DisassemblyPanel
  private registers: RegistersPanel
  private flags: FlagsPanel
  private stack: StackPanel
  private memory: MemoryPanel
  private terminal: TerminalPanel
  private restrictions: RestrictionPanel

  private session: EmulatorSession
  private route: RouteState
  private labTask: LabTask | undefined
  private archMode: ArchMode = 'x64'
  private machineState: MachineState = 'idle'
  private compiled = false
  private running = false
  private animating = false
  private animationTimer: number | null = null
  private memoryAddress = 0

  constructor(root: HTMLElement) {
    this.root = root
    this.route = parseRoute()
    this.archMode = this.route.mode ?? (localStorage.getItem(MODE_STORAGE_KEY) as ArchMode | null) ?? 'x64'

    this.toolbar = new Toolbar({
      onCompile: () => void this.compile(),
      onRun: () => void this.runOrPause(),
      onAnimate: () => void this.animate(),
      onStep: () => void this.step(),
      onReset: () => this.reset(),
      onStop: () => this.stop(),
      onModeChange: mode => this.switchMode(mode),
      onShare: () => void this.copyShareLink(),
      onDownload: () => this.downloadSource(),
    })

    this.editor = new CodeEditor({
      onChange: () => {
        if (this.compiled) {
          this.compiled = false
          this.machineState = 'idle'
        }
        this.syncToolbar()
      },
      onCursorChange: (line, column) => this.updateCursor(line, column),
    })

    this.disassembly = new DisassemblyPanel()
    this.registers = new RegistersPanel()
    this.flags = new FlagsPanel()
    this.stack = new StackPanel()
    this.memory = new MemoryPanel()
    this.terminal = new TerminalPanel()
    this.restrictions = new RestrictionPanel()
    this.view = new DebuggerView()

    this.session = new EmulatorSession({
      scriptUrl: blinkScriptUrl,
      scriptModule: blinkModule,
      wasmUrl: blinkWasmUrl,
      assemblerUrl: nasmUrl,
      linkerUrl: linkerUrl,
      onOutput: text => this.terminal.append(text),
      onStateChange: state => this.onBlinkState(state),
    })

    this.terminal.setInputHandler(line => this.session.sendInput(line))

    // blink отдаёт управление браузеру каждые ~100k циклов: используем это,
    // чтобы обновлять панели прямо во время выполнения программы
    this.session.setRefreshCallback(() => this.refreshViews(false))

    this.memory.setAddressHandler(address => {
      this.memoryAddress = address
      void this.refreshViews(false, true)
    })

    this.mount()
    this.installKeyboardShortcuts()
    void this.bootstrap()
  }

  // ─────────────────────────────── монтирование ───────────────────────────────

  private mount(): void {
    this.root.classList.add('app')

    const page = document.createElement('div')
    page.className = 'work-page'

    // Строка управления: кнопки + ограничения
    const controls = document.createElement('div')
    controls.className = 'work-page__controls'
    controls.append(this.toolbar.controls, this.restrictions.root)

    const hint = document.createElement('div')
    hint.className = 'work-page__hint'
    hint.innerHTML =
      '<kbd>Ctrl</kbd>+<kbd>Enter</kbd> — компилировать · ' +
      '<kbd>F5</kbd> — запустить · <kbd>F10</kbd> — шаг · ' +
      '<kbd>Shift</kbd>+<kbd>F5</kbd> — сброс'

    // Основная область: редактор слева, отладчик справа
    const workspace = document.createElement('div')
    workspace.className = 'workspace'

    const editorPane = document.createElement('section')
    editorPane.className = 'editor-pane'

    const editorHeader = document.createElement('header')
    editorHeader.className = 'editor-pane__header'

    const fileName = document.createElement('span')
    fileName.className = 'editor-pane__file'
    fileName.textContent = 'main.asm'

    const meta = document.createElement('div')
    meta.className = 'editor-pane__meta'
    const cursor = document.createElement('span')
    cursor.dataset.role = 'cursor'
    cursor.textContent = 'Стр 1, Кол 1'
    const download = document.createElement('button')
    download.type = 'button'
    download.className = 'mini'
    download.title = 'Скачать исходник'
    download.textContent = '⭳'
    download.addEventListener('click', () => this.downloadSource())
    meta.append(cursor, download)

    editorHeader.append(fileName, meta)
    editorPane.append(editorHeader, this.editor.root)

    const debuggerPane = document.createElement('section')
    debuggerPane.className = 'debugger-pane'
    debuggerPane.append(this.toolbar.modeHint, this.view.root)

    this.view.codeSlot.append(this.disassembly.root)
    this.view.registersSlot.append(this.registers.root)
    this.view.flagsSlot.append(this.flags.root)
    this.view.memorySlot.append(this.memory.root)
    this.view.stackSlot.append(this.stack.root)
    this.view.consoleSlot.append(this.terminal.root)

    workspace.append(editorPane, debuggerPane)

    page.append(controls, workspace, hint)
    this.root.append(this.toolbar.root, page)

    // Пропорции колонок редактор/отладчик (перетаскивание за разделитель)
    const saved = Number.parseFloat(localStorage.getItem(SPLIT_STORAGE_KEY) ?? '0.36')
    this.applySplit(Number.isFinite(saved) ? saved : 0.36)
    this.installSplitter(workspace)

    this.applyTheme()
  }

  private applyTheme(): void {
    // Тёмная тема по умолчанию и единственная: светлая больше не нужна
    document.documentElement.dataset.theme = 'dark'
  }

  private applySplit(ratio: number): void {
    const clamped = Math.min(0.7, Math.max(0.2, ratio))
    this.root.style.setProperty('--editor-width', `${clamped * 100}%`)
    localStorage.setItem(SPLIT_STORAGE_KEY, String(clamped))
  }

  private installSplitter(workspace: HTMLElement): void {
    const separator = document.createElement('div')
    separator.className = 'workspace__splitter'
    separator.title = 'Перетащите, чтобы изменить ширину редактора'
    workspace.insertBefore(separator, workspace.lastElementChild)

    let dragging = false
    separator.addEventListener('pointerdown', event => {
      dragging = true
      event.preventDefault()
      separator.setPointerCapture(event.pointerId)
      separator.classList.add('is-dragging')
    })
    window.addEventListener('pointermove', event => {
      if (!dragging) return
      const rect = workspace.getBoundingClientRect()
      this.applySplit((event.clientX - rect.left) / rect.width)
    })
    const stop = () => {
      if (!dragging) return
      dragging = false
      separator.classList.remove('is-dragging')
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)

    separator.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const current = Number.parseFloat(localStorage.getItem(SPLIT_STORAGE_KEY) ?? '0.36')
      this.applySplit(current + (event.key === 'ArrowLeft' ? -0.04 : 0.04))
    })
  }

  private updateCursor(line: number, column: number): void {
    const node = this.root.querySelector<HTMLElement>('[data-role="cursor"]')
    if (node) node.textContent = `Стр ${line}, Кол ${column}`
  }

  private installKeyboardShortcuts(): void {
    window.addEventListener('keydown', event => {
      const meta = event.ctrlKey || event.metaKey
      if (meta && event.key === 'Enter') {
        event.preventDefault()
        void this.compile()
        return
      }
      if (event.key === 'F5' && event.shiftKey) {
        event.preventDefault()
        this.reset()
        return
      }
      if (event.key === 'F5') {
        event.preventDefault()
        void this.runOrPause()
        return
      }
      if (event.key === 'F10') {
        event.preventDefault()
        void this.step()
        return
      }
    })
  }

  // ─────────────────────────────── инициализация ───────────────────────────────

  private async bootstrap(): Promise<void> {
    this.applyRouteToUI()
    this.toolbar.setStatus('загрузка NASM…', 'busy')

    try {
      await this.session.init()
      this.toolbar.setStatus('готово', 'ok')
    } catch (error) {
      console.error(error)
      this.toolbar.setStatus('эмулятор не загрузился', 'error')
      this.terminal.append(`Ошибка загрузки эмулятора: ${String(error)}\n`)
      return
    }

    await this.loadInitialSource()
    this.refreshRestrictions()
  }

  private async loadInitialSource(): Promise<void> {
    if (this.route.code) {
      const decoded = await decodeCode(this.route.code)
      if (decoded) {
        this.editor.setText(decoded)
        return
      }
    }

    const example =
      findExample(this.route.example) ??
      (this.route.lab ? findExampleForLab(this.route.lab, this.route.z ?? -1) : undefined) ??
      defaultExample
    this.editor.setText(example.code)
  }

  // ─────────────────────────────── маршрут и ограничения ───────────────────────────────

  private applyRouteToUI(): void {
    this.toolbar.setMode(this.archMode)
    this.registers.setArchMode(this.archMode)
    this.view.setArchMode(this.archMode)
    this.setLabInternal(this.route.lab ?? 0, this.route.z ?? -1)
    this.syncToolbar()
  }

  private setLabInternal(lab: number, z: number): void {
    this.route = { ...this.route, lab: lab || undefined, z: lab ? z : undefined }
    this.labTask = lab > 0 ? getLabTask(lab, z) : undefined
    this.applyRegisterHighlighting()
  }

  private refreshRestrictions(): void {
    this.restrictions.render(this.labTask)
    this.applyRegisterHighlighting()
  }

  private applyRegisterHighlighting(): void {
    const task = this.labTask
    this.editor.setRegisterHighlighting(
      register => (isRegisterAllowed(register, task) ? 'tok-register' : null),
      register => !isRegisterAllowed(register, task),
    )
  }

  // ─────────────────────────────── действия ───────────────────────────────

  private async compile(): Promise<boolean> {
    if (this.session.state === 'ASSEMBLING' || this.session.state === 'LINKING') return false
    this.stopAnimation()
    const source = this.editor.getText()

    // 1. Проверка ограничений ДО компиляции
    const report = checkRestrictions(source, this.labTask, this.archMode)
    this.restrictions.showViolations(report.violations)

    if (!report.ok) {
      this.markErrors(report.violations.map(v => ({ line: v.line, severity: 'error' as const, message: v.title })))
      this.toolbar.setStatus(`нарушений: ${report.violations.length}`, 'error')
      this.machineState = 'restriction-error'
      return false
    }

    this.toolbar.setStatus('компиляция…', 'busy')
    this.terminal.clear()

    try {
      const assemble = await this.session.compile(source, this.archMode)
      const diagnostics = parseNasmDiagnostics(assemble.log)
      if (assemble.exitCode !== 0 || diagnostics.some(d => d.severity === 'error')) {
        this.reportDiagnostics(diagnostics, assemble.log, 'NASM')
        return false
      }

      if (this.archMode === 'x64') {
        const link = await this.session.link()
        const linkDiagnostics = parseLinkerDiagnostics(link.log)
        if (link.exitCode !== 0 || linkDiagnostics.length > 0) {
          this.reportDiagnostics(linkDiagnostics, link.log, 'ld')
          return false
        }
        const loaded = await this.session.loadProgram('x64')
        if (!loaded) {
          this.toolbar.setStatus('не удалось загрузить ELF', 'error')
          return false
        }
      }

      this.compiled = true
      this.markErrors([])
      this.restrictions.clearViolations()
      this.machineState = 'loaded'
      this.toolbar.setStatus(this.archMode === 'x16' ? 'собрано в .bin' : 'собрано', 'ok')
      this.terminal.append(this.archMode === 'x16' ? 'Сборка в .bin успешна (запуск недоступен).\n' : 'Сборка успешна.\n')

      if (this.archMode === 'x64') {
        this.memoryAddress = 0
        await this.refreshViews(true)
      }
      this.syncToolbar()
      return true
    } catch (error) {
      console.error(error)
      this.toolbar.setStatus('ошибка компиляции', 'error')
      this.terminal.append(`Ошибка: ${String(error)}\n`)
      return false
    }
  }

  private reportDiagnostics(diagnostics: Diagnostic[], log: string, tool: string): void {
    const errors = diagnostics.filter(d => d.severity === 'error')
    this.markErrors(diagnostics)
    this.compiled = false
    this.machineState = 'assemble-error'
    this.toolbar.setStatus(`${tool}: ошибок ${errors.length || 1}`, 'error')
    this.terminal.append(log.replace(/^\s*\n+/, '') + '\n')
    const first = errors.find(e => e.line > 0)
    if (first) this.editor.revealLine(first.line)
    this.syncToolbar()
  }

  private markErrors(diagnostics: Array<{ line: number; message: string }>): void {
    const map = new Map<number, string>()
    for (const diagnostic of diagnostics) {
      if (diagnostic.line > 0 && !map.has(diagnostic.line)) {
        map.set(diagnostic.line, diagnostic.message)
      }
    }
    this.editor.setErrors(map)
  }

  /** Запуск до конца (или пауза, если программа уже выполняется) */
  private async runOrPause(): Promise<void> {
    if (this.running) {
      this.stop()
      return
    }
    if (!this.compiled) {
      const ok = await this.compile()
      if (!ok) return
    }
    if (!canExecute(this.archMode)) {
      this.showNoExecutionMessage()
      return
    }

    this.stopAnimation()
    this.running = true
    this.machineState = 'running'
    this.syncToolbar()
    this.toolbar.setStatus('выполнение…', 'busy')
    this.view.setConsoleStatus('выполнение')

    try {
      const exitCode = await this.session.runProgram()
      this.machineState = 'terminated'
      this.toolbar.setStatus(exitCode === 0 ? 'завершено' : `код ${exitCode ?? '?'}`, exitCode === 0 ? 'ok' : 'error')
      this.view.setConsoleStatus(exitCode === 0 ? 'завершено' : `код ${exitCode ?? '?'}`)
      this.terminal.append(`\n${this.session.stopReason()}\n`)
      await this.refreshViews(true)
    } catch (error) {
      console.error(error)
      this.toolbar.setStatus('ошибка выполнения', 'error')
    } finally {
      this.running = false
      this.syncToolbar()
    }
  }

  /** Пошаговое выполнение с задержкой — как «Пошагово (анимация)» в diplom_ */
  private async animate(): Promise<void> {
    if (this.animating) {
      this.stopAnimation()
      return
    }
    if (!this.compiled) {
      const ok = await this.compile()
      if (!ok) return
    }
    if (!canExecute(this.archMode)) {
      this.showNoExecutionMessage()
      return
    }

    this.animating = true
    this.running = true
    this.syncToolbar()
    this.toolbar.setStatus('анимация…', 'busy')
    this.view.setConsoleStatus('анимация')

    const tick = async () => {
      if (!this.animating) return
      if (this.machineState === 'terminated' && this.compiled === false) {
        this.stopAnimation()
        return
      }
      this.session.step()
      this.machineState = 'paused'
      await this.refreshViews(false)
      this.animationTimer = window.setTimeout(() => void tick(), ANIMATION_DELAY)
    }
    void tick()
  }

  private stopAnimation(): void {
    if (this.animationTimer !== null) {
      window.clearTimeout(this.animationTimer)
      this.animationTimer = null
    }
    if (this.animating) {
      this.animating = false
      this.running = false
      this.syncToolbar()
    }
  }

  private async step(): Promise<void> {
    this.stopAnimation()
    if (!canExecute(this.archMode)) {
      this.showNoExecutionMessage()
      return
    }
    if (!this.compiled) {
      const ok = await this.compile()
      if (!ok) return
    }
    if (this.machineState === 'terminated') {
      this.toolbar.setStatus('программа завершена — нажмите «Сбросить»', 'error')
      return
    }
    this.session.step()
    this.running = false
    this.machineState = 'paused'
    await this.refreshViews(false)
    this.syncToolbar()
  }

  private stop(): void {
    this.stopAnimation()
    this.session.stop()
    if (!this.running) return
    this.running = false
    this.toolbar.setStatus('остановлено', 'idle')
    this.machineState = 'paused'
    this.syncToolbar()
  }

  private reset(): void {
    this.stopAnimation()
    this.compiled = false
    this.running = false
    this.machineState = 'idle'
    this.toolbar.setStatus('сброшено', 'idle')
    this.toolbar.setRunning(false)
    this.disassembly.clear()
    this.registers.clear()
    this.flags.clear()
    this.stack.clear()
    this.memory.clear()
    this.memoryAddress = 0
    this.markErrors([])
    this.view.setConsoleStatus('')
    this.syncToolbar()
  }

  private switchMode(mode: ArchMode): void {
    this.archMode = mode
    localStorage.setItem(MODE_STORAGE_KEY, mode)
    this.registers.setArchMode(mode)
    this.view.setArchMode(mode)
    this.reset()
    this.persistRoute()
    this.syncToolbar()
  }

  private showNoExecutionMessage(): void {
    this.toolbar.setStatus('16-бит: запуск недоступен', 'error')
    this.terminal.clear()
    this.terminal.append(NO_EXECUTION_REASON + '\n')
    this.view.setConsoleStatus('16-бит')
  }

  private async copyShareLink(): Promise<void> {
    const code = await encodeCode(this.editor.getText())
    const params = new URLSearchParams()
    if (this.route.lab) {
      params.set('lab', String(this.route.lab))
      params.set('z', String(this.route.z ?? -1))
    }
    params.set('mode', this.archMode)
    params.set('code', code)
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
    try {
      await navigator.clipboard.writeText(url)
      this.toolbar.setStatus('ссылка скопирована', 'ok')
    } catch {
      window.prompt('Скопируйте ссылку:', url)
    }
    this.persistRoute()
  }

  private downloadSource(): void {
    const blob = new Blob([this.editor.getText()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'main.asm'
    link.click()
    URL.revokeObjectURL(url)
  }

  private persistRoute(): void {
    syncRoute({
      lab: this.route.lab,
      z: this.route.z,
      mode: this.archMode,
      theme: 'dark',
    })
  }

  // ─────────────────────────────── рендер состояния ───────────────────────────────

  private syncToolbar(): void {
    const state: ToolbarState = {
      busy: this.session.state === 'ASSEMBLING' || this.session.state === 'LINKING',
      compiled: this.compiled,
      running: this.running,
      animating: this.animating,
      canExecute: canExecute(this.archMode),
      mode: this.archMode,
    }
    this.toolbar.update(state)
  }

  private onBlinkState(_state: string): void {
    this.syncToolbar()
  }

  async refreshViews(withDisassembly: boolean, redrawMemory = false): Promise<void> {
    if (this.archMode !== 'x64') return

    const snapshot = this.session.snapshot()
    if (!snapshot) return
    this.registers.update(snapshot)
    this.flags.update(snapshot.rflags, snapshot.rip)

    if (withDisassembly) {
      const lines = this.session.disassembly()
      if (lines.length > 0) {
        this.disassembly.render(lines, this.session.disassemblyCurrentLine())
      }
    } else {
      this.disassembly.highlight(this.session.disassemblyCurrentLine())
    }

    const stackEntries = this.session.readStack(12)
    const stackBytes = this.session.readMemory(snapshot.rsp, 12 * 8)
    this.stack.update(snapshot.rsp, stackEntries, stackBytes)

    // По умолчанию показываем область памяти вокруг RSP,
    // пока пользователь не ввёл свой адрес
    if (this.memoryAddress === 0) this.memoryAddress = snapshot.rsp
    if (withDisassembly || redrawMemory) {
      const window = this.session.memoryWindow(this.memoryAddress)
      if (window) this.memory.update(window.address, window.bytes)
    }
  }
}
