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

function tagAttrs(html, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '\\b([^>]*)>', 'gi');
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const ar = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
    let a;
    while ((a = ar.exec(m[1]))) {
      if (a[1] != null) attrs[a[1].toLowerCase()] = a[2];
      else attrs[a[3].toLowerCase()] = a[4];
    }
    out.push({ attrs, raw: m[1] });
  }
  return out;
}

const finding = (level, code, message) => ({ level, code, message });

// --- Perceivable (TEMPER): partial. Contrast needs rendered colors. ---
function perceivable(html) {
  const findings = [];
  const viewport = tagAttrs(html, 'meta').find((t) => t.attrs.name === 'viewport');
  if (viewport && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\D|$)/i.test(viewport.attrs.content || '')) {
    findings.push(finding('warning', 'zoom-disabled', 'The viewport disables zoom (user-scalable=no or maximum-scale=1); this fails perceivability for low-vision readers.'));
  }
  return { checked: 'partial', notChecked: 'Color contrast needs rendered colors; run TEMPER contrast() against your palette.', findings };
}

// --- Operable (GRASP): static accessibility checks. ---
function operable(html) {
  const findings = [];
  const divButtons = (html.match(/<(?:div|span)\b[^>]*\bonclick=/gi) || []).length;
  if (divButtons) findings.push(finding('error', 'div-button', `${divButtons} div or span element(s) with onclick; a control should be a <button>, which is focusable and keyboard-operable.`));

  const inputs = tagAttrs(html, 'input').filter((t) => !['hidden', 'submit', 'button', 'image'].includes((t.attrs.type || 'text').toLowerCase()));
  const unlabeled = inputs.filter((t) => !t.attrs['aria-label'] && !t.attrs['aria-labelledby'] && !t.attrs.id);
  if (unlabeled.length) findings.push(finding('warning', 'input-unlabeled', `${unlabeled.length} input(s) with no id, aria-label, or aria-labelledby; likely unlabeled to a screen reader.`));

  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  const namelessButtons = buttons.filter((b) => !/aria-label\s*=/i.test(b[1]) && !b[2].replace(/<[^>]*>/g, '').trim());
  if (namelessButtons.length) findings.push(finding('warning', 'button-no-name', `${namelessButtons.length} button(s) with no text and no aria-label; they have no accessible name.`));

  if (findings.length === 0) findings.push(finding('pass', 'operable', 'No div-button, unlabeled-input, or nameless-button issues found in the served markup.'));
  return { checked: true, findings };
}

// --- Off-happy-path (LUCID/GRACE): not statically checkable. ---
function offHappyPath() {
  return { checked: false, notChecked: 'The loading, empty, error, and 404 states are not visible in a single happy-path render, so a static snapshot cannot verify them. Check them by driving the surface into each state.', findings: [] };
}

// --- Key privacy (HASP): scan for exposed secrets in the served markup. ---
function keyPrivacy(html) {
  const findings = [];
  const patterns = [
    ['openai-anthropic', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
    ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['github-token', /\bgh[ps]_[A-Za-z0-9]{36}\b/],
    ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ];
  for (const [code, re] of patterns) {
    if (re.test(html)) findings.push(finding('error', 'exposed-key', `A string matching a ${code} was found in the served markup; a key must never reach the client bundle. Hold it with HASP or keep it server-side.`));
  }
  if (findings.length === 0) findings.push(finding('pass', 'key-privacy', 'No exposed API-key-shaped strings found in the served markup.'));
  return { checked: true, findings };
}

// --- Findability (BEACON): headline checks; run beacon-ui audit for depth. ---
function findability(html) {
  const findings = [];
  const metas = tagAttrs(html, 'meta');
  const byName = (n) => metas.find((t) => t.attrs.name === n);
  const byProp = (p) => metas.find((t) => t.attrs.property === p);
  const title = [...html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => m[1].trim());
  if (!title.length || !title[0]) findings.push(finding('error', 'title', 'No non-empty <title>.'));
  if (!byName('description')) findings.push(finding('warning', 'description', 'No meta description.'));
  const canonical = tagAttrs(html, 'link').find((t) => (t.attrs.rel || '').split(/\s+/).includes('canonical'));
  if (!canonical) findings.push(finding('warning', 'canonical', 'No rel=canonical.'));
  if (!byProp('og:image')) findings.push(finding('warning', 'open-graph', 'No og:image; social and AI previews degrade.'));
  if (findings.length === 0) findings.push(finding('pass', 'findability', 'Title, description, canonical, and og:image present.'));
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
  const blocking = [...headHtml.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]).filter((a) => /\bsrc=/.test(a) && !/\bdefer\b/.test(a) && !/\basync\b/.test(a) && !/type=["']module["']/.test(a));
  if (blocking.length) findings.push(finding('warning', 'render-blocking', `${blocking.length} render-blocking script(s) in <head>.`));
  if (findings.length === 0) findings.push(finding('pass', 'delivery', 'Images sized, no lazy first image, no render-blocking head scripts.'));
  return { checked: true, deeper: 'fleet-ui audit(html)', findings };
}

// Audit a shipped surface's HTML across all six axes. Returns
// { ok, axes: { <axis>: { checked, notChecked?, deeper?, findings } } }.
// ok is true when no finding is an error; axes marked checked:false or 'partial'
// are declared, not counted as clean.
export function audit(html = '') {
  const axes = {
    perceivable: perceivable(html),
    operable: operable(html),
    offHappyPath: offHappyPath(),
    keyPrivacy: keyPrivacy(html),
    findability: findability(html),
    delivery: delivery(html),
  };
  const hasError = Object.values(axes).some((a) => a.findings.some((f) => f.level === 'error'));
  return { ok: !hasError, axes };
}
