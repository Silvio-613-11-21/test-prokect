/**
 * Корневой контроллер SPA.
 *
 * Собирает рабочую область: панель управления, редактор, док отладчика,
 * панель ограничений. Вся логика обработки (сборка NASM, линковка, исполнение,
 * проверка ограничений) происходит в браузере.
 */

import { CodeEditor } from '../ui/editor/CodeEditor'
import { DisassemblyPanel } from '../ui/widgets/DisassemblyPanel'
import { MemoryPanel } from '../ui/widgets/MemoryPanel'
import { RegistersPanel } from '../ui/widgets/RegistersPanel'
import { RestrictionPanel } from '../ui/widgets/RestrictionPanel'
import { StackPanel } from '../ui/widgets/StackPanel'
import { TerminalPanel } from '../ui/widgets/TerminalPanel'
import { DebuggerDock } from '../ui/widgets/DebuggerDock'
import { Splitter } from '../ui/widgets/Splitter'
import { Toolbar, type ToolbarState } from '../ui/widgets/Toolbar'

import { EmulatorSession, parseLinkerDiagnostics, parseNasmDiagnostics } from '../core/blink/session'
import { canExecute, NO_EXECUTION_REASON, type ArchMode } from '../core/asm/modes'
import { checkRestrictions, getLabLink, getLabTask, getLabTitle, isRegisterAllowed, type LabTask } from '../core/restrictions'
import { defaultExample, examples, findExample, findExampleForLab } from '../examples'
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

const THEME_STORAGE_KEY = 'asm-lab:theme'
const MODE_STORAGE_KEY = 'asm-lab:mode'

export class App {
  private root: HTMLElement
  private toolbar: Toolbar
  private editor: CodeEditor
  private dock: DebuggerDock
  private splitter: Splitter

  private disassembly: DisassemblyPanel
  private registers: RegistersPanel
  private stack: StackPanel
  private memory: MemoryPanel
  private terminal: TerminalPanel
  private restrictions: RestrictionPanel

  private session: EmulatorSession
  private route: RouteState
  private labTask: LabTask | undefined
  private archMode: ArchMode = 'x64'
  private theme: 'dark' | 'light' = 'dark'
  private machineState: MachineState = 'idle'
  private compiled = false
  private running = false
  private memoryAddress = 0x402000
  private lastRip = 0

  constructor(root: HTMLElement) {
    this.root = root
    this.route = parseRoute()
    this.archMode = this.route.mode ?? (localStorage.getItem(MODE_STORAGE_KEY) as ArchMode | null) ?? 'x64'
    this.theme = this.route.theme ?? (localStorage.getItem(THEME_STORAGE_KEY) as 'dark' | 'light' | null) ?? 'dark'

    this.toolbar = new Toolbar(
      {
        onCompile: () => void this.compile(),
        onRun: () => void this.runOrPause(),
        onStep: () => void this.step(),
        onReset: () => this.reset(),
        onStop: () => this.stop(),
        onModeChange: mode => this.switchMode(mode),
        onLabChange: (lab, z) => this.setLab(lab, z),
        onExampleChange: id => this.loadExample(id),
        onThemeToggle: () => this.toggleTheme(),
        onShare: () => void this.copyShareLink(),
        onDownload: () => this.downloadSource(),
      },
      examples.map(example => ({ id: example.id, title: example.title })),
    )

    this.editor = new CodeEditor({
      onChange: () => {
        this.compiled = false
        this.machineState = 'idle'
        this.syncToolbar()
      },
      onCursorChange: (line, column) => this.updateCursor(line, column),
    })

    this.disassembly = new DisassemblyPanel()
    this.registers = new RegistersPanel()
    this.stack = new StackPanel()
    this.memory = new MemoryPanel()
    this.terminal = new TerminalPanel()
    this.restrictions = new RestrictionPanel()

    this.dock = new DebuggerDock()
    this.dock.addTab({ id: 'disasm', title: 'Дизассемблер', element: this.disassembly.root })
    this.dock.addTab({ id: 'registers', title: 'Регистры', element: this.registers.root })
    this.dock.addTab({ id: 'stack', title: 'Стек', element: this.stack.root })
    this.dock.addTab({ id: 'memory', title: 'Память', element: this.memory.root })
    this.dock.addTab({ id: 'console', title: 'Терминал', element: this.terminal.root })

    this.splitter = new Splitter({
      onChange: ratio => this.root.style.setProperty('--editor-ratio', `${ratio * 100}%`),
    })

    this.session = new EmulatorSession({
      scriptUrl: blinkScriptUrl,
      scriptModule: blinkModule,
      wasmUrl: blinkWasmUrl,
      assemblerUrl: nasmUrl,
      linkerUrl: linkerUrl,
      onOutput: text => this.terminal.append(text),
      onStateChange: state => this.onBlinkState(state),
    })

    this.terminal.setInputHandler(line => {
      this.session.sendInput(line)
    })

    // blink отдаёт управление браузеру каждые ~100k циклов: используем это,
    // чтобы обновлять панели прямо во время выполнения программы
    this.session.setRefreshCallback(() => this.refreshViews(false))

    this.memory.setAddressHandler(address => {
      this.memoryAddress = address
      void this.refreshViews(false)
    })

    this.mount()
    this.applyTheme()
    this.installKeyboardShortcuts()
    void this.bootstrap()
  }

  // ─────────────────────────────── монтирование ───────────────────────────────

  private mount(): void {
    this.root.classList.add('app')

    const workspace = document.createElement('div')
    workspace.className = 'workspace'

    const editorPane = document.createElement('section')
    editorPane.className = 'pane pane--editor'

    const editorHeader = document.createElement('header')
    editorHeader.className = 'pane__header'

    const tabs = document.createElement('div')
    tabs.className = 'editor-tabs'
    const tab = document.createElement('span')
    tab.className = 'editor-tab is-active'
    tab.textContent = 'main.asm'
    tabs.appendChild(tab)

    const cursor = document.createElement('span')
    cursor.className = 'pane__meta'
    cursor.dataset.role = 'cursor'
    cursor.textContent = 'Стр 1, Кол 1'

    editorHeader.append(tabs, cursor)

    const hint = document.createElement('div')
    hint.className = 'editor-hint'
    hint.innerHTML =
      '<kbd>Ctrl</kbd>+<kbd>Enter</kbd> — компилировать · ' +
      '<kbd>F5</kbd> — запустить · <kbd>F10</kbd> — шаг · <kbd>Shift</kbd>+<kbd>F5</kbd> — сброс'

    editorPane.append(editorHeader, this.editor.root, hint)

    const sidePane = document.createElement('aside')
    sidePane.className = 'pane pane--side'
    sidePane.appendChild(this.restrictions.root)

    workspace.append(sidePane)

    const debuggerPane = document.createElement('section')
    debuggerPane.className = 'pane pane--debugger'
    debuggerPane.appendChild(this.dock.root)

    const split = document.createElement('div')
    split.className = 'main-split'
    split.append(editorPane, debuggerPane)

    workspace.insertBefore(split, sidePane)

    this.root.append(this.toolbar.root, workspace)

    this.splitter.attach(split)

    // стартовое значение разделителя
    const savedRatio = Number.parseFloat(localStorage.getItem('asm-lab:split') ?? '0.52')
    this.root.style.setProperty('--editor-ratio', `${(Number.isFinite(savedRatio) ? savedRatio : 0.52) * 100}%`)
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
      this.toolbar.setStatus('wasm не загрузился', 'error')
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
    this.toolbar.setExample(example.id)
  }

  // ─────────────────────────────── маршрут и ограничения ───────────────────────────────

  private applyRouteToUI(): void {
    this.toolbar.setMode(this.archMode)
    this.registers.setArchMode(this.archMode)

    if (this.route.lab !== undefined) {
      this.setLabInternal(this.route.lab, this.route.z ?? -1)
    } else {
      this.setLabInternal(0, -1)
    }
    this.syncToolbar()
  }

  private setLab(lab: number, z: number): void {
    this.setLabInternal(lab, z)
    this.persistRoute()
    this.refreshRestrictions()

    // При смене задания подставляем соответствующий пример,
    // чтобы код сразу соответствовал новым ограничениям.
    const example = lab > 0 ? findExampleForLab(lab, z) : undefined
    if (example) {
      this.editor.setText(example.code)
      this.toolbar.setExample(example.id)
      this.reset()
    }
  }

  private setLabInternal(lab: number, z: number): void {
    this.route = { ...this.route, lab: lab || undefined, z: lab ? z : undefined }
    this.labTask = lab > 0 ? getLabTask(lab, z) : undefined
    this.toolbar.setLab(lab > 0 ? lab : undefined, lab > 0 ? z : undefined)
    this.applyRegisterHighlighting()
  }

  private refreshRestrictions(): void {
    const lab = this.route.lab && this.route.lab > 0 ? this.route.lab : undefined
    this.restrictions.render(this.labTask, lab ? getLabTitle(lab) : undefined)
    this.applyRegisterHighlighting()

    const link = lab ? getLabLink(lab) : undefined
    if (link) {
      this.restrictions.root.querySelector('.restrictions__title')?.setAttribute('title', link)
    }
  }

  private applyRegisterHighlighting(): void {
    const task = this.labTask
    this.editor.setRegisterHighlighting(
      (register) => (isRegisterAllowed(register, task) ? 'tok-register' : null),
      (register) => !isRegisterAllowed(register, task),
    )
  }

  // ─────────────────────────────── действия ───────────────────────────────

  private async compile(): Promise<boolean> {
    if (this.session.state === 'ASSEMBLING' || this.session.state === 'LINKING') return false
    const source = this.editor.getText()

    // 1. Проверка ограничений ДО компиляции
    const report = checkRestrictions(source, this.labTask, this.archMode)
    this.restrictions.showViolations(report.violations)

    if (!report.ok) {
      this.markErrors(report.violations.map(v => ({ line: v.line, severity: 'error' as const, message: v.title })))
      this.toolbar.setStatus(`нарушений: ${report.violations.length}`, 'error')
      this.dock.activate('registers')
      this.machineState = 'restriction-error'
      return false
    }

    this.toolbar.setStatus('компиляция…', 'busy')
    this.dock.setBadge('disasm', null)
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
      this.machineState = 'loaded'
      this.dock.setBadge('console', null)
      this.toolbar.setStatus('собрано', 'ok')
      this.terminal.append(`Сборка успешна (${this.archMode}).\n`)

      if (this.archMode === 'x16') {
        this.toolbar.setStatus('собрано в .bin', 'ok')
      } else {
        await this.refreshViews(true)
        this.dock.activate('disasm')
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
    this.dock.setBadge('console', String(errors.length || 1), 'error')
    this.terminal.append(log.replace(/^\s*\n+/, '') + '\n')
    this.dock.activate('console')
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

  private async runOrPause(): Promise<void> {
    if (!this.compiled) {
      const ok = await this.compile()
      if (!ok) return
    }
    if (!canExecute(this.archMode)) {
      this.showNoExecutionMessage()
      return
    }
    if (this.running) {
      this.stop()
      return
    }

    this.running = true
    this.machineState = 'running'
    this.syncToolbar()
    this.toolbar.setStatus('выполнение…', 'busy')

    try {
      const exitCode = await this.session.runProgram()
      this.machineState = 'terminated'
      this.running = false
      this.toolbar.setStatus(exitCode === 0 ? 'завершено' : `код ${exitCode ?? '?'}`, exitCode === 0 ? 'ok' : 'error')
      this.terminal.append(`\n${this.session.stopReason()}\n`)
      await this.refreshViews(true)
      this.dock.activate('registers')
    } finally {
      this.running = false
      this.syncToolbar()
    }
  }

  private async step(): Promise<void> {
    if (!canExecute(this.archMode)) {
      this.showNoExecutionMessage()
      return
    }
    if (!this.compiled) {
      const ok = await this.compile()
      if (!ok) return
    }
    if (this.machineState === 'terminated') {
      this.toolbar.setStatus('программа завершена — нажмите «Сброс»', 'error')
      return
    }
    this.session.step()
    if (this.running) {
      this.running = false
      this.toolbar.setRunning(false)
    }
    this.machineState = 'paused'
    await this.refreshViews(false)
    this.syncToolbar()
  }

  private stop(): void {
    this.session.stop()
    if (!this.running) return
    this.running = false
    this.toolbar.setRunning(false)
    this.toolbar.setStatus('остановлено', 'idle')
    this.machineState = 'paused'
    this.syncToolbar()
  }

  private reset(): void {
    this.compiled = false
    this.running = false
    this.machineState = 'idle'
    this.toolbar.setRunning(false)
    this.toolbar.setStatus('сброшено', 'idle')
    this.disassembly.clear()
    this.registers.clear()
    this.stack.clear()
    this.memory.clear()
    this.memoryAddress = 0x402000
    this.markErrors([])
    this.dock.setBadge('console', null)
    this.syncToolbar()
  }

  private switchMode(mode: ArchMode): void {
    this.archMode = mode
    localStorage.setItem(MODE_STORAGE_KEY, mode)
    this.registers.setArchMode(mode)
    this.reset()
    this.persistRoute()
    this.syncToolbar()
  }

  private loadExample(id: string): void {
    const example = findExample(id)
    if (!example) return
    this.editor.setText(example.code)
    this.reset()
    this.persistRoute()
    this.toolbar.setExample(id)
  }

  private toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, this.theme)
    this.applyTheme()
    this.persistRoute()
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.theme
    this.syncToolbar()
  }

  private showNoExecutionMessage(): void {
    this.toolbar.setStatus('16-бит: запуск недоступен', 'error')
    this.terminal.clear()
    this.terminal.append(NO_EXECUTION_REASON + '\n')
    this.dock.activate('console')
  }

  private async copyShareLink(): Promise<void> {
    const code = await encodeCode(this.editor.getText())
    const params = new URLSearchParams()
    if (this.route.lab) {
      params.set('lab', String(this.route.lab))
      params.set('z', String(this.route.z ?? -1))
    }
    params.set('mode', this.archMode)
    params.set('theme', this.theme)
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
      theme: this.theme,
    })
  }

  // ─────────────────────────────── рендер состояния ───────────────────────────────

  private syncToolbar(): void {
    const state: ToolbarState = {
      busy: this.session.state === 'ASSEMBLING' || this.session.state === 'LINKING',
      compiled: this.compiled,
      running: this.running,
      canExecute: canExecute(this.archMode),
      mode: this.archMode,
      lab: this.route.lab,
      task: this.route.z,
      exampleId: '',
      theme: this.theme,
    }
    this.toolbar.update(state)
    this.toolbar.setRunning(this.running)
  }

  private onBlinkState(_state: string): void {
    this.syncToolbar()
  }

  async refreshViews(withDisassembly: boolean): Promise<void> {
    if (this.archMode !== 'x64') return

    const snapshot = this.session.snapshot()
    if (!snapshot) return
    this.registers.update(snapshot)

    if (withDisassembly) {
      const lines = this.session.disassembly()
      if (lines.length > 0) {
        this.disassembly.render(lines, this.session.disassemblyCurrentLine())
      }
    } else {
      this.disassembly.highlight(this.session.disassemblyCurrentLine())
    }

    const stackEntries = this.session.readStack(14)
    const stackBytes = this.session.readMemory(snapshot.rsp, 14 * 8)
    this.stack.update(snapshot.rsp, stackEntries, stackBytes)

    if (this.memoryAddress !== 0 || this.machineState !== 'idle') {
      const window = this.session.memoryWindow(this.memoryAddress)
      if (window) {
        this.memory.update(window.address, window.bytes)
      }
    }

    this.lastRip = snapshot.rip
    void this.lastRip

    if (this.machineState === 'loaded' || this.machineState === 'paused' || this.machineState === 'terminated') {
      this.dock.activate(this.dock.active ?? 'registers')
    }
  }

}
