import { describe, expect, it } from 'vitest';
import { isStowSwipe, presentTool, pushPlace, type DockPlace } from './navigation';

describe('instrument navigation', () => {
  it('returns from enlarged to raised before leaving the tool', () => {
    const print: DockPlace = { tab: 'map', presentation: 'raised' };
    const tool: DockPlace = { tab: 'otdr', presentation: 'raised' };
    let stack = pushPlace([print], tool);
    stack = presentTool(stack, 'enlarged');
    expect(stack.slice(0, -1)).toEqual([print, tool]);
    expect(stack[0]).toEqual(print);
  });
  it('stows and raises ten times without adding back steps', () => {
    const initial: DockPlace[] = [{ tab: 'map', presentation: 'raised' }, { tab: 'power-meter', presentation: 'raised' }];
    let stack = initial;
    for (let i = 0; i < 10; i++) {
      stack = presentTool(stack, 'stowed');
      expect(stack.at(-1)?.presentation).toBe('stowed');
      stack = presentTool(stack, 'raised');
    }
    expect(stack).toEqual(initial);
    expect(stack.slice(0, -1)).toEqual([initial[0]]);
  });
  it('does not add a back step for selecting the current view again', () => {
    const stack: DockPlace[] = [{ tab: 'scope', presentation: 'raised' }];
    expect(pushPlace(stack, { ...stack[0]! })).toBe(stack);
  });
  it('accepts a deliberate downward swipe', () => {
    expect(isStowSwipe(12, 90, 300)).toBe(true);
    expect(isStowSwipe(-12, 64, 700)).toBe(true);
  });
  it('rejects taps, upwards drags, horizontal drags and slow scrolling', () => {
    for (const [x, y, ms] of [[0, 8, 100], [0, -100, 200], [100, 90, 200], [0, 100, 900], [0, 100, 0]]) {
      expect(isStowSwipe(x!, y!, ms!)).toBe(false);
    }
  });
});
