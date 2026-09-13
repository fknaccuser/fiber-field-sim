// Authored copy: hint text, customer facts, harmless tier3 details. SCENARIOS.md
// "Hint copy" gives nudge/clue/step verbatim (rendering X/addresses from the
// actual generated case where noted); debrief text is a later task's addition
// (SCENARIOS.md gives no debrief copy, and S12.md's own scope names only
// three hint levels). Customer-fact answers are original authored content
// (SCENARIOS.md/MASTER_DESIGN.md require this, not a generated conversation).

export const HINTS = {
  P1: {
    nudge: "Check the endpoint's local connection.",
    clue: 'The cable is not seated at both ends.',
    step: "Reconnect the client's cable to its assigned access port.",
  },
  P2: {
    nudge: 'Compare physical connection and port status.',
    clue: 'The cable is connected, but the switch reports administrative shutdown.',
    step: "Enable the client's access port.",
  },
  I1: {
    nudge: 'Compare the client address with the gateway network.',
    clue: 'The client is in a different subnet from its intended LAN.',
    step: (x) => `Assign an unused 10.${x}.10 host address with /24.`,
  },
  I2: {
    nudge: 'Check where off-subnet traffic is sent.',
    clue: 'No device owns the configured default-gateway address.',
    step: 'Use the router target-LAN address as the gateway.',
  },
  V1: {
    nudge: "Check the switch's logical port assignment.",
    clue: "The endpoint port belongs to the other department's VLAN.",
    step: 'Set that access port to VLAN 10.',
  },
  V2: {
    nudge: 'Inspect the interswitch path.',
    clue: 'The trunk does not carry the target VLAN.',
    step: 'Allow VLAN 10 while retaining VLAN 20.',
  },
  D1: {
    nudge: 'Compare a direct IP test with a name test.',
    clue: 'The configured resolver is not reachable as a DNS service.',
    step: (x) => `Set the client resolver to the service server's address (10.${x}.30.53).`,
  },
  D2: {
    nudge: 'Inspect the address returned by name resolution.',
    clue: 'The name resolves to a host that does not provide the portal.',
    step: 'Correct the portal record to the portal server address.',
  },
};

export function renderHintText(hintText, x) {
  return typeof hintText === 'function' ? hintText(x) : hintText;
}

// Three suggested customer questions (S12.md); DATA_CONTRACTS.md's worked
// example for TF1-HM-1-P-START ("began this morning; customer workstation
// affected; no confirmed configuration change") matches this exact triplet.
// MASTER_DESIGN.md §6 paraphrases the same idea slightly differently ("What
// stopped working? When did it start? Did anything change?") — a small,
// non-blocking wording inconsistency between the two docs; following the
// worked example and this task's own explicit list.
export const CUSTOMER_QUESTIONS = [
  { id: 'whenItBegan', prompt: 'When did it start?' },
  { id: 'whoIsAffected', prompt: 'Who is affected?' },
  { id: 'whatChanged', prompt: 'Did anything change?' },
];

export const CUSTOMER_FACTS = {
  P1: {
    whenItBegan: 'This morning, right when they got in.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'Nothing on purpose; someone may have bumped the cable during cleaning.',
  },
  P2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'No known change from the user.',
  },
  I1: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'IT mentioned reimaging this machine recently.',
  },
  I2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'The workstation was moved to a different desk last week.',
  },
  V1: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'The switch port was touched during a cable cleanup.',
  },
  V2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'This workstation and everyone on the same department switch.',
    whatChanged: 'A technician was working on the interswitch link yesterday.',
  },
  D1: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'DNS settings were adjusted during a routine check.',
  },
  D2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Both workstations.',
    whatChanged: 'The DNS server had a record updated recently.',
  },
};

// One harmless report detail, tier3 only (SCENARIOS.md), indexed by the
// case's own generated `detail` value. Never changes actual network state.
export const HARMLESS_DETAILS = [
  'The customer mentioned they just replaced their monitor.',
  "There's an unrelated printer problem on another shared device.",
  'The customer noted an old, already-resolved ISP outage notice.',
];

// MASTER_DESIGN.md §5 "Time" column. null means untimed.
export const TIER_GOAL_MS = {
  1: null,
  2: 15 * 60 * 1000,
  3: 12 * 60 * 1000,
  4: 20 * 60 * 1000,
};

// Searchable in-app reference (S16.md/DATA_CONTRACTS.md: {id,title,body,
// deviceKind?}). Every supported command comes straight from ENGINE_RULES.md's
// "Small CLI" list, one entry per command with one valid example matching
// cli.js's actual keyword/argument syntax — nothing here is invented. The
// four concept entries are UI_AND_STORAGE.md's named distinctions verbatim
// ("link up vs service up, IP vs DNS failure, access VLAN vs trunk
// allowance and configuration vs verification").
export const REFERENCE_ENTRIES = [
  // Switch commands
  { id: 'ref-switch-enable', deviceKind: 'switch', title: 'enable (switch)', body: 'Enters privileged mode from user mode. Example: enable' },
  { id: 'ref-switch-disable', deviceKind: 'switch', title: 'disable (switch)', body: 'Returns to user mode from privileged mode. Example: disable' },
  { id: 'ref-switch-configure-terminal', deviceKind: 'switch', title: 'configure terminal', body: 'Enters configuration mode from privileged mode. Example: configure terminal' },
  { id: 'ref-switch-interface', deviceKind: 'switch', title: 'interface PORT', body: 'Enters interface configuration mode for the named port. Example: interface Gi0/1' },
  { id: 'ref-switch-exit', deviceKind: 'switch', title: 'exit (switch)', body: 'Leaves the current mode, one level up. Example: exit' },
  { id: 'ref-switch-end', deviceKind: 'switch', title: 'end (switch)', body: 'Returns directly to privileged mode from any configuration mode. Example: end' },
  { id: 'ref-switch-show-interfaces-status', deviceKind: 'switch', title: 'show interfaces status', body: 'Lists each port and its administrative/link status. Example: show interfaces status' },
  { id: 'ref-switch-show-vlan-brief', deviceKind: 'switch', title: 'show vlan brief', body: 'Lists VLANs and which access ports belong to each. Example: show vlan brief' },
  { id: 'ref-switch-show-interfaces-trunk', deviceKind: 'switch', title: 'show interfaces trunk', body: 'Lists trunk ports and their allowed VLAN lists. Example: show interfaces trunk' },
  { id: 'ref-switch-show-running-config', deviceKind: 'switch', title: 'show running-config (switch)', body: "Shows the switch's current configuration. Example: show running-config" },
  { id: 'ref-switch-shutdown', deviceKind: 'switch', title: 'shutdown', body: 'Administratively disables the current interface. Example (inside interface Gi0/1): shutdown' },
  { id: 'ref-switch-no-shutdown', deviceKind: 'switch', title: 'no shutdown', body: 'Administratively enables the current interface. Example (inside interface Gi0/1): no shutdown' },
  { id: 'ref-switch-access-vlan', deviceKind: 'switch', title: 'switchport access vlan N', body: 'Sets the current access interface\'s VLAN. Example (inside interface Gi0/1): switchport access vlan 20' },
  { id: 'ref-switch-trunk-allowed-vlan', deviceKind: 'switch', title: 'switchport trunk allowed vlan LIST', body: "Sets the current trunk interface's allowed VLAN list. Example (inside interface Gi0/24): switchport trunk allowed vlan 10,20" },
  // Router commands
  { id: 'ref-router-enable', deviceKind: 'router', title: 'enable (router)', body: 'Enters privileged mode from user mode. Example: enable' },
  { id: 'ref-router-disable', deviceKind: 'router', title: 'disable (router)', body: 'Returns to user mode from privileged mode. Example: disable' },
  { id: 'ref-router-show-ip-interface-brief', deviceKind: 'router', title: 'show ip interface brief', body: "Lists each router segment and its address. Example: show ip interface brief" },
  { id: 'ref-router-show-ip-route', deviceKind: 'router', title: 'show ip route', body: "Lists the router's known routes. Example: show ip route" },
  { id: 'ref-router-show-running-config', deviceKind: 'router', title: 'show running-config (router)', body: "Shows the router's current configuration. Example: show running-config" },
  { id: 'ref-router-ping', deviceKind: 'router', title: 'ping IP (router)', body: 'Tests reachability to an address from the router. Example: ping 10.42.20.1' },
  // Client commands
  { id: 'ref-client-ipconfig', deviceKind: 'client', title: 'ipconfig', body: "Shows the workstation's IP address, prefix and gateway. Example: ipconfig" },
  { id: 'ref-client-ipconfig-all', deviceKind: 'client', title: 'ipconfig /all', body: "Shows the workstation's full addressing, including its DNS server. Example: ipconfig /all" },
  { id: 'ref-client-ping', deviceKind: 'client', title: 'ping IP (client)', body: 'Tests reachability to an address from the workstation. Example: ping 10.42.10.1' },
  { id: 'ref-client-nslookup', deviceKind: 'client', title: 'nslookup NAME', body: 'Resolves a name to an address using the configured DNS server. Example: nslookup portal.northline.test' },
  // Server commands
  { id: 'ref-server-show-running-config', deviceKind: 'server', title: 'show running-config (server)', body: "Shows the server's current status. Example: show running-config" },
  { id: 'ref-server-ping', deviceKind: 'server', title: 'ping IP (server)', body: 'Tests reachability to an address from the server. Example: ping 10.42.10.130' },
  // Concepts (UI_AND_STORAGE.md's named distinctions)
  {
    id: 'ref-concept-link-vs-service',
    title: 'Link up vs. service up',
    body: 'A cable or port reporting connected/up only confirms physical/administrative state at that link. It does not confirm the actual service (the portal) works — addressing, VLAN membership or DNS can still be wrong even with a healthy link. Test the service itself, not just link state.',
  },
  {
    id: 'ref-concept-ip-vs-dns',
    title: 'IP failure vs. DNS failure',
    body: 'A direct IP test (ping an address) isolates network-layer reachability. A name-based test (nslookup, resolve portal, open portal) can still fail even when the IP path is healthy, if the client\'s resolver is unreachable or the name\'s record points at the wrong address.',
  },
  {
    id: 'ref-concept-access-vs-trunk',
    title: 'Access VLAN vs. trunk allowed VLANs',
    body: 'An access port carries exactly one VLAN, set with switchport access vlan N. A trunk port can carry several VLANs, filtered by its own switchport trunk allowed vlan list. A trunk missing a VLAN blocks only that VLAN across the link — other VLANs on the same trunk keep working.',
  },
  {
    id: 'ref-concept-configuration-vs-verification',
    title: 'Configuration vs. verification',
    body: 'Changing a setting is an accepted configuration action, not proof it fixed anything. Only a passing test (ping, resolve, open portal, check protected client) verifies that a change actually restored service for both the target and the protected client.',
  },
];

// Study pack (S16.md): copied exactly from the supplied
// fixtures/study-content.json (DATA_CONTRACTS.md's schema — {schema, lessons,
// questions, cards}, Lesson {id,recipeId,family,title,text}, Question
// {id,recipeId,lessonId,prompt,options:[{id,text,correct,explanation}]}, Card
// {id,recipeId,lessonId,front,back}). The lessons are deliberately short —
// their exact supplied length supersedes MASTER_DESIGN.md's earlier
// 150-250-word target; never expand them to hit that count.
export const STUDY_PACK = {
  "schema": 1,
  "lessons": [
    {
      "id": "lesson-P1",
      "recipeId": "P1",
      "family": "P",
      "title": "Disconnected Ethernet cable",
      "text": "A workstation needs a physical Ethernet path before it can reach its gateway. A disconnected cable can stop service even when its saved IP address, gateway and DNS server are correct. Begin at the endpoint and inspect both cable ends. In this model a disconnected link reports down. Follow the cable to the assigned switch access port and reconnect it. Do not change addressing simply because an application fails. After reconnecting, test the portal by name and verify the protected workstation. Record the physical observation and the test results. Real equipment can have additional physical problems; this release models cable connection and administrative port state only."
    },
    {
      "id": "lesson-P2",
      "recipeId": "P2",
      "family": "P",
      "title": "Administratively disabled port",
      "text": "A cable can be connected while the switch port is administratively disabled. Inspect the endpoint connection and the switch port status before changing IP settings. A shutdown port prevents traffic on that attachment. On the simulated switch, enter privileged mode, configuration mode and the correct interface, then use no shutdown. The device panel can make the same state change. Both controls must affect the same network model. Check the port status again and test portal access from both workstations. If another fault remains, restoring the port alone may not restore service. Record what was disabled, what changed and the successful verification. Do not enable unrelated ports just to see what happens."
    },
    {
      "id": "lesson-I1",
      "recipeId": "I1",
      "family": "I",
      "title": "Client in the wrong subnet",
      "text": "An IPv4 address and prefix determine which destinations a host treats as local. The gateway must be reachable on the intended local network before it can carry off-subnet traffic. Compare the workstation address and /24 prefix with the documented department subnet and the router segment. In this exercise an address in 10.X.99.0/24 is wrong for the target department. Choose an unused host address in the required 10.X.10.0/24 subnet; the original host number is not mandatory. Preserve the correct gateway and DNS settings. Verify the gateway, then portal access by name and the protected workstation. Moving the workstation into another department is not an acceptable shortcut. Document the mismatch and the verified correction."
    },
    {
      "id": "lesson-I2",
      "recipeId": "I2",
      "family": "I",
      "title": "Incorrect default gateway",
      "text": "The default gateway is the next hop a host uses for destinations outside its local subnet. It is not the DNS resolver, and it cannot be an arbitrary unused address. Inspect the workstation gateway and compare it with the router interface on the intended department network. A saved gateway ending in .254 will not work in this case because no device owns that address. Correct it to the reachable router segment address ending in .1. Test the gateway first, then the service server and portal name. Verify the protected client as well. A correct gateway cannot compensate for a disconnected cable or blocked VLAN, so use the evidence to investigate any remaining failure. Record the observed address and the verified route to service."
    },
    {
      "id": "lesson-V1",
      "recipeId": "V1",
      "family": "V",
      "title": "Wrong access VLAN",
      "text": "An access VLAN assigns untagged workstation traffic to a logical switch segment. A working cable does not prove that the workstation belongs to the correct VLAN. Compare the intended department with the connected switch port membership. In these layouts the target department is VLAN 10 and the protected department is VLAN 20. If the target port is assigned to VLAN 20, restore its access membership to VLAN 10. Do not change the workstation into the protected subnet as a workaround: that violates the department requirement. Check gateway and portal reachability, then verify the protected workstation. The port may have remained physically up throughout the incident. Record that distinction so the debrief connects link status with logical segmentation."
    },
    {
      "id": "lesson-V2",
      "recipeId": "V2",
      "family": "V",
      "title": "Target VLAN missing from a trunk",
      "text": "A trunk carries permitted VLANs between network devices. An endpoint can have the correct access VLAN while an intermediate trunk blocks that VLAN. Trace the target path across the two switches and inspect their allowed lists. These layouts require VLANs 10 and 20 across the interswitch link. If VLAN 10 is missing, restore it while retaining VLAN 20. The supported trunk command replaces the allowed list; submitting only 10 can therefore break the protected department. Verify both sides of the trunk and test portal access from both workstations after the change. Do not assume that a physically up trunk carries every VLAN. Record the missing membership, the complete replacement list and both verification results."
    },
    {
      "id": "lesson-D1",
      "recipeId": "D1",
      "family": "D",
      "title": "Unreachable DNS resolver",
      "text": "DNS translates a name into an address; it is a different step from reaching a server by IP. Begin by comparing a direct service-server ping with a portal-name lookup. If direct connectivity works but the configured resolver is an unused address, name lookup cannot succeed. Inspect the client DNS setting and use the supplied reachable DNS server at the service subnet address ending in .53. Then resolve portal.northline.test and open the portal. Check the protected client before completion. A successful IP ping alone is incomplete verification because the customer uses a name. In a combined scenario a physical or VLAN fault may need repair before the DNS symptom can be isolated. Document both the comparison test and the corrected resolver setting."
    },
    {
      "id": "lesson-D2",
      "recipeId": "D2",
      "family": "D",
      "title": "Incorrect DNS record",
      "text": "A DNS server can answer correctly as a service while returning the wrong address for a particular name. Compare the address returned for portal.northline.test with the designated portal server. In this exercise the faulty record points to an unused address ending in .80 instead of the service server ending in .53. Correct that record using the server panel. Because the DNS record is shared, both clients can be affected before repair. Repeat name lookup and open the portal from the target client, then verify the protected client. A successful DNS response is not itself proof that the intended application is reachable. Record the returned address, the designated server and the successful end-to-end checks after the correction."
    }
  ],
  "questions": [
    {
      "id": "P1-Q1",
      "recipeId": "P1",
      "lessonId": "lesson-P1",
      "prompt": "Which observation best supports a disconnected cable?",
      "options": [
        {
          "id": "A",
          "text": "The endpoint cable is disconnected",
          "correct": true,
          "explanation": "A disconnected cable directly breaks the local Ethernet path."
        },
        {
          "id": "B",
          "text": "The portal name has a spelling error",
          "correct": false,
          "explanation": "A name typo affects that name test but does not identify a physical break."
        },
        {
          "id": "C",
          "text": "The client uses a valid /24 mask",
          "correct": false,
          "explanation": "A valid mask is normal configuration, not evidence of disconnection."
        },
        {
          "id": "D",
          "text": "An unrelated printer ran out of paper",
          "correct": false,
          "explanation": "Printer supplies do not explain the workstation Ethernet path."
        }
      ]
    },
    {
      "id": "P1-Q2",
      "recipeId": "P1",
      "lessonId": "lesson-P1",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Change the DNS record",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Reconnect the cable to its assigned port",
          "correct": true,
          "explanation": "Physical connectivity must be restored before higher-layer service can work."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "P1-Q3",
      "recipeId": "P1",
      "lessonId": "lesson-P1",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    },
    {
      "id": "P2-Q1",
      "recipeId": "P2",
      "lessonId": "lesson-P2",
      "prompt": "Which finding distinguishes administrative shutdown?",
      "options": [
        {
          "id": "A",
          "text": "The assigned switch port reports administratively down",
          "correct": true,
          "explanation": "The switch status directly identifies the administrative state."
        },
        {
          "id": "B",
          "text": "The DNS server returns an address",
          "correct": false,
          "explanation": "A DNS response is unrelated to the port administrative setting."
        },
        {
          "id": "C",
          "text": "The client hostname changed",
          "correct": false,
          "explanation": "A hostname change does not disable a port in this model."
        },
        {
          "id": "D",
          "text": "Another VLAN has working service",
          "correct": false,
          "explanation": "A working other VLAN does not identify why this attachment is down."
        }
      ]
    },
    {
      "id": "P2-Q2",
      "recipeId": "P2",
      "lessonId": "lesson-P2",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Replace every client IP address",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Enable the assigned switch port",
          "correct": true,
          "explanation": "The repair must target the disabled interface, then verify service."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "P2-Q3",
      "recipeId": "P2",
      "lessonId": "lesson-P2",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    },
    {
      "id": "I1-Q1",
      "recipeId": "I1",
      "lessonId": "lesson-I1",
      "prompt": "Which evidence suggests the target is in the wrong subnet?",
      "options": [
        {
          "id": "A",
          "text": "Its address is 10.X.99.130/24 while its required LAN is 10.X.10.0/24",
          "correct": true,
          "explanation": "The address belongs to a different /24 from the stated requirement."
        },
        {
          "id": "B",
          "text": "Its cable is connected",
          "correct": false,
          "explanation": "A connected cable does not prove the IPv4 subnet is correct."
        },
        {
          "id": "C",
          "text": "Its switch allows VLAN 10",
          "correct": false,
          "explanation": "Correct VLAN carriage does not correct a host address."
        },
        {
          "id": "D",
          "text": "The portal record points at the server",
          "correct": false,
          "explanation": "A correct DNS record does not place the client in its required subnet."
        }
      ]
    },
    {
      "id": "I1-Q2",
      "recipeId": "I1",
      "lessonId": "lesson-I1",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Move the client into the protected department",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Assign an unused address in the required target subnet",
          "correct": true,
          "explanation": "Several unused host addresses may satisfy the same subnet requirement."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "I1-Q3",
      "recipeId": "I1",
      "lessonId": "lesson-I1",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    },
    {
      "id": "I2-Q1",
      "recipeId": "I2",
      "lessonId": "lesson-I2",
      "prompt": "Which finding identifies a bad gateway setting?",
      "options": [
        {
          "id": "A",
          "text": "The configured gateway address has no device owner",
          "correct": true,
          "explanation": "An unowned gateway cannot act as the next hop."
        },
        {
          "id": "B",
          "text": "The portal name is lowercase",
          "correct": false,
          "explanation": "Lowercase naming is normal here."
        },
        {
          "id": "C",
          "text": "The switch hostname is different",
          "correct": false,
          "explanation": "A switch display name does not change gateway ownership."
        },
        {
          "id": "D",
          "text": "The client has an unused valid host address",
          "correct": false,
          "explanation": "A valid client address alone does not identify a gateway fault."
        }
      ]
    },
    {
      "id": "I2-Q2",
      "recipeId": "I2",
      "lessonId": "lesson-I2",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Use an arbitrary unused address as gateway",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Use the reachable router address on the intended LAN",
          "correct": true,
          "explanation": "Off-subnet traffic needs a real reachable router next hop."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "I2-Q3",
      "recipeId": "I2",
      "lessonId": "lesson-I2",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    },
    {
      "id": "V1-Q1",
      "recipeId": "V1",
      "lessonId": "lesson-V1",
      "prompt": "Which observation best supports an access VLAN mismatch?",
      "options": [
        {
          "id": "A",
          "text": "The target access port is VLAN 20 but the department requires VLAN 10",
          "correct": true,
          "explanation": "The assigned VLAN conflicts with the documented department."
        },
        {
          "id": "B",
          "text": "The Ethernet cable is connected",
          "correct": false,
          "explanation": "A connected cable does not identify the logical segment."
        },
        {
          "id": "C",
          "text": "The service server is powered",
          "correct": false,
          "explanation": "Server power does not establish the client VLAN."
        },
        {
          "id": "D",
          "text": "The client clock is accurate",
          "correct": false,
          "explanation": "Client clock accuracy does not determine access membership."
        }
      ]
    },
    {
      "id": "V1-Q2",
      "recipeId": "V1",
      "lessonId": "lesson-V1",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Move the client address into VLAN 20 subnet",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Set the target access port to VLAN 10",
          "correct": true,
          "explanation": "Physical link state and logical VLAN membership are separate checks."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "V1-Q3",
      "recipeId": "V1",
      "lessonId": "lesson-V1",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    },
    {
      "id": "V2-Q1",
      "recipeId": "V2",
      "lessonId": "lesson-V2",
      "prompt": "Which evidence points to a trunk allowed-list fault?",
      "options": [
        {
          "id": "A",
          "text": "The target access VLAN is correct but the interswitch trunk omits VLAN 10",
          "correct": true,
          "explanation": "The omitted VLAN blocks the target logical path across the trunk."
        },
        {
          "id": "B",
          "text": "Both switches have readable names",
          "correct": false,
          "explanation": "Readable names do not prove VLAN carriage."
        },
        {
          "id": "C",
          "text": "The cable jacket is blue",
          "correct": false,
          "explanation": "Cable color is not an allowed-list setting."
        },
        {
          "id": "D",
          "text": "The protected workstation has a different hostname",
          "correct": false,
          "explanation": "A hostname difference does not affect trunk membership."
        }
      ]
    },
    {
      "id": "V2-Q2",
      "recipeId": "V2",
      "lessonId": "lesson-V2",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Replace the allowed list with only VLAN 10",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Allow VLANs 10 and 20 on the required trunk",
          "correct": true,
          "explanation": "Restoring one department must not remove another department from the path."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "V2-Q3",
      "recipeId": "V2",
      "lessonId": "lesson-V2",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    },
    {
      "id": "D1-Q1",
      "recipeId": "D1",
      "lessonId": "lesson-D1",
      "prompt": "Which comparison best supports a resolver problem?",
      "options": [
        {
          "id": "A",
          "text": "Server IP ping succeeds but the configured resolver cannot be reached",
          "correct": true,
          "explanation": "The difference isolates name service from basic server connectivity."
        },
        {
          "id": "B",
          "text": "Both workstations are powered",
          "correct": false,
          "explanation": "Power alone does not identify DNS configuration."
        },
        {
          "id": "C",
          "text": "The local cable is connected",
          "correct": false,
          "explanation": "A connected cable does not establish a reachable resolver."
        },
        {
          "id": "D",
          "text": "The router label contains numbers",
          "correct": false,
          "explanation": "Display labels do not affect DNS reachability."
        }
      ]
    },
    {
      "id": "D1-Q2",
      "recipeId": "D1",
      "lessonId": "lesson-D1",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Change a healthy switch VLAN at random",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Set the client DNS resolver to the supplied DNS server",
          "correct": true,
          "explanation": "Direct IP success does not prove name resolution works."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "D1-Q3",
      "recipeId": "D1",
      "lessonId": "lesson-D1",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    },
    {
      "id": "D2-Q1",
      "recipeId": "D2",
      "lessonId": "lesson-D2",
      "prompt": "Which evidence identifies an incorrect portal record?",
      "options": [
        {
          "id": "A",
          "text": "DNS returns an address that is not the designated portal server",
          "correct": true,
          "explanation": "The record points the name away from its intended service."
        },
        {
          "id": "B",
          "text": "The client can display its IP settings",
          "correct": false,
          "explanation": "Displaying settings does not validate a DNS record."
        },
        {
          "id": "C",
          "text": "The access link is up",
          "correct": false,
          "explanation": "Link status does not prove a name points to the right server."
        },
        {
          "id": "D",
          "text": "The switch accepts enable",
          "correct": false,
          "explanation": "Terminal mode access does not validate name resolution."
        }
      ]
    },
    {
      "id": "D2-Q2",
      "recipeId": "D2",
      "lessonId": "lesson-D2",
      "prompt": "After confirming this fault, which action addresses it?",
      "options": [
        {
          "id": "A",
          "text": "Disable DNS on both workstations",
          "correct": false,
          "explanation": "This does not address the confirmed cause and can create another fault."
        },
        {
          "id": "B",
          "text": "Point the portal record to the designated server address",
          "correct": true,
          "explanation": "An answered name lookup can still contain the wrong service address."
        },
        {
          "id": "C",
          "text": "Ignore the failed service test",
          "correct": false,
          "explanation": "The required service is still unavailable."
        },
        {
          "id": "D",
          "text": "Mark the job complete before making changes",
          "correct": false,
          "explanation": "Completion requires restoring and verifying the outcome."
        }
      ]
    },
    {
      "id": "D2-Q3",
      "recipeId": "D2",
      "lessonId": "lesson-D2",
      "prompt": "What is sufficient final service verification after this repair?",
      "options": [
        {
          "id": "A",
          "text": "Inspect only the changed field",
          "correct": false,
          "explanation": "A field value alone does not prove end-to-end service."
        },
        {
          "id": "B",
          "text": "Ping only the gateway",
          "correct": false,
          "explanation": "Gateway reachability does not prove DNS or portal service."
        },
        {
          "id": "C",
          "text": "Open the portal by name from both required workstations at the current configuration revision",
          "correct": true,
          "explanation": "This checks the requested service and the protected client after the final changes."
        },
        {
          "id": "D",
          "text": "Assume the protected workstation is unaffected",
          "correct": false,
          "explanation": "Assumptions are not verification evidence."
        }
      ]
    }
  ],
  "cards": [
    {
      "id": "P1-C1",
      "recipeId": "P1",
      "lessonId": "lesson-P1",
      "front": "What is the key lesson of disconnected ethernet cable?",
      "back": "Physical connectivity must be restored before higher-layer service can work."
    },
    {
      "id": "P1-C2",
      "recipeId": "P1",
      "lessonId": "lesson-P1",
      "front": "What action repairs the confirmed disconnected ethernet cable case?",
      "back": "Reconnect the cable to its assigned port"
    },
    {
      "id": "P1-C3",
      "recipeId": "P1",
      "lessonId": "lesson-P1",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    },
    {
      "id": "P2-C1",
      "recipeId": "P2",
      "lessonId": "lesson-P2",
      "front": "What is the key lesson of administratively disabled port?",
      "back": "The repair must target the disabled interface, then verify service."
    },
    {
      "id": "P2-C2",
      "recipeId": "P2",
      "lessonId": "lesson-P2",
      "front": "What action repairs the confirmed administratively disabled port case?",
      "back": "Enable the assigned switch port"
    },
    {
      "id": "P2-C3",
      "recipeId": "P2",
      "lessonId": "lesson-P2",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    },
    {
      "id": "I1-C1",
      "recipeId": "I1",
      "lessonId": "lesson-I1",
      "front": "What is the key lesson of client in the wrong subnet?",
      "back": "Several unused host addresses may satisfy the same subnet requirement."
    },
    {
      "id": "I1-C2",
      "recipeId": "I1",
      "lessonId": "lesson-I1",
      "front": "What action repairs the confirmed client in the wrong subnet case?",
      "back": "Assign an unused address in the required target subnet"
    },
    {
      "id": "I1-C3",
      "recipeId": "I1",
      "lessonId": "lesson-I1",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    },
    {
      "id": "I2-C1",
      "recipeId": "I2",
      "lessonId": "lesson-I2",
      "front": "What is the key lesson of incorrect default gateway?",
      "back": "Off-subnet traffic needs a real reachable router next hop."
    },
    {
      "id": "I2-C2",
      "recipeId": "I2",
      "lessonId": "lesson-I2",
      "front": "What action repairs the confirmed incorrect default gateway case?",
      "back": "Use the reachable router address on the intended LAN"
    },
    {
      "id": "I2-C3",
      "recipeId": "I2",
      "lessonId": "lesson-I2",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    },
    {
      "id": "V1-C1",
      "recipeId": "V1",
      "lessonId": "lesson-V1",
      "front": "What is the key lesson of wrong access vlan?",
      "back": "Physical link state and logical VLAN membership are separate checks."
    },
    {
      "id": "V1-C2",
      "recipeId": "V1",
      "lessonId": "lesson-V1",
      "front": "What action repairs the confirmed wrong access vlan case?",
      "back": "Set the target access port to VLAN 10"
    },
    {
      "id": "V1-C3",
      "recipeId": "V1",
      "lessonId": "lesson-V1",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    },
    {
      "id": "V2-C1",
      "recipeId": "V2",
      "lessonId": "lesson-V2",
      "front": "What is the key lesson of target vlan missing from a trunk?",
      "back": "Restoring one department must not remove another department from the path."
    },
    {
      "id": "V2-C2",
      "recipeId": "V2",
      "lessonId": "lesson-V2",
      "front": "What action repairs the confirmed target vlan missing from a trunk case?",
      "back": "Allow VLANs 10 and 20 on the required trunk"
    },
    {
      "id": "V2-C3",
      "recipeId": "V2",
      "lessonId": "lesson-V2",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    },
    {
      "id": "D1-C1",
      "recipeId": "D1",
      "lessonId": "lesson-D1",
      "front": "What is the key lesson of unreachable dns resolver?",
      "back": "Direct IP success does not prove name resolution works."
    },
    {
      "id": "D1-C2",
      "recipeId": "D1",
      "lessonId": "lesson-D1",
      "front": "What action repairs the confirmed unreachable dns resolver case?",
      "back": "Set the client DNS resolver to the supplied DNS server"
    },
    {
      "id": "D1-C3",
      "recipeId": "D1",
      "lessonId": "lesson-D1",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    },
    {
      "id": "D2-C1",
      "recipeId": "D2",
      "lessonId": "lesson-D2",
      "front": "What is the key lesson of incorrect dns record?",
      "back": "An answered name lookup can still contain the wrong service address."
    },
    {
      "id": "D2-C2",
      "recipeId": "D2",
      "lessonId": "lesson-D2",
      "front": "What action repairs the confirmed incorrect dns record case?",
      "back": "Point the portal record to the designated server address"
    },
    {
      "id": "D2-C3",
      "recipeId": "D2",
      "lessonId": "lesson-D2",
      "front": "Does changing the suspected field alone prove this job is complete?",
      "back": "No. Verify portal access from both required workstations after the final change, select evidence and document the work."
    }
  ]
};
