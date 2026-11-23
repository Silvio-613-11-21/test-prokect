/**
 * Редактор кода: textarea с прозрачным текстом поверх слоя подсветки.
 *
 * Такой подход (как в CodeJar/Prism) даёт честную подсветку синтаксиса NASM
 * без тяжёлых зависимостей: редактирование остаётся нативным, а слой `pre`
 * просто повторяет текст с цветными токенами.
 */

import { highlightLine } from './highlight'
import './editor.css'

export interface EditorOptions {
  /** Начальный текст */
  value?: string
  /** Колбэк изменения текста */
  onChange?: (value: string) => void
  /** Колбэк перемещения курсора (1-based) */
  onCursorChange?: (line: number, column: number) => void
  /** Функция подсветки разрешённых регистров */
  registerClass?: (register: string) => string | null
  /** Функция проверки «регистр запрещён ограничениями» */
  isRegisterForbidden?: (register: string) => boolean
  /** Подсветка строк с ошибками компиляции */
  onRenderGutter?: (line: number) => GutterMark | null
}

export interface GutterMark {
  type: 'error' | 'warning'
  message: string
}

const TAB_SIZE = 4

export class CodeEditor {
  readonly root: HTMLElement
  private textarea: HTMLTextAreaElement
  private highlight: HTMLPreElement
  private gutter: HTMLElement
  private options: EditorOptions
  private lineCount = 1
  private errorLines = new Map<number, string>()

  constructor(options: EditorOptions = {}) {
    this.options = options
    this.root = document.createElement('div')
    this.root.className = 'code-editor'

    this.gutter = document.createElement('div')
    this.gutter.className = 'code-editor__gutter'

    const scrollContainer = document.createElement('div')
    scrollContainer.className = 'code-editor__code'

    const highlightPre = document.createElement('pre')
    highlightPre.className = 'code-editor__highlight'
    highlightPre.setAttribute('aria-hidden', 'true')

    const highlightCode = document.createElement('code')
    highlightPre.appendChild(highlightCode)

    this.highlight = highlightPre

    const textarea = document.createElement('textarea')
    textarea.className = 'code-editor__input'
    textarea.spellcheck = false
    textarea.autocapitalize = 'off'
    textarea.autocomplete = 'off'
    textarea.setAttribute('wrap', 'off')
    textarea.value = options.value ?? ''

    this.textarea = textarea

    scrollContainer.append(highlightPre, textarea)
    this.root.append(this.gutter, scrollContainer)

    this.bindEvents()
    this.setText(options.value ?? '')
  }

  private bindEvents(): void {
    this.textarea.addEventListener('input', () => {
      this.scheduleUpdate()
      this.options.onChange?.(this.textarea.value)
    })

    this.textarea.addEventListener('scroll', () => {
      this.highlight.scrollTop = this.textarea.scrollTop
      this.highlight.scrollLeft = this.textarea.scrollLeft
      this.gutter.style.transform = `translateY(${-this.textarea.scrollTop}px)`
    })

    this.textarea.addEventListener('keydown', (event) => this.handleKeydown(event))

    this.textarea.addEventListener('click', () => this.reportCursor())
    this.textarea.addEventListener('keyup', () => this.reportCursor())
    this.textarea.addEventListener('select', () => this.reportCursor())
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      event.preventDefault()
      this.insertText(' '.repeat(TAB_SIZE))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      this.handleEnter()
      return
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      this.duplicateLine()
    }
  }

  /** Enter с сохранением отступа текущей строки */
  private handleEnter(): void {
    const { selectionStart, value } = this.textarea
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const currentLine = value.slice(lineStart, selectionStart)
    const indent = /^\s*/.exec(currentLine)?.[0] ?? ''
    const trimmed = currentLine.trim()
    // после метки/директивы макроса — отдельный отступ
    const extra = trimmed.endsWith(':') || /^%macro/i.test(trimmed) ? ' '.repeat(TAB_SIZE) : ''
    this.insertText('\n' + indent + extra)
  }

  private duplicateLine(): void {
    const { selectionStart, selectionEnd, value } = this.textarea
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    let lineEnd = value.indexOf('\n', selectionEnd)
    if (lineEnd === -1) lineEnd = value.length
    const line = value.slice(lineStart, lineEnd)
    this.insertText('\n' + line)
  }

  private insertText(text: string): void {
    const { selectionStart, selectionEnd, value } = this.textarea
    this.textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd)
    const position = selectionStart + text.length
    this.textarea.selectionStart = this.textarea.selectionEnd = position
    this.scheduleUpdate()
    this.options.onChange?.(this.textarea.value)
  }

  private reportCursor(): void {
    const { selectionStart, value } = this.textarea
    const before = value.slice(0, selectionStart)
    const line = before.split('\n').length
    const column = selectionStart - (before.lastIndexOf('\n') + 1) + 1
    this.options.onCursorChange?.(line, column)
  }

  private scheduled = false

  private scheduleUpdate(): void {
    if (this.scheduled) return
    this.scheduled = true
    requestAnimationFrame(() => {
      this.scheduled = false
      this.render()
    })
  }

  /** Подсветка с учётом ограничений */
  private registerClass = (register: string): string | null => {
    return this.options.registerClass?.(register) ?? null
  }

  private isRegisterForbidden = (register: string): boolean => {
    return this.options.isRegisterForbidden?.(register) ?? false
  }

  private render(): void {
    const value = this.textarea.value
    const lines = value.split('\n')
    const highlighted = lines
      .map((line) => highlightLine(line, this.registerClass, this.isRegisterForbidden) + '\n')
      .join('')
    this.highlight.innerHTML = highlighted + '\n'

    this.renderGutter(lines.length)
    this.syncScroll()
  }

  private renderGutter(lineCount: number): void {
    if (lineCount === this.lineCount && this.gutter.childElementCount === lineCount) {
      // обновляем только пометки об ошибках
      this.updateGutterMarks()
      return
    }
    this.lineCount = lineCount
    this.gutter.replaceChildren()
    for (let line = 1; line <= lineCount; line++) {
      const cell = document.createElement('div')
      cell.className = 'code-editor__line-number'
      cell.dataset.line = String(line)
      cell.textContent = String(line)
      this.gutter.appendChild(cell)
    }
    this.updateGutterMarks()
  }

  private updateGutterMarks(): void {
    for (const cell of Array.from(this.gutter.children) as HTMLElement[]) {
      const line = Number(cell.dataset.line)
      const message = this.errorLines.get(line)
      cell.classList.toggle('has-error', Boolean(message))
      if (message) {
        cell.title = message
      } else {
        cell.removeAttribute('title')
      }
    }
  }

  private syncScroll(): void {
    this.highlight.scrollTop = this.textarea.scrollTop
    this.highlight.scrollLeft = this.textarea.scrollLeft
    this.gutter.style.transform = `translateY(${-this.textarea.scrollTop}px)`
  }

  /** Устанавливает текст программно (примеры, загрузка из ссылки) */
  setText(value: string): void {
    this.textarea.value = value
    this.lineCount = 0
    this.render()
    this.reportCursor()
  }

  getText(): string {
    return this.textarea.value
  }

  /** Пометки строк с ошибками компиляции/ограничений */
  setErrors(lines: Map<number, string>): void {
    this.errorLines = lines
    this.updateGutterMarks()
  }

  /** Подсветка регистров (при смене лабораторной) */
  setRegisterHighlighting(
    registerClass: ((register: string) => string | null) | undefined,
    isRegisterForbidden: ((register: string) => boolean) | undefined,
  ): void {
    this.options.registerClass = registerClass
    this.options.isRegisterForbidden = isRegisterForbidden
    this.render()
  }

  focus(): void {
    this.textarea.focus()
  }

  /** Прокрутить редактор к строке */
  revealLine(line: number): void {
    const lines = this.textarea.value.split('\n')
    const index = Math.min(Math.max(line, 1), lines.length) - 1
    const offset = lines.slice(0, index).reduce((sum, item) => sum + item.length + 1, 0)
    const lineHeight = this.textarea.scrollHeight / Math.max(lines.length, 1)
    this.textarea.focus()
    this.textarea.setSelectionRange(offset, offset + (lines[index]?.length ?? 0))
    this.textarea.scrollTop = Math.max(0, index * lineHeight - this.textarea.clientHeight / 2)
    this.syncScroll()
  }
}
