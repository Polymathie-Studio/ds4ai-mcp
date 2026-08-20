// derive.js - parametric palette deriver for TEMPER.
//
// A palette is not a set of hand-picked hex values. It is two primitives plus
// rules. The contrast primitive is a luminance notch: how bright or deep the
// page background sits. The color primitive is a family: a neutral hue and an
// accent hue with saturations. Every other token is solved from the background
// by contrast rules, so legibility is a property of the engine rather than a
// thing checked after the fact.
//
// Text targets are expressed as a fraction of the achievable contrast budget
// against the actual background, bounded by absolute floors and by caps that
// hold back glare. The budget is largest on bright or deep backgrounds and
// smallest toward mid luminance, so text hardens toward pure black or white in
// the middle of the range (the clamp) and relaxes at the ends.
//
// Zero dependencies. Framework agnostic. All anchors and rule constants live in
// the exported CONFIG object below, so tuning happens in one place.

// ---------------------------------------------------------------------------
// CONFIG: the single source of tuning. Modes and their notches, color
// families, and the numeric rule constants for every token role.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // Each mode carries three background lightness notches, brightest first, and
  // a darkText flag that fixes which way text is solved (down toward black for
  // light modes, up toward white for dark modes).
  // Notches are OKLCH lightness values (perceptual, 0 to 1), brightest first.
  modes: [
    { key: 'light', label: 'Light', notches: [0.99, 0.965, 0.945], darkText: true },
    { key: 'soft-light', label: 'Soft Light', notches: [0.93, 0.9, 0.87], darkText: true },
    { key: 'soft-dark', label: 'Soft Dark', notches: [0.3, 0.27, 0.24], darkText: false },
    { key: 'dark', label: 'Dark', notches: [0.23, 0.2, 0.17], darkText: false },
  ],

  // Where System resolves when the OS prefers dark. The default is 'dark',
  // which is least surprising: an OS set to Dark Mode gets the deep Dark
  // palette. Set this to 'soft-dark' for the gentler default, since Soft Dark
  // is the more comfortable everyday dark working environment.
  systemDark: 'dark',

  // The third primitive. 'default' is full-color vision. The others constrain
  // the solver so status meaning survives a color vision deficiency: status
  // hues move onto an axis the deficiency preserves, and the three statuses
  // take staggered contrast targets so they separate by luminance alone. This
  // is the secondary guard; the primary guard is redundant text (link
  // underlines and status letter marks) that theme.css applies by default, with
  // data-vision="color-only" the explicit opt-out.
  visions: [
    { key: 'default', label: 'D', title: 'Default vision' },
    { key: 'rg', label: 'RG', title: 'Red-green safe (deutan and protan)' },
    { key: 'by', label: 'BY', title: 'Blue-yellow safe (tritan)' },
    { key: 'mono', label: 'M', title: 'Monochrome safe (luminance only)' },
  ],

  // Six restrained families. neutral* tint the backgrounds and structure;
  // accent* drive links, focus, and the primary button fill. swatch is only a
  // label chip for the tuner UI.
  // Families are defined in OKLCH: a neutral hue and a faint neutral chroma that
  // tint the backgrounds and structure, and an accent hue and chroma that drive
  // links, focus, and the primary button. swatch is only the tuner label chip.
  families: [
    { key: 'iron', label: 'Iron', swatch: '#3E6FB0', neutralHue: 256, neutralChroma: 0.008, accentHue: 256, accentChroma: 0.115 },
    { key: 'oxblood', label: 'Oxblood', swatch: '#8A3B30', neutralHue: 40, neutralChroma: 0.010, accentHue: 30, accentChroma: 0.110 },
    { key: 'moss', label: 'Moss', swatch: '#4C6144', neutralHue: 140, neutralChroma: 0.007, accentHue: 150, accentChroma: 0.078 },
    { key: 'bronze', label: 'Bronze', swatch: '#8A6320', neutralHue: 80, neutralChroma: 0.012, accentHue: 77, accentChroma: 0.100 },
    { key: 'violet', label: 'Violet', swatch: '#5D5378', neutralHue: 296, neutralChroma: 0.007, accentHue: 296, accentChroma: 0.080 },
    { key: 'graphite', label: 'Graphite', swatch: '#4A5056', neutralHue: 248, neutralChroma: 0.004, accentHue: 248, accentChroma: 0.035 },
  ],

  // Rule constants. Ratios are WCAG contrast ratios; fracs are fractions of the
  // achievable budget; floors and caps are absolute ratios. Where a rule needs
  // to differ between light and dark modes, the constant is a [light, dark]
  // pair read by darkText.
  rules: {
    // Backgrounds are neutral and offset in lightness from the notch.
    background: { subtleDrop: 0.028, codeDrop: 0.045, stripeShift: 0.02 },

    // Surfaces float toward light; interaction states step back toward text.
    surface: { floatRatio: [1.9, 1.22], hoverRatio: 1.09, activeRatio: 1.2 },

    // Borders sit on the text side at low contrast so they stay visible in
    // every mode without becoming lines of text.
    border: { ratio: 1.45, strongRatio: 2.1 },

    // Text: budget fractions with floors, primary capped against glare.
    text: {
      primaryFrac: 0.96, primaryCap: 16,
      secondaryFrac: 0.58, secondaryFloor: 4.6,
      tertiaryFrac: 0.4, tertiaryFloor: 3.1,
      neutralSatMul: [0.5, 0.6, 0.7], // OKLCH chroma multipliers for primary, secondary, tertiary text
    },

    // Accent set. link is solved on the background; solid is solved against
    // white so the button fill always carries white text at AA.
    accent: {
      linkFrac: 0.55, linkFloor: 4.6, linkCap: 7.5,
      hoverBoost: 1.28,
      subtleSatMul: 0.55, subtleRatio: 1.22,
      solidVsWhite: [6.0, 4.8], // darker solid in light modes, lighter in dark
      focusFrac: 0.5, focusFloor: 3.2, focusCap: 6,
      selectionSatMul: 0.7, selectionRatio: 1.45,
    },

    // Statuses. Default vision uses fixed semantic hues (danger stays red in a
    // Moss theme) at modest, similar contrast. The other visions replace both
    // the hues and the targets: hues move to a deficiency-safe axis, and the
    // targets stagger so success, warning, and danger separate by luminance
    // even with hue removed.
    status: {
      default: {
        success: { hue: 150, chroma: 0.09, frac: 0.5, floor: 4.0, cap: 7 },
        warning: { hue: 77, chroma: 0.10, frac: 0.5, floor: 4.0, cap: 7 },
        danger: { hue: 30, chroma: 0.13, frac: 0.55, floor: 4.6, cap: 7 },
      },
      // Staggered contrast targets shared by every non-default vision. Success
      // sits lightest, danger darkest, so the three differ in luminance. The
      // spread is wide so the separation survives dichromacy simulation, where
      // saturated hues shift luminance.
      staggered: {
        success: { frac: 0.28, floor: 3.0, cap: 4.0 },
        warning: { frac: 0.52, floor: 4.9, cap: 6.6 },
        danger: { frac: 0.78, floor: 6.4, cap: 9.5 },
      },
      // OKLCH hue and chroma per non-default vision. Chroma is kept low on
      // purpose: a muted color simulates close to its own luminance, so the
      // staggered luminance gap is preserved under the deficiency. rg keeps blue
      // and yellow (the poles a red-green deficiency preserves); by keeps green
      // and red (the poles a blue-yellow deficiency preserves); mono drops hue
      // entirely (hue and chroma come from the neutral at derive time).
      visionHues: {
        rg: { success: { hue: 256, chroma: 0.06 }, warning: { hue: 95, chroma: 0.07 }, danger: { hue: 327, chroma: 0.06 } },
        by: { success: { hue: 150, chroma: 0.06 }, warning: { hue: 56, chroma: 0.07 }, danger: { hue: 30, chroma: 0.07 } },
      },
      subtleSatMul: 0.5, subtleRatio: 1.2,
      // If a non-default vision's accent hue lands within this many degrees of
      // any remapped status hue, rotate the accent away by the nudge so links,
      // focus, and statuses stay separable.
      accentCollisionDeg: 24,
      accentNudgeDeg: 42,
    },

    // Overlay scrim: a deep neutral at a mode-dependent alpha.
    overlay: { lightness: 0.08, alpha: [0.45, 0.58] },

    // Raised targets used when the reader asks for prefers-contrast: more. They
    // spend more of the budget and lift the floors, so text and links get more
    // contrast in every mode. Every value only raises contrast, so the result
    // stays WCAG AA and usually reaches AAA. The tuner wires prefers-contrast to
    // opts.highContrast.
    highContrast: {
      primaryFrac: 0.99, primaryCap: 21,
      secondaryFrac: 0.72, secondaryFloor: 7.0,
      tertiaryFrac: 0.52, tertiaryFloor: 4.5,
      linkFrac: 0.7, linkFloor: 7.0,
    },
  },

  // Shadow presets by mode kind. Not contrast-solved; dark modes lean on
  // borders and use deeper, softer shadows.
  shadows: {
    light: { sm: '0 1px 2px rgba(23, 25, 27, 0.06)', md: '0 4px 14px rgba(23, 25, 27, 0.10)' },
    dark: { sm: '0 1px 2px rgba(0, 0, 0, 0.42)', md: '0 6px 20px rgba(0, 0, 0, 0.55)' },
  },

  // The CSS custom properties this deriver writes, in schema order.
  cssOrder: [
    '--color-bg-base', '--color-bg-subtle', '--color-surface', '--color-surface-hover',
    '--color-surface-active', '--color-border', '--color-border-strong',
    '--color-text-primary', '--color-text-secondary', '--color-text-tertiary',
    '--color-text-on-accent', '--color-accent', '--color-accent-hover',
    '--color-accent-subtle', '--color-accent-solid', '--color-success',
    '--color-success-subtle', '--color-warning', '--color-warning-subtle',
    '--color-danger', '--color-danger-subtle', '--color-focus-ring', '--color-selection',
    '--color-code-bg', '--color-code-text', '--color-table-stripe', '--color-overlay',
    '--shadow-sm', '--shadow-md',
  ],
};

// ---------------------------------------------------------------------------
// Color math (sRGB, WCAG 2.1).
// ---------------------------------------------------------------------------

function clamp01(x) { return Math.min(1, Math.max(0, x)); }

function relLum(rgb) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

export function contrast(l1, l2) {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

// Solve for the OKLCH lightness at hue H and chroma C that reaches targetRatio
// against an anchor luminance, searching only one side of the anchor. WCAG
// luminance is monotone in OKLCH lightness for fixed hue and chroma, so a binary
// search converges, and it clamps to pure black or white when the target
// exceeds what the anchor allows. Chroma is gamut-mapped inside lumOfOklch.
function solveL(H, C, anchorL, anchorLum, targetRatio, dir) {
  let lo = dir === 'darker' ? 0 : anchorL;
  let hi = dir === 'darker' ? anchorL : 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = contrast(lumOfOklch(mid, C, H), anchorLum);
    // Contrast rises as lightness moves away from the anchor on either side.
    if (dir === 'darker') {
      if (r < targetRatio) hi = mid; else lo = mid;
    } else {
      if (r < targetRatio) lo = mid; else hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function solveHex(H, C, anchorL, anchorLum, targetRatio, dir) {
  return oklchToHex(solveL(H, C, anchorL, anchorLum, targetRatio, dir), C, H);
}

function pick(pairOrValue, darkText) {
  return Array.isArray(pairOrValue) ? (darkText ? pairOrValue[0] : pairOrValue[1]) : pairOrValue;
}

function clampTarget(frac, floor, cap, maxRatio) {
  return Math.max(floor, Math.min(frac * maxRatio, cap));
}

// Smallest angular distance between two hues, in degrees (0 to 180).
function hueDist(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
}

function minHueDist(hue, hues) {
  return Math.min(...hues.map((h) => hueDist(hue, h)));
}

// ---------------------------------------------------------------------------
// Color vision deficiency simulation (dichromacy).
// ---------------------------------------------------------------------------
//
// Linear-RGB simulation matrices (Machado/Vienot lineage, the same coefficients
// browser devtools and SVG feColorMatrix filters use). Applied in linear light
// (which is the SVG filter default, color-interpolation-filters="linearRGB"), so
// the demo's live SVG simulation and the verifier's math agree. Exported so the
// verifier and the tuner share one source of truth.
export const CVD_MATRICES = {
  deut: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  prot: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  trit: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

function srgbToLinearChannel(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

// Simulate a hex color under a dichromacy type ('deut' | 'prot' | 'trit'), or
// 'mono' for pure luminance. Returns the simulated relative luminance, which is
// the robust distinguishability signal once hue is compromised.
export function simulatedLuminance(hex, type) {
  const lin = hexToRgb01(hex).map(srgbToLinearChannel);
  if (type === 'mono') {
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }
  const m = CVD_MATRICES[type];
  const sim = m.map((row) => clamp01(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
  return 0.2126 * sim[0] + 0.7152 * sim[1] + 0.0722 * sim[2];
}

// Contrast between two colors as a given vision would see them. Above about
// 1.25:1 the two are separable by luminance alone.
export function simulatedContrast(hexA, hexB, type) {
  return contrast(simulatedLuminance(hexA, type), simulatedLuminance(hexB, type));
}

// ---------------------------------------------------------------------------
// OKLCH color space (Bjorn Ottosson's OKLab, cylindrical form).
// ---------------------------------------------------------------------------
//
// The solver runs in OKLCH, not HSL. OKLCH lightness is perceptually even, so
// equal lightness steps look equal (HSL fails this badly: pure blue and pure
// yellow at the same HSL lightness look nothing alike), and a fixed OKLCH hue
// keeps its identity as lightness moves, which is what lets a brand hue stay
// itself from the palest tint to the darkest text. A color is (L, C, H): L is
// perceptual lightness 0 to 1, C is chroma, H is hue in degrees. Contrast is
// still measured with WCAG 2.1 sRGB luminance; only the space we solve in
// changed.

function srgbGammaEncode(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function oklabToLinearRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function linearRgbToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

// Linear sRGB for an OKLCH color, and whether it sits inside the sRGB gamut.
function oklchToLinearRgb(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const lin = oklabToLinearRgb(L, C * Math.cos(hr), C * Math.sin(hr));
  const eps = 1e-4;
  const inGamut = lin.every((v) => v >= -eps && v <= 1 + eps);
  return { lin, inGamut };
}

// Gamut-map by reducing chroma toward the neutral axis until the color fits in
// sRGB, never by shifting hue or lightness. Returns [L, C, H].
function gamutMapOklch(L, C, H) {
  if (oklchToLinearRgb(L, C, H).inGamut) return [L, C, H];
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (oklchToLinearRgb(L, mid, H).inGamut) lo = mid; else hi = mid;
  }
  return [L, lo, H];
}

function oklchToHex(L, C, H) {
  const [gl, gc, gh] = gamutMapOklch(L, C, H);
  const lin = oklchToLinearRgb(gl, gc, gh).lin;
  return '#' + lin
    .map((v) => Math.round(clamp01(srgbGammaEncode(clamp01(v))) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// WCAG relative luminance for an OKLCH color (after gamut mapping).
function lumOfOklch(L, C, H) {
  const [gl, gc, gh] = gamutMapOklch(L, C, H);
  const lin = oklchToLinearRgb(gl, gc, gh).lin.map(clamp01);
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// sRGB hex to OKLCH [L, C, H]. Used by brandToFamily and the fidelity report.
export function hexToOklch(hex) {
  const [r, g, b] = hexToRgb01(hex).map(srgbToLinearChannel);
  const [L, a, bb] = linearRgbToOklab(r, g, b);
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

// OKLab deltaE (Euclidean in OKLab) between two hex colors. A small, perceptual
// distance metric used to report how far a solved accent drifts from a brand hex.
export function deltaEOk(hexA, hexB) {
  const a = hexToOklch(hexA);
  const b = hexToOklch(hexB);
  const a1 = a.C * Math.cos((a.H * Math.PI) / 180);
  const b1 = a.C * Math.sin((a.H * Math.PI) / 180);
  const a2 = b.C * Math.cos((b.H * Math.PI) / 180);
  const b2 = b.C * Math.sin((b.H * Math.PI) / 180);
  return Math.hypot(a.L - b.L, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------
// Deriver.
// ---------------------------------------------------------------------------

// Derive the full token set for a mode object, a notch index (0, 1, or 2), a
// family object, and a vision key ('default' | 'rg' | 'by' | 'mono'). Returns a
// plain object keyed by CSS custom property name.
export function derive(mode, notch, family, vision = 'default', opts = {}) {
  const R = CONFIG.rules;
  const hc = opts.highContrast ? R.highContrast : null;
  const dark = mode.darkText;
  const nh = family.neutralHue;
  const nc = family.neutralChroma;
  const textDir = dark ? 'darker' : 'lighter'; // toward the text side
  const upDir = 'lighter'; // toward light; cards float up in every mode

  const baseL = mode.notches[notch]; // OKLCH lightness of the page background
  const bgLum = lumOfOklch(baseL, nc, nh);
  const maxRatio = contrast(dark ? 0 : 1, bgLum); // achievable budget

  // Backgrounds: neutral, offset in OKLCH lightness from the notch.
  const bgBase = oklchToHex(baseL, nc, nh);
  const bgSubtle = oklchToHex(clamp01(baseL - R.background.subtleDrop), nc, nh);
  const codeBg = oklchToHex(clamp01(baseL - R.background.codeDrop), nc, nh);
  const stripeL = clamp01(baseL + (dark ? R.background.stripeShift : -R.background.stripeShift));
  const tableStripe = oklchToHex(stripeL, nc, nh);

  // Surfaces float toward light; hover and active step back toward text.
  const surfaceL = solveL(nh, nc, baseL, bgLum, pick(R.surface.floatRatio, dark), upDir);
  const surfaceLum = lumOfOklch(surfaceL, nc, nh);
  const surface = oklchToHex(surfaceL, nc, nh);
  const surfaceHover = solveHex(nh, nc, surfaceL, surfaceLum, R.surface.hoverRatio, textDir);
  const surfaceActive = solveHex(nh, nc, surfaceL, surfaceLum, R.surface.activeRatio, textDir);

  // Borders sit on the text side at low contrast.
  const border = solveHex(nh, nc, baseL, bgLum, R.border.ratio, textDir);
  const borderStrong = solveHex(nh, nc, baseL, bgLum, R.border.strongRatio, textDir);

  // Text: budget fractions with floors, primary capped for glare. The chroma
  // multipliers keep text close to neutral with a faint family tint.
  const [ps, ss, ts] = R.text.neutralSatMul;
  const primaryTarget = Math.min((hc ? hc.primaryFrac : R.text.primaryFrac) * maxRatio, hc ? hc.primaryCap : R.text.primaryCap);
  const secondaryTarget = Math.max((hc ? hc.secondaryFrac : R.text.secondaryFrac) * primaryTarget, hc ? hc.secondaryFloor : R.text.secondaryFloor);
  const tertiaryTarget = Math.max((hc ? hc.tertiaryFrac : R.text.tertiaryFrac) * primaryTarget, hc ? hc.tertiaryFloor : R.text.tertiaryFloor);
  const textPrimary = solveHex(nh, nc * ps, baseL, bgLum, primaryTarget, textDir);
  const textSecondary = solveHex(nh, nc * ss, baseL, bgLum, secondaryTarget, textDir);
  const textTertiary = solveHex(nh, nc * ts, baseL, bgLum, tertiaryTarget, textDir);

  // Status specs first, because the accent may need to move off a remapped
  // status hue under a non-default vision. Each spec is an OKLCH hue, a chroma,
  // and a contrast target against the background.
  const St = R.status;
  function statusSpec(name) {
    if (vision === 'default') {
      const d = St.default[name];
      return { hue: d.hue, chroma: d.chroma, target: clampTarget(d.frac, d.floor, d.cap, maxRatio) };
    }
    const s = St.staggered[name];
    const target = clampTarget(s.frac, s.floor, s.cap, maxRatio);
    if (vision === 'mono') return { hue: nh, chroma: 0.006, target };
    const vh = St.visionHues[vision][name];
    return { hue: vh.hue, chroma: vh.chroma, target };
  }
  const successSpec = statusSpec('success');
  const warningSpec = statusSpec('warning');
  const dangerSpec = statusSpec('danger');

  // Accent hue: under a non-default vision, if the brand accent sits on a
  // remapped status hue, rotate it away (whichever direction gains more
  // distance) so links, focus, and statuses stay separable. The link underline
  // that theme.css adds under any vision is the primary guard; this is the
  // secondary one.
  let ah = family.accentHue;
  if (vision === 'rg' || vision === 'by') {
    const statusHues = [successSpec.hue, warningSpec.hue, dangerSpec.hue];
    if (minHueDist(ah, statusHues) < St.accentCollisionDeg) {
      const up = (ah + St.accentNudgeDeg) % 360;
      const dn = (ah - St.accentNudgeDeg + 360) % 360;
      ah = minHueDist(up, statusHues) >= minHueDist(dn, statusHues) ? up : dn;
    }
  }
  const ac = family.accentChroma;

  // Accent link, hover, subtle tint.
  const linkTarget = Math.max(hc ? hc.linkFloor : R.accent.linkFloor, Math.min((hc ? hc.linkFrac : R.accent.linkFrac) * maxRatio, R.accent.linkCap));
  const accent = solveHex(ah, ac, baseL, bgLum, linkTarget, textDir);
  const accentHover = solveHex(ah, ac, baseL, bgLum, Math.min(linkTarget * R.accent.hoverBoost, maxRatio), textDir);
  const accentSubtle = solveHex(ah, ac * R.accent.subtleSatMul, baseL, bgLum, R.accent.subtleRatio, textDir);

  // Solid button fill: solved against white so on-accent text stays at AA.
  const whiteLum = 1;
  const solidTarget = pick(R.accent.solidVsWhite, dark);
  const accentSolid = solveHex(ah, ac, 1, whiteLum, solidTarget, 'darker');
  const solidLum = lumOfOklch(solveL(ah, ac, 1, whiteLum, solidTarget, 'darker'), ac, ah);
  const textOnAccent = contrast(1, solidLum) >= contrast(0, solidLum) ? '#FFFFFF' : '#0B0D0F';

  // Focus ring and selection tint, both from the accent hue.
  const focusTarget = Math.max(R.accent.focusFloor, Math.min(R.accent.focusFrac * maxRatio, R.accent.focusCap));
  const focusRing = solveHex(ah, ac, baseL, bgLum, focusTarget, textDir);
  const selection = solveHex(ah, ac * R.accent.selectionSatMul, baseL, bgLum, R.accent.selectionRatio, textDir);

  // Statuses, with tinted background fills, from the vision-aware specs.
  const statusColor = (s) => solveHex(s.hue, s.chroma, baseL, bgLum, s.target, textDir);
  const statusSubtle = (s) => solveHex(s.hue, s.chroma * St.subtleSatMul, baseL, bgLum, St.subtleRatio, textDir);
  const success = statusColor(successSpec);
  const warning = statusColor(warningSpec);
  const danger = statusColor(dangerSpec);
  const successSubtle = statusSubtle(successSpec);
  const warningSubtle = statusSubtle(warningSpec);
  const dangerSubtle = statusSubtle(dangerSpec);

  // Overlay scrim from a deep neutral at a mode-dependent alpha.
  const ovHex = oklchToHex(R.overlay.lightness, nc, nh).slice(1);
  const ov = [0, 2, 4].map((i) => parseInt(ovHex.slice(i, i + 2), 16));
  const overlay = `rgba(${ov[0]}, ${ov[1]}, ${ov[2]}, ${pick(R.overlay.alpha, dark)})`;

  // darkText marks the light modes, so it selects the light shadow preset.
  const shadows = dark ? CONFIG.shadows.light : CONFIG.shadows.dark;

  return {
    '--color-bg-base': bgBase,
    '--color-bg-subtle': bgSubtle,
    '--color-surface': surface,
    '--color-surface-hover': surfaceHover,
    '--color-surface-active': surfaceActive,
    '--color-border': border,
    '--color-border-strong': borderStrong,
    '--color-text-primary': textPrimary,
    '--color-text-secondary': textSecondary,
    '--color-text-tertiary': textTertiary,
    '--color-text-on-accent': textOnAccent,
    '--color-accent': accent,
    '--color-accent-hover': accentHover,
    '--color-accent-subtle': accentSubtle,
    '--color-accent-solid': accentSolid,
    '--color-success': success,
    '--color-success-subtle': successSubtle,
    '--color-warning': warning,
    '--color-warning-subtle': warningSubtle,
    '--color-danger': danger,
    '--color-danger-subtle': dangerSubtle,
    '--color-focus-ring': focusRing,
    '--color-selection': selection,
    '--color-code-bg': codeBg,
    '--color-code-text': textPrimary,
    '--color-table-stripe': tableStripe,
    '--color-overlay': overlay,
    '--shadow-sm': shadows.sm,
    '--shadow-md': shadows.md,
  };
}

// Convenience: derive by string keys instead of objects. familyKey may also be
// a family object (for a brand family that is not in CONFIG.families).
export function deriveByKey(modeKey, notch, familyKey, vision = 'default', opts = {}) {
  const mode = CONFIG.modes.find((m) => m.key === modeKey);
  const family = typeof familyKey === 'object' ? familyKey : CONFIG.families.find((f) => f.key === familyKey);
  if (!mode) throw new Error(`unknown mode: ${modeKey}`);
  if (!family) throw new Error(`unknown family: ${familyKey}`);
  return derive(mode, notch, family, vision, opts);
}

// Build a family config from one or two canonical brand hexes. The first hex
// becomes the accent (its OKLCH hue and chroma); a second, if given, sets the
// neutral hue (the brand's temperature), otherwise the accent hue does. The
// neutral chroma is kept faint so backgrounds read as near-gray with a brand
// cast. The returned object is a normal family and works everywhere a built-in
// family does. The brand hue is what is preserved across every background; the
// lightness is solved per background, which is the point of the whole system.
export function brandToFamily(primaryHex, secondaryHex = null, opts = {}) {
  const a = hexToOklch(primaryHex);
  const neutralSource = secondaryHex ? hexToOklch(secondaryHex) : a;
  return {
    key: opts.key || 'brand',
    label: opts.label || 'Brand',
    swatch: primaryHex,
    neutralHue: neutralSource.H,
    neutralChroma: opts.neutralChroma != null ? opts.neutralChroma : Math.min(a.C * 0.08, 0.012),
    accentHue: a.H,
    accentChroma: a.C,
  };
}

// Fidelity report: for a family and its canonical brand hex, the OKLab distance
// between the brand color and the accent the solver produces at every mode and
// notch (default vision). Because the solver fixes the hue and only moves
// lightness, hueDrift is near zero and the distance is dominated by the intended
// lightness change; chromaRetained shows where the sRGB gamut forced the brand's
// chroma down at an extreme background. A brand reads this to see where its color
// cannot be held at full strength.
export function brandFidelity(family, brandHex = null) {
  const brand = brandHex || family.swatch;
  const b = hexToOklch(brand);
  const rows = [];
  for (const mode of CONFIG.modes) {
    for (let notch = 0; notch < 3; notch++) {
      const accent = derive(mode, notch, family, 'default')['--color-accent'];
      const o = hexToOklch(accent);
      rows.push({
        mode: mode.key,
        notch,
        accent,
        deltaE: deltaEOk(brand, accent),
        hueDrift: hueDist(b.H, o.H),
        chromaRetained: b.C > 1e-6 ? o.C / b.C : 1,
      });
    }
  }
  return rows;
}

// Resolve System to a concrete mode key using an OS-dark boolean. Light OS maps
// to Light; dark OS maps to CONFIG.systemDark, which defaults to Dark so an OS
// in Dark Mode gets the deep Dark palette (least surprising). Pass systemDark
// 'soft-dark' to get the gentler everyday dark environment instead.
export function resolveSystem(osDark, systemDark = CONFIG.systemDark) {
  return osDark ? systemDark : 'light';
}

// Exported for verifiers and tools that need raw luminance and contrast.
export const _internal = { relLum, lumOfOklch, oklchToHex, solveL };
