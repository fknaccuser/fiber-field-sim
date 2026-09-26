// The collection as a patch panel: one numbered port per concept, its LED
// green when earned, orange when practiced, dark when unseen. Shared by the
// home screen and the exam prep collection.

function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

const PORT_STATE_TEXT = { earned: 'earned', practiced: 'practiced', unseen: 'not started' };

export function renderPatchPanel(rows, { onOpen, compact = false } = {}) {
  const panel = h('div', `patch-panel${compact ? ' is-compact' : ''}`);
  panel.setAttribute('role', 'list');
  panel.setAttribute('aria-label', 'Skills collection');
  rows.forEach((row, index) => {
    const port = h(onOpen ? 'button' : 'div', `patch-port is-${row.state}`);
    if (onOpen) { port.type = 'button'; port.addEventListener('click', () => onOpen(row.id)); }
    port.setAttribute('role', 'listitem');
    port.setAttribute('aria-label', `${row.label}: ${PORT_STATE_TEXT[row.state]}`);
    port.title = `${row.label}: ${PORT_STATE_TEXT[row.state]}`;
    const jack = h('span', 'patch-jack');
    jack.append(h('span', 'patch-led'));
    port.append(h('span', 'patch-num', String(index + 1).padStart(2, '0')), jack);
    if (!compact) port.append(h('span', 'patch-label', row.label));
    panel.append(port);
  });
  return panel;
}

