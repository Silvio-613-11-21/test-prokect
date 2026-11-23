/**
 * Smoke-тест приложения без браузера: jsdom + собранный бандл.
 * Проверяет, что SPA монтируется, wasm-компилятор срабатывает,
 * ограничения и тема применяются.
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
      const clean = args.path.replace(/\?url$/, '')
      // ../assets/foo относительно src/app => src/assets/foo
      const abs = resolve(args.resolveDir, clean)
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
  external: [],
})

const code = result.outputFiles[0].text
const dom = new JSDOM('<!doctype html><html data-theme="dark"><body><div id="app"></div></body></html>', {
  url: 'http://localhost:5173/?lab=1&z=1&mode=x64',
  pretendToBeVisual: true,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
// navigator в Node только для чтения — пропускаем
globalThis.HTMLElement = window.HTMLElement
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.localStorage = window.localStorage
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = id => clearTimeout(id)
globalThis.URL.createObjectURL = () => 'blob:mock'

// fetch: отдаём файлы из репозитория
const fsMap = {
  'file:///home/user/test-prokect/src/assets/blinkenlib.js': 'src/assets/blinkenlib.js',
  'file:///home/user/test-prokect/src/assets/blinkenlib.wasm': 'src/assets/blinkenlib.wasm',
  'file:///home/user/test-prokect/src/assets/nasm.elf': 'src/assets/nasm.elf',
  'file:///home/user/test-prokect/src/assets/gnu-ld.elf': 'src/assets/gnu-ld.elf',
}
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('data:') || String(url).startsWith('blob:')) return realFetch(url, init)
  const path = fsMap[String(url)]
  if (!path || !existsSync(path)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
  const buffer = readFileSync(path)
  return { ok: true, status: 200, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }
}

// emscripten требует import.meta.url для wasm-пути: подменим глобальный fetch и wasmBinary (передаём вручную)
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const { App } = await import(dataUrl)

const root = document.getElementById('app')
new App(root)

const sleep = ms => new Promise(r => setTimeout(r, ms))
await sleep(1500)

const text = document.body.textContent
console.log('has toolbar:', Boolean(document.querySelector('.toolbar')))
console.log('has editor:', Boolean(document.querySelector('.code-editor__input')))
console.log('has dock:', Boolean(document.querySelector('.dock')))
console.log('status:', document.querySelector('.toolbar__status')?.textContent)
console.log('restriction title:', document.querySelector('.restrictions__title')?.textContent)
console.log('restriction chips:', [...document.querySelectorAll('.restrictions__chips .chip')].slice(0, 8).map(c => c.textContent).join(' '))
console.log('editor lines:', document.querySelector('.code-editor__input')?.value?.split('\n').length)
console.log('gutter cells:', document.querySelectorAll('.code-editor__line-number').length)
console.log('theme:', document.documentElement.dataset.theme)
console.log('app text length:', text.length)

// ── компиляция: Ctrl+Enter ──
const press = (key, opts = {}) => {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
  window.dispatchEvent(event)
}
const waitFor = async (check, label, timeout = 60000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (check()) return true
    await sleep(100)
  }
  console.log(`TIMEOUT waiting ${label}`)
  return false
}

const w = window
w.addEventListener('unhandledrejection', e => console.log('REJECTION', e.reason && (e.reason.stack || e.reason)))
const errors = []
w.addEventListener('error', e => errors.push(String(e.error && e.error.stack || e.message).split('\n').slice(0, 3).join(' | ')))
press('Enter', { ctrlKey: true })
await waitFor(() => /собрано|ошибок|NASM|ld/.test(document.querySelector('.toolbar__status')?.textContent ?? ''), 'compile')
console.log('compile status:', document.querySelector('.toolbar__status')?.textContent)
console.log('disasm rows:', document.querySelectorAll('.disasm__row').length)
const regRows = [...document.querySelectorAll('.registers__row')].slice(0, 6).map(r => r.textContent.trim().replace(/\s+/g, ' '))
console.log('register rows:', regRows.join(' | '))
console.log('stack rows:', document.querySelectorAll('.stack__row').length)
console.log('memory rows:', document.querySelectorAll('.memory__row').length)
console.log('terminal:', document.querySelector('.terminal__output')?.textContent?.replace(/\s+/g, ' ').slice(0, 160))

// ── один шаг: F10 ──
const ripBefore = document.querySelector('.disasm__row.is-current .disasm__address')?.textContent?.trim()
press('F10')
await waitFor(() => (document.querySelector('.disasm__row.is-current .disasm__address')?.textContent?.trim() ?? '') !== (ripBefore ?? ''), 'step', 20000)
console.log('rip before/after step:', ripBefore, '->', document.querySelector('.disasm__row.is-current .disasm__address')?.textContent?.trim())

// ── запуск до конца: F5 ──
press('F5')
await waitFor(() => /завершено|код |остановлено/.test(document.querySelector('.toolbar__status')?.textContent ?? ''), 'run', 60000)
console.log('run status:', document.querySelector('.toolbar__status')?.textContent)
console.log('terminal after run:', document.querySelector('.terminal__output')?.textContent?.replace(/\s+/g, ' ').slice(0, 200))
const cells = name => [...document.querySelectorAll('.registers__row')]
  .map(r => [...r.querySelectorAll('.registers__label, .registers__value')].map(c => c.textContent.trim()))
  .find(row => row[0] === name)
console.log('RAX (64/32/16/hi/lo):', (cells('RAX') ?? []).join(' | '))
console.log('RBX (64/32/16/hi/lo):', (cells('RBX') ?? []).join(' | '))
const rbx64 = (cells('RBX') ?? [])[1] ?? ''
console.log('RBX == 0x18:', rbx64.toUpperCase().endsWith('18') ? 'OK' : 'FAIL')

// ── 16-битный режим: компиляция в .bin без запуска ──
const modeSelect = document.querySelector('[data-role="mode"], .toolbar select')
document.querySelectorAll('.toolbar select').forEach(select => {
  if ([...select.options].some(option => option.value === 'x16')) {
    select.value = 'x16'
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  }
})
await sleep(200)
press('Enter', { ctrlKey: true })
await waitFor(() => /собрано|x16|ошибок/.test(document.querySelector('.toolbar__status')?.textContent ?? ''), 'x16 compile')
console.log('x16 compile status:', document.querySelector('.toolbar__status')?.textContent)
console.log('x16 terminal:', document.querySelector('.terminal__output')?.textContent?.replace(/\s+/g, ' ').slice(-120))
// запуск в 16-битном режиме запрещён
press('F5')
await sleep(300)
console.log('x16 run status:', document.querySelector('.toolbar__status')?.textContent)
console.log('x16 run hint:', document.querySelector('.terminal__output')?.textContent?.replace(/\s+/g, ' ').slice(-110))

// ── нарушение ограничений ловится до компиляции ──
const input = document.querySelector('.code-editor__input')
input.value = 'bits 64\ndefault rel\nsection .text\nglobal _start\n_start:\n    mov cx, 5\n    syscall\n'
input.dispatchEvent(new window.Event('input', { bubbles: true }))
press('Enter', { ctrlKey: true })
await sleep(400)
console.log('violation status:', document.querySelector('.toolbar__status')?.textContent)
console.log('violation list:', [...document.querySelectorAll('.violation .violation__body strong')].map(n => n.textContent).join(' ; '))

if (errors.length) console.log('errors:', errors.slice(0, 4).join('\n  '))
process.exit(0)
