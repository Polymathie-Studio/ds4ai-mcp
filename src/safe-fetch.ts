/**
 * A guarded fetcher for auditing arbitrary live URLs. It turns a URL into a
 * bounded, vetted HTML string, or throws UnsafeUrlError. Zero-dependency, Node
 * built-ins only.
 *
 * This is Stage 1 of the two-stage auditor shape: a hostile-network-facing,
 * keyless fetcher whose only job is to hand the pure static auditor a safe string.
 * It enforces, all together because any one alone is bypassable:
 *
 *  - an http and https scheme allowlist (file:, gopher:, data:, and the rest are
 *    refused before any network call);
 *  - resolve, then check, then pin: the hostname is resolved here, every resolved
 *    address is checked against loopback, private, link-local, unique-local, CGNAT,
 *    and cloud-metadata ranges, and the connection is dialed to the one vetted IP
 *    while the real Host header is sent, which closes DNS rebinding because the IP
 *    that was checked is the IP that is dialed;
 *  - manual, re-validated, capped redirects: every hop re-runs the full scheme and
 *    IP check, and the chain is short;
 *  - a total time budget, a streamed response-size cap, and a decompression cap.
 *
 * The fetcher carries no credential to the audited origin, and it treats the body
 * as inert bytes to parse, never to execute and never to hand to a model.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { request as httpRequest } from 'node:http'
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib'
import { Readable } from 'node:stream'

const MAX_REDIRECTS = 5
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB of decompressed HTML is ample
const TIME_BUDGET_MS = 10_000
const UA = 'ds4ai-mcp/conformance (+https://github.com/Polymathie-Studio/ds4ai-mcp)'

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

// Reject any address that is not a normal public one. Numeric-range checks, so
// obfuscations (0x7f.0.0.1, 2130706433, 127.1, ::ffff:127.0.0.1) normalize and are
// caught, rather than string matching that they trivially evade.
function v4Forbidden(ip: string): boolean {
  const p = ip.split('.').map((n) => Number(n))
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  if (a === 0) return true // 0.0.0.0/8 this-network
  if (a === 10) return true // private
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, includes 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10, includes Alibaba metadata 100.100.100.200
  if (a === 168 && b === 63 && p[2] === 129 && p[3] === 16) return true // Azure WireServer, a public-range metadata host
  if (a >= 224) return true // multicast and reserved
  return false
}

// Expand any IPv6 literal to its sixteen bytes, so ranges are checked numerically
// rather than by string form (the URL parser may hand back an IPv4-mapped address in
// hex, ::ffff:7f00:1, which no dotted-quad string match would catch).
function v6ToBytes(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/) // embedded IPv4 tail
  if (dotted) {
    const q = dotted[1].split('.').map((n) => Number(n))
    if (q.length !== 4 || q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
    const h1 = (((q[0] << 8) | q[1]) >>> 0).toString(16)
    const h2 = (((q[2] << 8) | q[3]) >>> 0).toString(16)
    s = s.slice(0, s.length - dotted[1].length) + h1 + ':' + h2
  }
  const parts = s.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':') : []
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : []
  let groups: string[]
  if (parts.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null
  const bytes: number[] = []
  for (const g of groups) {
    const n = parseInt(g || '0', 16)
    if (Number.isNaN(n) || n < 0 || n > 0xffff) return null
    bytes.push((n >> 8) & 255, n & 255)
  }
  return bytes
}

function v6Forbidden(ip: string): boolean {
  const b = v6ToBytes(ip)
  if (!b) return true // unparseable: refuse
  const first10Zero = b.slice(0, 10).every((x) => x === 0)
  if (first10Zero && b[10] === 0xff && b[11] === 0xff) return v4Forbidden(b.slice(12).join('.')) // ::ffff:0:0/96 mapped
  if (b.slice(0, 12).every((x) => x === 0)) {
    const last = b.slice(12)
    if (last.every((x) => x === 0)) return true // ::
    if (last[0] === 0 && last[1] === 0 && last[2] === 0 && last[3] === 1) return true // ::1 loopback
    return v4Forbidden(last.join('.')) // ::x.x.x.x compatible: judge the embedded v4
  }
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true // fe80::/10 link-local
  if ((b[0] & 0xfe) === 0xfc) return true // fc00::/7 unique-local
  if (b[0] === 0xff) return true // multicast
  // Transition mechanisms that tunnel or embed an IPv4 address: decode and judge it.
  if (b[0] === 0x20 && b[1] === 0x02) return v4Forbidden([b[2], b[3], b[4], b[5]].join('.')) // 6to4 2002::/16
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return v4Forbidden([b[12], b[13], b[14], b[15]].join('.')) // NAT64 64:ff9b::/96
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true // Teredo 2001:0000::/32, obfuscated embedding: refuse outright
  return false
}

function ipForbidden(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return v4Forbidden(ip)
  if (v === 6) return v6Forbidden(ip)
  return true // unrecognizable: refuse
}

async function resolvePinned(hostname: string): Promise<string> {
  if (isIP(hostname)) {
    if (ipForbidden(hostname)) throw new UnsafeUrlError(`refused address: ${hostname}`)
    return hostname
  }
  const results = await lookup(hostname, { all: true })
  if (!results.length) throw new UnsafeUrlError(`no address for ${hostname}`)
  for (const { address } of results) {
    if (ipForbidden(address)) throw new UnsafeUrlError(`${hostname} resolves to a forbidden address (${address})`)
  }
  return results[0].address
}

type FetchState = { url: URL; redirects: number; started: number }

async function step(state: FetchState): Promise<string> {
  const { url } = state
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrlError(`refused scheme: ${url.protocol}`)
  if (Date.now() - state.started > TIME_BUDGET_MS) throw new UnsafeUrlError('time budget exceeded')

  const host = url.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets for resolution
  const pinnedIp = await resolvePinned(host)

  const isHttps = url.protocol === 'https:'
  const requestFn = isHttps ? httpsRequest : httpRequest
  const port = url.port ? Number(url.port) : isHttps ? 443 : 80
  const remaining = Math.max(1, TIME_BUDGET_MS - (Date.now() - state.started))

  const opts: RequestOptions = {
    host: pinnedIp, // dial the vetted IP, not the hostname
    servername: isHttps ? host : undefined, // SNI and cert validation against the real host
    port,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      Host: url.host, // the real host for virtual hosting
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml',
      // Ask for no compression, so the wire size equals the body size and the size
      // cap fully bounds memory. A non-compliant server that compresses anyway is
      // still handled and guarded below; this just removes the bomb surface by default.
      'accept-encoding': 'identity',
    },
    timeout: remaining,
  }

  const result = await new Promise<{ redirectTo?: URL; body?: string }>((resolve, reject) => {
    // A hard deadline destroys the request after the remaining budget no matter what,
    // so a slow-drip body that keeps resetting the socket idle timeout still cannot
    // hold the connection past the total time budget. The settle guard makes ok and
    // fail idempotent and clears the deadline once the request is done.
    let settled = false
    let deadline: NodeJS.Timeout | undefined
    const ok = (v: { redirectTo?: URL; body?: string }) => { if (settled) return; settled = true; clearTimeout(deadline); resolve(v) }
    const fail = (e: unknown) => { if (settled) return; settled = true; clearTimeout(deadline); reject(e) }
    const req = requestFn(opts, (r) => {
      const status = r.statusCode ?? 0
      if (status >= 300 && status < 400 && r.headers.location) {
        r.resume() // drain
        let next: URL
        try { next = new URL(r.headers.location, url) } catch { return fail(new UnsafeUrlError('bad redirect location')) }
        return ok({ redirectTo: next })
      }
      if (status < 200 || status >= 300) { r.resume(); return fail(new UnsafeUrlError(`upstream status ${status}`)) }

      const enc = String(r.headers['content-encoding'] || '').trim().toLowerCase()
      // Refuse layered encodings (gzip, gzip): a nested-bomb vector.
      if (enc.includes(',')) { r.resume(); return fail(new UnsafeUrlError('layered content-encoding refused')) }
      // maxOutputLength bounds a single output chunk (it is per-chunk on a stream, not
      // a total), so the real defense against a decompression bomb is the streaming
      // tally below, which destroys the decoder once the cumulative output exceeds the
      // cap. This is the belt to that suspenders.
      const zopts = { maxOutputLength: MAX_BYTES }
      let stream: Readable = r
      if (enc === 'gzip') stream = r.pipe(createGunzip(zopts))
      else if (enc === 'deflate') stream = r.pipe(createInflate(zopts))
      else if (enc === 'br') stream = r.pipe(createBrotliDecompress(zopts))
      else if (enc && enc !== 'identity') { r.resume(); return fail(new UnsafeUrlError(`unsupported content-encoding: ${enc}`)) }

      // When decompressing, also cap the raw compressed bytes read off the wire, so a
      // body that stays under the decompressed cap cannot still be arbitrarily large
      // compressed. destroy the decoder as well as the request so it stops expanding.
      if (stream !== r) {
        let raw = 0
        r.on('data', (c: Buffer) => { raw += c.length; if (raw > MAX_BYTES) { req.destroy(); stream.destroy(); fail(new UnsafeUrlError('compressed body exceeds size cap')) } })
      }
      const chunks: Buffer[] = []
      let total = 0
      stream.on('data', (c: Buffer) => {
        total += c.length
        if (total > MAX_BYTES) { req.destroy(); stream.destroy(); return fail(new UnsafeUrlError('response exceeds size cap')) }
        chunks.push(c)
      })
      stream.on('end', () => ok({ body: Buffer.concat(chunks).toString('utf8') }))
      stream.on('error', (e) => fail(e))
    })
    deadline = setTimeout(() => req.destroy(new UnsafeUrlError('time budget exceeded')), remaining)
    req.on('timeout', () => req.destroy(new UnsafeUrlError('request timed out')))
    req.on('error', fail)
    req.end()
  })

  if (result.redirectTo) {
    if (state.redirects >= MAX_REDIRECTS) throw new UnsafeUrlError('too many redirects')
    return step({ url: result.redirectTo, redirects: state.redirects + 1, started: state.started })
  }
  return result.body ?? ''
}

export async function safeFetchHtml(rawUrl: string): Promise<string> {
  let target: URL
  try { target = new URL(rawUrl) } catch { throw new UnsafeUrlError(`not a URL: ${rawUrl}`) }
  return step({ url: target, redirects: 0, started: Date.now() })
}
