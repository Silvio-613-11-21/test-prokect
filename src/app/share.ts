/**
 * Ссылки с кодом: исходник сжимается (DecompressionStream/gzip),
 * затем кодируется в url-safe base64.
 *
 * Без сервера, без зависимостей: используется стандартный Compression Streams API,
 * а при его отсутствии ссылка собирается из «сырого» base64-исходника.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

/** Пакет: первый байт — версия/алгоритм (1 = gzip) */
export async function encodeCode(source: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') {
    return '0' + toBase64Url(new TextEncoder().encode(source))
  }
  const compressed = await gzip(source)
  return '1' + toBase64Url(compressed)
}

export async function decodeCode(payload: string | null): Promise<string | null> {
  if (!payload) return null
  const version = payload[0]
  const body = payload.slice(1)
  try {
    const bytes = fromBase64Url(body)
    if (version === '0') return new TextDecoder().decode(bytes)
    if (version === '1') return await gunzip(bytes)
  } catch (error) {
    console.error('Не удалось разобрать код из ссылки', error)
  }
  return null
}
