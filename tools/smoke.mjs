/**
 * Smoke-тест приложения без браузера: jsdom + собранный бандл.
 *
 * Проверяет, что SPA монтируется, был загружается, ограничения применяются,
 * а полный цикл «компиляция → шаг → запуск» действительно работает.
 */
import { build } from 'esbuild'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'

const assetPlugin = {
  name: 'asset-url',
  setup(build) {
    build.onResolve({ filter: /blinkenlib\.js\?url$/ }, args => {
      const abs = resolve(args.resolveDir, args.path.replace(/\?url$/, ''))
      return { path: abs, namespace: 'asset-url' }
    })
    build.onResolve({ filter: /\.(wasm|elf)\?url$/ }, args => {
      const abs = resolve(args.resolveDir, args.path.replace(/\?url$/, ''))
      return { path: abs, namespace: 'asset-url' }
    })
    build.onLoad({ filter: /.*/, namespace: 'asset-url' }, args => {
      return { contents: `export default ${JSON.stringify('file://' + args.path)}`, loader: 'js' }
    })
    build.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'css-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: 'export default {}', loader: 'js' }))
  },
}

const result = await build({
  entryPoints: ['src/app/App.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'browser',
  target: 'es2022',
  plugins: [assetPlugin],
})

const code = result.outputFiles[0].text
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost:5173/?lab=1&z=1&mode=x64',
  pretendToBeVisual: true,
})
const { window } = dom
const root = process.cwd()
globalThis.window = window
globalThis.document = window.document
globalThis.HTMLElement = window.HTMLElement
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.localStorage = window.localStorage
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = id => clearTimeout(id)

// fetch: отдаём файлы из репозитория (в том числе file://-URL ассетов)
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const href = String(url)
  if (href.startsWith('data:') || href.startsWith('blob:')) return realFetch(url, init)
  const rel = href.replace(/^file:\/\//, '').replace(`${root}/`, '')
  if (!existsSync(rel)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
  const buffer = readFileSync(rel)
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  }
}

const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const { App } = await import(dataUrl)
new App(document.getElementById('app'))

const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitFor = async (check, label, timeout = 60000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (check()) return true
    await sleep(80)
  }
  console.log(`TIMEOUT ${label}`)
  return false
}
const errors = []
window.addEventListener('error', e => errors.push(String((e.error && e.error.stack) || e.message).split('\n')[0]))
window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + String(e.reason).split('\n')[0]))

const press = (key, opts = {}) => {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }))
}
const status = () => document.querySelector('.controlpanel__status')?.textContent ?? ''

await waitFor(() => /готово|не загрузился/.test(status()), 'init')

const check = (label, ok, extra = '') => console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)

check('монтаж: topbar', Boolean(document.querySelector('.topbar')))
check('монтаж: редактор', Boolean(document.querySelector('.code-editor__input')))
check('монтаж: дизассемблер', Boolean(document.querySelector('.panel--disasm')))
check('монтаж: регистры', Boolean(document.querySelectorAll('.regtable__row').length >= 9))
check('монтаж: флаги', document.querySelectorAll('.flags__row .flag').length === 8)
check('монтаж: стек', Boolean(document.querySelector('.panel--stack')))
check('монтаж: память', Boolean(document.querySelector('.panel--memory')))
check('монтаж: консоль', Boolean(document.querySelector('.console__output')))
check('нет селектора лабораторной', document.querySelectorAll('select').length === 1, `${document.querySelectorAll('select').length} select`)
check('нет текста задания', !document.querySelector('.restrictions__task'))
check('ограничения из ссылки', Boolean(document.querySelector('.restrictions__chips .chip')))
check('статус инициализации', status() === 'готово', status())

// ── компиляция ──
press('Enter', { ctrlKey: true })
await waitFor(() => /собрано|ошибок|NASM|ld|нарушений/.test(status()), 'compile')
check('компиляция', status() === 'собрано', status())
check('дизассемблер заполнен', document.querySelectorAll('.disasm__row').length > 3, `${document.querySelectorAll('.disasm__row').length} строк`)

const cell = name =>
  [...document.querySelectorAll('.regtable__row')]
    .map(r => [...r.querySelectorAll('span')].map(c => c.textContent.trim()))
    .find(row => row[0] === name)

// ── шаг ──
const currentBefore = document.querySelector('.disasm__row.is-current .disasm__address')?.textContent
press('F10')
await waitFor(() => document.querySelector('.disasm__row.is-current .disasm__address')?.textContent !== currentBefore, 'step', 15000)
const currentAfter = document.querySelector('.disasm__row.is-current .disasm__address')?.textContent
check('шаг меняет IP', currentBefore !== currentAfter, `${currentBefore} → ${currentAfter}`)

// ── запуск до конца ──
press('F5')
await waitFor(() => /завершено|код /.test(status()), 'run')
check('запуск завершён', /завершено|код /.test(status()), status())
const rax = cell('AX')
// в конце примера выполняется mov ax, 60 (sys_exit) — это ожидаемо
check('RAX = 0x3C после запуска', (rax?.[1] ?? '').toUpperCase().endsWith('3C'), (rax ?? []).join(' | '))
const rbx = cell('BX')
check('RBX = 24 (AX*4)', (rbx?.[1] ?? '').toUpperCase().endsWith('18'), (rbx ?? []).join(' | '))
check('флаги обновлены', document.querySelector('.flags__hex')?.textContent !== '00000000')
check(
  'память заполнена',
  document.querySelectorAll('.memory__row').length > 4,
  `${document.querySelectorAll('.memory__row').length} строк, адрес ${document.querySelector('.memory .panel__badge')?.textContent ?? document.querySelectorAll('.panel--memory .panel__badge')[0]?.textContent}`,
)

// ── нарушение ограничений ловится до компиляции ──
const input = document.querySelector('.code-editor__input')
input.value = 'bits 64\nsection .text\nglobal _start\n_start:\n    mov cx, 5\n    syscall\n'
input.dispatchEvent(new window.Event('input', { bubbles: true }))
press('Enter', { ctrlKey: true })
await sleep(400)
check('нарушение поймано', /нарушений: [1-9]/.test(status()), status())
check('нарушение показано', document.querySelectorAll('.violation').length > 0)

if (errors.length) console.log('ОШИБКИ JS:\n  ' + errors.slice(0, 5).join('\n  '))
console.log('done')
process.exit(0)
