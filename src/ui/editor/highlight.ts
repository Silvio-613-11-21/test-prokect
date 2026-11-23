/**
 * Подсветка синтаксиса NASM без внешних зависимостей.
 *
 * Разбирает строку на токены (комментарии, строки, числа, регистры, метки,
 * директивы, мнемоники), а затем собирает HTML. Подход «сначала токены,
 * потом HTML» исключает XSS: весь пользовательский текст экранируется.
 */

const MNEMONICS = new Set([
  'mov', 'movzx', 'movsx', 'movsxd', 'lea', 'xchg', 'cmpxchg', 'push', 'pop', 'pushf', 'popf',
  'add', 'adc', 'sub', 'sbb', 'mul', 'imul', 'div', 'idiv', 'inc', 'dec', 'neg', 'not', 'nop',
  'and', 'or', 'xor', 'test', 'cmp', 'shl', 'shr', 'sal', 'sar', 'rol', 'ror', 'rcl', 'rcr',
  'jmp', 'je', 'jne', 'jz', 'jnz', 'js', 'jns', 'ja', 'jae', 'jb', 'jbe', 'jg', 'jge', 'jl', 'jle',
  'jc', 'jnc', 'jo', 'jno', 'jcxz', 'jecxz', 'jrcxz', 'loop', 'loope', 'loopne', 'call', 'ret', 'retn',
  'int', 'into', 'iret', 'syscall', 'sysret', 'cpuid', 'rdtsc', 'leave', 'enter',
  'stosb', 'stosw', 'stosd', 'stosq', 'lodsb', 'lodsw', 'lodsd', 'lodsq',
  'movsb', 'movsw', 'movsd', 'movsq', 'cmpsb', 'cmpsw', 'cmpsd', 'cmpsq',
  'scasb', 'scasw', 'scasd', 'scasq', 'rep', 'repe', 'repz', 'repne', 'repnz', 'lock',
  'cld', 'std', 'clc', 'stc', 'cli', 'sti', 'lahf', 'sahf', 'cbw', 'cwde', 'cdqe', 'cwd', 'cdq', 'cqo',
  'bt', 'bts', 'btr', 'btc', 'bsf', 'bsr', 'bswap', 'popcnt', 'lzcnt', 'tzcnt',
  'andn', 'bextr', 'blsi', 'blsr', 'blsmsk', 'mulx', 'shlx', 'shrx', 'sarx', 'pdep', 'pext', 'rorx',
  'sete', 'setne', 'setz', 'setnz', 'sets', 'setns', 'seta', 'setae', 'setb', 'setbe',
  'setg', 'setge', 'setl', 'setle', 'cmovz', 'cmovnz', 'cmove', 'cmovne', 'cmova', 'cmovb',
  'cmovg', 'cmovl', 'cmovge', 'cmovle', 'cmovs', 'cmovns', 'xadd', 'cmpchg8b', 'rdrand',
])

const DIRECTIVES = new Set([
  'section', 'segment', 'global', 'extern', 'bits', 'org', 'default', 'align', 'alignb',
  'db', 'dw', 'dd', 'dq', 'dt', 'ddq', 'do', 'dy', 'dz',
  'resb', 'resw', 'resd', 'resq', 'rest', 'times', 'equ', 'struc', 'endstruc',
  'istruc', 'iend', 'absolute', 'cpu', 'common', 'static', 'use16', 'use32', 'use64',
])

const MACRO_DIRECTIVES = new Set([
  '%macro', '%endmacro', '%assign', '%define', '%xdefine', '%idefine', '%undef',
  '%ifdef', '%ifndef', '%if', '%elif', '%else', '%endif', '%include', '%rep', '%endrep',
  '%push', '%pop', '%error', '%warning', '%line', '%strlen', '%substr', '%1', '%2',
])

const SEGMENTS = new Set(['cs', 'ds', 'es', 'ss', 'fs', 'gs'])
const SIZE_WORDS = new Set(['byte', 'word', 'dword', 'qword', 'tword', 'oword', 'yword', 'zword', 'ptr'])

function isRegisterToken(token: string): boolean {
  return /^(r(1[0-5]|[8-9])[dwb]?|r[a-d]x|e[a-d]x|[a-d][xh]|[a-d]l|r[sd]i|e[sd]i|[sd]i|sil|dil|r[sb]p|e[sb]p|[sb]p|spl|bpl|rip|eip|ip|rflags|eflags|flags)$/i.test(token)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Token {
  text: string
  cls: string | null
}

/**
 * Разбивает строку на токены подсветки.
 * `registers` описывает подсветку: разрешённые регистры — зелёным,
 * запрещённые — красным (используется в режиме ограничений).
 */
export function highlightLine(
  line: string,
  registerClass?: (register: string) => string | null,
  forbiddenRegister?: (register: string) => boolean,
): string {
  const tokens: Token[] = []
  let index = 0
  let expectMnemonic = true
  let seenLabel = false

  while (index < line.length) {
    const rest = line.slice(index)

    // Комментарий до конца строки
    if (rest.startsWith(';')) {
      tokens.push({ text: rest, cls: 'tok-comment' })
      break
    }

    // Строковые литералы
    const stringMatch = /^('[^']*'?|"[^"]*"?)/.exec(rest)
    if (stringMatch) {
      tokens.push({ text: stringMatch[1], cls: 'tok-string' })
      index += stringMatch[1].length
      expectMnemonic = false
      continue
    }

    // Пробелы
    const wsMatch = /^\s+/.exec(rest)
    if (wsMatch) {
      tokens.push({ text: wsMatch[0], cls: null })
      index += wsMatch[0].length
      continue
    }

    // Директивы препроцессора
    const macroMatch = /^%[\w]+/.exec(rest)
    if (macroMatch) {
      const isMacroDirective = MACRO_DIRECTIVES.has(macroMatch[0].toLowerCase())
      tokens.push({ text: macroMatch[0], cls: isMacroDirective ? 'tok-directive' : 'tok-macro-param' })
      index += macroMatch[0].length
      expectMnemonic = false
      continue
    }

    // Числа (hex, bin, dec, oct)
    const numberMatch = /^(0x[0-9a-f]+|[0-9][0-9a-f]*h\b|[01]+b\b|[0-9]+o\b|[0-9]+d?\b)/i.exec(rest)
    if (numberMatch) {
      tokens.push({ text: numberMatch[1], cls: 'tok-number' })
      index += numberMatch[1].length
      expectMnemonic = false
      continue
    }

    // Идентификаторы и всё остальное
    const wordMatch = /^[A-Za-z_.$][\w.$#@~?]*/.exec(rest)
    if (wordMatch) {
      const word = wordMatch[0]
      const lower = word.toLowerCase()
      const next = line.slice(index + word.length)
      let cls: string | null = null

      if (lower === 'label' || /^\s*:/.test(next)) {
        cls = 'tok-label'
      } else if (SEGMENTS.has(lower)) {
        cls = 'tok-segment'
      } else if (SIZE_WORDS.has(lower)) {
        cls = 'tok-size'
      } else if (DIRECTIVES.has(lower)) {
        cls = 'tok-directive'
      } else if (MNEMONICS.has(lower) && (expectMnemonic || seenLabel)) {
        cls = 'tok-mnemonic'
        expectMnemonic = false
      } else if (isRegisterToken(lower)) {
        const forbidden = forbiddenRegister?.(lower)
        cls = forbidden ? 'tok-register-forbidden' : (registerClass?.(lower) || 'tok-register')
      } else if (!expectMnemonic && (lower === 'rel' || lower === 'abs' || lower === 'short' || lower === 'far' || lower === 'near')) {
        cls = 'tok-keyword'
      } else {
        cls = 'tok-ident'
      }

      if (lower === 'section' || lower === 'segment') expectMnemonic = false
      tokens.push({ text: word, cls })
      index += word.length
      if (cls === 'tok-label') seenLabel = true
      continue
    }

    // Символы пунктуации
    const symbolMatch = /^[^\w\s]+/.exec(rest)
    if (symbolMatch) {
      tokens.push({ text: symbolMatch[0], cls: 'tok-symbol' })
      index += symbolMatch[0].length
      if (symbolMatch[0] === ':') expectMnemonic = true
      continue
    }

    tokens.push({ text: rest[0], cls: null })
    index += 1
  }

  return tokens
    .map((token) => {
      const escaped = escapeHtml(token.text)
      return token.cls ? `<span class="${token.cls}">${escaped}</span>` : escaped
    })
    .join('')
}
