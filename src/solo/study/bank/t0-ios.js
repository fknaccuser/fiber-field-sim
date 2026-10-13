// Tree 0, IOS Foundations: modes, navigation, reading show output, base
// configuration, saving, and remote access. Heavy on console questions,
// because every other tree is read and typed through this one.

import { Q, X } from './qb.js';

export const T0_IOS = [
  // ---------- t0-nav: modes and moving around ----------
  Q('b0-nav-01', 'NF', 't0-nav', 'Which prompt shows global configuration mode?', [
    ['R1(config)#', true, '(config)# is global configuration.'],
    ['R1#', false, 'That is privileged EXEC.'],
    ['R1>', false, 'That is user EXEC.'],
    ['R1(config-if)#', false, 'That is interface configuration, one level deeper.'],
  ], 'The prompt always tells you where you are: > user EXEC, # privileged EXEC, (config)# global configuration, and (config-xx)# a submode such as an interface or line. Reading the prompt before typing prevents most "% Invalid input" errors.', { console: true }),

  Q('b0-nav-02', 'NF', 't0-nav', 'You are at R1(config-if)#. What does typing exit once do?', [
    ['Moves you up one level to R1(config)#', true, 'exit climbs a single level.'],
    ['Moves you to R1#', false, 'That is what end or Ctrl+Z does.'],
    ['Logs you out of the router', false, 'exit only logs out when typed at the EXEC level.'],
    ['Saves the configuration', false, 'Nothing is saved until you copy it to startup-config.'],
  ], 'exit steps back one level at a time: interface to global, global to privileged EXEC, and from EXEC it ends the session. end and Ctrl+Z jump straight from any configuration level to privileged EXEC.', { console: true }),

  Q('b0-nav-03', 'NF', 't0-nav', 'What does the router mean by this message?', [
    ['The word under the ^ is not a valid command or keyword in this mode', true, 'The caret points at where parsing failed.'],
    ['The command was accepted but did nothing', false, 'An accepted command returns silently.'],
    ['You need to type more of the command', false, 'That would be % Incomplete command.'],
    ['The abbreviation matches more than one command', false, 'That would be % Ambiguous command.'],
  ], 'IOS marks the exact position where it stopped understanding you with a caret. Usually the command is fine but you are in the wrong mode (for example a show command in configuration mode without do), or a keyword is misspelled.', {
    exhibit: X(`
R1(config)#show ip route
             ^
% Invalid input detected at '^' marker.`,
      ['R1(config)#', 'prompt'], ['show ip route', 'cmd'], ["% Invalid input detected at '^' marker.", 'fail', 'The error'], [/\^(?=\n)/, 'fail', 'The error']),
  }),

  Q('b0-nav-04', 'NF', 't0-nav', 'Why did the router answer this way?', [
    ['The command needs at least one more keyword or value', true, 'Incomplete means the syntax is not finished yet.'],
    ['ip address is not valid on this interface', false, 'The command is valid; it is unfinished.'],
    ['You are in the wrong mode', false, 'Wrong mode gives % Invalid input.'],
    ['The interface is shut down', false, 'You can configure a shut interface.'],
  ], '% Incomplete command means IOS recognised everything you typed but expects more, here the address and mask. Press ? after a space to see what it is waiting for: ip address ? lists A.B.C.D.', {
    exhibit: X(`
R1(config-if)#ip address
% Incomplete command.`,
      ['R1(config-if)#', 'prompt'], ['ip address', 'cmd'], ['% Incomplete command.', 'fail', 'The error']),
  }),

  Q('b0-nav-05', 'NF', 't0-nav', 'What went wrong here?', [
    ['"s" could be several commands, so IOS cannot tell which you mean', true, 'Abbreviations must be unique in the current mode.'],
    ['The s command does not exist', false, 'It is a prefix of show, ssh, setup and others.'],
    ['You must be in configuration mode', false, 'show works in EXEC.'],
    ['The session timed out', false, 'Timeouts end the session rather than print this.'],
  ], 'IOS accepts any abbreviation that is unique in the current mode: sh, sho and show all work. A single s matches show, ssh, systat and more, so IOS answers % Ambiguous command and you type one more letter.', {
    exhibit: X(`
R1#s
% Ambiguous command:  "s"`,
      ['R1#', 'prompt'], [/^R1#s$/m, 'cmd'], ['% Ambiguous command:  "s"', 'fail', 'The error']),
  }),

  Q('b0-nav-06', 'NF', 't0-nav', 'You mistyped a command at R1# and the router hangs for several seconds on this line. Which global command stops it from happening again?', [
    ['no ip domain-lookup', true, 'IOS stops treating unknown words as hostnames to resolve.'],
    ['no ip dns server', false, 'That stops the router acting as a DNS server, not as a client.'],
    ['logging synchronous', false, 'That keeps log messages from splitting your typing.'],
    ['exec-timeout 0 0', false, 'That only changes the idle timeout.'],
  ], 'At an EXEC prompt IOS treats an unknown single word as a hostname to telnet to and tries to resolve it, broadcasting to 255.255.255.255 if no DNS server is set. no ip domain-lookup turns that off. On a production router you might keep DNS and accept the delay instead.', {
    exhibit: X(`
R1#shwo
Translating "shwo"...domain server (255.255.255.255)`,
      ['R1#', 'prompt'], ['shwo', 'cmd', 'Typo'], ['255.255.255.255', 'ip', 'Broadcast DNS lookup']),
  }),

  Q('b0-nav-07', 'NF', 't0-nav', 'You are in interface configuration mode and want to check the interface status without leaving it. What do you type?', [
    ['do show ip interface brief', true, 'do runs an EXEC command from configuration mode.'],
    ['show ip interface brief', false, 'Configuration mode rejects EXEC commands without do.'],
    ['exec show ip interface brief', false, 'There is no exec prefix.'],
    ['end show ip interface brief', false, 'end takes no arguments.'],
  ], 'do is the escape hatch for running show, ping, copy and other EXEC commands from any configuration level. It saves the end, show, configure terminal, interface dance while you are mid-change.', { console: true }),

  Q('b0-nav-08', 'NF', 't0-nav', 'A continuous ping to an unreachable host keeps printing dots. Which key sequence interrupts it on a Cisco router?', [
    ['Ctrl+Shift+6', true, 'The IOS escape sequence breaks ping and traceroute.'],
    ['Ctrl+C', false, 'Ctrl+C does not stop an IOS ping on most platforms.'],
    ['Ctrl+Z', false, 'Ctrl+Z leaves configuration mode.'],
    ['Esc', false, 'Esc on its own does nothing here.'],
  ], 'Ctrl+Shift+6 (sometimes written Ctrl+^) is the IOS escape sequence. It breaks a running ping, traceroute or a hostname lookup, and in a telnet or SSH session it is the first half of suspending to the previous device.', { console: true }),

  Q('b0-nav-09', 'NF', 't0-nav', 'What does typing show ? at R1# give you?', [
    ['Every keyword that can follow show in this mode, with a short description', true, 'A space then ? lists the next keywords.'],
    ['Every command that starts with the letters show', false, 'That is show? with no space.'],
    ['The command history', false, 'That is show history.'],
    ['Help for the show command in a manual page', false, 'IOS has no man pages; ? is the help system.'],
  ], 'Context-sensitive help comes in two forms. sh? (no space) lists commands that start with those letters. show ? (with a space) lists what can come next. Pressing Tab completes a unique abbreviation to the full word.', { console: true }),

  Q('b0-nav-10', 'NF', 't0-nav', 'From privileged EXEC, which command drops you back to user EXEC without logging out?', [
    ['disable', true, 'disable is the opposite of enable.'],
    ['exit', false, 'At privileged EXEC, exit ends the session.'],
    ['end', false, 'end only works in configuration modes.'],
    ['logout enable', false, 'Not a valid command.'],
  ], 'enable raises you from > to # (asking for the enable secret if one is set) and disable lowers you back to >. exit or logout at either EXEC level ends the console or remote session.', { console: true }),

  Q('b0-nav-11', 'NF', 't0-nav', 'Which keys recall the previous command from the history buffer?', [
    ['Up arrow or Ctrl+P', true, 'Both step back through history.'],
    ['Down arrow or Ctrl+N', false, 'Those step forward again.'],
    ['Ctrl+A', false, 'Ctrl+A moves the cursor to the start of the line.'],
    ['Tab', false, 'Tab completes a keyword.'],
  ], 'IOS keeps the last ten commands per mode by default (terminal history size changes it). Up arrow or Ctrl+P walks back, Down arrow or Ctrl+N walks forward, and show history lists them.', { console: true }),

  Q('b0-nav-12', 'NF', 't0-nav', 'What is the order of modes you pass through to configure an IP address on Gi0/0, starting from R1>?', [
    ['enable, configure terminal, interface g0/0', true, 'User EXEC to privileged EXEC to global to interface.'],
    ['configure terminal, enable, interface g0/0', false, 'configure terminal is rejected at the > prompt.'],
    ['interface g0/0, enable, configure terminal', false, 'interface only works from global configuration.'],
    ['enable, interface g0/0', false, 'You must enter global configuration first.'],
  ], 'Each mode is a door to the next: enable takes > to #, configure terminal takes # to (config)#, and interface g0/0 takes (config)# to (config-if)#. Skipping a door gives % Invalid input.', { console: true }),

  Q('b0-nav-13', 'NF', 't0-nav', 'Which mode is this router in, and what is the next command to bring the interface up?', [
    ['Interface configuration; no shutdown', true, 'The (config-if) prompt and an interface that defaults to shut.'],
    ['Global configuration; no shutdown', false, 'no shutdown is an interface command, and the prompt is config-if.'],
    ['Privileged EXEC; enable interface', false, 'There is no enable interface command.'],
    ['Interface configuration; interface up', false, 'IOS uses no shutdown, not interface up.'],
  ], 'Router interfaces start administratively down. After the address is set, no shutdown turns the interface on; the router then logs that the interface and line protocol changed state to up.', {
    exhibit: X(`
R1(config)#interface gigabitEthernet 0/0
R1(config-if)#ip address 10.0.12.1 255.255.255.0
R1(config-if)#`,
      ['R1(config-if)#', 'prompt', 'Prompt: interface mode'], ['R1(config)#', 'prompt'], ['interface gigabitEthernet 0/0', 'cmd'], ['10.0.12.1', 'ip'], ['255.255.255.0', 'mask']),
  }),

  Q('b0-nav-14', 'NF', 't0-nav', 'Which two keystrokes complete an abbreviated keyword or show what can follow it? (Choose two.)', [
    ['Tab', true, 'Completes a unique abbreviation.'],
    ['?', true, 'Lists the possible keywords.'],
    ['Ctrl+Z', false, 'Leaves configuration mode.'],
    ['Ctrl+Shift+6', false, 'Breaks a running command.'],
  ], 'Tab and ? are the two help keys. Tab fills in a keyword when your abbreviation is unique, and ? shows options when it is not, or what can come next after a space. Both work in every mode.', { console: true }),

  Q('b0-nav-15', 'NF', 't0-nav', 'The prompt shows R1(config-line)#. What are you configuring?', [
    ['A line such as the console or VTY lines', true, 'config-line is the line submode.'],
    ['An interface', false, 'That is config-if.'],
    ['A routing protocol', false, 'That is config-router.'],
    ['A VLAN', false, 'That is config-vlan.'],
  ], 'Submodes name themselves in the prompt: config-if for interfaces, config-line for line con 0 and line vty, config-router for routing protocols, config-subif for subinterfaces and config-vlan for VLANs.', { console: true }),

  // ---------- t0-inspect: reading show output ----------
  Q('b0-insp-01', 'NF', 't0-inspect', 'Which interface is configured but switched off by an administrator?', [
    ['GigabitEthernet0/2', true, 'administratively down means shutdown is configured.'],
    ['GigabitEthernet0/1', false, 'down/down is a physical problem: no cable or no far end.'],
    ['GigabitEthernet0/0', false, 'up/up is working.'],
    ['Loopback0', false, 'Loopbacks are up/up unless shut.'],
  ], 'Read the Status column as Layer 1 and Protocol as Layer 2. administratively down/down means someone typed shutdown (or a router interface was never enabled). down/down with no shutdown points at the cable or the far end.', {
    exhibit: X(`
R1#show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     10.0.12.1       YES manual up                    up
GigabitEthernet0/1     192.168.1.1     YES manual down                  down
GigabitEthernet0/2     172.16.5.1      YES manual administratively down down
Loopback0              1.1.1.1         YES manual up                    up`,
      ['show ip interface brief', 'cmd'], [/GigabitEthernet0\/\d|Loopback0/, 'iface'], [/\d+\.\d+\.\d+\.\d+/, 'ip'], ['administratively down', 'fail', 'Shut down by config'], [/(?<=manual )down {18}down/, 'fail', 'Layer 1 down'], [/up {20}up/, 'ok', 'Up and up']),
  }),

  Q('b0-insp-02', 'NF', 't0-inspect', 'This interface shows "up" in the Status column and "down" in Protocol. Which layer has the problem?', [
    ['Layer 2: the physical link is fine but the data link protocol is not up', true, 'Status is Layer 1, Protocol is Layer 2.'],
    ['Layer 1: the cable is unplugged', false, 'An unplugged cable shows down/down.'],
    ['Layer 3: the IP address is wrong', false, 'A wrong IP address does not change either column.'],
    ['None: up/down is normal', false, 'Healthy is up/up.'],
  ], 'up/down means the interface sees a signal but the line protocol is not established: on serial links that is usually an encapsulation or clocking mismatch, on Ethernet it can be an err-disabled peer or keepalive issue. An IP address mistake never shows here.', {
    exhibit: X(`
Interface              IP-Address      OK? Method Status                Protocol
Serial0/0/0            10.0.0.1        YES manual up                    down`,
      ['Serial0/0/0', 'iface'], ['10.0.0.1', 'ip'], [/up {20}down/, 'fail', 'Status up, protocol down']),
  }),

  Q('b0-insp-03', 'NF', 't0-inspect', 'What is the MAC address of this interface?', [
    ['0050.56a1.0b01', true, 'The "address is" field is the MAC in Cisco dotted format.'],
    ['10.1.1.1', false, 'That is the IPv4 address.'],
    ['1000000 Kbit/sec', false, 'That is the bandwidth.'],
    ['1500 bytes', false, 'That is the MTU.'],
  ], 'Cisco writes MAC addresses as three groups of four hex digits. show interfaces prints the active MAC after "address is" and the burned-in address after "bia". The IP address appears on the Internet address line with its prefix length.', {
    exhibit: X(`
R1#show interfaces gigabitEthernet 0/1
GigabitEthernet0/1 is up, line protocol is up
  Hardware is iGbE, address is 0050.56a1.0b01 (bia 0050.56a1.0b01)
  Internet address is 10.1.1.1/24
  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,
  Full-duplex, 1000Mb/s, media type is RJ45`,
      ['show interfaces gigabitEthernet 0/1', 'cmd'], [/^GigabitEthernet0\/1/m, 'iface'], ['is up, line protocol is up', 'state'], ['0050.56a1.0b01', 'mac'], ['10.1.1.1', 'ip'], ['/24', 'mask'], ['Full-duplex, 1000Mb/s', 'key', 'Duplex and speed']),
  }),

  Q('b0-insp-04', 'NF', 't0-inspect', 'Which counters on this interface point at a physical problem such as a bad cable?', [
    ['The input errors and CRC counters', true, 'CRC errors are damaged frames, typically layer 1.'],
    ['The packets output counter', false, 'Output packets are normal traffic.'],
    ['The MTU', false, 'MTU is a setting, not a counter.'],
    ['The 5 minute input rate', false, 'A rate measures load, not damage.'],
  ], 'CRC errors mean frames arrived with a bad checksum: noise, a damaged or too-long cable, or a bad connector. Rising late collisions on a full-duplex link instead point at a duplex mismatch. Clear the counters, watch them, and replace the cable first.', {
    exhibit: X(`
GigabitEthernet0/1 is up, line protocol is up
  5 minute input rate 2000 bits/sec, 3 packets/sec
     48211 packets input, 5123302 bytes, 0 no buffer
     1384 input errors, 1384 CRC, 0 frame, 0 overrun, 0 ignored
     39120 packets output, 4011887 bytes, 0 underruns
     0 output errors, 0 collisions, 0 interface resets`,
      [/1384 input errors, 1384 CRC/, 'fail', 'Error counters climbing'], [/0 collisions/, 'count'], ['GigabitEthernet0/1', 'iface']),
  }),

  Q('b0-insp-05', 'NF', 't0-inspect', 'Which command filters the running configuration down to the block for the VTY lines?', [
    ['show running-config | section line vty', true, 'section prints the matching line and everything indented under it.'],
    ['show running-config | include vty', false, 'include prints only the single matching lines, not the block under them.'],
    ['show line vty', false, 'That shows line status, not configuration.'],
    ['show running-config vty', false, 'Not valid syntax.'],
  ], 'The pipe filters any show output: | include keeps matching lines, | exclude drops them, | begin starts at the first match, and | section keeps a whole configuration block, which is what you want for line vty or router ospf.', { console: true }),

  Q('b0-insp-06', 'NF', 't0-inspect', 'From this output, how long has the router been running and what is the configuration register?', [
    ['Up 3 weeks, 2 days; register 0x2102', true, 'Both are printed directly.'],
    ['Up 3 weeks, 2 days; register 0x2142', false, '0x2142 would skip the startup config; this router shows 0x2102.'],
    ['Up since the image was built; register 15.7', false, '15.7 is the IOS version.'],
    ['Up 4 GB; register flash0', false, 'Those are memory and storage values.'],
  ], 'show version is the box\'s ID card: IOS version, uptime, image file, hardware and the configuration register. 0x2102 is normal boot; 0x2142 tells the router to ignore NVRAM at boot, which is the first step of password recovery.', {
    exhibit: X(`
R1#show version
Cisco IOS Software, ISR Software (X86_64_LINUX_IOSD-UNIVERSALK9-M), Version 15.7(3)M5
R1 uptime is 3 weeks, 2 days, 4 hours, 11 minutes
System image file is "flash0:c2900-universalk9-mz.SPA.157-3.M5.bin"
Configuration register is 0x2102`,
      ['show version', 'cmd'], ['Version 15.7(3)M5', 'key', 'IOS version'], ['3 weeks, 2 days, 4 hours, 11 minutes', 'count', 'Uptime'], ['"flash0:c2900-universalk9-mz.SPA.157-3.M5.bin"', 'state', 'Image file'], ['0x2102', 'key', 'Configuration register']),
  }),

  Q('b0-insp-07', 'NF', 't0-inspect', 'Which command shows the neighbors a router is directly cabled to, with their platform and port?', [
    ['show cdp neighbors', true, 'CDP lists directly connected Cisco devices.'],
    ['show ip route', false, 'That shows networks, not physical neighbors.'],
    ['show arp', false, 'ARP lists IP-to-MAC mappings, not device names or ports.'],
    ['show interfaces status', false, 'That is a switch port summary without neighbor names.'],
  ], 'CDP (and LLDP when enabled) answers "what is on the other end of this cable": device ID, local port, holdtime, capability, platform and the remote port. Add detail to see the neighbor\'s IP address and IOS version.', { console: true }),

  Q('b0-insp-08', 'NF', 't0-inspect', 'What does this output show?', [
    ['Only the lines of the running config that contain "ip address"', true, '| include keeps matching lines.'],
    ['The interface section for every interface', false, '| section would include the interface lines.'],
    ['The startup configuration', false, 'running-config was filtered here.'],
    ['Interfaces with errors', false, 'Nothing here measures errors.'],
  ], 'Filtering with | include is the quickest way to answer one question about a long config. Note that include drops context: you cannot tell which interface each address belongs to. | section interface or show ip interface brief keeps that.', {
    exhibit: X(`
R1#show running-config | include ip address
 ip address 10.0.12.1 255.255.255.0
 ip address 192.168.1.1 255.255.255.0
 no ip address`,
      ['show running-config | include ip address', 'cmd'], [/10\.0\.12\.1|192\.168\.1\.1/, 'ip'], [/255\.255\.255\.0/, 'mask']),
  }),

  Q('b0-insp-09', 'NF', 't0-inspect', 'Which command shows the IOS image files stored on the router?', [
    ['show flash:', true, 'Lists the contents of the flash file system.'],
    ['show nvram', false, 'NVRAM holds the startup configuration.'],
    ['show startup-config', false, 'That shows the saved configuration.'],
    ['show memory', false, 'That shows RAM usage.'],
  ], 'Flash holds IOS images and other files; NVRAM holds startup-config; RAM holds running-config and tables. dir flash: and show flash: list the files, sizes and free space, which you check before copying a new image.', { console: true }),

  Q('b0-insp-10', 'NF', 't0-inspect', 'Which interface on this switch is in VLAN 20?', [
    ['Gi0/3', true, 'The VLAN column for Gi0/3 shows 20.'],
    ['Gi0/1', false, 'Gi0/1 is in VLAN 10.'],
    ['Gi0/24', false, 'Gi0/24 is a trunk.'],
    ['Gi0/2', false, 'Gi0/2 is notconnect in VLAN 10.'],
  ], 'show interfaces status is the switch\'s quick port summary: port, description, status (connected, notconnect, disabled, err-disabled), VLAN (or trunk), duplex, speed and type. a-full and a-1000 mean autonegotiated values.', {
    exhibit: X(`
SW1#show interfaces status
Port      Name               Status       Vlan       Duplex  Speed Type
Gi0/1     PC-Front-Desk      connected    10         a-full a-1000 10/100/1000BaseTX
Gi0/2                        notconnect   10           auto   auto 10/100/1000BaseTX
Gi0/3     Printer            connected    20         a-full  a-100 10/100/1000BaseTX
Gi0/24    Uplink-SW2         connected    trunk      a-full a-1000 10/100/1000BaseTX`,
      ['show interfaces status', 'cmd'], [/^Gi0\/\d+/m, 'iface'], [/(?<=connected {4})\d+|(?<=notconnect {3})\d+/, 'vlan'], ['trunk', 'vlan', 'Trunk'], [/notconnect/, 'fail', 'Nothing plugged in'], [/(?<= )connected(?= )/, 'ok', 'Connected']),
  }),

  Q('b0-insp-11', 'NF', 't0-inspect', 'What is wrong with this link?', [
    ['A duplex mismatch: the interface is half-duplex and late collisions are climbing', true, 'Late collisions on a link that should be full duplex are the classic sign.'],
    ['The cable is too short', false, 'Short cables do not cause late collisions.'],
    ['The MTU is wrong', false, 'MTU mismatch causes drops of large packets, not collisions.'],
    ['Nothing; collisions are normal', false, 'Collisions should be zero on a switched full-duplex link.'],
  ], 'When one side is hard-set to full duplex and the other autonegotiates, the auto side falls back to half duplex. The half side sees collisions and late collisions while the full side sees CRC and runts. Set both ends the same, preferably both auto.', {
    exhibit: X(`
Gi0/5 is up, line protocol is up
  Half-duplex, 100Mb/s, media type is 10/100/1000BaseTX
     2201 output errors, 1950 collisions, 0 interface resets
     0 babbles, 251 late collision, 0 deferred`,
      ['Half-duplex', 'fail', 'Half duplex'], ['1950 collisions', 'count'], ['251 late collision', 'fail', 'Late collisions'], ['Gi0/5', 'iface']),
  }),

  Q('b0-insp-12', 'NF', 't0-inspect', 'Which command lists the users logged in to the router right now?', [
    ['show users', true, 'Lists console and VTY sessions.'],
    ['show sessions', false, 'That lists outbound telnet sessions you opened from this router.'],
    ['show line', false, 'That shows line settings and status, not who is logged in by name.'],
    ['who', false, 'Not an IOS command.'],
  ], 'show users shows each active line (con 0, vty 0 and so on), the user, idle time and source address, with an asterisk on your own session. clear line vty 0 disconnects someone if you need to.', { console: true }),

  Q('b0-insp-13', 'NF', 't0-inspect', 'Which show command displays the configuration that will load at the next boot?', [
    ['show startup-config', true, 'The startup configuration lives in NVRAM and loads at boot.'],
    ['show running-config', false, 'That is the active configuration in RAM.'],
    ['show version', false, 'That shows the image and register, not the configuration.'],
    ['show boot', false, 'That shows boot variables on some platforms, not the configuration.'],
  ], 'Comparing show running-config with show startup-config tells you whether there are unsaved changes. A brand-new router prints "startup-config is not present" because NVRAM is empty.', { console: true }),

  Q('b0-insp-14', 'NF', 't0-inspect', 'Why is GigabitEthernet0/1 missing an address in this output?', [
    ['Its address was never configured (unassigned)', true, 'unassigned and Method unset mean no address.'],
    ['It is shut down', false, 'Shutdown shows in Status; the address would still appear.'],
    ['It received its address by DHCP', false, 'Method would show DHCP and the leased address.'],
    ['The cable is unplugged', false, 'An unplugged interface still lists its configured address.'],
  ], 'The IP-Address column shows unassigned when no address is configured, and Method unset confirms it. A DHCP-assigned address shows Method DHCP. Status and Protocol are independent of whether an address exists.', {
    exhibit: X(`
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     10.0.12.1       YES manual up                    up
GigabitEthernet0/1     unassigned      YES unset  up                    up`,
      ['unassigned', 'fail', 'No address'], ['unset', 'fail', 'No address'], ['10.0.12.1', 'ip'], [/GigabitEthernet0\/\d/, 'iface']),
  }),

  // ---------- t0-base: base configuration ----------
  Q('b0-base-01', 'NF', 't0-base', 'Which command sets the device name shown in the prompt?', [
    ['hostname R1', true, 'Global configuration command.'],
    ['name R1', false, 'Not the IOS command.'],
    ['set hostname R1', false, 'That is a different vendor style.'],
    ['host R1', false, 'An abbreviation that is ambiguous on many platforms.'],
  ], 'hostname changes the prompt immediately and is also required before generating RSA keys for SSH, because the key name is built from the hostname and domain name.', { console: true }),

  Q('b0-base-02', 'SECF', 't0-base', 'Both lines are in the configuration. Which password does enable ask for?', [
    ['The enable secret, Cisc0Secret', true, 'enable secret overrides enable password when both exist.'],
    ['The enable password, cisco123', false, 'enable password is ignored when a secret is set.'],
    ['Either one', false, 'Only the secret is accepted.'],
    ['Neither; enable has no password', false, 'Both commands set one.'],
  ], 'enable secret stores a one-way hash and always wins over the older enable password, which is plain text (or weak type 7 with service password-encryption). Configure only enable secret on any device you care about.', {
    exhibit: X(`
enable secret 9 $9$aHnD4b6Q$Xy.Example.HashValue
enable password cisco123`,
      ['enable secret', 'key', 'Wins'], ['enable password', 'fail', 'Ignored'], ['cisco123', 'fail', 'Ignored']),
    scenario: 'The secret was set as Cisc0Secret.',
  }),

  Q('b0-base-03', 'SECF', 't0-base', 'What does service password-encryption do?', [
    ['Encrypts plain-text passwords in the config with weak, reversible type 7', true, 'It only hides passwords from shoulder-surfing.'],
    ['Hashes every password with SHA-256', false, 'That is enable secret type 8 or 9, set per command.'],
    ['Encrypts the whole configuration file', false, 'Only password strings are affected.'],
    ['Encrypts SSH and Telnet sessions', false, 'Session encryption is SSH\'s job.'],
  ], 'service password-encryption turns line and username passwords into type 7, which can be reversed with free tools. It stops casual viewing of the config but is not security. Use secret forms (enable secret, username ... secret) for strong hashes.', { console: true }),

  Q('b0-base-04', 'NF', 't0-base', 'Which commands set a console password that is actually checked at login? (Choose two.)', [
    ['password ConsolePass', true, 'Sets the line password.'],
    ['login', true, 'Tells the line to ask for the password.'],
    ['enable secret ConsolePass', false, 'That protects privileged EXEC, not the console line.'],
    ['transport input ssh', false, 'Transport applies to VTY lines.'],
  ], 'Under line con 0, password sets the string and login turns the check on; without login the password is stored but never asked for. login local instead checks the local username database.', {
    exhibit: X(`
R1(config)#line console 0
R1(config-line)#`,
      ['R1(config-line)#', 'prompt'], ['line console 0', 'cmd']),
  }),

  Q('b0-base-05', 'NF', 't0-base', 'Which line command stops log messages from breaking up what you are typing at the console?', [
    ['logging synchronous', true, 'Reprints your line after a log message.'],
    ['no logging console', false, 'That hides console logs entirely.'],
    ['exec-timeout 0 0', false, 'That disables the idle timeout.'],
    ['terminal monitor', false, 'That shows logs on a remote session.'],
  ], 'logging synchronous under line con 0 (or vty) makes IOS redraw your partial command after a log message prints, so you do not lose your place. It is a quality-of-life setting on nearly every lab and production device.', { console: true }),

  Q('b0-base-06', 'NF', 't0-base', 'What does exec-timeout 5 0 under line vty 0 15 do?', [
    ['Logs out a remote session after 5 minutes idle', true, 'Minutes then seconds.'],
    ['Logs out after 5 seconds idle', false, 'The first number is minutes.'],
    ['Allows 5 remote sessions', false, 'The line range sets how many sessions exist.'],
    ['Disables the timeout', false, 'exec-timeout 0 0 disables it.'],
  ], 'exec-timeout takes minutes and seconds; the default is 10 minutes. Short timeouts on VTY lines close abandoned sessions, while exec-timeout 0 0 disables the timer, which is handy in a lab and risky in production.', { console: true }),

  Q('b0-base-07', 'NF', 't0-base', 'A new router interface has an address but stays down. Which command is missing?', [
    ['no shutdown', true, 'Router interfaces are administratively down by default.'],
    ['ip routing', false, 'Routing is on by default on routers.'],
    ['switchport', false, 'That is a switch port command.'],
    ['speed auto', false, 'Auto is the default.'],
  ], 'Router interfaces start shut down; switch ports start enabled. Forgetting no shutdown is the most common reason a freshly configured router interface shows administratively down.', {
    exhibit: X(`
interface GigabitEthernet0/1
 ip address 192.168.1.1 255.255.255.0
 shutdown`,
      ['interface GigabitEthernet0/1', 'iface'], ['192.168.1.1', 'ip'], ['255.255.255.0', 'mask'], [/^ shutdown$/m, 'fail', 'Interface is shut']),
  }),

  Q('b0-base-08', 'NF', 't0-base', 'Which command adds a label to an interface so the next tech knows what it connects to?', [
    ['description Uplink to SW2 Gi0/24', true, 'An interface command, shown in show interfaces and the config.'],
    ['name Uplink to SW2', false, 'name is used for VLANs, not interfaces.'],
    ['remark Uplink to SW2', false, 'remark is for ACL entries.'],
    ['banner Uplink to SW2', false, 'Banners are login messages.'],
  ], 'Interface descriptions are free text and cost nothing. Good ones name the far device and port, and they show up in show interfaces, show interfaces status and show interfaces description.', { console: true }),

  Q('b0-base-09', 'NF', 't0-base', 'Which command shows a legal warning to anyone who connects, before login?', [
    ['banner motd #Authorized access only#', true, 'The MOTD banner prints before the login prompt.'],
    ['banner exec #Authorized access only#', false, 'The exec banner prints after login.'],
    ['motd Authorized access only', false, 'Not valid syntax.'],
    ['description Authorized access only', false, 'description labels interfaces.'],
  ], 'banner motd takes a delimiter character, the text, and the same delimiter to end. It is shown at connection on console and VTY lines. Banners should warn, not welcome: "Authorized access only" supports prosecution in many jurisdictions.', { console: true }),

  Q('b0-base-10', 'NA', 't0-base', 'A Layer 2 switch must be reachable for management from another subnet. Which configuration is correct?', [
    ['An IP address on interface vlan 1 (or the management VLAN), no shutdown, and ip default-gateway', true, 'An L2 switch needs an SVI and a default gateway.'],
    ['An IP address on Gi0/1 and a static route', false, 'Access ports on an L2 switch take no IP address.'],
    ['ip routing and an OSPF process', false, 'An L2 switch does not route.'],
    ['An IP address on the console line', false, 'Lines do not take IP addresses.'],
  ], 'A Layer 2 switch is a host on the management VLAN: give the SVI an address, bring it up, and set ip default-gateway so replies reach other subnets. ip default-gateway only applies when IP routing is off.', { console: true }),

  Q('b0-base-11', 'NA', 't0-base', 'This switch answers pings from its own VLAN but not from other subnets. What is missing?', [
    ['ip default-gateway 192.168.99.1', true, 'Without it the switch cannot reply off-subnet.'],
    ['ip route 0.0.0.0 0.0.0.0 vlan 99', false, 'A Layer 2 switch with routing off uses ip default-gateway.'],
    ['no shutdown on VLAN 99', false, 'The SVI is already up/up.'],
    ['A second IP address', false, 'One management address is enough.'],
  ], 'The switch can answer anything on 192.168.99.0/24 directly, but replies to other subnets need a gateway. ip default-gateway gives the switch the router\'s address on the management VLAN.', {
    exhibit: X(`
SW1#show running-config | section interface Vlan99
interface Vlan99
 ip address 192.168.99.10 255.255.255.0
SW1#show ip interface brief | include Vlan99
Vlan99                 192.168.99.10   YES manual up                    up`,
      ['interface Vlan99', 'iface'], [/Vlan99(?= )/, 'iface'], [/192\.168\.99\.10/, 'ip'], ['255.255.255.0', 'mask'], [/up {20}up/, 'ok', 'SVI is up']),
  }),

  Q('b0-base-12', 'NF', 't0-base', 'Which command, in privileged EXEC, sets the router clock by hand?', [
    ['clock set 14:30:00 12 Oct 2026', true, 'clock set is a privileged EXEC command.'],
    ['clock timezone PST -8', false, 'That sets the zone, in global configuration.'],
    ['ntp server 10.1.1.1', false, 'That syncs time from a server.'],
    ['set clock 14:30', false, 'Not IOS syntax.'],
  ], 'clock set is EXEC, not configuration, which surprises people. For anything beyond a lab, use NTP so logs line up across devices; a router without NTP drifts and loses time at reload on many platforms.', { console: true }),

  Q('b0-base-13', 'NF', 't0-base', 'You want to remove a command from the running configuration. What do you type?', [
    ['The same command with no in front of it', true, 'no negates a configuration command.'],
    ['delete followed by the command', false, 'delete removes files from flash.'],
    ['erase followed by the command', false, 'erase wipes file systems such as startup-config.'],
    ['undo followed by the command', false, 'undo is another vendor\'s syntax.'],
  ], 'Almost every configuration command is reversed by prefixing no: no shutdown, no ip address, no ip route ... Some commands need only the first keywords after no, but typing the full original line always works.', { console: true }),

  Q('b0-base-14', 'NF', 't0-base', 'Which interface command forces a port to 100 Mb/s full duplex?', [
    ['speed 100 followed by duplex full', true, 'Two separate interface commands.'],
    ['bandwidth 100000', false, 'bandwidth only changes routing metrics, not the line rate.'],
    ['duplex 100 full', false, 'Not valid syntax.'],
    ['mtu 100', false, 'MTU is packet size.'],
  ], 'speed and duplex are physical settings; set them identically on both ends or leave both on auto. bandwidth is a logical number used by OSPF cost and QoS and does not change how fast the port runs.', { console: true }),

  Q('b0-base-15', 'NF', 't0-base', 'What will this configuration do when someone connects to the console?', [
    ['Ask for a username and password from the local database', true, 'login local checks username entries.'],
    ['Ask for the line password Cons0le only', false, 'login local ignores the line password.'],
    ['Let anyone in without a password', false, 'login local requires credentials.'],
    ['Reject all logins', false, 'admin is a valid local user.'],
  ], 'login local tells the line to authenticate against username entries. The line password stays in the config but is unused. With AAA (aaa new-model), login authentication method lists take over instead.', {
    exhibit: X(`
username admin secret Adm1nPass
!
line con 0
 password Cons0le
 login local`,
      ['username admin secret Adm1nPass', 'key', 'Local user'], ['login local', 'key', 'Checks local users'], ['password Cons0le', 'state', 'Unused line password']),
  }),

  Q('b0-base-16', 'NF', 't0-base', 'Which subinterface prompt appears after interface g0/0.10?', [
    ['R1(config-subif)#', true, 'Subinterfaces have their own submode.'],
    ['R1(config-if)#', false, 'That is a physical interface.'],
    ['R1(config-vlan)#', false, 'That is VLAN configuration on a switch.'],
    ['R1(config-if.10)#', false, 'IOS does not number the prompt.'],
  ], 'A dot and a number creates a logical subinterface, used for router-on-a-stick. Inside it, encapsulation dot1Q sets the VLAN tag before an IP address is accepted.', { console: true }),

  // ---------- t0-save: saving, erasing, files ----------
  Q('b0-save-01', 'NF', 't0-save', 'Which command saves your changes so they survive a reload?', [
    ['copy running-config startup-config', true, 'Writes RAM config to NVRAM.'],
    ['copy startup-config running-config', false, 'That merges the saved config into the running one.'],
    ['save config', false, 'Not an IOS command.'],
    ['reload', false, 'reload restarts; unsaved changes are lost.'],
  ], 'Changes go into running-config immediately and are lost at reload unless copied to startup-config. write memory (wr) does the same thing and still works on most IOS versions.', { console: true }),

  Q('b0-save-02', 'NF', 't0-save', 'What does this prompt tell you?', [
    ['There are unsaved changes; yes saves them before restarting', true, 'IOS warns that running and startup differ.'],
    ['The router has no startup configuration', false, 'It would not ask to save then.'],
    ['The reload will erase the configuration', false, 'Answering no keeps the old startup-config.'],
    ['The router needs a new IOS image', false, 'Nothing here mentions the image.'],
  ], 'reload checks whether running-config differs from startup-config. yes saves first; no reloads into the old saved config, discarding the changes. That second behaviour is a deliberate safety net: reload in 10 rolls back a change that cut you off.', {
    exhibit: X(`
R1#reload
System configuration has been modified. Save? [yes/no]:`,
      ['reload', 'cmd'], ['System configuration has been modified.', 'key', 'Unsaved changes']),
  }),

  Q('b0-save-03', 'NF', 't0-save', 'Which pair of commands returns a router to factory defaults?', [
    ['erase startup-config, then reload', true, 'Empty NVRAM means no config at boot.'],
    ['delete running-config, then reload', false, 'running-config is in RAM and is not deleted that way.'],
    ['no hostname, then reload', false, 'That only removes one line.'],
    ['copy startup-config running-config, then reload', false, 'That reloads the saved config.'],
  ], 'With NVRAM erased the router boots with no configuration and offers the setup dialog. On switches, also delete flash:vlan.dat, because VLANs live there rather than in startup-config.', { console: true }),

  Q('b0-save-04', 'NF', 't0-save', 'Where is the running configuration stored?', [
    ['RAM', true, 'Fast, and lost at power-off.'],
    ['NVRAM', false, 'NVRAM holds startup-config.'],
    ['Flash', false, 'Flash holds IOS images.'],
    ['ROM', false, 'ROM holds bootstrap and ROMMON.'],
  ], 'Memory map: ROM holds the bootstrap and ROMMON, flash holds IOS images, NVRAM holds startup-config, and RAM holds running-config plus the routing and ARP tables. That split is why reload loses unsaved work.', { console: true }),

  Q('b0-save-05', 'IPS', 't0-save', 'Which command backs up the running configuration to a TFTP server?', [
    ['copy running-config tftp:', true, 'IOS then prompts for the server address and file name.'],
    ['copy tftp: running-config', false, 'That restores from TFTP into the running config.'],
    ['backup tftp running-config', false, 'Not IOS syntax.'],
    ['write tftp', false, 'Not a valid option.'],
  ], 'copy source destination is the pattern for every transfer. Copying from TFTP into running-config merges rather than replaces, so lines missing from the file are not removed; configure replace does a true replacement.', { console: true }),

  Q('b0-save-06', 'NF', 't0-save', 'Which configuration register value makes a router ignore its startup configuration at the next boot, as used in password recovery?', [
    ['0x2142', true, 'Bit 6 tells the router to skip NVRAM.'],
    ['0x2102', false, 'That is the normal value.'],
    ['0x2100', false, 'That boots to ROMMON.'],
    ['0x0000', false, 'Not the standard recovery value.'],
  ], 'Password recovery: break into ROMMON, set confreg 0x2142, boot, copy startup-config running-config, change the secret, set config-register 0x2102 and save. Physical console access is required, which is why physical security matters.', { console: true }),

  Q('b0-save-07', 'NF', 't0-save', 'What does this output tell you?', [
    ['Nothing has been saved to NVRAM yet', true, 'A new or erased router has no startup-config.'],
    ['NVRAM is broken', false, 'It is simply empty.'],
    ['The running config is empty', false, 'This command only reads NVRAM.'],
    ['The router is in ROMMON', false, 'The R1# prompt shows normal IOS.'],
  ], 'startup-config is not present means NVRAM is empty: either a new device or someone ran erase startup-config. If the router reloads now it will boot unconfigured, so copy running-config startup-config before anything else.', {
    exhibit: X(`
R1#show startup-config
startup-config is not present`,
      ['show startup-config', 'cmd'], ['startup-config is not present', 'fail', 'Nothing saved']),
  }),

  Q('b0-save-08', 'NF', 't0-save', 'Which command tells the router which IOS image file to load at boot?', [
    ['boot system flash:c2900-universalk9-mz.SPA.157-3.M5.bin', true, 'A global command that names the image.'],
    ['copy flash: startup-config', false, 'That copies a file into the configuration.'],
    ['load image flash:', false, 'Not IOS syntax.'],
    ['config-register 0x2102', false, 'That sets boot behaviour, not the image name.'],
  ], 'Without boot system, the router loads the first valid image in flash. Naming it explicitly matters after an upgrade when both old and new images are present. Save the config so the setting survives.', { console: true }),

  // ---------- t0-remote: remote access ----------
  Q('b0-rem-01', 'IPS', 't0-remote', 'Which step must happen before crypto key generate rsa will work?', [
    ['A hostname other than Router and an ip domain-name', true, 'The key name is built from them.'],
    ['transport input ssh on the VTY lines', false, 'That can come before or after the keys.'],
    ['A local username', false, 'Needed to log in, not to generate keys.'],
    ['An access-class on the VTY lines', false, 'Optional filtering.'],
  ], 'IOS builds the RSA key name from hostname.domain, so it refuses to generate keys while the hostname is the default Router or no domain is set. The full set: hostname, ip domain-name, crypto key generate rsa (2048), username ... secret, line vty with login local and transport input ssh, and ip ssh version 2.', { console: true }),

  Q('b0-rem-02', 'IPS', 't0-remote', 'What must be fixed before SSH keys can be generated?', [
    ['Set a domain name with ip domain-name', true, 'The error says exactly that.'],
    ['Set a hostname', false, 'The hostname R1 is already set.'],
    ['Enable SSH version 2', false, 'Version is set after keys exist.'],
    ['Configure the VTY lines', false, 'Lines do not affect key generation.'],
  ], 'The router names the key pair hostname.domain-name. With R1 set but no domain, generation stops with this message. ip domain-name lab.local, then repeat the command, choosing at least 768 bits (2048 is standard) for SSH version 2.', {
    exhibit: X(`
R1(config)#crypto key generate rsa
% Please define a domain-name first.`,
      ['R1(config)#', 'prompt'], ['crypto key generate rsa', 'cmd'], ['% Please define a domain-name first.', 'fail', 'The error']),
  }),

  Q('b0-rem-03', 'IPS', 't0-remote', 'With this VTY configuration, what happens when someone tries to telnet to the router?', [
    ['The connection is refused; only SSH is allowed', true, 'transport input ssh excludes telnet.'],
    ['Telnet works with the local username', false, 'Telnet is not in the transport list.'],
    ['Telnet works with no password', false, 'Telnet is not allowed at all.'],
    ['Both work, SSH preferred', false, 'Only the listed transports are accepted.'],
  ], 'transport input limits which protocols can reach the lines. ssh alone blocks telnet, and transport input telnet ssh allows both. Combined with login local, users authenticate with their own username and secret.', {
    exhibit: X(`
line vty 0 15
 login local
 transport input ssh`,
      ['line vty 0 15', 'iface', 'VTY lines'], ['login local', 'key', 'Local usernames'], ['transport input ssh', 'key', 'SSH only']),
  }),

  Q('b0-rem-04', 'IPS', 't0-remote', 'Which TCP ports do SSH and Telnet listen on?', [
    ['SSH 22, Telnet 23', true, 'Both are well-known TCP ports.'],
    ['SSH 23, Telnet 22', false, 'Reversed.'],
    ['SSH 443, Telnet 80', false, 'Those are HTTPS and HTTP.'],
    ['SSH 22, Telnet 21', false, '21 is FTP control.'],
  ], 'SSH (TCP 22) encrypts the whole session, including the password. Telnet (TCP 23) sends everything in clear text, so anyone capturing the traffic reads the credentials. The exam expects you to prefer SSH every time.', { console: true }),

  Q('b0-rem-05', 'IPS', 't0-remote', 'Which command confirms SSH is enabled and shows its version?', [
    ['show ip ssh', true, 'Prints SSH Enabled and the version.'],
    ['show ssh', false, 'That shows active SSH sessions.'],
    ['show crypto key', false, 'Close, but the full command is show crypto key mypubkey rsa, and it shows keys rather than SSH status.'],
    ['show line vty 0', false, 'Shows line settings only.'],
  ], 'show ip ssh answers "is SSH on and which version": SSH Enabled - version 2.0 is what you want. Version 1.99 means both versions are accepted; ip ssh version 2 restricts it to version 2.', {
    exhibit: X(`
R1#show ip ssh
SSH Enabled - version 2.0
Authentication methods:publickey,keyboard-interactive,password
Authentication timeout: 120 secs; Authentication retries: 3`,
      ['show ip ssh', 'cmd'], ['SSH Enabled - version 2.0', 'ok', 'SSH is on, version 2'], ['120 secs', 'count', 'Timeout'], ['Authentication retries: 3', 'count', 'Retries']),
  }),

  Q('b0-rem-06', 'SECF', 't0-remote', 'How do you limit SSH access to the router to the management subnet only?', [
    ['A standard ACL applied to the VTY lines with access-class in', true, 'access-class filters who can open a session.'],
    ['ip access-group on every interface', false, 'That filters transit traffic and is far broader than needed.'],
    ['transport input ssh', false, 'That picks the protocol, not the source.'],
    ['exec-timeout 1 0', false, 'That only shortens idle time.'],
  ], 'access-list 10 permit 10.99.0.0 0.0.0.255 then line vty 0 15, access-class 10 in. The ACL matches the source of incoming sessions on the lines themselves, whichever interface they arrive on.', { console: true }),

  Q('b0-rem-07', 'NA', 't0-remote', 'Which management access method works even when the network is down?', [
    ['The console port', true, 'Out-of-band, needs only a cable.'],
    ['SSH', false, 'Needs IP connectivity to the device.'],
    ['Telnet', false, 'Needs IP connectivity.'],
    ['HTTPS', false, 'Needs IP connectivity.'],
  ], 'Console access is out of band: a rollover or USB cable straight into the device. It is how you configure a new box and recover one whose IP configuration is broken. SSH, Telnet, HTTP(S) and cloud management all depend on the network working.', { console: true }),

  Q('b0-rem-08', 'NF', 't0-remote', 'You are logged in over SSH and want to see log messages as they happen. Which command?', [
    ['terminal monitor', true, 'Copies log messages to your VTY session.'],
    ['logging console', false, 'That sends logs to the physical console.'],
    ['show logging', false, 'That shows the buffer, not live messages.'],
    ['debug all', false, 'Dangerous, and debugs still need terminal monitor to show over SSH.'],
  ], 'By default log and debug output goes to the console only. terminal monitor (an EXEC command, per session) copies it to your VTY session; terminal no monitor stops it.', { console: true }),

  Q('b0-rem-09', 'IPS', 't0-remote', 'Which local user command stores the password as a strong hash?', [
    ['username admin secret Str0ngPass', true, 'secret hashes the password.'],
    ['username admin password Str0ngPass', false, 'password stores plain text or weak type 7.'],
    ['user admin hash Str0ngPass', false, 'Not IOS syntax.'],
    ['enable secret admin Str0ngPass', false, 'enable secret has no username.'],
  ], 'Like enable secret versus enable password, the secret keyword stores a hash (type 5, 8 or 9 depending on version) and the password keyword does not. Always prefer secret.', { console: true }),

  Q('b0-rem-10', 'IPS', 't0-remote', 'Which complete set of lines allows SSH version 2 logins with local accounts?', [
    ['hostname R1 / ip domain-name lab.local / crypto key generate rsa modulus 2048 / username admin secret P@ss / ip ssh version 2 / line vty 0 15, login local, transport input ssh', true, 'Every prerequisite is present.'],
    ['hostname R1 / username admin secret P@ss / line vty 0 15, login local, transport input ssh', false, 'No domain name or RSA keys, so SSH never starts.'],
    ['ip domain-name lab.local / crypto key generate rsa / line vty 0 15, password cisco, login', false, 'Hostname is still Router, and there are no user accounts.'],
    ['crypto key generate rsa / ip ssh version 2 / transport input all', false, 'Missing hostname, domain and authentication.'],
  ], 'SSH needs keys (which need a hostname and domain), credentials (local users or AAA), and VTY lines that accept SSH and check those credentials. ip ssh version 2 keeps clients off the weaker version 1.', { console: true }),
];
