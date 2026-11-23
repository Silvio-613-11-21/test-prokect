/**
 * Панель управления: режим, лабораторная, кнопки сборки и отладки.
 */

import type { ArchMode } from '../../core/asm/modes'

export interface ToolbarHandlers {
  onCompile: () => void
  onRun: () => void
  onStep: () => void
  onReset: () => void
  onStop: () => void
  onModeChange: (mode: ArchMode) => void
  onLabChange: (lab: number, z: number) => void
  onExampleChange: (id: string) => void
  onThemeToggle: () => void
  onShare: () => void
  onDownload: () => void
}

export interface ToolbarState {
  busy: boolean
  compiled: boolean
  running: boolean
  canExecute: boolean
  mode: ArchMode
  lab: number | undefined
  task: number | undefined
  exampleId: string
  theme: 'dark' | 'light'
}

const LAB_TITLES: Record<number, string> = {
  0: 'Без ограничений',
  1: 'Л/Р 1. Команды и регистры',
  2: 'Л/Р 2. Макросы и подпрограммы',
  3: 'Л/Р 3. Работа с памятью',
  4: 'Л/Р 4. Переменные и константы',
  5: 'Л/Р 5. Прерывания',
}

export class Toolbar {
  readonly root: HTMLElement
  private compileButton: HTMLButtonElement
  private runButton: HTMLButtonElement
  private stepButton: HTMLButtonElement
  private resetButton: HTMLButtonElement
  private modeSelect: HTMLSelectElement
  private labSelect: HTMLSelectElement
  private taskSelect: HTMLSelectElement
  private exampleSelect: HTMLSelectElement
  private themeButton: HTMLButtonElement
  private statusLabel: HTMLElement
  private modeHint: HTMLElement

  constructor(handlers: ToolbarHandlers, examples: Array<{ id: string; title: string }>) {
    this.root = document.createElement('header')
    this.root.className = 'toolbar'

    // Логотип и название
    const brand = document.createElement('div')
    brand.className = 'toolbar__brand'
    const logo = document.createElement('img')
    logo.src = './logo.svg'
    logo.alt = ''
    logo.width = 28
    logo.height = 28
    const brandTitle = document.createElement('div')
    brandTitle.className = 'toolbar__brand-text'
    brandTitle.innerHTML = '<strong>ASM Lab</strong><span>эмулятор ассемблера</span>'
    brand.append(logo, brandTitle)

    // Группа: режим
    const modeGroup = document.createElement('label')
    modeGroup.className = 'field'
    const modeLabel = document.createElement('span')
    modeLabel.className = 'field__label'
    modeLabel.textContent = 'Режим'
    this.modeSelect = document.createElement('select')
    this.modeSelect.className = 'field__control'
    this.modeSelect.innerHTML = `
      <option value="x64">x86-64 (исполнение)</option>
      <option value="x16">16 бит (компиляция)</option>
    `
    this.modeSelect.addEventListener('change', () => {
      handlers.onModeChange(this.modeSelect.value as ArchMode)
    })
    modeGroup.append(modeLabel, this.modeSelect)

    // Группа: лабораторная
    const labGroup = document.createElement('label')
    labGroup.className = 'field'
    const labLabel = document.createElement('span')
    labLabel.className = 'field__label'
    labLabel.textContent = 'Лабораторная'
    this.labSelect = document.createElement('select')
    this.labSelect.className = 'field__control'
    for (const [value, title] of Object.entries(LAB_TITLES)) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = title
      this.labSelect.appendChild(option)
    }
    this.labSelect.addEventListener('change', () => {
      const lab = Number(this.labSelect.value)
      this.syncTaskOptions(lab)
      handlers.onLabChange(lab, Number(this.taskSelect.value))
    })
    labGroup.append(labLabel, this.labSelect)

    const taskGroup = document.createElement('label')
    taskGroup.className = 'field'
    const taskLabel = document.createElement('span')
    taskLabel.className = 'field__label'
    taskLabel.textContent = 'Задача'
    this.taskSelect = document.createElement('select')
    this.taskSelect.className = 'field__control'
    this.taskSelect.addEventListener('change', () => {
      handlers.onLabChange(Number(this.labSelect.value), Number(this.taskSelect.value))
    })
    taskGroup.append(taskLabel, this.taskSelect)
    this.syncTaskOptions(0)

    // Группа: пример
    const exampleGroup = document.createElement('label')
    exampleGroup.className = 'field'
    const exampleLabel = document.createElement('span')
    exampleLabel.className = 'field__label'
    exampleLabel.textContent = 'Пример'
    this.exampleSelect = document.createElement('select')
    this.exampleSelect.className = 'field__control'
    for (const example of examples) {
      const option = document.createElement('option')
      option.value = example.id
      option.textContent = example.title
      this.exampleSelect.appendChild(option)
    }
    this.exampleSelect.addEventListener('change', () => handlers.onExampleChange(this.exampleSelect.value))
    exampleGroup.append(exampleLabel, this.exampleSelect)

    // Кнопки действий
    const actions = document.createElement('div')
    actions.className = 'toolbar__actions'

    this.compileButton = this.makeButton('Скомпилировать', 'button button--primary', handlers.onCompile)
    this.runButton = this.makeButton('Запустить', 'button button--accent', handlers.onRun)
    this.stepButton = this.makeButton('Шаг', 'button', handlers.onStep)
    this.resetButton = this.makeButton('Сброс', 'button', handlers.onReset)
    const stopButton = this.makeButton('Стоп', 'button button--ghost', handlers.onStop)
    stopButton.title = 'Остановить выполнение (когда программа в цикле)'

    actions.append(this.compileButton, this.runButton, this.stepButton, this.resetButton, stopButton)

    // Правые иконки
    const right = document.createElement('div')
    right.className = 'toolbar__right'

    this.statusLabel = document.createElement('span')
    this.statusLabel.className = 'toolbar__status'
    this.statusLabel.textContent = 'загрузка wasm…'

    const shareButton = this.makeButton('Ссылка', 'button button--ghost', handlers.onShare)
    shareButton.title = 'Скопировать ссылку с кодом и ограничениями'

    const downloadButton = this.makeButton('Скачать', 'button button--ghost', handlers.onDownload)
    downloadButton.title = 'Скачать исходник (.asm)'

    this.themeButton = this.makeButton('Тема', 'button button--icon', handlers.onThemeToggle)
    this.themeButton.title = 'Переключить тему: DOS (тёмная) / документация (светлая)'

    right.append(this.statusLabel, shareButton, downloadButton, this.themeButton)

    this.modeHint = document.createElement('div')
    this.modeHint.className = 'toolbar__hint'
    this.modeHint.hidden = true

    this.root.append(brand, modeGroup, labGroup, taskGroup, exampleGroup, actions, right, this.modeHint)
  }

  private makeButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  private syncTaskOptions(lab: number): void {
    this.taskSelect.replaceChildren()
    const all = document.createElement('option')
    all.value = '-1'
    all.textContent = 'все задачи'
    this.taskSelect.appendChild(all)

    const max = lab === 0 ? -1 : lab === 1 ? 10 : lab === 2 ? 10 : lab === 3 ? 9 : lab === 4 ? 9 : 8
    if (lab === 0) {
      this.taskSelect.disabled = true
      return
    }
    this.taskSelect.disabled = false
    for (let z = 0; z <= max; z++) {
      const option = document.createElement('option')
      option.value = String(z)
      option.textContent = `${lab}.${z}`
      this.taskSelect.appendChild(option)
    }
  }

  /** Обновление кнопок и статуса */
  update(state: ToolbarState): void {
    this.compileButton.disabled = state.busy
    this.runButton.disabled = state.busy || !state.compiled || !state.canExecute
    this.stepButton.disabled = state.busy || !state.compiled || !state.canExecute || state.running
    this.resetButton.disabled = state.busy

    this.modeSelect.value = state.mode
    this.labSelect.value = String(state.lab ?? 0)
    this.taskSelect.value = String(state.task ?? -1)
    this.syncTaskOptions(state.lab ?? 0)
    this.taskSelect.value = String(state.task ?? -1)
    this.exampleSelect.value = state.exampleId

    this.modeHint.hidden = state.mode !== 'x16'
    if (state.mode === 'x16') {
      this.modeHint.textContent =
        '16-битный режим: NASM собирает .bin, ограничения проверяются, но исполнение недоступно — blink работает только в long mode.'
    }

    this.themeButton.textContent = state.theme === 'dark' ? 'Светлая тема' : 'DOS-тема'
  }

  setStatus(text: string, variant: 'idle' | 'ok' | 'error' | 'busy' = 'idle'): void {
    this.statusLabel.textContent = text
    this.statusLabel.dataset.variant = variant
  }

  setMode(mode: ArchMode): void {
    this.modeSelect.value = mode
  }

  setLab(lab: number | undefined, task: number | undefined): void {
    this.labSelect.value = String(lab ?? 0)
    this.syncTaskOptions(lab ?? 0)
    this.taskSelect.value = String(task ?? -1)
  }

  setExample(id: string): void {
    this.exampleSelect.value = id
  }

  setRunning(running: boolean): void {
    this.runButton.textContent = running ? 'Пауза' : 'Запустить'
    this.root.classList.toggle('is-running', running)
  }
}
