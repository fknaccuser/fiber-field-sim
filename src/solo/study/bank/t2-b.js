// Tree 2, Network Access, part B: Rapid PVST+, wireless architectures and
// AP modes, WLC connections and WLAN setup in the GUI, and device
// management access methods.

import { Q, X } from './qb.js';

const STP_OUT = `
SW2#show spanning-tree vlan 10
VLAN0010
  Spanning tree enabled protocol rstp
  Root ID    Priority    24586
             Address     0019.e8a1.1100
             Cost        4
             Port        1 (GigabitEthernet0/1)
             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec

  Bridge ID  Priority    32778  (priority 32768 sys-id-ext 10)
             Address     0019.e8a1.2200

Interface           Role Sts Cost      Prio.Nbr Type
------------------- ---- --- --------- -------- --------------------------------
Gi0/1               Root FWD 4         128.1    P2p
Gi0/2               Altn BLK 4         128.2    P2p
Gi0/3               Desg FWD 19        128.3    P2p Edge`;
const STP_MARKS = [
  ['show spanning-tree vlan 10', 'cmd'], ['VLAN0010', 'vlan'], ['24586', 'key', 'Root bridge priority'], ['0019.e8a1.1100', 'mac', 'Root bridge MAC'],
  ['32778', 'key', 'This switch\'s priority'], ['0019.e8a1.2200', 'mac', 'This switch\'s MAC'], [/Gi0\/\d/, 'iface'],
  [/Root FWD/, 'ok', 'Root port, forwarding'], [/Altn BLK/, 'fail', 'Alternate, blocking'], [/Desg FWD/, 'role', 'Designated, forwarding'], ['Edge', 'key', 'PortFast edge port'],
];

export const T2_B = [
  // ---------- t2-stp ----------
  Q('b2-stp-01', 'NA', 't2-stp', 'How is the root bridge elected?', [
    ['Lowest bridge ID: priority first, then lowest MAC address', true, 'Lower wins.'],
    ['Highest bridge ID', false, 'Lowest wins.'],
    ['The switch with the most ports', false, 'Port count is irrelevant.'],
    ['The first switch powered on', false, 'Timing does not decide it.'],
  ], 'Every switch starts by claiming to be root. BPDUs with a lower bridge ID win. Priority (default 32768 plus the VLAN number in PVST+) is compared first, and the MAC breaks ties, which is why an old switch with a low MAC can win by accident.'),
  Q('b2-stp-02', 'NA', 't2-stp', 'Using this output, which switch is the root for VLAN 10 and which port on SW2 is blocking?', [
    ['The switch with MAC 0019.e8a1.1100 is root; Gi0/2 is blocking', true, 'Root ID differs from Bridge ID; Gi0/2 is Altn BLK.'],
    ['SW2 is root; Gi0/1 is blocking', false, 'SW2\'s bridge ID differs from the root ID, and Gi0/1 forwards.'],
    ['SW2 is root; nothing is blocking', false, 'Gi0/2 is blocking.'],
    ['The root is unknown', false, 'The Root ID block names it.'],
  ], 'Compare Root ID with Bridge ID: if they match, this switch is root (and the output says "This bridge is the root"). Here they differ, so the root is the 0019.e8a1.1100 switch, reached through root port Gi0/1 at cost 4. Gi0/2 is an alternate port, blocking to prevent a loop.', { exhibit: X(STP_OUT, ...STP_MARKS) }),
  Q('b2-stp-03', 'NA', 't2-stp', 'In the same output, what does the Bridge ID priority 32778 mean?', [
    ['Default priority 32768 plus the VLAN ID 10 (system ID extension)', true, 'PVST+ adds the VLAN number.'],
    ['Someone set the priority to 32778', false, 'Priority must be a multiple of 4096.'],
    ['It is the port cost', false, 'Cost is listed separately.'],
    ['It is the root\'s priority', false, 'That is 24586.'],
  ], 'With per-VLAN spanning tree, the 12-bit system ID extension carries the VLAN, so the advertised priority is the configured priority (a multiple of 4096) plus the VLAN number. The root shows 24586, which is 24576 plus 10, typical of spanning-tree vlan 10 root primary.', { exhibit: X(STP_OUT, ...STP_MARKS) }),
  Q('b2-stp-04', 'NA', 't2-stp', 'Which command makes a switch the root bridge for VLAN 10?', [
    ['spanning-tree vlan 10 root primary', true, 'Sets 24576, or lower than the current root.'],
    ['spanning-tree vlan 10 priority 32768', false, 'That is the default; it would not win.'],
    ['spanning-tree root vlan 10', false, 'Not valid syntax.'],
    ['spanning-tree portfast', false, 'Unrelated.'],
  ], 'root primary is a macro: it sets priority 24576, or 4096 below the current root if that is already lower. root secondary sets 28672 for a backup root. spanning-tree vlan 10 priority 4096 sets a value directly; it must be a multiple of 4096.', { console: true }),
  Q('b2-stp-05', 'NA', 't2-stp', 'What are the default short-mode STP port costs for 100 Mb/s, 1 Gb/s and 10 Gb/s links?', [
    ['19, 4 and 2', true, 'IEEE short costs.'],
    ['100, 19 and 4', false, '100 is 10 Mb/s.'],
    ['10, 1 and 0.1', false, 'Not STP costs.'],
    ['1, 1 and 1', false, 'Those resemble OSPF with default reference bandwidth.'],
  ], 'Short-mode costs: 10 Mb/s 100, 100 Mb/s 19, 1 Gb/s 4, 10 Gb/s 2. Root path cost is the sum along the path. Long mode (spanning-tree pathcost method long) uses larger numbers that scale to faster links.'),
  Q('b2-stp-06', 'NA', 't2-stp', 'A non-root switch has two paths to the root with equal cost. What breaks the tie for the root port?', [
    ['The lowest sender bridge ID, then the lowest sender port ID', true, 'The standard tiebreakers.'],
    ['The highest MAC address', false, 'Lower wins.'],
    ['The port with the most traffic', false, 'Traffic is not considered.'],
    ['Random choice', false, 'The process is deterministic.'],
  ], 'Root port selection: lowest root path cost, then lowest neighbor (sender) bridge ID, then lowest neighbor port priority and number. Knowing the order lets you predict which uplink forwards.'),
  Q('b2-stp-07', 'NA', 't2-stp', 'What does PortFast do?', [
    ['Moves an access port straight to forwarding, skipping listening and learning', true, 'For end devices.'],
    ['Increases port speed', false, 'Speed is unaffected.'],
    ['Bundles ports', false, 'That is EtherChannel.'],
    ['Blocks BPDUs', false, 'That is BPDU filter.'],
  ], 'Without PortFast a new connection waits about 30 seconds (802.1D) before forwarding, long enough for DHCP to time out. PortFast skips that on edge ports to PCs, printers and phones. Never enable it on ports to switches.', { console: true }),
  Q('b2-stp-08', 'NA', 't2-stp', 'A user plugs a small switch into a PortFast port with BPDU Guard enabled. What happens?', [
    ['The port receives a BPDU and goes err-disabled', true, 'BPDU Guard shuts it down.'],
    ['The new switch becomes root', false, 'BPDU Guard stops it before that.'],
    ['Nothing; PortFast ignores BPDUs', false, 'BPDU Guard reacts to them.'],
    ['The port moves to VLAN 1', false, 'Not a BPDU Guard action.'],
  ], 'BPDU Guard protects edge ports: any BPDU means a switch was connected, so the port is err-disabled to prevent a loop or a rogue root. Recover by removing the device and bouncing the port, or configure errdisable recovery.'),
  Q('b2-stp-09', 'NA', 't2-stp', 'Which feature stops a port from ever becoming a root port, protecting the planned root location?', [
    ['Root Guard', true, 'Superior BPDUs put the port in root-inconsistent state.'],
    ['BPDU Guard', false, 'Err-disables on any BPDU.'],
    ['Loop Guard', false, 'Reacts to missing BPDUs.'],
    ['PortFast', false, 'Speeds up edge ports.'],
  ], 'Root Guard goes on designated ports facing switches that should never become root, such as distribution ports toward access switches. If a superior BPDU arrives, the port is blocked (root-inconsistent) until the superior BPDUs stop.'),
  Q('b2-stp-10', 'NA', 't2-stp', 'What does Loop Guard protect against?', [
    ['A blocking port moving to forwarding because BPDUs stopped arriving, as with a unidirectional link', true, 'It puts the port in loop-inconsistent state instead.'],
    ['Users plugging in rogue switches', false, 'That is BPDU Guard.'],
    ['A rogue root bridge', false, 'That is Root Guard.'],
    ['MAC flooding', false, 'That is port security.'],
  ], 'If a fiber pair fails in one direction, a blocking port stops hearing BPDUs, assumes the path is gone and starts forwarding, creating a loop. Loop Guard keeps it blocked (loop-inconsistent) until BPDUs return.'),
  Q('b2-stp-11', 'NA', 't2-stp', 'What does BPDU Filter do when enabled on an interface?', [
    ['Stops sending and receiving BPDUs, effectively turning STP off on that port', true, 'Dangerous if a switch is connected.'],
    ['Err-disables the port on a BPDU', false, 'That is BPDU Guard.'],
    ['Blocks superior BPDUs only', false, 'That is Root Guard.'],
    ['Encrypts BPDUs', false, 'BPDUs are not encrypted.'],
  ], 'Configured per interface, BPDU Filter silences STP on that port, so a loop through it goes unnoticed. Configured globally with portfast bpdufilter default, it is gentler: a PortFast port that receives a BPDU loses PortFast and runs STP normally.'),
  Q('b2-stp-12', 'NA', 't2-stp', 'Which RSTP port role is a backup path to the root that is currently discarding?', [
    ['Alternate', true, 'A second path toward the root.'],
    ['Designated', false, 'Forwards onto a segment.'],
    ['Root', false, 'The best path to root.'],
    ['Disabled', false, 'Administratively off.'],
  ], 'RSTP roles: root (best path to root), designated (forwards on a segment), alternate (backup path to root, discarding), backup (backup designated on a shared segment, rare). An alternate port can take over as root port almost instantly.'),
  Q('b2-stp-13', 'NA', 't2-stp', 'Which are the RSTP port states?', [
    ['Discarding, learning, forwarding', true, 'RSTP merges blocking, listening and disabled into discarding.'],
    ['Blocking, listening, learning, forwarding', false, 'That is 802.1D.'],
    ['Up, down, err-disabled', false, 'Interface states.'],
    ['Active, standby, listen', false, 'HSRP states.'],
  ], '802.1D had blocking, listening, learning, forwarding and disabled. RSTP simplifies to discarding, learning and forwarding, and uses handshakes on point-to-point links to converge in about a second instead of 30 to 50.'),
  Q('b2-stp-14', 'NA', 't2-stp', 'What are the 802.1D default timers?', [
    ['Hello 2 s, forward delay 15 s, max age 20 s', true, 'Classic STP timers.'],
    ['Hello 10 s, dead 40 s', false, 'OSPF timers.'],
    ['Hello 3 s, hold 10 s', false, 'HSRP timers.'],
    ['Hello 60 s, hold 180 s', false, 'CDP timers.'],
  ], 'BPDUs are sent every 2 seconds. A blocked port waits up to 20 seconds of max age, then 15 seconds listening and 15 learning: 30 to 50 seconds in total. RSTP replaces most of that waiting with explicit agreements.'),
  Q('b2-stp-15', 'NA', 't2-stp', 'Which command enables Rapid PVST+?', [
    ['spanning-tree mode rapid-pvst', true, 'Global command.'],
    ['spanning-tree rapid', false, 'Not valid.'],
    ['spanning-tree mode mst', false, 'That is Multiple Spanning Tree.'],
    ['spanning-tree vlan 1 rstp', false, 'Not valid.'],
  ], 'Rapid PVST+ runs a separate RSTP instance for each VLAN, so you can make different switches root for different VLANs to share load across uplinks. show spanning-tree confirms "protocol rstp".', { console: true }),
  Q('b2-stp-16', 'NA', 't2-stp', 'Why does a network need spanning tree?', [
    ['To prevent Layer 2 loops, which cause broadcast storms and MAC table instability', true, 'Ethernet frames have no TTL.'],
    ['To route between VLANs', false, 'That is Layer 3.'],
    ['To assign IP addresses', false, 'That is DHCP.'],
    ['To encrypt frames', false, 'Not its job.'],
  ], 'Redundant switch links create loops. Frames have no TTL, so a broadcast circles forever, multiplying until the network melts, and MAC tables flap. STP blocks just enough ports to leave a loop-free tree, and unblocks them if the active path fails.'),
  Q('b2-stp-17', 'NA', 't2-stp', 'In the output, what kind of port is Gi0/3?', [
    ['A designated, forwarding edge port (PortFast), likely to an end device', true, 'Desg FWD with Edge.'],
    ['The root port', false, 'That is Gi0/1.'],
    ['A blocking port', false, 'That is Gi0/2.'],
    ['A trunk to the root', false, 'Edge marks a host-facing port.'],
  ], 'The Type column shows P2p for point-to-point full-duplex links and Edge for PortFast ports. Its cost of 19 tells you it runs at 100 Mb/s, typical of a printer or phone.', { exhibit: X(STP_OUT, ...STP_MARKS) }),
  Q('b2-stp-18', 'NA', 't2-stp', 'Which command enables PortFast on every access port by default?', [
    ['spanning-tree portfast default', true, 'Global, applies to non-trunk ports.'],
    ['spanning-tree portfast all', false, 'Not valid.'],
    ['interface range all, spanning-tree portfast', false, 'Not valid syntax.'],
    ['spanning-tree mode portfast', false, 'Not valid.'],
  ], 'spanning-tree portfast default turns PortFast on for all access ports, and spanning-tree portfast bpduguard default adds BPDU Guard to every PortFast port. Together they are a common access-switch baseline.', { console: true }),
  Q('b2-stp-19', 'NA', 't2-stp', 'Which value is a valid bridge priority to configure?', [
    ['8192', true, 'A multiple of 4096.'],
    ['8000', false, 'Not a multiple of 4096.'],
    ['32769', false, 'Priority plus VLAN is advertised, but you configure multiples of 4096.'],
    ['65536', false, 'Out of range; the maximum is 61440.'],
  ], 'Because 12 bits carry the VLAN, only the top 4 bits of priority are configurable: 0, 4096, 8192 up to 61440. IOS rejects other values and lists the allowed ones.', { console: true }),
  Q('b2-stp-20', 'NA', 't2-stp', 'A port shows "BKN*" and "*ROOT_Inc" in show spanning-tree. What happened?', [
    ['Root Guard blocked the port because a superior BPDU arrived on it', true, 'Root-inconsistent state.'],
    ['BPDU Guard err-disabled it', false, 'That shows err-disabled.'],
    ['The cable is unplugged', false, 'The port would not be listed in STP.'],
    ['It is the root port', false, 'The opposite.'],
  ], 'Root-inconsistent (ROOT_Inc) is Root Guard doing its job: a device behind the port claimed a better bridge ID. The port recovers by itself once those superior BPDUs stop. Find out why a downstream switch has a low priority.', { console: true }),
  Q('b2-stp-21', 'NA', 't2-stp', 'SW3, an old access switch, became root for VLAN 1 after a reboot of the core. Why might that happen?', [
    ['All switches have default priority, so the lowest MAC (often the oldest switch) wins', true, 'Nobody set priorities.'],
    ['Access switches always become root', false, 'Only by the lowest bridge ID.'],
    ['The core uses PortFast', false, 'Unrelated.'],
    ['VLAN 1 cannot have a root', false, 'Every VLAN has one.'],
  ], 'With every priority left at 32768, the MAC decides. Older hardware often has lower MACs, and traffic then crosses slow access uplinks. Set spanning-tree vlan X root primary on the core and root secondary on its partner.'),
  Q('b2-stp-22', 'NA', 't2-stp', 'Which port on a root bridge is always designated?', [
    ['Every active port', true, 'The root has no root port.'],
    ['Only the lowest-numbered port', false, 'All of them.'],
    ['None; the root only has root ports', false, 'The root has no root port.'],
    ['Only trunk ports', false, 'All forwarding ports.'],
  ], 'A root bridge is the reference point, so it has zero root path cost and no root port; all its ports are designated and forwarding. Non-root switches have one root port each.'),
  Q('b2-stp-23', 'NA', 't2-stp', 'What does "This bridge is the root" in show spanning-tree tell you?', [
    ['This switch has the lowest bridge ID for the VLAN and is its root', true, 'Root ID matches Bridge ID.'],
    ['This switch has a root port', false, 'A root has none.'],
    ['STP is disabled', false, 'STP is running.'],
    ['The switch is the default gateway', false, 'Unrelated to routing.'],
  ], 'On the root, the Root ID and Bridge ID blocks are identical and IOS prints "This bridge is the root". Check that the line appears on the switch you intended, typically a distribution or core switch.', { console: true }),
  Q('b2-stp-24', 'NA', 't2-stp', 'Which two port types should not have PortFast enabled? (Choose two.)', [
    ['Ports to other switches', true, 'Could create a temporary loop.'],
    ['Trunks to switches', true, 'Same risk.'],
    ['Ports to PCs', false, 'The intended use.'],
    ['Ports to printers', false, 'End devices are fine.'],
  ], 'PortFast skips loop checks, so it belongs only on edge ports to end hosts. On links to switches or bridges it can forward before STP has decided, causing a loop. Trunks to virtualization hosts may use spanning-tree portfast trunk, carefully.'),

  // ---------- t2-wlan-arch ----------
  Q('b2-wla-01', 'NA', 't2-wlan-arch', 'In a split-MAC architecture, what does the lightweight AP handle and what does the WLC handle?', [
    ['The AP handles time-critical radio functions (beacons, ACKs, encryption); the WLC handles management, authentication, roaming and RF policy', true, 'Split between time-sensitive and centralized work.'],
    ['The AP does everything; the WLC only stores logs', false, 'That describes autonomous APs.'],
    ['The WLC transmits radio frames', false, 'Only APs have radios.'],
    ['The AP handles routing', false, 'Neither routes in this model.'],
  ], 'Split-MAC divides 802.11 work: time-critical tasks stay on the AP, everything that benefits from a central view (who may join, which channel and power, how clients roam) moves to the controller over CAPWAP.'),
  Q('b2-wla-02', 'NA', 't2-wlan-arch', 'Which ports does CAPWAP use between a lightweight AP and its WLC?', [
    ['UDP 5246 for control and UDP 5247 for data', true, 'Control is DTLS-encrypted.'],
    ['TCP 22 and 23', false, 'SSH and Telnet.'],
    ['UDP 161 and 162', false, 'SNMP.'],
    ['TCP 443 only', false, 'HTTPS.'],
  ], 'CAPWAP builds two tunnels: control on UDP 5246 (always encrypted) and data on UDP 5247 (optionally encrypted). Firewalls between APs and the controller must allow both.'),
  Q('b2-wla-03', 'NA', 't2-wlan-arch', 'Which AP mode lets a branch AP switch client traffic locally and keep serving clients if the WAN to the controller fails?', [
    ['FlexConnect', true, 'Local switching at the branch.'],
    ['Local', false, 'Tunnels all data to the WLC.'],
    ['Monitor', false, 'Serves no clients.'],
    ['Sniffer', false, 'Captures traffic only.'],
  ], 'Local mode tunnels client data to the controller. FlexConnect can bridge it onto the branch LAN instead, and in standalone mode keeps existing WLANs running when the controller is unreachable.'),
  Q('b2-wla-04', 'NA', 't2-wlan-arch', 'Which AP mode serves no clients and scans channels for rogue APs and interference?', [
    ['Monitor', true, 'Dedicated scanning.'],
    ['Local', false, 'Serves clients and scans part time.'],
    ['FlexConnect', false, 'Serves clients.'],
    ['Bridge', false, 'Builds mesh links.'],
  ], 'AP modes on a Cisco WLC: local (default), FlexConnect, monitor, rogue detector, sniffer (sends captures to an analyzer), SE-Connect (spectrum analysis) and bridge/mesh. Know what each one does with clients.'),
  Q('b2-wla-05', 'NA', 't2-wlan-arch', 'How is a lightweight AP in local mode usually connected to the switch?', [
    ['To an access port in the AP management VLAN', true, 'Client data is tunneled, so one VLAN is enough.'],
    ['To a trunk carrying every client VLAN', false, 'That is typical for FlexConnect local switching.'],
    ['To the WLC directly', false, 'It connects through the network.'],
    ['To a routed port with no VLAN', false, 'Not the standard design.'],
  ], 'In local mode the AP sends all client data inside CAPWAP to the WLC, so the switch only needs to give the AP itself one VLAN on an access port. The WLC, not the AP, connects to the client VLANs, normally over a trunk.'),
  Q('b2-wla-06', 'NA', 't2-wlan-arch', 'What is an autonomous AP?', [
    ['A standalone AP configured and managed on its own, with no controller', true, 'Each AP holds its own configuration.'],
    ['An AP that powers itself', false, 'Power is a separate matter.'],
    ['An AP managed from the cloud', false, 'That is cloud-based.'],
    ['An AP in monitor mode', false, 'A mode of a lightweight AP.'],
  ], 'Autonomous APs suit very small sites. Every change is made AP by AP, and roaming and RF tuning are not coordinated. Controllers, embedded controllers or cloud dashboards solve that at scale.'),
  Q('b2-wla-07', 'NA', 't2-wlan-arch', 'Which wireless architecture keeps the management plane in a vendor-hosted dashboard while traffic stays local?', [
    ['Cloud-based (such as Meraki)', true, 'Management in the cloud, data local.'],
    ['Autonomous', false, 'Managed per AP.'],
    ['Centralized WLC in local mode', false, 'Data tunnels to an on-site WLC.'],
    ['Mesh only', false, 'A deployment style, not a management model.'],
  ], 'Cloud-managed APs connect out to the dashboard for configuration and monitoring, while client traffic is bridged at the AP. If the internet drops, clients keep working but you cannot change settings.'),
  Q('b2-wla-08', 'NA', 't2-wlan-arch', 'How does a lightweight AP usually find its controller at boot?', [
    ['Through DHCP option 43, DNS (CISCO-CAPWAP-CONTROLLER), broadcast on the local subnet, or a previously known controller', true, 'Several discovery methods.'],
    ['By CDP only', false, 'Not the main method.'],
    ['It must be configured with a console cable', false, 'Discovery is automatic.'],
    ['From the SSID', false, 'SSIDs come from the WLC afterwards.'],
  ], 'A new AP gets an address by DHCP, then looks for controllers: option 43 in the DHCP offer, the DNS name CISCO-CAPWAP-CONTROLLER in its domain, a local broadcast, or controllers it remembers. It then joins over CAPWAP and downloads its configuration.'),
  Q('b2-wla-09', 'NA', 't2-wlan-arch', 'What is an embedded wireless controller?', [
    ['A controller function running on an AP or switch instead of a separate appliance', true, 'For small to mid-size sites.'],
    ['A WLC in the cloud', false, 'That is cloud-managed.'],
    ['An AP with no radios', false, 'Not a definition.'],
    ['A CAPWAP tunnel', false, 'A protocol, not a controller.'],
  ], 'Embedded controllers (such as EWC on Catalyst 9100 APs or on a Catalyst 9300 switch) give smaller sites controller features without buying a dedicated appliance.'),
  Q('b2-wla-10', 'NA', 't2-wlan-arch', 'Which AP mode sends captured 802.11 frames to a remote analyzer such as Wireshark?', [
    ['Sniffer', true, 'Captures on one channel.'],
    ['Monitor', false, 'Scans for rogues and RF data.'],
    ['Local', false, 'Serves clients.'],
    ['Rogue detector', false, 'Looks for rogue clients on the wired side.'],
  ], 'Sniffer mode dedicates the AP to capturing frames on a chosen channel and forwarding them to an analyzer, which is how you troubleshoot a client association problem in detail.'),
  Q('b2-wla-11', 'NA', 't2-wlan-arch', 'In a centralized WLC design, where does client traffic for a local-mode AP enter the wired network?', [
    ['At the WLC, after traveling inside the CAPWAP tunnel', true, 'Tunneled to the controller.'],
    ['At the AP\'s switch port', false, 'That is FlexConnect local switching.'],
    ['At the internet edge', false, 'Too far.'],
    ['It never reaches the wired network', false, 'It does, at the WLC.'],
  ], 'Central switching makes every client appear at the controller, which simplifies policy and roaming but makes the controller\'s uplinks carry all wireless traffic. That is why WLCs connect with multi-gigabit trunks or LAG.'),
  Q('b2-wla-12', 'NA', 't2-wlan-arch', 'Which AP mode creates wireless backhaul links between APs where cabling is not possible?', [
    ['Bridge (mesh)', true, 'APs link to each other wirelessly.'],
    ['FlexConnect', false, 'Local switching.'],
    ['Sniffer', false, 'Captures traffic.'],
    ['Monitor', false, 'Scans RF.'],
  ], 'Mesh or bridge mode lets outdoor and hard-to-cable APs connect back through other APs over the air. A root AP has a wired link and mesh APs reach it wirelessly.'),

  // ---------- t2-wlc ----------
  Q('b2-wlc-01', 'NA', 't2-wlc', 'How should a WLC\'s distribution system ports be connected to the switch for redundancy and bandwidth?', [
    ['As a LAG, with the switch side configured as a static EtherChannel (mode on)', true, 'The WLC does not negotiate LACP or PAgP.'],
    ['As an LACP EtherChannel in active mode', false, 'The WLC does not speak LACP.'],
    ['Each port as a separate access port', false, 'Works but loses LAG benefits.'],
    ['Through the service port', false, 'That is out-of-band management.'],
  ], 'Cisco AireOS controllers bundle their data ports with LAG but run no negotiation protocol, so the switch must use channel-group N mode on, configured as a trunk carrying the management and client VLANs.'),
  Q('b2-wlc-02', 'NA', 't2-wlc', 'Which WLC interface maps a WLAN to a client VLAN on the wired side?', [
    ['A dynamic interface', true, 'One per client VLAN.'],
    ['The management interface', false, 'Controller management and CAPWAP.'],
    ['The virtual interface', false, 'Used for DHCP relay and web auth, not routed.'],
    ['The service port', false, 'Out-of-band management.'],
  ], 'Dynamic interfaces are VLAN interfaces on the controller. Each WLAN is tied to one (or an interface group), which decides the VLAN and subnet its clients land in.'),
  Q('b2-wlc-03', 'NA', 't2-wlc', 'Which WLC port is used only for out-of-band management?', [
    ['The service port', true, 'Separate from client and AP traffic.'],
    ['The distribution system port', false, 'Carries data and management.'],
    ['The redundancy port', false, 'Connects HA controller pairs.'],
    ['The console port', false, 'Serial CLI access, not a network port.'],
  ], 'WLC physical ports: console (serial CLI), service port (out-of-band management network, cannot carry client traffic), distribution system ports (in-band: APs, clients, management) and the redundancy port for high-availability pairs.'),
  Q('b2-wlc-04', 'NA', 't2-wlc', 'In the WLC GUI, which settings create a WPA2-PSK WLAN? (Choose two.)', [
    ['Security tab: Layer 2 security WPA+WPA2, WPA2 policy with AES', true, 'Sets the encryption.'],
    ['Authentication key management: PSK, with the passphrase entered', true, 'Sets the shared key.'],
    ['Security tab: Layer 2 security None', false, 'An open network.'],
    ['Authentication key management: 802.1X', false, 'That is Enterprise.'],
  ], 'Create the WLAN (profile name, SSID, ID), tie it to an interface on the General tab, enable it, then on Security set WPA2 policy with AES (CCMP) encryption and PSK key management with an ASCII passphrase of 8 to 63 characters.'),
  Q('b2-wlc-05', 'NA', 't2-wlc', 'Which WLC QoS profile should a voice WLAN use?', [
    ['Platinum', true, 'Highest priority, for voice.'],
    ['Gold', false, 'For video.'],
    ['Silver', false, 'Best effort, the default.'],
    ['Bronze', false, 'Background.'],
  ], 'Cisco WLC QoS profiles map to 802.11e access categories: Platinum voice, Gold video, Silver best effort (default) and Bronze background. A voice SSID left on Silver will suffer under load.'),
  Q('b2-wlc-06', 'NA', 't2-wlc', 'On which tab of the WLAN edit page do you choose the VLAN interface that clients will use?', [
    ['General', true, 'Interface/Interface Group.'],
    ['Security', false, 'Encryption and authentication.'],
    ['QoS', false, 'Priority profile.'],
    ['Advanced', false, 'Timers and extra features.'],
  ], 'General holds the profile name, SSID, status, radio policy and Interface/Interface Group. Security, QoS and Advanced hold the rest. A WLAN on the wrong interface gives clients addresses from the wrong subnet.'),
  Q('b2-wlc-07', 'NA', 't2-wlc', 'Which switch port configuration fits a WLC that serves VLANs 10, 20 and 99 (management)?', [
    ['An 802.1Q trunk allowing 10, 20 and 99', true, 'The WLC tags client and management VLANs.'],
    ['An access port in VLAN 99', false, 'Client VLANs would be lost.'],
    ['A routed port', false, 'The WLC expects Layer 2 tagged traffic.'],
    ['An access port in VLAN 1', false, 'Wrong VLAN, and only one.'],
  ], 'Because the controller places each WLAN\'s clients into its dynamic interface\'s VLAN, the switch port (or LAG) toward it must trunk all those VLANs plus the management VLAN.'),
  Q('b2-wlc-08', 'NA', 't2-wlc', 'What must be true for a WLAN to broadcast its SSID after being created in the GUI?', [
    ['Its Status must be set to Enabled', true, 'New WLANs start disabled.'],
    ['It must use WPA3', false, 'Any security works.'],
    ['The WLC must reboot', false, 'Not needed.'],
    ['It must use the service port', false, 'Unrelated.'],
  ], 'Newly created WLANs are disabled by default on many controller versions. Tick Enabled on the General tab and apply; the APs then advertise the SSID within seconds.'),
  Q('b2-wlc-09', 'NA', 't2-wlc', 'Which WLC interface uses a non-routed address such as 192.0.2.1 for DHCP relay and web authentication redirects?', [
    ['The virtual interface', true, 'Must be the same on all controllers in a mobility group.'],
    ['The management interface', false, 'Uses a routable address.'],
    ['A dynamic interface', false, 'Client VLANs.'],
    ['The service port', false, 'Out-of-band management.'],
  ], 'The virtual interface address is never routed; clients see it as the DHCP server identity and the web-auth page host. Use an address that is not used anywhere else, commonly 192.0.2.1.'),
  Q('b2-wlc-10', 'NA', 't2-wlc', 'Which statement about a WLAN\'s PSK in the WLC GUI is correct?', [
    ['It is an ASCII passphrase of 8 to 63 characters (or 64 hex digits)', true, 'The WPA2 limits.'],
    ['It is limited to 4 digits', false, 'Far too short.'],
    ['It must equal the SSID', false, 'No.'],
    ['It is set on each AP', false, 'Set once on the controller.'],
  ], 'WPA2 passphrases are 8 to 63 printable characters, hashed with the SSID into the key. Short or guessable passphrases fall to offline dictionary attacks, which WPA3-SAE resists.'),
  Q('b2-wlc-11', 'NA', 't2-wlc', 'Which WLC interface carries CAPWAP traffic to APs and is used for in-band management?', [
    ['The management interface', true, 'APs join this address.'],
    ['The virtual interface', false, 'Not routed.'],
    ['The service port interface', false, 'Out-of-band only.'],
    ['A dynamic interface', false, 'Client VLANs.'],
  ], 'On modern AireOS controllers, the management interface sources CAPWAP and serves the GUI, SSH and SNMP in band. Older versions had a separate AP-manager interface.'),
  Q('b2-wlc-12', 'NA', 't2-wlc', 'A new WLAN is enabled but clients receive addresses from the management subnet. What was likely missed?', [
    ['The WLAN is still mapped to the management interface instead of the client dynamic interface', true, 'Interface choice decides the subnet.'],
    ['The PSK is wrong', false, 'Clients would not associate at all.'],
    ['The QoS profile', false, 'Unrelated to addressing.'],
    ['The WLAN ID', false, 'IDs are labels.'],
  ], 'Every WLAN defaults to the management interface. If you forget to pick the client interface on the General tab, clients land in the management VLAN, which is both the wrong subnet and a security problem.'),

  // ---------- device management access (2.8) ----------
  Q('b2-mgmt-01', 'NA', 't0-remote', 'Which management access methods encrypt their sessions? (Choose two.)', [
    ['SSH', true, 'Encrypted CLI.'],
    ['HTTPS', true, 'Encrypted web GUI.'],
    ['Telnet', false, 'Clear text.'],
    ['HTTP', false, 'Clear text.'],
  ], 'Device management options on the blueprint: console, Telnet, SSH, HTTP, HTTPS, TACACS+ or RADIUS for authentication, and cloud management. Disable the clear-text ones (no ip http server, transport input ssh).'),
  Q('b2-mgmt-02', 'NA', 't0-remote', 'Which commands enable the secure web GUI and disable the insecure one on an IOS device? (Choose two.)', [
    ['ip http secure-server', true, 'Enables HTTPS.'],
    ['no ip http server', true, 'Disables plain HTTP.'],
    ['ip http server', false, 'Enables plain HTTP.'],
    ['transport input https', false, 'Not a valid line option.'],
  ], 'The IOS web server runs HTTP with ip http server and HTTPS with ip http secure-server. Use HTTPS only, and point authentication at local users or AAA with ip http authentication local.', { console: true }),
  Q('b2-mgmt-03', 'NA', 't0-remote', 'Which AAA protocol is preferred for device administration because it separates authorization and can authorize each command?', [
    ['TACACS+', true, 'Per-command authorization over TCP 49.'],
    ['RADIUS', false, 'Combines authentication and authorization; common for network access.'],
    ['SNMP', false, 'Monitoring.'],
    ['LDAP', false, 'A directory protocol.'],
  ], 'TACACS+ (TCP 49) encrypts the whole payload and lets you authorize individual commands, which suits admin logins to routers and switches. RADIUS (UDP 1812/1813) is the usual choice for user network access such as 802.1X and VPN.'),
];
