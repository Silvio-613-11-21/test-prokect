/**
 * Консоль программы: stdout/stderr эмулятора и ввод для чтения строк.
 */

export class TerminalPanel {
  readonly root: HTMLElement
  private output: HTMLElement
  private input: HTMLInputElement
  private onSubmit?: (line: string) => void
  private buffer = ''

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'console'

    this.output = document.createElement('div')
    this.output.className = 'console__output'
    this.output.setAttribute('aria-live', 'polite')

    this.input = document.createElement('input')
    this.input.className = 'console__input'
    this.input.type = 'text'
    this.input.placeholder = 'ввод для программы (Enter — отправить)'
    this.input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return
      const line = this.input.value
      this.input.value = ''
      this.append(line + '\n')
      this.onSubmit?.(line)
    })

    this.root.append(this.output, this.input)
  }

  setInputHandler(handler: (line: string) => void): void {
    this.onSubmit = handler
  }

  append(text: string): void {
    this.buffer += text
    // Ограничиваем историю, чтобы панель не тормозила на больших циклах
    if (this.buffer.length > 40000) this.buffer = this.buffer.slice(-30000)
    this.output.textContent = this.buffer
    this.output.scrollTop = this.output.scrollHeight
  }

  clear(): void {
    this.buffer = ''
    this.output.textContent = ''
  }

  focusInput(): void {
    this.input.focus()
  }
}
