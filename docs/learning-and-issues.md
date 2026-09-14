# Guided practice, console progression, and issue database

## Learning path

- Tier 1: a canvas arrow identifies the customer workstation. After inspection,
  a callout highlights the baseline test. A visible disconnected client cable is
  highlighted with a reconnect prompt. Other configuration investigations point
  to the configuration controls. Verification leads to Findings and a repair note.
- Tier 2, or after three completed repairs: the console opens first. A short
  command introduction, command builder, and test buttons remain available.
- Tiers 3–4, or demonstrated independent repair mastery: only the Console tab is
  available in the device inspector. Configuration forms, quick tests, and the
  command builder are hidden. Physical cabling remains on the canvas.
- Independent mastery still requires eight completed repairs and four distinct
  independently solved causes. Diagnostic case-study completion does not count
  as live repair mastery. Help can be reopened; hiding hints never locks a user out.

The console has a larger output area, a visible command input, command history
on Up/Down, and Expand/Restore controls. Expansion and typed drafts survive save
rerenders. Escape in the input restores an expanded console.

## Executable console subset

Existing switch commands remain available (`enable`, `configure terminal`,
`interface`, `shutdown`, `no shutdown`, VLAN commands, and show commands).
The workstation supports `ipconfig /all`, `ping <IP>`, `nslookup <name>`, plus:

```text
curl [-I] http://portal.northline.test
netsh interface ipv4 set address name=eth0 static <IP> <MASK> <GATEWAY>
netsh interface ipv4 set dnsservers name=eth0 static <DNS-IP>
```

The corresponding named netsh arguments (`source=`, `address=`, `mask=`, and
`gateway=`) are accepted. These are bounded syntax subsets, not a host shell.
The simulated server additionally supports `dns-record <existing-name> <IP>`;
that command is explicitly a simulator editor, not a Windows or Cisco command.
Router consoles retain their existing read-only scope because current scored
repair faults do not require changing router addresses.

Ping, lookup, and HTTP commands record real simulator results in Findings.
An HTTP check against the assigned portal from the target workstation satisfies
target verification; running it from the protected workstation satisfies protected
verification. Both must occur at the current configuration revision. A wrong
hostname never receives target-verification credit. Multi-field address commands
validate atomically, and changes retain before/after evidence.

Command syntax references consulted:
[Microsoft netsh interface](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-interface),
[curl manual](https://curl.se/docs/manpage.html), and
[Cisco switch-port troubleshooting](https://www.cisco.com/c/en/us/support/docs/switches/catalyst-6500-series-switches/12027-53.html).
The simulated commands intentionally implement only the subset above.

## Issue database

`src/solo/issue-data.js` contains 200 original, distinct authored issue records,
20 in each of ten domains: physical/power, Ethernet/VLANs, addressing/DHCP,
DNS, routing/WAN, wireless, security, applications, operations, and fiber.
Each includes a symptom, evidence, repair, verification, curriculum grouping,
prerequisites, and an explicit simulation capability mapping.

The searchable home-screen library offers filters, paginated cards, recommendations,
diagnostic investigations, worked diagnoses, and local case-study completion.
Recommendations favor uncompleted foundational cases within the current filters.
Diagnostic exercises require opening the evidence, selecting the repair and
verification, and writing a note. Notes are checked for length only; their technical
correctness is not machine-graded. Notes are transient; completion is saved under
`field-issue-progress-v1`, separately from training progress and its backup format.

Eight entries map to the existing live fault recipes. The other 192 are diagnostic
case studies, not network simulations. The 200 count describes distinct issues,
not seed variations. All eight live adapters can launch at tiers 1, 2, or 3;
a mixed console challenge uses the existing validated tier-4 fault pairs.
Common/rare labels are teaching groupings, not measured prevalence statistics.
The collection is an authored curriculum foundation, not a certification or
employment-readiness assessment.

Additional technical references consulted for the curriculum include
[DHCP (RFC 2131)](https://www.rfc-editor.org/info/rfc2131/),
[IPv6 Path MTU Discovery (RFC 8201)](https://www.rfc-editor.org/info/rfc8201/),
[FOA OTDR interpretation](https://thefoa.org/tech/ref/testing/OTDR/OTDR.html), and
[Cisco wireless configuration checks](https://developer.cisco.com/docs/wireless-troubleshooting-tools/config-checks-and-messages/).
These are background references; the scenario wording and assessments are original.

`node scripts/export-issues.mjs` regenerates `data/issues-v1.json`. The library
also provides an Export issue database button. Future live adapters should map
specific catalog IDs to deterministic mutations and repair/verification tests;
unsupported protocols must remain explicitly case-study-only until modeled.

## Validation

`npm run solo:test` includes catalog completeness, unique IDs/titles, four-option
grading, progression thresholds, 120 generated live-adapter checks, CLI repair of
all eight live causes, current-revision verification, atomic invalid-command
rejection, and incorrect-hostname rejection. Interactive browser checks cover the
beginner arrow, evidence-driven cable hint, case-study submission, and expanded
console. `npm run build` verifies the production and PWA bundle.
