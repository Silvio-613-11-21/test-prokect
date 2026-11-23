/**
 * Генератор примеров программ.
 *
 * Примеры собираются из текстовых шаблонов; в них нет `${...}`,
 * поэтому листинги читаются как обычный NASM.
 */

export interface ExampleSnippet {
  id: string
  title: string
  /** Краткое описание того, что делает пример */
  description: string
  /** На что смотреть после запуска */
  hint?: string
  /** Какому заданию соответствует пример (?lab=N&z=M) */
  lab?: number
  z?: number
  code: string
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() ? '    ' + line : line))
    .join('\n')
}

/** Стандартная 16-битная программа: org 100h + выход через int 21h */
function x16Program(body: string, data = ''): string {
  const lines = [
    '; --- 16-битная программа (учебный режим) ---',
    '; Собирается NASM в плоский .bin и проверяется по ограничениям,',
    '; но не исполняется: blink работает только в 64-битном long mode.',
    'bits 16',
    'org 100h',
    '',
    'start:',
    indent(body.trim()),
    '',
    '; @service — служебный выход DOS, не входит в проверку ограничений',
    '    mov ax, 4C00h',
    '    int 21h',
  ]
  if (data.trim()) {
    lines.push('', data.trim())
  }
  return lines.join('\n') + '\n'
}

export const examples: ExampleSnippet[] = [
  {
    id: 'lab1-1',
    lab: 1,
    z: 1,
    title: 'Л/Р 1.1 — умножение на 4 сдвигами',
    description:
      'AX = 6, BX = AX * 4 через цикл со SHL — как требует задание 1.1 (без альтернативных решений).',
    hint: 'После запуска: RAX = 6, RBX = 24 (0x18), RCX = 0.',
    code: `; Л/Р 1.1: AX = 6, BX = AX * 4 (два сдвига без цикла)
; Разрешены команды MOV, SHL и регистры AX, BX
bits 64
default rel

section .text
global _start
_start:
    mov ax, 6          ; начальное значение
    mov bx, ax         ; BX = AX
    shl bx, 1          ; BX = AX * 2
    shl bx, 1          ; BX = AX * 4

; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60         ; sys_exit
    syscall
`,
  },
  {
    id: 'lab1-7',
    lab: 1,
    z: 7,
    title: 'Л/Р 1.7 — перестановка тетрад',
    description:
      'DX = 567Fh → DX = 675Fh: тетрады вытаскиваются масками и собираются в новом порядке через SHL/SHR/OR.',
    hint: 'Шагайте по OR и смотрите DX: 6000 → 6700 → 6750 → 675F.',
    code: `; Л/Р 1.7: DX = 567Fh -> DX = 675Fh
; Разрешены: MOV, SHR, SHL, ADD, XOR, OR, AND
; Регистры: AX, BX, CX, DX
bits 64
default rel

section .text
global _start
_start:
    mov dx, 567Fh

    mov ax, dx
    and ax, 0F00h      ; AX = 0600h (тетрада 6)
    shl ax, 4          ; AX = 6000h

    mov bx, dx
    and bx, 00F0h      ; BX = 0070h (тетрада 7)
    shl bx, 4          ; BX = 0700h
    or ax, bx          ; AX = 6700h

    mov bx, dx
    and bx, 0F000h     ; BX = 5000h (тетрада 5)
    shr bx, 8          ; BX = 0050h
    or ax, bx          ; AX = 6750h

    mov bx, dx
    and bx, 000Fh      ; BX = 000Fh (тетрада F)
    or ax, bx          ; AX = 675Fh

    mov dx, ax         ; DX = 675Fh

; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60
    xor edi, edi
    syscall
`,
  },
  {
    id: 'lab1-8',
    lab: 1,
    z: 8,
    title: 'Л/Р 1.8 — цикл SHL + INC',
    description:
      'Задание 1.8: 16 итераций, в теле только сдвиг и инкремент. Значения повторяют таблицу из методички.',
    hint: 'Ставьте breakpoint на `shl` и нажимайте «Шаг»: BX принимает 1, 3, 7, F, 1F…',
    code: `; Л/Р 1.8: 16 итераций, в теле цикла SHL и INC
bits 64
default rel

section .text
global _start
_start:
    mov bx, 0           ; BX = 0
    mov cx, 16          ; 16 итераций

pattern:
    shl bx, 1           ; сдвиг
    inc bx              ; инкремент
    loop pattern        ; CX -= 1, повтор пока CX != 0

    ; после цикла: BX = FFFFh, CX = 0
; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60
    xor edi, edi
    syscall
`,
  },
  {
    id: 'lab1-9',
    lab: 1,
    z: 9,
    title: 'Л/Р 1.9 — двойной условный оператор',
    description:
      'IF (AX + BX > 7) THEN CX = 1111h ELSE CX = 2222h. Проверьте обе ветки, меняя начальные значения.',
    hint: 'Breakpoint на then_branch и else_branch, затем меняйте AX/BX.',
    code: `; Л/Р 1.9: IF (AX + BX > 7) THEN CX = 1111h ELSE CX = 2222h
bits 64
default rel

section .text
global _start
_start:
    mov ax, 3
    mov bx, 9           ; AX + BX = 12 > 7

    mov dx, ax
    add dx, bx          ; DX = AX + BX
    cmp dx, 7
    jg then_branch

else_branch:
    mov cx, 2222h
    jmp finish

then_branch:
    mov cx, 1111h

finish:
; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60
    xor edi, edi
    syscall
`,
  },
  {
    id: 'lab2-macro',
    lab: 2,
    z: 1,
    title: 'Л/Р 2 — макрос и подпрограмма',
    description:
      'Универсальный макрос %macro и вызов подпрограммы через call/ret — как требует Л/Р 2.',
    hint: 'Шагайте по call/ret и смотрите панель Stack: там адрес возврата.',
    code: `; Л/Р 2: макрос + подпрограмма
%macro set_result 1
    mov ax, %1
    call multiply_by_two
%endmacro

bits 64
default rel

section .text
global _start
_start:
    set_result 21        ; AX = 42 после подпрограммы

; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60
    xor edi, edi
    syscall

; --- подпрограмма: AX *= 2 ---
multiply_by_two:
    shl ax, 1
    ret
`,
  },
  {
    id: 'lab3-memory',
    lab: 3,
    z: -1,
    title: 'Л/Р 3 — работа с памятью и ASCII',
    description:
      'Запись надписи по адресу в .data: два символа за шаг. В панели «Память» появится «Hello, World!».',
    hint: 'Смотрите панель «Память»: 48 65 6C 6C 6F и ASCII-колонка справа.',
    code: `; Л/Р 3: запись надписи в память по 2 символа
; Вместо byte[]/word[] из 16-битных заданий используется [bx + si]
bits 64
default rel

section .text
global _start
_start:
    lea bx, [rel buffer]
    lea dx, [rel text]
    mov si, 0
    mov cx, 7            ; 7 шагов по 2 символа

fill:
    mov ax, [rdx + rsi]  ; два символа из text
    mov [rbx + rsi], ax  ; пишем слово (2 байта) в buffer
    add si, 2
    loop fill

; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60
    xor edi, edi
    syscall

section .data
text:   db "Hello, World!", 0
buffer: times 16 db 0
`,
  },
  {
    id: 'lab4-vars',
    lab: 4,
    z: 2,
    title: 'Л/Р 4 — константы и переменные',
    description:
      'Сегмент данных с db/dw/dd/equ: сложение байтов через память (задание 4.2), без использования регистров после присваивания.',
    hint: 'В панели «Память» найдите a4, b4, c4 и word_example.',
    code: `; Л/Р 4: переменные и константы
; C4 = A4 + B4 (байты), без переполнения
bits 64
default rel

section .text
global _start
_start:
    mov al, 15h
    mov [rel a4], al
    mov bl, 24h
    mov [rel b4], bl

    ; дальше работаем только с памятью
    mov al, [rel a4]
    add al, [rel b4]
    mov [rel c4], al

; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60
    xor edi, edi
    syscall

section .data
a4: db 0
b4: db 0
c4: db 0
word_example:  dw 1234h
dword_example: dd 11223344h
const_len equ 6
`,
  },
  {
    id: 'lab5-symbol',
    lab: 5,
    z: 1,
    title: 'Л/Р 5 — код символа',
    description:
      'В BH записывается ASCII-код «7», затем двумя тетрадами формируется строка «37h» — аналог задания 5.1.',
    hint: 'RBX = 0x37, в терминале напечатается «37h».',
    code: `; Л/Р 5: работа с кодом символа
bits 64
default rel

section .text
global _start
_start:
    mov bh, '7'          ; BH = 37h — ASCII-код цифры 7

    mov al, bh
    shr al, 4
    and al, 0Fh
    add al, '0'          ; AL = '3'
    mov [rel out_digit], al

    mov al, bh
    and al, 0Fh
    add al, '0'          ; AL = '7'
    mov [rel out_digit + 1], al
    mov al, 'h'
    mov [rel out_digit + 2], al

    mov rax, 1           ; sys_write
    mov rdi, 1
    lea rsi, [rel out_digit]
    mov rdx, 4
    syscall

; @service — служебный выход, не входит в проверку ограничений
    mov ax, 60
    xor edi, edi
    syscall

section .data
out_digit: db 0, 0, 0, 10
`,
  },
  {
    id: 'hello64',
    title: 'x86-64: вывод строки в терминал',
    description:
      'Linux-сисколлы: write (rax = 1) и exit (rax = 60). Результат печатается во вкладке «Терминал».',
    hint: 'После запуска откройте вкладку «Терминал».',
    code: `; x86-64 Linux: sys_write + sys_exit
section .text
global _start

_start:
    mov rax, 1           ; sys_write
    mov rdi, 1           ; stdout
    lea rsi, [rel msg]
    mov rdx, msg_len
    syscall

    mov rax, 60          ; sys_exit
    xor edi, edi
    syscall

section .rodata
msg:     db "Hello from NASM inside the browser!", 10
msg_len: equ $ - msg
`,
  },
  {
    id: 'lab1-dos',
    lab: 1,
    z: -1,
    title: 'Л/Р 1 (16-бит) — MOV / SHL / int 21h',
    description:
      'Исходный 16-битный стиль из методички: bits 16, org 100h, int 21h. Компилируется в .bin и проходит проверку ограничений.',
    hint: 'Режим «16 бит»: компиляция и проверка ограничений работают, запуск недоступен.',
    code: x16Program(`mov ax, 6
mov bx, ax
shl bx, 1
shl bx, 1`),
  },
  {
    id: 'lab3-dos',
    lab: 3,
    z: -1,
    title: 'Л/Р 3 (16-бит) — надпись в памяти',
    description:
      '16-битная работа с памятью в синтаксисе заданий: адресация [bx + si], надпись «Hello, World!».',
    hint: 'Режим «16 бит»: проверка ограничений Л/Р 3 и компиляция в .bin.',
    code: x16Program(
      `mov bx, text
mov si, 0
mov cx, 7

fill:
    mov ax, [bx + si]
    mov [buffer + si], ax
    add si, 2
    loop fill`,
      'text:   db "Hello, World!"\nbuffer: times 16 db 0',
    ),
  },
]

export const defaultExample = examples[0]

/** Пример, соответствующий заданию лабораторной */
export function findExampleForLab(lab: number, z: number): ExampleSnippet | undefined {
  return (
    examples.find(example => example.lab === lab && example.z === z) ??
    examples.find(example => example.lab === lab && (example.z ?? -2) < 0) ??
    examples.find(example => example.lab === lab)
  )
}

export function findExample(id: string | null | undefined): ExampleSnippet | undefined {
  if (!id) return undefined
  return examples.find((example) => example.id === id)
}
