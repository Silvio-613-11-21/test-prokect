/**
 * Проверка кода на соответствие ограничениям лабораторной.
 *
 * Вызывается ДО компиляции (перед отправкой кода в NASM),
 * как и требовалось: отдельная функция, которая срабатывает раньше
 * компилятора и не пропускает нарушающий код в wasm.
 */

import type { RestrictionReport, RestrictionViolation } from '../../types'
import { type LabTask, DATA_DIRECTIVES, SERVICE_DIRECTIVES } from './catalog'
import { parseSource, type ParsedLine } from './parse'
import { lookupRegister, REGISTER_ALIASES } from '../registers'

/** Набор команд, которые не считаются «инструкцией» задачи */
const PSEUDO_INSTRUCTIONS = new Set(['db', 'dw', 'dd', 'dq', 'dt', 'equ', 'times', 'resb', 'resw', 'resd', 'resq'])

/** Регистры, которые являются указателями стека/кадра и проверяются отдельно */
const STACK_POINTER_REGS = new Set(['sp', 'bp'])

/** Название семейства для сообщений */
function familyLabel(family: string): string {
  return family.toUpperCase()
}

/**
 * Проверка кода по заданию лабораторной.
 *
 * @param source исходный текст программы
 * @param lab активное задание (undefined — ограничений нет)
 * @param mode режим, влияющий на подсказки в сообщениях
 */
export function checkRestrictions(
  source: string,
  lab: LabTask | undefined,
  mode: 'x64' | 'x16' = 'x64',
): RestrictionReport {
  if (!lab) return { ok: true, violations: [] }

  const lines = parseSource(source)
  const violations: RestrictionViolation[] = []
  const allowedCommands = new Set(lab.cmd.map(c => c.toLowerCase()))
  const allowedRegisters = new Set(lab.rl.map(r => r.toLowerCase()))
  const forbidden = new Set((lab.forbiddenRegs ?? []).map(r => r.toLowerCase()))

  let hasDataSection = false
  let hasDataDirective = false
  const macroNames = new Set(
    lines.filter(l => l.directive === '%macro' && l.dataSymbol).map(l => l.dataSymbol!.toLowerCase()),
  )

  for (const line of lines) {
    // Служебный блок (`; @service`) — обвязка выхода из программы, не задание.
    // Объявления данных в нём всё равно учитываются: сегмент данных обычно
    // идёт после кода, в том числе после служебного эпилога.
    if (line.service) {
      if (line.directive && DATA_DIRECTIVES.has(line.directive)) hasDataDirective = true
      if (line.directive === 'section' || line.directive === 'segment') {
        if (/\.data|\.bss/.test(line.operands.join(' ').toLowerCase())) hasDataSection = true
      }
      continue
    }
    // Метки и директивы секций сами по себе инструкциями не являются
    if (!line.mnemonic && !line.directive) continue

    // 1. Директивы описания данных (Л/Р 4+)
    if (line.directive && DATA_DIRECTIVES.has(line.directive)) {
      hasDataDirective = true
      if (lab.lab < 3) {
        violations.push({
          line: line.line,
          title: 'Описание данных запрещено',
          message:
            `Директива «${line.directive}» (переменные/константы) появляется только в Л/Р 4. ` +
            `В этой лабораторной память и данные не нужны.`,
        })
      }
      continue
    }

    if (line.directive === 'section' || line.directive === 'segment') {
      const target = line.operands.join(' ').toLowerCase()
      if (/\.data|\.bss/.test(target)) hasDataSection = true
      if (lab.lab < 3 && /\.data|\.bss/.test(target)) {
        violations.push({
          line: line.line,
          title: 'Сегмент данных запрещён',
          message: 'В Л/Р 1–2 переменные и сегмент данных не используются: работа идёт только с регистрами.',
        })
      }
      continue
    }

    if (line.directive && SERVICE_DIRECTIVES.has(line.directive)) continue
    if (line.directive && line.directive.startsWith('%')) {
      // объявление макроса проверяем как команду
      if (line.directive === '%macro') {
        if (!allowedCommands.has('%macro') && lab.lab < 2) {
          violations.push({
            line: line.line,
            title: 'Макросы запрещены',
            message: 'Макросы появляются только в Л/Р 2. В Л/Р 1 программа пишется без макросов.',
          })
        }
      }
      continue
    }

    if (line.directive) continue

    // 2. Мнемоника должна быть в списке разрешённых
    const mnemonic = line.mnemonic
    if (!mnemonic) continue
    if (PSEUDO_INSTRUCTIONS.has(mnemonic)) continue

    const isMacroEnd = mnemonic === '%endmacro'
    if (isMacroEnd) continue

    // Вызов собственного макроса — не инструкция задания
    if (macroNames.has(mnemonic)) continue

    if (!allowedCommands.has(mnemonic) && !isServiceInstruction(mnemonic)) {
      violations.push({
        line: line.line,
        title: `Команда «${mnemonic.toUpperCase()}» запрещена`,
        message:
          `В этом задании разрешены: ${[...allowedCommands].map(c => c.toUpperCase()).join(', ')}. ` +
          `Команда «${mnemonic}» не входит в список.`,
      })
    }

    // 3. Регистры
    for (const register of line.registers) {
      const family = register.family16

      if (forbidden.has(family) || forbidden.has(register.name) || forbidden.has(register.family)) {
        violations.push({
          line: line.line,
          title: `Регистр ${register.name.toUpperCase()} запрещён условием задачи`,
          message:
            `По условию нельзя использовать ${familyLabel(family)}` +
            (register.name !== family ? ` (в том числе ${register.name.toUpperCase()})` : '') +
            `. Перепишите фрагмент без этого регистра.`,
        })
        continue
      }

      if (register.class === 'segment' || register.class === 'flags' || register.class === 'instruction') {
        if (!allowedRegisters.has(family)) {
          violations.push({
            line: line.line,
            title: `Регистр ${register.name.toUpperCase()} запрещён`,
            message: `Служебные регистры (${family.toUpperCase()}) в задании не используются.`,
          })
        }
        continue
      }

      if (!allowedRegisters.has(family)) {
        const hint = mode === 'x64' && REGISTER_ALIASES[family]
          ? ` (в 64-битном режиме это ${REGISTER_ALIASES[family].slice(0, 3).join('/')} и их половины)`
          : ''
        violations.push({
          line: line.line,
          title: `Регистр ${register.name.toUpperCase()} запрещён`,
          message:
            `Разрешены регистры: ${[...allowedRegisters].map(r => r.toUpperCase()).join(', ')}.` +
            `Регистр ${register.name.toUpperCase()} относится к семейству ${familyLabel(family)}${hint}.`,
        })
      }
    }

    // 4. Обращение к памяти
    const usesStackPointer = line.registers.some(r => STACK_POINTER_REGS.has(r.family16))
    const stackInstruction = ['push', 'pop', 'call', 'ret', 'enter', 'leave'].includes(mnemonic)

    if (line.hasMemory && !lab.memory) {
      // Стек — отдельная история: call/ret/push/pop разрешены Л/Р 2+
      violations.push({
        line: line.line,
        title: 'Работа с памятью запрещена',
        message:
          `В этой лабораторной нельзя адресовать память через [...]. ` +
          `Память (byte[]/word[], переменные) появляется в Л/Р 3 и Л/Р 4.`,
      })
    }

    if (usesStackPointer && !lab.memory && !stackInstruction && !allowedRegisters.has('sp')) {
      violations.push({
        line: line.line,
        title: 'Стек запрещён',
        message: 'Использование SP/BP не предусмотрено заданием.',
      })
    }
  }

  // Л/Р 4: должна быть хотя бы одна переменная/константа
  if (lab.lab === 4 && lab.z >= 0 && !hasDataDirective && !hasDataSection) {
    violations.push({
      line: 1,
      title: 'Нет переменных и констант',
      message: 'В Л/Р 4 требуется описать хотя бы одну переменную или константу (db/dw/equ).',
    })
  }

  // Л/Р 2+: должна быть подпрограмма (call + ret) — по методичке
  if (lab.lab === 2 && !violations.some(v => v.title.includes('запрещена')) && !hasSubroutine(lines)) {
    violations.push({
      line: 1,
      title: 'Нет подпрограммы',
      message: 'В Л/Р 2 все задачи оформляются как подпрограммы: нужен вызов call и возврат ret.',
    })
  }

  return { ok: violations.length === 0, violations }
}

/** Команды, которые в лабораторных не считаются «командами задачи» */
function isServiceInstruction(mnemonic: string): boolean {
  return mnemonic === '%macro' || mnemonic === '%endmacro' || mnemonic === 'nop'
}

function hasSubroutine(lines: ParsedLine[]): boolean {
  let hasCall = false
  let hasRet = false
  for (const line of lines) {
    if (line.mnemonic === 'call') hasCall = true
    if (line.mnemonic === 'ret') hasRet = true
  }
  return hasCall && hasRet
}

/**
 * Возвращает краткий список того, что будет показано в панели ограничений.
 */
export function describeRestriction(lab: LabTask): { allowed: string[]; registers: string[] } {
  return {
    allowed: lab.cmd.map(c => c.toUpperCase()),
    registers: lab.rl.map(r => r.toUpperCase()),
  }
}

/** Проверка «этот регистр разрешён?» для подсветки в редакторе */
export function isRegisterAllowed(name: string, lab: LabTask | undefined): boolean {
  if (!lab) return true
  const info = lookupRegister(name)
  if (!info) return true
  if (lab.forbiddenRegs?.includes(info.family16)) return false
  return lab.rl.includes(info.family16)
}
