/**
 * Типы для JS-обёртки emscripten (blinkenlib.js).
 * Обёртка экспортирует функцию, возвращающую промис с модулем wasm.
 */
declare const blinkenlib: (moduleArg?: Record<string, unknown>) => Promise<any>
export default blinkenlib
