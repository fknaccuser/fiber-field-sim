// The spotlight overlay: dims the whole screen except one thing, rings that
// thing, and shows one instruction card. Only the lit target and the card take
// taps, so there is never a question of where to press next.
//
// The dimming is four blocking panels around a hole rather than one layer
// with a cut-out, because the lit target can be inside the SVG map, where no
// z-index trick reaches. The hole follows the target every frame, so panning
// or scrolling the map keeps it lit.
//
// One overlay lives across re-renders: each mount moves it into the new
// screen and swaps the card. The ring and the dimming then glide from the
// last target to the next instead of blinking, and the card stays put.

const PAD = 8;
const GAP = 12;

function unionRect(elements) {
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    top = Math.min(top, r.top); left = Math.min(left, r.left);
    right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
  }
  return Number.isFinite(top) ? { top, left, right, bottom } : null;
}

function scrollParent(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node instanceof SVGElement) continue;
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

const overlaps = (a, b) => a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left;

let live = null;

function build() {
  const overlay = document.createElement('div');
  overlay.className = 'spotlight';
  overlay.dataset.cardAt = 'bottom';
  const slot = document.createElement('div');
  slot.className = 'spotlight-slot';
  const blockers = ['top', 'right', 'bottom', 'left'].map((side) => {
    const b = document.createElement('div');
    b.className = `spotlight-block spotlight-block-${side}`;
    // A tap on the dimmed area points back at the card rather than doing nothing.
    b.addEventListener('click', () => {
      const card = slot.firstElementChild;
      if (!card) return;
      card.classList.remove('is-nudged');
      void card.offsetWidth;
      card.classList.add('is-nudged');
    });
    overlay.append(b);
    return b;
  });
  const ring = document.createElement('div');
  ring.className = 'spotlight-ring';
  ring.setAttribute('aria-hidden', 'true');
  ring.hidden = true;
  overlay.append(ring, slot);
  return { overlay, slot, blockers, ring, running: false, stepKey: null, resolve: () => [], settled: false, last: '' };
}

const place = (el, top, left, width, height) => {
  el.style.top = `${top}px`; el.style.left = `${left}px`;
  el.style.width = `${Math.max(0, width)}px`; el.style.height = `${Math.max(0, height)}px`;
};

function frame() {
  const s = live;
  if (!s || !s.overlay.isConnected) { if (s) s.running = false; return; }
  const vw = window.innerWidth, vh = window.innerHeight;
  const card = s.slot.firstElementChild;

  // The card sits at the bottom, above the tab bar when there is one, in the
  // same place every step. It moves to the top only when it would cover the
  // thing it is pointing at and scrolling cannot clear it.
  const tabs = s.overlay.parentElement?.querySelector('.mission-tabs');
  const tabsRect = tabs?.getBoundingClientRect();
  const floor = tabsRect && tabsRect.height && tabsRect.top > vh / 2 ? vh - tabsRect.top + GAP : GAP;
  s.overlay.style.setProperty('--spot-floor', `${Math.round(floor)}px`);

  const targets = s.resolve() ?? [];
  let rect = targets.length ? unionRect(targets) : null;

  if (rect && card && !s.settled) {
    s.settled = true;
    // Measure with the card in its usual place; nothing paints in between.
    s.overlay.dataset.cardAt = 'bottom';
    const cardRect = card.getBoundingClientRect();
    // Panels scroll; the map does not (it fits itself to its frame), so a
    // target on the map is cleared by moving the card instead.
    const scroller = targets[0] instanceof SVGElement ? null : scrollParent(targets[0]);
    const box = scroller?.getBoundingClientRect() ?? { top: 0, bottom: vh };
    const ceiling = Math.min(box.bottom, cardRect.top - GAP);
    if (scroller && (rect.bottom > ceiling || rect.top < box.top)) {
      // Instant, so the new position can be measured in this same frame.
      scroller.scrollBy({ top: rect.bottom > ceiling ? rect.bottom - ceiling + PAD : rect.top - box.top - PAD, behavior: 'instant' });
      rect = unionRect(targets);
    }
    if (rect && overlaps(rect, card.getBoundingClientRect())) {
      // Still covered with the card at the bottom: put the card on top and
      // bring the target down below it instead.
      s.overlay.dataset.cardAt = 'top';
      const below = card.getBoundingClientRect().bottom + GAP;
      if (scroller && rect.top < below) {
        scroller.scrollBy({ top: rect.top - below - PAD, behavior: 'instant' });
        rect = unionRect(targets);
      }
    }
  }

  // Keep watching after that: the map can pan or refit under the card, and
  // then the card swaps to the other edge, where it covers less of the target.
  if (rect && card) {
    const c = card.getBoundingClientRect();
    const h = c.height;
    const bottomBox = { top: vh - floor - h, bottom: vh - floor, left: c.left, right: c.right };
    const topBox = { top: GAP, bottom: GAP + h, left: c.left, right: c.right };
    const cover = (b) => (overlaps(rect, b) ? Math.min(rect.bottom, b.bottom) - Math.max(rect.top, b.top) : 0);
    const atBottom = s.overlay.dataset.cardAt !== 'top';
    const here = cover(atBottom ? bottomBox : topBox), there = cover(atBottom ? topBox : bottomBox);
    if (here > 0 && there < here) s.overlay.dataset.cardAt = atBottom ? 'top' : 'bottom';
  }

  // With nothing to point at, the card goes home to the bottom, unless the
  // on-screen keyboard is up, which would cover it there.
  const keyboard = window.visualViewport && window.visualViewport.height < vh * 0.75;
  if (keyboard) s.overlay.dataset.cardAt = 'top';
  else if (!rect) s.overlay.dataset.cardAt = 'bottom';

  let key;
  if (rect) {
    const top = Math.max(0, rect.top - PAD), left = Math.max(0, rect.left - PAD);
    const right = Math.min(vw, rect.right + PAD), bottom = Math.min(vh, rect.bottom + PAD);
    key = [top, left, right, bottom].map(Math.round).join(',');
    if (key !== s.last) {
      place(s.blockers[0], 0, 0, vw, top);
      place(s.blockers[1], top, right, vw - right, bottom - top);
      place(s.blockers[2], bottom, 0, vw, vh - bottom);
      place(s.blockers[3], top, 0, left, bottom - top);
      place(s.ring, top, left, right - left, bottom - top);
      s.ring.hidden = false;
    }
  } else {
    key = `none:${vw}x${vh}`;
    if (key !== s.last) {
      place(s.blockers[0], 0, 0, vw, vh);
      for (const b of s.blockers.slice(1)) place(b, 0, 0, 0, 0);
      s.ring.hidden = true;
    }
  }
  s.last = key;
  requestAnimationFrame(frame);
}

// mountSpotlight(host, { card, resolve, stepKey }) moves the one overlay into
// host and shows card. resolve() returns the elements to light, or [] for a
// card with nothing to point at. A new stepKey re-checks the placement and
// plays the card's arrival; the same step just swaps the card in place.
export function mountSpotlight(host, { card, resolve, stepKey }) {
  if (!live) live = build();
  const s = live;
  card.classList.add('spotlight-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  const fresh = s.stepKey !== stepKey;
  if (fresh) card.classList.add('is-new');
  // Every render builds a fresh screen with its scroll reset, so the target
  // is cleared of the card again each time, not only when the step changes.
  s.settled = false;
  s.stepKey = stepKey;
  s.resolve = resolve;
  s.slot.replaceChildren(card);
  s.overlay.dataset.step = stepKey ?? '';
  host.append(s.overlay);
  if (!s.running) { s.running = true; requestAnimationFrame(frame); }
  return s.overlay;
}
