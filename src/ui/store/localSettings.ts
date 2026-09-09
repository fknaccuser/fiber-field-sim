/**
 * `localStorage`, for the places `localStorage` is not there.
 *
 * Reading or writing it is not safe to do bare. It throws — on *property access*, before you
 * have called anything — in a sandboxed iframe without `allow-same-origin`, which is how HTML
 * preview panes are usually rendered; in Safari private windows on older versions; and in any
 * browser told to block site data. It can also throw on write when the quota is full.
 *
 * That mattered here: the dispatch screen read the day seed at first render, so in a preview
 * pane the whole app threw before it painted anything and the page showed its background and
 * nothing else, with the reason in a console nobody has open.
 *
 * None of what is kept here is worth failing over. It is which day seed you were on, which
 * grade you picked, whether you had started the shift — conveniences that make a reload land
 * where you left off. Without them the app opens on a fresh day, which is a perfectly good
 * day. So every access degrades to a default and the app keeps running.
 */

/** Read a key, or the fallback when there is nowhere to read from. */
export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a key. Silent no-op where storage is unavailable or full. */
export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing to do and nothing worth telling the trainee: the shift still runs, it just
    // will not be waiting for them after a reload.
  }
}

export function clearSetting(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // As above.
  }
}
