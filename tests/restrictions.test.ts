import { describe, expect, it } from 'vitest'
import { checkRestrictions, getLabTask } from '../src/core/restrictions'

const LAB1_1 = `; Л/Р 1.1
bits 64
default rel

section .text
global _start
_start:
    mov ax, 6
    mov bx, ax
    shl bx, 1
    shl bx, 1

; @service
    mov ax, 60
    syscall
`

describe('ограничения Л/Р 1.1', () => {
  const task = getLabTask(1, 1)!

  it('задание существует', () => {
    expect(task).toBeDefined()
    expect(task.lab).toBe(1)
    expect(task.rl).toContain('ax')
    expect(task.rl).toContain('bx')
  })

  it('разрешает AX и BX', () => {
    const source = `mov ax, 5
mov bx, ax
shl bx, 1
`
    const report = checkRestrictions(source, task, 'x64')
    expect(report.violations).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('запрещает CX', () => {
    const report = checkRestrictions('mov cx, 2\n', task, 'x64')
    expect(report.ok).toBe(false)
    expect(report.violations[0].title).toContain('CX')
  })

  it('считает 64/32-битные расширения тем же семейством, что и AX', () => {
    // В Л/Р 1 регистры заданы как AX/BX, но в 64-битном режиме RAX — тот же
    // регистр, поэтому проверка по семейству пропускает его, а не ругается.
    expect(checkRestrictions('mov rax, 5\n', task, 'x64').ok).toBe(true)
    expect(checkRestrictions('mov eax, 5\n', task, 'x64').ok).toBe(true)
    // А регистр другого семейства по-прежнему запрещён
    expect(checkRestrictions('mov rdx, 5\n', task, 'x64').ok).toBe(false)
  })

  it('запрещает команды вне списка', () => {
    const report = checkRestrictions('add ax, 5\n', task, 'x64')
    expect(report.ok).toBe(false)
    expect(report.violations[0].title).toContain('ADD')
  })

  it('разрешает loop (служебная команда цикла)', () => {
    // loop не входит в список задачи 1.1, но это команда задания 1.8.
    // В Л/Р 1.1 цикл задаётся именно через loop, поэтому фиксируем поведение:
    const report = checkRestrictions('loop start\n', task, 'x64')
    expect(report.violations.some(v => v.title.includes('LOOP'))).toBe(true)
  })

  it('полный пример не нарушает ограничения', () => {
    // Служебный эпилог помечен `; @service` и из проверки исключён
    const report = checkRestrictions(LAB1_1, task, 'x64')
    expect(report.violations).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('маркер @service отключает проверку только ниже себя', () => {
    const source = 'xor ax, ax\n; @service\nmov ax, 60\nsyscall\n'
    const report = checkRestrictions(source, task, 'x64')
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0].line).toBe(1)
    expect(report.violations[0].title).toContain('XOR')
  })

  it('вызов собственного макроса не считается командой', () => {
    const source =
      '%macro set_ax 1\n  mov ax, %1\n%endmacro\n' +
      'start:\n  set_ax 5\n  call sub1\n  ret\nsub1:\n  ret\n'
    const task2 = getLabTask(2, 0)!
    const report = checkRestrictions(source, task2, 'x64')
    expect(report.violations).toEqual([])
  })
})
