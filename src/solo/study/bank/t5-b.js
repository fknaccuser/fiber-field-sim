// Tree 5, Security Fundamentals, part B: Layer 2 security (port security,
// DHCP snooping, Dynamic ARP Inspection), AAA, and wireless security.

import { Q, X } from './qb.js';

const PSEC = `
SW1#show port-security interface gi0/5
Port Security              : Enabled
Port Status                : Secure-shutdown
Violation Mode             : Shutdown
Aging Time                 : 0 mins
Maximum MAC Addresses      : 1
Total MAC Addresses        : 1
Sticky MAC Addresses       : 1
Last Source Address:Vlan   : 0050.7966.6899:10
Security Violation Count   : 1`;
const PSEC_MARKS = [
  ['show port-security interface gi0/5', 'cmd'], ['Secure-shutdown', 'fail', 'Port shut by violation'], ['Violation Mode             : Shutdown', 'key', 'Violation mode'],
  ['Maximum MAC Addresses      : 1', 'key', 'Limit'], ['0050.7966.6899', 'mac', 'Offending MAC'], [/(?<=:)10$/m, 'vlan'], ['Security Violation Count   : 1', 'count', 'Violations'],
];

export const T5_B = [
  // ---------- t5-l2sec ----------
  Q('b5-l2-01', 'SECF', 't5-l2sec', 'What does this output show happened on Gi0/5?', [
    ['A second device (MAC 0050.7966.6899) appeared, exceeding the limit of 1, and the port shut down', true, 'Secure-shutdown after a violation.'],
    ['The port is working normally', false, 'It is shut by a violation.'],
    ['Port security is disabled', false, 'It is enabled.'],
    ['The cable is unplugged', false, 'A violation occurred.'],
  ], 'With maximum 1 and a sticky address already learned, a frame from a new MAC is a violation. Shutdown mode err-disables the port. Remove the extra device, then shutdown and no shutdown the port (or use errdisable recovery).', { exhibit: X(PSEC, ...PSEC_MARKS) }),
  Q('b5-l2-02', 'SECF', 't5-l2sec', 'Which port security violation mode drops offending frames and logs and counts the violation, but keeps the port up?', [
    ['restrict', true, 'Drops, logs, counts.'],
    ['protect', false, 'Drops silently, no log or count.'],
    ['shutdown', false, 'Err-disables the port.'],
    ['permit', false, 'Not a mode.'],
  ], 'shutdown (default) err-disables the port; restrict drops violating frames, sends a log or SNMP trap and increments the counter; protect drops silently. restrict is the usual compromise when an outage would be worse than the violation.'),
  Q('b5-l2-03', 'SECF', 't5-l2sec', 'Which configuration lets one PC and one IP phone use a port, learning their MACs permanently into the config?', [
    ['switchport port-security / maximum 2 / mac-address sticky', true, 'Two addresses, learned and saved.'],
    ['switchport port-security maximum 1', false, 'Only one device.'],
    ['switchport port-security violation protect only', false, 'No limit set beyond the default 1.'],
    ['spanning-tree portfast', false, 'Unrelated.'],
  ], 'Port security needs the port in static access (or trunk) mode first: switchport mode access. sticky learns MACs dynamically and writes them into the running config, so save it to keep them across reloads.', { console: true }),
  Q('b5-l2-04', 'SECF', 't5-l2sec', 'Why does switchport port-security fail with "Command rejected: Gi0/5 is a dynamic port"?', [
    ['Port security requires the port to be set to access or trunk mode explicitly', true, 'Not dynamic desirable or auto.'],
    ['The port is shut down', false, 'Unrelated.'],
    ['The VLAN does not exist', false, 'Unrelated.'],
    ['PortFast is on', false, 'Unrelated.'],
  ], 'Set switchport mode access first. Hard-setting access mode is good practice anyway, since it also stops DTP from turning the port into a trunk.', { console: true }),
  Q('b5-l2-05', 'SECF', 't5-l2sec', 'What does DHCP snooping do?', [
    ['Lets DHCP server replies in only on trusted ports, blocking rogue DHCP servers, and builds a binding table', true, 'Trusted versus untrusted.'],
    ['Encrypts DHCP traffic', false, 'No.'],
    ['Assigns addresses itself', false, 'It filters.'],
    ['Relays DHCP to another subnet', false, 'That is ip helper-address.'],
  ], 'On untrusted ports (users), DHCP server messages (Offer, Ack) are dropped. Uplinks toward the legitimate server are trusted. The binding table it builds (MAC, IP, VLAN, port) is reused by Dynamic ARP Inspection and IP Source Guard.'),
  Q('b5-l2-06', 'SECF', 't5-l2sec', 'Which commands enable DHCP snooping for VLAN 10 and trust the uplink Gi0/24? (Choose two.)', [
    ['ip dhcp snooping and ip dhcp snooping vlan 10 (global)', true, 'Global enable plus VLAN.'],
    ['ip dhcp snooping trust (on Gi0/24)', true, 'Trusts the uplink.'],
    ['ip dhcp snooping trust (on every access port)', false, 'Users\' ports must stay untrusted.'],
    ['ip helper-address on Gi0/24', false, 'Relay, not snooping.'],
  ], 'Snooping needs both the global command and the VLAN list. All ports start untrusted, so trust the uplinks (and the port to a local DHCP server). Optionally rate-limit DHCP on access ports with ip dhcp snooping limit rate.', { console: true }),
  Q('b5-l2-07', 'SECF', 't5-l2sec', 'After enabling DHCP snooping, no client gets an address. The server is two switches away. What is the likely cause?', [
    ['The uplink toward the DHCP server was not set as trusted, so Offers are dropped', true, 'Untrusted by default.'],
    ['DHCP snooping always breaks DHCP', false, 'Only when misconfigured.'],
    ['The clients need static addresses', false, 'No.'],
    ['The VLAN needs a new SVI', false, 'No.'],
  ], 'Every port is untrusted until configured otherwise. If the path to the server is untrusted, the server\'s replies are dropped. A second cause: snooping inserts option 82, which some servers reject unless no ip dhcp snooping information option is set.'),
  Q('b5-l2-08', 'SECF', 't5-l2sec', 'What does Dynamic ARP Inspection check?', [
    ['That ARP messages on untrusted ports match the DHCP snooping binding table (or an ARP ACL)', true, 'Stops ARP spoofing.'],
    ['That DHCP Offers come from trusted ports', false, 'That is DHCP snooping.'],
    ['That MAC counts stay under a limit', false, 'That is port security.'],
    ['That BPDUs do not arrive', false, 'That is BPDU Guard.'],
  ], 'DAI intercepts ARP on untrusted ports and drops any whose IP-to-MAC pairing is not in the snooping table. Hosts with static addresses need ARP ACLs, and uplinks are trusted.'),
  Q('b5-l2-09', 'SECF', 't5-l2sec', 'Which feature must be running for Dynamic ARP Inspection to validate DHCP clients?', [
    ['DHCP snooping', true, 'DAI uses its binding table.'],
    ['Port security', false, 'Separate feature.'],
    ['CDP', false, 'Unrelated.'],
    ['STP', false, 'Unrelated.'],
  ], 'DAI does not learn bindings itself; it consults the table DHCP snooping builds. Enable snooping first, let clients renew, then enable ip arp inspection vlan 10 and trust uplinks.'),
  Q('b5-l2-10', 'SECF', 't5-l2sec', 'A printer with a static IP stops working after DAI is enabled on its VLAN. Why?', [
    ['Its address is not in the DHCP snooping table, so its ARP messages are dropped', true, 'No binding for static hosts.'],
    ['Printers do not use ARP', false, 'Every IPv4 host does.'],
    ['DAI blocks all printers', false, 'No.'],
    ['The printer needs PoE', false, 'Unrelated.'],
  ], 'Static hosts never appear in the snooping bindings. Add an ARP ACL (arp access-list) permitting its IP and MAC and apply it with ip arp inspection filter, or a static snooping binding.'),
  Q('b5-l2-11', 'SECF', 't5-l2sec', 'Which attack does DHCP snooping\'s rate limiting help stop?', [
    ['DHCP starvation, where an attacker requests every address with fake MACs', true, 'Rate limit plus port security.'],
    ['ARP spoofing', false, 'DAI.'],
    ['VLAN hopping', false, 'Trunk hardening.'],
    ['Brute-force logins', false, 'login block-for.'],
  ], 'Starvation exhausts the pool so legitimate clients get nothing, often before a rogue server steps in. Limiting DHCP packets per second on access ports and limiting MACs with port security both block it.'),
  Q('b5-l2-12', 'SECF', 't5-l2sec', 'Which command shows the IP and MAC bindings DHCP snooping has learned?', [
    ['show ip dhcp snooping binding', true, 'MAC, IP, lease, VLAN, port.'],
    ['show ip dhcp binding', false, 'The DHCP server\'s leases.'],
    ['show arp', false, 'ARP cache.'],
    ['show port-security', false, 'Port security status.'],
  ], 'The snooping binding table is the switch\'s own record of who got which address on which port. If a host is missing, DAI will drop its ARP.', { console: true }),
  Q('b5-l2-13', 'SECF', 't5-l2sec', 'Which two actions defend against VLAN hopping? (Choose two.)', [
    ['Hard-set access ports with switchport mode access and disable DTP', true, 'Stops switch spoofing.'],
    ['Use an unused VLAN as the native VLAN on trunks', true, 'Stops double tagging.'],
    ['Enable PortFast everywhere', false, 'Unrelated.'],
    ['Increase the MAC aging time', false, 'Unrelated.'],
  ], 'Switch spoofing tricks a dynamic port into trunking with the attacker; hard-set modes and nonegotiate close it. Double tagging needs the attacker on the native VLAN; making the native VLAN unused closes that.'),
  Q('b5-l2-14', 'SECF', 't5-l2sec', 'Which command automatically re-enables ports err-disabled by port security after 5 minutes?', [
    ['errdisable recovery cause psecure-violation, with errdisable recovery interval 300', true, 'Automatic recovery.'],
    ['no shutdown', false, 'Manual recovery.'],
    ['switchport port-security aging time 5', false, 'Ages secure addresses.'],
    ['spanning-tree portfast', false, 'Unrelated.'],
  ], 'Without recovery, an err-disabled port stays down until someone bounces it. Automatic recovery helps remote sites, but if the cause remains, the port will just shut again.', { console: true }),
  Q('b5-l2-15', 'SECF', 't5-l2sec', 'Which command lists every err-disabled port and the reason?', [
    ['show interfaces status err-disabled', true, 'Port, status and reason.'],
    ['show ip interface brief', false, 'No reason shown.'],
    ['show errors', false, 'Not valid.'],
    ['show vlan brief', false, 'No status reasons.'],
  ], 'The reason column says psecure-violation, bpduguard, link-flap and so on, which tells you which feature acted and so what to fix before re-enabling the port.', { console: true }),
  Q('b5-l2-16', 'SECF', 't5-l2sec', 'What is the default maximum number of secure MAC addresses with port security enabled?', [
    ['1', true, 'Default maximum.'],
    ['2', false, 'Must be configured.'],
    ['0', false, 'Not possible.'],
    ['Unlimited', false, 'That would defeat it.'],
  ], 'The default suits a single PC. Phones with a PC behind them need maximum 2 (some designs use 3 to allow for the phone appearing in both VLANs). Defaults: maximum 1, violation shutdown, no sticky.'),
  Q('b5-l2-17', 'SECF', 't5-l2sec', 'Which statement about port security sticky addresses is true?', [
    ['They are learned dynamically and added to the running configuration', true, 'Save to keep them.'],
    ['They age out after 5 minutes', false, 'Not by default.'],
    ['They must be typed manually', false, 'That is static secure MACs.'],
    ['They apply to trunks only', false, 'Mostly used on access ports.'],
  ], 'Sticky combines the ease of dynamic learning with the persistence of static entries. After a legitimate device change, clear port-security sticky on the port or remove the line, then let it relearn.'),
  Q('b5-l2-18', 'SECF', 't5-l2sec', 'Which feature, built on DHCP snooping, filters IP traffic from a port so only the source address in the binding table is allowed?', [
    ['IP Source Guard', true, 'Prevents IP spoofing from access ports.'],
    ['DAI', false, 'Checks ARP.'],
    ['Root Guard', false, 'STP feature.'],
    ['BPDU Filter', false, 'STP feature.'],
  ], 'IP Source Guard (ip verify source) installs a per-port filter from the snooping bindings, so a host cannot send packets with someone else\'s IP. It is the IP-layer partner of DAI.'),
  Q('b5-l2-19', 'SECF', 't5-l2sec', 'A port shows "Port Status: Secure-up" with a violation count of 12 in restrict mode. What is happening?', [
    ['Extra devices keep trying to send; their frames are dropped and logged, but the port stays up', true, 'Restrict behavior.'],
    ['The port is down', false, 'Secure-up.'],
    ['Port security is disabled', false, 'It reports status.'],
    ['Everything is fine with no traffic dropped', false, 'Frames were dropped.'],
  ], 'Restrict lets the known device keep working while counting and logging every violating frame. A climbing count usually means a hub, switch or VM is behind the port.', { console: true }),
  Q('b5-l2-20', 'SECF', 't5-l2sec', 'Which port should be marked trusted for DHCP snooping on an access switch?', [
    ['The uplink toward the distribution switch and the DHCP server', true, 'Legitimate server replies arrive there.'],
    ['Every user port', false, 'Rogue servers could answer.'],
    ['The port to a guest kiosk', false, 'Untrusted.'],
    ['None', false, 'The uplink must be trusted.'],
  ], 'Trust follows the path legitimate DHCP replies take. On an access switch that is normally just its uplinks; on the switch where the DHCP server plugs in, that port too.'),

  // ---------- t5-aaa ----------
  Q('b5-aaa-01', 'SECF', 't5-aaa', 'Match the AAA functions: which describes authorization?', [
    ['Deciding what an authenticated user is allowed to do', true, 'Permissions.'],
    ['Proving who the user is', false, 'Authentication.'],
    ['Recording what the user did', false, 'Accounting.'],
    ['Encrypting the session', false, 'Not AAA.'],
  ], 'Authentication answers who are you, authorization answers what may you do, accounting answers what did you do (and when). TACACS+ handles them separately, which is why it suits device administration.'),
  Q('b5-aaa-02', 'SECF', 't5-aaa', 'Which comparison of RADIUS and TACACS+ is correct?', [
    ['RADIUS uses UDP and encrypts only the password; TACACS+ uses TCP 49 and encrypts the whole payload', true, 'Key differences.'],
    ['RADIUS is Cisco proprietary', false, 'RADIUS is an open standard; TACACS+ came from Cisco.'],
    ['TACACS+ combines authentication and authorization', false, 'It separates them.'],
    ['Both use UDP 49', false, 'No.'],
  ], 'RADIUS (UDP 1812/1813) is the standard for network access: 802.1X, VPN, Wi-Fi. TACACS+ (TCP 49) is preferred for admin logins to network devices because it encrypts everything and authorizes command by command.'),
  Q('b5-aaa-03', 'SECF', 't5-aaa', 'Which command must be entered before IOS will use AAA method lists?', [
    ['aaa new-model', true, 'Enables AAA.'],
    ['aaa enable', false, 'Not valid.'],
    ['tacacs-server enable', false, 'Not valid.'],
    ['login aaa', false, 'Not valid.'],
  ], 'aaa new-model switches the device to AAA. From then on, lines use the default login method list unless told otherwise, so configure it carefully (with local as a fallback) to avoid locking yourself out.', { console: true }),
  Q('b5-aaa-04', 'SECF', 't5-aaa', 'What does aaa authentication login default group tacacs+ local do?', [
    ['Authenticates logins against TACACS+ servers, falling back to local accounts only if no server responds', true, 'Fallback on error, not on rejection.'],
    ['Uses local accounts first, then TACACS+', false, 'Order is left to right.'],
    ['Falls back to local if the TACACS+ password is wrong', false, 'A rejection is final.'],
    ['Disables login', false, 'No.'],
  ], 'Method lists are tried in order, but the next method is only used if the previous one errors (unreachable). A "wrong password" answer from TACACS+ ends the attempt. Local is the break-glass for server outages.', { console: true }),
  Q('b5-aaa-05', 'SECF', 't5-aaa', 'In 802.1X, which device is the authenticator?', [
    ['The switch or WLC that controls the port', true, 'Relays between supplicant and server.'],
    ['The user\'s laptop', false, 'That is the supplicant.'],
    ['The RADIUS server', false, 'That is the authentication server.'],
    ['The DHCP server', false, 'Not a role.'],
  ], 'The supplicant (client software) sends credentials using EAP; the authenticator (switch or WLC) passes them to the authentication server (RADIUS) and opens the port only on success.'),
  Q('b5-aaa-06', 'SECF', 't5-aaa', 'Before 802.1X authentication succeeds, what traffic does the switch port allow from the client?', [
    ['Only EAPOL (802.1X) frames', true, 'Everything else is blocked.'],
    ['All traffic', false, 'That defeats the purpose.'],
    ['Only DHCP', false, 'DHCP waits for authentication.'],
    ['Only DNS', false, 'No.'],
  ], 'An 802.1X port starts unauthorized and passes only EAP over LAN frames. After the RADIUS server accepts, the port authorizes and can also receive a VLAN or ACL from the server.'),
  Q('b5-aaa-07', 'SECF', 't5-aaa', 'Which AAA function would show that admin "jlee" ran "reload" at 02:14?', [
    ['Accounting', true, 'Records actions.'],
    ['Authentication', false, 'Who logged in.'],
    ['Authorization', false, 'Whether they were allowed.'],
    ['Encryption', false, 'Not AAA.'],
  ], 'Command accounting sends each command to the AAA server with user and time, creating an audit trail. Combined with per-command authorization, it gives tight control over who changes what.'),
  Q('b5-aaa-08', 'SECF', 't5-aaa', 'Which commands point IOS at a RADIUS server for AAA? (Choose two.)', [
    ['radius server ISE1, with address ipv4 10.1.1.20 and key', true, 'Defines the server.'],
    ['aaa authentication login default group radius local', true, 'Uses it for logins.'],
    ['ip radius 10.1.1.20', false, 'Not valid.'],
    ['transport input radius', false, 'Not valid.'],
  ], 'Define each server with its address and shared key, optionally group them, then reference the group in method lists. The shared key must match the server\'s entry for this device.', { console: true }),
  Q('b5-aaa-09', 'SECF', 't5-aaa', 'Why keep a local account even when TACACS+ is configured?', [
    ['As a fallback if the AAA servers are unreachable', true, 'Break-glass access.'],
    ['Because TACACS+ requires it', false, 'Not required.'],
    ['To make logins faster', false, 'No.'],
    ['Local accounts are more secure', false, 'Not the reason.'],
  ], 'If the WAN to the AAA servers fails, a device with only TACACS+ authentication locks everyone out. A strong local account used only in emergencies, listed after the group, keeps access possible.'),
  Q('b5-aaa-10', 'SECF', 't5-aaa', 'Which protocol do wireless clients typically use with RADIUS for WPA2-Enterprise?', [
    ['EAP over 802.1X', true, 'EAP methods such as PEAP or EAP-TLS.'],
    ['TACACS+', false, 'Device admin.'],
    ['SNMP', false, 'Monitoring.'],
    ['DHCP', false, 'Addressing.'],
  ], 'Enterprise Wi-Fi uses 802.1X: the client speaks EAP to the AP/WLC, which relays to RADIUS. EAP-TLS uses certificates on both sides; PEAP wraps a username and password inside a TLS tunnel.'),

  // ---------- t5-wsec ----------
  Q('b5-ws-01', 'SECF', 't5-wsec', 'Which encryption does WPA2 use?', [
    ['AES with CCMP', true, 'The WPA2 standard.'],
    ['RC4 with TKIP', false, 'WPA (original).'],
    ['RC4 with static keys', false, 'WEP.'],
    ['DES', false, 'Not a Wi-Fi standard.'],
  ], 'WEP used RC4 with static keys and was broken in minutes. WPA added TKIP as a stopgap. WPA2 brought AES-CCMP. WPA3 adds SAE for personal networks, mandatory PMF and stronger enterprise options (GCMP-256).'),
  Q('b5-ws-02', 'SECF', 't5-wsec', 'What does WPA3-Personal use instead of the WPA2 pre-shared key handshake?', [
    ['SAE (Simultaneous Authentication of Equals)', true, 'Resists offline dictionary attacks.'],
    ['TKIP', false, 'Older.'],
    ['802.1X', false, 'Enterprise.'],
    ['WEP', false, 'Broken.'],
  ], 'With WPA2-PSK, an attacker who captures the 4-way handshake can guess passwords offline. SAE makes every guess require a live exchange with the AP, and gives forward secrecy.'),
  Q('b5-ws-03', 'SECF', 't5-wsec', 'What is the difference between WPA2-Personal and WPA2-Enterprise?', [
    ['Personal uses one shared passphrase; Enterprise authenticates each user through 802.1X and RADIUS', true, 'Shared key versus individual credentials.'],
    ['Enterprise uses no encryption', false, 'Both use AES.'],
    ['Personal is for 5 GHz only', false, 'Band independent.'],
    ['They are identical', false, 'Authentication differs.'],
  ], 'Personal is simple but everyone shares the key: one leaver means changing it everywhere. Enterprise gives each user their own credentials and per-session keys, and lets you revoke one person.'),
  Q('b5-ws-04', 'SECF', 't5-wsec', 'Which wireless security protocol should never be used because it can be cracked in minutes?', [
    ['WEP', true, 'Fundamentally broken.'],
    ['WPA3', false, 'Current.'],
    ['WPA2-AES', false, 'Still acceptable.'],
    ['802.1X with EAP-TLS', false, 'Strong.'],
  ], 'WEP\'s RC4 key scheduling and short IVs let attackers recover the key from captured traffic. Modern devices may not even offer it. TKIP is deprecated too.'),
  Q('b5-ws-05', 'SECF', 't5-wsec', 'What does Protected Management Frames (802.11w) defend against?', [
    ['Forged deauthentication and disassociation frames that knock clients off', true, 'Management frame protection.'],
    ['Weak passwords', false, 'No.'],
    ['Channel overlap', false, 'No.'],
    ['DHCP starvation', false, 'No.'],
  ], 'Without PMF, anyone can spoof deauth frames to kick clients off (often to capture a handshake). WPA3 makes PMF mandatory; WPA2 can enable it optionally.'),
  Q('b5-ws-06', 'SECF', 't5-wsec', 'Which settings configure a WPA2-PSK WLAN on a Cisco WLC? (Choose two.)', [
    ['Layer 2 Security WPA+WPA2 with WPA2 policy and AES encryption', true, 'Encryption choice.'],
    ['Authentication Key Management set to PSK with the passphrase', true, 'Key choice.'],
    ['Layer 2 Security None with web auth', false, 'An open network with a portal.'],
    ['Authentication Key Management 802.1X', false, 'Enterprise.'],
  ], 'On the WLAN\'s Security, Layer 2 tab: choose WPA+WPA2, tick WPA2 policy and AES, set auth key management to PSK, choose ASCII and enter an 8 to 63 character passphrase. Apply and enable the WLAN.'),
  Q('b5-ws-07', 'SECF', 't5-wsec', 'Which statement about hiding the SSID is true?', [
    ['It is not a security control: the name still appears in probe and association frames', true, 'Obscurity only.'],
    ['It encrypts traffic', false, 'No.'],
    ['It blocks all attackers', false, 'Tools reveal hidden SSIDs.'],
    ['It is required for WPA3', false, 'No.'],
  ], 'Hidden SSIDs and MAC filtering are both easily bypassed. Protection comes from WPA2/WPA3 encryption and per-user authentication.'),
  Q('b5-ws-08', 'SECF', 't5-wsec', 'What does the WPA2 4-way handshake accomplish?', [
    ['It proves both sides know the PMK and derives fresh session keys for encryption', true, 'Key confirmation and derivation.'],
    ['It assigns an IP address', false, 'DHCP.'],
    ['It chooses the channel', false, 'No.'],
    ['It authenticates the RADIUS server', false, 'That happens in EAP.'],
  ], 'After authentication (PSK or 802.1X) both sides hold the pairwise master key. The 4-way handshake confirms that and derives per-session keys, so each client\'s traffic is encrypted with its own key.'),
  Q('b5-ws-09', 'SECF', 't5-wsec', 'Which WPA3 mode protects open networks such as cafes with encryption but no password?', [
    ['Enhanced Open (OWE)', true, 'Opportunistic Wireless Encryption.'],
    ['WPA3-Personal', false, 'Needs a password.'],
    ['WPA3-Enterprise', false, 'Needs 802.1X.'],
    ['WEP', false, 'Broken.'],
  ], 'OWE gives each client an individually encrypted session on an open network, stopping passive eavesdropping. It does not authenticate users, so it is not a substitute for Enterprise security.'),
  Q('b5-ws-10', 'SECF', 't5-wsec', 'What length must a WPA2 passphrase be?', [
    ['8 to 63 characters', true, 'Or 64 hex digits.'],
    ['4 to 8 characters', false, 'Too short.'],
    ['Exactly 10', false, 'No.'],
    ['Up to 32', false, 'That is the SSID limit.'],
  ], 'Passphrases are hashed with the SSID into a 256-bit key. Longer, unpredictable passphrases resist offline guessing; 20 or more characters is a good practice for WPA2-Personal.'),
  Q('b5-ws-11', 'SECF', 't5-wsec', 'Which EAP method uses certificates on both the client and the server?', [
    ['EAP-TLS', true, 'Mutual certificate authentication.'],
    ['PEAP', false, 'Server certificate, user password.'],
    ['EAP-FAST', false, 'Uses PACs.'],
    ['LEAP', false, 'Legacy and weak.'],
  ], 'EAP-TLS is the strongest common method: no passwords to steal, but every client needs a certificate, which needs a PKI. PEAP is easier to deploy using existing usernames and passwords.'),
  Q('b5-ws-12', 'SECF', 't5-wsec', 'Which WPA version introduced TKIP as an interim fix for WEP?', [
    ['WPA (the original)', true, 'TKIP on existing hardware.'],
    ['WPA2', false, 'Introduced AES-CCMP.'],
    ['WPA3', false, 'Introduced SAE.'],
    ['802.1X', false, 'Authentication framework.'],
  ], 'WPA let old WEP hardware get a firmware upgrade to TKIP while new hardware was designed. TKIP has its own weaknesses and is deprecated; choose WPA2-AES at minimum.'),
];
