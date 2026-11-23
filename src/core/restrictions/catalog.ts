/**
 * Ограничения лабораторных работ.
 *
 * Логика повторяет `diplom_` (ветка go-to-finish), расширенная на Л/Р 4 и Л/Р 5
 * (ссылки из README: lab4zzzz-A и lab5zzzz).
 *
 * Отличия от исходного проекта:
 *  - регистры заданы в 16-битных именах, но проверка учитывает их
 *    32/64-битные расширения (rax → ax) и полурегистры (ah/al → ax);
 *  - добавлено поле `allowedPrefixes` (почему в 16-битных заданиях можно
 *    писать `byte ptr [..]` без нарушения размера);
 *  - `memory` по умолчанию выключена для Л/Р 1–2 — так же, как в исходнике.
 */

export interface LabTask {
  /** Номер лабораторной */
  lab: number
  /** Номер задачи (z), -1 — все задачи лабораторной */
  z: number
  /** Текст задания для панели ограничений */
  task: string
  /** Разрешённые мнемоники (нижний регистр) */
  cmd: string[]
  /** Разрешённые регистры в 16-битных именах семейств */
  rl: string[]
  /** Разрешена ли работа с памятью */
  memory: boolean
  /** Регистры, которые запрещены условием конкретной задачи */
  forbiddenRegs?: string[]
  /** true — задание целиком 16-битное и не предназначено для запуска в blink */
  legacy16?: boolean
}

/** Базовый набор служебных директив, которые никогда не являются нарушением */
export const SERVICE_DIRECTIVES = new Set([
  'section',
  'segment',
  'global',
  'extern',
  'bits',
  'org',
  'cpu',
  'default',
  'align',
  'alignb',
  '%macro',
  '%endmacro',
  '%assign',
  '%define',
  '%xdefine',
  '%idefine',
  '%undef',
  '%ifdef',
  '%ifndef',
  '%if',
  '%elif',
  '%else',
  '%endif',
  '%include',
])

/** Директивы описания данных — проверяются отдельным правилом (Л/Р 4+) */
export const DATA_DIRECTIVES = new Set([
  'db',
  'dw',
  'dd',
  'dq',
  'dt',
  'resb',
  'resw',
  'resd',
  'resq',
  'equ',
  'times',
])

const LAB1: Record<number, Pick<LabTask, 'cmd' | 'rl'>> = {
  1: { cmd: ['mov', 'shl'], rl: ['ax', 'bx'] },
  2: { cmd: ['mov', 'shl', 'add', 'sub'], rl: ['cx', 'dx'] },
  3: { cmd: ['mov', 'shl', 'and'], rl: ['ax'] },
  4: { cmd: ['mov', 'shl', 'shr', 'and'], rl: ['ax'] },
  5: { cmd: ['mov', 'shr', 'shl', 'add', 'sub'], rl: ['ax', 'bx', 'cx', 'dx'] },
  6: { cmd: ['mov', 'shr', 'shl', 'add', 'sub'], rl: ['ax', 'bx', 'cx', 'dx'] },
  7: { cmd: ['mov', 'shr', 'shl', 'add', 'xor', 'or', 'and'], rl: ['ax', 'bx', 'cx', 'dx'] },
  8: { cmd: ['mov', 'loop', 'shl', 'inc'], rl: ['ax', 'bx', 'dx', 'cx'] },
  9: {
    cmd: [
      'mov', 'cmp', 'jmp', 'js', 'jns', 'jz', 'jnz',
      'je', 'jne', 'ja', 'jb', 'jl', 'jg', 'jle', 'jge',
      'add', 'sub', 'inc', 'dec',
    ],
    rl: ['ax', 'bx', 'cx', 'dx'],
  },
  10: {
    cmd: [
      'mov', 'cmp', 'jmp', 'js', 'jns', 'jz', 'jnz',
      'je', 'jne', 'ja', 'jb', 'jl', 'jg', 'jle', 'jge',
      'add', 'sub', 'inc', 'dec',
    ],
    rl: ['ax', 'bx', 'cx', 'dx'],
  },
}

const LAB1_ALL_COMMANDS = [
  'mov', 'shl', 'shr', 'add', 'sub', 'and', 'or', 'xor',
  'inc', 'dec', 'loop', 'cmp', 'jmp',
  'js', 'jns', 'jz', 'jnz', 'je', 'jne', 'ja', 'jb', 'jl', 'jg', 'jle', 'jge',
]

/** Совместимость: старый формат таблицы заданий (используется в тестах) */
const TASKS: Record<string, Pick<LabTask, 'cmd' | 'rl'>> = {}

function lab1Task(z: number): Pick<LabTask, 'cmd' | 'rl'> | undefined {
  return LAB1[z]
}

function lab2Answers(): Record<number, number> {
  return {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 9,
  }
}

for (const [z, base] of Object.entries(lab2Answers())) {
  const zone = Number(z)
  if (zone === 0) {
    TASKS[`2:${z}`] = {
      cmd: ['call', 'ret', '%macro', 'mov'],
      rl: ['ax', 'bx', 'cx', 'dx'],
    }
    continue
  }

  const lab1Part = lab1Task(base)
  if (!lab1Part) continue
  TASKS[`2:${z}`] = {
    cmd: ['call', 'ret', '%macro', ...lab1Part.cmd],
    rl: lab1Part.rl,
  }
}

const LAB2_TASK_TEXT: Record<number, string> = {
  0: 'Оформление программы через подпрограмму: вызов call, возврат ret, макрос %macro.',
  1: 'Задача 1.1 в виде подпрограммы, вызываемой через универсальный макрос.',
  2: 'Задача 1.2 в виде подпрограммы, вызываемой через универсальный макрос.',
  3: 'Задача 1.3 в виде подпрограммы, вызываемой через универсальный макрос.',
  4: 'Задача 1.4 в виде подпрограммы, вызываемой через универсальный макрос.',
  5: 'Задача 1.5 в виде подпрограммы, вызываемой через универсальный макрос.',
  6: 'Задача 1.6 в виде подпрограммы, вызываемой через универсальный макрос.',
  7: 'Задача 1.7 в виде подпрограммы, вызываемой через универсальный макрос.',
  8: 'Задача 1.8 в виде подпрограммы, вызываемой через универсальный макрос.',
  9: 'Задача 1.9 в виде подпрограммы, вызываемой через универсальный макрос.',
  10: 'Задача 1.10 в виде подпрограммы, вызываемой через универсальный макрос.',
}

const LAB3_BASE_COMMANDS = ['mov', 'add', 'sub', 'lea', 'call', 'ret', '%macro']
const LAB3_LOOP_COMMANDS = [
  'loop', 'inc', 'dec', 'cmp', 'jmp',
  'jl', 'jle', 'jg', 'jge', 'je', 'jne', 'ja', 'jb',
]
const LAB3_MEMORY_REGS = ['ax', 'bx', 'cx', 'dx', 'si', 'di']
const LAB3_ALL_COMMANDS = [
  'mov', 'add', 'sub', 'lea', 'and', 'or', 'xor', 'cmp', 'shl', 'shr',
  'inc', 'dec', 'loop', 'jmp', 'js', 'jns', 'jz', 'jnz',
  'je', 'jne', 'ja', 'jb', 'jl', 'jg', 'jle', 'jge',
  'call', 'ret', '%macro',
]

const LAB3_TASKS: Record<number, string> = {
  0:
    'Создать в памяти надпись «Hello, World!» с 5-й строки с 6-й позиции. ' +
    'Записывать по 2 символа. Регистры BX и SI использовать нельзя!',
  1: 'Модифицировать задачу 3.0 с использованием регистра SI для записи надписи в память.',
  2:
    'Создать в памяти надпись со своими ФИО английскими буквами <=== Familia Imia Otchestvo ===> ' +
    'с использованием SI. Дважды вызвать макрос — напечатать надпись в двух разных местах.',
  3:
    'В DH присвоить 5, затем циклом с параметром заполнить символами "^" ' +
    'область памяти с 0-й позиции по позицию из DH включительно.',
  4:
    'В DH присвоить 5, в DL присвоить 10, затем циклом заполнить символами "^" ' +
    'область памяти между позициями из DH и DL включительно.',
  5:
    'Записать надпись с ФИО, обнулить регистры, в DH — позиция начала надписи. ' +
    'Подсчитать длину надписи по закрывающую скобку и поместить в DL.',
  6:
    'Записать надпись с ФИО, обнулить регистры, в DL — позиция начала надписи. ' +
    'Циклом затереть символы надписи между скобками символами "^" (скобки тоже затереть). ' +
    'Решение построить на вызовах задач 3.4 и 3.3!',
  7:
    'Записать надпись с ФИО во 2-ю строку, обнулить регистры, в DL — позиция начала надписи. ' +
    'Затереть символами "^" всю память ДО и ПОСЛЕ надписи (до 80-го адреса). ' +
    'Решение построить на вызовах задач 3.4, 3.3 и 3.2!',
  8:
    'Записать надпись с ФИО во 2-ю строку, обнулить регистры, ' +
    'в AL и AH присвоить 2 позиции относительно начала надписи, в BL — позицию вне надписи. ' +
    'Скопировать фрагмент памяти с AL по AH по адресу из BL. ' +
    'MOV Память, Память запрещена — делать 2 шага через регистр!',
  9:
    'Записать надпись с ФИО во 2-ю строку, обнулить регистры, ' +
    'в DL — позиция начала надписи, в DH — английская буква (ASCII-код). ' +
    'Подсчитать, сколько раз этот символ встречается в надписи. Результат — в тот же регистр. ' +
    'Решение построить на вызове задачи 3.4!',
}

function lab3Task(z: number): Pick<LabTask, 'cmd' | 'rl'> | undefined {
  if (z === -1) {
    return {
      cmd: LAB3_ALL_COMMANDS,
      rl: [...LAB3_MEMORY_REGS, 'bp', 'sp'],
    }
  }
  if (z === 0) {
    return { cmd: [...LAB3_BASE_COMMANDS], rl: LAB3_MEMORY_REGS }
  }
  if (z >= 1 && z <= 2) {
    return { cmd: [...LAB3_BASE_COMMANDS], rl: LAB3_MEMORY_REGS }
  }
  if (z >= 3 && z <= 9) {
    return {
      cmd: [...LAB3_BASE_COMMANDS, ...LAB3_LOOP_COMMANDS],
      rl: LAB3_MEMORY_REGS,
    }
  }
  if (z === 10) return lab3Task(9)
  return undefined
}

/**
 * Л/Р 4 — переменные и константы.
 * По методичке: подпрограмма + макрос обязательны, работа с памятью
 * и арифметика над байтами/словами разрешены. Для задач 4.3+ запрещены
 * «целые регистры» (ax/bx/cx/dx целиком) — разрешены полурегистры.
 */
function lab4Task(z: number): Pick<LabTask, 'cmd' | 'rl'> | undefined {
  const baseCommands = [
    'mov', 'add', 'adc', 'sub', 'call', 'ret', '%macro',
    'inc', 'dec', 'loop', 'cmp', 'jmp', 'je', 'jne', 'ja', 'jb',
    'xor', 'or', 'and', 'shl', 'shr',
  ]
  const baseRegs = ['ax', 'bx', 'cx', 'dx', 'si', 'di']

  if (z === -1) {
    return { cmd: [...baseCommands, 'xchg', 'lea'], rl: [...baseRegs, 'bp', 'sp'] }
  }
  if (z === 0) {
    return { cmd: ['mov'], rl: [] }
  }
  if (z >= 1 && z <= 9) {
    return { cmd: baseCommands, rl: baseRegs }
  }
  return undefined
}

const LAB4_TASKS: Record<number, string> = {
  0:
    'Создать в сегменте данных (в самом низу файла, после всех подпрограмм) ' +
    'конструкцию с описанием константы и переменной. Подпрограмма и макрос не нужны.',
  1:
    'Через регистр DL передавать через макрос новое значение (число от 0 до 9) в подпрограмму, ' +
    'чтобы в памяти изменился номер задачи (0 → код 30h, 1 → 31h, …, 9 → 39h).',
  2:
    'Присвоить через регистры AL и BL начальные значения в ячейки A4 и B4. ' +
    'Далее использовать значения в AL и BL запрещено — нужно работать с ячейками памяти! ' +
    'Проверить сложения C4 = A4 + B4 (без переполнений).',
  3:
    'Присвоить через AL и BL значения в A4 и B4, далее использовать AL и BL запрещено. ' +
    'Использовать целые регистры тоже запрещено — только ячейки памяти и полурегистры! ' +
    'C3C4 = A4 + B4 (с учётом переполнений).',
  4:
    'Присвоить через AH, AL и BL значения в A3, A4 и B4, далее использовать их запрещено. ' +
    'Целые регистры запрещены — память и полурегистры. C3C4 = A3A4 + B4.',
  5:
    'Присвоить через AH, AL и BL значения в A3, A4 и B4, далее использовать их запрещено. ' +
    'Целые регистры запрещены. C2C3C4 = A3A4 + B4 (с двумя переполнениями).',
  6:
    'Присвоить через AH, AL, BH, BL значения в A3, A4 и B3, B4, далее их использовать запрещено. ' +
    'Целые регистры запрещены. C2C3C4 = A3A4 + B3B4.',
  7:
    'Присвоить через CL, AH, AL, BL значения в A2, A3, A4 и B4, далее их использовать запрещено. ' +
    'Целые регистры запрещены. C2C3C4 = A2A3A4 + B4.',
  8:
    'Присвоить через CH, CL, AH, AL, BL значения в A1..A4 и B4, далее их использовать запрещено. ' +
    'Целые регистры запрещены. C1C2C3C4 = A1A2A3A4 + B4.',
  9:
    'Присвоить через CH, CL, AH, AL и DH, DL, BH, BL значения в A1..A4 и B1..B4, ' +
    'далее использовать CH, CL, AH, AL, DL, BH, BL запрещено. Целые регистры запрещены. ' +
    'C1C2C3C4 = A1A2A3A4 + B1B2B3B4.',
}

/** Л/Р 5 — прерывания: в 64-битном режиме аналог — syscall/ввод-вывод */
function lab5Task(z: number): Pick<LabTask, 'cmd' | 'rl'> | undefined {
  const baseCommands = [
    'mov', 'movzx', 'movsx', 'lea', 'xchg',
    'add', 'sub', 'cmp', 'and', 'or', 'xor', 'shl', 'shr',
    'inc', 'dec', 'loop', 'jmp', 'je', 'jne', 'ja', 'jb', 'jl', 'jg', 'jle', 'jge',
    'call', 'ret', '%macro', 'syscall', 'int', 'push', 'pop',
  ]
  const baseRegs = ['ax', 'bx', 'cx', 'dx', 'si', 'di']

  if (z === -1) {
    return { cmd: [...baseCommands, 'nop', 'test'], rl: [...baseRegs, 'bp', 'sp'] }
  }
  if (z >= 0 && z <= 9) {
    return { cmd: baseCommands, rl: baseRegs }
  }
  return undefined
}

const LAB5_TASKS: Record<number, string> = {
  0:
    'Все задачи оформлять в виде подпрограмм. Считать с клавиатуры код нажатой клавиши ' +
    '(1 или 2 байта — должно определяться автоматически). Выписать диапазоны кодов: ' +
    'цифры, строчные/заглавные буквы, пробел, Enter, Backspace, доллар, двоеточие.',
  1:
    'Через макрос записать в BH код символа от 0 до 9 (как ASCII-код). ' +
    'Напечатать на экране его 16-ричный код (30h…39h). Программа должна работать для любой цифры.',
  2:
    'Через макрос записать в CL код символа от 0 до F (ASCII). ' +
    'Напечатать на экране его 16-ричное числовое значение (0…15).',
  3:
    'Ввести с клавиатуры цифро-букву 0…F (как символ). Сделать из ASCII-кода число 0…15. ' +
    'Заглавную букву сделать маленькой, маленькую — заглавной, цифру — не менять. ' +
    'Напечатать результат.',
  4:
    'Ввести 2 цифро-буквы 0…F (как символы). Сделать из кодов числа 0…15. ' +
    'Напечатать с новой строки все цифро-буквы между введёнными (пример: ввели 3D — напечатает 456789ABC).',
  5:
    'Ввести строку из 8 цифро-букв. ASCII-коды записать в строковую переменную в памяти. ' +
    'Напечатать: равен ли первый символ последнему (First=Last / First!=Last).',
  6:
    'Ввести строку из 8 цифро-букв. ASCII-коды записать в память. ' +
    'Напечатать, сколько в строке двойных символов (два одинаковых подряд).',
  7:
    'Ввести строку из 8 цифро-букв. ASCII-коды записать в память. ' +
    'Напечатать ту же строку, обнулив в ней все двойные символы (станут 00).',
  8:
    'Ввести строку из 8 цифро-букв. ASCII-коды записать в память. ' +
    'Напечатать только символы на нечётных позициях (нумерация с 1-го).',
}

const LAB_TITLES: Record<number, string> = {
  1: 'Л/Р 1. Команды, регистры и флаги',
  2: 'Л/Р 2. Программы с макросами и подпрограммами',
  3: 'Л/Р 3. Работа с памятью ЭВМ',
  4: 'Л/Р 4. Создание переменных и констант',
  5: 'Л/Р 5. Работа с прерываниями',
}

const LAB_LINKS: Record<number, string> = {
  1: 'http://magicurl.ru/evm/lab1-/',
  2: 'http://magicurl.ru/evm/lab3-/',
  3: 'http://magicurl.ru/evm/lab3-/',
  4: 'http://magicurl.ru/evm/lab4zzzz-A/',
  5: 'http://magicurl.ru/evm/lab5zzzz/',
}

/**
 * Возвращает задание лабораторной или undefined, если таких ограничений нет.
 */
export function getLabTask(lab: number, z: number): LabTask | undefined {
  const normalize = (value: number) => (Number.isNaN(value) ? undefined : value)

  if (lab === 1) {
    if (z === -1) {
      return {
        lab,
        z,
        task: 'Все задачи Л/Р 1: команды, регистры, сдвиги, логика и условные переходы.',
        cmd: [...LAB1_ALL_COMMANDS],
        rl: ['ax', 'bx', 'cx', 'dx'],
        memory: false,
        legacy16: true,
      }
    }
    const base = lab1Task(normalize(z) ?? Number.NaN)
    if (!base) return undefined
    return {
      lab,
      z,
      task: `Задача 1.${z}: работа с регистрами и сдвигами (см. методичку).`,
      cmd: [...base.cmd],
      rl: [...base.rl],
      memory: false,
      legacy16: true,
    }
  }

  if (lab === 2) {
    if (z === -1) {
      return {
        lab,
        z,
        task: 'Все задачи Л/Р 2: подпрограммы (call/ret) и универсальный макрос %macro.',
        cmd: ['call', 'ret', '%macro', ...LAB1_ALL_COMMANDS],
        rl: ['ax', 'bx', 'cx', 'dx'],
        memory: false,
        legacy16: true,
      }
    }
    if (z === 0) {
      return {
        lab,
        z,
        task: LAB2_TASK_TEXT[0],
        cmd: ['call', 'ret', '%macro', 'mov'],
        rl: ['ax', 'bx', 'cx', 'dx'],
        memory: false,
        legacy16: true,
      }
    }
    const base = lab1Task(Math.min(z, 10))
    if (!base) return undefined
    return {
      lab,
      z,
      task: LAB2_TASK_TEXT[z] ?? LAB2_TASK_TEXT[10],
      cmd: ['call', 'ret', '%macro', ...base.cmd],
      rl: [...base.rl],
      memory: false,
      legacy16: true,
    }
  }

  if (lab === 3) {
    const base = lab3Task(z)
    if (!base) return undefined
    return {
      lab,
      z,
      task: z === -1 ? 'Все задачи Л/Р 3: работа с памятью byte[]/word[], макросы и подпрограммы.' : (LAB3_TASKS[z] ?? LAB3_TASKS[0]),
      cmd: [...base.cmd],
      rl: [...base.rl],
      memory: true,
      forbiddenRegs: z === 0 ? ['bx', 'si'] : undefined,
      legacy16: true,
    }
  }

  if (lab === 4) {
    const base = lab4Task(z)
    if (!base) return undefined
    return {
      lab,
      z,
      task: z === -1 ? 'Все задачи Л/Р 4: переменные и константы, работа с памятью и переносами.' : (LAB4_TASKS[z] ?? ''),
      cmd: [...base.cmd],
      rl: [...base.rl],
      memory: true,
      forbiddenRegs: z >= 3 ? ['ax', 'bx', 'cx', 'dx'] : undefined,
    }
  }

  if (lab === 5) {
    const base = lab5Task(z)
    if (!base) return undefined
    return {
      lab,
      z,
      task: z === -1 ? 'Все задачи Л/Р 5: прерывания и работа с кодами символов.' : (LAB5_TASKS[z] ?? ''),
      cmd: [...base.cmd],
      rl: [...base.rl],
      memory: true,
      forbiddenRegs: z === 9 ? ['ch', 'cl', 'ah', 'al', 'dl', 'bh', 'bl'] : undefined,
    }
  }

  return undefined
}

export function getLabTitle(lab: number): string {
  return LAB_TITLES[lab] ?? `Л/Р ${lab}`
}

export function getLabLink(lab: number): string | undefined {
  return LAB_LINKS[lab]
}

export { TASKS as RAW_TASKS }
