/**
 * Отладочная область в духе DOSBox Insight / diplom_.
 *
 * Дизассемблер слева, регистры и флаги справа сверху, память и стек
 * ниже, терминал — внизу. Всё видно одновременно, без вкладок:
 * так же, как в Insight и в diplom_.
 */

import type { ArchMode } from '../../core/asm/modes'

export class DebuggerView {
  readonly root: HTMLElement
  readonly codeSlot: HTMLElement
  readonly registersSlot: HTMLElement
  readonly flagsSlot: HTMLElement
  readonly memorySlot: HTMLElement
  readonly stackSlot: HTMLElement
  readonly consoleSlot: HTMLElement
  private consoleTitle: HTMLElement

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'debugger'

    const frame = document.createElement('div')
    frame.className = 'debugger__frame'

    this.codeSlot = document.createElement('div')
    this.codeSlot.className = 'debugger__area debugger__area--code'

    this.registersSlot = document.createElement('div')
    this.registersSlot.className = 'debugger__area debugger__area--registers'

    this.flagsSlot = document.createElement('div')
    this.flagsSlot.className = 'debugger__area debugger__area--flags'

    this.memorySlot = document.createElement('div')
    this.memorySlot.className = 'debugger__area debugger__area--memory'

    this.stackSlot = document.createElement('div')
    this.stackSlot.className = 'debugger__area debugger__area--stack'

    const consoleBlock = document.createElement('section')
    consoleBlock.className = 'panel panel--console'
    const consoleHeader = document.createElement('header')
    consoleHeader.className = 'panel__header panel__header--console'
    this.consoleTitle = document.createElement('h2')
    this.consoleTitle.textContent = 'Console'
    consoleHeader.append(this.consoleTitle)

    this.consoleSlot = document.createElement('div')
    this.consoleSlot.className = 'console__body'

    consoleBlock.append(consoleHeader, this.consoleSlot)

    frame.append(
      this.codeSlot,
      this.registersSlot,
      this.flagsSlot,
      this.stackSlot,
      this.memorySlot,
      consoleBlock,
    )

    this.root.append(frame)
  }

  setArchMode(mode: ArchMode): void {
    // В 16-битном режиме реального дампа памяти нет — прячем пустую панель
    this.memorySlot.hidden = mode !== 'x64'
    this.root.classList.toggle('is-x16', mode === 'x16')
  }

  /** Надпись-статус в заголовке консоли */
  setConsoleStatus(text: string): void {
    this.consoleTitle.textContent = text ? `Console — ${text}` : 'Console'
  }
}
