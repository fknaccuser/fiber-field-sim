// Drag-and-drop questions: match, order, and sort into buckets.
//
// Pieces can be dragged onto a slot, or tapped and then the slot tapped,
// which is the reliable way on a phone and with a keyboard. A piece already
// placed can be picked up again; dropping it on the tray sends it back.
//
// The answer lives in state.pick, the same shape isCorrect reads:
//   match  pick[left]  = index of the right-hand side placed against it
//   order  pick[slot]  = index of the step placed in that position
//   sort   pick[item]  = index of the bucket the item was put in
// state.sel is the piece in hand: { piece } or null.

const DRAG_PX = 6;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Pieces are the things you move; slots are where they go.
function model(q, shown) {
  if (q.format === 'match') {
    return {
      pieces: shown.rightOrder.map(i => ({ id: i, text: q.pairs[i].right })),
      slots: q.pairs.map((p, i) => ({ id: i, label: p.left, many: false })),
      placedIn: (pick, piece) => pick.findIndex(v => v === piece),
      inSlot: (pick, slot) => (pick[slot] === undefined ? [] : [pick[slot]]),
      put: (pick, piece, slot) => { const next = Array.from({ length: q.pairs.length }, (_, i) => (pick[i] === piece ? undefined : pick[i])); next[slot] = piece; return next; },
      take: (pick, piece) => Array.from({ length: q.pairs.length }, (_, i) => (pick[i] === piece ? undefined : pick[i])),
      right: (slot) => [slot],
      label: (piece) => q.pairs[piece].right,
    };
  }
  if (q.format === 'order') {
    return {
      pieces: shown.shownOrder.map(i => ({ id: i, text: q.steps[i] })),
      slots: q.steps.map((_, i) => ({ id: i, label: String(i + 1), many: false, numbered: true })),
      placedIn: (pick, piece) => pick.findIndex(v => v === piece),
      inSlot: (pick, slot) => (pick[slot] === undefined ? [] : [pick[slot]]),
      put: (pick, piece, slot) => { const next = Array.from({ length: q.steps.length }, (_, i) => (pick[i] === piece ? undefined : pick[i])); next[slot] = piece; return next; },
      take: (pick, piece) => Array.from({ length: q.steps.length }, (_, i) => (pick[i] === piece ? undefined : pick[i])),
      right: (slot) => [slot],
      label: (piece) => q.steps[piece],
    };
  }
  return {
    pieces: shown.itemOrder.map(i => ({ id: i, text: q.items[i].text })),
    slots: q.buckets.map((b, i) => ({ id: i, label: b, many: true })),
    placedIn: (pick, piece) => (pick[piece] === undefined ? -1 : pick[piece]),
    inSlot: (pick, slot) => shown.itemOrder.filter(i => pick[i] === slot),
    put: (pick, piece, slot) => { const next = Array.from({ length: q.items.length }, (_, i) => pick[i]); next[piece] = slot; return next; },
    take: (pick, piece) => { const next = Array.from({ length: q.items.length }, (_, i) => pick[i]); next[piece] = undefined; return next; },
    right: (slot) => q.items.map((it, i) => (it.bucket === slot ? i : -1)).filter(i => i >= 0),
    label: (piece) => q.items[piece].text,
  };
}

// How many pieces are placed, and how many must be.
export function dragProgress(q, pick) {
  const need = q.format === 'match' ? q.pairs.length : q.format === 'order' ? q.steps.length : q.items.length;
  return { placed: pick.filter(v => v !== undefined && v !== null).length, need };
}

export const dragHelp = (q) => (q.format === 'order'
  ? 'Drag each step into its place, or tap a step and then a numbered slot.'
  : q.format === 'match' ? 'Drag each answer onto the item it matches, or tap one and then the item.'
  : 'Drag each item into a group, or tap it and then the group.');

// renderDrag(q, shown, state, { graded, onChange }) -> element
export function renderDrag(q, shown, state, { graded = false, onChange } = {}) {
  const m = model(q, shown);
  const pick = state.pick;
  const wrap = el('div', `dd dd-${q.format}${graded ? ' is-graded' : ''}`);
  const held = state.sel?.piece ?? null;
  const commit = (next, sel = null) => { state.pick = next; state.sel = sel; onChange?.(); };

  function chip(piece, where) {
    const b = el('button', `dd-chip${held === piece ? ' is-held' : ''}`, m.label(piece));
    b.type = 'button';
    b.dataset.piece = String(piece);
    if (graded) { b.disabled = true; return b; }
    b.setAttribute('aria-pressed', String(held === piece));
    b.setAttribute('aria-label', `${m.label(piece)}${where === null ? '' : `, placed in ${m.slots[where].label}`}`);
    b.addEventListener('click', (e) => {
      if (b.dataset.dragged) { delete b.dataset.dragged; return; }
      e.stopPropagation();
      commit(pick, held === piece ? null : { piece });
    });
    b.addEventListener('pointerdown', (e) => startDrag(e, b, piece));
    return b;
  }

  // Dragging: a floating copy follows the pointer; whatever slot is under
  // it on release gets the piece. Short moves stay taps.
  function startDrag(e, src, piece) {
    if (e.button !== undefined && e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_PX) return;
        ghost = src.cloneNode(true);
        ghost.classList.add('dd-ghost');
        ghost.style.width = `${src.offsetWidth}px`;
        document.body.append(ghost);
        src.classList.add('is-lifted');
      }
      ev.preventDefault();
      ghost.style.transform = `translate(${ev.clientX - src.offsetWidth / 2}px, ${ev.clientY - 18}px)`;
      for (const s of wrap.querySelectorAll('.dd-slot, .dd-tray')) s.classList.remove('is-over');
      hit(ev)?.classList.add('is-over');
    };
    const hit = (ev) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      return under?.closest?.('.dd-slot, .dd-tray') ?? null;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!ghost) return;
      src.dataset.dragged = '1';
      ghost.remove();
      src.classList.remove('is-lifted');
      const target = ev.type === 'pointercancel' ? null : hit(ev);
      if (!target) { onChange?.(); return; }
      if (target.classList.contains('dd-tray')) commit(m.take(pick, piece));
      else commit(m.put(pick, piece, Number(target.dataset.slot)));
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // The slots.
  const board = el('div', 'dd-board');
  for (const slot of m.slots) {
    const inside = m.inSlot(pick, slot.id);
    const s = el('div', `dd-slot${slot.many ? ' is-bucket' : ''}${slot.numbered ? ' is-numbered' : ''}`);
    s.dataset.slot = String(slot.id);
    const head = el('div', 'dd-slot-label', slot.label);
    s.append(head);
    const body = el('div', 'dd-slot-body');
    for (const piece of inside) {
      const c = chip(piece, slot.id);
      if (graded) c.classList.add(m.right(slot.id).includes(piece) ? 'is-right' : 'is-wrong');
      body.append(c);
    }
    if (!inside.length) body.append(el('span', 'dd-empty', graded ? 'left empty' : slot.many ? 'Drop here' : '·'));
    s.append(body);
    if (graded) {
      const want = m.right(slot.id);
      const ok = want.length === inside.length && want.every(p => inside.includes(p));
      s.classList.add(ok ? 'is-right' : 'is-wrong');
      if (!ok) s.append(el('p', 'dd-answer', `Answer: ${want.map(p => m.label(p)).join(', ')}`));
    } else {
      s.setAttribute('role', 'button');
      s.tabIndex = 0;
      s.setAttribute('aria-label', `${slot.numbered ? 'Position ' : ''}${slot.label}${inside.length ? `, holds ${inside.map(p => m.label(p)).join(', ')}` : ', empty'}`);
      const place = () => { if (held !== null) commit(m.put(pick, held, slot.id)); };
      s.addEventListener('click', place);
      s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(); } });
    }
    board.append(s);
  }

  // The tray of pieces not yet placed.
  if (!graded) {
    const tray = el('div', 'dd-tray');
    tray.setAttribute('aria-label', 'Pieces to place');
    const loose = m.pieces.filter(p => m.placedIn(pick, p.id) < 0);
    for (const p of loose) tray.append(chip(p.id, null));
    if (!loose.length) tray.append(el('span', 'dd-empty', 'All placed. Tap a piece to move it.'));
    tray.addEventListener('click', () => { if (held !== null && m.placedIn(pick, held) >= 0) commit(m.take(pick, held)); });
    wrap.append(tray);
  }
  wrap.append(board);
  return wrap;
}
