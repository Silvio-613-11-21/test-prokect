/**
 * Режимы сборки.
 *
 * x64: NASM -felf64 + GNU ld → ELF, исполняется в blink (long mode).
 * x16: NASM -f bin → плоский .bin, только компиляция и проверка ограничений
 *      (16-битные программы не могут выполняться в 64-битном long mode).
 */

export type ArchMode = 'x64' | 'x16'

export interface CompileResult {
  /** Успех сборки */
  ok: boolean
  /** Лог NASM/линкера */
  log: string
  /** Ошибки с номерами строк (для подсветки в редакторе) */
  diagnostics: Diagnostic[]
  /** Имя итогового артефакта в виртуальной ФС blink (для запуска/скачивания) */
  artifactName?: string
  /** Байты итогового артефакта */
  artifact?: Uint8Array
  /** Трассировка шагов сборки */
  steps: CompileStep[]
}

export interface Diagnostic {
  line: number
  message: string
  severity: 'error' | 'warning'
}

export interface CompileStep {
  name: string
  command: string
  exitCode: number
  durationMs: number
}

export const MINIMAL_LINKER_SCRIPT = `
ENTRY(_start)
SECTIONS
{
  PROVIDE(__executable_start = 0x400000);
  . = 0x400000 + SIZEOF_HEADERS;
  .note.gnu.property : { *(.note.gnu.property) }
  . = ALIGN(0x1000);
  .text : { *(.text .text.*) }
  PROVIDE(__etext = .);
  PROVIDE(_etext = .);
  PROVIDE(etext = .);
  . = ALIGN(0x1000);
  .rodata : { *(.rodata .rodata.*) }
  . = ALIGN(0x1000) + (. & 0xfff);
  .data : { *(.data .data.*) }
  PROVIDE(_edata = .);
  PROVIDE(edata = .);
  __bss_start = .;
  .bss : { *(.bss .bss.*) *(COMMON) . = ALIGN(. != 0 ? 8 : 1); }
  . = ALIGN(8);
  PROVIDE(_end = .);
  PROVIDE(end = .);
}
`

export const NASM_COMMAND: Record<ArchMode, string> = {
  x64: '/assembler -felf64 /assembly.s -o /program.o',
  x16: '/assembler -f bin /assembly.s -o /program.bin',
}

export const LINKER_COMMAND = '/linker /program.o -o /program -T /link.ld --hash-size=31'

export const OUTPUT_NAME: Record<ArchMode, string> = {
  x64: '/program',
  x16: '/program.bin',
}

/** Может ли программа быть исполнена в blink */
export function canExecute(mode: ArchMode): boolean {
  return mode === 'x64'
}

/** Понятное объяснение, почему режим не исполняется */
export const NO_EXECUTION_REASON =
  '16-битные программы (DOS, int 21h) не выполняются: движок blink работает ' +
  'только в 64-битном long mode. Здесь доступны компиляция NASM и проверка ограничений — ' +
  'для запуска переключитесь в режим «x86-64».'
