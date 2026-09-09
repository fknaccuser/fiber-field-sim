/**
 * What each kind of plant is called when it is listed rather than drawn.
 *
 * Shared by the truck-roll picker and the print's plant index so the two never disagree
 * about what a `fat` is — a trainee who sees one name on the drawing and another in the
 * list learns that the simulator is sloppy, which is the one lesson it must not teach.
 */
import type { NodeKind } from '../../world';

export const KIND_LABELS: Partial<Record<NodeKind, string>> = {
  olt: 'OLT',
  fdh: 'FDH',
  splitter: 'Splitters',
  'splice-closure': 'Closures',
  terminal: 'Terminals / NAPs',
  fat: 'FATs',
  ont: 'ONTs',
  'customer-premise': 'Customer premises',
  'network-device': 'Network devices',
  yard: 'Yard',
  pop: 'POP',
};

export function kindLabel(kind: NodeKind): string {
  return KIND_LABELS[kind] ?? kind.replace(/-/g, ' ');
}
