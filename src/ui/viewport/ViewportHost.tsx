import { Component, useRef, type ErrorInfo, type ReactNode } from 'react';

/** One tool crashing must never unmount the dock: React removes the whole tree above an uncaught render error unless a boundary catches it. */
class ViewportErrorBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[viewport:${this.props.label}]`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, color: 'var(--led-alarm)', fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{this.props.label} failed to render.</div>
          <div className="mono" style={{ color: 'var(--muted)', marginTop: 6, fontSize: 12 }}>{this.state.error.message}</div>
          <button type="button" onClick={() => this.setState({ error: null })} style={{ marginTop: 10, minHeight: 40, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--bezel)', background: 'var(--panel)' }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 'unmount': the subtree is removed when inactive. For WebGL/2D-canvas viewports this is
 *   the only way to release GPU memory and stop the render loop; their state lives in the
 *   viewport store so a remount restores it.
 * 'keep-alive': mounted on first activation and then kept in the DOM (display: none) so
 *   cheap panels with live inputs keep their scroll position, focus, and drafts.
 */
export type MountPolicy = 'unmount' | 'keep-alive';

export interface ViewportDef<Id extends string> {
  id: Id;
  label: string;
  policy: MountPolicy;
  render(): ReactNode;
}

export function ViewportHost<Id extends string>({ viewports, active, onActivate }: { viewports: Array<ViewportDef<Id>>; active: Id; onActivate(id: Id): void }) {
  const everActive = useRef(new Set<Id>());
  everActive.current.add(active);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {viewports.map((v) => {
          const isActive = v.id === active;
          if (v.policy === 'unmount') {
            return isActive ? (
              <div key={v.id} style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
                <ViewportErrorBoundary label={v.label}>{v.render()}</ViewportErrorBoundary>
              </div>
            ) : null;
          }
          if (!everActive.current.has(v.id)) return null;
          return (
            <div key={v.id} hidden={!isActive} style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
              <ViewportErrorBoundary label={v.label}>{v.render()}</ViewportErrorBoundary>
            </div>
          );
        })}
      </div>
      <div className="bezel" style={{ display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        {viewports.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onActivate(v.id)}
            style={{
              flex: '1 0 auto',
              minHeight: 48,
              minWidth: 64,
              background: active === v.id ? 'var(--panel-2)' : 'transparent',
              color: active === v.id ? 'var(--text)' : 'var(--muted)',
              border: 'none',
              borderTop: active === v.id ? '2px solid var(--cursor-b)' : '2px solid transparent',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
