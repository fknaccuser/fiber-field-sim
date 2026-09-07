import type { Intent } from '../session/types';

/** Method explanations only. No symptom results, diagnosis claims, or fault parameters. */
export function rationaleForStep(step: Intent, previous: Intent[] = []): string {
  switch (step.type) {
    case 'customer-contact': return previous.some((s) => s.type === 'customer-contact')
      ? 'You compare another customer report with the first to establish whether the affected premises share an upstream path before you spend a truck roll.'
      : 'You establish what stopped working and when. Compare the report with later measurements instead of assuming that a customer description identifies the cause.';
    case 'truck-roll': return 'You move to the next test boundary so you can inspect or measure equipment you can physically reach. Remote status alone cannot establish conditions at this point.';
    case 'power-meter': return previous.some((s) => s.type === 'power-meter')
      ? 'You compare the light level at this boundary with your earlier reading. A change between the two points narrows the section that needs investigation.'
      : 'You establish whether usable light reaches this test boundary. Compare the result with the optical receive window to separate a path problem from equipment or service trouble.';
    case 'scope': return 'You inspect the connector face before trusting a connection. The end-face result tests whether contamination could explain the measured loss without assuming it does.';
    case 'vfl': return 'You trace continuity along the selected fiber and look for escaping light. Compare its location with the cable route to narrow where further inspection is needed.';
    case 'otdr-shot': return 'You locate loss and reflection events along the optical path. Account for the launch cable and distance scale before assigning a trace event to a physical section.';
    case 'records': return 'You establish the documented route, port assignment and work history. Compare this intended path with field observations instead of treating the paperwork as proof.';
    case 'diagnosis': return 'You connect your observations to a specific conclusion and cite the actions that support it. Escalate work outside your authority rather than making unsupported changes.';
    case 'hint': return 'You ask for a method to test your next uncertainty. Advice helps you choose a check; it does not replace evidence from the plant.';
    case 'excavate': return 'You verify the work area and use the permitted excavation method. Establish the location of buried services before exposing the cable.';
    case 'cli': {
      const command = step.command.trim().toLowerCase();
      if (command.includes('ont status')) return 'You compare the reported ONT states across the PON. This helps separate loss of light, loss of power and registration trouble before selecting a field test.';
      if (command.includes('transceiver')) return 'You compare the reported optical receive level with the interface limits. An observed level gives you a measurable test of the uplink instead of relying on an alarm label.';
      if (command.startsWith('ipconfig')) return 'You inspect the host address, gateway and resolver settings. Establish whether the host has usable addressing before interpreting connectivity tests.';
      if (command.startsWith('nslookup')) return 'You test name resolution directly and compare it with connectivity by IP address. This separates a resolver response problem from a general forwarding failure.';
      if (command.startsWith('ping')) return /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(command)
        ? 'You test reachability by IP address without depending on name resolution. Compare this result with the gateway and hostname tests to identify which service boundary fails.'
        : 'You test reachability by hostname and compare it with an IP-only test. Different outcomes tell you whether name resolution needs a separate check.';
      if (command.includes('ip route')) return 'You inspect forwarding and address-service information at the router. Compare it with the host configuration to test whether traffic has a usable next hop.';
      return 'You read the relevant network state and compare it with the expected configuration. Use the response to choose the next check, without changing service on an assumption.';
    }
  }
}
