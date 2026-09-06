/**
 * Mode-transition handlers. Most transitions are declared statically on the vendor
 * profile's commandSet (`transitionsTo`) and applied by execute.ts before the handler
 * even runs; the handlers here only exist for the mode-dependent case ('exit') or to
 * clear config-mode context that a static transition alone wouldn't.
 */
import type { CliMode } from '../../../profiles';
import type { Handler } from './types';

export const enterPrivExec: Handler = () => ({ output: [] });
export const leavePrivExec: Handler = () => ({ output: [] });

export const exitMode: Handler = (ctx) => {
  const mode = ctx.session.mode;
  const nextMode: CliMode = mode === 'interface-config' || mode === 'vlan-config' ? 'global-config' : mode === 'global-config' ? 'priv-exec' : 'user-exec';
  return { output: [], session: { mode: nextMode, contextInterfaceId: undefined, contextVlanId: undefined } };
};

export const endConfig: Handler = () => ({
  output: [],
  session: { mode: 'priv-exec', contextInterfaceId: undefined, contextVlanId: undefined },
});

export const enterGlobalConfig: Handler = (ctx) => ({
  output: ctx.vendorProfile.messages.enterConfig ? [ctx.vendorProfile.messages.enterConfig] : [],
});
