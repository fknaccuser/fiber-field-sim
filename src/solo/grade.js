// Completion evaluation and run summaries (ENGINE_RULES.md "Completion").
// Pure: no DOM, no fetch, no Date.now — summarizeRun's completedAt is
// supplied by the caller (an additive second parameter beyond ENGINE_RULES.md's
// one-argument summary line; app.js is the only caller and is where the
// clock is allowed to be read).

import { testService } from './forward.js';
import { inSubnet } from './ip.js';

function findSwitchPort(network, deviceId) {
  const ownPort = network.ports.find((p) => p.deviceId === deviceId);
  if (!ownPort) return null;
  const link = network.links.find((l) => l.aPortId === ownPort.id || l.bPortId === ownPort.id);
  if (!link) return null;
  const switchPortId = link.aPortId === ownPort.id ? link.bPortId : link.aPortId;
  return network.ports.find((p) => p.id === switchPortId) ?? null;
}

function remainsInDepartment(network, deviceId, subnet, prefix, vlan) {
  const device = network.devices.find((d) => d.id === deviceId);
  if (!device?.ip) return false;
  const switchPort = findSwitchPort(network, deviceId);
  return (
    inSubnet(device.ip, subnet, prefix) && switchPort?.mode === 'access' && switchPort.accessVlan === vlan
  );
}

function hasVerifiedTestAtCurrentRevision(attempt, { deviceId, testKind }) {
  return attempt.events.some(
    (event) =>
      event.kind === 'test' &&
      event.deviceId === deviceId &&
      event.details.testKind === testKind &&
      event.details.result?.ok === true &&
      event.revision === attempt.network.revision,
  );
}

function isCapturedEvent(attempt, eventId) {
  return attempt.events.some((event) => event.id === eventId && (event.kind === 'inspection' || event.kind === 'test'));
}

// evaluateCompletion(attempt) -> {passed, checks:[{id,passed,message}]}.
// Every unmet check names a concrete next action, not just what's missing.
export function evaluateCompletion(attempt) {
  const network = attempt.network;
  const requirements = attempt.requirements;
  const checks = [];

  const targetLive = testService(network, attempt.targetClientId, attempt.targetName);
  checks.push({
    id: 'targetServicePasses',
    passed: targetLive.ok,
    message: targetLive.ok
      ? 'Target service is currently reachable.'
      : `Restore the target's portal access (currently failing: ${targetLive.code}).`,
  });

  const protectedLive = testService(network, attempt.protectedClientId, attempt.targetName);
  checks.push({
    id: 'protectedServicePasses',
    passed: protectedLive.ok,
    message: protectedLive.ok
      ? 'Protected service is currently reachable.'
      : `Restore the protected client's portal access (currently failing: ${protectedLive.code}).`,
  });

  const targetInDepartment = remainsInDepartment(
    network,
    attempt.targetClientId,
    requirements.targetSubnet,
    requirements.targetPrefix,
    requirements.targetVlan,
  );
  checks.push({
    id: 'targetInRequiredDepartment',
    passed: targetInDepartment,
    message: targetInDepartment
      ? 'Target client is in its required subnet and VLAN.'
      : "Keep the target client in its own department's subnet and VLAN — moving it into another department does not count as a repair.",
  });

  const protectedInDepartment = remainsInDepartment(
    network,
    attempt.protectedClientId,
    requirements.protectedSubnet,
    requirements.protectedPrefix,
    requirements.protectedVlan,
  );
  checks.push({
    id: 'protectedInRequiredDepartment',
    passed: protectedInDepartment,
    message: protectedInDepartment
      ? 'Protected client is in its required subnet and VLAN.'
      : "Keep the protected client in its own department's subnet and VLAN.",
  });

  const targetVerified = hasVerifiedTestAtCurrentRevision(attempt, {
    deviceId: attempt.targetClientId,
    testKind: 'openPortal',
  });
  checks.push({
    id: 'targetVerifiedAtCurrentRevision',
    passed: targetVerified,
    message: targetVerified
      ? 'Target verified with "Open portal" at the current configuration.'
      : 'Run "Open portal" on the target again — an earlier passing test does not count after further changes.',
  });

  const protectedVerified = hasVerifiedTestAtCurrentRevision(attempt, {
    deviceId: attempt.protectedClientId,
    testKind: 'checkProtected',
  });
  checks.push({
    id: 'protectedVerifiedAtCurrentRevision',
    passed: protectedVerified,
    message: protectedVerified
      ? 'Protected client verified with "Check protected client" at the current configuration.'
      : 'Run "Check protected client" again — an earlier passing test does not count after further changes.',
  });

  const hasSelectedFindings = attempt.selectedFindingIds.length >= 1;
  const findingsAreReal = attempt.selectedFindingIds.every((id) => isCapturedEvent(attempt, id));
  checks.push({
    id: 'selectedGenuineFinding',
    passed: hasSelectedFindings && findingsAreReal,
    message:
      hasSelectedFindings && findingsAreReal
        ? 'At least one genuine finding is selected.'
        : 'Select at least one finding from your actual inspections and tests.',
  });

  const noteLength = attempt.completionNote?.trim().length ?? 0;
  const noteOk = noteLength >= 10 && noteLength <= 500;
  checks.push({
    id: 'completionNoteLength',
    passed: noteOk,
    message: noteOk
      ? 'Completion note is a valid length.'
      : 'Write a completion note between 10 and 500 characters describing what you did.',
  });

  return { passed: checks.every((c) => c.passed), checks };
}

function familyForRecipes(recipeIds) {
  return recipeIds.length > 1 ? 'M' : recipeIds[0][0];
}

// summarizeRun(attempt, completedAt) -> immutable RunSummary (DATA_CONTRACTS.md).
export function summarizeRun(attempt, completedAt) {
  return Object.freeze({
    attemptId: attempt.id,
    caseCode: attempt.caseCode,
    mode: attempt.mode,
    recipes: [...attempt.recipeIds],
    tier: attempt.tier ?? null,
    family: attempt.mode === 'repair' ? familyForRecipes(attempt.recipeIds) : null,
    assisted: attempt.assisted,
    elapsedMs: attempt.elapsedMs,
    completedAt,
    selectedFindings: [...attempt.selectedFindingIds],
    note: attempt.completionNote,
  });
}
