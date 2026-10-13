// The guided and assisted stages of a lab, as pure decisions: which steps
// still need doing, which tiles a step needs on the router as it stands, and
// what the bank of tiles looks like with its traps mixed in.

import { normalizeInterface } from './ios.js';
import { guidedFor } from './guided.js';

export const STAGES = ['guided', 'assisted', 'typed'];
export const STAGE_LABEL = { guided: 'Guided', assisted: 'Assisted', typed: 'Typed' };
export const ENTER = 'Enter';

const CONFIG_MODES = ['config', 'if', 'router', 'line', 'vlan'];
const EXEC_WORDS = ['show', 'ping', 'copy', 'clear', 'reload', 'write'];

// A mode step the router is already in is skipped, so the guide never asks
// you to enter a mode you are standing in.
export function alreadyThere(step, session) {
  const [first, arg] = step.tiles;
  if (first === 'enable') return session.mode !== 'user';
  if (first === 'configure terminal') return CONFIG_MODES.includes(session.mode);
  if (first === 'interface') return session.mode === 'if' && session.ctx.intf === normalizeInterface(arg);
  if (first === 'router ospf') return session.mode === 'router';
  if (first === 'line vty') return session.mode === 'line' && session.ctx.line === 'vty';
  return false;
}

const isExec = (step) => EXEC_WORDS.includes(step.tiles[0]);

// The tiles this step needs right now: EXEC commands asked from a
// configuration mode need "do" in front, and building that is part of it.
export function tilesFor(step, session) {
  if (session.pending) return step.tiles;
  return isExec(step) && CONFIG_MODES.includes(session.mode) ? ['do', ...step.tiles] : step.tiles;
}

export function commandOf(tiles) {
  return tiles.length === 1 && tiles[0] === ENTER ? '' : tiles.join(' ');
}

// A stable shuffle, so the bank does not jump around between taps.
function seeded(key) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return (h >>> 0) / 4294967296; };
}
export function shuffle(list, key) {
  const rnd = seeded(key);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The bank: every tile the command needs plus its traps, shuffled. Tiles are
// objects so two identical words (two "shutdown"s) stay separate buttons.
export function bankFor(step, session, key) {
  const need = tilesFor(step, session).map((text, i) => ({ text, need: i }));
  const traps = (step.traps ?? []).filter(t => !need.some(n => n.text === t.text)).map(t => ({ text: t.text, why: t.why }));
  return shuffle([...need, ...traps], key);
}

// Picking a tile: right and next, right but out of order, or a trap.
export function judge(tile, step, session, built) {
  const need = tilesFor(step, session);
  if (tile.why) return { ok: false, why: tile.why };
  if (tile.need === built.length) return { ok: true, complete: built.length + 1 === need.length };
  const sofar = built.length ? `"${need.slice(0, built.length).join(' ')}"` : 'the start';
  return { ok: false, why: `Right word, wrong place. IOS reads left to right; what comes right after ${sofar}?` };
}

// The goals' guided material, merged onto the lab's goals.
export function guidedGoals(lab) {
  const g = guidedFor(lab.id);
  return lab.goals.map(goal => ({ ...goal, guide: g?.goals?.[goal.id] ?? null }));
}

export const teachFor = (lab) => guidedFor(lab.id)?.teach ?? null;

// Which stage to suggest next for a lab, from its saved result.
export function suggestedStage(result) {
  if (!result?.stages?.guided) return 'guided';
  if (!result.stages.assisted?.clean) return 'assisted';
  return 'typed';
}
