// Console practice, part B: services, security and automation output,
// plus common issues on the thinner branches.

import { Q, X } from './qb.js';

export const X_CONSOLE_B = [
  // ---------- services ----------
  Q('xb-svc-01', 'IPS', 't4-dhcp-dns', 'Why are new clients in this pool getting APIPA addresses?', [
    ['The pool is exhausted: every leasable address is in use', true, 'Leased equals total.'],
    ['The pool network is wrong', false, 'The subnet looks right.'],
    ['DNS is missing', false, 'Unrelated to leasing.'],
    ['The relay is missing', false, 'Existing clients got addresses.'],
  ], 'Total addresses 254 with 244 leased and 10 excluded leaves nothing. Shorten the lease so abandoned leases expire, clear stale bindings, or widen the subnet.', {
    exhibit: X(`
R1#show ip dhcp pool
Pool LAN :
 Utilization mark (high/low)    : 100 / 0
 Subnet size (first/next)       : 0 / 0
 Total addresses                : 254
 Leased addresses               : 244
 Excluded addresses             : 10
 Pending event                  : none
 1 subnet is currently in the pool :
 Current index        IP address range                    Leased/Excluded/Total
 10.1.10.1            10.1.10.1        - 10.1.10.254       244    / 10    / 254`,
      ['show ip dhcp pool', 'cmd'], ['Total addresses                : 254', 'count', 'Total'], ['Leased addresses               : 244', 'fail', 'Leased'], ['Excluded addresses             : 10', 'count', 'Excluded'], [/10\.1\.10\.(1|254)(?= )/, 'ip', 'Pool range']),
  }),
  Q('xb-svc-02', 'IPS', 't4-ntp-log', 'Which NTP server is this router synchronized to?', [
    ['10.1.1.1, marked with an asterisk', true, '* is the system peer.'],
    ['10.1.1.2', false, '+ means candidate.'],
    ['127.127.1.1', false, 'Not listed.'],
    ['None', false, 'One is marked.'],
  ], 'In show ntp associations, * marks the synchronized peer, + a candidate, - an outlier and ~ a configured server. The st column shows each server\'s stratum.', {
    exhibit: X(`
R1#show ntp associations
  address         ref clock       st   when   poll reach  delay  offset   disp
*~10.1.1.1        192.0.2.10       2     36     64   377  1.204   0.311  0.882
+~10.1.1.2        192.0.2.10       2     12     64   377  1.551   0.402  0.910
 * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured`,
      ['show ntp associations', 'cmd'], ['*~10.1.1.1', 'ok', 'Synchronized peer'], ['+~10.1.1.2', 'state', 'Candidate'], [/(?<= {7})2(?= {5})/, 'key', 'Stratum'], [/377/, 'count', 'Reach (all recent polls answered)']),
  }),
  Q('xb-svc-03', 'IPS', 't4-ntp-log', 'Which messages from this buffer would reach a syslog server configured with logging trap warnings?', [
    ['Only the %LINK-3-UPDOWN message', true, 'Severity 3 is at or above warnings (4).'],
    ['All three', false, 'Severity 5 is below warnings.'],
    ['Only the %SYS-5 message', false, 'Severity 5 is excluded.'],
    ['None', false, 'Severity 3 qualifies.'],
  ], 'Levels 0 to 4 pass with logging trap warnings. LINK-3 (errors) passes; LINEPROTO-5 and SYS-5 (notifications) do not. Use informational (6) on the server to capture interface and config changes too.', {
    exhibit: X(`
%LINK-3-UPDOWN: Interface GigabitEthernet0/2, changed state to down
%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/2, changed state to down
%SYS-5-CONFIG_I: Configured from console by admin on vty0 (10.1.99.5)`,
      [/-3-/, 'fail', 'Severity 3'], [/-5-/, 'state', 'Severity 5'], [/%(LINK|LINEPROTO|SYS)/, 'key', 'Facility'], [/GigabitEthernet0\/2/, 'iface'], ['10.1.99.5', 'ip', 'Admin source']),
  }),
  Q('xb-svc-04', 'IPS', 't4-snmp', 'What does this configuration allow?', [
    ['Read-only SNMPv2c polling with community N0c-View, only from hosts in ACL 15, and traps to 10.1.1.60', true, 'RO community, ACL, trap host.'],
    ['Read-write access from anywhere', false, 'RO with an ACL.'],
    ['SNMPv3 with encryption', false, 'This is v2c.'],
    ['Syslog to 10.1.1.60', false, 'That is SNMP traps.'],
  ], 'Read the parts: community string, RO or RW, and an optional ACL number. snmp-server host sets where traps go and snmp-server enable traps chooses which. v2c strings travel in clear text, so restrict them tightly.', {
    exhibit: X(`
access-list 15 permit host 10.1.1.60
snmp-server community N0c-View RO 15
snmp-server host 10.1.1.60 version 2c N0c-View
snmp-server enable traps`,
      [/10\.1\.1\.60/, 'ip', 'NMS'], [/N0c-View/, 'key', 'Community string'], [/ RO /, 'state', 'Read-only'], [/ 15$/m, 'key', 'ACL'], ['version 2c', 'state', 'Version']),
  }),
  Q('xb-svc-05', 'IPS', 't4-snmp', 'An NMS stopped receiving data from a switch after a firewall change. Which port must be allowed from the NMS to the switch for polling?', [
    ['UDP 161', true, 'Agent listens on 161.'],
    ['UDP 162', false, 'Traps to the NMS.'],
    ['TCP 22', false, 'SSH.'],
    ['UDP 514', false, 'Syslog.'],
  ], 'Polling goes NMS to device on UDP 161; traps and informs go device to NMS on UDP 162. A firewall change often blocks one direction, so polling fails while traps still arrive, or the reverse.'),
  Q('xb-svc-06', 'IPS', 't4-snmp', 'Which SNMPv3 configuration provides authentication and encryption for user nms1?', [
    ['snmp-server group NMS v3 priv / snmp-server user nms1 NMS v3 auth sha AuthPass priv aes 128 PrivPass', true, 'authPriv.'],
    ['snmp-server community nms1 RO', false, 'v2c community.'],
    ['snmp-server user nms1 NMS v3', false, 'No auth or priv.'],
    ['snmp-server group NMS v3 noauth', false, 'No security.'],
  ], 'The group sets the minimum security level (priv = authPriv); the user supplies the auth hash and privacy (encryption) keys. The NMS must be configured with the same user and keys.', { console: true }),
  Q('xb-svc-07', 'IPS', 't4-files', 'Which command saves the running configuration to an FTP server as r1-backup.cfg?', [
    ['copy running-config ftp://10.1.1.5/r1-backup.cfg', true, 'Source then destination URL.'],
    ['copy ftp: running-config', false, 'Restores from FTP.'],
    ['backup ftp r1-backup.cfg', false, 'Not valid.'],
    ['write ftp 10.1.1.5', false, 'Not valid.'],
  ], 'copy accepts full URLs. Credentials come from ip ftp username and ip ftp password, or can be placed in the URL. For security, prefer scp:// over ftp:// so the config is encrypted in transit.', { console: true }),
  Q('xb-svc-08', 'IPS', 't4-files', 'A TFTP image copy succeeds but takes far longer than expected over a WAN link. Why?', [
    ['TFTP sends one small block at a time and waits for each acknowledgment', true, 'Lock-step transfer.'],
    ['TFTP encrypts everything', false, 'It does not.'],
    ['TFTP uses TCP slow start', false, 'It uses UDP.'],
    ['The router compresses the image', false, 'No.'],
  ], 'Classic TFTP moves 512-byte blocks, each acknowledged before the next, so latency dominates. FTP, SCP or HTTP(S) stream data over TCP and are much faster across a WAN.'),
  Q('xb-svc-09', 'IPS', 't4-files', 'Which statement about FTP passive mode is true?', [
    ['The client opens both the control and data connections, which works better through client-side NAT and firewalls', true, 'Server offers a port; client connects.'],
    ['The server connects back to the client for data', false, 'That is active mode.'],
    ['Passive mode uses UDP', false, 'TCP.'],
    ['Passive mode encrypts data', false, 'No.'],
  ], 'In active mode the server opens the data connection from port 20 to the client, which NAT and firewalls usually block. In passive mode the client opens it to a port the server announced.'),
  Q('xb-svc-10', 'IPS', 't4-qos', 'Output drops are climbing on the WAN interface during the day. What does that indicate?', [
    ['Congestion: more traffic is queued for the link than it can send, so packets are dropped', true, 'Egress queue overflow.'],
    ['A bad cable', false, 'That shows input CRC errors.'],
    ['A duplex mismatch', false, 'That shows collisions.'],
    ['DNS failures', false, 'Unrelated.'],
  ], 'Output drops mean the egress queue filled. Without QoS, voice is dropped as readily as backups. Apply a policy with a priority queue for voice and bandwidth guarantees, or add capacity.', {
    exhibit: X(`
R1#show interfaces g0/1 | include drops|rate
  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 48211
  5 minute input rate 12004000 bits/sec, 2210 packets/sec
  5 minute output rate 49610000 bits/sec, 6120 packets/sec`,
      ['show interfaces g0/1 | include drops|rate', 'cmd'], ['Total output drops: 48211', 'fail', 'Output drops'], ['49610000 bits/sec', 'count', 'Output rate (near a 50 Mb/s circuit)']),
  }),
  Q('xb-svc-11', 'IPS', 't4-nat', 'This translation table is empty while users browse. What should you check first?', [
    ['Whether ip nat inside and ip nat outside are on the right interfaces and the ACL matches the users', true, 'No translations means NAT never triggers.'],
    ['The DNS server', false, 'Not first.'],
    ['The VLAN names', false, 'Unrelated.'],
    ['The router\'s clock', false, 'Unrelated.'],
  ], 'An empty table during traffic means no packet satisfied the conditions: crossing inside to outside, matching the ACL. show ip nat statistics shows which interfaces are inside and outside and whether there were misses.', {
    exhibit: X(`
R1#show ip nat translations
R1#`,
      ['show ip nat translations', 'cmd'], [/^R1#$/m, 'fail', 'Nothing translated']),
  }),
  Q('xb-svc-12', 'IPS', 't4-dhcp-dns', 'After a server moved to a new IP, some users still reach the old address by name for a while. Why?', [
    ['Resolvers and clients cache the old DNS answer until its TTL expires', true, 'DNS caching.'],
    ['DHCP gave them the old address', false, 'DHCP does not hand out server records.'],
    ['ARP is stale on the server', false, 'Not the cause.'],
    ['NAT is broken', false, 'Not indicated.'],
  ], 'Every DNS record has a TTL; caches keep answers until it expires. Lower the TTL before a planned move, and clear client caches (ipconfig /flushdns) if needed.'),

  // ---------- security ----------
  Q('xb-sec-01', 'SECF', 't5-l2sec', 'What does this DAI output show?', [
    ['ARP packets on VLAN 10 are being dropped because they failed DHCP snooping validation', true, 'DHCP drops counter.'],
    ['DAI is disabled', false, 'It is counting drops.'],
    ['DHCP snooping is blocking all DHCP', false, 'This is ARP inspection.'],
    ['Everything is forwarded', false, 'Drops are counted.'],
  ], 'DHCP Drops counts ARP packets whose sender IP and MAC did not match a snooping binding. A spoofing attacker or a static-IP host without an ARP ACL both appear here.', {
    exhibit: X(`
SW1#show ip arp inspection statistics vlan 10
 Vlan      Forwarded        Dropped     DHCP Drops      ACL Drops
 ----      ---------        -------     ----------      ---------
   10           8812            143            143              0`,
      ['show ip arp inspection statistics vlan 10', 'cmd'], [/(?<= {3})10(?= {11})/, 'vlan'], ['8812', 'ok', 'Forwarded'], [/(?<=8812 +)143/, 'fail', 'Dropped'], [/143(?= +0$)/m, 'fail', 'Failed snooping validation']),
  }),
  Q('xb-sec-02', 'SECF', 't5-l2sec', 'Which ports are trusted for DHCP snooping on this switch?', [
    ['Only Gi0/24', true, 'Listed as trusted yes.'],
    ['Gi0/1 and Gi0/24', false, 'Gi0/1 is untrusted.'],
    ['None', false, 'Gi0/24 is trusted.'],
    ['All ports', false, 'Ports default to untrusted.'],
  ], 'show ip dhcp snooping lists the enabled VLANs, whether option 82 insertion is on, and each configured interface with its trust state and rate limit. Uplinks toward the server should be trusted; user ports should not.', {
    exhibit: X(`
SW1#show ip dhcp snooping
Switch DHCP snooping is enabled
DHCP snooping is configured on following VLANs:
10,20
Insertion of option 82 is enabled
Interface                  Trusted    Allow option    Rate limit (pps)
-----------------------    -------    ------------    ----------------
GigabitEthernet0/1         no         no              10
GigabitEthernet0/24        yes        yes             unlimited`,
      ['show ip dhcp snooping', 'cmd'], ['Switch DHCP snooping is enabled', 'ok'], [/^10,20$/m, 'vlan'], [/GigabitEthernet0\/(1|24)/, 'iface'], [/(?<=GigabitEthernet0\/24 {8})yes/, 'ok', 'Trusted'], [/(?<=GigabitEthernet0\/1 {9})no/, 'state', 'Untrusted'], ['Insertion of option 82 is enabled', 'key']),
  }),
  Q('xb-sec-03', 'SECF', 't5-aaa', 'Admins cannot log in to a router. Based on this output, what is happening?', [
    ['The TACACS+ server is marked DEAD, so the router falls back to the next method, which must be local', true, 'Server unreachable.'],
    ['The local database is corrupt', false, 'Not indicated.'],
    ['AAA is disabled', false, 'Servers are listed.'],
    ['The admins typed the wrong enable secret', false, 'Not indicated.'],
  ], 'show aaa servers lists each server\'s state and request counts. DEAD means it stopped answering. If the method list lacks a local fallback, nobody can log in remotely; use the console with a local account.', {
    exhibit: X(`
R1#show aaa servers
TACACS+: id 1, priority 1, host 10.1.1.20, auth-port 49
     State: current DEAD, duration 1820s, previous duration 0s
     Authen: request 41, timeouts 41, failover 0, retransmission 0`,
      ['show aaa servers', 'cmd'], ['10.1.1.20', 'ip', 'AAA server'], ['auth-port 49', 'key', 'TACACS+ port'], ['current DEAD', 'fail', 'Server not responding'], ['timeouts 41', 'fail', 'Timeouts']),
  }),
  Q('xb-sec-04', 'SECF', 't5-aaa', 'Which method list lets admins log in with TACACS+ but still use a local account if every TACACS+ server is down?', [
    ['aaa authentication login default group tacacs+ local', true, 'TACACS+ first, local on error.'],
    ['aaa authentication login default local group tacacs+', false, 'Local first, so TACACS+ is used only if the local database errors.'],
    ['aaa authentication login default group tacacs+', false, 'No fallback.'],
    ['aaa authentication login default none', false, 'No authentication.'],
  ], 'Methods are tried left to right only when the previous one errors or is unavailable. A reject from TACACS+ is final, so local only helps during outages.', { console: true }),
  Q('xb-sec-05', 'SECF', 't5-aaa', 'Which AAA component would record that user "mreyes" logged in at 08:02 and out at 08:37?', [
    ['Accounting (exec accounting)', true, 'Start and stop records.'],
    ['Authentication', false, 'Checks identity.'],
    ['Authorization', false, 'Checks permissions.'],
    ['Auditing by SNMP', false, 'Not an AAA function.'],
  ], 'aaa accounting exec default start-stop group tacacs+ sends a start record at login and a stop record at logout, giving session durations; command accounting records each command.', { console: true }),
  Q('xb-sec-06', 'SECF', 't5-aaa', 'What is the role of the RADIUS server in 802.1X?', [
    ['The authentication server that checks the supplicant\'s credentials and tells the authenticator to allow or deny', true, 'The decision maker.'],
    ['The supplicant', false, 'The client.'],
    ['The authenticator', false, 'The switch or WLC.'],
    ['A DHCP relay', false, 'No.'],
  ], 'The switch never sees the password: it relays EAP between the client and RADIUS. RADIUS can also return attributes such as a VLAN assignment or downloadable ACL for that user.'),
  Q('xb-sec-07', 'SECF', 't5-acl', 'Which line in this ACL is shadowed and can never match?', [
    ['Line 20, because line 10 already permits all of 10.1.1.0/24', true, 'An earlier broader match.'],
    ['Line 10', false, 'It matches first.'],
    ['Line 30', false, 'It matches anything left over.'],
    ['None', false, 'Line 20 is shadowed.'],
  ], 'When a broad line precedes a narrower one with the same source, the narrower one never sees traffic. Its hit counter stays at zero, which is the clue in show access-lists.', {
    exhibit: X(`
Standard IP access list 20
    10 permit 10.1.1.0, wildcard bits 0.0.0.255 (210 matches)
    20 deny   10.1.1.66 (0 matches)
    30 deny   any (12 matches)`,
      [/^ {4}(10|20|30)(?= )/m, 'key', 'Sequence number'], ['(210 matches)', 'count', 'Hits'], [/20 deny {3}10\.1\.1\.66 \(0 matches\)/, 'fail', 'Never matches'], ['0.0.0.255', 'mask', 'Wildcard']),
  }),
  Q('xb-sec-08', 'SECF', 't5-acl', 'Which ACL entry permits only the 10.1.4.0/22 range?', [
    ['permit 10.1.4.0 0.0.3.255', true, '/22 wildcard.'],
    ['permit 10.1.4.0 0.0.0.255', false, 'Only 10.1.4.0/24.'],
    ['permit 10.1.4.0 255.255.252.0', false, 'That is a subnet mask; as a wildcard it matches oddly.'],
    ['permit 10.1.0.0 0.0.7.255', false, 'That is 10.1.0.0/21.'],
  ], 'Wildcard = 255.255.255.255 minus the mask: 255.255.252.0 gives 0.0.3.255, matching 10.1.4.0 to 10.1.7.255. The /22 must start on a multiple of 4 in the third octet, which 10.1.4.0 does.', { console: true }),
  Q('xb-sec-09', 'SECF', 't5-access', 'An auditor finds this in a router config. Which line is the biggest risk?', [
    ['username tech password 0 Welcome1, stored in clear text', true, 'Plain-text credentials.'],
    ['enable secret 9 ...', false, 'Strong hash.'],
    ['transport input ssh', false, 'Good practice.'],
    ['login block-for 120 attempts 3 within 60', false, 'Good practice.'],
  ], 'Type 0 is plain text: anyone who sees a backup or a show run has the password. Replace it with username tech secret ..., and remove the old line.', {
    exhibit: X(`
enable secret 9 $9$Kd2LrJ9xP0e1Qq$Z1y2X3w4V5u6T7s8R9q0P
username tech password 0 Welcome1
login block-for 120 attempts 3 within 60
line vty 0 15
 login local
 transport input ssh`,
      ['username tech password 0 Welcome1', 'fail', 'Clear-text password'], [/enable secret 9/, 'ok', 'Strong hash'], ['transport input ssh', 'ok', 'SSH only'], ['login block-for 120 attempts 3 within 60', 'ok', 'Brute-force protection']),
  }),
  Q('xb-sec-10', 'SECF', 't5-access', 'Which output shows the router is currently refusing logins because of login block-for?', [
    ['"Router presently in Quiet-Mode" in show login', true, 'Quiet mode is the block.'],
    ['"SSH Enabled" in show ip ssh', false, 'SSH state.'],
    ['"Line protocol is up" in show interfaces', false, 'Interface state.'],
    ['"Gateway of last resort" in show ip route', false, 'Routing.'],
  ], 'During quiet mode the router rejects login attempts except from hosts permitted by login quiet-mode access-class. show login shows the remaining time.', { console: true }),
  Q('xb-sec-11', 'SECF', 't5-vpn', 'Which statement about this crypto output is correct?', [
    ['Phase 1 (IKE) is up with peer 203.0.113.9, and IPsec is encrypting and decrypting packets', true, 'QM_IDLE and rising counters.'],
    ['The tunnel is down', false, 'QM_IDLE is the healthy state and counters rise.'],
    ['Traffic is sent unencrypted', false, 'pkts encrypt rises.'],
    ['The peer is 10.1.1.1', false, 'The peer is 203.0.113.9.'],
  ], 'show crypto isakmp sa shows the IKE SA (QM_IDLE means established). show crypto ipsec sa shows the IPsec SAs with encrypt and decrypt counters; counters rising on both sides prove traffic flows through the tunnel.', {
    exhibit: X(`
R1#show crypto isakmp sa
dst             src             state          conn-id status
203.0.113.9     203.0.113.2     QM_IDLE           1001 ACTIVE
R1#show crypto ipsec sa | include peer|pkts
   current_peer 203.0.113.9 port 500
    #pkts encaps: 1420, #pkts encrypt: 1420, #pkts digest: 1420
    #pkts decaps: 1388, #pkts decrypt: 1388, #pkts verify: 1388`,
      [/show crypto isakmp sa|show crypto ipsec sa \| include peer\|pkts/, 'cmd'], [/203\.0\.113\.9/, 'hop', 'VPN peer'], ['203.0.113.2', 'ip', 'Local public address'], ['QM_IDLE', 'ok', 'IKE established'], [/#pkts (encrypt|decrypt): 14\d\d|#pkts (encrypt|decrypt): 13\d\d/, 'ok', 'Traffic protected']),
  }),
  Q('xb-sec-12', 'SECF', 't5-wsec', 'A WLAN uses WPA2-PSK. An employee leaves the company. What must happen to keep them off the Wi-Fi?', [
    ['Change the passphrase and update every device that uses it', true, 'Shared key.'],
    ['Nothing; their account is disabled', false, 'PSK has no per-user accounts.'],
    ['Change the SSID only', false, 'The key still works.'],
    ['Reboot the APs', false, 'No effect.'],
  ], 'That pain is the main argument for WPA2/WPA3-Enterprise with 802.1X: disabling one account removes one person. Some vendors offer per-device PSKs as a middle ground.'),

  // ---------- automation ----------
  Q('xb-auto-01', 'AUTO', 't6-rest', 'What should a script do after receiving this response?', [
    ['Obtain a new token and retry, because the token has expired or is invalid', true, '401 Unauthorized.'],
    ['Retry the same request immediately forever', false, 'It will keep failing.'],
    ['Assume the device was updated', false, 'It failed.'],
    ['Change the HTTP method to POST', false, 'Unrelated.'],
  ], 'Tokens expire. Well-behaved scripts catch 401, re-authenticate once and retry, and stop with a clear error if that fails.', {
    exhibit: X(`
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"error": "Token expired"}`,
      ['401 Unauthorized', 'fail', 'Status: unauthorized'], ['application/json', 'state', 'JSON body'], ['Token expired', 'fail', 'Reason']),
  }),
  Q('xb-auto-02', 'AUTO', 't6-json', 'In this API response, what is the management IP of the second device?', [
    ['10.10.20.52', true, 'response[1].managementIpAddress.'],
    ['10.10.20.51', false, 'That is the first device.'],
    ['edge-sw2', false, 'That is its hostname.'],
    ['2', false, 'That is the count.'],
  ], 'Navigate JSON by keys and indexes: response is an array, [1] is the second object, and managementIpAddress is its key. In Python: data["response"][1]["managementIpAddress"].', {
    exhibit: X(`
{
  "response": [
    {"hostname": "edge-sw1", "managementIpAddress": "10.10.20.51", "reachable": true},
    {"hostname": "edge-sw2", "managementIpAddress": "10.10.20.52", "reachable": false}
  ],
  "count": 2
}`,
      [/"(response|hostname|managementIpAddress|reachable|count)"/, 'key', 'Key'], [/10\.10\.20\.5[12]/, 'ip'], [/\b(true|false)\b/, 'state', 'Boolean'], [/(?<=: )2(?=\n)/, 'count', 'Number']),
  }),
  Q('xb-auto-03', 'AUTO', 't6-json', 'Which device in the same response is unreachable?', [
    ['edge-sw2', true, '"reachable": false.'],
    ['edge-sw1', false, 'reachable is true.'],
    ['Both', false, 'Only one is false.'],
    ['Neither', false, 'One is false.'],
  ], 'Booleans make filtering easy: a script can loop over response and print hostnames where reachable is false, turning a long inventory into an actionable list.', {
    exhibit: X(`
{
  "response": [
    {"hostname": "edge-sw1", "reachable": true},
    {"hostname": "edge-sw2", "reachable": false}
  ]
}`,
      [/"(response|hostname|reachable)"/, 'key', 'Key'], [/"edge-sw[12]"/, 'ip', 'String value'], [/\btrue\b/, 'ok', 'true'], [/\bfalse\b/, 'fail', 'false']),
  }),
  Q('xb-auto-04', 'AUTO', 't6-config', 'This playbook run reports "changed" on R1 and "ok" on R2. What does that mean?', [
    ['R1 needed the change and got it; R2 already matched, so nothing was done', true, 'Idempotent behavior.'],
    ['R2 failed', false, 'Failures report "failed".'],
    ['R1 failed', false, 'changed means success with a change.'],
    ['Both were rebooted', false, 'No.'],
  ], 'Idempotent modules compare the device with the desired lines and only push differences. A second run should show ok everywhere; a device that shows changed every run points at a module or template problem.', {
    exhibit: X(`
TASK [Point NTP at the core server] ******************************
changed: [R1]
ok: [R2]

PLAY RECAP *******************************************************
R1    : ok=1    changed=1    unreachable=0    failed=0
R2    : ok=1    changed=0    unreachable=0    failed=0`,
      [/^changed: \[R1\]/m, 'state', 'Changed'], [/^ok: \[R2\]/m, 'ok', 'Already compliant'], [/failed=0/, 'ok', 'No failures'], [/unreachable=0/, 'ok']),
  }),
  Q('xb-auto-05', 'AUTO', 't6-config', 'A Terraform plan shows "Plan: 0 to add, 1 to change, 2 to destroy." What should you do before apply?', [
    ['Review the plan to confirm the two destroys are intended', true, 'Destroys can cause outages.'],
    ['Apply immediately', false, 'Risky.'],
    ['Delete the state file', false, 'That loses track of resources.'],
    ['Nothing; plans are always safe', false, 'They describe what apply will do.'],
  ], 'The plan is Terraform telling you exactly what will happen. Unexpected destroys often mean a resource was renamed or the state drifted; fix the code rather than applying blindly.'),
  Q('xb-auto-06', 'AUTO', 't6-sdn', 'Which API would a ticketing system use to ask Catalyst Center for a list of devices?', [
    ['Its northbound REST API', true, 'Apps talk northbound.'],
    ['Its southbound NETCONF', false, 'Controller to devices.'],
    ['SNMP traps', false, 'Device to NMS alerts.'],
    ['CDP', false, 'Device discovery.'],
  ], 'External systems integrate with controllers through northbound REST APIs (with tokens and JSON). The controller then uses southbound protocols to talk to the devices.'),
  Q('xb-auto-07', 'AUTO', 't6-ai', 'An AI assistant suggests this change to fix slow OSPF convergence. What is the right next step?', [
    ['Verify it in a lab or against documentation and follow change control before applying', true, 'AI output is a draft.'],
    ['Apply it to every router immediately', false, 'Untested change at scale.'],
    ['Ignore all AI suggestions', false, 'They can be useful once verified.'],
    ['Paste the full configs with passwords into a public AI tool to double-check', false, 'Leaks secrets.'],
  ], 'Generative suggestions can be right, partly right or confidently wrong (here, timers set on one side only would break adjacencies). Test, review and roll out in stages.', {
    exhibit: X(`
interface GigabitEthernet0/0
 ip ospf hello-interval 1
 ip ospf dead-interval 3`,
      ['GigabitEthernet0/0', 'iface'], [/ip ospf (hello|dead)-interval \d/, 'key', 'Suggested timers']),
  }),
  Q('xb-auto-08', 'AUTO', 't6-ai', 'Which data would a predictive model need to forecast when a WAN link will saturate?', [
    ['Historical utilization over weeks or months', true, 'Trends need history.'],
    ['The router\'s hostname', false, 'Not predictive.'],
    ['The current enable secret', false, 'Irrelevant and sensitive.'],
    ['A single ping result', false, 'Too little data.'],
  ], 'Forecasts extrapolate patterns: daily and weekly cycles plus growth. SNMP counters or streaming telemetry collected over time provide that history.'),
  Q('xb-auto-09', 'AUTO', 't6-ai', 'Which is a sensible use of generative AI for a junior network engineer studying for the CCNA?', [
    ['Asking it to explain an unfamiliar show command output, then confirming with documentation or a lab', true, 'Learning aid with verification.'],
    ['Letting it take the exam', false, 'Not allowed or useful.'],
    ['Copying its configs into production without checking', false, 'Risky.'],
    ['Sharing company passwords for better answers', false, 'Never.'],
  ], 'AI is a good tutor for explanations and practice questions, and a poor authority. Treat its answers as hypotheses to confirm, especially specifics like command syntax and defaults.'),
  Q('xb-auto-10', 'AUTO', 't6-ai', 'An AIOps platform groups 400 alerts from one site into a single incident. What benefit does this give?', [
    ['Engineers see one probable root cause instead of chasing hundreds of symptoms', true, 'Correlation reduces noise.'],
    ['It deletes the alerts', false, 'It groups them.'],
    ['It fixes the problem automatically in all cases', false, 'Not necessarily.'],
    ['It stops SNMP polling', false, 'No.'],
  ], 'When a site\'s uplink fails, every device and application behind it raises alarms. Correlation by topology and timing points at the uplink, which shortens time to resolution.'),

  // ---------- thin branches: IOS saving and remote access ----------
  Q('xb-ios-01', 'NF', 't0-save', 'You made changes, then typed this. What happened?', [
    ['The running configuration was saved to NVRAM', true, 'write memory is the older equivalent of copy run start.'],
    ['The configuration was erased', false, 'That is write erase.'],
    ['The router reloaded', false, 'No reload.'],
    ['Nothing; write is not a command', false, 'It is.'],
  ], 'write memory (wr) and copy running-config startup-config both build the configuration and store it in NVRAM. [OK] confirms success.', {
    exhibit: X(`
R1#write memory
Building configuration...
[OK]`,
      ['write memory', 'cmd'], ['Building configuration...', 'state'], ['[OK]', 'ok', 'Saved']),
  }),
  Q('xb-ios-02', 'NF', 't0-save', 'Which command undoes risky remote changes automatically if you lose connectivity?', [
    ['reload in 10 before the change, then reload cancel once it works', true, 'A timed rollback to the saved config.'],
    ['copy running-config startup-config before the change', false, 'That saves the risky change.'],
    ['erase startup-config', false, 'Wipes the saved config.'],
    ['exec-timeout 10 0', false, 'Only logs you out.'],
  ], 'Schedule a reload, do not save, make the change. If you are cut off, the router reloads in 10 minutes into the old startup-config. If all is well, reload cancel and then save.', { console: true }),
  Q('xb-ios-03', 'NF', 't0-save', 'What does copy startup-config running-config do?', [
    ['Merges the saved configuration into the running one, without removing extra running lines', true, 'A merge, not a replace.'],
    ['Replaces the running config exactly', false, 'It merges.'],
    ['Saves the running config', false, 'Opposite direction.'],
    ['Erases NVRAM', false, 'No.'],
  ], 'Copying into running-config adds or changes lines but leaves other running lines in place. To restore exactly, use configure replace nvram:startup-config or reload.', { console: true }),
  Q('xb-ios-04', 'NF', 't0-remote', 'You SSH from R1 to R2 and want to return to R1 without closing the session. Which keystrokes?', [
    ['Ctrl+Shift+6, then x', true, 'Suspends the session.'],
    ['exit', false, 'Closes the session.'],
    ['Ctrl+Z', false, 'Leaves configuration mode.'],
    ['logout', false, 'Closes it.'],
  ], 'Ctrl+Shift+6 then x suspends an outbound Telnet or SSH session; show sessions lists them, and resume (or the session number) returns. Useful when hopping between devices.', { console: true }),
  Q('xb-ios-05', 'IPS', 't0-remote', 'Which command, from a router, opens an SSH session to 10.0.12.2 as user admin?', [
    ['ssh -l admin 10.0.12.2', true, 'IOS SSH client syntax.'],
    ['ssh admin@10.0.12.2', false, 'Common on Linux; IOS uses -l.'],
    ['telnet 10.0.12.2 ssh', false, 'Not valid.'],
    ['connect ssh 10.0.12.2', false, 'Not valid.'],
  ], 'IOS includes an SSH client: ssh -l username host, optionally -v 2 for version. Jumping between devices this way keeps credentials encrypted end to end.', { console: true }),

  // ---------- extra IPC and NA reading ----------
  Q('xb-ipc-01', 'IPC', 't3-table', 'R1 has these three routes. Which is used for a packet to 10.10.10.10?', [
    ['The static /32 host route', true, 'Longest prefix wins outright.'],
    ['The OSPF /24', false, 'Less specific.'],
    ['The connected /16', false, 'Least specific, even with AD 0.'],
    ['All three, load-balanced', false, 'Different prefixes never share.'],
  ], 'Longest match comes before AD: the /32 beats both, even though the connected route has a lower AD. AD only decides between routes to the same prefix and length.', {
    exhibit: X(`
C     10.10.0.0/16 is directly connected, GigabitEthernet0/2
O     10.10.10.0/24 [110/2] via 10.0.12.2, 00:03:11, GigabitEthernet0/0
S     10.10.10.10/32 [1/0] via 10.0.13.3`,
      [/^[COS](?= )/m, 'code'], [/10\.10\.(0\.0\/16|10\.0\/24|10\.10\/32)/, 'ip', 'Destination prefix'], [/\[\d+\/\d+\]/, 'metric'], [/10\.0\.1[23]\.[23]/, 'hop'], [/GigabitEthernet0\/[02]/, 'iface']),
  }),
  Q('xb-ipc-02', 'IPC', 't3-forwarding', 'A user can ping a server but a web page loads extremely slowly and some pages never finish. Pings with large sizes and DF set fail. What is the likely cause?', [
    ['An MTU problem on the path, often a tunnel, with ICMP "fragmentation needed" blocked', true, 'Small packets pass, large ones die.'],
    ['DNS failure', false, 'Pages start loading.'],
    ['Duplex mismatch on the user port', false, 'Would affect everything evenly.'],
    ['Wrong default gateway', false, 'Ping would fail.'],
  ], 'Path MTU discovery relies on ICMP replies. If a firewall drops them, large packets vanish silently. Fixes include allowing ICMP unreachable messages or lowering the TCP MSS on the tunnel (ip tcp adjust-mss).'),
  Q('xb-ipc-03', 'IPC', 't3-ospf', 'Which neighbor in this output has a router ID that suggests it was never configured explicitly?', [
    ['The neighbor with ID 192.168.50.1, taken from an interface address', true, 'RIDs like 2.2.2.2 are usually set by hand.'],
    ['2.2.2.2', false, 'Looks configured or a loopback.'],
    ['Both', false, 'Only one looks interface-derived.'],
    ['Neither', false, 'One does.'],
  ], 'Without router-id or a loopback, OSPF uses the highest active interface address, which may change if interfaces change. Set a stable router-id (often matching a loopback) on every router.', {
    exhibit: X(`
Neighbor ID     Pri   State           Dead Time   Address         Interface
2.2.2.2           1   FULL/BDR        00:00:37    10.0.0.2        GigabitEthernet0/0
192.168.50.1      1   FULL/DR         00:00:34    10.0.0.3        GigabitEthernet0/0`,
      ['2.2.2.2', 'key', 'Configured-looking RID'], ['192.168.50.1', 'fail', 'Interface-derived RID'], [/FULL\/(BDR|DR)/, 'ok', 'Full'], [/10\.0\.0\.[23]/, 'ip'], [/GigabitEthernet0\/0/, 'iface']),
  }),
  Q('xb-na-01', 'NA', 't2-wlan-arch', 'A branch with FlexConnect APs loses its WAN link to the central WLC. What happens to existing wireless clients on a locally switched WLAN?', [
    ['They keep working, because the AP switches their traffic locally in standalone mode', true, 'FlexConnect resilience.'],
    ['They all disconnect', false, 'That is local mode behavior.'],
    ['They are moved to the guest WLAN', false, 'No.'],
    ['The AP reboots into monitor mode', false, 'No.'],
  ], 'In standalone mode, FlexConnect APs keep serving locally switched WLANs (and can authenticate locally if configured). Centrally switched WLANs stop until the controller returns.'),
  Q('xb-na-02', 'NA', 't2-wlan-arch', 'Which switch port configuration fits a FlexConnect AP that switches two client VLANs locally?', [
    ['A trunk carrying the AP management VLAN and both client VLANs', true, 'The AP tags client VLANs.'],
    ['An access port in the AP management VLAN only', false, 'Client VLANs would not reach the switch.'],
    ['A routed port', false, 'Layer 2 is needed.'],
    ['An EtherChannel to the WLC', false, 'The AP connects to the local switch.'],
  ], 'Local-mode APs tunnel everything and need only an access port. FlexConnect APs that bridge client VLANs locally need a trunk, with the AP management VLAN usually as native.'),
  Q('xb-na-03', 'NA', 't2-discovery', 'An IP phone receives its voice VLAN automatically from the switch. Which protocols can deliver it? (Choose two.)', [
    ['CDP', true, 'Cisco phones learn the voice VLAN from CDP.'],
    ['LLDP-MED', true, 'The standards-based method.'],
    ['DTP', false, 'Trunk negotiation.'],
    ['STP', false, 'Loop prevention.'],
  ], 'With switchport voice vlan configured, the switch advertises the voice VLAN in CDP (to Cisco phones) and LLDP-MED (to standards-based phones). The phone then tags its traffic accordingly.'),
  Q('xb-na-04', 'NA', 't2-stp', 'Which switch should be configured as root for the user VLANs?', [
    ['A distribution or core switch that every access switch uplinks to', true, 'Shortest, highest-capacity paths.'],
    ['The access switch with the most users', false, 'Traffic would detour.'],
    ['Any switch; it does not matter', false, 'Root placement shapes every path.'],
    ['The switch with the highest MAC address', false, 'Election favors low MACs, and you should set priority.'],
  ], 'All forwarding paths lead toward the root. Placing it at the distribution layer (with a secondary on its partner) keeps paths short and uses the high-capacity uplinks.'),
];
