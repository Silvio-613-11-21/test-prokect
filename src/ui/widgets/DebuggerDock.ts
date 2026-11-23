/**
 * Нижний док отладчика с вкладками: Дизассемблер / Регистры / Флаги / Стек / Память / Терминал.
 *
 * Это «рабочая область» в стиле панелей Windows: перетаскиваемый разделитель
 * между редактором и доком + вкладки, чтобы на узком экране всё оставалось
 * читаемым.
 */

export interface DockTab {
  id: string
  title: string
  element: HTMLElement
}

export class DebuggerDock {
  readonly root: HTMLElement
  private tabsBar: HTMLElement
  private content: HTMLElement
  private tabs: DockTab[] = []
  private activeId: string | null = null
  private bodies = new Map<string, HTMLElement>()

  constructor() {
    this.root = document.createElement('section')
    this.root.className = 'dock'

    this.tabsBar = document.createElement('div')
    this.tabsBar.className = 'dock__tabs'
    this.tabsBar.setAttribute('role', 'tablist')

    this.content = document.createElement('div')
    this.content.className = 'dock__content'

    this.root.append(this.tabsBar, this.content)
  }

  addTab(tab: DockTab): void {
    this.tabs.push(tab)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dock__tab'
    button.dataset.tab = tab.id
    button.textContent = tab.title
    button.setAttribute('role', 'tab')
    button.addEventListener('click', () => this.activate(tab.id))
    this.tabsBar.appendChild(button)

    const body = document.createElement('div')
    body.className = 'dock__body'
    body.dataset.tab = tab.id
    body.appendChild(tab.element)
    this.bodies.set(tab.id, body)
    this.content.appendChild(body)

    if (!this.activeId) this.activate(tab.id)
    else this.applyVisibility()
  }

  activate(id: string): void {
    if (!this.bodies.has(id)) return
    this.activeId = id
    this.applyVisibility()
    for (const button of Array.from(this.tabsBar.children) as HTMLElement[]) {
      button.classList.toggle('is-active', button.dataset.tab === id)
    }
  }

  get active(): string | null {
    return this.activeId
  }

  /** Счётчик-бейдж на вкладке (например, количество ошибок) */
  setBadge(id: string, text: string | null, variant: 'error' | 'ok' = 'ok'): void {
    const button = this.tabsBar.querySelector<HTMLElement>(`[data-tab="${id}"]`)
    if (!button) return
    button.querySelector('.dock__badge')?.remove()
    if (!text) return
    const badge = document.createElement('span')
    badge.className = `dock__badge dock__badge--${variant}`
    badge.textContent = text
    button.appendChild(badge)
  }

  private applyVisibility(): void {
    for (const [id, body] of this.bodies) {
      body.hidden = id !== this.activeId
    }
  }
}
