/*
 * HASP - the client-surface hardening auditor. Zero dependencies.
 *
 * The depth auditor for the Hardened axis of MISSING (axis 4, formerly
 * "Key-private"). It checks the client-surface security posture a shipped
 * surface declares to the browser, across three altitudes: response headers,
 * markup integrity, and secrets. conformance.js runs a headline subset for the
 * whole-surface breadth pass and points here for depth.
 *
 * Boundary, stated first because it is the whole risk. This audits declared
 * client-surface hardening, present and well-formed. It never certifies that a
 * site is secure. Server-side security, authentication logic, TLS and server
 * configuration, and denial-of-service defense are out of scope and remain the
 * operator's. A present policy is not a safe site; the mark says "these declared
 * client-surface hardening checks passed", never "secure" and never "trustworthy".
 *
 * Two invariants make an implementation subtly wrong, and both are enforced here:
 *   1. Well-formed, not merely present. A CSP with default-src * or unsafe-inline,
 *      an HSTS with a tiny max-age, a frame-ancestors that allows any origin: each
 *      is present and ineffective. This judges effectiveness, not presence.
 *   2. Header over meta. Security headers belong in the server response, not a
 *      runtime meta tag: a CSP in a meta tag is strictly weaker and HSTS and frame
 *      protection cannot be meta at all. So the response headers are the source of
 *      truth, and a security policy found only in meta is flagged as weak.
 *
 * Input is the served response, not a post-JS DOM: pass the raw response headers
 * and the raw response body. Without headers, the header altitude cannot be judged
 * and is declared not-checked rather than reported clean.
 *
 * License: Apache-2.0.
 */

// Bounded, non-backtracking attribute scan (see conformance.js for the reasoning):
// a name then an optional value, over an attribute span capped at 8000 chars, so a
// hostile tag cannot drive quadratic backtracking. Reads unquoted values too.
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

// Lowercase the header names once so lookup is case-insensitive, as HTTP headers are.
function normalizeHeaders(headers) {
  const out = {};
  if (headers && typeof headers === 'object') {
    for (const k of Object.keys(headers)) out[k.toLowerCase()] = String(headers[k]);
  }
  return out;
}

const finding = (level, code, tier, message) => ({ level, code, tier, message });

// --- Tier 1: the headers gate. Highest consequence, and the floor almost no fast
// build clears. CSP and clickjacking protection, HSTS, and nosniff. ---
function tier1(H, metaCsp, findings) {
  const csp = H['content-security-policy'];
  if (!csp) {
    if (metaCsp) findings.push(finding('warning', 'csp-meta-only', 1, 'A Content-Security-Policy is present only in a <meta> tag, not a response header. A meta CSP is strictly weaker (it cannot set frame-ancestors and is applied later); serve it as a Content-Security-Policy response header.'));
    else findings.push(finding('warning', 'csp-missing', 1, 'No Content-Security-Policy response header. Without it the page has no declared defense against cross-site scripting and injected content.'));
  } else {
    const c = csp.toLowerCase();
    // Invariant 1: judge effectiveness, not presence.
    if (/(^|;)\s*default-src\s+[^;]*\*/.test(c) && !/'(nonce-|sha)/.test(c)) {
      findings.push(finding('warning', 'csp-wildcard', 1, 'The Content-Security-Policy allows a wildcard source (default-src *); a policy that allows any origin is present but ineffective.'));
    }
    if (/'unsafe-inline'/.test(c) && !/'(nonce-|sha)/.test(c)) {
      findings.push(finding('warning', 'csp-unsafe-inline', 1, "The Content-Security-Policy allows 'unsafe-inline' without a nonce or hash; inline script is exactly what CSP exists to stop, so this weakens it to little effect."));
    }
    if (/'unsafe-eval'/.test(c)) {
      findings.push(finding('warning', 'csp-unsafe-eval', 1, "The Content-Security-Policy allows 'unsafe-eval'; this re-opens a class of injection the policy is meant to close."));
    }
  }

  // Clickjacking: frame-ancestors in CSP, or X-Frame-Options. Judge effectiveness.
  const fa = csp && /frame-ancestors\s+([^;]+)/i.exec(csp);
  const xfo = (H['x-frame-options'] || '').toLowerCase().trim();
  const faOk = fa && !/[\s']\*[\s']|^\s*\*\s*$|\*/.test(fa[1]);
  const xfoOk = xfo === 'deny' || xfo === 'sameorigin';
  if (fa && !faOk) findings.push(finding('warning', 'clickjacking-weak', 1, 'The CSP frame-ancestors allows any origin (*); it is present but does not prevent framing.'));
  else if (!faOk && !xfoOk) findings.push(finding('warning', 'clickjacking-missing', 1, 'No clickjacking protection: set frame-ancestors in the CSP (or X-Frame-Options: DENY or SAMEORIGIN) so the page cannot be framed for a UI-redress attack.'));

  const hsts = H['strict-transport-security'];
  if (!hsts) findings.push(finding('warning', 'hsts-missing', 1, 'No Strict-Transport-Security header. Without HSTS a first or downgraded request can be served over plain HTTP and intercepted.'));
  else {
    const ma = /max-age\s*=\s*(\d+)/i.exec(hsts);
    const secs = ma ? parseInt(ma[1], 10) : 0;
    if (secs < 15552000) findings.push(finding('warning', 'hsts-weak', 1, `Strict-Transport-Security max-age is ${secs} seconds; under ~180 days (15552000) is widely treated as too short to be effective. Raise it, and consider includeSubDomains.`));
  }

  const cto = (H['x-content-type-options'] || '').toLowerCase().trim();
  if (cto !== 'nosniff') findings.push(finding('warning', 'nosniff-missing', 1, 'No X-Content-Type-Options: nosniff. Without it a browser may MIME-sniff a response into an executable type.'));
}

// --- Tier 2: the rest of the headers, and markup integrity in the served HTML. ---
function tier2(H, html, url, findings) {
  if (!H['referrer-policy']) findings.push(finding('warning', 'referrer-policy-missing', 2, 'No Referrer-Policy header; the full URL may leak to third parties in the Referer. A strict value such as strict-origin-when-cross-origin or no-referrer is recommended.'));
  if (!H['permissions-policy']) findings.push(finding('warning', 'permissions-policy-missing', 2, 'No Permissions-Policy header; powerful features (camera, geolocation, and so on) are not explicitly restricted.'));

  // Cross-origin isolation trio is conditional (needed for isolation and SharedArrayBuffer),
  // so its absence is declared, not warned; COOP same-origin is the broadly useful one.
  const coop = (H['cross-origin-opener-policy'] || '').toLowerCase();
  if (coop && coop.includes('same-origin')) findings.push(finding('pass', 'coop', 2, 'Cross-Origin-Opener-Policy isolates this browsing context from cross-origin openers.'));

  // The markup-integrity checks of Tier 2 run on the HTML and are shared with the
  // no-headers path, so they live in one place.
  tier2Markup(html, url, findings);
}

// --- Tier 3: secrets. Nothing sensitive reaching the client. Same patterns as
// conformance.js so the breadth and depth passes agree. ---
function tier3(html, findings) {
  const patterns = [
    ['an OpenAI or Anthropic key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['a GitHub token', /\bgh[ps]_[A-Za-z0-9]{36}\b/],
    ['a Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ];
  for (const [label, re] of patterns) {
    if (re.test(html)) findings.push(finding('error', 'exposed-secret', 3, `A string shaped like ${label} was found in the served response; a secret must never reach the client. Hold it in the browser with HASP (hasp-key) or keep it server-side.`));
  }
}

// Audit the declared client-surface hardening of a served response.
//   audit({ headers, html, url }) -> { ok, tiers, headersChecked, errors, warnings, passed, notChecked }
// headers is the response headers (an object; names are matched case-insensitively).
// tiers reports which tier's checks passed: true, false, or null when a tier could not
// be judged (the header tiers when no headers were given). ok is true when no finding is
// an error. Absent headers are declared not-checked, never reported clean.
export function audit(input = {}) {
  let { headers, html = '', url = '' } = input;
  const MAX = 2 * 1024 * 1024;
  const truncated = html.length > MAX;
  if (truncated) html = html.slice(0, MAX);

  const H = normalizeHeaders(headers);
  const headersChecked = Object.keys(H).length > 0;
  const metaCsp = tagAttrs(html, 'meta').some((t) => (t.attrs['http-equiv'] || '').toLowerCase() === 'content-security-policy');
  const findings = [];
  const notChecked = [];

  if (headersChecked) {
    tier1(H, metaCsp, findings);
    tier2(H, html, url, findings);
  } else {
    // Honesty: the header altitude is the bulk of Tiers 1 and 2 and cannot be seen
    // without the response headers. Declare it rather than reporting it clean.
    notChecked.push('No response headers were provided, so the header altitude (Content-Security-Policy, clickjacking protection, HSTS, nosniff, Referrer-Policy, Permissions-Policy, cross-origin isolation) could not be judged. Re-run with the raw response headers to check Tiers 1 and 2.');
    // The markup-integrity checks of Tier 2 still run on the HTML alone.
    tier2Markup(html, url, findings);
  }
  tier3(html, findings);

  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  const passed = findings.filter((f) => f.level === 'pass');

  // A tier passes when nothing in it is outstanding. The header tiers are undetermined
  // (null) when no headers were given, since absence of a finding is not evidence there.
  const badIn = (t) => findings.some((f) => f.tier === t && (f.level === 'error' || f.level === 'warning'));
  const tiers = {
    1: headersChecked ? !badIn(1) : null,
    2: headersChecked ? !badIn(2) : null,
    3: !badIn(3),
  };

  const result = { ok: errors.length === 0, tiers, headersChecked, errors, warnings, passed, notChecked };
  if (truncated) result.truncated = `The response body exceeded ${MAX} bytes and was truncated; markup checks past that point did not run, so this report is partial.`;
  return result;
}

// The markup-integrity subset of Tier 2, split out so it can run on the HTML alone
// when no response headers are available (the header checks are skipped and declared).
function tier2Markup(html, url, findings) {
  const abs = (v) => /^https?:\/\//i.test(v || '') || /^\/\//.test(v || '');
  const scripts = tagAttrs(html, 'script').filter((t) => abs(t.attrs.src) && !('integrity' in t.attrs));
  const links = tagAttrs(html, 'link').filter((t) => (t.attrs.rel || '').split(/\s+/).includes('stylesheet') && abs(t.attrs.href) && !('integrity' in t.attrs));
  const sri = scripts.length + links.length;
  if (sri) findings.push(finding('warning', 'sri-missing', 2, `${sri} external script or stylesheet reference(s) without a Subresource Integrity hash; a compromised third-party host could then serve altered code that runs on this page.`));
  const isHttps = /^https:/i.test(url || '') || !url;
  if (isHttps) {
    const mixed = (html.match(/\b(?:src|href)\s*=\s*["']http:\/\//gi) || []).length;
    if (mixed) findings.push(finding('error', 'mixed-content', 2, `${mixed} subresource(s) referenced over plain http on an https page; browsers block or downgrade these, and they break the page's security guarantees.`));
  }
  const tab = tagAttrs(html, 'a').filter((t) => (t.attrs.target || '') === '_blank' && abs(t.attrs.href) && !/\bno(opener|referrer)\b/i.test(t.attrs.rel || ''));
  if (tab.length) findings.push(finding('warning', 'tabnabbing', 2, `${tab.length} link(s) with target="_blank" to an external URL and no rel="noopener"; the opened tab can navigate this one (reverse tabnabbing).`));
}
