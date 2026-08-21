/*
 * hasp-guard - the client-surface hardening generator. Zero dependencies.
 *
 * The generator half of the Hardened axis (HASP). It emits the security response
 * headers and the safe-markup helpers a shipped surface should declare to the
 * browser, as server and build configuration. Its auditor counterpart is
 * hardened.js in this repo: hasp-guard writes the posture, hardened.js checks it,
 * and the two are built to agree, a run of hardened.js over hasp-guard's output
 * clears Tiers 1 and 2.
 *
 * Boundary, stated first because it is the whole risk. This writes declared
 * client-surface hardening. It never makes a site secure. Server-side security,
 * authentication, TLS and server configuration, and denial-of-service defense are
 * out of scope and remain the operator's. A generated policy is a starting floor,
 * not a safe site.
 *
 * Two invariants shape what it emits, the same two hardened.js enforces:
 *   1. Well-formed, not merely present. The defaults are effective: a strict CSP
 *      with no 'unsafe-inline' or 'unsafe-eval' (91% of real CSPs undermine
 *      themselves with 'unsafe-inline', per the Web Almanac 2024, so the default
 *      here refuses it), frame-ancestors 'none', object-src 'none', an HSTS
 *      max-age well past the 180-day floor. Inline code is served by nonce or
 *      hash, never by opening the policy.
 *   2. Header over meta. The output is server and build configuration, not a
 *      runtime-injected <meta> tag, because a meta CSP is strictly weaker and HSTS
 *      and frame protection cannot be meta at all.
 *
 * License: Apache-2.0.
 */

// --- Tier 1 centerpiece: an effective Content-Security-Policy. ---
//
// Build a CSP string from strict defaults. Inline script is allowed only through a
// nonce or a hash, never 'unsafe-inline'. Pass opts to widen a directive for real
// dependencies (a CDN, an analytics endpoint) without reopening the whole policy.
//   opts.nonce            a per-response nonce; adds 'nonce-<value>' to script-src.
//   opts.scriptHashes     an array of 'sha256-...' values for known inline scripts.
//   opts.scriptSrc etc.   replace a directive's sources wholesale (arrays of strings).
//   opts.connectSrc, imgSrc, fontSrc, styleSrc, formAction, frameAncestors, defaultSrc.
//   opts.allowInlineStyle add 'unsafe-inline' to style-src (flagged by the auditor
//                         unless a nonce or hash is also present; documented tradeoff).
//   opts.upgradeInsecure  set false to drop upgrade-insecure-requests (default on).
//   opts.directives       an object of extra or overriding directives (arrays; an
//                         empty array emits a valueless directive).
export function csp(opts = {}) {
  const nonce = opts.nonce ? [`'nonce-${opts.nonce}'`] : [];
  const hashes = (opts.scriptHashes || []).map((h) => (/^'/.test(h) ? h : `'${h}'`));
  const d = {
    'default-src': opts.defaultSrc || ["'self'"],
    'script-src': opts.scriptSrc || ["'self'", ...nonce, ...hashes],
    'style-src': opts.styleSrc || ["'self'", ...(opts.allowInlineStyle ? ["'unsafe-inline'"] : [])],
    'img-src': opts.imgSrc || ["'self'", 'data:'],
    'font-src': opts.fontSrc || ["'self'"],
    'connect-src': opts.connectSrc || ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': opts.formAction || ["'self'"],
    'frame-ancestors': opts.frameAncestors || ["'none'"],
  };
  if (opts.upgradeInsecure !== false) d['upgrade-insecure-requests'] = [];
  if (opts.directives && typeof opts.directives === 'object') {
    for (const [k, v] of Object.entries(opts.directives)) d[k] = v;
  }
  return Object.entries(d)
    .map(([k, v]) => (Array.isArray(v) && v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

// The recommended security response headers as a plain object (header name -> value).
// Effective by default: a strict CSP, clickjacking closed two ways (frame-ancestors
// 'none' and X-Frame-Options: DENY), a two-year HSTS with includeSubDomains, nosniff,
// a strict Referrer-Policy, and a closed Permissions-Policy. Cross-origin isolation
// (COOP/COEP/CORP) is opt-in because it can break popups and embeds; hardened.js does
// not penalize its absence.
//   opts passes straight to csp(); plus:
//   opts.hsts               override the Strict-Transport-Security value.
//   opts.hstsPreload        append '; preload' (only set when you will submit to the
//                           preload list; it is hard to reverse).
//   opts.referrerPolicy     override the Referrer-Policy value.
//   opts.permissionsPolicy  override the Permissions-Policy value.
//   opts.frameOptions       override X-Frame-Options (default DENY).
//   opts.crossOriginIsolation  add COOP same-origin, COEP require-corp, CORP same-origin.
export function securityHeaders(opts = {}) {
  const h = {
    'Content-Security-Policy': csp(opts),
    'Strict-Transport-Security': (opts.hsts || 'max-age=63072000; includeSubDomains') + (opts.hstsPreload ? '; preload' : ''),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': opts.frameOptions || 'DENY',
    'Referrer-Policy': opts.referrerPolicy || 'strict-origin-when-cross-origin',
    'Permissions-Policy': opts.permissionsPolicy || 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  };
  if (opts.crossOriginIsolation) {
    h['Cross-Origin-Opener-Policy'] = 'same-origin';
    h['Cross-Origin-Embedder-Policy'] = 'require-corp';
    h['Cross-Origin-Resource-Policy'] = 'same-origin';
  }
  return h;
}

// Emit the security headers as configuration for a named host. hasp-guard writes the
// config; the host applies it. Targets: netlify (_headers), vercel (vercel.json shape),
// nginx (add_header). opts is securityHeaders()'s opts, plus opts.source to scope the
// rule (default all paths).
export function headerConfig(target = 'vercel', opts = {}) {
  const headers = securityHeaders(opts);
  const entries = Object.entries(headers);
  if (target === 'netlify') {
    const source = opts.source || '/*';
    return `${source}\n${entries.map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
  }
  if (target === 'vercel') {
    return JSON.stringify({
      headers: [
        {
          source: opts.source || '/(.*)',
          headers: entries.map(([key, value]) => ({ key, value })),
        },
      ],
    }, null, 2);
  }
  if (target === 'nginx') {
    return entries.map(([k, v]) => `add_header ${k} "${v}" always;`).join('\n') + '\n';
  }
  throw new Error(`headerConfig: unknown target "${target}" (expected netlify, vercel, or nginx)`);
}

// --- Tier 2 markup helpers: safe references in the served HTML. ---

// The rel value a cross-origin target="_blank" link must carry so the opened tab
// cannot navigate the opener (reverse tabnabbing). Merges with any rel already set.
export function safeLinkRel(rel = '') {
  const parts = new Set(rel.split(/\s+/).filter(Boolean));
  parts.add('noopener');
  parts.add('noreferrer');
  return [...parts].join(' ');
}

// Format a Subresource Integrity attribute string for an external script or style.
// Pass a precomputed hash ('sha384-...' or a bare base64 digest with algo). Computing
// the digest from the asset bytes is a build step (see sriHash); this formats the
// attribute the auditor looks for. crossorigin is required for SRI to be enforced.
export function integrityAttr(hash, algo = 'sha384') {
  const value = /^(sha256|sha384|sha512)-/.test(hash) ? hash : `${algo}-${hash}`;
  return `integrity="${value}" crossorigin="anonymous"`;
}

// Compute a Subresource Integrity digest for content, using the platform Web Crypto
// (available in modern browsers and Node). Async by nature. Returns 'sha384-<base64>'.
export async function sriHash(content, algo = 'sha384') {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('sriHash: Web Crypto (crypto.subtle) is not available in this runtime');
  const name = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[algo];
  if (!name) throw new Error(`sriHash: unknown algorithm "${algo}"`);
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const digest = await subtle.digest(name, bytes);
  let bin = '';
  const view = new Uint8Array(digest);
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return `${algo}-${btoa(bin)}`;
}
