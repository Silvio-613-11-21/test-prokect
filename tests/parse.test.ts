import { describe, expect, it } from 'vitest'
import { parseSource, splitOperands, stripComment } from '../src/core/restrictions/parse'
import { checkRestrictions, getLabTask } from '../src/core/restrictions'

describe('парсер строк', () => {
  it('убирает комментарии, но не трогает строки', () => {
    expect(stripComment('mov ax, 5 ; комментарий')).toBe('mov ax, 5')
    expect(stripComment('db "a;b"')).toBe('db "a;b"')
  })

  it('разбивает операнды по запятым вне скобок', () => {
    expect(splitOperands('byte [bx + si], 5')).toEqual(['byte [bx + si]', '5'])
    expect(splitOperands('[rbx + rsi], rax')).toEqual(['[rbx + rsi]', 'rax'])
  })

  it('понимает метки (в том числе несколько)', () => {
    const [line] = parseSource('start: loop: mov ax, 1')
    expect(line.labels).toEqual(['start', 'loop'])
    expect(line.mnemonic).toBe('mov')
  })

  it('понимает объявления данных', () => {
    const lines = parseSource('msg db "Hello", 0\ncount dw 10\nlen equ 5')
    expect(lines[0].directive).toBe('db')
    expect(lines[0].dataSymbol).toBe('msg')
    expect(lines[1].directive).toBe('dw')
    expect(lines[2].directive).toBe('equ')
  })

  it('понимает директиву section', () => {
    const [line] = parseSource('section .data')
    expect(line.directive).toBe('section')
    expect(line.operands[0]).toBe('.data')
  })

  it('понимает %macro', () => {
    const [line] = parseSource('%macro print 1')
    expect(line.directive).toBe('%macro')
    expect(line.dataSymbol).toBe('print')
  })
})

describe('ограничения Л/Р 3.0 (запрещены BX и SI)', () => {
  const task = getLabTask(3, 0)!

  it('запрещает BX', () => {
    const report = checkRestrictions('mov bx, 1\n', task, 'x64')
    expect(report.ok).toBe(false)
    expect(report.violations[0].title).toContain('BX')
  })

  it('запрещает SI', () => {
    const report = checkRestrictions('mov si, 1\n', task, 'x64')
    expect(report.ok).toBe(false)
    expect(report.violations[0].title).toContain('SI')
  })

  it('разрешает AX и память', () => {
    const report = checkRestrictions('mov ax, [si]\n', task, 'x64')
    // в 3.0 запрещён SI, поэтому здесь одна ошибка — но не про память
    expect(report.violations.some(v => v.title.includes('SI'))).toBe(true)
  })
})

describe('ограничения Л/Р 3', () => {
  it('запрещают память в Л/Р 1', () => {
    const task = getLabTask(1, 5)!
    const report = checkRestrictions('mov ax, [bx]\n', task, 'x64')
    expect(report.violations.some(v => v.title.includes('памятью'))).toBe(true)
  })

  it('разрешают память в Л/Р 3', () => {
    const task = getLabTask(3, -1)!
    const report = checkRestrictions('mov ax, [bx]\n', task, 'x64')
    expect(report.violations).toEqual([])
  })

  it('запрещают описание данных до Л/Р 3', () => {
    const task = getLabTask(1, 1)!
    const report = checkRestrictions('msg db "hi"\n', task, 'x64')
    expect(report.violations.some(v => v.title.includes('данных'))).toBe(true)
  })

  it('разрешают буфер данных в Л/Р 3 (память)', () => {
    const task = getLabTask(3, -1)!
    const report = checkRestrictions('section .data\nmsg db "hi"\n', task, 'x64')
    expect(report.violations).toEqual([])
  })

  it('Л/Р 4 требует переменную', () => {
    const task = getLabTask(4, 2)!
    const report = checkRestrictions('mov al, 1\n', task, 'x64')
    expect(report.violations.some(v => v.title.includes('переменных'))).toBe(true)
  })

  it('Л/Р 4.3 запрещает целые регистры', () => {
    const task = getLabTask(4, 3)!
    const report = checkRestrictions('section .data\nx db 1\nsection .text\nmov ax, 1\n', task, 'x64')
    expect(report.violations.some(v => v.title.includes('AX'))).toBe(true)
  })

  it('L/Р 5.9 запрещает конкретные полурегистры', () => {
    const task = getLabTask(5, 9)!
    const report = checkRestrictions('mov al, 1\n', task, 'x64')
    expect(report.violations.some(v => v.title.includes('AL'))).toBe(true)
  })
})

describe('ограничения Л/Р 2', () => {
  it('требует подпрограмму', () => {
    const task = getLabTask(2, 1)!
    const report = checkRestrictions('mov ax, 1\nmov bx, 2\n', task, 'x64')
    expect(report.violations.some(v => v.title.includes('подпрограммы'))).toBe(true)
  })

  it('принимает call/ret', () => {
    const task = getLabTask(2, 1)!
    const report = checkRestrictions('call sub1\nsub1:\n  ret\n', task, 'x64')
    expect(report.ok).toBe(true)
  })
})
