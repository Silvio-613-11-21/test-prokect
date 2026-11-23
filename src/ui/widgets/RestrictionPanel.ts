/**
 * Блок ограничений текущей ссылки.
 *
 * Текст задания намеренно не показывается: студент получает его отдельно,
 * а здесь только то, что проверяет эмулятор — разрешённые команды,
 * регистры, память и найденные нарушения.
 */

import type { LabTask } from '../../core/restrictions'
import type { RestrictionViolation } from '../../types'

export class RestrictionPanel {
  readonly root: HTMLElement
  private title: HTMLElement
  private commands: HTMLElement
  private registers: HTMLElement
  private extra: HTMLElement
  private violationsBlock: HTMLElement

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'restrictions'

    this.title = document.createElement('div')
    this.title.className = 'restrictions__title'

    this.commands = document.createElement('div')
    this.commands.className = 'restrictions__chips'

    this.registers = document.createElement('div')
    this.registers.className = 'restrictions__chips'

    this.extra = document.createElement('div')
    this.extra.className = 'restrictions__chips'

    this.violationsBlock = document.createElement('div')
    this.violationsBlock.className = 'restrictions__violations'

    this.root.append(this.title, this.commands, this.registers, this.extra, this.violationsBlock)
  }

  /** Обновляет блок под активное задание */
  render(task: LabTask | undefined): void {
    this.violationsBlock.replaceChildren()

    if (!task) {
      this.root.classList.add('is-empty')
      this.title.innerHTML =
        '<span class="restrictions__label">Ограничения</span>' +
        '<span class="restrictions__value">не установлены</span>'
      this.commands.replaceChildren()
      this.registers.replaceChildren()
      this.extra.replaceChildren()
      return
    }

    this.root.classList.remove('is-empty')
    this.title.innerHTML =
      '<span class="restrictions__label">Ограничения</span>' +
      '<span class="restrictions__value">активны</span>'

    this.commands.replaceChildren(...this.makeChips('Команды', task.cmd.map(c => c.toUpperCase())))
    this.registers.replaceChildren(...this.makeChips('Регистры', task.rl.map(r => r.toUpperCase())))

    const extras: string[] = []
    if (task.memory) extras.push('память разрешена')
    for (const register of task.forbiddenRegs ?? []) extras.push(`запрещён ${register.toUpperCase()}`)
    this.extra.replaceChildren(...this.makeChips('', extras, 'chip--danger'))
    this.extra.hidden = extras.length === 0
  }

  private makeChips(label: string, items: string[], extraClass?: string): HTMLElement[] {
    const nodes: HTMLElement[] = []
    if (label) {
      const caption = document.createElement('span')
      caption.className = 'restrictions__label'
      caption.textContent = label
      nodes.push(caption)
    }
    for (const item of items) {
      const chip = document.createElement('span')
      chip.className = 'chip' + (extraClass ? ` ${extraClass}` : '')
      chip.textContent = item
      nodes.push(chip)
    }
    return nodes
  }

  /** Отображает результаты проверки перед компиляцией */
  showViolations(violations: RestrictionViolation[]): void {
    this.violationsBlock.replaceChildren()
    if (violations.length === 0) return

    const header = document.createElement('div')
    header.className = 'violations__header'
    header.textContent = `Нарушения: ${violations.length}`
    this.violationsBlock.appendChild(header)

    for (const violation of violations.slice(0, 8)) {
      const item = document.createElement('div')
      item.className = 'violation'
      item.innerHTML =
        `<span class="violation__line">стр. ${violation.line}</span>` +
        `<span class="violation__title">${escapeHtml(violation.title)}</span>`
      item.title = violation.message
      this.violationsBlock.appendChild(item)
    }
  }

  /** Очистить список нарушений (после успешной сборки) */
  clearViolations(): void {
    this.violationsBlock.replaceChildren()
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
