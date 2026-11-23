/**
 * Таблица регистров x86 / x86-64.
 *
 * Ограничения лабораторных работ заданы в 16-битных именах (`ax`, `bx`, …),
 * поэтому каждое имя приводится к «семейству». В 64-битном режиме
 * `rax`, `eax`, `ax`, `ah`, `al` — одно семейство `ax`.
 */

export type RegisterClass =
  | 'general' // ax bx cx dx
  | 'index' // si di
  | 'stack' // bp sp
  | 'extended' // r8..r15
  | 'instruction' // ip
  | 'segment' // cs ds es ss fs gs
  | 'flags' // flags

export interface RegisterInfo {
  /** Имя, как его написал пользователь, в нижнем регистре */
  name: string
  /** Семейство: 'ax', 'bx', …, 'r8', 'ip', 'cs' */
  family: string
  /** 16-битное имя семейства: 'ax', 'bp', 'cs', … */
  family16: string
  width: 8 | 16 | 32 | 64
  class: RegisterClass
  /** Старшая половина 16-битного регистра (ah, bh, ch, dh) */
  high: boolean
}

const table = new Map<string, RegisterInfo>()

function add(info: Omit<RegisterInfo, 'name'> & { name: string }) {
  table.set(info.name, info)
}

/** Классические 16-битные регистры и их 32/64-битные расширения */
const classical: Array<{ family: string; cls: RegisterClass; low8?: string[] }> = [
  { family: 'ax', cls: 'general', low8: ['al', 'ah'] },
  { family: 'bx', cls: 'general', low8: ['bl', 'bh'] },
  { family: 'cx', cls: 'general', low8: ['cl', 'ch'] },
  { family: 'dx', cls: 'general', low8: ['dl', 'dh'] },
  { family: 'si', cls: 'index', low8: ['sil'] },
  { family: 'di', cls: 'index', low8: ['dil'] },
  { family: 'bp', cls: 'stack', low8: ['bpl'] },
  { family: 'sp', cls: 'stack', low8: ['spl'] },
]

for (const reg of classical) {
  add({ name: reg.family, family: reg.family, family16: reg.family, width: 16, class: reg.cls, high: false })
  add({ name: 'e' + reg.family, family: reg.family, family16: reg.family, width: 32, class: reg.cls, high: false })
  add({ name: 'r' + reg.family, family: reg.family, family16: reg.family, width: 64, class: reg.cls, high: false })
  if (reg.low8) {
    add({ name: reg.low8[0], family: reg.family, family16: reg.family, width: 8, class: reg.cls, high: false })
    if (reg.low8[1]) {
      add({ name: reg.low8[1], family: reg.family, family16: reg.family, width: 8, class: reg.cls, high: true })
    }
  }
}

for (let index = 8; index <= 15; index++) {
  const family = `r${index}`
  add({ name: family, family, family16: family, width: 64, class: 'extended', high: false })
  add({ name: `${family}d`, family, family16: family, width: 32, class: 'extended', high: false })
  add({ name: `${family}w`, family, family16: family, width: 16, class: 'extended', high: false })
  add({ name: `${family}b`, family, family16: family, width: 8, class: 'extended', high: false })
}

add({ name: 'ip', family: 'ip', family16: 'ip', width: 16, class: 'instruction', high: false })
add({ name: 'eip', family: 'ip', family16: 'ip', width: 32, class: 'instruction', high: false })
add({ name: 'rip', family: 'ip', family16: 'ip', width: 64, class: 'instruction', high: false })

for (const segment of ['cs', 'ds', 'es', 'ss', 'fs', 'gs']) {
  add({ name: segment, family: segment, family16: segment, width: 16, class: 'segment', high: false })
}
add({ name: 'flags', family: 'flags', family16: 'flags', width: 16, class: 'flags', high: false })
add({ name: 'eflags', family: 'flags', family16: 'flags', width: 32, class: 'flags', high: false })
add({ name: 'rflags', family: 'flags', family16: 'flags', width: 64, class: 'flags', high: false })

/** Расширения (8/16/32/64) для каждого 16-битного семейства */
export const REGISTER_ALIASES: Record<string, string[]> = {
  ax: ['rax', 'eax', 'ax', 'ah', 'al'],
  bx: ['rbx', 'ebx', 'bx', 'bh', 'bl'],
  cx: ['rcx', 'ecx', 'cx', 'ch', 'cl'],
  dx: ['rdx', 'edx', 'dx', 'dh', 'dl'],
  si: ['rsi', 'esi', 'si', 'sil'],
  di: ['rdi', 'edi', 'di', 'dil'],
  bp: ['rbp', 'ebp', 'bp', 'bpl'],
  sp: ['rsp', 'esp', 'sp', 'spl'],
  cs: ['cs'],
  ds: ['ds'],
  es: ['es'],
  ss: ['ss'],
  fs: ['fs'],
  gs: ['gs'],
}

/**
 * Читаемое имя регистра для конкретного режима.
 * Ограничения задаются 16-битным именем, а в 64-битном режиме
 * пользователю полезнее видеть полное имя.
 */
export function displayRegisterName(family16: string, mode: 'x64' | 'x16'): string {
  if (mode === 'x64') {
    const aliases = REGISTER_ALIASES[family16]
    if (aliases && aliases[0] && aliases[0].startsWith('r') && aliases[0].length >= 3) {
      return aliases[0].toUpperCase()
    }
    return family16.toUpperCase()
  }
  return family16.toUpperCase()
}

export function lookupRegister(token: string): RegisterInfo | undefined {
  return table.get(token.toLowerCase())
}

const REGISTER_TOKEN_RE = new RegExp(
  `\\b(${[...table.keys()]
    .sort((a, b) => b.length - a.length)
    .map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi',
)

/** Все токены-регистры в строке (в порядке появления, без дублей) */
export function findRegisters(text: string): RegisterInfo[] {
  const result: RegisterInfo[] = []
  const seen = new Set<string>()
  const re = new RegExp(REGISTER_TOKEN_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const info = lookupRegister(match[1])
    if (info && !seen.has(info.name)) {
      seen.add(info.name)
      result.push(info)
    }
  }
  return result
}

/** Строковое представление 64-битного значения регистра */
export function formatHex(value: bigint, width = 16): string {
  const normalized = value < 0n ? BigInt.asUintN(64, value) : value
  return normalized.toString(16).toUpperCase().padStart(width, '0')
}
