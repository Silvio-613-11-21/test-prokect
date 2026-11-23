/**
 * Терминал программы: stdout/stderr эмулятора + ввод для fake-tty.
 */

export class TerminalPanel {
  readonly root: HTMLElement
  private output: HTMLElement
  private input: HTMLInputElement
  private onSubmit?: (line: string) => void
  private buffer = ''

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'panel panel--terminal'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Терминал</h2>'

    const controls = document.createElement('div')
    controls.className = 'panel__controls'

    const clear = document.createElement('button')
    clear.type = 'button'
    clear.className = 'chip'
    clear.textContent = 'Очистить'
    clear.addEventListener('click', () => this.clear())
    controls.appendChild(clear)
    header.appendChild(controls)

    this.output = document.createElement('div')
    this.output.className = 'terminal__output'
    this.output.setAttribute('aria-live', 'polite')

    this.input = document.createElement('input')
    this.input.className = 'terminal__input'
    this.input.type = 'text'
    this.input.placeholder = 'ввод для программы (Enter — отправить)'
    this.input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      const line = this.input.value
      this.input.value = ''
      this.append(line + '\n')
      this.onSubmit?.(line)
    })

    this.root.append(header, this.output, this.input)
  }

  setInputHandler(handler: (line: string) => void): void {
    this.onSubmit = handler
  }

  append(text: string): void {
    this.buffer += text
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
