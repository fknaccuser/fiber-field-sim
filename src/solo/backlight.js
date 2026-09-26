// Backlight mode, like a test set: Night (dark) or Sun (high-contrast light,
// for reading outdoors). With nothing pinned, the system setting decides.
// index.html applies a pinned choice before first paint; this module reads
// and changes it afterwards.

const KEY = 'field-theme';

export function pinnedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'sun' || t === 'night' ? t : null;
  } catch {
    return null;
  }
}

export function effectiveTheme() {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === 'sun' || pinned === 'night') return pinned;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'sun' : 'night';
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* storage off: applies for this session */ }
  const color = theme === 'sun' ? '#e8eae3' : '#131517';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', color);
}

const ICONS = {
  // Shown on the button is the mode you would switch TO.
  sun: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  night: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

export function createThemeToggle() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  const paint = () => {
    const next = effectiveTheme() === 'sun' ? 'night' : 'sun';
    button.innerHTML = `${ICONS[next]}<span>${next === 'sun' ? 'Sun' : 'Night'}</span>`;
    button.setAttribute('aria-label', `Switch to ${next === 'sun' ? 'Sun, the bright outdoor mode' : 'Night, the dark mode'}`);
  };
  button.addEventListener('click', () => {
    setTheme(effectiveTheme() === 'sun' ? 'night' : 'sun');
    paint();
  });
  paint();
  return button;
}
