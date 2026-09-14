// Geometry shared by fit-to-content and the resizable list drawer.
export function fitTopologyBounds(bounds, width, height, padding = 28) {
  if (![bounds.x, bounds.y, bounds.width, bounds.height, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const k = Math.max(Number.EPSILON, Math.min(1.5, Math.max(1, width - padding * 2) / Math.max(1, bounds.width), Math.max(1, height - padding * 2) / Math.max(1, bounds.height)));
  return { k, x: width / 2 - (bounds.x + bounds.width / 2) * k, y: height / 2 - (bounds.y + bounds.height / 2) * k };
}

export function resizeTopologyDrawer(startHeight, deltaY, availableHeight, minimumCanvas = 240) {
  return Math.max(0, Math.min(Math.max(0, availableHeight - minimumCanvas), startHeight - deltaY));
}
