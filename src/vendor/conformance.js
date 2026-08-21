/*
 * MISSING - the conformance auditor. Zero dependencies.
 *
 * A breadth pass over a shipped surface's HTML, one headline check-set per
 * invisible-correctness axis, returning a structured per-axis report. It follows
 * the family's honesty principle: it declares the axes it cannot check from a
 * static HTML snapshot rather than reporting them clean. For depth on findability
 * and delivery, run the primitive's own auditor (beacon-ui, fleet-ui); this tool
 * is the whole-surface breadth, the primitives are the per-axis depth.
 *
 * Audit the served HTML: to judge what the non-JS consumers see, and to see the
 * render gate honestly, pass the raw server response, not a post-JS DOM string.
 *
 * License: Apache-2.0.
 */

// The attribute span is bounded ({0,8000}), and the inner scan is single-pass with
// no backtracking (a name, then an optional value), so a hostile tag like
// <meta aaaa...> cannot drive the quadratic backtracking a greedy name-then-required-=
// pattern would. It also reads unquoted values, not only quoted ones.
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
    out.push({ attrs, raw: m[1] });
  }
  return out;
}

// Linear helpers that replace the greedy lazy-scan matchAll patterns, which went
// quadratic on many unclosed <title>/<button> tags. Each opening tag is found once
// and its close is looked for in a bounded window, so there is no per-start re-scan.
function firstTitleText(html) {
  const m = /<title\b[^>]{0,2000}>/i.exec(html);
  if (!m) return '';
  const start = m.index + m[0].length;
  const end = html.indexOf('</title>', start);
  return (end >= 0 ? html.slice(start, end) : html.slice(start, start + 5000)).trim();
}

function namelessButtonCount(html) {
  let count = 0, seen = 0;
  const openRe = /<button\b([^>]{0,4000})>/gi;
  let m;
  while ((m = openRe.exec(html)) && seen < 2000) {
    seen++;
    if (/aria-label\s*=/i.test(m[1])) continue;
    const start = m.index + m[0].length;
    const win = html.slice(start, start + 2000);
    const rel = win.indexOf('</button>');
    const inner = rel >= 0 ? win.slice(0, rel) : win;
    if (!inner.replace(/<[^>]{0,2000}>/g, '').trim()) count++;
  }
  return count;
}

const finding = (level, code, message) => ({ level, code, message });

// Normalize a URL for identity comparison: drop the hash, lowercase the host, and
// treat a bare origin and its trailing slash as the same. Returns the input on parse
// failure so a comparison degrades to a literal one rather than throwing.
function normalizeUrl(u, base) {
  try {
    const url = new URL(u, base);
    url.hash = '';
    let s = url.origin.toLowerCase() + url.pathname + url.search;
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return u;
  }
}

// --- Perceivable (TEMPER): partial. Contrast needs rendered colors. ---
function perceivable(html) {
  const findings = [];
  const viewport = tagAttrs(html, 'meta').find((t) => t.attrs.name === 'viewport');
  if (viewport && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\D|$)/i.test(viewport.attrs.content || '')) {
    findings.push(finding('warning', 'zoom-disabled', 'The viewport disables zoom (user-scalable=no or maximum-scale=1); this fails perceivability for low-vision readers.'));
  }
  return { checked: 'partial', notChecked: 'Two perceivable checks need more than a static snapshot. Color contrast needs the rendered colors: run TEMPER contrast() against your palette. No-meaning-by-color-alone needs the palette or the rendered page: check that meaning-bearing colors such as the statuses stay separable by luminance (TEMPER simulatedContrast in mono), and that any color-coded meaning also carries a label or an icon.', findings };
}

// --- Operable (GRASP): static accessibility checks. ---
function operable(html) {
  const findings = [];
  const divButtons = (html.match(/<(?:div|span)\b[^>]{0,8000}\bonclick=/gi) || []).length;
  if (divButtons) findings.push(finding('error', 'div-button', `${divButtons} div or span element(s) with onclick; a control should be a <button>, which is focusable and keyboard-operable.`));

  const inputs = tagAttrs(html, 'input').filter((t) => !['hidden', 'submit', 'button', 'image'].includes((t.attrs.type || 'text').toLowerCase()) && (t.attrs['aria-hidden'] || '').toLowerCase() !== 'true');
  const unlabeled = inputs.filter((t) => !t.attrs['aria-label'] && !t.attrs['aria-labelledby'] && !t.attrs.id);
  if (unlabeled.length) findings.push(finding('warning', 'input-unlabeled', `${unlabeled.length} input(s) with no id, aria-label, or aria-labelledby; likely unlabeled to a screen reader.`));

  const nameless = namelessButtonCount(html);
  if (nameless) findings.push(finding('warning', 'button-no-name', `${nameless} button(s) with no text and no aria-label; they have no accessible name.`));

  if (findings.length === 0) findings.push(finding('pass', 'operable', 'No div-button, unlabeled-input, or nameless-button issues found in the served markup.'));
  return { checked: true, findings };
}

// --- Off-happy-path (LUCID/GRACE): not statically checkable. ---
function offHappyPath() {
  return { checked: false, notChecked: 'The loading, empty, error, and 404 states are not visible in a single happy-path render, so a static snapshot cannot verify them. Check them by driving the surface into each state.', findings: [] };
}

// --- Hardened (HASP): headline client-surface hardening; run the hardened auditor
// (hardened.js) for the full header effectiveness and markup-integrity checks. The
// secrets altitude always runs on the HTML; the header altitude runs only when the
// response headers are given, and is declared not-checked otherwise. ---
function hardened(html, opts = {}) {
  const findings = [];
  const patterns = [
    ['openai-anthropic', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
    ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['github-token', /\bgh[ps]_[A-Za-z0-9]{36}\b/],
    ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ];
  for (const [code, re] of patterns) {
    if (re.test(html)) findings.push(finding('error', 'exposed-key', `A string matching a ${code} was found in the served markup; a key must never reach the client bundle. Hold it with HASP (hasp-key) or keep it server-side.`));
  }

  // The header altitude, headline only (presence, not effectiveness). Effectiveness is
  // the depth auditor's job. Without response headers this cannot be seen, so it is
  // declared rather than reported clean.
  let notChecked;
  const H = {};
  if (opts.headers && typeof opts.headers === 'object') for (const k of Object.keys(opts.headers)) H[k.toLowerCase()] = String(opts.headers[k]);
  if (Object.keys(H).length > 0) {
    const csp = H['content-security-policy'];
    if (!csp) findings.push(finding('warning', 'csp-missing', 'No Content-Security-Policy response header; the page has no declared defense against injected content.'));
    if (!(csp && /frame-ancestors\s+/i.test(csp)) && !/^(deny|sameorigin)$/i.test((H['x-frame-options'] || '').trim())) findings.push(finding('warning', 'clickjacking', 'No clickjacking protection (frame-ancestors or X-Frame-Options).'));
    if (!H['strict-transport-security']) findings.push(finding('warning', 'hsts-missing', 'No Strict-Transport-Security header.'));
    if ((H['x-content-type-options'] || '').toLowerCase().trim() !== 'nosniff') findings.push(finding('warning', 'nosniff-missing', 'No X-Content-Type-Options: nosniff.'));
  } else {
    notChecked = 'The header altitude (Content-Security-Policy, clickjacking protection, HSTS, nosniff, and the rest) needs the response headers, which were not provided. Pass opts.headers, and run the hardened auditor for header effectiveness and markup integrity.';
  }

  if (findings.length === 0 && !notChecked) findings.push(finding('pass', 'hardened', 'No exposed keys, and the headline hardening headers are present.'));
  const axis = { checked: Object.keys(H).length > 0 ? true : 'partial', deeper: 'the hardened auditor (hardened.js) for header effectiveness and markup integrity', findings };
  if (notChecked) axis.notChecked = notChecked;
  return axis;
}

// --- Findability (BEACON): headline checks; run beacon-ui audit for depth. ---
function findability(html, opts = {}) {
  const findings = [];
  const metas = tagAttrs(html, 'meta');
  const byName = (n) => metas.find((t) => t.attrs.name === n);
  const byProp = (p) => metas.find((t) => t.attrs.property === p);
  const title = firstTitleText(html);
  if (!title) findings.push(finding('error', 'title', 'No non-empty <title>.'));
  if (!byName('description')) findings.push(finding('warning', 'description', 'No meta description.'));

  const htmlTag = tagAttrs(html, 'html')[0];
  if (!htmlTag || !(htmlTag.attrs.lang || '').trim()) findings.push(finding('warning', 'html-lang', 'No lang on <html>; set a valid BCP 47 language so assistive tech can pronounce the page and machines can detect its language.'));

  const canonical = tagAttrs(html, 'link').find((t) => (t.attrs.rel || '').split(/\s+/).includes('canonical'));
  if (!canonical) findings.push(finding('warning', 'canonical', 'No rel=canonical.'));
  if (!byProp('og:image')) findings.push(finding('warning', 'open-graph', 'No og:image; social and AI previews degrade.'));

  // Identity round-trip: the canonical URL, og:url, and the served URL are one claim,
  // and drift between them sends a consumer contradictory identity.
  const canonHref = canonical && canonical.attrs.href;
  const ogUrl = byProp('og:url');
  if (canonHref && ogUrl && ogUrl.attrs.content && normalizeUrl(canonHref, opts.url) !== normalizeUrl(ogUrl.attrs.content, opts.url)) {
    findings.push(finding('warning', 'identity-og-canonical', 'The canonical URL and og:url name different URLs; they must agree, or a consumer gets contradictory identity.'));
  }
  if (canonHref && opts.url && normalizeUrl(canonHref, opts.url) !== normalizeUrl(opts.url)) {
    findings.push(finding('info', 'identity-canonical-elsewhere', 'The page names a canonical URL different from the one served; confirm this cross-URL canonicalization is intended.'));
  }

  if (findings.length === 0) findings.push(finding('pass', 'findability', 'Title, description, lang, canonical, and og:image present and self-consistent.'));
  return { checked: true, deeper: 'beacon-ui audit(html)', findings };
}

// --- Delivery (FLEET): headline checks; run fleet-ui audit for depth. ---
function delivery(html) {
  const findings = [];
  const imgs = tagAttrs(html, 'img');
  const unsized = imgs.filter((t) => !('width' in t.attrs) || !('height' in t.attrs));
  if (unsized.length) findings.push(finding('warning', 'img-dimensions', `${unsized.length} of ${imgs.length} images lack width or height (layout shift).`));
  if (imgs.length && imgs[0].attrs.loading === 'lazy') findings.push(finding('warning', 'lcp-lazy', 'The first image is loading="lazy"; if it is the LCP image this delays it.'));
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : html;
  const blocking = [...headHtml.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]).filter((a) => /\bsrc=/.test(a) && !/\bdefer\b/.test(a) && !/\basync\b/.test(a) && !/type=["']module["']/.test(a) && !/\bnomodule\b/i.test(a));
  if (blocking.length) findings.push(finding('warning', 'render-blocking', `${blocking.length} render-blocking script(s) in <head>.`));
  if (findings.length === 0) findings.push(finding('pass', 'delivery', 'Images sized, no lazy first image, no render-blocking head scripts.'));
  return { checked: true, deeper: 'fleet-ui audit(html)', findings };
}

// Audit a shipped surface's HTML across all six axes. Returns
// { ok, axes: { <axis>: { checked, notChecked?, deeper?, findings } } }.
// ok is true when no finding is an error; axes marked checked:false or 'partial'
// are declared, not counted as clean. opts.url, the URL the HTML was served from,
// enables the identity round-trip (canonical versus the served URL). opts.headers, the
// response headers, enables the header altitude of the hardened axis; without it that
// altitude is declared not-checked. A `truncated` note is added when the input exceeded
// the audit bound and the report is partial.
export function audit(html = '', opts = {}) {
  // Defense in depth against a pathological page: bound the input the regex passes
  // process, so no scan runs unbounded even if a future pattern is not fully linear.
  // Declare the truncation rather than silently returning a partial report as clean,
  // which is the overclaiming this standard exists to prevent.
  const MAX_AUDIT_LENGTH = 2 * 1024 * 1024;
  const truncated = html.length > MAX_AUDIT_LENGTH;
  if (truncated) html = html.slice(0, MAX_AUDIT_LENGTH);
  const axes = {
    perceivable: perceivable(html),
    operable: operable(html),
    offHappyPath: offHappyPath(),
    hardened: hardened(html, opts),
    findability: findability(html, opts),
    delivery: delivery(html),
  };
  const hasError = Object.values(axes).some((a) => a.findings.some((f) => f.level === 'error'));
  const result = { ok: !hasError, axes };
  if (truncated) result.truncated = `The input exceeded ${MAX_AUDIT_LENGTH} bytes and was truncated for the audit; anything past that point was not seen, so this report is partial. Audit a smaller surface or split the page.`;
  return result;
}

// --- The conformance report: placing a surface on the internal evidence ladder. ---
//
// audit() answers "what did a static pass find". report() answers the standard's two
// questions: breadth (does the surface reach MISSING Conformant across all six axes)
// and evidence (what rung, self-reported / re-provable / audited, each axis stands on).
// Every axis a report names carries a defined, re-runnable check, so a report is itself
// the re-provable artifact, the rung that faces outward: publish it and an outsider can
// re-run report() against the surface and reconcile() it against the claim.
//
// An axis reaches AUDITED when its defined check was applied and a result recorded: the
// auditor applied it in full (checked === true), or a proven error settled it as a fail,
// or a human applied the axis's stated procedure and passed the result in via opts.results
// (e.g. { perceivable: 'pass', offHappyPath: 'pass' }). Otherwise the check is named but
// not yet applied for this surface, and the axis stands at RE-PROVABLE. It never claims
// a rung the tool did not derive; describe, do not rank.

const RUNG_ORDER = { 'self-reported': 0, 're-provable': 1, audited: 2 };

const CHECKS = {
  perceivable: 'conformance.js perceivable() plus TEMPER contrast() against the palette',
  operable: 'conformance.js operable()',
  offHappyPath: 'the stated procedure: drive the surface into the loading, empty, error, and not-found states',
  hardened: 'conformance.js hardened() plus hardened.js (header effectiveness and markup integrity)',
  findability: 'conformance.js findability() plus beacon-ui audit()',
  delivery: 'conformance.js delivery() plus fleet-ui audit()',
};

function overallLine({ of, passed, failed, reProvable, earned }) {
  if (earned) return `MISSING Conformant, audited: all ${of} axes carry a passing audited result.`;
  const parts = [`audited and passing on ${passed} of ${of} axes`];
  if (failed) parts.push(`${failed} audited and failing`);
  if (reProvable) parts.push(`${reProvable} re-provable, awaiting a recorded result`);
  return `Not yet MISSING Conformant at the audited level: ${parts.join(', ')}.`;
}

// Build a conformance report from a surface's HTML. Returns
// { designation, earned, level, breadth, axes: { <axis>: { rung, result, check, needs, findings } }, overall, truncated? }.
// opts is audit()'s opts (url, headers) plus opts.results, a map of axis -> 'pass' | 'fail'
// recording a human-applied procedure for the axes a static pass cannot reach.
export function report(html = '', opts = {}) {
  const base = audit(html, opts);
  const results = opts.results && typeof opts.results === 'object' ? opts.results : {};
  const axes = {};
  for (const [key, axis] of Object.entries(base.axes)) {
    const machineError = axis.findings.some((f) => f.level === 'error');
    const fullyApplied = axis.checked === true;
    const supplied = results[key];
    let rung, result;
    if (machineError) {
      rung = 'audited';
      result = 'fail';
    } else if (fullyApplied) {
      rung = 'audited';
      result = 'pass';
    } else if (supplied === 'pass' || supplied === 'fail') {
      rung = 'audited';
      result = supplied;
    } else {
      rung = 're-provable';
      result = null;
    }
    axes[key] = {
      rung,
      result,
      check: CHECKS[key] || `conformance.js ${key}()`,
      needs: rung === 're-provable' ? axis.notChecked || 'a recorded result for this axis' : null,
      findings: axis.findings,
    };
  }
  const list = Object.values(axes);
  const of = list.length;
  const passed = list.filter((a) => a.rung === 'audited' && a.result === 'pass').length;
  const failed = list.filter((a) => a.rung === 'audited' && a.result === 'fail').length;
  const reProvable = list.filter((a) => a.rung === 're-provable').length;
  const complete = passed === of;
  const earned = complete && failed === 0;
  const level = list.reduce((lo, a) => (RUNG_ORDER[a.rung] < RUNG_ORDER[lo] ? a.rung : lo), 'audited');
  const out = {
    designation: 'MISSING Conformant',
    earned,
    level,
    breadth: { of, auditedPass: passed, auditedFail: failed, reProvable, complete },
    axes,
    overall: overallLine({ of, passed, failed, reProvable, earned }),
  };
  if (base.truncated) out.truncated = base.truncated;
  return out;
}

// Reconcile a published report against a fresh run of the surface, so a claim carried
// forward cannot outrun what the tool can verify now. It re-runs report() and, per axis,
// refutes only what the tool can decide: a claimed passing result the fresh audit proves
// failing is an error. An axis the tool cannot reach on its own (a procedure axis still
// re-provable on the fresh run) is author-attested, not machine-reconcilable, and is noted
// rather than refuted. Returns { ok, fresh, findings }. This is the verb a B-style carried
// manifest would later lean on; for now it reconciles A's own published output.
export function reconcile(claim = {}, html = '', opts = {}) {
  const fresh = report(html, opts);
  const claimAxes = (claim && claim.axes) || {};
  const findings = [];
  for (const [key, axis] of Object.entries(fresh.axes)) {
    const c = claimAxes[key];
    if (!c) continue;
    if (axis.result !== null) {
      // The tool reached a verdict on this axis; hold the claim to it.
      if (c.result === 'pass' && axis.result === 'fail') {
        findings.push(finding('error', 'result-overclaim', `Axis ${key} claims a passing result, but a fresh audit finds a failure.`));
      }
    } else if (c.rung === 'audited') {
      // A procedure axis the tool cannot re-run; the claim rests on a human record.
      findings.push(finding('info', 'author-attested', `Axis ${key} is claimed audited on a human procedure the tool cannot re-run; it is author-attested, not machine-reconciled.`));
    }
  }
  const ok = !findings.some((f) => f.level === 'error');
  return { ok, fresh, findings };
}
