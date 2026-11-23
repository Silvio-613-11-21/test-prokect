import { describe, expect, it } from 'vitest'
import { findRegisters, formatHex, lookupRegister, REGISTER_ALIASES } from '../src/core/registers'

describe('таблица регистров', () => {
  it('находит классические регистры и расширения', () => {
    expect(lookupRegister('rax')?.family).toBe('ax')
    expect(lookupRegister('eax')?.family).toBe('ax')
    expect(lookupRegister('ax')?.family).toBe('ax')
    expect(lookupRegister('al')?.family).toBe('ax')
    expect(lookupRegister('ah')?.family).toBe('ax')
    expect(lookupRegister('al')?.width).toBe(8)
    expect(lookupRegister('ah')?.high).toBe(true)
  })

  it('знает R8-R15 в разных размерах', () => {
    expect(lookupRegister('r15')?.class).toBe('extended')
    expect(lookupRegister('r15d')?.width).toBe(32)
    expect(lookupRegister('r15b')?.width).toBe(8)
  })

  it('находит все регистры в строке', () => {
    const found = findRegisters('mov [rbx + rsi], rax')
    expect(found.map(r => r.name)).toEqual(['rbx', 'rsi', 'rax'])
  })

  it('не принимает имена, похожие на регистры', () => {
    expect(findRegisters('register_name')).toEqual([])
    expect(findRegisters('mov ax, 5')).toHaveLength(1)
  })

  it('алиасы семейств полные', () => {
    expect(REGISTER_ALIASES.ax).toEqual(expect.arrayContaining(['rax', 'eax', 'ax', 'ah', 'al']))
    expect(REGISTER_ALIASES.sp).toEqual(expect.arrayContaining(['rsp', 'esp', 'sp']))
  })

  it('форматирует 64-битные значения', () => {
    expect(formatHex(0x1234n)).toBe('0000000000001234')
    expect(formatHex(-1n)).toBe('FFFFFFFFFFFFFFFF')
  })
})
