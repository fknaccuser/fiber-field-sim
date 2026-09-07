/**
 * The compass on the world view.
 *
 * Read like a real one: the card turns, the index at the top stays put, and the letter
 * under the index is the way you are facing. Driven by the pure camera pose, so it costs
 * no render loop and stays correct in the accessible list view too.
 */
import { bearingOf, cardinalOf, formatBearing } from './compass';
import type { CameraPose } from './camera';

const TICKS = [0, 45, 90, 135, 180, 225, 270, 315];
const LETTERS: Array<[number, string]> = [
  [0, 'N'],
  [90, 'E'],
  [180, 'S'],
  [270, 'W'],
];

export function CompassRose({ pose }: { pose: CameraPose }) {
  const bearing = bearingOf(pose);
  const facing = cardinalOf(bearing);
  const R = 26;

  return (
    <div
      className="glass"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 6px', borderRadius: 4, pointerEvents: 'none' }}
      aria-label={`Facing ${facing}, bearing ${formatBearing(bearing)}`}
      role="img"
    >
      <svg width={R * 2 + 4} height={R * 2 + 4} viewBox={`${-R - 2} ${-R - 2} ${R * 2 + 4} ${R * 2 + 4}`} aria-hidden="true">
        {/* Fixed index: the lubber line you read the heading against. */}
        <polygon points={`0,${-R - 1} 4,${-R + 6} -4,${-R + 6}`} fill="var(--orange)" />
        <circle cx={0} cy={0} r={R} fill="none" stroke="var(--cyan)" strokeWidth={1} opacity={0.5} />

        {/* The card turns under the index. */}
        <g transform={`rotate(${-bearing})`}>
          {TICKS.map((t) => (
            <line
              key={t}
              x1={0}
              y1={-R + 2}
              x2={0}
              y2={t % 90 === 0 ? -R + 8 : -R + 5}
              stroke="var(--cyan)"
              strokeWidth={t % 90 === 0 ? 1.4 : 0.8}
              opacity={t % 90 === 0 ? 0.9 : 0.45}
              transform={`rotate(${t})`}
            />
          ))}
          {LETTERS.map(([deg, ch]) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const rr = R - 14;
            return (
              <text
                key={ch}
                x={Math.cos(rad) * rr}
                y={Math.sin(rad) * rr + 3}
                fontSize={9}
                textAnchor="middle"
                fill={ch === 'N' ? 'var(--orange)' : 'var(--ink-soft)'}
                fontFamily="var(--font-display)"
                letterSpacing={0.5}
              >
                {ch}
              </text>
            );
          })}
          {/* Needle: the red end points north, as it does on the real thing. */}
          <line x1={0} y1={6} x2={0} y2={-R + 9} stroke="var(--orange)" strokeWidth={1.6} />
          <line x1={0} y1={6} x2={0} y2={R - 9} stroke="var(--ink-faint)" strokeWidth={1.2} />
          <circle cx={0} cy={0} r={2} fill="var(--cyan)" />
        </g>
      </svg>

      <div style={{ lineHeight: 1.15 }}>
        <div className="hud-title" style={{ fontSize: 15, color: 'var(--cyan)' }}>
          {facing}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
          {formatBearing(bearing)}
        </div>
      </div>
    </div>
  );
}
