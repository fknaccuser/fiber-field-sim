import { endConfig, enterGlobalConfig, enterPrivExec, exitMode, leavePrivExec } from './exec';
import { showIpInterfaceBrief, showInterfaceDetail, showInterfacesStatus, showTransceiverDetail } from './showInterfaces';
import { showCdpNeighbors, showMacAddressTable, showVlanBrief } from './showL2';
import { showIpOspfNeighbor, showIpRoute } from './showL3';
import { showLogging, showRunningConfig } from './showConfig';
import { ping, traceroute } from './reachability';
import {
  enterInterfaceConfig,
  enterVlanConfig,
  ifAccessVlan,
  ifDescription,
  ifDuplex,
  ifIpAddress,
  ifIpHelper,
  ifIpHelperRemove,
  ifNoShutdown,
  ifShutdown,
  ifSpeed,
  ifSwitchportMode,
  ifTrunkAllowed,
  ifTrunkAllowedAdd,
  ifTrunkNative,
  ipRouteAdd,
  ipRouteRemove,
  vlanName,
} from './config';
import { oltShowAlarms, oltShowOntDetail, oltShowOntStatus, oltShowPonInterface, oltShowPonPort } from './olt';
import { hostIpconfig, hostIpconfigAll, hostNslookup, hostPing, hostTracert } from './host';
import type { Handler } from './types';

export const HANDLERS: Record<string, Handler> = {
  'enter-priv-exec': enterPrivExec,
  'leave-priv-exec': leavePrivExec,
  'exit-mode': exitMode,
  'end-config': endConfig,
  'enter-global-config': enterGlobalConfig,

  'show-ip-interface-brief': showIpInterfaceBrief,
  'show-interfaces-status': showInterfacesStatus,
  'show-interface-detail': showInterfaceDetail,
  'show-transceiver-detail': showTransceiverDetail,

  'show-vlan-brief': showVlanBrief,
  'show-mac-address-table': showMacAddressTable,
  'show-cdp-neighbors': showCdpNeighbors,

  'show-ip-route': showIpRoute,
  'show-ip-ospf-neighbor': showIpOspfNeighbor,

  'show-running-config': showRunningConfig,
  'show-logging': showLogging,

  ping: ping,
  traceroute: traceroute,

  'enter-interface-config': enterInterfaceConfig,
  'enter-vlan-config': enterVlanConfig,
  'vlan-name': vlanName,
  'if-switchport-mode': ifSwitchportMode,
  'if-access-vlan': ifAccessVlan,
  'if-trunk-allowed': ifTrunkAllowed,
  'if-trunk-allowed-add': ifTrunkAllowedAdd,
  'if-trunk-native': ifTrunkNative,
  'if-shutdown': ifShutdown,
  'if-no-shutdown': ifNoShutdown,
  'if-duplex': ifDuplex,
  'if-speed': ifSpeed,
  'if-ip-address': ifIpAddress,
  'if-ip-helper': ifIpHelper,
  'if-ip-helper-remove': ifIpHelperRemove,
  'if-description': ifDescription,
  'ip-route-add': ipRouteAdd,
  'ip-route-remove': ipRouteRemove,

  'olt-show-ont-status': oltShowOntStatus,
  'olt-show-ont-detail': oltShowOntDetail,
  'olt-show-pon-port': oltShowPonPort,
  'olt-show-pon-interface': oltShowPonInterface,
  'olt-show-alarms': oltShowAlarms,

  'host-ipconfig': hostIpconfig,
  'host-ipconfig-all': hostIpconfigAll,
  'host-ping': hostPing,
  'host-nslookup': hostNslookup,
  'host-tracert': hostTracert,
};

export const HANDLER_IDS: readonly string[] = Object.freeze(Object.keys(HANDLERS));
