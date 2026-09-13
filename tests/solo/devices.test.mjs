import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientActions,
  buildPortActions,
  buildRouterSegmentActions,
  buildDnsRecordActions,
  parseVlanList,
  runMissionTest,
} from '../../src/solo/devices.js';
import { createConfigureAttempt } from '../../src/solo/app.js';

test('buildClientActions only includes changed fields', () => {
  const device = { id: 'PC1', ip: '10.42.10.130', prefix: 24, gateway: '10.42.10.1', dns: '10.42.30.53' };
  const noChange = buildClientActions(device, { ip: device.ip, prefix: 24, gateway: device.gateway, dns: device.dns });
  assert.deepEqual(noChange, []);

  const gatewayOnly = buildClientActions(device, { ip: device.ip, prefix: 24, gateway: '10.42.10.254', dns: device.dns });
  assert.deepEqual(gatewayOnly, [{ type: 'setClientGateway', deviceId: 'PC1', gateway: '10.42.10.254' }]);

  const all = buildClientActions(device, { ip: '10.42.10.140', prefix: 24, gateway: '10.42.10.254', dns: '10.42.30.54' });
  assert.equal(all.length, 3);
  assert.equal(all[0].type, 'setClientAddress');
  assert.equal(all[1].type, 'setClientGateway');
  assert.equal(all[2].type, 'setClientDns');
});

test('buildPortActions handles access, trunk and adminUp independently', () => {
  const accessPort = { id: 'SW1:Gi0/1', mode: 'access', adminUp: true, accessVlan: 10, allowedVlans: [] };
  assert.deepEqual(buildPortActions(accessPort, { adminUp: true, accessVlan: '10' }), []);
  assert.deepEqual(buildPortActions(accessPort, { adminUp: false, accessVlan: '10' }), [
    { type: 'setPortAdmin', portId: 'SW1:Gi0/1', adminUp: false },
  ]);
  assert.deepEqual(buildPortActions(accessPort, { adminUp: true, accessVlan: '20' }), [
    { type: 'setAccessVlan', portId: 'SW1:Gi0/1', vlanId: 20 },
  ]);

  const trunkPort = { id: 'SW1:Gi0/24', mode: 'trunk', adminUp: true, accessVlan: 10, allowedVlans: [10, 20] };
  assert.deepEqual(buildPortActions(trunkPort, { adminUp: true, allowedVlans: [10, 20] }), []);
  assert.deepEqual(buildPortActions(trunkPort, { adminUp: true, allowedVlans: [20] }), [
    { type: 'setTrunkAllowedVlans', portId: 'SW1:Gi0/24', vlans: [20] },
  ]);
});

test('parseVlanList tolerates commas, spaces and both', () => {
  assert.deepEqual(parseVlanList('10, 20'), [10, 20]);
  assert.deepEqual(parseVlanList('10 20'), [10, 20]);
  assert.deepEqual(parseVlanList(''), []);
});

test('buildRouterSegmentActions only touches changed segments', () => {
  const device = {
    id: 'R1',
    routerSegments: [
      { portId: 'R1:Gi0/0', vlanId: 10, ip: '10.42.10.1', prefix: 24 },
      { portId: 'R1:Gi0/0', vlanId: 20, ip: '10.42.20.1', prefix: 24 },
    ],
  };
  const draft = {
    'R1:Gi0/0|10': { ip: '10.42.10.1', prefix: 24 },
    'R1:Gi0/0|20': { ip: '10.42.20.9', prefix: 24 },
  };
  const actions = buildRouterSegmentActions(device, draft);
  assert.deepEqual(actions, [
    { type: 'setRouterSegmentAddress', deviceId: 'R1', portId: 'R1:Gi0/0', vlanId: 20, ip: '10.42.20.9', prefix: 24 },
  ]);
});

test('buildDnsRecordActions only touches changed records for the given server', () => {
  const dnsRecords = [{ serverId: 'S1', name: 'portal.northline.test', address: '10.42.30.53' }];
  assert.deepEqual(buildDnsRecordActions('S1', dnsRecords, { 'portal.northline.test': '10.42.30.53' }), []);
  assert.deepEqual(buildDnsRecordActions('S1', dnsRecords, { 'portal.northline.test': '10.42.30.80' }), [
    { type: 'setDnsRecord', serverId: 'S1', name: 'portal.northline.test', address: '10.42.30.80' },
  ]);
});

test('runMissionTest covers all five test kinds against a healthy network', () => {
  const mission = createConfigureAttempt('BR');
  assert.equal(runMissionTest(mission, 'pingGateway', 'PC1').ok, true);
  assert.equal(runMissionTest(mission, 'pingServer', 'PC1').ok, true);
  assert.equal(runMissionTest(mission, 'resolvePortal', 'PC1').ok, true);
  assert.equal(runMissionTest(mission, 'openPortal', 'PC1').ok, true);
  assert.equal(runMissionTest(mission, 'checkProtected', 'PC1').ok, true);
});

test('runMissionTest returns a code for an unknown test kind rather than throwing', () => {
  const mission = createConfigureAttempt('BR');
  const result = runMissionTest(mission, 'flyToTheMoon', 'PC1');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_TEST');
});
