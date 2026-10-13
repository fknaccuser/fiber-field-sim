// Console practice, part C: rounding out the thinner branches with
// common issues and the commands that expose them.

import { Q, X } from './qb.js';

export const X_CONSOLE_C = [
  Q('xd-01', 'IPS', 't4-files', 'Which command verifies that a copied IOS image is not corrupted before you boot it?', [
    ['verify /md5 flash:c2900-new.bin', true, 'Compares against the published hash.'],
    ['show version', false, 'Shows the running image only.'],
    ['dir flash:', false, 'Lists files and sizes.'],
    ['boot system flash:c2900-new.bin', false, 'Sets the boot image without checking it.'],
  ], 'Compare the computed MD5 (or SHA) with the value on the vendor\'s download page. A mismatch means a bad transfer; booting it could leave the router in ROMMON.', { console: true }),
  Q('xd-02', 'IPS', 't4-files', 'An admin wants to pull configs from a router without opening any clear-text protocol. Which method fits?', [
    ['SCP over SSH (ip scp server enable on the router)', true, 'Encrypted, authenticated.'],
    ['TFTP', false, 'Clear text, no authentication.'],
    ['FTP', false, 'Clear text.'],
    ['Telnet and copy-paste', false, 'Clear text.'],
  ], 'SCP rides on SSH, reusing its keys and AAA. With ip scp server enable, a management host can copy files to and from the router securely.'),
  Q('xd-03', 'IPS', 't4-files', 'Which TFTP behavior surprises people when copying large images?', [
    ['It sends one small block at a time, waiting for an ACK each time, so it is slow over latency', true, 'Lock-step.'],
    ['It requires a username', false, 'It has no authentication.'],
    ['It uses TCP 69', false, 'UDP 69.'],
    ['It encrypts the image', false, 'No.'],
  ], 'TFTP\'s simplicity costs speed: classic TFTP moves 512-byte blocks and waits for each acknowledgment. On a LAN it is fine; across a WAN, FTP, HTTP or SCP stream over TCP and finish much faster.'),
  Q('xd-04', 'NF', 't1-arch', 'Which design is shown: access switches each uplink to two distribution switches, which connect to two core switches?', [
    ['Three-tier campus', true, 'Access, distribution, core.'],
    ['Two-tier collapsed core', false, 'No separate core.'],
    ['Spine-leaf', false, 'Data center fabric.'],
    ['SOHO', false, 'Single device.'],
  ], 'Dual uplinks at every layer remove single points of failure. A separate core makes sense when many distribution blocks (buildings) need fast interconnection.', {
    exhibit: X(`
[ACC1]  [ACC2]  [ACC3]   access
   \\  \\  /  / \\  /
   [DIST1]   [DIST2]     distribution
       |  \\   /  |
   [CORE1]   [CORE2]     core`,
      [/ACC\d/, 'role', 'Access'], [/DIST\d/, 'role', 'Distribution'], [/CORE\d/, 'role', 'Core']),
  }),
  Q('xd-05', 'NF', 't1-arch', 'What typically connects a small branch to headquarters over the internet at low cost?', [
    ['A site-to-site VPN over broadband', true, 'Encrypted tunnel over the internet.'],
    ['A dedicated dark fiber', false, 'Costly over distance.'],
    ['A crossover cable', false, 'Not across a city.'],
    ['A wireless bridge across the country', false, 'Not practical.'],
  ], 'Broadband plus IPsec (or SD-WAN, which automates it) gives secure branch connectivity cheaply. Leased lines and MPLS cost more but offer predictable performance and SLAs.'),
  Q('xd-06', 'NF', 't1-arch', 'Which is a disadvantage of a single SOHO all-in-one router?', [
    ['It is a single point of failure for routing, switching, Wi-Fi and security', true, 'One box does everything.'],
    ['It cannot do NAT', false, 'It does.'],
    ['It needs a WLC', false, 'No.'],
    ['It requires OSPF', false, 'No.'],
  ], 'Simplicity and cost are the benefits; resilience and capacity are the trade-offs. Larger sites split functions across dedicated, redundant devices.'),
  Q('xd-07', 'NF', 't1-virtual', 'A VM moves to another host and loses network access. The new host\'s switch port carries VLANs 10 and 20 only. The VM is in VLAN 30. What is wrong?', [
    ['VLAN 30 is not allowed on the new host\'s trunk', true, 'The VM\'s VLAN must be on every host trunk.'],
    ['VMs cannot move', false, 'Live migration is common.'],
    ['The VM needs a new MAC', false, 'No.'],
    ['The hypervisor must route', false, 'No.'],
  ], 'Every host a VM can run on needs the same VLANs on its trunk. Missing VLANs on one host is a classic cause of "it works on host A but not host B".'),
  Q('xd-08', 'NF', 't1-virtual', 'Which statement about containers and networking is true?', [
    ['Containers get virtual interfaces connected through a host bridge or overlay network', true, 'Like lightweight VMs for networking.'],
    ['Containers cannot use IP', false, 'They do.'],
    ['Each container needs its own physical NIC', false, 'They share the host\'s.'],
    ['Containers always use VLAN 1', false, 'No.'],
  ], 'Container runtimes create virtual interfaces and bridges (or overlays across hosts), often with NAT to the host\'s address. Kubernetes adds its own pod networking on top.'),
  Q('xd-09', 'NF', 't1-virtual', 'Which command pings a host inside VRF GUEST from a router?', [
    ['ping vrf GUEST 10.50.1.10', true, 'The vrf keyword selects the table.'],
    ['ping 10.50.1.10 guest', false, 'Not valid.'],
    ['ping vlan GUEST 10.50.1.10', false, 'Not valid.'],
    ['vrf ping GUEST', false, 'Not valid.'],
  ], 'Without the vrf keyword, ping uses the global routing table and fails for addresses that only exist in the VRF. The same applies to traceroute, show ip route and show ip arp.', { console: true }),
  Q('xd-10', 'NA', 't2-wlc', 'Which WLC port should be connected to a separate management network that never carries client traffic?', [
    ['The service port', true, 'Out-of-band management.'],
    ['The distribution system port', false, 'Carries AP and client traffic.'],
    ['The redundancy port', false, 'For HA pairs.'],
    ['The console port', false, 'Serial CLI.'],
  ], 'The service port gives management access even when the data network is down, but it cannot carry CAPWAP or client traffic and cannot be in a LAG.'),
  Q('xd-11', 'NA', 't2-wlc', 'An AP shows as joined to the WLC but its WLANs do not appear. What should you check?', [
    ['That the WLANs are enabled and assigned to the AP group or radio policy that includes this AP', true, 'WLAN to AP mapping.'],
    ['The AP\'s console speed', false, 'Unrelated.'],
    ['The router\'s OSPF area', false, 'Unrelated.'],
    ['The PoE budget only', false, 'The AP is up.'],
  ], 'WLANs must be enabled and, in larger designs, mapped to the AP group (or policy tag on newer controllers) that the AP belongs to. Radio policy can also limit a WLAN to one band.'),
  Q('xd-12', 'NA', 't2-wlc', 'Which WLC GUI tab holds the WPA2 and PSK settings for a WLAN?', [
    ['Security, then Layer 2', true, 'Encryption and key management.'],
    ['General', false, 'SSID, status, interface.'],
    ['QoS', false, 'Priority profile.'],
    ['Advanced', false, 'Timers and extras.'],
  ], 'General: name, SSID, status, interface. Security Layer 2: WPA2/WPA3, AES, PSK or 802.1X. Security AAA Servers: RADIUS for Enterprise. QoS: Platinum to Bronze.'),
  Q('xd-13', 'SECF', 't5-vpn', 'A site-to-site VPN comes up but traffic between the two LANs does not flow. The crypto ACLs are shown. What is wrong?', [
    ['The crypto ACLs are not mirror images: R2 lists the wrong local subnet', true, 'Interesting traffic must match on both sides.'],
    ['IKE failed', false, 'Phase 1 is up.'],
    ['ESP needs TCP', false, 'ESP is IP protocol 50.'],
    ['The routers need OSPF', false, 'Not required.'],
  ], 'Each side defines which traffic to protect, and the two definitions must mirror each other (R1 local to R2 local, and the reverse). A mismatch prevents the IPsec SAs from forming for that traffic.', {
    exhibit: X(`
R1: access-list 110 permit ip 10.1.0.0 0.0.255.255 10.2.0.0 0.0.255.255
R2: access-list 110 permit ip 10.20.0.0 0.0.255.255 10.1.0.0 0.0.255.255`,
      [/R[12]:/, 'role', 'Router'], ['10.1.0.0 0.0.255.255 10.2.0.0', 'ok', 'R1: local to remote'], ['10.20.0.0', 'fail', 'Should be 10.2.0.0']),
  }),
  Q('xd-14', 'SECF', 't5-vpn', 'Which statement about IPsec and NAT is true?', [
    ['AH breaks through NAT because it authenticates the IP header; ESP with NAT-T (UDP 4500) works', true, 'Why ESP is used.'],
    ['IPsec cannot cross NAT in any form', false, 'NAT-T solves it.'],
    ['NAT encrypts IPsec traffic', false, 'No.'],
    ['ESP uses TCP 443', false, 'Not standard IPsec.'],
  ], 'NAT rewrites addresses, which invalidates AH\'s integrity check. ESP does not cover the outer header, and NAT traversal wraps it in UDP so NAT devices can track it.'),
  Q('xd-15', 'SECF', 't5-vpn', 'Remote users connect with a VPN client, but they cannot reach the internet while connected. What setting is likely in place?', [
    ['Full tunneling is forcing all traffic to the headend, which is not permitting or routing internet traffic', true, 'No split tunnel, no internet path at the headend.'],
    ['Split tunneling', false, 'With split tunneling, internet goes direct.'],
    ['WPA3', false, 'Unrelated.'],
    ['DHCP snooping', false, 'Unrelated.'],
  ], 'With full tunneling, the headend must route and NAT client traffic to the internet (often through a security stack). Either add that path or enable split tunneling for internet destinations.'),
  Q('xd-16', 'SECF', 't5-wsec', 'Which setting must be on for WPA3?', [
    ['Protected Management Frames (PMF)', true, 'Mandatory in WPA3.'],
    ['TKIP', false, 'Deprecated.'],
    ['WEP', false, 'Broken.'],
    ['Hidden SSID', false, 'Not a security control.'],
  ], 'WPA3 requires 802.11w PMF, which blocks forged deauthentication. Older clients that do not support PMF cannot join a WPA3-only WLAN, which is why transition mode exists.'),
  Q('xd-17', 'SECF', 't5-wsec', 'Some older laptops cannot join a newly secured WLAN set to WPA3-Personal only. What is a practical fix?', [
    ['Use WPA2/WPA3 transition mode until the old clients are replaced', true, 'Both on one SSID.'],
    ['Switch to WEP', false, 'Broken.'],
    ['Disable encryption', false, 'Unacceptable.'],
    ['Change the channel', false, 'Unrelated.'],
  ], 'Transition mode advertises both WPA2-PSK and WPA3-SAE, so modern clients use WPA3 and older ones WPA2. Plan to retire the older devices and then move to WPA3 only.'),
  Q('xd-18', 'SECF', 't5-wsec', 'Which is the strongest choice for a corporate WLAN where every user has an account?', [
    ['WPA3-Enterprise (or WPA2-Enterprise) with 802.1X and EAP-TLS', true, 'Per-user, certificate based.'],
    ['WPA2-Personal with a long passphrase', false, 'Shared key.'],
    ['Open with a captive portal', false, 'No encryption.'],
    ['Hidden SSID with MAC filtering', false, 'Easily bypassed.'],
  ], 'Enterprise mode authenticates each user against RADIUS and gives unique session keys. EAP-TLS removes passwords from the equation entirely.'),
  Q('xd-19', 'NF', 't0-save', 'After erase startup-config and reload, a switch still has its old VLANs. Why?', [
    ['VLANs are stored in flash:vlan.dat, which was not deleted', true, 'Delete it for a full reset.'],
    ['erase startup-config failed', false, 'It worked.'],
    ['VLANs are hard-coded', false, 'No.'],
    ['The reload did not finish', false, 'It did.'],
  ], 'Full switch reset: erase startup-config, delete flash:vlan.dat, reload. Without deleting vlan.dat, the VLAN database survives.', { console: true }),
  Q('xd-20', 'NF', 't0-save', 'Which command shows the differences between the running and startup configurations?', [
    ['show archive config differences', true, 'Lists added and removed lines.'],
    ['show diff', false, 'Not valid.'],
    ['compare run start', false, 'Not valid.'],
    ['show startup-config | include running', false, 'Not meaningful.'],
  ], 'show archive config differences (with the archive feature) compares two configs, by default startup and running, which tells you what a reload would lose.', { console: true }),
  Q('xd-21', 'IPS', 't4-snmp', 'Which SNMP operation lets an NMS retrieve many OIDs in one request?', [
    ['GetBulk', true, 'Introduced in SNMPv2c.'],
    ['Get', false, 'One OID per variable binding.'],
    ['Set', false, 'Writes.'],
    ['Trap', false, 'Agent-initiated.'],
  ], 'GetBulk is how an NMS walks large tables, such as every interface\'s counters, efficiently. SNMPv1 only has Get and GetNext, which needs many round trips.'),
  Q('xd-22', 'IPS', 't4-snmp', 'Why should SNMP RW communities be avoided?', [
    ['Anyone who learns the clear-text string can change the device configuration', true, 'Write access with weak protection.'],
    ['They are slower', false, 'Not the issue.'],
    ['They break traps', false, 'No.'],
    ['They are not supported', false, 'They are.'],
  ], 'v2c community strings cross the network in clear text. Read-write access with them lets an attacker reconfigure devices. If writes are needed, use SNMPv3 authPriv with tight ACLs.'),
  Q('xd-23', 'SECF', 't5-aaa', 'Which command limits authorization for privilege 15 commands to what the TACACS+ server allows?', [
    ['aaa authorization commands 15 default group tacacs+ local', true, 'Per-command authorization.'],
    ['aaa authentication login default group tacacs+', false, 'Authentication only.'],
    ['aaa accounting commands 15 default start-stop group tacacs+', false, 'Records commands, does not authorize.'],
    ['privilege exec level 15 all', false, 'Not this.'],
  ], 'With command authorization, the router asks TACACS+ before running each privilege 15 command, so junior admins can be limited to show commands while seniors can configure.', { console: true }),
  Q('xd-24', 'NF', 't1-client', 'A Mac on Wi-Fi has a valid address but cannot reach anything off its subnet. Which value should you check first?', [
    ['The router (default gateway) setting', true, 'Off-subnet traffic needs the gateway.'],
    ['The SSID', false, 'It is connected.'],
    ['The MAC address', false, 'Unlikely.'],
    ['The DNS search domain', false, 'Names, not reachability.'],
  ], 'On macOS, networksetup -getinfo Wi-Fi or the Wi-Fi details pane shows IP address, subnet mask and Router. A missing or wrong Router value explains local-only connectivity.'),
  Q('xd-25', 'NF', 't1-arch', 'Which cloud deployment combines on-premises infrastructure with a public cloud provider?', [
    ['Hybrid cloud', true, 'Both, connected.'],
    ['Private cloud', false, 'Dedicated to one organization.'],
    ['Public cloud', false, 'Provider only.'],
    ['Community cloud', false, 'Shared by organizations with common needs.'],
  ], 'Hybrid lets you keep sensitive or latency-critical systems on premises while bursting or hosting other workloads in the cloud, connected by VPN or a private interconnect.'),
];
