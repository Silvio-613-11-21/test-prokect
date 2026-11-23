/**
 * Общие типы приложения.
 */

/** Режим работы: реальный x86-64 (исполняемый) или учебный 16-битный. */
export type ArchMode = 'x64' | 'x16'

/** Состояние панели отладчика. */
export type MachineState =
  | 'idle' // ничего не загружено
  | 'assemble-error' // компиляция упала
  | 'restriction-error' // код нарушил ограничения
  | 'loaded' // программа загружена, но не начата
  | 'running' // выполняется до остановки
  | 'paused' // остановлено на пошаговом режиме / breakpoint
  | 'terminated' // программа завершилась

/** Диагностика NASM/линкера. */
export interface Diagnostic {
  line: number
  message: string
  severity: 'error' | 'warning'
}

/** Точка останова на строке исходника. */
export type Breakpoints = Set<number>

/** Снимок состояния процессора для отладчика. */
export interface CpuSnapshot {
  rip: number
  rsp: number
  rbp: number
  /** 16 64-битных регистров общего назначения по порядку rax..r15 */
  gpr: bigint[]
  rflags: bigint
  /** Сегментные регистры */
  cs: number
  ds: number
  es: number
  ss: number
  fs: number
  gs: number
}

/** Строка дизассемблера, пришедшая из blink. */
export interface DisasmLine {
  address: number
  bytes: string
  text: string
  label?: string
}

/** Память: байты и диапазоны для отображения. */
export interface MemoryRegion {
  start: number
  bytes: Uint8Array
  label: string
}

/** Запись стека для панели Stack. */
export interface StackEntry {
  /** Виртуальный адрес по rsp + смещение */
  address: number
  /** 64-битное значение little-endian */
  value: bigint
}

/** Результат проверки ограничений. */
export interface RestrictionViolation {
  line: number
  /** Короткое название проблемы */
  title: string
  /** Подробное объяснение для студента */
  message: string
}

/** Итог проверки ограничений перед компиляцией. */
export interface RestrictionReport {
  ok: boolean
  violations: RestrictionViolation[]
}
