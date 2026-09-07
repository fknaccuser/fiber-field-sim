import type { ReactNode } from 'react';

/**
 * Primary action control. Orange is the default because orange is the colour of
 * something that wants your hands; cyan is for actions that only change what you are
 * looking at. Hover runs a light sweep across the face and lifts the glow; disabled stays
 * present and dark the way a real key does rather than vanishing.
 */
export function SoftKey({
  label,
  onClick,
  disabled = false,
  active = false,
  tone = 'orange',
  title,
}: {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'orange' | 'cyan';
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={['hud-btn', tone === 'cyan' ? 'hud-btn--cyan' : '', active ? 'is-on' : ''].filter(Boolean).join(' ')}
    >
      {label}
    </button>
  );
}
