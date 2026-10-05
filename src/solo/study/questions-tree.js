// Questions written for the skill tree's thinner branches, so every branch
// with a Know tier has at least three to draw from. Same shape as the main
// bank, plus `branch`, which pins each one to its branch of the tree instead
// of leaving it to keyword matching.

const q = (id, domain, branch, scenario, prompt, choices, explain) => ({
  id, domain, branch, v2: 'same', format: 'single', scenario, prompt,
  choices: choices.map(([text, correct, why]) => ({ text, correct, why })),
  explain,
});

export const TREE_QUESTIONS = [
  // ---------- Tree 0: IOS Foundations ----------
  q('tr-nav-1', 'NF', 't0-nav', 'Consoled into a switch for the first time.', 'The prompt reads Switch>. Which mode are you in?', [
    ['User EXEC mode', true, 'The > marks user EXEC: view-only, a handful of commands.'],
    ['Privileged EXEC mode', false, 'That prompt ends in #.'],
    ['Global configuration mode', false, 'That prompt is Switch(config)#.'],
    ['ROMMON', false, 'ROMMON shows rommon 1 > and only appears during boot recovery.'],
  ], 'The prompt tells you the mode. > is user EXEC, # is privileged EXEC, and (config)# is global configuration. You type enable to go from > to #.'),
  q('tr-nav-2', 'NF', 't0-nav', 'Halfway through configuring an interface.', 'You are in Router(config-if)# and want to see the running config without leaving configuration mode. What do you type?', [
    ['do show running-config', true, 'do runs an EXEC command from any configuration mode.'],
    ['show running-config', false, 'Without do, configuration mode rejects EXEC commands.'],
    ['exec show running-config', false, 'There is no exec prefix in IOS.'],
    ['end show running-config', false, 'end leaves configuration mode; it does not take arguments.'],
  ], 'Prefixing an EXEC command with do runs it without leaving configuration mode, which saves a lot of end and configure terminal.'),
  q('tr-nav-3', 'NF', 't0-nav', 'Deep in interface configuration.', 'Which key combination or command takes you straight back to privileged EXEC mode?', [
    ['end, or Ctrl+Z', true, 'Both drop you to the # prompt from any configuration level.'],
    ['exit', false, 'exit only goes up one level, from interface to global configuration.'],
    ['disable', false, 'disable drops from privileged to user EXEC.'],
    ['Ctrl+C', false, 'Ctrl+C aborts a command in progress, such as a ping.'],
  ], 'exit climbs one level at a time, so from interface mode it lands in global configuration. end and Ctrl+Z jump all the way out of configuration mode to privileged EXEC.'),
  q('tr-insp-1', 'NF', 't0-inspect', 'Checking a router after a cable was moved.', 'show ip interface brief lists Gi0/1 as "up / down". What does that point to?', [
    ['Layer 1 is up but the Layer 2 protocol is not, often a far-end or encapsulation problem', true, 'Status is the physical layer; protocol is the data link layer.'],
    ['Someone typed shutdown on the interface', false, 'That shows as "administratively down".'],
    ['The interface is working normally', false, 'Healthy is up / up.'],
    ['The cable is unplugged', false, 'An unplugged cable shows down / down.'],
  ], 'Read the two columns as Layer 1 then Layer 2. down/down is usually physical, up/down points at keepalives, encapsulation or the far end, and administratively down means shutdown.'),
  q('tr-insp-2', 'NF', 't0-inspect', 'Hunting for one line in a long configuration.', 'Which command shows only the lines of the running config that mention "vty"?', [
    ['show running-config | include vty', true, 'The pipe filters output to matching lines.'],
    ['show running-config vty', false, 'That is not valid syntax.'],
    ['grep vty running-config', false, 'IOS has no grep command.'],
    ['show vty', false, 'There is no show vty command.'],
  ], 'Output filters such as | include, | section and | begin turn long show commands into the few lines you need. | section vty would show the whole line vty block.'),
  q('tr-base-1', 'NF', 't0-base', 'Locking down privileged mode on a new switch.', 'Why use enable secret instead of enable password?', [
    ['enable secret stores the password as a hash; enable password is plain text or weakly encrypted', true, 'enable secret uses a strong hash.'],
    ['enable secret also protects the console line', false, 'Console lines have their own login settings.'],
    ['enable password does not work on newer IOS', false, 'It still works; it is just weak.'],
    ['They are identical', false, 'They store the password very differently.'],
  ], 'If both are set, enable secret wins. service password-encryption only applies weak type 7 obfuscation to other passwords, so enable secret is the one to use.'),
  q('tr-base-2', 'NF', 't0-base', 'Bringing up a new router interface.', 'You configured an IP address on Gi0/0 but it shows administratively down. What is missing?', [
    ['no shutdown on the interface', true, 'Router interfaces start shut down.'],
    ['A description', false, 'Descriptions are labels; they do not affect state.'],
    ['copy running-config startup-config', false, 'Saving does not bring an interface up.'],
    ['A default gateway', false, 'Routers do not need a default gateway to bring up an interface.'],
  ], 'Router interfaces default to shutdown, so no shutdown is part of every interface setup. Switch ports usually start enabled.'),
  q('tr-save-1', 'NF', 't0-save', 'A fix you made yesterday is gone after a power cut.', 'What most likely happened?', [
    ['The change was in the running config and never saved to startup config', true, 'Running config lives in RAM and is lost on reload.'],
    ['The router rolled back automatically', false, 'IOS does not roll back unless configured to.'],
    ['NVRAM was erased by the power cut', false, 'NVRAM survives power loss; that is its purpose.'],
    ['The interface was reset by the far end', false, 'That would not undo a configuration change.'],
  ], 'Running config is in RAM. Startup config is in NVRAM and is what loads at boot. copy running-config startup-config is what makes a change permanent.'),
  q('tr-save-2', 'NF', 't0-save', 'Saving your work.', 'Which command saves the running configuration so it survives a reload?', [
    ['copy running-config startup-config', true, 'It copies RAM to NVRAM. write memory does the same.'],
    ['copy startup-config running-config', false, 'That merges the saved config into the running one.'],
    ['save config', false, 'Not an IOS command.'],
    ['reload', false, 'reload restarts the device and loses unsaved changes.'],
  ], 'Remember the direction: copy from where to where. Running to startup saves; startup to running merges the saved config back in.'),
  q('tr-save-3', 'NF', 't0-save', 'Comparing two configurations.', 'Where is the startup configuration stored?', [
    ['NVRAM', true, 'Non-volatile RAM keeps it through power loss.'],
    ['RAM', false, 'RAM holds the running config.'],
    ['Flash, as the IOS image', false, 'Flash holds the IOS image, not normally the startup config.'],
    ['ROM', false, 'ROM holds bootstrap code.'],
  ], 'RAM holds the running config, NVRAM the startup config, flash the IOS image, and ROM the bootstrap and ROMMON. Saving copies the running config from RAM into NVRAM.'),
  q('tr-rem-1', 'IPS', 't0-remote', 'Setting up SSH on a switch.', 'Which step is required before crypto key generate rsa will work?', [
    ['Set a hostname other than the default and an ip domain-name', true, 'The RSA key is named from hostname and domain.'],
    ['Enable Telnet on the VTY lines', false, 'Telnet is not needed for SSH.'],
    ['Configure a static route', false, 'Routing has nothing to do with key generation.'],
    ['Disable the console port', false, 'The console is unrelated.'],
  ], 'The SSH recipe: hostname, ip domain-name, crypto key generate rsa (at least 768 bits for SSHv2), a local username, then on the VTY lines login local and transport input ssh.'),
  q('tr-rem-2', 'IPS', 't0-remote', 'Hardening remote access.', 'Which line configuration allows only SSH on the VTY lines?', [
    ['transport input ssh', true, 'This rejects Telnet and permits SSH.'],
    ['login local', false, 'That sets where logins are checked, not which protocol.'],
    ['ip ssh version 2', false, 'That sets the SSH version but does not block Telnet.'],
    ['exec-timeout 5', false, 'That sets an idle timeout.'],
  ], 'login local makes the VTY lines check the local username database; transport input ssh decides which protocols can connect.'),

  // ---------- Tree 1: Network Fundamentals ----------
  q('tr-dev-1', 'NF', 't1-devices', 'Choosing gear for a new branch.', 'What can a Layer 3 switch do that a Layer 2 switch cannot?', [
    ['Route between VLANs itself, using SVIs', true, 'A multilayer switch routes as well as switches.'],
    ['Learn MAC addresses', false, 'Every switch learns MAC addresses.'],
    ['Forward frames within a VLAN', false, 'Both do that.'],
    ['Supply PoE', false, 'PoE depends on the model, not the layer.'],
  ], 'A Layer 3 switch keeps a routing table and routes between VLANs through switched virtual interfaces, so traffic does not have to leave for a router.'),
  q('tr-dev-2', 'NF', 't1-devices', 'Planning security for the office edge.', 'What does a next-generation firewall add beyond a traditional stateful firewall?', [
    ['Application awareness and intrusion prevention', true, 'NGFWs inspect applications, users and threats.'],
    ['NAT', false, 'Traditional firewalls already do NAT.'],
    ['Stateful inspection', false, 'That is what a traditional stateful firewall already does.'],
    ['Routing', false, 'Routing is not what defines an NGFW.'],
  ], 'A stateful firewall tracks connections by address and port. A next-generation firewall adds application identification, IPS and often URL filtering.'),
  q('tr-dev-3', 'NF', 't1-devices', 'Powering ceiling access points.', 'What does PoE let a switch do?', [
    ['Send power to a device over the same Ethernet cable as data', true, 'APs, phones and cameras can run without a power brick.'],
    ['Prioritize voice traffic', false, 'That is QoS.'],
    ['Bond ports for more bandwidth', false, 'That is EtherChannel.'],
    ['Reach longer cable distances', false, 'PoE does not extend Ethernet distance limits.'],
  ], 'Power over Ethernet carries DC power on the data cable. 802.3af supplies up to 15.4 watts per port and 802.3at (PoE+) up to 30 watts.'),
  q('tr-arch-1', 'NF', 't1-arch', 'Reviewing a data center design.', 'In a spine-leaf design, how are the switches connected?', [
    ['Every leaf connects to every spine, and leaves do not connect to each other', true, 'That gives a predictable number of hops between any two servers.'],
    ['Leaves connect in a ring', false, 'Rings are not spine-leaf.'],
    ['Spines connect to each other in a full mesh', false, 'Spines do not interconnect.'],
    ['Each leaf connects to one spine', false, 'Each leaf connects to all of them.'],
  ], 'Because every leaf reaches every spine, traffic between any two servers crosses the same number of hops, which is why spine-leaf suits east-west traffic.'),
  q('tr-arch-2', 'NF', 't1-arch', 'Designing a mid-size campus.', 'What does a collapsed core (two-tier) design combine?', [
    ['The core and distribution layers into one', true, 'Access stays separate; distribution and core merge.'],
    ['The access and distribution layers', false, 'Access stays its own layer.'],
    ['The WAN and the core', false, 'Not what collapsed core means.'],
    ['Wired and wireless access', false, 'That is unrelated to tiers.'],
  ], 'Three-tier uses access, distribution and core. Collapsed core merges distribution and core, which suits sites too small to justify a separate core.'),
  q('tr-arch-3', 'NF', 't1-arch', 'Explaining a design to a customer.', 'In a three-tier campus design, which layer do end devices connect to?', [
    ['Access', true, 'PCs, phones and APs plug into access switches.'],
    ['Distribution', false, 'Distribution aggregates access switches.'],
    ['Core', false, 'Core is the fast backbone between distribution blocks.'],
    ['Edge', false, 'Edge usually means the WAN or internet boundary.'],
  ], 'Access connects users, distribution aggregates access switches and applies policy, and core moves traffic between distribution blocks as fast as possible.'),
  q('tr-tp-1', 'NF', 't1-transport', 'Comparing protocols for a voice system.', 'Why does real-time voice usually run over UDP rather than TCP?', [
    ['A late retransmitted packet is useless for live audio, and UDP avoids that overhead', true, 'Retransmission adds delay that voice cannot use.'],
    ['UDP guarantees delivery', false, 'UDP does not guarantee anything.'],
    ['UDP encrypts the audio', false, 'UDP has no encryption.'],
    ['TCP cannot carry audio', false, 'It can; it is just a poor fit for real time.'],
  ], 'TCP is connection-oriented and retransmits lost segments. UDP is connectionless and leaves loss handling to the application, which suits voice and video.'),
  q('tr-tp-2', 'NF', 't1-transport', 'Writing a firewall rule.', 'Which port and protocol does HTTPS use by default?', [
    ['TCP 443', true, 'HTTPS is HTTP over TLS on TCP 443.'],
    ['TCP 80', false, 'That is plain HTTP.'],
    ['UDP 53', false, 'That is DNS.'],
    ['TCP 22', false, 'That is SSH.'],
  ], 'Worth knowing cold: FTP 20 and 21, SSH 22, Telnet 23, DNS 53, DHCP 67 and 68, TFTP 69, HTTP 80, NTP 123, SNMP 161 and 162, HTTPS 443.'),
  q('tr-cl-1', 'NF', 't1-client', 'A Windows laptop cannot get online.', 'ipconfig shows 169.254.12.7. What does that tell you?', [
    ['The PC could not reach a DHCP server and assigned itself an APIPA address', true, '169.254.0.0/16 is self-assigned link-local.'],
    ['The DHCP server handed out a private address', false, 'DHCP would not hand out 169.254.'],
    ['The PC has a static IP set', false, 'A static IP would be whatever was typed.'],
    ['DNS is misconfigured', false, 'DNS does not affect the address.'],
  ], 'An address in 169.254.0.0/16 means DHCP failed. Check the cable, the VLAN, and whether a DHCP server or relay is reachable.'),
  q('tr-cl-2', 'NF', 't1-client', 'Checking settings on a Linux host.', 'Which command shows a Linux host\'s IP addresses?', [
    ['ip addr', true, 'ip addr (or ip a) lists interfaces and addresses.'],
    ['ipconfig /all', false, 'That is Windows.'],
    ['show ip interface brief', false, 'That is Cisco IOS.'],
    ['netstat -r', false, 'That shows routes, not addresses.'],
  ], 'Windows uses ipconfig /all, Linux uses ip addr, and macOS uses ifconfig or networksetup. All three show the address, mask, and often the gateway.'),
  q('tr-cl-3', 'NF', 't1-client', 'A PC can ping its own subnet but nothing beyond it.', 'What is the most likely misconfiguration on the PC?', [
    ['The default gateway', true, 'Off-subnet traffic goes to the gateway.'],
    ['The DNS server', false, 'DNS would break names, not pings by address.'],
    ['The MAC address', false, 'MAC addresses are not normally configured.'],
    ['The hostname', false, 'The hostname does not affect reachability.'],
  ], 'Hosts send anything off their own subnet to the default gateway. A wrong or missing gateway leaves the local subnet working and everything else dead.'),
  q('tr-wl-1', 'NF', 't1-wireless', 'Laying out access points.', 'Which 2.4 GHz channels do not overlap in North America?', [
    ['1, 6 and 11', true, 'They are spaced far enough apart to avoid overlap.'],
    ['1, 2 and 3', false, 'Adjacent channels overlap heavily.'],
    ['1, 5 and 9', false, 'These overlap partially.'],
    ['36, 40 and 44', false, 'Those are 5 GHz channels.'],
  ], 'In 2.4 GHz, channels are 5 MHz apart but about 20 MHz wide, so only 1, 6 and 11 avoid each other. 5 GHz has many more non-overlapping channels.'),
  q('tr-wl-2', 'NF', 't1-wireless', 'Explaining Wi-Fi terms.', 'What is an SSID?', [
    ['The name of a wireless network', true, 'It is what users see when they pick a network.'],
    ['The MAC address of an AP radio', false, 'That is the BSSID.'],
    ['The encryption key', false, 'That is the passphrase or PSK.'],
    ['The channel number', false, 'Channels are separate.'],
  ], 'The SSID is the network name. The BSSID is the MAC address of the AP radio advertising it, and one SSID can be served by many BSSIDs.'),
  q('tr-vt-1', 'NF', 't1-virtual', 'Comparing hosting options.', 'How do containers differ from virtual machines?', [
    ['Containers share the host operating system kernel; VMs each run a full guest OS', true, 'That makes containers lighter and quicker to start.'],
    ['Containers need a type 1 hypervisor', false, 'Containers run on a container engine, not a hypervisor.'],
    ['VMs share one kernel', false, 'Each VM has its own kernel.'],
    ['There is no difference', false, 'They isolate at different levels.'],
  ], 'A hypervisor runs whole virtual machines with their own operating systems. A container engine isolates applications on one shared kernel.'),
  q('tr-vt-2', 'NF', 't1-virtual', 'One router serving two customers with overlapping addresses.', 'What feature keeps their routes separate on the same router?', [
    ['VRFs', true, 'Each VRF has its own routing table.'],
    ['VLANs', false, 'VLANs separate Layer 2, not routing tables.'],
    ['HSRP', false, 'HSRP provides gateway redundancy.'],
    ['NAT', false, 'NAT translates addresses; it does not split routing tables.'],
  ], 'Virtual routing and forwarding instances give one router several independent routing tables, so overlapping customer addresses never mix.'),

  // ---------- Tree 2: Network Access ----------
  q('tr-tr-1', 'NA', 't2-trunks', 'Two switches report a native VLAN mismatch.', 'What does the native VLAN do on an 802.1Q trunk?', [
    ['Carries frames untagged', true, 'Every other VLAN is tagged; the native VLAN is not.'],
    ['Carries management traffic only', false, 'It can carry any traffic.'],
    ['Blocks all other VLANs', false, 'It does not block anything.'],
    ['Encrypts the trunk', false, '802.1Q has no encryption.'],
  ], 'Both ends must agree on the native VLAN, or untagged frames land in the wrong VLAN. CDP reports the mismatch, which is how it is usually spotted.'),
  q('tr-tr-2', 'NA', 't2-trunks', 'Adding VLAN 30 to an existing trunk.', 'Which command adds VLAN 30 without removing the VLANs already allowed?', [
    ['switchport trunk allowed vlan add 30', true, 'add appends to the current list.'],
    ['switchport trunk allowed vlan 30', false, 'This replaces the whole list with just 30.'],
    ['switchport access vlan 30', false, 'That is for access ports.'],
    ['vlan 30', false, 'That creates the VLAN; it does not touch the trunk.'],
  ], 'Leaving out the word add replaces the allowed list, which is a classic way to cut off every other VLAN on a live trunk. remove takes a VLAN off the list the same way.'),
  q('tr-cdp-1', 'NA', 't2-discovery', 'Mapping an unlabeled closet.', 'Which command shows the IP address of a directly connected Cisco device?', [
    ['show cdp neighbors detail', true, 'The detail view includes management addresses.'],
    ['show cdp neighbors', false, 'The summary lists device ID and ports but not IP addresses.'],
    ['show ip route', false, 'That shows routes, not neighbors.'],
    ['show mac address-table', false, 'That shows MACs, not neighbor details.'],
  ], 'show cdp neighbors gives the device, local and remote ports and platform. Adding detail shows the IP address and IOS version.'),
  q('tr-cdp-2', 'NA', 't2-discovery', 'Neighbor discovery in a mixed-vendor network.', 'How does LLDP differ from CDP?', [
    ['LLDP is an open IEEE standard; CDP is Cisco proprietary', true, 'LLDP works across vendors.'],
    ['LLDP only runs on routers', false, 'It runs on switches, phones and more.'],
    ['CDP is off by default on Cisco devices', false, 'CDP is on by default; LLDP is off by default.'],
    ['LLDP is encrypted', false, 'Neither is encrypted.'],
  ], 'LLDP is 802.1AB and is enabled globally with lldp run on Cisco gear. Both leak device details, so turn them off on ports facing untrusted networks.'),
  q('tr-cdp-3', 'NA', 't2-discovery', 'Hardening edge ports.', 'Why disable CDP on a port facing the internet?', [
    ['It advertises device details such as model, IOS version and IP address', true, 'That information helps an attacker.'],
    ['It slows the link', false, 'CDP traffic is tiny.'],
    ['It causes spanning tree loops', false, 'CDP does not cause loops.'],
    ['It blocks routing protocols', false, 'It does not.'],
  ], 'no cdp enable on the interface stops it on that port. no cdp run disables it on the whole device. For LLDP the per-port commands are no lldp transmit and no lldp receive.'),
  q('tr-ec-1', 'NA', 't2-etherchannel', 'Bundling two uplinks with LACP.', 'Which pair of modes will NOT form an EtherChannel?', [
    ['passive and passive', true, 'Neither side starts negotiation.'],
    ['active and active', false, 'Both negotiate; it forms.'],
    ['active and passive', false, 'Active starts, passive answers; it forms.'],
    ['on and on', false, 'Both force the bundle without negotiation; it forms.'],
  ], 'LACP needs at least one active side. PAgP works the same way with desirable and auto. on does no negotiation and only pairs with on.'),
  q('tr-ec-2', 'NA', 't2-etherchannel', 'One port will not join the bundle.', 'Which mismatch keeps a port out of an EtherChannel?', [
    ['A different speed, duplex or VLAN setting from the other members', true, 'Members must match.'],
    ['A different interface description', false, 'Descriptions do not matter.'],
    ['A different cable color', false, 'Not a configuration setting.'],
    ['CDP being enabled', false, 'CDP does not affect bundling.'],
  ], 'Every member must match speed, duplex, access VLAN or trunk settings. A mismatched port shows as suspended or standalone in show etherchannel summary.'),
  q('tr-wa-1', 'NA', 't2-wlan-arch', 'A branch office whose WAN link to the controller is unreliable.', 'Which AP mode keeps clients working locally if the link to the WLC drops?', [
    ['FlexConnect', true, 'FlexConnect switches traffic locally and can keep serving clients.'],
    ['Local mode', false, 'Local mode tunnels everything to the WLC.'],
    ['Monitor mode', false, 'Monitor mode serves no clients.'],
    ['Sniffer mode', false, 'Sniffer mode only captures traffic.'],
  ], 'Lightweight APs use CAPWAP to reach the WLC. In local mode client traffic goes to the controller; FlexConnect can switch it at the branch instead.'),
  q('tr-wlc-1', 'NA', 't2-wlc', 'Creating a guest network on a WLC.', 'When you create a WLAN on a WLC, what do you tie the SSID to so its clients land in the right VLAN?', [
    ['An interface on the WLC mapped to that VLAN', true, 'The WLAN maps to a dynamic interface.'],
    ['A static route', false, 'Routing is not where the VLAN is chosen.'],
    ['A port channel on the AP', false, 'APs do not choose the client VLAN that way.'],
    ['The AP hostname', false, 'The hostname has nothing to do with it.'],
  ], 'A WLAN has a profile name, an SSID and an ID, and it is mapped to a WLC interface whose VLAN the clients join. The security tab then sets WPA2 or WPA3.'),
  q('tr-wlc-2', 'NA', 't2-wlc', 'Configuring a WLAN in the GUI.', 'Where do you set WPA2 with a pre-shared key for a WLAN?', [
    ['On the WLAN\'s Security tab', true, 'Layer 2 security settings live there.'],
    ['On the AP\'s Details page', false, 'Security is set per WLAN, not per AP.'],
    ['In the controller\'s Management settings', false, 'Management settings cover access to the WLC itself.'],
    ['On the switch port', false, 'The switch does not set Wi-Fi security.'],
  ], 'Each WLAN carries its own security. Under Security, Layer 2, you choose WPA2 or WPA3, then PSK for a shared passphrase or 802.1X for per-user logins.'),
  q('tr-wlc-3', 'NA', 't2-wlc', 'Connecting a WLC to the switch.', 'Why bundle a WLC\'s distribution ports with LAG?', [
    ['For redundancy and more bandwidth across its uplinks', true, 'LAG treats the ports as one link.'],
    ['To encrypt client traffic', false, 'LAG does not encrypt.'],
    ['To give each WLAN its own port', false, 'WLANs ride the trunk, not separate ports.'],
    ['Because CAPWAP needs it', false, 'CAPWAP works without LAG.'],
  ], 'LAG on a WLC is a static EtherChannel: all its distribution ports act as one, so losing a port does not drop the controller.'),

  // ---------- Tree 3: IP Connectivity ----------
  q('tr-rt-1', 'IPC', 't3-table', 'Reading show ip route.', 'A route shows [110/2]. What are those numbers?', [
    ['Administrative distance 110 and metric 2', true, 'The first is AD, the second is the metric.'],
    ['Metric 110 and hop count 2', false, 'The order is AD then metric.'],
    ['VLAN 110, port 2', false, 'Routes do not show VLANs that way.'],
    ['Priority 110 and age 2', false, 'Not what the brackets mean.'],
  ], 'Inside the brackets: administrative distance, then metric. AD 110 means the route came from OSPF, and the metric is the OSPF cost to reach that network.'),
  q('tr-hsrp-1', 'IPC', 't3-fhrp', 'Two routers share a subnet with HSRP.', 'What do the hosts use as their default gateway?', [
    ['The virtual IP shared by the HSRP group', true, 'Whichever router is active answers for it.'],
    ['The active router\'s real interface IP', false, 'Then failover would break their gateway.'],
    ['Both routers\' real IPs', false, 'A host has one default gateway.'],
    ['The standby router\'s IP', false, 'The standby only takes over when the active fails.'],
  ], 'HSRP gives the group a virtual IP and virtual MAC. The active router answers for them, and if it fails the standby takes over without the hosts changing anything.'),
  q('tr-hsrp-2', 'IPC', 't3-fhrp', 'Tuning HSRP.', 'Which router becomes active in an HSRP group?', [
    ['The one with the highest priority; the highest IP breaks a tie', true, 'Priority defaults to 100.'],
    ['The one with the lowest priority', false, 'Higher wins.'],
    ['The one that booted last', false, 'Boot order only matters if preemption is off.'],
    ['Always the one with the lowest IP', false, 'IP is only the tie-breaker, and the higher one wins.'],
  ], 'Default priority is 100. Preemption is off by default, so a higher-priority router that boots later will not take over unless you configure standby preempt.'),
  q('tr-fwd-1', 'IPC', 't3-forwarding', 'A router has two routes to 10.1.1.0/24.', 'One is static and one is learned by OSPF. Which is used, all else equal?', [
    ['The static route, because its administrative distance is 1 versus OSPF\'s 110', true, 'Lower AD wins.'],
    ['The OSPF route, because it is dynamic', false, 'Dynamic does not beat a lower AD.'],
    ['Both, load balanced', false, 'Different sources are not load balanced.'],
    ['Whichever was learned first', false, 'Order does not decide it.'],
  ], 'With the same prefix length from different sources, administrative distance decides. Connected is 0, static 1, OSPF 110, RIP 120. A longer prefix always wins first.'),

  // ---------- Tree 4: IP Services ----------
  q('tr-ntp-1', 'IPS', 't4-ntp-log', 'Logs from two routers do not line up.', 'Why does accurate time matter on network devices?', [
    ['Log timestamps, certificates and troubleshooting all depend on it', true, 'Correlating events needs synchronized clocks.'],
    ['Routing protocols stop without it', false, 'Routing works with a wrong clock.'],
    ['Interfaces will not come up', false, 'Time does not affect interface state.'],
    ['VLANs depend on it', false, 'They do not.'],
  ], 'NTP keeps clocks in sync over UDP 123. A lower stratum number means a server is closer to the reference clock, and show ntp associations confirms a router is synced.'),
  q('tr-snmp-1', 'IPS', 't4-snmp', 'Setting up monitoring.', 'What does an SNMP trap do?', [
    ['The agent on the device sends an unsolicited alert to the manager', true, 'Traps go out on UDP 162.'],
    ['The manager polls a value from the device', false, 'That is a get request.'],
    ['It blocks unauthorized SNMP access', false, 'That is an ACL or SNMPv3 security.'],
    ['It saves the MIB to flash', false, 'Traps are messages.'],
  ], 'Managers poll agents on UDP 161; agents push traps or informs to the manager on UDP 162. The MIB defines what can be read.'),
  q('tr-snmp-2', 'IPS', 't4-snmp', 'Choosing an SNMP version.', 'Which SNMP version adds authentication and encryption?', [
    ['SNMPv3', true, 'v3 supports authentication and privacy.'],
    ['SNMPv2c', false, 'v2c uses plain-text community strings.'],
    ['SNMPv1', false, 'v1 also uses community strings.'],
    ['None of them', false, 'v3 does.'],
  ], 'v1 and v2c authenticate with community strings sent in clear text. SNMPv3 adds user-based authentication and encryption.'),
  q('tr-qos-1', 'IPS', 't4-qos', 'Shaping vs policing on a WAN link.', 'How does traffic shaping differ from policing?', [
    ['Shaping buffers excess traffic to send later; policing drops or re-marks it', true, 'Shaping smooths; policing enforces.'],
    ['Policing buffers; shaping drops', false, 'The other way around.'],
    ['They are the same', false, 'They treat excess traffic differently.'],
    ['Shaping only applies to voice', false, 'Shaping applies to whatever class you choose.'],
  ], 'Policing is a hard limit that drops or re-marks traffic above the rate. Shaping delays it in a buffer, trading latency for fewer drops.'),
  q('tr-file-1', 'IPS', 't4-files', 'Copying an IOS image to a switch.', 'Which statement about TFTP is true?', [
    ['It uses UDP 69 and has no authentication', true, 'Simple, fast to set up, and insecure.'],
    ['It uses TCP 21 and requires a login', false, 'That is FTP.'],
    ['It encrypts transfers', false, 'TFTP has no encryption.'],
    ['It only works over IPv6', false, 'It works over IPv4.'],
  ], 'TFTP is minimal: UDP 69, no login, no directory listing. FTP uses TCP 21 for control and 20 for data and needs a username and password.'),
  q('tr-file-2', 'IPS', 't4-files', 'Backing up a configuration.', 'Which command copies the running config to a TFTP server?', [
    ['copy running-config tftp:', true, 'IOS prompts for the server address and file name.'],
    ['copy tftp: running-config', false, 'That pulls a file from the server.'],
    ['tftp put running-config', false, 'Not IOS syntax.'],
    ['backup running-config', false, 'Not an IOS command.'],
  ], 'The pattern is copy source destination. copy running-config tftp: backs up the config; copy tftp: flash: loads an IOS image onto the device.'),
  q('tr-file-3', 'IPS', 't4-files', 'Choosing a transfer protocol.', 'Why might you choose FTP over TFTP?', [
    ['FTP supports usernames and passwords and runs over reliable TCP', true, 'TFTP has neither.'],
    ['FTP encrypts the file', false, 'Plain FTP is not encrypted.'],
    ['FTP is lighter weight', false, 'TFTP is the lighter one.'],
    ['FTP uses UDP', false, 'FTP uses TCP.'],
  ], 'FTP adds logins and TCP reliability. Neither encrypts anything, so SCP or SFTP are the secure choices whenever the device supports them.'),

  // ---------- Tree 5: Security ----------
  q('tr-sec-1', 'SECF', 't5-concepts', 'Writing a security policy.', 'Which term describes a weakness in a system that could be used to cause harm?', [
    ['Vulnerability', true, 'The weakness itself.'],
    ['Exploit', false, 'An exploit is the method that uses the weakness.'],
    ['Threat', false, 'A threat is the potential danger or actor.'],
    ['Mitigation', false, 'Mitigation reduces the risk.'],
  ], 'Vulnerability is the weakness, an exploit uses it, a threat is the danger of it happening, and mitigation is what you do to reduce the risk.'),
  q('tr-sec-2', 'SECF', 't5-concepts', 'Security awareness training.', 'An email that pretends to be from IT and asks you to sign in on a fake page is an example of what?', [
    ['Phishing', true, 'A form of social engineering.'],
    ['A denial-of-service attack', false, 'That floods a service.'],
    ['MAC spoofing', false, 'That forges a hardware address.'],
    ['A buffer overflow', false, 'That is a software exploit.'],
  ], 'Phishing targets people rather than machines, which is why user training is part of a security program alongside technical controls.'),
  q('tr-acc-1', 'SECF', 't5-access', 'Logging in to the company VPN.', 'Which is an example of multifactor authentication?', [
    ['A password plus a code from an authenticator app', true, 'Something you know plus something you have.'],
    ['A password plus a security question', false, 'Both are things you know.'],
    ['Two passwords', false, 'Still one factor.'],
    ['A long password', false, 'Still one factor.'],
  ], 'Factors are something you know, something you have, and something you are. MFA combines at least two different kinds, not two of the same.'),
  q('tr-acc-2', 'SECF', 't5-access', 'Hardening device logins.', 'What does login local on a VTY line do?', [
    ['Checks usernames and passwords against the device\'s local user database', true, 'Users are defined with username commands.'],
    ['Allows login only from the console', false, 'VTY lines are remote.'],
    ['Disables passwords', false, 'It requires them.'],
    ['Enables SSH', false, 'SSH needs more than this.'],
  ], 'With login local, each person signs in with their own username created by username name secret password, which also leaves a record of who logged in.'),
  q('tr-vpn-1', 'SECF', 't5-vpn', 'Connecting two offices over the internet.', 'Which kind of VPN links the two office networks permanently?', [
    ['Site-to-site IPsec VPN', true, 'Gateways at each site build the tunnel; hosts need nothing.'],
    ['Remote-access VPN', false, 'That connects individual users.'],
    ['A VLAN', false, 'VLANs do not cross the internet.'],
    ['NAT', false, 'NAT does not secure traffic.'],
  ], 'A site-to-site VPN runs between routers or firewalls. Users at each office see the other office as just another network.'),
  q('tr-vpn-2', 'SECF', 't5-vpn', 'A technician works from home.', 'What does a remote-access VPN provide?', [
    ['An encrypted connection from one user\'s device into the company network', true, 'Usually with a VPN client app.'],
    ['A permanent link between two buildings', false, 'That is site-to-site.'],
    ['Faster internet', false, 'Usually the opposite.'],
    ['Wireless roaming', false, 'Unrelated.'],
  ], 'Remote-access VPNs connect individual users, typically through a client such as Cisco Secure Client, using TLS or IPsec.'),
  q('tr-vpn-3', 'SECF', 't5-vpn', 'Explaining IPsec.', 'Which set of protections does IPsec provide?', [
    ['Confidentiality, integrity and authentication', true, 'Encryption, tamper detection and peer verification.'],
    ['Routing, switching and NAT', false, 'Those are not security services.'],
    ['Load balancing only', false, 'IPsec does not balance load.'],
    ['Compression only', false, 'Not its purpose.'],
  ], 'IPsec encrypts the data, detects any change in transit and verifies the peer, and it can also protect against replayed packets.'),
  q('tr-aaa-1', 'SECF', 't5-aaa', 'Choosing an AAA protocol for device administration.', 'What does TACACS+ do that RADIUS does not?', [
    ['Encrypts the whole payload and separates authentication, authorization and accounting', true, 'It suits per-command authorization.'],
    ['Uses UDP', false, 'TACACS+ uses TCP 49; RADIUS uses UDP.'],
    ['Works only with non-Cisco gear', false, 'It came from Cisco.'],
    ['Only handles accounting', false, 'It handles all three.'],
  ], 'RADIUS (UDP 1812 and 1813) encrypts only the password and is common for network access. TACACS+ (TCP 49) encrypts everything and is common for device administration.'),
  q('tr-ws-1', 'SECF', 't5-wsec', 'Choosing Wi-Fi security.', 'What does WPA3-Personal use in place of WPA2\'s pre-shared key handshake?', [
    ['SAE (Simultaneous Authentication of Equals)', true, 'SAE resists offline password guessing.'],
    ['WEP', false, 'WEP is the broken original.'],
    ['TKIP', false, 'TKIP is the legacy WPA cipher.'],
    ['Open authentication', false, 'Open has no security.'],
  ], 'WPA2-Personal uses a PSK with AES-CCMP. WPA3-Personal replaces the PSK handshake with SAE, so a captured handshake cannot be cracked offline.'),
  q('tr-ws-2', 'SECF', 't5-wsec', 'Wi-Fi for a company with hundreds of users.', 'What does WPA2-Enterprise use instead of a shared passphrase?', [
    ['802.1X authentication against a server such as RADIUS', true, 'Each user signs in with their own credentials.'],
    ['A longer shared passphrase', false, 'That is still Personal mode.'],
    ['MAC filtering', false, 'MAC filtering is easy to bypass.'],
    ['A hidden SSID', false, 'Hiding the SSID is not authentication.'],
  ], 'Enterprise mode gives each user their own login through 802.1X, so one person leaving does not mean changing the password for everyone.'),

  // ---------- Tree 6: Automation ----------
  q('tr-ai-1', 'AUTO', 't6-ai', 'An AI tool flags a link likely to fail next week.', 'Which kind of AI is that?', [
    ['Predictive AI, forecasting from historical data', true, 'It predicts outcomes from patterns.'],
    ['Generative AI', false, 'Generative AI creates content such as text or configurations.'],
    ['A routing protocol', false, 'Not AI.'],
    ['Rule-based scripting', false, 'A fixed rule does not learn from data.'],
  ], 'Predictive AI uses past data to forecast, such as failures or capacity. Generative AI produces new content, such as a draft configuration or a summary of logs.'),
  q('tr-ai-2', 'AUTO', 't6-ai', 'Using a chatbot to draft a switch configuration.', 'What is the main risk?', [
    ['It can produce confident but wrong commands, so output must be reviewed and tested', true, 'Generative models can be wrong.'],
    ['It will reboot the switch', false, 'Drafting text does not touch the device.'],
    ['It always uses outdated IOS', false, 'Not always.'],
    ['It cannot write CLI commands', false, 'It can, which is why review matters.'],
  ], 'Generative AI is a fast drafter and a poor authority. Treat its configurations like a junior colleague\'s: review, then test in a lab first.'),
  q('tr-ai-3', 'AUTO', 't6-ai', 'Network monitoring with machine learning.', 'What is a common use of machine learning in network operations?', [
    ['Spotting anomalies by learning what normal traffic looks like', true, 'Baselines make outliers visible.'],
    ['Replacing routing protocols', false, 'Routing protocols still route.'],
    ['Assigning VLANs by hand', false, 'That is manual, not ML.'],
    ['Encrypting traffic', false, 'Encryption is not ML.'],
  ], 'Machine learning builds a baseline from data and flags what departs from it, which catches problems static thresholds miss.'),
  q('tr-rest-1', 'AUTO', 't6-rest', 'Calling a controller API.', 'Which HTTP method is used to create a new resource?', [
    ['POST', true, 'POST creates.'],
    ['GET', false, 'GET reads.'],
    ['DELETE', false, 'DELETE removes.'],
    ['HEAD', false, 'HEAD reads headers only.'],
  ], 'CRUD maps to HTTP as create = POST, read = GET, update = PUT or PATCH, and delete = DELETE. A 201 status code confirms a POST created something.'),
  q('tr-json-1', 'AUTO', 't6-json', 'Reading API output.', 'In JSON, what do square brackets [ ] hold?', [
    ['An array, an ordered list of values', true, 'Curly braces hold objects.'],
    ['An object of key and value pairs', false, 'Objects use { }.'],
    ['A comment', false, 'JSON has no comments.'],
    ['A string', false, 'Strings use double quotes.'],
  ], 'Objects are { "key": value } and arrays are [ value, value ]. They nest: an array of interface objects is a common API response.'),
  q('tr-json-2', 'AUTO', 't6-json', 'Fixing a broken JSON file.', 'Which is valid JSON?', [
    ['{"hostname": "SW1", "vlans": [10, 20]}', true, 'Double-quoted keys and strings, an array of numbers.'],
    ["{'hostname': 'SW1'}", false, 'JSON requires double quotes.'],
    ['{hostname: "SW1"}', false, 'Keys must be quoted.'],
    ['{"vlans": [10, 20,]}', false, 'Trailing commas are not allowed.'],
  ], 'JSON is strict: double quotes only, quoted keys, no trailing commas and no comments. Values can be strings, numbers, true, false, null, objects or arrays.'),
  q('tr-json-3', 'AUTO', 't6-json', 'Parsing {"interface": "Gi0/1", "enabled": true}.', 'What type is the value of "enabled"?', [
    ['Boolean', true, 'true and false are booleans.'],
    ['String', false, 'A string would be in quotes: "true".'],
    ['Number', false, 'Not a number.'],
    ['Array', false, 'Arrays use [ ].'],
  ], 'true without quotes is a boolean; "true" in quotes would be a string. APIs care about the difference and may reject the wrong type.'),
];
