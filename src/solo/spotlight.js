// The spotlight overlay: dims the whole screen except one thing, rings that
// thing, and shows one instruction card. Only the lit target and the card take
// taps, so there is never a question of where to press next.
//
// The dimming is four blocking panels around a hole rather than one layer
// with a cut-out, because the lit target can be inside the SVG map, where no
// z-index trick reaches. The hole follows the target every frame, so panning
// or scrolling the map keeps it lit.

const PAD = 8;

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

function scrollBox(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node instanceof SVGElement) continue;
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node.getBoundingClientRect();
  }
  return null;
}

// mountSpotlight(host, { card, resolve, stepKey }) appends the overlay to host
// and keeps it placed until host leaves the document. resolve() returns the
// elements to light, or [] for a card with nothing to point at.
export function mountSpotlight(host, { card, resolve, stepKey }) {
  const overlay = document.createElement('div');
  overlay.className = 'spotlight';
  const blockers = ['top', 'right', 'bottom', 'left'].map((side) => {
    const b = document.createElement('div');
    b.className = `spotlight-block spotlight-block-${side}`;
    // A tap on the dimmed area points back at the card rather than doing nothing.
    b.addEventListener('click', () => {
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
  card.classList.add('spotlight-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  overlay.append(ring, card);
  host.append(overlay);

  const place = (el, top, left, width, height) => {
    el.style.top = `${top}px`; el.style.left = `${left}px`;
    el.style.width = `${Math.max(0, width)}px`; el.style.height = `${Math.max(0, height)}px`;
  };

  let scrolled = false;
  let last = '';
  const frame = () => {
    if (!overlay.isConnected) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const targets = resolve() ?? [];
    const rect = targets.length ? unionRect(targets) : null;
    if (rect && !scrolled) {
      scrolled = true;
      // Visible means inside whatever scrolling panel holds it, not just
      // inside the window: a panel can end behind the tab bar.
      const box = scrollBox(targets[0]) ?? { top: 0, left: 0, bottom: vh, right: vw };
      const visible = rect.top >= Math.max(0, box.top) && rect.bottom <= Math.min(vh, box.bottom)
        && rect.left >= Math.max(0, box.left) && rect.right <= Math.min(vw, box.right);
      if (!visible) { targets[0].scrollIntoView?.({ block: 'center', inline: 'nearest' }); last = ''; }
    }
    let key;
    if (rect) {
      const top = Math.max(0, rect.top - PAD), left = Math.max(0, rect.left - PAD);
      const right = Math.min(vw, rect.right + PAD), bottom = Math.min(vh, rect.bottom + PAD);
      key = [top, left, right, bottom].map(Math.round).join(',');
      if (key !== last) {
        place(blockers[0], 0, 0, vw, top);
        place(blockers[1], top, right, vw - right, bottom - top);
        place(blockers[2], bottom, 0, vw, vh - bottom);
        place(blockers[3], top, 0, left, bottom - top);
        place(ring, top, left, right - left, bottom - top);
        ring.hidden = false;
        // Put the card in whichever half of the screen the target is not in.
        overlay.dataset.cardAt = (top + bottom) / 2 > vh / 2 ? 'top' : 'bottom';
      }
    } else {
      key = `none:${vw}x${vh}`;
      if (key !== last) {
        place(blockers[0], 0, 0, vw, vh);
        for (const b of blockers.slice(1)) place(b, 0, 0, 0, 0);
        ring.hidden = true;
        overlay.dataset.cardAt = 'middle';
      }
    }
    last = key;
    requestAnimationFrame(frame);
  };
  overlay.dataset.step = stepKey ?? '';
  requestAnimationFrame(frame);
  return overlay;
}
