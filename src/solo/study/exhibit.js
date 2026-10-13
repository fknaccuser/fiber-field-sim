// Console exhibits: router output shown in a terminal box, with the parts that
// matter painted in colors and a legend that names each color.
//
// An exhibit is { text, marks }. Each mark is [needle, kind, label?]:
//   needle  a string (every occurrence is marked) or a RegExp (every match;
//           the g flag is added for you)
//   kind    one of KINDS below; it picks the color
//   label   optional legend wording for this mark ("Next hop to R2"); marks
//           with the same kind and label share one legend row
// Earlier marks win where two overlap, so list the specific before the broad.
//
// Highlights teach reading: they show in Know checks, quizzes and the console
// drill, and in exams only after the question is answered.

export const KINDS = {
  cmd: { label: 'Command typed', color: '#f4f7f5' },
  prompt: { label: 'Prompt: device and mode', color: '#9aa8b1' },
  ip: { label: 'IP address', color: '#5cc8ff' },
  mask: { label: 'Mask or prefix length', color: '#7ee0d6' },
  iface: { label: 'Interface', color: '#c49bff' },
  hop: { label: 'Next hop', color: '#f2c12e' },
  gw: { label: 'Default gateway', color: '#ffb454' },
  dns: { label: 'DNS server', color: '#ff8fd0' },
  mac: { label: 'MAC address', color: '#9be15d' },
  vlan: { label: 'VLAN', color: '#ff9f43' },
  code: { label: 'Route source code', color: '#ffd166' },
  metric: { label: '[AD/metric]', color: '#e0aaff' },
  state: { label: 'State or status', color: '#8ab4f8' },
  role: { label: 'Role', color: '#b4f0a8' },
  ok: { label: 'Where it works', color: '#4fd18b' },
  fail: { label: 'Where it fails', color: '#ff6b6b' },
  count: { label: 'Counter', color: '#f6a5c0' },
  key: { label: 'Key setting', color: '#ffe08a' },
};

const asGlobal = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

// markRanges(exhibit) -> { ranges: [{ start, end, kind, label }], missing: [needle] }
// Ranges are sorted and never overlap. `missing` lists needles that matched
// nothing, which the bank's checks turn into an error.
export function markRanges(exhibit) {
  const text = exhibit?.text ?? '';
  const taken = [];
  const missing = [];
  const free = (s, e) => taken.every(r => e <= r.start || s >= r.end);
  for (const [needle, kind, label] of exhibit?.marks ?? []) {
    let hit = false;
    if (needle instanceof RegExp) {
      const re = asGlobal(needle);
      let m;
      while ((m = re.exec(text))) {
        if (!m[0].length) { re.lastIndex += 1; continue; }
        hit = true;
        if (free(m.index, m.index + m[0].length)) taken.push({ start: m.index, end: m.index + m[0].length, kind, label: label ?? KINDS[kind]?.label ?? kind });
      }
    } else {
      let at = text.indexOf(needle);
      while (needle && at !== -1) {
        hit = true;
        if (free(at, at + needle.length)) taken.push({ start: at, end: at + needle.length, kind, label: label ?? KINDS[kind]?.label ?? kind });
        at = text.indexOf(needle, at + needle.length);
      }
    }
    if (!hit) missing.push(String(needle));
  }
  return { ranges: taken.sort((a, b) => a.start - b.start), missing };
}

// legendOf(exhibit) -> [{ kind, label, color }] in first-seen order.
export function legendOf(exhibit) {
  const seen = new Map();
  for (const r of markRanges(exhibit).ranges.sort((a, b) => a.start - b.start)) {
    const k = `${r.kind}|${r.label}`;
    if (!seen.has(k)) seen.set(k, { kind: r.kind, label: r.label, color: KINDS[r.kind]?.color ?? '#ffffff' });
  }
  return [...seen.values()];
}

// renderExhibit(exhibit, { highlight, hint }) -> <figure>. Without highlight
// the output is plain, as on the exam, with an optional hint line under it.
export function renderExhibit(exhibit, { highlight = true, hint = '' } = {}) {
  const fig = document.createElement('figure');
  fig.className = `ep-exhibit${highlight ? ' is-marked' : ''}`;
  const pre = document.createElement('pre');
  pre.className = 'ep-exhibit-text';
  pre.setAttribute('data-no-gloss', '');
  const text = exhibit.text;
  if (!highlight) pre.textContent = text;
  else {
    let at = 0;
    for (const r of markRanges(exhibit).ranges) {
      if (r.start > at) pre.append(text.slice(at, r.start));
      const span = document.createElement('mark');
      span.className = `ep-mark k-${r.kind}`;
      span.style.setProperty('--mk', KINDS[r.kind]?.color ?? '#ffffff');
      span.title = r.label;
      span.textContent = text.slice(r.start, r.end);
      pre.append(span);
      at = r.end;
    }
    if (at < text.length) pre.append(text.slice(at));
  }
  fig.append(pre);
  if (highlight) {
    // One legend row per color: marks that share a kind share a swatch, so
    // their labels are listed together rather than as look-alike rows.
    const byKind = new Map();
    for (const item of legendOf(exhibit)) {
      if (!byKind.has(item.kind)) byKind.set(item.kind, { color: item.color, labels: [] });
      byKind.get(item.kind).labels.push(item.label);
    }
    if (byKind.size) {
      const cap = document.createElement('figcaption');
      cap.className = 'ep-legend';
      for (const { color, labels } of byKind.values()) {
        const row = document.createElement('span');
        row.className = 'ep-legend-item';
        const sw = document.createElement('span');
        sw.className = 'ep-swatch';
        sw.style.setProperty('--mk', color);
        row.append(sw, document.createTextNode(labels.join(' · ')));
        cap.append(row);
      }
      fig.append(cap);
    }
  } else if (hint) {
    const cap = document.createElement('figcaption');
    cap.className = 'ep-legend-hint';
    cap.textContent = hint;
    fig.append(cap);
  }
  return fig;
}
