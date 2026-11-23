/**
 * Перетаскиваемый разделитель между областями (редактор ↔ док отладчика).
 * Значение сохраняется в localStorage, чтобы рабочая область не сбрасывалась.
 */

export class Splitter {
  readonly root: HTMLElement
  private storageKey: string
  private onChange: (ratio: number) => void
  private container: HTMLElement | null = null
  private dragging = false

  constructor(options: { storageKey?: string; onChange: (ratio: number) => void }) {
    this.storageKey = options.storageKey ?? 'asm-lab:split'
    this.onChange = options.onChange

    this.root = document.createElement('div')
    this.root.className = 'splitter'
    this.root.setAttribute('role', 'separator')
    this.root.setAttribute('aria-orientation', 'vertical')
    this.root.tabIndex = 0

    this.root.addEventListener('pointerdown', event => this.startDrag(event))
    this.root.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const current = this.readSaved()
      const delta = event.key === 'ArrowLeft' ? -0.04 : 0.04
      const next = Math.min(0.85, Math.max(0.15, current + delta))
      this.apply(next)
    })
  }

  /** Контейнер, ширина которого делится */
  attach(container: HTMLElement): void {
    this.container = container
    const saved = this.readSaved()
    this.apply(saved)
  }

  private readSaved(): number {
    const raw = localStorage.getItem(this.storageKey)
    const value = raw ? Number.parseFloat(raw) : 0.5
    return Number.isFinite(value) ? Math.min(0.85, Math.max(0.15, value)) : 0.5
  }

  private apply(ratio: number): void {
    localStorage.setItem(this.storageKey, String(ratio))
    this.onChange(ratio)
  }

  private startDrag(event: PointerEvent): void {
    if (!this.container) return
    event.preventDefault()
    this.dragging = true
    this.root.classList.add('is-dragging')
    this.root.setPointerCapture(event.pointerId)

    const move = (moveEvent: PointerEvent) => {
      if (!this.dragging || !this.container) return
      const rect = this.container.getBoundingClientRect()
      const ratio = (moveEvent.clientX - rect.left) / rect.width
      const clamped = Math.min(0.85, Math.max(0.15, ratio))
      this.apply(clamped)
    }

    const up = () => {
      this.dragging = false
      this.root.classList.remove('is-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
}
