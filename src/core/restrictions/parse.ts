/**
 * Разбор исходника на инструкции для проверки ограничений.
 *
 * Задача парсера — не полный разбор NASM, а точное извлечение:
 *  - мнемоник (с учётом префиксов %macro и labels);
 *  - операндов строки;
 *  - используемых регистров;
 *  - обращений к памяти;
 *  - объявлений данных, меток и констант.
 *
 * Этого достаточно, чтобы до компиляции объяснить студенту,
 * какое именно правило лабораторной нарушено.
 */

import { findRegisters, type RegisterInfo } from '../registers'

export interface ParsedLine {
  /** Номер строки в исходнике, 1-based */
  line: number
  /** Текст без комментария, обрезанный по краям */
  text: string
  /** Мнемоника в нижнем регистре, если строка — инструкция */
  mnemonic?: string
  /** Префикс размера (byte/word/dword/qword/...) */
  sizePrefix?: string
  /** Верхнеуровневые операнды (разбиты по запятым вне скобок) */
  operands: string[]
  /** Все регистры, встречающиеся в строке */
  registers: RegisterInfo[]
  /** Есть ли обращение к памяти `[...]` */
  hasMemory: boolean
  /** Метки, объявленные в этой строке */
  labels: string[]
  /** Имя директивы данных/константы, если строка — объявление */
  dataSymbol?: string
  /** Директива (`section`, `global`, `equ`, `%macro`, `%endmacro`, …) */
  directive?: string
  /** Строка — продолжение макроса/объявления, инструкций нет */
  isContinuation?: boolean
  /** Строка входит в служебный блок после маркера `; @service` — не проверяется */
  service?: boolean
}

const SIZE_PREFIXES = ['byte', 'word', 'dword', 'qword', 'tword', 'oword', 'yword', 'zword', 'near', 'far', 'short', 'ptr']

const DATA_DIRECTIVES = new Set(['db', 'dw', 'dd', 'dq', 'dt', 'ddq', 'do', 'dy', 'dz', 'resb', 'resw', 'resd', 'resq', 'rest', 'equ', 'times'])

const SECTION_DIRECTIVES = new Set(['section', 'segment', 'global', 'extern', 'bits', 'org', 'cpu', 'default', 'align', 'alignb', 'struc', 'endstruc', 'istruc', 'iend', 'absolute'])

/** Маркер начала служебного блока (завершение программы, вывод в ОС) */
export const SERVICE_MARKER = /@service\b|@служебный\b/i

/** Убирает комментарий `;` и обрезает пробелы */
export function stripComment(raw: string): string {
  let inString: string | null = null
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      continue
    }
    if (ch === ';') return raw.slice(0, i).trimEnd()
  }
  return raw.trimEnd()
}

/** Разбивает строку по запятым, игнорируя запятые внутри скобок и кавычек */
export function splitOperands(text: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0
  let inString: string | null = null

  for (const ch of text) {
    if (inString) {
      current += ch
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      current += ch
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') depth--
    if (ch === ',' && depth === 0) {
      result.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim() !== '' || result.length > 0) result.push(current.trim())
  return result
}

/** Разбирает метки в начале строки (`loop:`, `start:`), возвращает остаток */
function takeLabels(text: string): { labels: string[]; rest: string } {
  const labels: string[] = []
  let rest = text.trimStart()
  for (;;) {
    const match = /^([A-Za-z_.$][\w.$#@~?]*|\d+):(?!:)/.exec(rest)
    if (!match) break
    labels.push(match[1])
    rest = rest.slice(match[0].length).trimStart()
  }
  return { labels, rest }
}

/** Убирает префиксы размера/ptr из операнда */
export function stripSizePrefix(operand: string): { sizePrefix?: string; rest: string } {
  let rest = operand.trim()
  let sizePrefix: string | undefined
  for (;;) {
    const match = /^([A-Za-z]+)\s+/i.exec(rest)
    if (!match) break
    const word = match[1].toLowerCase()
    if (!SIZE_PREFIXES.includes(word)) break
    sizePrefix ??= word
    rest = rest.slice(match[0].length).trimStart()
  }
  return { sizePrefix, rest }
}

/** Разбирает одну инструкцию */
export function parseInstructionLine(rawLine: string, lineNumber: number): ParsedLine | null {
  const withoutComment = stripComment(rawLine)
  if (!withoutComment.trim()) return null

  const { labels, rest } = takeLabels(withoutComment)
  const parsed: ParsedLine = {
    line: lineNumber,
    text: withoutComment.trim(),
    operands: [],
    registers: [],
    hasMemory: false,
    labels,
  }

  let body = rest.trim()
  if (!body) {
    // строка содержит только метку(и)
    return parsed
  }

  // директива препроцессора/macro
  if (body.startsWith('%')) {
    const [word, ...tail] = body.split(/\s+/)
    parsed.directive = word.toLowerCase()
    parsed.mnemonic = undefined
    if (parsed.directive === '%macro') {
      // %macro name nargs
      parsed.dataSymbol = tail[0]
    }
    if (parsed.directive === '%assign' || parsed.directive === '%define') {
      const defineMatch = /%[a-z]+\s+([\w.$#@~?]+)\s+(.+)$/i.exec(body)
      if (defineMatch) {
        parsed.dataSymbol = defineMatch[1]
        body = defineMatch[2]
        parsed.isContinuation = true
      }
    }
    parsed.registers = findRegisters(body.replace(/%.*$/, ''))
    parsed.hasMemory = /\[[^\]]*\]/.test(body)
    return parsed
  }

  const [firstWordRaw, ...wordsTail] = body.split(/\s+/)
  const firstWord = firstWordRaw.toLowerCase()
  const tailText = wordsTail.join(' ')

  // Директива объявления данных: `msg db "text"` или `db 1, 2, 3`
  if (DATA_DIRECTIVES.has(firstWord)) {
    parsed.directive = firstWord
    parsed.operands = splitOperands(tailText)
    parsed.registers = findRegisters(tailText)
    parsed.hasMemory = false
    return parsed
  }

  if (SECTION_DIRECTIVES.has(firstWord)) {
    parsed.directive = firstWord
    parsed.operands = splitOperands(tailText)
    return parsed
  }

  // `msg db 'text'` — первое слово это имя символа, второе директива
  if (wordsTail.length > 0 && DATA_DIRECTIVES.has(wordsTail[0].toLowerCase())) {
    parsed.directive = wordsTail[0].toLowerCase()
    parsed.dataSymbol = firstWordRaw
    const valueText = wordsTail.slice(1).join(' ')
    parsed.operands = splitOperands(valueText)
    parsed.registers = findRegisters(valueText)
    parsed.hasMemory = /\[[^\]]*\]/.test(valueText)
    return parsed
  }

  // `msg equ 10` / `msg: equ 10`
  if (wordsTail.length > 0 && wordsTail[0].toLowerCase() === 'equ') {
    parsed.directive = 'equ'
    parsed.dataSymbol = firstWordRaw
    const valueText = wordsTail.slice(1).join(' ')
    parsed.operands = splitOperands(valueText)
    parsed.registers = findRegisters(valueText)
    return parsed
  }

  // Классическая инструкция. Перед мнемоникой может стоять префикс размера
  // (в NASM размер пишется у операнда, но `rep movsb` и `lock add` — тоже префиксы).
  let mnemonic = firstWord
  let operandText = tailText.trim()
  if (/^(rep|repe|repz|repne|repnz|lock)$/.test(mnemonic) && operandText) {
    const [next, ...restWords] = operandText.split(/\s+/)
    mnemonic = next.toLowerCase()
    operandText = restWords.join(' ')
    parsed.sizePrefix = firstWord
  }

  parsed.mnemonic = mnemonic
  parsed.operands = splitOperands(operandText)
  parsed.hasMemory = /\[[^\]]*\]/.test(operandText)
  const registersPart = operandText
  parsed.registers = findRegisters(registersPart)

  return parsed
}

/** Разбирает весь исходник */
export function parseSource(source: string): ParsedLine[] {
  const result: ParsedLine[] = []
  const lines = source.split(/\r?\n/)
  let insideMultilineMacro = false
  let inServiceBlock = false
  for (let i = 0; i < lines.length; i++) {
    // Маркер служебного блока: всё ниже — обвязка (выход из программы),
    // её состав зависит от ОС, а не от задания лабораторной.
    if (SERVICE_MARKER.test(lines[i])) inServiceBlock = true
    const parsed = parseInstructionLine(lines[i], i + 1)
    if (!parsed) continue
    if (parsed.directive === '%macro') insideMultilineMacro = true
    parsed.isContinuation = insideMultilineMacro
    if (inServiceBlock) parsed.service = true
    if (parsed.directive === '%endmacro') insideMultilineMacro = false
    result.push(parsed)
  }
  return result
}
