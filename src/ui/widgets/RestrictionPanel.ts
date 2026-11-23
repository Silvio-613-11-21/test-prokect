/**
 * Панель ограничений лабораторной.
 *
 * Показывает текст задания, разрешённые команды и регистры,
 * а также список нарушений после проверки перед компиляцией.
 */

import type { LabTask } from '../../core/restrictions'
import type { RestrictionViolation } from '../../types'

export class RestrictionPanel {
  readonly root: HTMLElement
  private title: HTMLElement
  private task: HTMLElement
  private commands: HTMLElement
  private registers: HTMLElement
  private status: HTMLElement
  private violationsBlock: HTMLElement

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'panel panel--restrictions'

    const header = document.createElement('header')
    header.className = 'panel__header'
    header.innerHTML = '<h2>Ограничения</h2>'

    this.status = document.createElement('span')
    this.status.className = 'panel__badge'
    this.status.textContent = 'нет ограничений'
    header.appendChild(this.status)

    this.title = document.createElement('h3')
    this.title.className = 'restrictions__title'

    this.task = document.createElement('p')
    this.task.className = 'restrictions__task'

    const commandsRow = document.createElement('div')
    commandsRow.className = 'restrictions__row'
    const commandsLabel = document.createElement('span')
    commandsLabel.className = 'restrictions__label'
    commandsLabel.textContent = 'Команды'
    this.commands = document.createElement('div')
    this.commands.className = 'restrictions__chips'
    commandsRow.append(commandsLabel, this.commands)

    const registersRow = document.createElement('div')
    registersRow.className = 'restrictions__row'
    const registersLabel = document.createElement('span')
    registersLabel.className = 'restrictions__label'
    registersLabel.textContent = 'Регистры'
    this.registers = document.createElement('div')
    this.registers.className = 'restrictions__chips'
    registersRow.append(registersLabel, this.registers)

    this.violationsBlock = document.createElement('div')
    this.violationsBlock.className = 'restrictions__violations'

    this.root.append(header, this.title, this.task, commandsRow, registersRow, this.violationsBlock)
  }

  /** Обновляет панель под активное задание */
  render(task: LabTask | undefined, labTitle: string | undefined): void {
    this.violationsBlock.replaceChildren()

    if (!task) {
      this.root.classList.add('is-empty')
      this.title.textContent = 'Ограничения не заданы'
      this.task.textContent =
        'Доступны все команды и регистры. Ограничения включаются параметрами ссылки: ' +
        '?lab=1&z=1 или выбором лабораторной в панели управления.'
      this.commands.replaceChildren()
      this.registers.replaceChildren()
      this.status.textContent = 'свободный режим'
      this.status.classList.remove('is-error', 'is-ok')
      return
    }

    this.root.classList.remove('is-empty')
    this.title.textContent = `${labTitle ?? `Л/Р ${task.lab}`}${task.z >= 0 ? ` — задача ${task.lab}.${task.z}` : ''}`
    this.task.textContent = task.task || 'Все задачи лабораторной.'

    this.commands.replaceChildren(...this.makeChips(task.cmd.map(c => c.toUpperCase())))
    this.registers.replaceChildren(...this.makeChips(task.rl.map(r => r.toUpperCase())))

    if (task.forbiddenRegs?.length) {
      const forbidden = document.createElement('div')
      forbidden.className = 'restrictions__row'
      const label = document.createElement('span')
      label.className = 'restrictions__label'
      label.textContent = 'Запрещены'
      const chips = document.createElement('div')
      chips.className = 'restrictions__chips'
      chips.append(...this.makeChips(task.forbiddenRegs.map(r => r.toUpperCase()), 'chip--danger'))
      forbidden.append(label, chips)
      this.violationsBlock.appendChild(forbidden)
    }

    this.status.textContent = task.memory ? 'память разрешена' : 'только регистры'
    this.status.classList.remove('is-error')
    this.status.classList.add('is-ok')
  }

  private makeChips(items: string[], extraClass?: string): HTMLElement[] {
    return items.map(item => {
      const chip = document.createElement('span')
      chip.className = 'chip chip--static' + (extraClass ? ` ${extraClass}` : '')
      chip.textContent = item
      return chip
    })
  }

  /** Отображает результаты проверки перед компиляцией */
  showViolations(violations: RestrictionViolation[]): void {
    this.violationsBlock.querySelectorAll('.violation').forEach(node => node.remove())

    if (violations.length === 0) {
      this.status.textContent = 'проверка пройдена'
      this.status.classList.remove('is-error')
      this.status.classList.add('is-ok')
      return
    }

    this.status.textContent = `нарушений: ${violations.length}`
    this.status.classList.add('is-error')
    this.status.classList.remove('is-ok')

    for (const violation of violations.slice(0, 12)) {
      const item = document.createElement('div')
      item.className = 'violation'

      const line = document.createElement('span')
      line.className = 'violation__line'
      line.textContent = `стр. ${violation.line}`

      const body = document.createElement('div')
      body.className = 'violation__body'

      const title = document.createElement('strong')
      title.textContent = violation.title

      const message = document.createElement('p')
      message.textContent = violation.message

      body.append(title, message)
      item.append(line, body)
      this.violationsBlock.appendChild(item)
    }

    if (violations.length > 12) {
      const more = document.createElement('div')
      more.className = 'violation violation--more'
      more.textContent = `…и ещё ${violations.length - 12} нарушений. Исправьте первые, чтобы увидеть остальные.`
      this.violationsBlock.appendChild(more)
    }
  }
}
