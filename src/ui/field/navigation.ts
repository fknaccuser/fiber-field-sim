export type TabId = 'map' | 'shelf' | 'otdr' | 'power-meter' | 'vfl' | 'scope' | 'terminal' | 'phone' | 'records' | 'diagnose' | 'excavate';

/** Everything you reach by opening the truck rather than off the print. */
export const SHELF_TABS: readonly TabId[] = ['shelf', 'otdr', 'power-meter', 'vfl', 'scope', 'terminal', 'records', 'diagnose', 'excavate'];
export type ToolPresentation = 'raised' | 'stowed' | 'enlarged';
export interface DockPlace { tab: TabId; presentation: ToolPresentation }

export function pushPlace(stack: DockPlace[], next: DockPlace): DockPlace[] {
  const current = stack[stack.length - 1];
  return current?.tab === next.tab && current.presentation === next.presentation ? stack : [...stack, next];
}

export function presentTool(stack: DockPlace[], presentation: ToolPresentation): DockPlace[] {
  const current = stack[stack.length - 1];
  if (!current || current.presentation === presentation) return stack;
  const next = { ...current, presentation };
  return presentation === 'enlarged' ? pushPlace(stack, next) : [...stack.slice(0, -1), next];
}

/** A deliberate downward stroke, not a tap, horizontal drag, or slow screen scroll. */
export function isStowSwipe(dx: number, dy: number, elapsedMs: number): boolean {
  return dy >= 64 && dy > Math.abs(dx) * 1.5 && elapsedMs > 0 && elapsedMs <= 700;
}
