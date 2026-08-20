/*
 * FLEET - the framework-agnostic core. Zero dependencies.
 *
 * Delivery: a build and SSR-time generator for the markup, head tags, and config
 * that make a page load fast and stable against the Core Web Vitals (LCP, CLS,
 * INP). It emits correct strings and audits HTML; it does not, and a zero-
 * dependency primitive cannot, compress images, bundle JavaScript, or set cache
 * headers. Those levers are build-tool and server work; FLEET emits the markup
 * that points at the built assets and generates the config that a host applies.
 *
 * Tier 1: the responsive-image and picture emitter, with reserved dimensions
 * and correct loading, decoding, and fetchpriority scheduling. The LCP image is
 * a special case: mark it priority so it is eager and high-priority, never lazy.
 *
 * License: Apache-2.0.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ESC[c]);

// Emit an <img> with reserved dimensions and correct scheduling. Set width and
// height (or aspect-ratio in CSS) to prevent layout shift. Mark the LCP image
// (the hero, above the fold) with priority: true, so it is eager and high
// priority; mark offscreen images lazy: true. An image that is neither is left
// at the browser default (eager), which is safe for the LCP image.
export function img(d = {}) {
  const a = [`src="${esc(d.src)}"`, `alt="${esc(d.alt || '')}"`];
  if (d.width != null) a.push(`width="${esc(d.width)}"`);
  if (d.height != null) a.push(`height="${esc(d.height)}"`);
  if (d.srcset) a.push(`srcset="${esc(d.srcset)}"`);
  if (d.sizes) a.push(`sizes="${esc(d.sizes)}"`);
  a.push(`decoding="${esc(d.decoding || 'async')}"`);
  if (d.priority) a.push('loading="eager"', 'fetchpriority="high"');
  else if (d.lazy) a.push('loading="lazy"');
  if (d.className) a.push(`class="${esc(d.className)}"`);
  if (d.id) a.push(`id="${esc(d.id)}"`);
  return `<img ${a.join(' ')}>`;
}

// Emit a <picture> for format negotiation (and art direction). Pass avif and/or
// webp as shortcuts for type-negotiated sources, or a sources array of
// { srcset, type, media, sizes } for full control; the fallback <img> is built
// from the same data (src, alt, width, height, loading, etc.).
export function picture(d = {}) {
  const sources = [];
  const add = (srcset, type) => { if (srcset) sources.push({ srcset, type }); };
  add(d.avif, 'image/avif');
  add(d.webp, 'image/webp');
  for (const s of (d.sources || [])) sources.push(s);
  const rendered = sources.map((s) => {
    const sa = [`srcset="${esc(s.srcset)}"`];
    if (s.type) sa.push(`type="${esc(s.type)}"`);
    if (s.media) sa.push(`media="${esc(s.media)}"`);
    if (s.sizes) sa.push(`sizes="${esc(s.sizes)}"`);
    return `  <source ${sa.join(' ')}>`;
  });
  return `<picture>\n${rendered.join('\n')}${rendered.length ? '\n' : ''}  ${img(d)}\n</picture>`;
}

// Build a srcset string from a base path and a list of widths, given a naming
// pattern. By default `photo.jpg` with [400, 800] becomes
// "photo-400.jpg 400w, photo-800.jpg 800w". Pass a name function for other
// schemes. FLEET names the files; your build step still has to produce them.
export function srcset(base, widths = [], name) {
  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? '' : base.slice(dot);
  const fn = name || ((w) => `${stem}-${w}${ext}`);
  return widths.map((w) => `${fn(w)} ${w}w`).join(', ');
}

// --- Tier 2: resource hints, fonts, and cache config ---

// Emit resource-hint <link> tags from a list of { rel, href, as, type,
// crossorigin, fetchpriority }. Use preconnect for the few critical origins,
// dns-prefetch for the rest, preload with a correct `as` (and crossorigin for
// fonts) for late-discovered critical assets, and modulepreload for ES modules.
export function hints(list = []) {
  return list.map((h) => {
    const a = [`rel="${esc(h.rel)}"`, `href="${esc(h.href)}"`];
    if (h.as) a.push(`as="${esc(h.as)}"`);
    if (h.type) a.push(`type="${esc(h.type)}"`);
    if (h.crossorigin != null && h.crossorigin !== false) {
      a.push(h.crossorigin === true ? 'crossorigin' : `crossorigin="${esc(h.crossorigin)}"`);
    }
    if (h.fetchpriority) a.push(`fetchpriority="${esc(h.fetchpriority)}"`);
    return `<link ${a.join(' ')}>`;
  }).join('\n');
}

export const preconnect = (href, crossorigin) => hints([{ rel: 'preconnect', href, crossorigin }]);
export const dnsPrefetch = (href) => hints([{ rel: 'dns-prefetch', href }]);
export const preload = (href, as, opts = {}) => hints([{ rel: 'preload', href, as, ...opts }]);
export const modulePreload = (href) => hints([{ rel: 'modulepreload', href }]);

// Emit a font preload link. Fonts are CORS-mode fetches, so crossorigin is
// required, or the browser fetches the font twice.
export function fontPreload(href, opts = {}) {
  return hints([{ rel: 'preload', href, as: 'font', type: opts.type || 'font/woff2', crossorigin: opts.crossorigin || true }]);
}

// Build an @font-face CSS block (returned as CSS text, not a head tag). Set
// font-display to control the swap; use the metric overrides on a fallback face
// so swapping in the web font does not shift layout. Computing the exact
// size-adjust value requires measuring both fonts; pass it in.
export function fontFace(d = {}) {
  const lines = ['@font-face {', `  font-family: ${d.family};`];
  if (d.src) lines.push(`  src: ${d.src};`);
  lines.push(`  font-display: ${d.display || 'swap'};`);
  if (d.weight) lines.push(`  font-weight: ${d.weight};`);
  if (d.style) lines.push(`  font-style: ${d.style};`);
  if (d.sizeAdjust) lines.push(`  size-adjust: ${d.sizeAdjust};`);
  if (d.ascentOverride) lines.push(`  ascent-override: ${d.ascentOverride};`);
  if (d.descentOverride) lines.push(`  descent-override: ${d.descentOverride};`);
  if (d.lineGapOverride) lines.push(`  line-gap-override: ${d.lineGapOverride};`);
  lines.push('}');
  return lines.join('\n');
}

// Generate cache-header config for a named host. The correct pattern is to
// revalidate HTML on every load and to cache content-hashed static assets for a
// year as immutable, so a byte change (a new hash) busts the cache safely.
// FLEET writes the config; the host applies it. Targets: netlify, vercel, nginx.
export function cacheHeaders(target = 'netlify', opts = {}) {
  const assetGlob = opts.assetGlob || '/assets/*';
  const immutable = opts.immutable || 'public, max-age=31536000, immutable';
  const html = opts.html || 'no-cache';
  if (target === 'netlify') {
    return `${assetGlob}\n  Cache-Control: ${immutable}\n/*.html\n  Cache-Control: ${html}\n`;
  }
  if (target === 'vercel') {
    return JSON.stringify({
      headers: [
        { source: assetGlob.replace(/\*/g, '(.*)'), headers: [{ key: 'Cache-Control', value: immutable }] },
        { source: '/(.*)\\.html', headers: [{ key: 'Cache-Control', value: html }] },
      ],
    }, null, 2);
  }
  if (target === 'nginx') {
    const assetExt = opts.assetExt || 'js|css|woff2|png|jpg|jpeg|svg|avif|webp|gif|ico';
    return `location ~* \\.(${assetExt})$ {\n  add_header Cache-Control "${immutable}";\n}\nlocation ~* \\.html$ {\n  add_header Cache-Control "${html}";\n}\n`;
  }
  throw new Error(`cacheHeaders: unknown target "${target}" (expected netlify, vercel, or nginx)`);
}

// --- Tier 3: the delivery auditor and Speculation Rules ---

// Escape a JSON payload for safe inclusion inside a <script> block.
const scriptJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// Parse the attributes of every tag of one kind in an HTML string. A lightweight
// scan, not a full parser; it reads the served markup, which is the point.
// The attribute span is bounded and the inner scan is single-pass with no
// backtracking (a name, then an optional value), so a hostile <img aaaa...> cannot
// drive the quadratic backtracking the old greedy-name-then-required-= pattern would.
// It also reads unquoted values, not only quoted ones.
function tagAttrs(html, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '\\b([^>]{0,8000})>', 'gi');
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const ar = /([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]*))?/g;
    let a;
    while ((a = ar.exec(m[1]))) {
      if (a[0] === '') { ar.lastIndex++; continue; }
      let v = a[2] || '';
      if (v && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
      attrs[a[1].toLowerCase()] = v;
    }
    out.push(attrs);
  }
  return out;
}

// Collect the inner text of each <tag ...>...</close> in a bounded window, finding
// each opener once, so unclosed-tag spam cannot drive a quadratic re-scan.
function collectBlocks(html, openRe, closeStr, max = 50) {
  const out = [];
  let m, seen = 0;
  while ((m = openRe.exec(html)) && seen < max) {
    seen++;
    const start = m.index + m[0].length;
    const win = html.slice(start, start + 200000);
    const rel = win.indexOf(closeStr);
    out.push(rel >= 0 ? win.slice(0, rel) : win);
  }
  return out;
}

// Audit a page's HTML for the delivery misses, returning
// { ok, errors, warnings, passed }. Delivery issues are advisory, so most land
// as warnings. Audit the served markup: to judge the LCP image, this reads
// source order, since a static scan cannot measure the real LCP element.
export function audit(html = '') {
  // Defense in depth: bound the input the regex passes process.
  if (html.length > 2 * 1024 * 1024) html = html.slice(0, 2 * 1024 * 1024);
  const errors = [], warnings = [], passed = [];
  const warn = (code, message) => warnings.push({ level: 'warning', code, message });
  const pass = (code, message) => passed.push({ level: 'pass', code, message });

  const imgs = tagAttrs(html, 'img');
  const unsized = imgs.filter((t) => !('width' in t) || !('height' in t));
  if (imgs.length && !unsized.length) pass('img-dimensions', 'All images set width and height.');
  else if (unsized.length) warn('img-dimensions', `${unsized.length} of ${imgs.length} images lack width or height; they can shift layout (CLS).`);

  if (imgs.length && imgs[0].loading === 'lazy') warn('lcp-lazy', 'The first image is loading="lazy"; if it is the LCP image this delays it. Mark the LCP image priority (eager, high fetchpriority).');

  const headMatch = html.match(/<head[^>]{0,2000}>([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : html;
  const headScripts = [...headHtml.matchAll(/<script\b([^>]{0,8000})>/gi)].map((m) => m[1]);
  const blocking = headScripts.filter((a) => /\bsrc=/.test(a) && !/\bdefer\b/.test(a) && !/\basync\b/.test(a) && !/type=["']module["']/.test(a) && !/\bnomodule\b/.test(a));
  if (blocking.length) warn('render-blocking', `${blocking.length} script(s) in <head> with a src and neither defer nor async block rendering.`);
  else pass('render-blocking', 'No render-blocking scripts in <head>.');

  const styles = collectBlocks(html, /<style\b[^>]{0,2000}>/gi, '</style>').join('\n');
  const faces = styles.split('@font-face').slice(1);
  const noDisplay = faces.filter((f) => !/font-display/i.test(f.split('}')[0]));
  if (noDisplay.length) warn('font-display', `${noDisplay.length} inline @font-face without font-display; text may hide or shift on load.`);

  return { ok: errors.length === 0, errors, warnings, passed };
}

// Generate a Speculation Rules <script> for prefetch or prerender. Emerging and
// Chromium-only (not Baseline), so ship it as progressive enhancement: it does
// nothing in browsers that do not support it. Inline rules also need a CSP that
// allows them (script-src 'inline-speculation-rules', or a hash or nonce). Pass
// { prefetch, prerender } where each is a rule object or an array of them.
export function speculationRules(rules = {}) {
  const payload = {};
  for (const action of ['prefetch', 'prerender']) {
    if (rules[action]) payload[action] = Array.isArray(rules[action]) ? rules[action] : [rules[action]];
  }
  return `<script type="speculationrules">${scriptJson(payload)}</script>`;
}
