import { build } from 'esbuild'
const r = await build({ entryPoints: ['src/app/App.ts'], bundle: true, format: 'esm', write: false, platform: 'browser', logLevel: 'silent',
  plugins: [{name:'x', setup(b){ b.onResolve({filter:/\.(wasm|elf|js)\?url$/}, a=>({path:a.path, namespace:'u'})); b.onLoad({filter:/.*/, namespace:'u'}, a=>({contents:`export default ${JSON.stringify('file://'+process.cwd()+'/'+a.path.replace(/\?url$/,''))}`, loader:'js'})); b.onResolve({filter:/\.css$/}, a=>({path:a.path, namespace:'c'})); b.onLoad({filter:/.*/, namespace:'c'},()=>({contents:'',loader:'js'})); }}]})
const m = /file:\/\/[^"']+blinkenlib\.js/.exec(r.outputFiles[0].text)
const s=r.outputFiles[0].text;
for (const k of ["blinkenlib","nasm.elf","gnu-ld.elf"]) { const i=s.indexOf("file://"); }
console.log('asset string:', m && m[0])
