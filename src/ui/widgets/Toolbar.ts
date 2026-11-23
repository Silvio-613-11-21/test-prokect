/**
 * Верхняя панель и блок управления.
 *
 * Сделано по образцу diplom_ (ветка go-to-finish): тонкий заголовок,
 * строка кнопок «Скомпилировать / Запустить / Пошагово / Сбросить»
 * и компактный индикатор состояния.
 */

import type { ArchMode } from '../../core/asm/modes'

export interface ToolbarHandlers {
  onCompile: () => void
  onRun: () => void
  /** Пошаговое выполнение с анимацией (непрерывно) */
  onAnimate: () => void
  /** Один шаг вручную */
  onStep: () => void
  onReset: () => void
  onStop: () => void
  onModeChange: (mode: ArchMode) => void
  onShare: () => void
  onDownload: () => void
}

export interface ToolbarState {
  busy: boolean
  compiled: boolean
  running: boolean
  animating: boolean
  canExecute: boolean
  mode: ArchMode
}

export class Toolbar {
  /** Верхняя полоса с названием и переключателем режима */
  readonly root: HTMLElement
  /** Строка кнопок под заголовком */
  readonly controls: HTMLElement

  private compileButton: HTMLButtonElement
  private runButton: HTMLButtonElement
  private animateButton: HTMLButtonElement
  private stepButton: HTMLButtonElement
  private resetButton: HTMLButtonElement
  private modeSelect: HTMLSelectElement
  private statusLabel: HTMLElement
  /** Предупреждение о 16-битном режиме (вставляется в App) */
  readonly modeHint: HTMLElement

  constructor(handlers: ToolbarHandlers) {
    // ─────────────────────────── верхняя полоса ───────────────────────────
    this.root = document.createElement('header')
    this.root.className = 'topbar'

    const brand = document.createElement('div')
    brand.className = 'topbar__brand'
    const logo = document.createElement('img')
    logo.src = './logo.svg'
    logo.alt = ''
    logo.className = 'topbar__logo'
    const brandTitle = document.createElement('div')
    brandTitle.className = 'topbar__title'
    brandTitle.innerHTML =
      '<span class="topbar__name">Asm-emulator</span><span class="topbar__sub">/ for laboratory works</span>'
    brand.append(logo, brandTitle)

    const right = document.createElement('div')
    right.className = 'topbar__right'

    this.modeSelect = document.createElement('select')
    this.modeSelect.className = 'select'
    this.modeSelect.title = 'Режим ассемблера'
    this.modeSelect.innerHTML = `
      <option value="x64">x86-64 (исполнение)</option>
      <option value="x16">16 бит (компиляция)</option>
    `
    this.modeSelect.addEventListener('change', () => {
      handlers.onModeChange(this.modeSelect.value as ArchMode)
    })

    const share = this.makeButton('Ссылка', 'button button--ghost', handlers.onShare)
    share.title = 'Скопировать ссылку с кодом'

    const download = this.makeButton('Скачать', 'button button--ghost', handlers.onDownload)
    download.title = 'Скачать исходник (.asm)'

    right.append(this.modeSelect, share, download)

    this.root.append(brand, right)

    // ─────────────────────────── блок управления ───────────────────────────
    this.controls = document.createElement('div')
    this.controls.className = 'controlpanel'

    const buttons = document.createElement('div')
    buttons.className = 'controlpanel__buttons'

    this.compileButton = this.makeButton('Скомпилировать', 'button button--primary', handlers.onCompile)
    this.runButton = this.makeButton('Запустить', 'button button--run', handlers.onRun)
    this.animateButton = this.makeButton('Пошагово (анимация)', 'button', handlers.onAnimate)
    this.stepButton = this.makeButton('Пошагово (руками)', 'button', handlers.onStep)
    this.resetButton = this.makeButton('Сбросить', 'button', handlers.onReset)

    this.compileButton.title = 'NASM собирает программу (Ctrl+Enter)'
    this.runButton.title = 'Выполнить до конца (F5)'
    this.animateButton.title = 'Выполнять по одной инструкции с задержкой'
    this.stepButton.title = 'Одна инструкция (F10)'
    this.resetButton.title = 'Сбросить состояние отладчика (Shift+F5)'

    buttons.append(
      this.compileButton,
      this.runButton,
      this.animateButton,
      this.stepButton,
      this.resetButton,
    )

    this.statusLabel = document.createElement('span')
    this.statusLabel.className = 'controlpanel__status'
    this.statusLabel.textContent = 'загрузка…'
    this.controls.append(buttons, this.statusLabel)

    this.modeHint = document.createElement('div')
    this.modeHint.className = 'controlpanel__hint'
    this.modeHint.hidden = true
  }

  private makeButton(label: string, className: string, handler: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.textContent = label
    button.addEventListener('click', handler)
    return button
  }

  update(state: ToolbarState): void {
    const canUseMachine = state.canExecute
    this.compileButton.disabled = state.busy
    this.runButton.disabled = state.busy || (!state.compiled && !canUseMachine ? false : false)
    this.runButton.disabled = state.busy || !canUseMachine
    this.animateButton.disabled = state.busy || !state.compiled || !canUseMachine
    this.stepButton.disabled = state.busy || !state.compiled || !canUseMachine
    this.resetButton.disabled = state.busy
    this.modeSelect.value = state.mode

    this.runButton.textContent = state.running ? 'Пауза' : 'Запустить'
    this.animateButton.textContent = state.animating ? 'Остановить анимацию' : 'Пошагово (анимация)'
    this.animateButton.classList.toggle('is-active', state.animating)

    this.modeHint.hidden = state.mode !== 'x16'
    this.modeHint.textContent =
      '16-битный режим: NASM собирает .bin и проверяются ограничения, ' +
      'но исполнение недоступно — движок работает только в long mode.'
  }

  setStatus(text: string, variant: 'idle' | 'ok' | 'busy' | 'error' = 'idle'): void {
    this.statusLabel.textContent = text
    this.statusLabel.dataset.variant = variant
  }

  setMode(mode: ArchMode): void {
    this.modeSelect.value = mode
  }

  setRunning(running: boolean): void {
    this.runButton.textContent = running ? 'Пауза' : 'Запустить'
    this.controls.classList.toggle('is-running', running)
  }
}
