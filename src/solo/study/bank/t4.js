// Tree 4, IP Services: NAT and PAT, NTP and syslog, DHCP and DNS, SNMP,
// QoS per-hop behaviors, and TFTP/FTP.

import { Q, X } from './qb.js';

const NAT_T = `
R1#show ip nat translations
Pro Inside global        Inside local       Outside local      Outside global
--- 203.0.113.10         10.1.1.10          ---                ---
tcp 203.0.113.2:1025     10.1.1.21:51515    93.184.216.34:443  93.184.216.34:443
tcp 203.0.113.2:1026     10.1.1.22:49820    93.184.216.34:443  93.184.216.34:443`;
const NAT_MARKS = [
  ['show ip nat translations', 'cmd'], [/203\.0\.113\.(10|2)(?=[ :])/, 'ip', 'Inside global (public)'], [/10\.1\.1\.(10|21|22)/, 'ip', 'Inside local (private)'],
  [/93\.184\.216\.34/, 'hop', 'Outside host'], [/:(1025|1026|51515|49820|443)/, 'key', 'Port number'], [/^---(?= )/m, 'state', 'Static entry'],
];

export const T4 = [
  // ---------- t4-nat ----------
  Q('b4-nat-01', 'IPS', 't4-nat', 'In NAT terms, what is the inside local address?', [
    ['The private address of an inside host, as seen on the inside network', true, 'Usually RFC 1918.'],
    ['The public address the inside host appears as', false, 'That is inside global.'],
    ['The outside host\'s own public address', false, 'That is outside global.'],
    ['The router\'s outside interface address', false, 'Often used as inside global with PAT.'],
  ], 'Inside or outside says which side the host is on; local or global says from which side you are looking. Inside local: the inside host\'s own (private) address. Inside global: what the internet sees for it. Without destination NAT, outside local equals outside global.'),
  Q('b4-nat-02', 'IPS', 't4-nat', 'Which entry in this table is a static NAT mapping?', [
    ['203.0.113.10 to 10.1.1.10, with no protocol or ports', true, 'Static one-to-one entries stay permanently.'],
    ['203.0.113.2:1025 to 10.1.1.21:51515', false, 'A PAT translation with ports.'],
    ['203.0.113.2:1026 to 10.1.1.22:49820', false, 'A PAT translation with ports.'],
    ['None', false, 'The first line is static.'],
  ], 'Static entries show --- for protocol and outside addresses, because they exist before any traffic. Dynamic PAT entries appear as flows start, each with ports, and age out after inactivity.', { exhibit: X(NAT_T, ...NAT_MARKS) }),
  Q('b4-nat-03', 'IPS', 't4-nat', 'How does PAT let 10.1.1.21 and 10.1.1.22 share 203.0.113.2?', [
    ['It gives each flow a unique source port on the public address', true, '1025 and 1026 here.'],
    ['It alternates the address between them', false, 'Both use it at once.'],
    ['It uses their MAC addresses', false, 'MACs never cross the router.'],
    ['It assigns each a different public address', false, 'That is dynamic NAT without overload.'],
  ], 'Port Address Translation (NAT overload) maps many inside sockets onto one public IP by rewriting source ports. Replies come back to 203.0.113.2:1025 or :1026 and the router knows which inside host each belongs to.', { exhibit: X(NAT_T, ...NAT_MARKS) }),
  Q('b4-nat-04', 'IPS', 't4-nat', 'Which configuration enables PAT for 10.1.1.0/24 using the address of Gi0/1?', [
    ['access-list 1 permit 10.1.1.0 0.0.0.255 / ip nat inside source list 1 interface g0/1 overload', true, 'ACL selects, overload enables PAT.'],
    ['ip nat inside source static 10.1.1.0 g0/1', false, 'Static maps one address.'],
    ['ip nat pool LAN 10.1.1.1 10.1.1.254 / overload', false, 'Not valid and pools are for public addresses.'],
    ['ip nat outside source list 1 interface g0/1', false, 'outside source translates outside hosts.'],
  ], 'The ACL selects which inside sources get translated; the interface keyword uses that interface\'s current address; overload adds ports. Also mark ip nat inside on the LAN interface and ip nat outside on the WAN interface.', { console: true }),
  Q('b4-nat-05', 'IPS', 't4-nat', 'NAT is configured but nothing is translated. The config is shown. What is missing?', [
    ['ip nat inside on Gi0/0 and ip nat outside on Gi0/1', true, 'Without them the router never translates.'],
    ['A static route', false, 'Unrelated to translation.'],
    ['A larger ACL', false, 'The ACL covers the LAN.'],
    ['ip routing', false, 'On by default.'],
  ], 'Translation happens only on traffic crossing from an ip nat inside interface to an ip nat outside interface. Forgetting either marker is the most common NAT fault; show ip nat statistics lists which interfaces are inside and outside.', {
    exhibit: X(`
interface GigabitEthernet0/0
 ip address 10.1.1.1 255.255.255.0
interface GigabitEthernet0/1
 ip address 203.0.113.2 255.255.255.252
access-list 1 permit 10.1.1.0 0.0.0.255
ip nat inside source list 1 interface GigabitEthernet0/1 overload`,
      [/interface GigabitEthernet0\/\d/, 'iface'], [/10\.1\.1\.[01]/, 'ip'], ['203.0.113.2', 'ip', 'Public address'], [/255\.255\.255\.(0|252)/, 'mask'], [/0\.0\.0\.255/, 'mask', 'Wildcard'], ['overload', 'key', 'PAT']),
  }),
  Q('b4-nat-06', 'IPS', 't4-nat', 'Which command maps a web server at 10.1.1.10 permanently to 203.0.113.10?', [
    ['ip nat inside source static 10.1.1.10 203.0.113.10', true, 'One-to-one static NAT.'],
    ['ip nat outside source static 10.1.1.10 203.0.113.10', false, 'Translates outside hosts.'],
    ['ip nat inside source list 1 pool WEB', false, 'Dynamic.'],
    ['ip nat pool WEB 10.1.1.10 203.0.113.10', false, 'Not valid.'],
  ], 'Static NAT is what makes an inside server reachable from the internet: connections to 203.0.113.10 are translated to 10.1.1.10, and its replies go out as 203.0.113.10. For one port only, static PAT adds tcp and port numbers.', { console: true }),
  Q('b4-nat-07', 'IPS', 't4-nat', 'Users intermittently fail to reach the internet. show ip nat statistics shows the dynamic pool at 100 percent allocated with misses climbing. What is wrong?', [
    ['The pool has fewer public addresses than active users and no overload', true, 'Dynamic NAT is one-to-one.'],
    ['The ACL is too small', false, 'Misses mean matched traffic found no address.'],
    ['NTP is unsynchronized', false, 'Unrelated.'],
    ['The outside interface is down', false, 'Nothing would work at all.'],
  ], 'Dynamic NAT without overload gives each inside host its own public address until the translation times out. When the pool is used up, new hosts are dropped (misses). Add overload to the ip nat inside source command, or more addresses.', {
    exhibit: X(`
R1#show ip nat statistics
Total active translations: 8 (0 static, 8 dynamic; 0 extended)
Outside interfaces:
  GigabitEthernet0/1
Inside interfaces:
  GigabitEthernet0/0
Hits: 5210  Misses: 37
Dynamic mappings:
-- Inside Source
[Id: 1] access-list 1 pool PUB refcount 8
 pool PUB: netmask 255.255.255.248
        start 203.0.113.17 end 203.0.113.24
        type generic, total addresses 8, allocated 8 (100%), misses 37`,
      ['show ip nat statistics', 'cmd'], [/GigabitEthernet0\/\d/, 'iface'], ['allocated 8 (100%)', 'fail', 'Pool exhausted'], [/misses 37|Misses: 37/, 'fail', 'Failed translations'], [/203\.0\.113\.(17|24)/, 'ip', 'Pool range'], ['255.255.255.248', 'mask'], ['Hits: 5210', 'count']),
  }),
  Q('b4-nat-08', 'IPS', 't4-nat', 'Which commands define a dynamic NAT pool of 203.0.113.20 to .30? (Choose two.)', [
    ['ip nat pool PUB 203.0.113.20 203.0.113.30 netmask 255.255.255.224', true, 'Defines the pool.'],
    ['ip nat inside source list 1 pool PUB', true, 'Ties the ACL to the pool.'],
    ['ip nat inside source static pool PUB', false, 'Not valid.'],
    ['ip dhcp pool PUB', false, 'DHCP, not NAT.'],
  ], 'Dynamic NAT needs three pieces: an ACL of inside sources, a pool of public addresses, and ip nat inside source list N pool NAME (add overload for PAT over the pool). Then mark the inside and outside interfaces.', { console: true }),
  Q('b4-nat-09', 'IPS', 't4-nat', 'Which command clears all dynamic NAT translations?', [
    ['clear ip nat translation *', true, 'Dynamic entries are removed; static ones stay.'],
    ['no ip nat inside', false, 'Removes the interface role.'],
    ['clear ip route *', false, 'Clears routes.'],
    ['reload nat', false, 'Not valid.'],
  ], 'Clearing is useful after changing an ACL or pool, because existing translations otherwise linger until they time out (24 hours for simple dynamic entries by default, much less for PAT flows).', { console: true }),
  Q('b4-nat-10', 'IPS', 't4-nat', 'Which NAT type lets many inside hosts share one public address?', [
    ['PAT (NAT overload)', true, 'Many-to-one with ports.'],
    ['Static NAT', false, 'One-to-one.'],
    ['Dynamic NAT', false, 'One-to-one from a pool.'],
    ['Twice NAT', false, 'Not a CCNA term.'],
  ], 'Static: one inside address, one public, permanently. Dynamic: one inside address borrows one public address from a pool. PAT: many inside addresses share one (or a few) public addresses, separated by port numbers. Almost every home and branch uses PAT.'),
  Q('b4-nat-11', 'IPS', 't4-nat', 'From the internet, what source address do packets from 10.1.1.21 appear to come from?', [
    ['203.0.113.2', true, 'The inside global address with PAT.'],
    ['10.1.1.21', false, 'Private, never seen outside.'],
    ['93.184.216.34', false, 'That is the outside server.'],
    ['203.0.113.10', false, 'That is the static server mapping.'],
  ], 'PAT rewrites the source address and port as packets leave through the outside interface. The remote server replies to 203.0.113.2 on port 1025, and the router translates back to 10.1.1.21:51515.', { exhibit: X(NAT_T, ...NAT_MARKS) }),
  Q('b4-nat-12', 'IPS', 't4-nat', 'Which statement about NAT and IPv4 address conservation is true?', [
    ['PAT lets whole private networks reach the internet using few public addresses', true, 'The main reason NAT is everywhere.'],
    ['NAT provides strong security on its own', false, 'It hides addresses but is not a firewall.'],
    ['NAT is required for IPv6', false, 'IPv6 has enough addresses.'],
    ['NAT speeds up routing', false, 'It adds work.'],
  ], 'IPv4 public addresses ran out, and PAT is what stretched them. NAT also breaks end-to-end addressing, which complicates some protocols (VoIP, IPsec without NAT-T) and inbound connections.'),
  Q('b4-nat-13', 'IPS', 't4-nat', 'Which interface roles are correct for a branch router? (Choose two.)', [
    ['ip nat inside on the LAN interface', true, 'Where private addresses live.'],
    ['ip nat outside on the internet-facing interface', true, 'Where public addresses are used.'],
    ['ip nat outside on the LAN interface', false, 'Reversed.'],
    ['ip nat inside on the loopback', false, 'Not needed.'],
  ], 'Inside faces the private network; outside faces the public one. A router can have several of each, for example two LAN VLAN subinterfaces as inside.', { console: true }),
  Q('b4-nat-14', 'IPS', 't4-nat', 'An external user cannot reach the internal web server mapped with static NAT. Translations show the static entry. What else should you check? (Choose two.)', [
    ['That an inbound ACL or firewall permits TCP 80/443 to the public address', true, 'Filtering is separate from NAT.'],
    ['That the server\'s default gateway points to the NAT router', true, 'Replies must return through NAT.'],
    ['That PAT overload is configured', false, 'Unrelated to static inbound.'],
    ['That the server has a public address configured', false, 'It keeps its private address.'],
  ], 'Static NAT only rewrites addresses. Traffic still has to be permitted by any ACLs, and the server\'s replies must route back through the same router to be translated, or they leave with a private source and are dropped.'),
  Q('b4-nat-15', 'IPS', 't4-nat', 'What does the outside global address represent?', [
    ['The actual public address of the outside host', true, 'Outside host as the internet knows it.'],
    ['The private address of an inside host', false, 'Inside local.'],
    ['The public address of an inside host', false, 'Inside global.'],
    ['The router\'s loopback', false, 'No.'],
  ], 'Outside global is the address the outside host actually uses. Outside local is how that host appears to inside hosts, which is the same unless the router also translates destinations.'),
  Q('b4-nat-16', 'IPS', 't4-nat', 'Which command shows how many NAT translations are active and which interfaces are inside and outside?', [
    ['show ip nat statistics', true, 'Summary, interfaces, hits and misses.'],
    ['show ip nat translations', false, 'Lists each translation.'],
    ['show ip interface brief', false, 'No NAT roles.'],
    ['show nat', false, 'Not valid.'],
  ], 'Start NAT troubleshooting with statistics (roles, pools, misses) and then look at translations to see if a particular inside host is being translated.', { console: true }),
  Q('b4-nat-17', 'IPS', 't4-nat', 'The ACL used for NAT is shown. Which hosts will be translated?', [
    ['Only 10.1.1.0 to 10.1.1.255', true, 'The ACL matches only that /24.'],
    ['All of 10.1.0.0/16', false, 'The wildcard is 0.0.0.255.'],
    ['Only 10.1.1.1', false, 'That would need 0.0.0.0.'],
    ['No hosts', false, 'It permits a /24.'],
  ], 'NAT translates only traffic the ACL permits. A second LAN (10.1.2.0/24, say) that was never added to the ACL leaves the router untranslated with a private source and gets nowhere on the internet.', {
    exhibit: X(`
access-list 1 permit 10.1.1.0 0.0.0.255
ip nat inside source list 1 interface GigabitEthernet0/1 overload`,
      ['10.1.1.0', 'ip'], ['0.0.0.255', 'mask', 'Wildcard'], ['GigabitEthernet0/1', 'iface'], ['overload', 'key', 'PAT']),
  }),
  Q('b4-nat-18', 'IPS', 't4-nat', 'Which command forwards only TCP 443 on the public interface to an inside server (static PAT)?', [
    ['ip nat inside source static tcp 10.1.1.10 443 203.0.113.2 443', true, 'Static NAT with protocol and port.'],
    ['ip nat inside source static 10.1.1.10 203.0.113.2', false, 'Maps every port.'],
    ['ip nat outside source static tcp 203.0.113.2 443 10.1.1.10 443', false, 'outside source is for outside hosts.'],
    ['ip nat port-forward 443 10.1.1.10', false, 'Not IOS syntax.'],
  ], 'Static PAT (port forwarding) lets one public address serve several inside servers on different ports, for example 443 to a web server and 25 to a mail server, while PAT for users shares the same address.', { console: true }),

  // ---------- t4-ntp-log ----------
  Q('b4-ntp-01', 'IPS', 't4-ntp-log', 'Why does accurate time matter on network devices?', [
    ['So log timestamps line up across devices, and certificates and time-based features work', true, 'Correlation and security.'],
    ['It speeds up routing', false, 'No effect.'],
    ['It is needed for ARP', false, 'No.'],
    ['It sets the hostname', false, 'No.'],
  ], 'Investigating an outage across ten devices is impossible if their clocks disagree. Certificates, Kerberos and time-based ACLs also break with bad time. NTP keeps everything within milliseconds.'),
  Q('b4-ntp-02', 'IPS', 't4-ntp-log', 'Which command makes a router an NTP client of 10.1.1.1?', [
    ['ntp server 10.1.1.1', true, 'Client mode.'],
    ['ntp master 10.1.1.1', false, 'ntp master takes a stratum and makes this router a server.'],
    ['clock set 10.1.1.1', false, 'Not valid.'],
    ['ntp peer 10.1.1.1', false, 'Symmetric peering, not the usual client setup.'],
  ], 'ntp server points the router at a time source. ntp master [stratum] makes the router itself an authoritative server from its own clock, for labs or isolated networks. A router that syncs as a client also serves time to others.', { console: true }),
  Q('b4-ntp-03', 'IPS', 't4-ntp-log', 'What does this output tell you?', [
    ['The clock is synchronized to 10.1.1.1, and this router is stratum 4', true, 'One level below its source.'],
    ['The router is not synchronized', false, 'It says synchronized.'],
    ['The router is stratum 1', false, 'It shows 4.'],
    ['NTP is using port 161', false, 'NTP uses UDP 123.'],
  ], 'show ntp status confirms synchronization, the local stratum (one more than the source\'s) and the reference. Stratum 16 means unsynchronized. show ntp associations marks the chosen source with an asterisk.', {
    exhibit: X(`
R1#show ntp status
Clock is synchronized, stratum 4, reference is 10.1.1.1
nominal freq is 250.0000 Hz, actual freq is 249.9990 Hz, precision is 2**10
reference time is E4A1B2C3.1A2B3C4D (14:22:05.102 UTC Mon Oct 12 2026)
clock offset is 0.3215 msec, root delay is 12.20 msec`,
      ['show ntp status', 'cmd'], ['Clock is synchronized', 'ok', 'Synchronized'], ['stratum 4', 'key', 'Stratum'], ['10.1.1.1', 'ip', 'Time source'], ['0.3215 msec', 'count', 'Offset']),
  }),
  Q('b4-ntp-04', 'IPS', 't4-ntp-log', 'What does stratum measure in NTP?', [
    ['Distance from the reference clock: stratum 1 is attached to it, each hop adds one', true, 'Lower is closer.'],
    ['Clock accuracy in milliseconds', false, 'Offset measures that.'],
    ['The number of clients', false, 'No.'],
    ['Security level', false, 'No.'],
  ], 'Stratum 0 is the reference itself (GPS, atomic clock), stratum 1 servers are wired to it, and every NTP hop adds one, up to 15. 16 means unsynchronized. Clients prefer lower-stratum sources.'),
  Q('b4-ntp-05', 'IPS', 't4-ntp-log', 'Which transport and port does NTP use?', [
    ['UDP 123', true, 'Both directions.'],
    ['TCP 123', false, 'NTP is UDP.'],
    ['UDP 514', false, 'Syslog.'],
    ['UDP 69', false, 'TFTP.'],
  ], 'NTP uses UDP 123. An ACL or firewall blocking it leaves devices stuck unsynchronized; show ntp associations will show the server but never mark it as synced.'),
  Q('b4-ntp-06', 'IPS', 't4-ntp-log', 'In this log message, what is the severity and what happened?', [
    ['Severity 3 (errors): Gi0/1 went down', true, 'LINK-3-UPDOWN, changed state to down.'],
    ['Severity 5: the line protocol came up', false, 'This message is LINK-3, state down.'],
    ['Severity 1: the router crashed', false, 'No.'],
    ['Severity 3: someone changed the configuration', false, 'That is SYS-5-CONFIG_I.'],
  ], 'Syslog messages read %FACILITY-SEVERITY-MNEMONIC: description. LINK-3-UPDOWN is the physical link changing state (severity 3, errors); LINEPROTO-5-UPDOWN is the line protocol (severity 5, notifications).', {
    exhibit: X(`
*Oct 12 14:31:07.221: %LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down`,
      [/\*Oct 12 14:31:07\.221/, 'count', 'Timestamp'], ['%LINK', 'key', 'Facility'], [/-3-/, 'fail', 'Severity 3'], ['UPDOWN', 'key', 'Mnemonic'], ['GigabitEthernet0/1', 'iface'], ['changed state to down', 'fail', 'What happened']),
  }),
  Q('b4-ntp-07', 'IPS', 't4-ntp-log', 'Which syslog severity names go with levels 0 through 7?', [
    ['Emergency, Alert, Critical, Error, Warning, Notification, Informational, Debugging', true, 'Lower number is more severe.'],
    ['Debugging, Informational, Notification, Warning, Error, Critical, Alert, Emergency', false, 'Reversed.'],
    ['Critical, Emergency, Alert, Error, Warning, Notice, Info, Debug', false, 'Out of order.'],
    ['Error, Warning, Info, Debug and four custom levels', false, 'All eight are defined.'],
  ], 'A common memory aid: Every Awesome Cisco Engineer Will Need Ice cream Daily. Level 0 means the system is unusable; level 7 is debug output.'),
  Q('b4-ntp-08', 'IPS', 't4-ntp-log', 'logging trap warnings is configured. Which messages are sent to the syslog server?', [
    ['Levels 0 through 4', true, 'The configured level and everything more severe.'],
    ['Only level 4', false, 'More severe levels are included.'],
    ['Levels 4 through 7', false, 'Less severe levels are excluded.'],
    ['Everything', false, 'Only 0 to 4.'],
  ], 'Choosing a level includes it and every lower number. warnings (4) sends emergencies through warnings; informational (6), the default for trap, also sends notifications such as interface up/down and config changes.', { console: true }),
  Q('b4-ntp-09', 'IPS', 't4-ntp-log', 'Which command sends log messages to a syslog server at 10.1.1.50?', [
    ['logging host 10.1.1.50', true, 'Also accepted: logging 10.1.1.50.'],
    ['syslog server 10.1.1.50', false, 'Not IOS syntax.'],
    ['snmp-server host 10.1.1.50', false, 'SNMP.'],
    ['ntp server 10.1.1.50', false, 'NTP.'],
  ], 'Syslog uses UDP 514 by default. Combine logging host with logging trap (level) and service timestamps log datetime msec so messages carry calendar dates, and with NTP so those dates are right.', { console: true }),
  Q('b4-ntp-10', 'IPS', 't4-ntp-log', 'Where can a Cisco device send its log messages? (Choose two.)', [
    ['The console and VTY sessions (with terminal monitor)', true, 'Live display.'],
    ['A local buffer in RAM and external syslog servers', true, 'show logging reads the buffer.'],
    ['The startup-config', false, 'Not a log destination.'],
    ['DHCP clients', false, 'No.'],
  ], 'Destinations: console (logging console), VTY lines (terminal monitor per session), the internal buffer (logging buffered, read with show logging) and syslog servers (logging host). Each has its own severity setting.'),
  Q('b4-ntp-11', 'IPS', 't4-ntp-log', 'Which command makes log timestamps show the date and time with milliseconds?', [
    ['service timestamps log datetime msec', true, 'Calendar dates instead of uptime.'],
    ['clock timezone msec', false, 'Not valid.'],
    ['logging timestamps', false, 'Not valid.'],
    ['ntp update-calendar', false, 'Updates the hardware clock.'],
  ], 'Without it, older IOS versions stamp logs with time since boot, which is useless for correlation. With it plus NTP, logs from every device line up to the millisecond.', { console: true }),
  Q('b4-ntp-12', 'IPS', 't4-ntp-log', 'What does an asterisk before an NTP association mean in show ntp associations?', [
    ['That server is the one the router is synchronized to (sys.peer)', true, '* is the chosen peer.'],
    ['The server is unreachable', false, 'No.'],
    ['The server is configured but unused', false, 'Candidates are marked differently.'],
    ['The router is the master', false, 'No.'],
  ], 'Symbols: * synchronized peer, + candidate, - outlier, x falseticker, ~ configured. If no line has an asterisk, the router has not synchronized; check reachability to UDP 123 and the server\'s own stratum.', { console: true }),
  Q('b4-ntp-13', 'IPS', 't4-ntp-log', 'Which configuration makes R1 an authoritative NTP server for a lab with no internet access?', [
    ['ntp master 3', true, 'Serves its own clock at stratum 3.'],
    ['ntp server 127.0.0.1', false, 'Not the way.'],
    ['ntp client', false, 'Not valid.'],
    ['clock master', false, 'Not valid.'],
  ], 'ntp master [stratum] tells the router to trust its own clock and serve it. Set the clock first with clock set. Other devices then use ntp server pointing at R1.', { console: true }),
  Q('b4-ntp-14', 'IPS', 't4-ntp-log', 'In syslog, what is a facility?', [
    ['A label for the source of a message, such as the process (LINK, OSPF) or the server-side local0 to local7 category', true, 'It groups messages by origin.'],
    ['The severity level', false, 'Severity is separate.'],
    ['The syslog server\'s address', false, 'That is the host.'],
    ['The log buffer size', false, 'No.'],
  ], 'In %OSPF-5-ADJCHG, OSPF is the IOS facility. When sending to a server, the device also tags messages with a syslog facility (local7 by default) so the server can sort them into files.'),
  Q('b4-ntp-15', 'IPS', 't4-ntp-log', 'Which command shows the messages stored in the local log buffer?', [
    ['show logging', true, 'Shows settings and the buffer.'],
    ['show log buffer', false, 'Not valid.'],
    ['debug logging', false, 'Not valid.'],
    ['show history', false, 'Command history.'],
  ], 'show logging lists each destination\'s level and the buffered messages, oldest first. logging buffered 16384 informational sets a 16 KB buffer that keeps informational and more severe messages.', { console: true }),
  Q('b4-ntp-16', 'IPS', 't4-ntp-log', 'What is the severity of %SYS-5-CONFIG_I: Configured from console by admin on vty0?', [
    ['5, notification', true, 'The number after the facility.'],
    ['1, alert', false, 'No.'],
    ['7, debugging', false, 'No.'],
    ['0, emergency', false, 'No.'],
  ], 'The middle number is the severity. Configuration changes are notifications (5), and they are worth sending to the syslog server for an audit trail of who changed what and when.'),

  // ---------- t4-dhcp-dns ----------
  Q('b4-dh-01', 'IPS', 't4-dhcp-dns', 'What are the four DHCP messages, in order?', [
    ['Discover, Offer, Request, Acknowledge', true, 'DORA.'],
    ['Request, Offer, Discover, Acknowledge', false, 'Out of order.'],
    ['Discover, Request, Offer, Accept', false, 'Out of order and wrong names.'],
    ['Hello, Offer, Request, Done', false, 'Not DHCP messages.'],
  ], 'The client broadcasts Discover, servers reply with Offer, the client broadcasts Request for one offer (so other servers know), and the chosen server confirms with Ack. A Nak means "that address is not yours, start over".'),
  Q('b4-dh-02', 'IPS', 't4-dhcp-dns', 'Which command lets clients on VLAN 10 reach a DHCP server on another subnet?', [
    ['ip helper-address 10.1.99.10 on the VLAN 10 gateway interface', true, 'Relays DHCP broadcasts as unicast.'],
    ['ip dhcp relay on the server', false, 'The relay is on the router near the clients.'],
    ['ip route 255.255.255.255 10.1.99.10', false, 'Broadcasts are not routed.'],
    ['ip helper-address on the server\'s interface', false, 'It goes on the client-facing interface.'],
  ], 'Routers do not forward broadcasts. ip helper-address on the interface (or SVI) facing the clients turns DHCP broadcasts into unicasts to the server, filling in the gateway address so the server picks the right pool.', { console: true }),
  Q('b4-dh-03', 'IPS', 't4-dhcp-dns', 'Which configuration makes a router a DHCP server for 10.1.10.0/24 with gateway .1 and DNS 10.1.1.53, keeping .1 to .10 free?', [
    ['ip dhcp excluded-address 10.1.10.1 10.1.10.10 / ip dhcp pool V10 / network 10.1.10.0 255.255.255.0 / default-router 10.1.10.1 / dns-server 10.1.1.53', true, 'All pieces present.'],
    ['ip dhcp pool V10 / network 10.1.10.0 0.0.0.255 / gateway 10.1.10.1', false, 'Pools take a subnet mask, and the keyword is default-router.'],
    ['ip helper-address 10.1.10.1', false, 'That is relay.'],
    ['ip address dhcp', false, 'That makes an interface a client.'],
  ], 'Exclusions are global; the pool sets network, default-router, dns-server and optionally lease and domain-name. Exclude statically assigned addresses (gateway, printers) so the server never hands them out.', { console: true }),
  Q('b4-dh-04', 'IPS', 't4-dhcp-dns', 'Which UDP ports does DHCP use?', [
    ['67 for the server, 68 for the client', true, 'Both UDP.'],
    ['53 and 54', false, 'DNS is 53.'],
    ['161 and 162', false, 'SNMP.'],
    ['546 and 547', false, 'DHCPv6.'],
  ], 'DHCPv4 uses UDP 67 (server) and 68 (client); DHCPv6 uses 547 (server/relay) and 546 (client). A Discover is sent from 0.0.0.0 to 255.255.255.255 because the client has no address yet.'),
  Q('b4-dh-05', 'IPS', 't4-dhcp-dns', 'Which address has the DHCP server leased to the PC with MAC 0050.7966.6800?', [
    ['10.1.10.11', true, 'Matched by the hardware address column.'],
    ['10.1.10.12', false, 'Leased to a different MAC.'],
    ['10.1.10.1', false, 'The gateway, excluded.'],
    ['None', false, 'A binding exists.'],
  ], 'show ip dhcp binding lists each lease: IP, client ID or hardware address, lease expiry and type. It is how you find which address a particular device received, or confirm the server is handing out leases at all.', {
    exhibit: X(`
R1#show ip dhcp binding
Bindings from all pools not associated with VRF:
IP address      Client-ID/              Lease expiration        Type
                Hardware address/
                User name
10.1.10.11      0100.5079.6668.00       Oct 19 2026 02:14 PM    Automatic
10.1.10.12      0100.5079.6668.01       Oct 19 2026 02:20 PM    Automatic`,
      ['show ip dhcp binding', 'cmd'], [/10\.1\.10\.1[12]/, 'ip', 'Leased address'], [/0100\.5079\.6668\.0[01]/, 'mac', 'Client ID (01 + MAC)'], [/Oct 19 2026 0\d:\d\d PM/, 'count', 'Lease expiry']),
  }),
  Q('b4-dh-06', 'IPS', 't4-dhcp-dns', 'Which interface command makes a router get its own address from the provider by DHCP?', [
    ['ip address dhcp', true, 'DHCP client on the interface.'],
    ['ip dhcp client', false, 'Not the command to obtain an address.'],
    ['ip helper-address', false, 'Relay.'],
    ['ip dhcp pool WAN', false, 'Server pool.'],
  ], 'Branch routers often take their WAN address from the provider with ip address dhcp. The router also installs a default route toward the DHCP-provided gateway (with AD 254), which a static default will override.', { console: true }),
  Q('b4-dh-07', 'IPS', 't4-dhcp-dns', 'Clients on VLAN 20 get APIPA addresses. The server works for VLAN 10. What is the most likely cause?', [
    ['The VLAN 20 gateway interface is missing ip helper-address, or the server has no pool for VLAN 20', true, 'Relay or scope missing.'],
    ['The DNS server is down', false, 'DNS does not assign addresses.'],
    ['NTP is not configured', false, 'Unrelated.'],
    ['The clients need static addresses', false, 'They should get DHCP.'],
  ], 'If one VLAN works and another does not, compare them: each client VLAN needs a helper on its gateway interface, and the server needs a pool whose network matches that VLAN\'s gateway address.'),
  Q('b4-dh-08', 'IPS', 't4-dhcp-dns', 'Which DNS record maps a name to an IPv6 address?', [
    ['AAAA', true, 'The quad-A record.'],
    ['A', false, 'IPv4.'],
    ['PTR', false, 'Reverse lookup.'],
    ['MX', false, 'Mail exchanger.'],
  ], 'A maps to IPv4, AAAA to IPv6, CNAME is an alias to another name, MX names mail servers, PTR maps an address back to a name, and NS names the authoritative servers for a zone.'),
  Q('b4-dh-09', 'IPS', 't4-dhcp-dns', 'What does this nslookup output show?', [
    ['The PC asked 10.1.1.53, which answered that portal.example.com is 10.1.50.20', true, 'Server then answer.'],
    ['The lookup failed', false, 'An address was returned.'],
    ['10.1.1.53 is the website', false, 'That is the DNS server.'],
    ['The answer came from the root servers', false, 'From the configured server.'],
  ], 'nslookup prints which server it asked, then the answer. "Non-authoritative answer" means the server answered from its cache or by asking others, not from its own zone, which is normal for a resolver.', {
    exhibit: X(`
C:\\>nslookup portal.example.com
Server:  dns1.example.com
Address:  10.1.1.53

Non-authoritative answer:
Name:    portal.example.com
Address:  10.1.50.20`,
      ['nslookup portal.example.com', 'cmd'], ['10.1.1.53', 'dns'], ['10.1.50.20', 'ok', 'The answer'], ['Non-authoritative answer:', 'state', 'From cache or recursion']),
  }),
  Q('b4-dh-10', 'IPS', 't4-dhcp-dns', 'Which commands let a router resolve hostnames using a DNS server at 10.1.1.53? (Choose two.)', [
    ['ip name-server 10.1.1.53', true, 'Sets the resolver.'],
    ['ip domain-lookup', true, 'On by default; must not be disabled.'],
    ['ip dns server', false, 'Makes the router a DNS server.'],
    ['ip helper-address 10.1.1.53', false, 'DHCP relay.'],
  ], 'With a name server set and domain lookup on, you can ping and telnet by name from the router. Labs often disable domain lookup to stop typos hanging; production routers may keep it with a name server.', { console: true }),
  Q('b4-dh-11', 'IPS', 't4-dhcp-dns', 'What role does DHCP play when a laptop joins a network?', [
    ['It gives the laptop an address, mask, default gateway and DNS servers automatically', true, 'And a lease time.'],
    ['It translates names to addresses', false, 'DNS.'],
    ['It encrypts the connection', false, 'No.'],
    ['It authenticates the user', false, 'That is 802.1X.'],
  ], 'DHCP removes manual addressing: the lease includes the IP and mask, default router, DNS servers, domain name and lease time. Renewal starts at half the lease (T1).'),
  Q('b4-dh-12', 'IPS', 't4-dhcp-dns', 'Which command lists addresses the DHCP server found already in use when it tried to lease them?', [
    ['show ip dhcp conflict', true, 'Ping or gratuitous ARP detected a conflict.'],
    ['show ip dhcp binding', false, 'Active leases.'],
    ['show ip dhcp pool', false, 'Pool usage.'],
    ['show arp', false, 'ARP cache.'],
  ], 'Before leasing, the IOS server pings the address. If something answers, it logs a conflict and skips that address. Conflicts usually mean a device was given a static address inside the pool; exclude it.', { console: true }),
  Q('b4-dh-13', 'IPS', 't4-dhcp-dns', 'What is the role of DNS?', [
    ['Translating names into IP addresses (and back)', true, 'The phone book.'],
    ['Assigning IP addresses', false, 'DHCP.'],
    ['Routing between networks', false, 'Routers.'],
    ['Synchronizing clocks', false, 'NTP.'],
  ], 'DNS is a distributed database of names. Clients ask a resolver, which answers from cache or walks the hierarchy (root, top-level domain, authoritative) to find the record.'),
  Q('b4-dh-14', 'IPS', 't4-dhcp-dns', 'A user can reach 10.1.50.20 by IP but not portal.example.com. nslookup returns a different address. What is wrong?', [
    ['The DNS A record for portal.example.com points to the wrong address', true, 'Name resolves, to the wrong place.'],
    ['DHCP is broken', false, 'The user has connectivity.'],
    ['The default gateway is wrong', false, 'The IP works.'],
    ['NTP is off', false, 'Unrelated.'],
  ], 'If the name resolves but to the wrong address, the record is wrong (or stale in a cache). Fix the A record on the authoritative server; clients pick up the change as cached entries expire (TTL), or immediately after ipconfig /flushdns.'),
  Q('b4-dh-15', 'IPS', 't4-dhcp-dns', 'Where should ip helper-address be configured for router-on-a-stick with clients in VLANs 10 and 20?', [
    ['On each client VLAN subinterface (g0/0.10 and g0/0.20)', true, 'Each VLAN\'s gateway relays its own broadcasts.'],
    ['On the physical g0/0 only', false, 'The subinterfaces receive the broadcasts.'],
    ['On the DHCP server\'s interface', false, 'Wrong side.'],
    ['In global configuration', false, 'It is an interface command.'],
  ], 'The relay goes wherever the client broadcasts arrive: the gateway interface for that VLAN. With SVIs, that means under interface vlan 10, interface vlan 20 and so on.', { console: true }),
  Q('b4-dh-16', 'IPS', 't4-dhcp-dns', 'How does a DHCP server know which pool to use for a relayed request?', [
    ['From the giaddr field: the relay inserts its own interface address, which falls in one pool\'s network', true, 'Gateway IP address.'],
    ['From the client\'s MAC', false, 'Not for pool choice.'],
    ['It picks a pool at random', false, 'No.'],
    ['From DNS', false, 'No.'],
  ], 'The relay agent sets giaddr to the address of the interface the request came in on, for example 10.1.20.1. The server picks the pool whose network contains it, so every client VLAN needs a matching pool.'),
  Q('b4-dh-17', 'IPS', 't4-dhcp-dns', 'This router should lease addresses but clients get none. What is wrong with the pool?', [
    ['The network is 10.1.30.0/24, but the clients\' gateway is 10.1.20.1, so no pool matches VLAN 20', true, 'Pool network must match the subnet.'],
    ['The lease is too long', false, 'Lease length does not stop leasing.'],
    ['DNS servers are optional, so that is not it', false, 'Correct, but the network is the issue.'],
    ['Excluded addresses must be in the pool', false, 'Exclusions are separate.'],
  ], 'The server matches requests to pools by subnet. A pool for 10.1.30.0/24 never answers clients relayed from 10.1.20.1. Correct the network line.', {
    exhibit: X(`
ip dhcp excluded-address 10.1.20.1 10.1.20.10
ip dhcp pool VLAN20
 network 10.1.30.0 255.255.255.0
 default-router 10.1.20.1
 dns-server 10.1.1.53
interface GigabitEthernet0/0.20
 ip address 10.1.20.1 255.255.255.0`,
      ['network 10.1.30.0 255.255.255.0', 'fail', 'Wrong pool network'], [/10\.1\.20\.1(?= |$)/m, 'gw'], ['10.1.1.53', 'dns'], ['GigabitEthernet0/0.20', 'iface'], [/10\.1\.20\.10/, 'ip']),
  }),
  Q('b4-dh-18', 'IPS', 't4-dhcp-dns', 'What does a CNAME record do?', [
    ['Makes one name an alias of another name', true, 'Canonical name.'],
    ['Maps a name to an IPv4 address', false, 'That is A.'],
    ['Names the mail server', false, 'That is MX.'],
    ['Maps an address to a name', false, 'That is PTR.'],
  ], 'www.example.com might be a CNAME for web01.example.com, so the server can change without touching every reference. The resolver follows the alias to the target\'s A or AAAA record.'),

  // ---------- t4-snmp ----------
  Q('b4-snmp-01', 'IPS', 't4-snmp', 'Which SNMP components are matched correctly? (Choose two.)', [
    ['The manager (NMS) polls devices and receives traps', true, 'The monitoring system.'],
    ['The agent runs on the device and answers with values from its MIB', true, 'On the router or switch.'],
    ['The MIB is the network cable used by SNMP', false, 'It is a database of variables.'],
    ['The agent sends Get requests to the manager', false, 'The manager sends Gets.'],
  ], 'SNMP has a manager (the NMS), agents on devices, and the MIB, a tree of variables each named by an OID. Managers Get or Set values; agents send Traps or Informs when something happens.'),
  Q('b4-snmp-02', 'IPS', 't4-snmp', 'Which SNMP version adds authentication and encryption?', [
    ['SNMPv3', true, 'Users with auth and priv.'],
    ['SNMPv2c', false, 'Community strings in clear text.'],
    ['SNMPv1', false, 'Community strings in clear text.'],
    ['SNMPv2c with a long community', false, 'Still clear text.'],
  ], 'v1 and v2c authenticate only with community strings sent in clear text. v3 uses usernames with security levels: noAuthNoPriv, authNoPriv (hashing), authPriv (hashing plus encryption, the one to choose).'),
  Q('b4-snmp-03', 'IPS', 't4-snmp', 'Which ports does SNMP use?', [
    ['UDP 161 to agents for polling, UDP 162 to the manager for traps and informs', true, 'Both UDP.'],
    ['TCP 161 and 162', false, 'SNMP uses UDP.'],
    ['UDP 514', false, 'Syslog.'],
    ['UDP 123', false, 'NTP.'],
  ], 'Firewalls between the NMS and devices must allow UDP 161 inbound to devices and UDP 162 back to the manager, or polling and alerts silently fail.'),
  Q('b4-snmp-04', 'IPS', 't4-snmp', 'What is the difference between an SNMP trap and an inform?', [
    ['An inform is acknowledged by the manager and resent if lost; a trap is not', true, 'Reliability.'],
    ['Traps are encrypted; informs are not', false, 'Encryption depends on version.'],
    ['Informs go from manager to agent', false, 'Both go agent to manager.'],
    ['They are identical', false, 'Acknowledgment differs.'],
  ], 'Traps are fire and forget over UDP. Informs (v2c and v3) wait for an acknowledgment and retry, so an important alert is not lost to a single dropped packet.'),
  Q('b4-snmp-05', 'IPS', 't4-snmp', 'Which command allows read-only SNMPv2c polling with community string M0nitor, limited to hosts in ACL 10?', [
    ['snmp-server community M0nitor RO 10', true, 'RO plus an ACL.'],
    ['snmp-server community M0nitor RW', false, 'Read-write, and no ACL.'],
    ['snmp-server host M0nitor 10', false, 'host is for traps.'],
    ['snmp community read M0nitor', false, 'Not valid.'],
  ], 'Read-only communities let the NMS read counters and status; read-write ones can change configuration and should be avoided. Always restrict communities with an ACL of NMS addresses, and prefer SNMPv3.', { console: true }),
  Q('b4-snmp-06', 'IPS', 't4-snmp', 'What does an SNMP Get request do?', [
    ['Asks an agent for the value of a specific OID', true, 'Polling.'],
    ['Changes a value on the agent', false, 'That is Set.'],
    ['Sends an alert to the manager', false, 'That is a Trap.'],
    ['Downloads the MIB', false, 'No.'],
  ], 'Get reads one OID, GetNext walks to the next one, GetBulk (v2c and later) retrieves many at once, and Set writes a value. An NMS graphs interface traffic by polling counters with Get every few minutes.'),
  Q('b4-snmp-07', 'IPS', 't4-snmp', 'Which SNMPv3 security level provides both authentication and encryption?', [
    ['authPriv', true, 'Auth plus privacy.'],
    ['authNoPriv', false, 'Auth only.'],
    ['noAuthNoPriv', false, 'Neither.'],
    ['privNoAuth', false, 'Not a level.'],
  ], 'Configure a group with snmp-server group NAME v3 priv and a user with snmp-server user USER NAME v3 auth sha PASS priv aes 128 KEY. That gives authPriv: integrity and confidentiality.', { console: true }),
  Q('b4-snmp-08', 'IPS', 't4-snmp', 'Which command sends SNMP traps to an NMS at 10.1.1.60 using v2c?', [
    ['snmp-server host 10.1.1.60 version 2c M0nitor', true, 'Trap destination.'],
    ['snmp-server community 10.1.1.60', false, 'Sets a community string.'],
    ['logging host 10.1.1.60', false, 'Syslog.'],
    ['snmp-server trap 10.1.1.60', false, 'Not valid.'],
  ], 'snmp-server host names where traps go; snmp-server enable traps chooses which events generate them. Without the host line, traps have nowhere to go.', { console: true }),
  Q('b4-snmp-09', 'IPS', 't4-snmp', 'What identifies a single variable, such as an interface\'s input octets, in SNMP?', [
    ['An OID, a dotted number in the MIB tree', true, 'Object identifier.'],
    ['A community string', false, 'Authentication for v1/v2c.'],
    ['A port number', false, 'No.'],
    ['A VLAN ID', false, 'No.'],
  ], 'Every MIB object has an OID such as 1.3.6.1.2.1.2.2.1.10 (ifInOctets). The NMS asks for OIDs; human-readable names come from MIB files loaded on the NMS.'),
  Q('b4-snmp-10', 'IPS', 't4-snmp', 'Why is SNMP useful in network operations?', [
    ['It collects health and performance data from many devices centrally and raises alerts on events', true, 'Monitoring at scale.'],
    ['It routes packets', false, 'No.'],
    ['It replaces syslog', false, 'They complement each other.'],
    ['It assigns addresses', false, 'No.'],
  ], 'SNMP lets one system graph bandwidth, CPU and errors on every device and alert when links drop. Newer networks add streaming telemetry and APIs, but SNMP remains the common denominator.'),

  // ---------- t4-qos ----------
  Q('b4-qos-01', 'IPS', 't4-qos', 'Which DSCP marking is standard for voice traffic?', [
    ['EF (46)', true, 'Expedited forwarding.'],
    ['AF41 (34)', false, 'Interactive video.'],
    ['CS1 (8)', false, 'Scavenger.'],
    ['Default (0)', false, 'Best effort.'],
  ], 'Common markings: EF 46 for voice bearer, AF41 34 for interactive video, CS3 24 for call signaling, AF2x and AF3x for business data, CS1 for scavenger, 0 for best effort.'),
  Q('b4-qos-02', 'IPS', 't4-qos', 'What is the difference between policing and shaping?', [
    ['Policing drops or re-marks traffic above the rate; shaping buffers it and sends it later', true, 'Drop versus delay.'],
    ['Shaping drops traffic; policing delays it', false, 'Reversed.'],
    ['They are the same', false, 'Different behavior.'],
    ['Policing only works on wireless', false, 'No.'],
  ], 'A policer enforces a rate instantly, so excess is lost or remarked; it can work inbound or outbound. A shaper smooths bursts with a queue, adding delay; it works outbound, typically to match a provider\'s contracted rate.'),
  Q('b4-qos-03', 'IPS', 't4-qos', 'Which queuing method gives voice a strict-priority queue while sharing the rest of the bandwidth among classes?', [
    ['LLQ (low latency queuing)', true, 'A priority queue plus CBWFQ.'],
    ['FIFO', false, 'One queue, no priority.'],
    ['WRED', false, 'Congestion avoidance, not a queue.'],
    ['Round robin only', false, 'No strict priority.'],
  ], 'LLQ adds a policed priority queue to class-based weighted fair queuing. Voice leaves first (up to its limit), and other classes share the rest by guaranteed bandwidth.'),
  Q('b4-qos-04', 'IPS', 't4-qos', 'What are typical one-way limits for good voice quality?', [
    ['Delay under 150 ms, jitter under 30 ms, loss under 1%', true, 'Common design targets.'],
    ['Delay under 1 second', false, 'Far too slow.'],
    ['Any delay is fine if bandwidth is high', false, 'Delay and jitter matter.'],
    ['Loss up to 10%', false, 'Calls would be unusable.'],
  ], 'Voice cares about delay, jitter and loss more than bandwidth (a call is under 100 kb/s). QoS keeps voice ahead of bulk traffic so those targets hold during congestion.'),
  Q('b4-qos-05', 'IPS', 't4-qos', 'Where is a QoS trust boundary usually placed?', [
    ['At the access edge, such as the switch port of a trusted IP phone', true, 'Trust markings from known devices only.'],
    ['At the internet edge only', false, 'Too late; markings inside would be untrusted.'],
    ['On every PC', false, 'Users could mark everything high.'],
    ['Nowhere; trust everything', false, 'Users could abuse it.'],
  ], 'Markings are only useful if they are honest. Trust them as close to the source as possible from devices you control (phones), and re-mark everything else at the edge.'),
  Q('b4-qos-06', 'IPS', 't4-qos', 'In AF31 versus AF33, what does the second digit mean?', [
    ['Drop precedence: AF33 is dropped before AF31 under congestion', true, 'Higher second digit, dropped first.'],
    ['Priority: AF33 is sent first', false, 'Same class, different drop probability.'],
    ['The VLAN', false, 'No.'],
    ['Nothing', false, 'It matters.'],
  ], 'AFxy: x is the class (queue), y is drop precedence 1 to 3. Within class 3, AF33 traffic is discarded first by WRED when the queue fills, protecting AF31.'),
  Q('b4-qos-07', 'IPS', 't4-qos', 'What does WRED do?', [
    ['Randomly drops some packets early as a queue fills, so TCP flows slow down before the queue overflows', true, 'Congestion avoidance.'],
    ['Gives voice strict priority', false, 'That is LLQ.'],
    ['Marks packets', false, 'Marking is separate.'],
    ['Encrypts traffic', false, 'No.'],
  ], 'Tail drop discards everything once a queue is full, which makes many TCP flows back off together (global synchronization). WRED starts dropping a few packets early, favoring lower drop precedence, to keep the queue from filling.'),
  Q('b4-qos-08', 'IPS', 't4-qos', 'Which field carries QoS priority in an 802.1Q-tagged frame?', [
    ['The 3-bit PCP (CoS) field', true, 'Class of Service 0 to 7.'],
    ['The DSCP field', false, 'That is in the IP header.'],
    ['The TTL', false, 'No.'],
    ['The EtherType', false, 'No.'],
  ], 'CoS lives in the 802.1Q tag, so it exists only on trunks and is lost at a router. DSCP lives in the IP header and survives end to end. Switches often map between them (voice CoS 5 to DSCP EF).'),
  Q('b4-qos-09', 'IPS', 't4-qos', 'Which QoS step identifies traffic types, for example by ACL or NBAR?', [
    ['Classification', true, 'Sorting traffic into classes.'],
    ['Queuing', false, 'Scheduling.'],
    ['Shaping', false, 'Rate control.'],
    ['Policing', false, 'Rate enforcement.'],
  ], 'Classification decides what a packet is; marking writes that decision into DSCP or CoS so later devices do not have to classify again; queuing and dropping act on the marks.'),
  Q('b4-qos-10', 'IPS', 't4-qos', 'When does queuing matter on an interface?', [
    ['Only when traffic arrives faster than the interface can send (congestion)', true, 'No congestion, no queue.'],
    ['Always, equally', false, 'An idle link sends packets immediately.'],
    ['Only on wireless', false, 'Any interface can congest.'],
    ['Only for UDP', false, 'Any traffic.'],
  ], 'If the link has spare capacity, packets go straight out and QoS changes nothing. The classic congestion point is the LAN-to-WAN edge, where 1 Gb/s meets a 50 Mb/s circuit.'),
  Q('b4-qos-11', 'IPS', 't4-qos', 'How many bits is the DSCP field?', [
    ['6', true, '64 values.'],
    ['3', false, 'That is IP precedence and CoS.'],
    ['8', false, 'The whole ToS byte, which also holds ECN.'],
    ['12', false, 'That is the VLAN ID.'],
  ], 'The old ToS byte holds DSCP (6 bits, the top three overlapping IP precedence) and ECN (2 bits). DSCP gives 64 code points, of which a handful (EF, AFxy, CSx, default) are standard.'),
  Q('b4-qos-12', 'IPS', 't4-qos', 'What is a per-hop behavior (PHB)?', [
    ['How each router treats packets of a given marking, such as EF getting priority queuing', true, 'DiffServ is applied hop by hop.'],
    ['The path a packet takes', false, 'That is routing.'],
    ['The TTL value', false, 'No.'],
    ['A routing protocol', false, 'No.'],
  ], 'DiffServ does not reserve anything end to end. Each device independently applies the treatment its configuration assigns to each marking, which is why consistent policy on every hop matters.'),
  Q('b4-qos-13', 'IPS', 't4-qos', 'Which traffic type is most sensitive to jitter?', [
    ['Live voice calls', true, 'Variable delay breaks playback.'],
    ['Email', false, 'Tolerant.'],
    ['File transfer', false, 'Tolerant.'],
    ['Software updates', false, 'Tolerant.'],
  ], 'Voice and video play out live: a jitter buffer absorbs small variations, but large swings cause gaps. Bulk TCP transfers just take a little longer.'),
  Q('b4-qos-14', 'IPS', 't4-qos', 'A provider sells a 100 Mb/s service on a 1 Gb/s port and drops anything above 100 Mb/s. What should the customer router do?', [
    ['Shape outbound traffic to 100 Mb/s, so it queues locally with its own priorities instead of being dropped by the provider', true, 'Shaping matches the contract.'],
    ['Police inbound to 1 Gb/s', false, 'Wrong direction and rate.'],
    ['Disable QoS', false, 'Drops would be random.'],
    ['Mark everything EF', false, 'Defeats prioritization.'],
  ], 'If you exceed the contract, the provider\'s policer drops packets without regard to your priorities. Shaping to the contracted rate moves the congestion onto your router, where LLQ can protect voice.'),

  // ---------- t4-files ----------
  Q('b4-file-01', 'IPS', 't4-files', 'Which statement compares TFTP and FTP correctly?', [
    ['TFTP uses UDP 69 with no authentication; FTP uses TCP 20/21 with a username and password', true, 'Simplicity versus features.'],
    ['TFTP is encrypted; FTP is not', false, 'Neither is encrypted.'],
    ['FTP uses UDP 69', false, 'That is TFTP.'],
    ['TFTP supports directory listings', false, 'It does not.'],
  ], 'TFTP is tiny and connectionless, good for copying IOS images and configs inside a trusted network. FTP adds logins, directory listings and TCP reliability. Both send credentials and data in clear text; SCP and SFTP are the secure choices.'),
  Q('b4-file-02', 'IPS', 't4-files', 'Which command copies a new IOS image from a TFTP server to flash?', [
    ['copy tftp: flash:', true, 'IOS prompts for server and file names.'],
    ['copy flash: tftp:', false, 'That uploads from flash.'],
    ['tftp get flash', false, 'Not valid.'],
    ['boot tftp', false, 'Not the copy command.'],
  ], 'Check free space with show flash: first, copy the image, verify it (verify /md5), set boot system to the new file, save and reload in a maintenance window.', { console: true }),
  Q('b4-file-03', 'IPS', 't4-files', 'Which commands set the credentials a router uses when copying to an FTP server? (Choose two.)', [
    ['ip ftp username backup', true, 'FTP login name.'],
    ['ip ftp password Bk2026!', true, 'FTP password.'],
    ['ip tftp username backup', false, 'TFTP has no login.'],
    ['username backup secret ...', false, 'That is a local login account.'],
  ], 'With ip ftp username and password configured, copy running-config ftp: logs in automatically. Alternatively embed them in the URL (ftp://user:pass@server/file), which then shows in history.', { console: true }),
  Q('b4-file-04', 'IPS', 't4-files', 'Why is TFTP still widely used despite having no security?', [
    ['It is simple and small enough to run in boot code and on network devices, for images and configs on trusted networks', true, 'Simplicity.'],
    ['It is faster than every other protocol', false, 'Lock-step transfers are slow.'],
    ['It encrypts transfers', false, 'It does not.'],
    ['It is required by the exam', false, 'Not a reason.'],
  ], 'TFTP needs no login and almost no code, which is why PXE boot, IP phones and ROMMON use it. Keep it on management networks and prefer SCP where credentials or confidentiality matter.'),
  Q('b4-file-05', 'IPS', 't4-files', 'Which file transfer method encrypts the session on a Cisco device?', [
    ['SCP (copy ... scp:)', true, 'Runs over SSH.'],
    ['TFTP', false, 'Clear text, no auth.'],
    ['FTP', false, 'Clear text.'],
    ['HTTP', false, 'Clear text.'],
  ], 'SCP rides on SSH, so the same keys and users protect file transfers. Enable the server side with ip scp server enable to let an admin push images to the device securely.'),
  Q('b4-file-06', 'IPS', 't4-files', 'An FTP transfer from a router fails through a firewall that allows only TCP 21. Why?', [
    ['FTP opens a separate data connection (TCP 20 in active mode, or a negotiated port in passive mode)', true, 'Control and data are separate.'],
    ['FTP uses UDP', false, 'It uses TCP.'],
    ['FTP needs port 69', false, 'That is TFTP.'],
    ['FTP cannot cross firewalls', false, 'It can with the data channel allowed or inspected.'],
  ], 'Port 21 carries only commands. Files move over a second connection. Firewalls either inspect FTP to open the data port dynamically or must allow it explicitly; passive mode is the usual workaround for clients behind NAT.'),
];
