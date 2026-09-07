/**
 * Line-drawn instruments for the tool shelf. These are silhouettes a technician would
 * recognise from across the truck bed — a rugged tablet, a handheld meter, a pen, a probe,
 * a laptop — not icons. Drawn in the console palette so they read as equipment sitting in
 * the dark of a utility body. No manufacturer marks; the branding is FiberOps throughout.
 */

const CYAN = 'var(--cyan)';
const LINE = '#3a5566';
const BODY = '#141d27';
const DARK = '#0a1119';

interface ToolArtProps {
  /** Dimmed and dashed when the tool is not on the truck. */
  missing?: boolean;
}

function Frame({ missing, children }: ToolArtProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 120 92" style={{ display: 'block', width: '100%', height: 'auto', opacity: missing ? 0.28 : 1 }} aria-hidden>
      {children}
    </svg>
  );
}

export function OtdrArt({ missing }: ToolArtProps) {
  return (
    <Frame missing={missing}>
      {/* Rugged tablet: rubber bumpers, 7in screen showing a trace, two hard keys. */}
      <rect x="16" y="14" width="88" height="64" rx="6" fill={BODY} stroke={LINE} />
      <rect x="10" y="20" width="12" height="24" rx="4" fill="#c2571a" />
      <rect x="98" y="20" width="12" height="24" rx="4" fill="#c2571a" />
      <rect x="24" y="20" width="72" height="42" rx="2" fill={DARK} stroke="#22323f" />
      <polyline points="28,50 44,44 47,38 50,45 70,49 73,42 76,50 92,55" fill="none" stroke={CYAN} strokeWidth="1.4" />
      <line x1="28" y1="57" x2="92" y2="57" stroke="#1d2b36" />
      <circle cx="47" cy="70" r="4" fill="none" stroke={LINE} />
      <circle cx="73" cy="70" r="4" fill="none" stroke={LINE} />
      <rect x="52" y="8" width="16" height="7" rx="2" fill="#22323f" />
    </Frame>
  );
}

export function PowerMeterArt({ missing }: ToolArtProps) {
  return (
    <Frame missing={missing}>
      {/* Handheld: optical port and dust cap on top, LCD, keypad. */}
      <rect x="34" y="12" width="52" height="72" rx="8" fill={BODY} stroke={LINE} />
      <rect x="52" y="4" width="16" height="10" rx="3" fill="#22323f" stroke={LINE} />
      <circle cx="60" cy="9" r="3" fill={DARK} />
      <rect x="41" y="22" width="38" height="22" rx="2" fill="#07130e" stroke="#1d3a2c" />
      <text x="60" y="38" textAnchor="middle" fontSize="12" fill="var(--amber)" fontFamily="ui-monospace, monospace">-15.5</text>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={43 + c * 12} y={50 + r * 10} width="9" height="7" rx="1" fill="#1b2732" />),
      )}
    </Frame>
  );
}

export function VflArt({ missing }: ToolArtProps) {
  return (
    <Frame missing={missing}>
      {/* Pen-style locator, tip lit red. */}
      <rect x="30" y="40" width="58" height="14" rx="7" fill={BODY} stroke={LINE} />
      <rect x="82" y="43" width="12" height="8" rx="2" fill="#22323f" />
      <circle cx="99" cy="47" r="4" fill="#ff2d2d" opacity={missing ? 0.5 : 1} />
      {!missing && <circle cx="99" cy="47" r="9" fill="#ff2d2d" opacity="0.22" />}
      <circle cx="44" cy="47" r="3.5" fill="#1b2732" stroke={LINE} />
      <rect x="54" y="44" width="18" height="6" rx="1" fill="#1b2732" />
    </Frame>
  );
}

export function ScopeArt({ missing }: ToolArtProps) {
  return (
    <Frame missing={missing}>
      {/* Video inspection probe: barrel, captive tip, display showing an end-face. */}
      <rect x="14" y="30" width="46" height="32" rx="6" fill={BODY} stroke={LINE} />
      <circle cx="37" cy="46" r="11" fill={DARK} stroke="#22323f" />
      <circle cx="37" cy="46" r="6" fill="#16232c" />
      <circle cx="37" cy="46" r="2" fill="#cfe6ee" />
      <rect x="60" y="41" width="34" height="10" rx="3" fill="#1b2732" stroke={LINE} />
      <rect x="94" y="43" width="12" height="6" rx="2" fill="#22323f" />
    </Frame>
  );
}

export function LaptopArt({ missing }: ToolArtProps) {
  return (
    <Frame missing={missing}>
      {/* Open laptop, terminal on screen. */}
      <path d="M26 18 h68 v44 h-68 z" fill={DARK} stroke={LINE} />
      <path d="M18 62 h84 l6 12 h-96 z" fill={BODY} stroke={LINE} />
      <text x="32" y="32" fontSize="7" fill="var(--green)" fontFamily="ui-monospace, monospace">$ show ont status</text>
      <text x="32" y="42" fontSize="7" fill="#7fd8c9" fontFamily="ui-monospace, monospace">1/1/xp1/14  los</text>
      <text x="32" y="52" fontSize="7" fill={CYAN} fontFamily="ui-monospace, monospace">_</text>
      <rect x="52" y="66" width="16" height="3" rx="1.5" fill="#22323f" />
    </Frame>
  );
}

export const TOOL_ART = {
  otdr: OtdrArt,
  'power-meter': PowerMeterArt,
  vfl: VflArt,
  scope: ScopeArt,
  laptop: LaptopArt,
} as const;
