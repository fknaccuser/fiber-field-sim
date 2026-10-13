// Tree 5, Security Fundamentals, part A: security concepts and programs,
// device access and passwords, VPNs, and ACLs.

import { Q, X } from './qb.js';

const ACL_OUT = `
R1#show access-lists
Standard IP access list 10
    10 permit 10.1.99.0, wildcard bits 0.0.0.255 (42 matches)
Extended IP access list WEB-IN
    10 permit tcp any host 10.1.50.20 eq 443 (1880 matches)
    20 permit tcp any host 10.1.50.20 eq www (3 matches)
    30 deny ip any any log (517 matches)`;
const ACL_MARKS = [
  ['show access-lists', 'cmd'], [/^ {4}\d0(?= )/m, 'key', 'Sequence number'], [/permit/, 'ok', 'Permit'], [/deny/, 'fail', 'Deny'],
  [/10\.1\.(99\.0|50\.20)/, 'ip'], ['0.0.0.255', 'mask', 'Wildcard'], [/eq (443|www)/, 'key', 'Port match'], [/\(\d+ matches\)/, 'count', 'Hit counter'],
];

export const T5_A = [
  // ---------- t5-concepts ----------
  Q('b5-con-01', 'SECF', 't5-concepts', 'Match the terms: an unpatched web server is the ___, and the code an attacker runs against it is the ___.', [
    ['Vulnerability; exploit', true, 'Weakness, then the tool that uses it.'],
    ['Threat; mitigation', false, 'Mitigation is the defense.'],
    ['Exploit; vulnerability', false, 'Reversed.'],
    ['Mitigation; threat', false, 'Mixed up.'],
  ], 'A vulnerability is a weakness, an exploit is the method or code that takes advantage of it, a threat is the actor or event that might use it, and a mitigation reduces the risk (patching, filtering, hardening).'),
  Q('b5-con-02', 'SECF', 't5-concepts', 'What do the letters of the CIA triad stand for?', [
    ['Confidentiality, integrity, availability', true, 'The three security goals.'],
    ['Control, inspection, authentication', false, 'No.'],
    ['Cisco, IOS, ACL', false, 'No.'],
    ['Certificates, identity, access', false, 'No.'],
  ], 'Confidentiality: only authorized people see data (encryption). Integrity: data is not altered unnoticed (hashing). Availability: services stay up (redundancy, DoS protection). Most controls protect one or two of the three.'),
  Q('b5-con-03', 'SECF', 't5-concepts', 'An attacker floods a server from thousands of compromised machines. What is this?', [
    ['A distributed denial-of-service (DDoS) attack', true, 'Many sources, availability target.'],
    ['Phishing', false, 'Social engineering.'],
    ['Man-in-the-middle', false, 'Interception.'],
    ['Reconnaissance', false, 'Information gathering.'],
  ], 'DoS attacks target availability. A DDoS uses a botnet so there is no single source to block. Reflection and amplification variants spoof the victim\'s address so open servers (DNS, NTP) flood it with large replies.'),
  Q('b5-con-04', 'SECF', 't5-concepts', 'An email that appears to come from the CEO asks finance to wire money urgently. What attack is this?', [
    ['Whaling or spear phishing (targeted social engineering)', true, 'Targeted at specific people.'],
    ['A brute-force attack', false, 'Password guessing.'],
    ['A worm', false, 'Self-propagating malware.'],
    ['VLAN hopping', false, 'Layer 2.'],
  ], 'Phishing is broad; spear phishing targets specific people; whaling targets executives or involves impersonating them. Vishing uses phone calls and smishing text messages. User awareness training is the main defense.'),
  Q('b5-con-05', 'SECF', 't5-concepts', 'Which three elements make up a security program on the CCNA blueprint? (Choose three.)', [
    ['User awareness', true, 'Knowing threats exist.'],
    ['User training', true, 'Knowing how to respond.'],
    ['Physical access control', true, 'Badges, locks, cameras.'],
    ['Port numbers', false, 'Not a program element.'],
  ], 'Awareness tells people threats exist (posters, reminders, simulated phishing). Training teaches specific procedures. Physical access control keeps people away from equipment: a console cable beats any password.'),
  Q('b5-con-06', 'SECF', 't5-concepts', 'Which malware type spreads by itself across networks without user action?', [
    ['A worm', true, 'Self-propagating.'],
    ['A virus', false, 'Needs a host file and user action.'],
    ['A trojan', false, 'Disguised as legitimate software.'],
    ['Spyware', false, 'Collects information.'],
  ], 'Viruses attach to files and spread when users run them. Worms exploit vulnerabilities to copy themselves host to host. Trojans pose as something useful. Ransomware encrypts data for payment. Patching and segmentation slow worms.'),
  Q('b5-con-07', 'SECF', 't5-concepts', 'An attacker on the LAN sends forged ARP replies so traffic for the gateway goes to the attacker first. What is this?', [
    ['ARP spoofing, a man-in-the-middle attack', true, 'Poisoned caches redirect traffic.'],
    ['DHCP starvation', false, 'Exhausts the pool.'],
    ['MAC flooding', false, 'Overflows the CAM table.'],
    ['A DDoS', false, 'Availability attack.'],
  ], 'ARP has no authentication, so a forged reply overwrites caches. Dynamic ARP Inspection on the switch checks ARP messages against DHCP snooping bindings and drops forged ones.'),
  Q('b5-con-08', 'SECF', 't5-concepts', 'Which authentication factors are combined in multifactor authentication? (Choose two.)', [
    ['Something you know, such as a password', true, 'Knowledge.'],
    ['Something you have, such as a phone app or token', true, 'Possession.'],
    ['Two different passwords', false, 'Both are the same factor.'],
    ['A username and a password', false, 'A username is not a factor.'],
  ], 'MFA combines different categories: know (password, PIN), have (token, phone, smart card, certificate), are (fingerprint, face). Two passwords are still single-factor.'),
  Q('b5-con-09', 'SECF', 't5-concepts', 'What does a digital certificate prove?', [
    ['That a public key belongs to a named identity, vouched for by a certificate authority', true, 'PKI binding.'],
    ['That the network is fast', false, 'No.'],
    ['That a password is strong', false, 'No.'],
    ['That traffic is compressed', false, 'No.'],
  ], 'A certificate (X.509) contains a subject, a public key and a CA\'s signature. Clients trust the CA, so they trust the binding. Certificates authenticate websites, VPN gateways and devices, and can be an MFA possession factor.'),
  Q('b5-con-10', 'SECF', 't5-concepts', 'Which practice reduces the impact of a stolen password most?', [
    ['Requiring MFA', true, 'A password alone is no longer enough.'],
    ['Longer login banners', false, 'Banners deter, not defend.'],
    ['Changing the SSID', false, 'Unrelated.'],
    ['Disabling CDP', false, 'Unrelated.'],
  ], 'Phished and reused passwords are the most common way in. With MFA, an attacker who has the password still needs the second factor. Password policies (length, no reuse, lockout) reduce the chance of theft in the first place.'),
  Q('b5-con-11', 'SECF', 't5-concepts', 'What is reconnaissance in an attack?', [
    ['Gathering information about targets, such as scanning for live hosts and open ports', true, 'The first phase.'],
    ['Encrypting files for ransom', false, 'Ransomware.'],
    ['Flooding a server', false, 'DoS.'],
    ['Stealing a password', false, 'A later phase.'],
  ], 'Attackers map the network before striking: ping sweeps, port scans, DNS queries, public records and social media. Limiting what devices reveal (CDP on edges, banners, ICMP filtering) raises the cost.'),
  Q('b5-con-12', 'SECF', 't5-concepts', 'An unauthorized person follows an employee through a badge-controlled door. What is this called?', [
    ['Tailgating (piggybacking)', true, 'A physical social engineering attack.'],
    ['Phishing', false, 'Email based.'],
    ['Shoulder surfing', false, 'Watching someone type.'],
    ['Pharming', false, 'DNS redirection.'],
  ], 'Physical controls only work if people do not hold doors. Mantraps, turnstiles and training (challenge unknown people) counter tailgating. Physical access to equipment defeats most technical controls.'),
  Q('b5-con-13', 'SECF', 't5-concepts', 'Which statement about biometrics is true?', [
    ['They authenticate something you are, such as a fingerprint, and are often paired with another factor', true, 'Inherence factor.'],
    ['They are a type of password', false, 'A different factor.'],
    ['They cannot be combined with MFA', false, 'They often are.'],
    ['They encrypt network traffic', false, 'No.'],
  ], 'Biometrics are convenient but cannot be changed if compromised, and have false accept and false reject rates. Used as one factor of MFA they add strong assurance.'),
  Q('b5-con-14', 'SECF', 't5-concepts', 'Which attack overflows a switch\'s MAC address table so it floods traffic out every port?', [
    ['MAC flooding', true, 'Fills the CAM table with fake MACs.'],
    ['ARP spoofing', false, 'Poisons ARP caches.'],
    ['DHCP starvation', false, 'Exhausts the address pool.'],
    ['Double tagging', false, 'VLAN hopping.'],
  ], 'With the table full, the switch floods unknown unicasts like a hub, letting the attacker capture traffic. Port security limiting MACs per port stops it.'),
  Q('b5-con-15', 'SECF', 't5-concepts', 'What is the main purpose of user awareness programs?', [
    ['Helping people recognise threats such as phishing so they do not fall for them', true, 'People are a common target.'],
    ['Teaching users to configure routers', false, 'No.'],
    ['Encrypting user traffic', false, 'No.'],
    ['Replacing technical controls', false, 'They complement them.'],
  ], 'Most breaches start with a person: a click, a reused password, a held door. Awareness campaigns and simulated phishing measurably reduce that.'),

  // ---------- t5-access ----------
  Q('b5-acc-01', 'SECF', 't5-access', 'Which command blocks logins for 120 seconds after 3 failed attempts within 60 seconds?', [
    ['login block-for 120 attempts 3 within 60', true, 'Brute-force protection.'],
    ['exec-timeout 120 3', false, 'Idle timeout.'],
    ['security passwords min-length 3', false, 'Password length.'],
    ['aaa lockout 3', false, 'Not this syntax.'],
  ], 'login block-for puts the device in quiet mode after repeated failures, refusing new login attempts for the block period. Pair it with login quiet-mode access-class to keep a management subnet able to log in.', { console: true }),
  Q('b5-acc-02', 'SECF', 't5-access', 'Which password type in the configuration is easily reversed?', [
    ['Type 7', true, 'Reversible encoding from service password-encryption.'],
    ['Type 9', false, 'scrypt hash.'],
    ['Type 8', false, 'PBKDF2 hash.'],
    ['Type 5', false, 'MD5 hash, weaker but not reversible.'],
  ], 'Type 0 is plain text, type 7 is reversible, type 5 is an MD5 hash, and types 8 and 9 are modern strong hashes. Use enable secret and username ... secret with algorithm-type scrypt or sha256 where available.', {
    exhibit: X(`
username tech password 7 08314D5D1A0E0A0516
username admin secret 9 $9$nhEmQVczB7dQjk$z3cqBMZ3j3ZP7kz2Lr6l0
enable secret 9 $9$6M8zYqP1sGyQJU$Wz8kFz0jvO2bOuQ1hO8x5`,
      [/password 7/, 'fail', 'Type 7: reversible'], [/secret 9/, 'ok', 'Type 9: strong hash'], [/^username (tech|admin)/m, 'key', 'Local user']),
  }),
  Q('b5-acc-03', 'SECF', 't5-access', 'Which command requires all new passwords to be at least 10 characters?', [
    ['security passwords min-length 10', true, 'Global command.'],
    ['password length 10', false, 'Not valid.'],
    ['enable secret length 10', false, 'Not valid.'],
    ['login length 10', false, 'Not valid.'],
  ], 'IOS enforces the minimum on newly set passwords and secrets. Combined with MFA through AAA, account lockout and rotation for shared accounts, it forms the device side of a password policy.', { console: true }),
  Q('b5-acc-04', 'SECF', 't5-access', 'Which elements belong in a strong password policy? (Choose two.)', [
    ['Minimum length and complexity, with no reuse of old passwords', true, 'Resists guessing.'],
    ['Lockout or delay after repeated failures', true, 'Stops brute force.'],
    ['Sharing one admin password across the team', false, 'Destroys accountability.'],
    ['Writing passwords in the device banner', false, 'Obviously not.'],
  ], 'Length matters more than complexity rules. Individual accounts (local or AAA) keep accountability, lockouts slow guessing, and MFA covers what policy cannot. Store secrets in a password manager.'),
  Q('b5-acc-05', 'SECF', 't5-access', 'Which line configuration is most secure for remote management?', [
    ['login local, transport input ssh, access-class 10 in, exec-timeout 5 0', true, 'Individual accounts, SSH only, source-limited, idle timeout.'],
    ['password cisco, login, transport input all', false, 'Shared password and Telnet.'],
    ['no login', false, 'No authentication at all.'],
    ['transport input telnet', false, 'Clear text.'],
  ], 'Layer the controls: authenticate individuals, encrypt the session, limit who can connect, and close idle sessions. Add AAA for central accounts and logging.', { console: true }),
  Q('b5-acc-06', 'SECF', 't5-access', 'Why are individual user accounts better than a shared enable password for device access?', [
    ['Each action can be traced to a person, and one person can be removed without changing everyone\'s password', true, 'Accountability.'],
    ['They are faster to type', false, 'No.'],
    ['Shared passwords are not supported', false, 'They are.'],
    ['They remove the need for SSH', false, 'No.'],
  ], 'With per-user accounts (local or AAA), logs and accounting show who did what, and offboarding is one deletion. A shared password must be changed on every device every time someone leaves.'),
  Q('b5-acc-07', 'SECF', 't5-access', 'Which enable secret algorithm option produces a type 9 hash?', [
    ['enable algorithm-type scrypt secret P@ssw0rd2026', true, 'scrypt is type 9.'],
    ['enable algorithm-type sha256 secret P@ssw0rd2026', false, 'That is type 8.'],
    ['enable algorithm-type md5 secret P@ssw0rd2026', false, 'That is type 5.'],
    ['enable password 9 P@ssw0rd2026', false, 'Not how to set a type 9 secret.'],
  ], 'Newer IOS defaults enable secret to type 9 (scrypt) or lets you choose with algorithm-type. scrypt and PBKDF2 (type 8) are slow on purpose, which makes offline cracking expensive.', { console: true }),
  Q('b5-acc-08', 'SECF', 't5-access', 'A technician can log in to the console without any password. Which configuration explains it?', [
    ['line con 0 has a password but no login command', true, 'Without login, no check is done.'],
    ['enable secret is set', false, 'That protects privileged EXEC.'],
    ['login local with a valid user', false, 'That would require credentials.'],
    ['transport input ssh', false, 'Console lines do not use transports.'],
  ], 'A line only authenticates if told to: login checks the line password, login local checks usernames, or AAA login authentication applies a method list. A password alone is just stored.', {
    exhibit: X(`
line con 0
 password C0nsole!
 logging synchronous`,
      ['line con 0', 'iface', 'Console line'], ['password C0nsole!', 'state', 'Stored but unused'], ['logging synchronous', 'key']),
  }),
  Q('b5-acc-09', 'SECF', 't5-access', 'Which command shows login failures and the current block state after login block-for is configured?', [
    ['show login', true, 'Shows quiet mode status and settings.'],
    ['show users', false, 'Current sessions.'],
    ['show history', false, 'Command history.'],
    ['show ssh', false, 'SSH sessions.'],
  ], 'show login reports whether the device is in quiet mode, the thresholds and the time left. show login failures lists recent failed attempts with their sources.', { console: true }),
  Q('b5-acc-10', 'SECF', 't5-access', 'Which privilege level is privileged EXEC by default?', [
    ['15', true, 'Full access.'],
    ['1', false, 'User EXEC.'],
    ['0', false, 'Almost no commands.'],
    ['7', false, 'Not default.'],
  ], 'IOS has levels 0 to 15: 1 is user EXEC, 15 is privileged EXEC. Custom levels in between can expose selected commands, and usernames can be given privilege 15 to land straight at the # prompt.'),
  Q('b5-acc-11', 'SECF', 't5-access', 'Which physical security measure protects network equipment most directly?', [
    ['Locked racks and rooms with badge access and logs', true, 'Keeps people away from consoles.'],
    ['A strong SSID', false, 'Wireless naming.'],
    ['Disabling ping', false, 'Network level only.'],
    ['Longer DHCP leases', false, 'Unrelated.'],
  ], 'With physical access an attacker can reset passwords through ROMMON, insert a rogue device or steal hardware. Locked rooms, logged badge access and cameras are the foundation under every other control.'),
  Q('b5-acc-12', 'SECF', 't5-access', 'Which command disables the console\'s idle timeout, useful only in a lab?', [
    ['exec-timeout 0 0', true, 'Never times out.'],
    ['exec-timeout 1 0', false, 'Times out after one minute idle.'],
    ['no login', false, 'Removes authentication.'],
    ['logging synchronous', false, 'Unrelated.'],
  ], 'On production lines keep a short timeout so unattended sessions close. In a lab, exec-timeout 0 0 keeps the console from logging you out mid-exercise.', { console: true }),

  // ---------- t5-vpn ----------
  Q('b5-vpn-01', 'SECF', 't5-vpn', 'Which services does IPsec provide? (Choose two.)', [
    ['Confidentiality through encryption', true, 'For example AES.'],
    ['Integrity and authentication of the data', true, 'HMAC hashing and peer authentication.'],
    ['Routing between sites', false, 'IPsec protects traffic; routing is separate.'],
    ['Address assignment', false, 'No.'],
  ], 'IPsec gives confidentiality (encryption), integrity (hashing), origin authentication (pre-shared keys or certificates) and anti-replay protection. IKE negotiates the keys and ESP protects the packets.'),
  Q('b5-vpn-02', 'SECF', 't5-vpn', 'What is the difference between a site-to-site VPN and a remote access VPN?', [
    ['Site-to-site joins networks through gateways; remote access joins a single user\'s device to the network', true, 'Network versus user.'],
    ['Site-to-site is unencrypted', false, 'Both encrypt.'],
    ['Remote access needs no authentication', false, 'It always does.'],
    ['They are the same', false, 'Different scope.'],
  ], 'Site-to-site tunnels run between routers or firewalls, permanently, and hosts need no software. Remote access VPNs run from a client (AnyConnect/Secure Client, or a browser for clientless) to a headend, on demand.'),
  Q('b5-vpn-03', 'SECF', 't5-vpn', 'Which IPsec protocol encrypts the payload?', [
    ['ESP', true, 'Encapsulating Security Payload, IP protocol 50.'],
    ['AH', false, 'Authenticates only; no encryption.'],
    ['IKE', false, 'Negotiates keys.'],
    ['GRE', false, 'Tunnels without encryption.'],
  ], 'ESP (protocol 50) provides encryption and integrity. AH (protocol 51) provides integrity only and breaks through NAT because it covers the IP header. In practice IPsec means ESP.'),
  Q('b5-vpn-04', 'SECF', 't5-vpn', 'What does IKE do in an IPsec VPN?', [
    ['Authenticates the peers and negotiates the keys and security associations', true, 'The key management protocol.'],
    ['Encrypts user data', false, 'ESP does.'],
    ['Routes traffic', false, 'No.'],
    ['Assigns IP addresses to routers', false, 'No.'],
  ], 'IKE (UDP 500, or 4500 with NAT traversal) sets up the tunnel: the peers agree on algorithms, authenticate with a PSK or certificates, and derive keys. IKEv2 is the modern version.'),
  Q('b5-vpn-05', 'SECF', 't5-vpn', 'Which VPN type would a salesperson use from a hotel to reach the company network?', [
    ['A remote access VPN with a client such as Cisco Secure Client', true, 'Per-user tunnel.'],
    ['A site-to-site VPN', false, 'For networks.'],
    ['A GRE tunnel', false, 'Unencrypted, site to site.'],
    ['A VLAN trunk', false, 'Layer 2.'],
  ], 'Remote access VPNs authenticate the user (often with MFA through AAA) and give the device an address inside. TLS-based clients work through hotel firewalls that block IKE.'),
  Q('b5-vpn-06', 'SECF', 't5-vpn', 'What is split tunneling?', [
    ['Only traffic for company networks goes through the VPN; internet traffic goes directly', true, 'Saves bandwidth, reduces visibility.'],
    ['Splitting one tunnel across two ISPs', false, 'No.'],
    ['Encrypting only half of each packet', false, 'No.'],
    ['Running two VPN clients', false, 'No.'],
  ], 'Full tunneling sends everything through the headend, so company security inspects it. Split tunneling sends only internal destinations through the VPN, which is faster but leaves the remote device\'s internet traffic uninspected.'),
  Q('b5-vpn-07', 'SECF', 't5-vpn', 'Why is GRE often combined with IPsec?', [
    ['GRE carries multicast and routing protocols; IPsec adds the encryption GRE lacks', true, 'GRE over IPsec.'],
    ['GRE encrypts and IPsec routes', false, 'Reversed.'],
    ['GRE is required for NAT', false, 'No.'],
    ['IPsec cannot carry IP', false, 'It can.'],
  ], 'Classic IPsec tunnels only carry unicast matching crypto ACLs, so routing protocols cannot run over them. A GRE tunnel inside IPsec gives a routable interface that carries OSPF, encrypted by IPsec.'),
  Q('b5-vpn-08', 'SECF', 't5-vpn', 'Which statement describes a clientless SSL/TLS VPN?', [
    ['Users reach selected internal web applications through a browser portal without installing a VPN client', true, 'Browser-based access.'],
    ['It needs no authentication', false, 'Users log in.'],
    ['It connects two routers', false, 'Site-to-site.'],
    ['It works without encryption', false, 'TLS encrypts it.'],
  ], 'Clientless access suits contractors or unmanaged devices that need a few web apps. Full-tunnel client VPNs give complete network access and are used for managed laptops.'),
  Q('b5-vpn-09', 'SECF', 't5-vpn', 'Which protocols and ports must a firewall allow for an IPsec site-to-site VPN that crosses NAT? (Choose two.)', [
    ['UDP 500 for IKE', true, 'Initial negotiation.'],
    ['UDP 4500 for NAT traversal', true, 'ESP is wrapped in UDP 4500 through NAT.'],
    ['TCP 23', false, 'Telnet.'],
    ['UDP 69', false, 'TFTP.'],
  ], 'Without NAT, IPsec uses UDP 500 and IP protocol 50 (ESP). When NAT is detected, both sides move to UDP 4500 and encapsulate ESP in it, so firewalls only need the two UDP ports.'),
  Q('b5-vpn-10', 'SECF', 't5-vpn', 'What does a pre-shared key do in a site-to-site IPsec VPN?', [
    ['It authenticates the two peers to each other during IKE', true, 'Both sides know the same secret.'],
    ['It encrypts every packet directly', false, 'Session keys are derived by IKE.'],
    ['It names the VPN', false, 'No.'],
    ['It replaces routing', false, 'No.'],
  ], 'With PSK authentication, each gateway proves it knows the shared secret. Certificates scale better for many peers because no secret has to be shared pairwise.'),
  Q('b5-vpn-11', 'SECF', 't5-vpn', 'Which IPsec mode encrypts the original IP header too, as used between gateways?', [
    ['Tunnel mode', true, 'A new outer header is added.'],
    ['Transport mode', false, 'Protects only the payload.'],
    ['Access mode', false, 'Not an IPsec mode.'],
    ['Trunk mode', false, 'Not an IPsec mode.'],
  ], 'Tunnel mode wraps the whole original packet and adds a new IP header between the gateways, hiding internal addresses. Transport mode (host to host, or with GRE) protects only the payload.'),
  Q('b5-vpn-12', 'SECF', 't5-vpn', 'What is a benefit of DMVPN for many branch offices?', [
    ['Spokes can build tunnels to each other on demand without a full mesh of static configurations', true, 'Dynamic spoke-to-spoke.'],
    ['It removes encryption', false, 'It uses IPsec.'],
    ['It requires a leased line per branch', false, 'It runs over the internet.'],
    ['It replaces DHCP', false, 'No.'],
  ], 'DMVPN uses mGRE and NHRP: every spoke has one tunnel configuration to the hub, and spokes discover each other and form direct encrypted tunnels when they need to talk.'),

  // ---------- t5-acl ----------
  Q('b5-acl-01', 'SECF', 't5-acl', 'Which numbered ACL ranges are extended? (Choose two.)', [
    ['100 to 199', true, 'Extended.'],
    ['2000 to 2699', true, 'Expanded extended.'],
    ['1 to 99', false, 'Standard.'],
    ['1300 to 1999', false, 'Expanded standard.'],
  ], 'Standard ACLs (1 to 99, 1300 to 1999) match only the source address. Extended ACLs (100 to 199, 2000 to 2699) match protocol, source, destination and ports. Named ACLs avoid numbers entirely.'),
  Q('b5-acl-02', 'SECF', 't5-acl', 'Where should a standard ACL be placed?', [
    ['As close to the destination as possible', true, 'It only knows the source.'],
    ['As close to the source as possible', false, 'That would block the source from everything.'],
    ['On every interface', false, 'No.'],
    ['Only on the internet link', false, 'Depends on the goal.'],
  ], 'A standard ACL cannot see the destination, so placing it near the source would block that source from everywhere. Extended ACLs, which can match the destination, go near the source to drop unwanted traffic early.'),
  Q('b5-acl-03', 'SECF', 't5-acl', 'What happens to a packet that matches no line of an ACL?', [
    ['It is denied by the implicit deny at the end', true, 'Every ACL ends with deny any.'],
    ['It is permitted', false, 'The default is deny.'],
    ['It is sent to the CPU', false, 'No.'],
    ['It is logged and permitted', false, 'No.'],
  ], 'An ACL with only deny statements blocks everything. Add a permit for what should pass (often permit ip any any at the end of a deny list), and a visible deny ip any any log if you want to count the drops.'),
  Q('b5-acl-04', 'SECF', 't5-acl', 'How many packets has the final deny line in WEB-IN dropped?', [
    ['517', true, 'The match counter on line 30.'],
    ['1880', false, 'That is the HTTPS permit.'],
    ['42', false, 'That is ACL 10.'],
    ['3', false, 'That is the HTTP permit.'],
  ], 'Hit counters show which lines are doing work. A rising count on an explicit deny with log tells you what is being blocked; a permit that never increments may be shadowed by an earlier line.', { exhibit: X(ACL_OUT, ...ACL_MARKS) }),
  Q('b5-acl-05', 'SECF', 't5-acl', 'Which ACL line permits only HTTPS from anywhere to server 10.1.50.20?', [
    ['permit tcp any host 10.1.50.20 eq 443', true, 'TCP, any source, one host, port 443.'],
    ['permit ip any host 10.1.50.20', false, 'All protocols and ports.'],
    ['permit tcp host 10.1.50.20 any eq 443', false, 'Source and destination swapped.'],
    ['permit udp any host 10.1.50.20 eq 443', false, 'HTTPS is TCP (HTTP/3 aside).'],
  ], 'Extended syntax: action, protocol, source (and port), destination (and port). host means a 0.0.0.0 wildcard, any means 255.255.255.255. Port operators: eq, neq, gt, lt, range.', { console: true }),
  Q('b5-acl-06', 'SECF', 't5-acl', 'Why will this ACL never block Telnet from 10.1.1.0/24?', [
    ['Line 10 permits all IP from that subnet first; ACLs stop at the first match', true, 'Order matters.'],
    ['Telnet cannot be filtered', false, 'It can.'],
    ['The wildcard is wrong', false, 'It matches the /24.'],
    ['Deny lines are ignored', false, 'They are evaluated in order.'],
  ], 'ACLs are read top down and the first match decides. Put specific lines before general ones: move the deny tcp ... eq telnet above the broad permit, using sequence numbers to insert it.', {
    exhibit: X(`
ip access-list extended BRANCH
 10 permit ip 10.1.1.0 0.0.0.255 any
 20 deny tcp 10.1.1.0 0.0.0.255 any eq telnet
 30 permit ip any any`,
      [/^ (10|20|30)(?= )/m, 'key', 'Sequence number'], [/permit ip 10\.1\.1\.0 0\.0\.0\.255 any/, 'ok', 'Matches first'], [/deny tcp 10\.1\.1\.0 0\.0\.0\.255 any eq telnet/, 'fail', 'Never reached']),
  }),
  Q('b5-acl-07', 'SECF', 't5-acl', 'How many ACLs can be applied to one interface?', [
    ['One per direction per protocol (for example one IPv4 inbound and one IPv4 outbound)', true, 'The rule of thumb.'],
    ['Unlimited', false, 'A new ip access-group replaces the old one in that direction.'],
    ['One in total', false, 'In and out can differ.'],
    ['Two per direction', false, 'One.'],
  ], 'Applying a second ip access-group in the same direction replaces the first. If you need more logic, add lines to the one ACL.'),
  Q('b5-acl-08', 'SECF', 't5-acl', 'Which wildcard mask matches hosts 192.168.4.0 through 192.168.7.255?', [
    ['0.0.3.255', true, 'A /22 block.'],
    ['0.0.0.255', false, 'Only one /24.'],
    ['0.0.7.255', false, 'A /21, 0 to 7.'],
    ['255.255.252.0', false, 'That is a subnet mask.'],
  ], 'Four /24s starting at a multiple of 4 make a /22, whose wildcard is 0.0.3.255. Wildcard = 255.255.255.255 minus the subnet mask (255.255.252.0).'),
  Q('b5-acl-09', 'SECF', 't5-acl', 'Which commands apply ACL 110 to filter traffic entering Gi0/0?', [
    ['interface g0/0, ip access-group 110 in', true, 'Interface, direction in.'],
    ['ip access-group 110 in g0/0', false, 'Not global syntax.'],
    ['access-class 110 in on g0/0', false, 'access-class is for lines.'],
    ['interface g0/0, ip access-list 110 in', false, 'Not valid.'],
  ], 'ip access-group applies an ACL to an interface (in or out); access-class applies one to VTY lines. "In" means as packets arrive on that interface, before routing.', { console: true }),
  Q('b5-acl-10', 'SECF', 't5-acl', 'What does the "log" keyword on an ACL line do?', [
    ['Generates a syslog message when packets match the line (rate-limited)', true, 'Visibility into hits.'],
    ['Permits the packet', false, 'The action does that.'],
    ['Saves the ACL', false, 'No.'],
    ['Encrypts matches', false, 'No.'],
  ], 'deny ip any any log is a common last line: it makes drops visible in syslog (%SEC-6-IPACCESSLOGP) with source and destination, which helps tune rules. Logging is rate-limited to protect the CPU.'),
  Q('b5-acl-11', 'SECF', 't5-acl', 'Which ACL permits replies to connections started from inside, using the TCP flags?', [
    ['permit tcp any 10.1.1.0 0.0.0.255 established', true, 'Matches segments with ACK or RST set.'],
    ['permit tcp any any eq established', false, 'Not valid syntax.'],
    ['permit ip any any reply', false, 'Not valid.'],
    ['deny tcp any any syn', false, 'Not valid in standard IOS ACLs.'],
  ], 'established matches TCP segments with ACK or RST set, which roughly means "part of an existing session", blocking new inbound SYNs. A stateful firewall does this properly by tracking each session.', { console: true }),
  Q('b5-acl-12', 'SECF', 't5-acl', 'How do you insert a new line between sequence 10 and 20 in a named ACL?', [
    ['Enter the ACL and type the line with sequence number 15', true, 'Sequence numbers allow insertion.'],
    ['Delete the ACL and retype it', false, 'Unnecessary.'],
    ['Lines are always added at the end', false, 'Not with sequence numbers.'],
    ['Use the insert command', false, 'Not valid.'],
  ], 'IOS numbers ACL entries by 10 so you can insert between them: ip access-list extended NAME, then 15 deny .... Remove one with no 20. ip access-list resequence renumbers a crowded list.', { console: true }),
  Q('b5-acl-13', 'SECF', 't5-acl', 'Which ACL line matches exactly one host, 10.1.1.5, in a standard ACL?', [
    ['access-list 5 permit host 10.1.1.5', true, 'host is a 0.0.0.0 wildcard.'],
    ['access-list 5 permit 10.1.1.5 255.255.255.255', false, 'That wildcard matches everything.'],
    ['access-list 5 permit 10.1.1.0 0.0.0.255', false, 'A whole /24.'],
    ['access-list 5 permit any 10.1.1.5', false, 'Not valid.'],
  ], 'In a wildcard, 0 bits must match and 1 bits are ignored. host X equals X 0.0.0.0 (one address) and any equals 0.0.0.0 255.255.255.255 (everything). A standard ACL also accepts a bare address as a host.', { console: true }),
  Q('b5-acl-14', 'SECF', 't5-acl', 'Does an outbound ACL on an interface filter packets the router itself generates, such as its own pings?', [
    ['No; outbound ACLs do not filter router-originated traffic', true, 'Locally sourced packets bypass them.'],
    ['Yes, always', false, 'Not for locally generated traffic.'],
    ['Only for TCP', false, 'No.'],
    ['Only if the ACL is standard', false, 'No.'],
  ], 'Router-originated packets skip outbound interface ACLs, which surprises people testing from the router. Test filtering with traffic from a host behind the router.'),
  Q('b5-acl-15', 'SECF', 't5-acl', 'Which ACL type filters on source address only?', [
    ['Standard', true, 'Source only.'],
    ['Extended', false, 'Many fields.'],
    ['Named', false, 'Named can be either.'],
    ['Dynamic', false, 'Not the answer.'],
  ], 'Standard ACLs are simple and used where only the source matters: VTY access-class, NAT source selection, SNMP community limits, route filtering.'),
  Q('b5-acl-16', 'SECF', 't5-acl', 'Users in 10.1.2.0/24 must not reach the HR server 10.1.9.9 on any protocol, but everything else is allowed. Which extended ACL, applied inbound on their gateway interface, does this?', [
    ['deny ip 10.1.2.0 0.0.0.255 host 10.1.9.9 / permit ip any any', true, 'Specific deny, then permit the rest.'],
    ['deny ip any any / permit ip 10.1.2.0 0.0.0.255 host 10.1.9.9', false, 'The first line blocks everything.'],
    ['permit ip 10.1.2.0 0.0.0.255 host 10.1.9.9', false, 'The opposite, and implicit deny blocks the rest.'],
    ['deny ip host 10.1.9.9 10.1.2.0 0.0.0.255', false, 'Source and destination swapped for inbound from users.'],
  ], 'Write the specific deny first, then allow everything else, since the implicit deny would otherwise block all traffic. Inbound on the users\' gateway interface, their addresses are the source.', { console: true }),
  Q('b5-acl-17', 'SECF', 't5-acl', 'Which statement about named ACLs is true?', [
    ['They can be standard or extended and are edited line by line with sequence numbers', true, 'ip access-list standard|extended NAME.'],
    ['They can only be standard', false, 'Both types.'],
    ['They cannot be applied to interfaces', false, 'They can.'],
    ['They require numbers in their names', false, 'Names are free text.'],
  ], 'Named ACLs make intent visible (WEB-IN, MGMT-ONLY) and are easier to maintain. Apply them the same way: ip access-group WEB-IN in.', { console: true }),
  Q('b5-acl-18', 'SECF', 't5-acl', 'Which ACL line allows pings to get replies back through an inbound filter on the internet interface?', [
    ['permit icmp any any echo-reply', true, 'Lets echo replies in.'],
    ['permit icmp any any echo', false, 'Allows inbound echo requests, not replies.'],
    ['permit udp any any eq 7', false, 'Not ping.'],
    ['permit tcp any any eq icmp', false, 'ICMP is not TCP.'],
  ], 'ICMP types can be matched by name: echo, echo-reply, unreachable, time-exceeded. Allowing echo-reply and unreachable inbound keeps troubleshooting from inside working without exposing hosts to pings from outside.', { console: true }),
  Q('b5-acl-19', 'SECF', 't5-acl', 'ACL 10 permits 10.1.99.0/24. It is applied with access-class 10 in under line vty 0 15. What does it control?', [
    ['Which source addresses may open SSH or Telnet sessions to the router', true, 'Management access.'],
    ['Which traffic may cross the router', false, 'access-class does not filter transit traffic.'],
    ['Which hosts get DHCP', false, 'No.'],
    ['Which hosts are translated by NAT', false, 'No.'],
  ], 'access-class on VTY lines limits who can manage the device, whichever interface the session arrives on. It is the simplest high-value hardening step after SSH and local accounts.', { exhibit: X(ACL_OUT, ...ACL_MARKS) }),
  Q('b5-acl-20', 'SECF', 't5-acl', 'Which keyword in an extended ACL matches a range of ports, such as 8000 through 8100?', [
    ['range 8000 8100', true, 'Inclusive range.'],
    ['eq 8000-8100', false, 'eq takes single ports.'],
    ['between 8000 8100', false, 'Not valid.'],
    ['gt 8000 lt 8100', false, 'Only one operator per side.'],
  ], 'Port operators: eq, neq, lt, gt and range. Named ports (www, telnet, domain, smtp) can replace numbers in many cases, and IOS shows them by name in show access-lists.', { console: true }),
  Q('b5-acl-21', 'SECF', 't5-acl', 'A new ACL is applied and suddenly OSPF neighbors drop. The ACL ends with deny ip any any. What was forgotten?', [
    ['A permit for OSPF (protocol 89) from the neighbors', true, 'The implicit or explicit deny blocks routing protocol packets too.'],
    ['A permit for ARP', false, 'ARP is not filtered by IP ACLs.'],
    ['A permit for CDP', false, 'CDP is Layer 2.'],
    ['Nothing; OSPF ignores ACLs', false, 'Inbound ACLs filter OSPF.'],
  ], 'Inbound interface ACLs filter control-plane traffic arriving on the interface, including OSPF hellos. Add permit ospf any any (or the neighbor\'s address) above the deny.'),
  Q('b5-acl-22', 'SECF', 't5-acl', 'Which command removes ACL 110 from an interface without deleting the ACL?', [
    ['no ip access-group 110 in, under the interface', true, 'Unapplies it.'],
    ['no access-list 110', false, 'Deletes the whole ACL.'],
    ['shutdown', false, 'Disables the interface.'],
    ['clear access-list counters 110', false, 'Only resets counters.'],
  ], 'Be careful with no access-list 110: it deletes every line. Removing the access-group first is safer when editing a live ACL, or edit named ACLs line by line.', { console: true }),
  Q('b5-acl-23', 'SECF', 't5-acl', 'Which ACL in this output is attached to Gi0/1, and in which direction?', [
    ['WEB-IN, inbound', true, 'Inbound access list is WEB-IN.'],
    ['10, outbound', false, 'No outgoing list is set.'],
    ['WEB-IN, outbound', false, 'It is inbound.'],
    ['None', false, 'WEB-IN is applied.'],
  ], 'show ip interface lists the ACLs applied to an interface in each direction. It is the quickest way to confirm an ACL is actually applied, and on which side.', {
    exhibit: X(`
R1#show ip interface g0/1 | include access list
  Outgoing access list is not set
  Inbound  access list is WEB-IN`,
      ['show ip interface g0/1 | include access list', 'cmd'], ['Outgoing access list is not set', 'state', 'Outbound: none'], ['WEB-IN', 'key', 'Inbound ACL']),
  }),
  Q('b5-acl-24', 'SECF', 't5-acl', 'Which ACL line permits DNS queries from inside hosts to the server 10.1.1.53?', [
    ['permit udp 10.1.0.0 0.0.255.255 host 10.1.1.53 eq domain', true, 'DNS on UDP 53.'],
    ['permit tcp any any eq 53 established', false, 'Wrong protocol and direction.'],
    ['permit udp host 10.1.1.53 any eq 69', false, 'TFTP port.'],
    ['permit icmp any host 10.1.1.53', false, 'ICMP.'],
  ], 'IOS names port 53 "domain". Remember DNS also uses TCP 53 for large responses and zone transfers, so a strict policy may need both lines.', { console: true }),
  Q('b5-acl-25', 'SECF', 't5-acl', 'Which statement about IPv6 ACLs is true?', [
    ['They are always named, and end with implicit permits for neighbor discovery before the implicit deny', true, 'NDP must keep working.'],
    ['They use wildcard masks', false, 'They use prefix lengths.'],
    ['They are applied with ip access-group', false, 'ipv6 traffic-filter.'],
    ['They have no implicit deny', false, 'They do.'],
  ], 'IPv6 ACLs: ipv6 access-list NAME, prefix lengths instead of wildcards, applied with ipv6 traffic-filter NAME in|out. Implicit permit icmp nd-na and nd-ns sit before the implicit deny, but an explicit deny ipv6 any any log would block them.'),
  Q('b5-acl-26', 'SECF', 't5-acl', 'Which ACL permits SSH only from the management host 10.1.99.5 to the router\'s VTY lines?', [
    ['access-list 12 permit host 10.1.99.5, then access-class 12 in on line vty 0 15', true, 'Standard ACL on the lines.'],
    ['access-list 112 permit tcp any any eq 22 on every interface', false, 'Allows everyone.'],
    ['access-class 12 out', false, 'out filters sessions started from the router.'],
    ['ip access-group 12 in on line vty', false, 'Lines use access-class.'],
  ], 'For management access, a standard ACL listing admin hosts on the VTY lines does the job; SSH-only comes from transport input ssh, not from the ACL.', { console: true }),
];
