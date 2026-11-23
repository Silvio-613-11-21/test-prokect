import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/examples/index.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral' });
const code = result.outputFiles[0].text;
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { examples } = await import(dataUrl);

globalThis.window = globalThis;
globalThis.document = { currentScript: null, baseURI: 'file:///tmp/', createElement: () => ({}) };
globalThis.location = { href: 'file:///tmp/' };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
const { default: blinkenlib } = await import('/tmp/blinktest/blinkenlib.js');
const wasmBinary = readFileSync('/tmp/blinktest/blinkenlib.wasm');
let out = '';
const mod = await blinkenlib({ noInitialRun: true, wasmBinary, preRun: (M) => { M.FS.init(() => null, c => { out += String.fromCharCode(c); }, c => { out += String.fromCharCode(c); }); } });
let resolveRun = null;
function sigcb(s, c) { if (s === 5 && c === 40) { setTimeout(() => mod._blinkenlib_preempt_resume(), 0); } else { if (resolveRun) { const r = resolveRun; resolveRun = null; r(); } } }
function exitcb(c) { if (resolveRun) { const r = resolveRun; resolveRun = null; r(); } }
const fp1 = mod.addFunction(sigcb, 'vii'), fp2 = mod.addFunction(exitcb, 'vi');
mod.callMain([String(fp1), String(fp2)]);
const FS = mod.FS;
function writeF(n, d) { const s = FS.open(n, 'w+'); FS.write(s, d, 0, d.length, 0); FS.close(s); FS.chmod(n, 0o777); }
writeF('/assembler', new Uint8Array(readFileSync('/tmp/blinktest/nasm.3.00.elf')));
writeF('/linker', new Uint8Array(readFileSync('/tmp/blinktest/gnu-ld.2.43.50.elf')));
FS.writeFile('/link.ld', `ENTRY(_start)
SECTIONS { PROVIDE(__executable_start = 0x400000); . = 0x400000 + SIZEOF_HEADERS; .note.gnu.property : { *(.note.gnu.property) } . = ALIGN(0x1000); .text : { *(.text .text.*) } . = ALIGN(0x1000); .rodata : { *(.rodata .rodata.*) } . = ALIGN(0x1000) + (. & 0xfff); .data : { *(.data .data.*) } __bss_start = .; .bss : { *(.bss .bss.*) *(COMMON) . = ALIGN(. != 0 ? 8 : 1); } . = ALIGN(8); }`);
function writeStr(ptr, str, max) { const dv = new DataView(mod.wasmExports.memory.buffer); const l = Math.min(str.length, max - 1); for (let i = 0; i < l; i++) dv.setUint8(ptr + i, str.charCodeAt(i)); dv.setUint8(ptr + l, 0); }
function emu(name, args) { return new Promise(res => { resolveRun = res; writeStr(mod._blinkenlib_get_progname_string(), name, 200); writeStr(mod._blinkenlib_get_argc_string(), args.join(' '), 200); writeStr(mod._blinkenlib_get_argv_string(), '', 200); mod._blinkenlib_run_fast(); }); }

let failed = 0;
for (const ex of examples) {
  const is16 = ex.code.includes('bits 16');
  out = '';
  FS.writeFile('/assembly.s', ex.code);
  writeStr(mod._blinkenlib_get_progname_string(), '/assembler', 200);
  writeStr(mod._blinkenlib_get_argc_string(), is16 ? '/assembler -f bin /assembly.s -o /program.bin' : '/assembler -felf64 /assembly.s -o /program.o', 200);
  writeStr(mod._blinkenlib_get_argv_string(), '', 200);
  out = '';
  await new Promise(res => { resolveRun = res; mod._blinkenlib_run_fast(); });
  const nasmLog = out.replace(/\n+/g, '\n').trim();
  let ok = !/error/i.test(nasmLog);
  let detail = '';
  if (ok && !is16) {
    out = '';
    await new Promise(res => { resolveRun = res; writeStr(mod._blinkenlib_get_progname_string(), '/linker', 200); writeStr(mod._blinkenlib_get_argc_string(), '/linker /program.o -o /program -T /link.ld --hash-size=31', 200); mod._blinkenlib_run_fast(); });
    ok = !/error/i.test(out);
    if (!ok) detail = out.trim();
    else {
      writeStr(mod._blinkenlib_get_progname_string(), '/program', 200);
      writeStr(mod._blinkenlib_get_argc_string(), '/program', 200);
      FS.chmod('/program', 0o777);
      out = '';
      const t = await new Promise(res => { resolveRun = res; setTimeout(() => { if (resolveRun) { const r = resolveRun; resolveRun = null; r('timeout'); } }, 3000); mod._blinkenlib_run(); });
      detail = 'run=' + t + ' term=' + JSON.stringify(out.replace(/\n\[программа ожидает ввод\]\n/g, '').trim());
      if (t === 'timeout') ok = false;
    }
  }
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${ex.id.padEnd(16)} ${is16 ? 'x16' : 'x64'} ${detail}`);
  if (!ok) console.log('     log:', nasmLog.slice(0, 400));
}
console.log(failed === 0 ? '\nALL EXAMPLES OK' : `\n${failed} FAILED`);
