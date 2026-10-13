// Guided material for the switching labs: the question before each command,
// the tiles it is built from with the traps that look right, and a check.
// Same shape as guided.js.

const Q = (q, choices) => ({ q, choices: choices.map(([text, ok, why]) => ({ text, ok: Boolean(ok), why })) });
const S = (device, tiles, traps = []) => ({ device, tiles, traps: traps.map(([text, why]) => ({ text, why })) });

const ENABLE = (d) => S(d, ['enable'], [['configure terminal', 'Not yet. configure terminal only works from privileged mode (#), and the prompt still ends in >.']]);
const CONF = (d) => S(d, ['configure terminal'], [['interface', 'Interfaces are configured from global configuration. Get there first.'], ['enable', 'You are already in privileged mode; the # says so.']]);
const IFACE = (d, name, wrong, why) => S(d, ['interface', name], [[wrong, why]]);
const MASK_TRAP = ['0.0.0.255', 'That is a wildcard mask, the inverse of a subnet mask. Addresses take the subnet mask.'];

export const GUIDED_SWITCH = {
  'sw-first-boot': {
    goals: {
      hostname: {
        think: Q('The prompt reads Switch>. What does a factory-fresh switch already do?', [
          ['Switch frames: every port is up and in VLAN 1', 1, 'Right. Unlike a router, it works out of the box. It just cannot be managed yet.'],
          ['Nothing until it is configured', 0, 'Switch ports start on and forward in VLAN 1.'],
          ['Route between its ports', 0, 'An access switch like this one does not route.'],
        ]),
        steps: [ENABLE('ACC1'), CONF('ACC1'), S('ACC1', ['hostname', 'ACC1'], [['name', 'Not an IOS command. The keyword is hostname.']])],
      },
      secret: {
        think: Q('Why enable secret rather than enable password?', [
          ['The secret is stored as a hash; the password sits in plain text', 1, 'Right. Anyone who reads the config can read enable password.'],
          ['enable secret also locks the console', 0, 'The console has its own line settings.'],
          ['enable password does not work on switches', 0, 'It works. It is just weak.'],
        ]),
        steps: [S('ACC1', ['enable secret', 'Cl0set!'], [['enable password', 'It works, but it is stored in plain text. enable secret is hashed.']])],
      },
      console: {
        think: Q('You set a password on the console line. What else does the line need before IOS asks for it?', [
          ['login', 1, 'Right. password stores it; login tells the line to ask for it.'],
          ['Nothing; a password is asked for as soon as it is set', 0, 'Without login, the line never prompts.'],
          ['transport input ssh', 0, 'The console is a cable, not a network session.'],
        ]),
        steps: [
          S('ACC1', ['line console', '0'], [['line vty', 'The VTY lines are for remote sessions. The console is the cable on the front.']]),
          S('ACC1', ['password', 'C0nsole!']),
          S('ACC1', ['login'], [['login local', 'login local checks usernames. This line uses its own password.']]),
        ],
      },
      vty: {
        think: Q('How many VTY lines does a Catalyst access switch have?', [
          ['16, numbered 0 to 15', 1, 'Right. Routers often show 0 to 4; a switch has 16. Secure them all.'],
          ['5, numbered 0 to 4', 0, 'That leaves lines 5 to 15 open on a switch.'],
          ['1', 0, 'There are 16, so up to 16 remote sessions at once.'],
        ]),
        steps: [
          S('ACC1', ['line vty', '0 15'], [['0 4', 'That covers 5 of the 16 lines. Someone could still use 5 to 15.']]),
          S('ACC1', ['password', 'Vty!pass']),
          S('ACC1', ['login']),
        ],
      },
      mgmt: {
        think: Q('Where does a layer 2 switch keep its own IP address?', [
          ['On a VLAN interface (an SVI), here interface vlan 1', 1, 'Right. The SVI is the switch\'s own door into that VLAN.'],
          ['On the uplink port, Gi0/1', 0, 'Switch ports are layer 2 here; they cannot hold an address.'],
          ['It does not need one to be managed', 0, 'SSH, Telnet and ping all need an address.'],
        ]),
        steps: [
          S('ACC1', ['interface', 'vlan 1'], [['g0/1', 'Gi0/1 is a switch port; on a layer 2 switch it cannot hold an address.']]),
          S('ACC1', ['ip address', '10.20.1.2', '255.255.255.0'], [MASK_TRAP, ['10.20.1.1', 'That is R1\'s address. The switch needs its own.']]),
          S('ACC1', ['no shutdown'], [['shutdown', 'That is how it starts. The no form turns it on.']]),
        ],
        verify: Q('Vlan1 came up. What does an SVI need to be up?', [
          ['No shutdown, plus at least one port in that VLAN up and forwarding', 1, 'Right. Here that port is Gi0/1 toward R1.'],
          ['Only an IP address', 0, 'An address alone does not bring it up.'],
          ['A default gateway', 0, 'The gateway is for reaching other subnets; it does not raise the SVI.'],
        ]),
      },
      gateway: {
        think: Q('The switch can already ping R1. Why give it a default gateway?', [
          ['So it can answer management traffic from other subnets, the way a PC uses its gateway', 1, 'Right. Without it, an admin on another subnet gets no reply.'],
          ['So it can route between VLANs', 0, 'A layer 2 switch does not route, gateway or not.'],
          ['IOS requires one before saving', 0, 'You can save without it.'],
        ]),
        steps: [S('ACC1', ['ip default-gateway', '10.20.1.1'], [['ip route', 'A layer 2 switch has no routing table to put a route in. ip default-gateway is its version.'], ['10.20.1.2', 'That is the switch itself.']])],
      },
      ping: {
        think: Q('You are still in configuration mode. How do you ping without leaving?', [
          ['Put do in front of it', 1, 'Right. do runs an EXEC command from any configuration mode.'],
          ['Just type ping', 0, 'Configuration modes reject EXEC commands unless you add do.'],
          ['You cannot ping from a switch', 0, 'You can, once it has an address.'],
        ]),
        steps: [S('ACC1', ['ping', '10.20.1.1'], [['10.20.1.2', 'That is the switch\'s own address. It proves nothing about the cable.']])],
      },
      save: {
        think: Q('Which way does a save copy?', [
          ['From running config to startup config', 1, 'Right. copy SOURCE DESTINATION.'],
          ['From startup config to running config', 0, 'That merges the saved config back in. It saves nothing.'],
          ['From RAM to flash', 0, 'Configs are saved to NVRAM as startup-config.'],
        ]),
        steps: [
          S('ACC1', ['copy', 'running-config', 'startup-config'], [['startup-config', 'Order matters: copy FROM running-config TO startup-config.']]),
          S('ACC1', ['Enter'], [['n', 'IOS is offering the default name, startup-config. Enter accepts it.']]),
        ],
      },
    },
    teach: Q('An admin on another subnet tries to SSH to ACC1. What two things did you set up that make the reply possible?', [
      ['The Vlan1 address, so it has an IP, and the default gateway, so the reply can leave the subnet', 1, 'Right. A switch answers like a host does.'],
      ['The hostname and the enable secret', 0, 'Those matter for SSH keys and privilege, not for getting packets back.'],
      ['The console password and the save', 0, 'Neither one moves a packet.'],
      ['Nothing; switches route replies on their own', 0, 'A layer 2 switch needs a gateway, like a PC.'],
    ]),
  },

  'sw-mac-table': {
    goals: {
      empty: {
        think: Q('What does a switch use to decide which port a frame goes out?', [
          ['Its MAC address table: destination MAC to port', 1, 'Right. And it builds that table itself.'],
          ['Its routing table', 0, 'Routing tables hold IP networks. A switch forwards on MACs.'],
          ['It sends every frame out every port', 0, 'Only when it does not know the destination yet.'],
        ]),
        steps: [ENABLE('SW1'), S('SW1', ['show', 'mac address-table'], [['ip route', 'A switch forwards frames by MAC address, not by route.']])],
      },
      talk: {
        think: Q('PC1 sends its first frame to PC2. What does SW1 do with it?', [
          ['Learns PC1\'s MAC on its port, then floods the frame because PC2 is unknown', 1, 'Right. Learn the source, look up the destination, flood if it is missing.'],
          ['Drops it until PC2 registers', 0, 'Switches flood unknown destinations rather than dropping them.'],
          ['Asks the router where PC2 is', 0, 'There is no router here, and switching does not need one.'],
        ]),
        steps: [S('PC1', ['ping', '192.168.5.12'], [['192.168.5.11', 'That is PC1 itself.']])],
      },
      again: {
        think: Q('From which address in a frame does a switch learn?', [
          ['The source MAC', 1, 'Right. The source tells it where that device lives.'],
          ['The destination MAC', 0, 'The destination is what it looks up, not what it learns.'],
          ['The IP address', 0, 'A layer 2 switch does not look at IP to learn.'],
        ]),
        steps: [S('SW1', ['show', 'mac address-table'])],
      },
      mac: {
        think: Q('Where can you read a PC\'s own MAC address?', [
          ['On the PC: ipconfig /all, as the Physical Address', 1, 'Right. Windows writes it with dashes: 00-50-79-...'],
          ['In the PC\'s routing table', 0, 'Routing tables hold networks, not MACs.'],
          ['Only on the switch', 0, 'The PC knows its own MAC.'],
        ]),
        steps: [S('PC2', ['ipconfig', '/all'], [['/release', 'That drops a DHCP address. You only want to look.']])],
      },
      where: {
        think: Q('PC2 says 00-50-79-6B-E1-D9. How would a Cisco switch print the same MAC?', [
          ['0050.796b.e1d9', 1, 'Right. Same twelve digits, in three groups of four with dots.'],
          ['00:50:79:6B:E1:D9', 0, 'That is the Linux and macOS style. IOS uses dots.'],
          ['6be1.d900.5079', 0, 'The digits keep their order.'],
        ]),
        choices: ['Fa0/7', 'Fa0/3', 'Fa0/12', 'Gi0/1'],
      },
      pc3: {
        think: Q('Why is PC3 missing from the table?', [
          ['It has not sent a frame, and a switch only learns from frames it receives', 1, 'Right. A quiet device is invisible until it talks.'],
          ['Its port is shut down', 0, 'Its port is up; it has just been silent.'],
          ['The table is full', 0, 'A 2960 holds thousands of entries.'],
        ]),
        steps: [S('PC3', ['ping', '192.168.5.11'], [['192.168.5.13', 'That is PC3 itself; nothing leaves the PC.']])],
      },
      clear: {
        think: Q('What happens to an entry nobody refreshes?', [
          ['It ages out, after 300 seconds by default', 1, 'Right. clear removes them now instead of waiting.'],
          ['It stays forever', 0, 'Dynamic entries age out.'],
          ['It moves to the startup config', 0, 'The MAC table is never saved.'],
        ]),
        steps: [
          S('SW1', ['clear', 'mac address-table', 'dynamic'], [['ip ospf process', 'That restarts OSPF. It has nothing to do with the MAC table.']]),
          S('SW1', ['show', 'mac address-table']),
        ],
      },
    },
    teach: Q('Explain to a coworker how SW1 found out which port PC2 was on.', [
      ['PC2 sent a frame; SW1 read its source MAC and wrote it down against the port it came in on', 1, 'Right. Learning is always from the source.'],
      ['PC1 told SW1 where PC2 was when it pinged', 0, 'PC1\'s frame teaches SW1 only about PC1.'],
      ['SW1 asked every port with a broadcast', 0, 'Switches flood unknown frames, but they learn from what comes back in.'],
      ['It was configured by hand', 0, 'These entries are DYNAMIC: learned, not configured.'],
    ]),
  },

  'sw-vlans': {
    goals: {
      create: {
        think: Q('What does a VLAN do on a switch?', [
          ['Splits it into separate broadcast domains', 1, 'Right. A broadcast in VLAN 10 never reaches VLAN 20.'],
          ['Speeds up the ports in it', 0, 'Speed is unchanged.'],
          ['Encrypts traffic between its ports', 0, 'VLANs separate; they do not encrypt.'],
        ]),
        steps: [
          ENABLE('SW1'), CONF('SW1'),
          S('SW1', ['vlan', '10']), S('SW1', ['name', 'SALES'], [['description', 'VLANs take a name. description is for interfaces.']]),
          S('SW1', ['vlan', '20']), S('SW1', ['name', 'ENG']),
        ],
      },
      sales: {
        think: Q('Why set switchport mode access as well as the VLAN?', [
          ['It fixes the port as an access port, so it never negotiates a trunk with DTP', 1, 'Right. A desk port should never become a trunk.'],
          ['The VLAN does not take effect without it', 0, 'The VLAN takes effect; mode access just removes the trunk risk.'],
          ['It turns the port on', 0, 'Switch ports are already on.'],
        ]),
        steps: [
          S('SW1', ['interface range', 'f0/1 - 2'], [['interface', 'One port at a time works, but range does both in one go.']]),
          S('SW1', ['switchport mode', 'access'], [['trunk', 'A PC port carries one VLAN. That is an access port.']]),
          S('SW1', ['switchport access vlan', '10'], [['20', 'VLAN 20 is Engineering.']]),
        ],
      },
      eng: {
        think: Q('Fa0/3 and Fa0/4 are Engineering. Which VLAN?', [
          ['20', 1, 'Right.'],
          ['10', 0, 'That is Sales.'],
          ['1', 0, 'VLAN 1 is the default they are leaving.'],
        ]),
        steps: [
          S('SW1', ['interface range', 'f0/3 - 4']),
          S('SW1', ['switchport mode', 'access']),
          S('SW1', ['switchport access vlan', '20'], [['10', 'VLAN 10 is Sales.']]),
        ],
      },
      verify: {
        think: Q('Which command lists every VLAN with its access ports?', [
          ['show vlan brief', 1, 'Right. One line per VLAN, ports on the right.'],
          ['show interfaces trunk', 0, 'That only covers trunk ports.'],
          ['show running-config', 0, 'It is in there, but scattered across interfaces.'],
        ]),
        steps: [S('SW1', ['show', 'vlan brief'], [['interfaces trunk', 'There are no trunks on this switch.']])],
      },
      inside: {
        think: Q('PC1 and PC2 are both in VLAN 10. Will PC1\'s ARP request reach PC2?', [
          ['Yes: same VLAN, same broadcast domain', 1, 'Right.'],
          ['No: VLANs block ARP', 0, 'VLANs only stop broadcasts crossing between VLANs.'],
          ['Only through a router', 0, 'Same VLAN needs no router.'],
        ]),
        steps: [S('PC1', ['ping', '10.0.10.12'])],
      },
      across: {
        think: Q('PC3 is in the same subnet but VLAN 20. What happens to PC1\'s ARP for 10.0.10.13?', [
          ['It stays in VLAN 10, PC3 never hears it, and the ping fails', 1, 'Right. Same subnet does not matter; the VLAN cuts the broadcast domain.'],
          ['The switch forwards it because the subnet matches', 0, 'A layer 2 switch does not look at IP subnets.'],
          ['It works but slower', 0, 'It does not get there at all.'],
        ]),
        steps: [S('PC1', ['ping', '10.0.10.13'])],
        verify: Q('What would let PC1 reach a PC in VLAN 20?', [
          ['A router or layer 3 switch, with each VLAN in its own subnet', 1, 'Right. That is the router-on-a-stick lab.'],
          ['Putting both ports in VLAN 1', 0, 'That works by undoing the split, which is not the goal.'],
          ['A bigger subnet mask', 0, 'Masks do not cross VLANs.'],
        ]),
      },
    },
    teach: Q('Why did PC1 reach PC2 but not PC3, even though all three share one subnet?', [
      ['VLANs are separate broadcast domains; PC1\'s ARP never left VLAN 10', 1, 'Right. Layer 2 separation, regardless of the IP plan.'],
      ['PC3 has the wrong gateway', 0, 'Nothing here uses a gateway; all three share a subnet.'],
      ['The switch blocks pings between ports', 0, 'It forwards fine inside a VLAN.'],
      ['PC3\'s port is shut down', 0, 'Its port is up, in VLAN 20.'],
    ]),
  },

  'sw-trunk': {
    goals: {
      look: {
        think: Q('Both ends of the uplink are at the factory default, dynamic auto. What does that do?', [
          ['Each waits for the other to ask for a trunk; nobody asks, so it stays an access link', 1, 'Right. Two auto ports never trunk.'],
          ['They agree on a trunk automatically', 0, 'auto only answers. With two answerers, nobody starts.'],
          ['The link stays down', 0, 'It is up, as an access link in VLAN 1.'],
        ]),
        steps: [ENABLE('SW1'), S('SW1', ['show', 'interfaces', 'g0/1', 'switchport'], [['trunk', 'show interfaces trunk lists only ports that are trunking. This one is not.']])],
      },
      mode: {
        think: Q('Which line of that output says what the port is doing right now?', [
          ['Operational Mode', 1, 'Right. Administrative Mode is what was configured; Operational is the result.'],
          ['Administrative Mode', 0, 'That is the setting, not the outcome.'],
          ['Access Mode VLAN', 0, 'That says which VLAN it would use as an access port.'],
        ]),
        choices: ['static access', 'trunk', 'dynamic auto', 'down'],
      },
      trunk1: {
        think: Q('You set SW1 Gi0/1 to trunk. SW2\'s end is still dynamic auto. What happens?', [
          ['SW1 sends DTP, SW2\'s auto answers, and the link trunks', 1, 'Right. trunk and auto make a trunk.'],
          ['Nothing until SW2 is changed too', 0, 'auto answers a DTP request.'],
          ['The link goes err-disabled', 0, 'A mode mismatch here negotiates; it does not shut anything.'],
        ]),
        steps: [CONF('SW1'), IFACE('SW1', 'g0/1', 'g0/2', 'The uplink is Gi0/1.'), S('SW1', ['switchport mode', 'trunk'], [['dynamic auto', 'That is the setting that left it an access link.']])],
      },
      dtp: {
        think: Q('Which command lists only the ports that are trunking?', [
          ['show interfaces trunk', 1, 'Right.'],
          ['show vlan brief', 0, 'show vlan brief leaves trunk ports out.'],
          ['show ip interface brief', 0, 'That shows IP status, not trunking.'],
        ]),
        steps: [ENABLE('SW2'), S('SW2', ['show', 'interfaces trunk'], [['vlan brief', 'show vlan brief leaves trunk ports out.']])],
      },
      trunk2: {
        think: Q('SW2 already trunked through DTP. Why configure it anyway?', [
          ['So the trunk does not depend on negotiation; static on both ends is the safe build', 1, 'Right. Many shops also turn DTP off with switchport nonegotiate.'],
          ['DTP trunks carry only VLAN 1', 0, 'A negotiated trunk carries every allowed VLAN.'],
          ['It will not pass traffic otherwise', 0, 'It passes traffic; it is just fragile.'],
        ]),
        steps: [CONF('SW2'), IFACE('SW2', 'g0/1', 'g0/2', 'The uplink is Gi0/1.'), S('SW2', ['switchport mode', 'trunk'])],
      },
      allowed: {
        think: Q('By default, which VLANs does a trunk allow?', [
          ['All of them, 1 to 4094', 1, 'Right. Trimming the list keeps unwanted VLANs off the link.'],
          ['Only VLAN 1', 0, 'VLAN 1 is the default native VLAN, not the whole list.'],
          ['None until you list them', 0, 'Everything is allowed until you trim it.'],
        ]),
        steps: [
          S('SW1', ['switchport trunk allowed vlan', '10,20'], [['add 10,20', 'add appends to the current list, which is already every VLAN.']]),
          S('SW2', ['switchport trunk allowed vlan', '10,20']),
        ],
      },
      native: {
        think: Q('What is the native VLAN on an 802.1Q trunk?', [
          ['The one VLAN sent untagged; both ends must agree on it', 1, 'Right. Moving it off VLAN 1 is a common hardening step.'],
          ['The VLAN with the most ports', 0, 'It is a setting on the trunk, not a count.'],
          ['The VLAN the management address is in', 0, 'Those are separate choices.'],
        ]),
        steps: [
          S('SW1', ['vlan', '99']), S('SW1', ['name', 'NATIVE']), IFACE('SW1', 'g0/1', 'f0/1', 'Fa0/1 is PC1. The trunk is Gi0/1.'),
          S('SW1', ['switchport trunk native vlan', '99'], [['switchport access vlan', 'That is for access ports.']]),
          S('SW2', ['vlan', '99']), S('SW2', ['name', 'NATIVE']), IFACE('SW2', 'g0/1', 'f0/1', 'The trunk is Gi0/1.'),
          S('SW2', ['switchport trunk native vlan', '99']),
        ],
        verify: Q('Between your two changes, the console logged %CDP-4-NATIVE_VLAN_MISMATCH. What was it saying?', [
          ['For a moment the two ends disagreed on which VLAN goes untagged', 1, 'Right. Left like that, untagged traffic leaks between VLANs.'],
          ['VLAN 99 did not exist', 0, 'You created it first.'],
          ['CDP stopped working', 0, 'CDP was what noticed it.'],
        ]),
      },
      ping: {
        think: Q('PC1 (SW1) and PC2 (SW2) are both in VLAN 10. How do their frames cross between the switches?', [
          ['Over the trunk, tagged VLAN 10', 1, 'Right. The tag tells SW2 which VLAN the frame belongs to.'],
          ['Over a separate cable for VLAN 10', 0, 'One trunk carries every allowed VLAN.'],
          ['Through a router', 0, 'Same VLAN needs no router.'],
        ]),
        steps: [S('PC1', ['ping', '10.0.10.12']), S('PC3', ['ping', '10.0.20.12'])],
      },
      add: {
        think: Q('The list is 10,20. What does switchport trunk allowed vlan 30 do?', [
          ['Replaces the list with just 30, cutting off Sales and Engineering', 1, 'Right. That is a classic outage. add appends instead.'],
          ['Adds 30 to the list', 0, 'Without add, the list is replaced.'],
          ['Nothing until VLAN 30 exists', 0, 'It takes effect at once.'],
        ]),
        steps: [
          IFACE('SW1', 'g0/1', 'f0/1', 'The trunk is Gi0/1.'),
          S('SW1', ['switchport trunk allowed vlan', 'add', '30'], [['remove', 'That takes VLANs off the list.'], ['except', 'except allows everything but the VLAN you name.']]),
          IFACE('SW2', 'g0/1', 'f0/1', 'The trunk is Gi0/1.'),
          S('SW2', ['switchport trunk allowed vlan', 'add', '30']),
        ],
      },
    },
    teach: Q('Why could PC1 not reach PC2 at the start, when both were already in VLAN 10?', [
      ['The link between the switches was an access link in VLAN 1, so VLAN 10 had no path across', 1, 'Right. Two dynamic auto ends never trunk.'],
      ['VLAN 10 had different names on the two switches', 0, 'Names are labels; the number is what matters.'],
      ['The PCs needed a gateway', 0, 'Same subnet, same VLAN: no gateway involved.'],
      ['Spanning tree was blocking the uplink', 0, 'There is only one link, so nothing to block.'],
    ]),
  },

  'sw-roas': {
    goals: {
      trunk: {
        think: Q('R1 has one cable for two VLANs. What must SW1\'s end of that cable be?', [
          ['A trunk, carrying both VLANs tagged', 1, 'Right. Routers do not speak DTP, so set it by hand.'],
          ['An access port in VLAN 10', 0, 'Then VLAN 20 has no way to R1.'],
          ['Two access ports', 0, 'There is one cable.'],
        ]),
        steps: [ENABLE('SW1'), CONF('SW1'), IFACE('SW1', 'g0/1', 'f0/1', 'Fa0/1 is PC1. R1 is on Gi0/1.'), S('SW1', ['switchport mode', 'trunk'], [['access', 'An access port carries one VLAN. R1 needs both.']])],
      },
      up: {
        think: Q('Does R1\'s physical Gi0/0 need an IP address?', [
          ['No. The addresses go on subinterfaces; Gi0/0 just needs no shutdown', 1, 'Right. Subinterfaces ride on the physical port.'],
          ['Yes, one for each VLAN', 0, 'One interface, one address. Each VLAN gets a subinterface.'],
          ['Yes, from VLAN 1', 0, 'Nothing here is in VLAN 1.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1'), IFACE('R1', 'g0/0', 'g0/1', 'The cable to SW1 is on Gi0/0.'), S('R1', ['no shutdown'], [['shutdown', 'It is already down. The no form turns it on.']])],
      },
      sub10: {
        think: Q('Why does encapsulation dot1q 10 come before the address?', [
          ['IOS will not address a subinterface until it knows which VLAN tag it handles', 1, 'Right. Try it the other way round and IOS says so.'],
          ['It does not matter; either order works', 0, 'IOS refuses the address first.'],
          ['Encapsulation sets the speed', 0, 'It sets the 802.1Q tag.'],
        ]),
        steps: [
          S('R1', ['interface', 'g0/0.10'], [['g0/0', 'That is the physical port. The VLAN 10 gateway goes on a subinterface.']]),
          S('R1', ['encapsulation dot1q', '10'], [['20', 'VLAN 10 is Sales.']]),
          S('R1', ['ip address', '10.0.10.1', '255.255.255.0'], [MASK_TRAP, ['10.0.10.11', 'That is PC1. The gateway is .1.']]),
        ],
      },
      sub20: {
        think: Q('Gi0/0.20 serves Engineering. What tag and address?', [
          ['dot1q 20, 10.0.20.1/24', 1, 'Right. The address PC2 uses as its gateway.'],
          ['dot1q 10, 10.0.20.1/24', 0, 'VLAN 10 is already on .10. Two subinterfaces cannot share a tag.'],
          ['dot1q 20, 10.0.10.1/24', 0, 'That subnet overlaps .10.'],
        ]),
        steps: [
          S('R1', ['interface', 'g0/0.20']),
          S('R1', ['encapsulation dot1q', '20'], [['10', 'VLAN 10 is on .10 already.']]),
          S('R1', ['ip address', '10.0.20.1', '255.255.255.0'], [MASK_TRAP]),
        ],
      },
      table: {
        think: Q('How many C routes should R1 show now?', [
          ['Two: one for each subinterface\'s subnet', 1, 'Right. Plus an L line for each of its own addresses.'],
          ['One, for Gi0/0', 0, 'Gi0/0 has no address. The subinterfaces do.'],
          ['None until a routing protocol runs', 0, 'Connected routes need no protocol.'],
        ]),
        steps: [S('R1', ['show', 'ip route'])],
      },
      ping: {
        think: Q('PC1 pings PC2 in another subnet. Where does PC1 send the packet?', [
          ['To its gateway, 10.0.10.1, R1\'s .10 subinterface', 1, 'Right. Off-subnet traffic always goes to the gateway.'],
          ['Straight to PC2', 0, 'PC2 is on another subnet and VLAN.'],
          ['To SW1, which routes it', 0, 'SW1 only switches; R1 routes.'],
        ]),
        steps: [S('PC1', ['ping', '10.0.20.11'])],
      },
      trace: {
        think: Q('On a Windows prompt, which command lists the routers along the way?', [
          ['tracert', 1, 'Right. IOS spells it traceroute.'],
          ['traceroute', 0, 'That is the IOS and Linux spelling.'],
          ['pathping only', 0, 'pathping exists, but tracert is the one to know.'],
        ]),
        steps: [S('PC1', ['tracert', '10.0.20.11'], [['10.0.10.1', 'Trace to the far PC. The gateway shows up as hop 1 by itself.']])],
      },
    },
    teach: Q('Explain how one cable lets R1 route between two VLANs.', [
      ['The switch port is a trunk, so frames arrive tagged; each R1 subinterface handles one tag and is that VLAN\'s gateway', 1, 'Right. Router on a stick.'],
      ['R1 has two addresses on Gi0/0', 0, 'An interface holds one primary address. Subinterfaces hold one each.'],
      ['SW1 routes and R1 only forwards', 0, 'The other way around.'],
      ['VLAN 1 carries both subnets', 0, 'Each VLAN rides tagged on the trunk.'],
    ]),
  },

  'sw-etherchannel': {
    goals: {
      look: {
        think: Q('There are two links between the same two switches. What does spanning tree do about it?', [
          ['Blocks one, because two links form a loop', 1, 'Right. Safe, but half the bandwidth idles.'],
          ['Shares traffic across both', 0, 'Spanning tree blocks; it does not share.'],
          ['Nothing; loops are fine between two switches', 0, 'A layer 2 loop melts the network with broadcasts.'],
        ]),
        steps: [ENABLE('SW2'), S('SW2', ['show', 'spanning-tree'])],
      },
      blocked: {
        think: Q('In show spanning-tree, which role and state mark a blocked port?', [
          ['Altn BLK', 1, 'Right. An alternate port, blocking.'],
          ['Root FWD', 0, 'That is the best path to the root.'],
          ['Desg FWD', 0, 'That forwards.'],
        ]),
        choices: ['Gi0/2', 'Gi0/1', 'Fa0/1', 'Po1'],
      },
      sw1: {
        think: Q('LACP has two modes. Which one starts the negotiation?', [
          ['active', 1, 'Right. passive only answers.'],
          ['passive', 0, 'passive waits to be asked.'],
          ['on', 0, 'on is not LACP at all: it forces a bundle with no negotiation.'],
        ]),
        steps: [
          ENABLE('SW1'), CONF('SW1'), S('SW1', ['interface range', 'g0/1 - 2']),
          S('SW1', ['channel-group', '1', 'mode', 'active'], [['on', 'on forces a bundle with no negotiation. The work order says LACP.'], ['desirable', 'desirable is PAgP, Cisco\'s own protocol. The work order says LACP.']]),
        ],
      },
      sw2: {
        think: Q('SW1 is active. Which SW2 modes would bundle with it?', [
          ['active or passive', 1, 'Right. Two passives would never start.'],
          ['Only on', 0, 'on does not run LACP.'],
          ['auto or desirable', 0, 'Those are PAgP modes.'],
        ]),
        steps: [
          CONF('SW2'), S('SW2', ['interface range', 'g0/1 - 2']),
          S('SW2', ['channel-group', '1', 'mode', 'passive'], [['auto', 'auto is PAgP. LACP\'s answering mode is passive.']]),
        ],
      },
      bundled: {
        think: Q('In show etherchannel summary, what does (P) next to a port mean?', [
          ['Bundled in the port-channel', 1, 'Right. (I) is stand-alone, (s) suspended, (D) down.'],
          ['Passive mode', 0, 'The flag is about state, not mode.'],
          ['Primary link', 0, 'All bundled links are equal members.'],
        ]),
        steps: [S('SW1', ['show', 'etherchannel summary'])],
      },
      stp: {
        think: Q('How many ports between SW1 and SW2 does spanning tree see now?', [
          ['One: Port-channel 1', 1, 'Right. No loop, nothing to block.'],
          ['Two, one blocked', 0, 'The bundle is one logical link.'],
          ['None; EtherChannel turns spanning tree off', 0, 'Spanning tree still runs; it sees the channel as one port.'],
        ]),
        steps: [S('SW2', ['show', 'spanning-tree'])],
      },
      ping: {
        think: Q('If one member link fails, what happens to PC1\'s traffic?', [
          ['It moves to the other member and the channel stays up', 1, 'Right. Redundancy without a spanning tree reconvergence.'],
          ['It stops until spanning tree reconverges', 0, 'The channel absorbs a member failure.'],
          ['The channel goes err-disabled', 0, 'Losing one member just leaves fewer members.'],
        ]),
        steps: [S('PC1', ['ping', '10.0.1.12'])],
      },
    },
    teach: Q('Why did bundling the links get rid of the blocked port?', [
      ['Spanning tree sees the bundle as one logical link, so there is no loop left to break', 1, 'Right. Both members now carry traffic.'],
      ['LACP turns spanning tree off', 0, 'It is still running; it sees one port.'],
      ['The second link was removed', 0, 'Both links are members.'],
      ['passive mode blocks nothing', 0, 'The mode is about negotiation, not spanning tree.'],
    ]),
  },

  'sw-stp': {
    goals: {
      look: {
        think: Q('How is the root bridge chosen?', [
          ['Lowest bridge ID: priority first, then MAC address', 1, 'Right. With every priority at the default, the lowest MAC wins.'],
          ['The switch that boots first', 0, 'Boot order does not decide it.'],
          ['The switch with the most ports', 0, 'Port count plays no part.'],
        ]),
        steps: [ENABLE('DIST1'), S('DIST1', ['show', 'spanning-tree'])],
      },
      who: {
        think: Q('DIST1 is not the root. Which line points toward the root?', [
          ['The Port line under Root ID: DIST1\'s root port', 1, 'Right. Follow that port to its neighbor.'],
          ['The Bridge ID block', 0, 'That describes DIST1 itself.'],
          ['Hello Time', 0, 'That is a timer.'],
        ]),
        choices: ['ACC1', 'DIST1', 'DIST2', 'No root; there is a loop'],
      },
      primary: {
        think: Q('What does spanning-tree vlan 1 root primary set?', [
          ['A priority low enough to win: 24576, or lower if the current root is already below that', 1, 'Right. It is a macro that picks a priority.'],
          ['Priority 0 on every VLAN', 0, 'It sets one value, only for the VLANs you name.'],
          ['It locks the root forever', 0, 'A lower priority elsewhere would still win.'],
        ]),
        steps: [CONF('DIST1'), S('DIST1', ['spanning-tree vlan', '1', 'root primary'], [['root secondary', 'Secondary sets the backup.'], ['priority 61440', 'Higher numbers lose. Lower wins.']])],
      },
      secondary: {
        think: Q('What does root secondary set?', [
          ['28672: lower than the default, higher than the root', 1, 'Right. If DIST1 fails, DIST2 wins next.'],
          ['24576, the same as primary', 0, 'Then the tie breaks on MAC; secondary sits just behind.'],
          ['32768, the default', 0, 'That would leave ACC1 as the backup.'],
        ]),
        steps: [ENABLE('DIST2'), CONF('DIST2'), S('DIST2', ['spanning-tree vlan', '1', 'root secondary'])],
      },
      blocked: {
        think: Q('On a link where both ends are the same cost from the root, which end is designated?', [
          ['The end on the switch with the lower bridge ID', 1, 'Right. The other end blocks.'],
          ['Both ends', 0, 'One end of each link that would loop has to block.'],
          ['The end with the higher MAC', 0, 'Lower wins every tie in spanning tree.'],
        ]),
        steps: [ENABLE('ACC1'), S('ACC1', ['show', 'spanning-tree'])],
        choices: ['ACC1 Gi0/2', 'DIST2 Gi0/2', 'DIST1 Gi0/1', 'ACC1 Gi0/1'],
      },
      rapid: {
        think: Q('What does Rapid PVST+ change?', [
          ['Convergence drops from 30 to 50 seconds to a few, still with one tree per VLAN', 1, 'Right. Same roles, faster handshake.'],
          ['It merges all VLANs into one tree', 0, 'That would be MST. Rapid PVST+ keeps one per VLAN.'],
          ['It removes blocked ports', 0, 'Loops still need a blocked port.'],
        ]),
        steps: [
          S('DIST1', ['spanning-tree mode', 'rapid-pvst'], [['pvst', 'That is the classic mode it already runs.']]),
          S('DIST2', ['spanning-tree mode', 'rapid-pvst']),
          CONF('ACC1'), S('ACC1', ['spanning-tree mode', 'rapid-pvst']),
        ],
      },
      edge: {
        think: Q('Why add BPDU Guard to a PortFast port?', [
          ['PortFast assumes a host. BPDU Guard shuts the port if a switch ever appears there', 1, 'Right. The safety net for PortFast.'],
          ['It makes PortFast faster', 0, 'It is a guard, not a speed-up.'],
          ['It blocks the PC\'s traffic', 0, 'PCs send no BPDUs, so they are never affected.'],
        ]),
        steps: [
          IFACE('ACC1', 'f0/1', 'g0/1', 'Gi0/1 is an uplink to DIST1. PortFast belongs on host ports.'),
          S('ACC1', ['spanning-tree portfast']),
          S('ACC1', ['spanning-tree bpduguard', 'enable'], [['disable', 'That turns it off.']]),
        ],
      },
    },
    teach: Q('ACC1 was root at the start. Why was that a problem?', [
      ['Traffic between the distribution switches detoured through an access switch in a closet', 1, 'Right. The root should sit where the traffic converges.'],
      ['ACC1 could not forward while it was root', 0, 'The root forwards on every port.'],
      ['Being root disables PortFast', 0, 'Unrelated.'],
      ['Nothing; the root can be anywhere', 0, 'Placement shapes every path in the tree.'],
    ]),
  },

  'sw-portsec': {
    goals: {
      psec1: {
        think: Q('With only switchport port-security, what are the defaults?', [
          ['1 MAC address, and shut the port down on a violation', 1, 'Right. Maximum 1, violation shutdown.'],
          ['Unlimited MACs, log violations', 0, 'The default is strict: one.'],
          ['1 MAC, drop the extra traffic silently', 0, 'That is protect mode. The default is shutdown.'],
        ]),
        steps: [
          ENABLE('SW1'), CONF('SW1'), IFACE('SW1', 'f0/1', 'f0/2', 'PC1 is on Fa0/1.'),
          S('SW1', ['switchport port-security']),
          S('SW1', ['switchport port-security', 'mac-address sticky'], [['maximum 1', 'That is already the default.']]),
        ],
      },
      see: {
        think: Q('What does sticky do with the MAC it learns?', [
          ['Writes it into the running config, so a save keeps it through a reload', 1, 'Right. Learned once, then treated as configured.'],
          ['Forgets it after 5 minutes', 0, 'That would be aging; sticky entries do not age.'],
          ['Sends it to the router', 0, 'It stays on the switch.'],
        ]),
        steps: [S('SW1', ['show', 'running-config'], [['vlan brief', 'show vlan brief lists ports, not their security settings.']])],
      },
      psec2: {
        think: Q('Fa0/2 has two PCs behind a desk switch, and port security allows one. What will happen?', [
          ['The second MAC is a violation, and the port shuts down (err-disabled)', 1, 'Right. Watch the console.'],
          ['Only the first PC works', 0, 'That is protect or restrict. The default is shutdown.'],
          ['Nothing until a PC is unplugged', 0, 'It reacts as soon as it sees too many MACs.'],
        ]),
        steps: [IFACE('SW1', 'f0/2', 'f0/1', 'The desk switch is on Fa0/2.'), S('SW1', ['switchport port-security'])],
      },
      state: {
        think: Q('Which command shows a one-word status for every port?', [
          ['show interfaces status', 1, 'Right. The Status column.'],
          ['show ip interface brief', 0, 'That shows down/down, which hides why.'],
          ['show vlan brief', 0, 'That lists VLAN membership.'],
        ]),
        steps: [S('SW1', ['show', 'interfaces status'])],
        choices: ['err-disabled', 'administratively down', 'connected', 'notconnect'],
      },
      fix: {
        think: Q('You raise the maximum to 2. Why is the port still down?', [
          ['err-disabled only clears with shutdown, then no shutdown', 1, 'Right. Or errdisable recovery, if it is configured.'],
          ['The new maximum needs a reload', 0, 'It takes effect at once; the port just needs a bounce.'],
          ['The sticky MAC blocks it', 0, 'The port is disabled, not filtering.'],
        ]),
        steps: [
          S('SW1', ['switchport port-security maximum', '2'], [['1', 'One is what tripped it.']]),
          S('SW1', ['shutdown']),
          S('SW1', ['no shutdown']),
        ],
      },
      ping: {
        think: Q('Fa0/2 now allows 2 MACs. How many devices sit behind it?', [
          ['Two, so both fit', 1, 'Right.'],
          ['Three, counting the desk switch', 0, 'An unmanaged switch sends no frames of its own here.'],
          ['One', 0, 'PC2 and PC3 both sit behind it.'],
        ]),
        steps: [S('PC2', ['ping', '10.0.10.11'])],
      },
      park: {
        think: Q('Why park unused ports in an unused VLAN as well as shutting them?', [
          ['If someone re-enables one, it still lands nowhere useful', 1, 'Right. Two locks on the same door.'],
          ['Shut ports still forward VLAN 1', 0, 'A shut port forwards nothing.'],
          ['IOS requires a VLAN before shutdown', 0, 'It does not.'],
        ]),
        steps: [
          S('SW1', ['vlan', '999']), S('SW1', ['name', 'PARKING']),
          S('SW1', ['interface range', 'f0/3 - 24'], [['f0/1 - 24', 'Fa0/1 and Fa0/2 are in use.']]),
          S('SW1', ['switchport mode', 'access']),
          S('SW1', ['switchport access vlan', '999']),
          S('SW1', ['shutdown']),
        ],
      },
      verify: {
        think: Q('In show port-security, what will SecurityViolation say for Fa0/2?', [
          ['1: the violation from the desk switch is still counted', 1, 'Right. The count survives the bounce.'],
          ['0, since you fixed it', 0, 'Fixing it does not erase history.'],
          ['2, one per PC', 0, 'One event shut the port.'],
        ]),
        steps: [S('SW1', ['show', 'port-security'])],
      },
    },
    teach: Q('Why did Fa0/2 shut itself, and what brought it back?', [
      ['Two MACs arrived where one was allowed; raising the maximum and bouncing the port (shut, no shut) restored it', 1, 'Right.'],
      ['The desk switch sent BPDUs', 0, 'That would be BPDU Guard, and an unmanaged switch sends none.'],
      ['Sticky learning filled the table', 0, 'Sticky was only on Fa0/1.'],
      ['VLAN 10 was full', 0, 'VLANs have no device limit like that.'],
    ]),
  },

  'sw-cdp': {
    goals: {
      look: {
        think: Q('CDP works at which layer?', [
          ['Layer 2: it finds neighbors even with no IP addresses configured', 1, 'Right. That is why it works on a fresh closet.'],
          ['Layer 3: it needs routing', 0, 'It needs no IP at all.'],
          ['Layer 7, through a web portal', 0, 'It is a protocol between directly connected devices.'],
        ]),
        steps: [ENABLE('CORE'), S('CORE', ['show', 'cdp neighbors'], [['lldp neighbors', 'LLDP is off until someone turns it on.']])],
      },
      edgeport: {
        think: Q('In show cdp neighbors, which column is the port on CORE itself?', [
          ['Local Intrfce', 1, 'Right. Port ID is the neighbor\'s side.'],
          ['Port ID', 0, 'That is the port on the neighbor.'],
          ['Platform', 0, 'That is the model.'],
        ]),
        choices: ['Fa0/24', 'Gi0/1', 'Gi0/2', 'Gi0/0'],
      },
      sw3port: {
        think: Q('Which column is the port on the neighbor\'s side?', [
          ['Port ID', 1, 'Right.'],
          ['Local Intrfce', 0, 'That is CORE\'s side.'],
          ['Holdtme', 0, 'That is a timer.'],
        ]),
        choices: ['Gi0/1', 'Gi0/2', 'Fa0/24', 'Fa0/1'],
      },
      edgeip: {
        think: Q('Which command adds each neighbor\'s IP address and software version?', [
          ['show cdp neighbors detail', 1, 'Right. Also show cdp entry NAME for one device.'],
          ['show ip route', 0, 'That is CORE\'s view of networks, not neighbors.'],
          ['show arp', 0, 'ARP lists IP-to-MAC pairs, with no device names.'],
        ]),
        steps: [S('CORE', ['show', 'cdp neighbors', 'detail'])],
        choices: ['172.16.0.1', '172.16.0.2', '10.0.0.1', '192.168.1.1'],
      },
      lldp: {
        think: Q('How does LLDP differ from CDP?', [
          ['It is an open standard any vendor can run; on Cisco gear it is off by default', 1, 'Right. CDP is Cisco-only and on by default.'],
          ['It works across routers', 0, 'Both only see directly connected neighbors.'],
          ['It needs IP addresses', 0, 'Both work at layer 2.'],
        ]),
        steps: [
          CONF('CORE'), S('CORE', ['lldp run'], [['cdp run', 'CDP is already running.']]),
          ENABLE('SW2'), CONF('SW2'), S('SW2', ['lldp run']),
        ],
      },
      lldpsee: {
        think: Q('Why will only SW2 show up in show lldp neighbors?', [
          ['Only SW2 also runs LLDP', 1, 'Right. Both ends have to speak it.'],
          ['LLDP only sees switches', 0, 'It sees any device that runs it.'],
          ['LLDP shows one neighbor at a time', 0, 'It lists them all.'],
        ]),
        steps: [S('CORE', ['show', 'lldp neighbors'])],
      },
      nocdp: {
        think: Q('Why turn CDP off toward a device you do not manage?', [
          ['CDP tells anyone listening your model, software version and addresses', 1, 'Right. Useful inside, a gift to an attacker outside.'],
          ['CDP uses a lot of bandwidth', 0, 'A few bytes a minute.'],
          ['CDP breaks the ISP\'s routing', 0, 'It does nothing to routing.'],
        ]),
        steps: [
          IFACE('CORE', 'f0/24', 'g0/1', 'Gi0/1 goes to SW2. EDGE is on Fa0/24.'),
          S('CORE', ['no', 'cdp enable'], [['no cdp run', 'That stops CDP on every port, including the ones you still want.']]),
        ],
      },
    },
    teach: Q('How did you find EDGE\'s address without logging in to it?', [
      ['CDP: EDGE advertises its address to directly connected Cisco devices, and show cdp neighbors detail prints it', 1, 'Right.'],
      ['By pinging the subnet', 0, 'That would find live addresses, not which device owns them.'],
      ['From CORE\'s routing table', 0, 'Routes name networks, not devices.'],
      ['LLDP told CORE', 0, 'EDGE does not run LLDP here.'],
    ]),
  },

  'pc-addressing': {
    goals: {
      look: {
        think: Q('What does a PC need to talk beyond its own subnet?', [
          ['An address, a mask and a default gateway', 1, 'Right. Plus DNS for names, which is not needed here.'],
          ['Only an address', 0, 'Without a mask it cannot tell local from remote.'],
          ['A MAC address from the switch', 0, 'The PC has its own MAC.'],
        ]),
        steps: [S('PC1', ['ipconfig'], [['/release', 'That is for giving back a DHCP address. Just look.']])],
      },
      set: {
        think: Q('The gateway must be on which subnet?', [
          ['The PC\'s own subnet: it is the router\'s address on this LAN', 1, 'Right. The PC has to be able to ARP for it.'],
          ['The server\'s subnet', 0, 'PC1 cannot ARP across subnets. That is why it needs the gateway.'],
          ['Any subnet, as long as it is pingable', 0, 'It has to be local.'],
        ]),
        steps: [S('PC1', ['ipconfig', '192.168.50.30', '255.255.255.0', '192.168.50.1'], [['192.168.50.20', 'That is PC2. Two hosts cannot share an address.'], MASK_TRAP])],
      },
      local: {
        think: Q('PC2 is 192.168.50.20/24. Does PC1 use the gateway to reach it?', [
          ['No: same subnet, so PC1 ARPs for PC2 directly', 1, 'Right. The mask decides.'],
          ['Yes, everything goes through the gateway', 0, 'Only off-subnet traffic does.'],
          ['Only if DNS is set', 0, 'There is no name involved.'],
        ]),
        steps: [S('PC1', ['ping', '192.168.50.20'])],
      },
      gateway: {
        think: Q('Why ping the gateway on its own?', [
          ['It is the first hop for everything off the subnet; if it fails, nothing far will work', 1, 'Right. Test from the inside out.'],
          ['To register the PC with the router', 0, 'Routers do not register PCs.'],
          ['It sets the gateway', 0, 'ipconfig did that.'],
        ]),
        steps: [S('PC1', ['ping', '192.168.50.1'])],
      },
      far: {
        think: Q('198.51.100.10 is off the subnet. Whose MAC does PC1 put in the frame?', [
          ['The gateway\'s, R1\'s', 1, 'Right. The IP is the server\'s; the MAC is the next hop\'s.'],
          ['The server\'s', 0, 'PC1 cannot learn a MAC across a router.'],
          ['The switch\'s', 0, 'The switch forwards frames; it is not their destination.'],
        ]),
        steps: [S('PC1', ['ping', '198.51.100.10'])],
      },
      trace: {
        think: Q('How many lines should tracert show to the server?', [
          ['Two: R1, then the server', 1, 'Right. The switch does not show up; it does not route.'],
          ['Three: SW1, R1, the server', 0, 'A layer 2 switch is invisible to tracert.'],
          ['One', 0, 'There is a router in between.'],
        ]),
        steps: [S('PC1', ['tracert', '198.51.100.10'])],
      },
    },
    teach: Q('PC1 reached PC2 before the gateway mattered. Why?', [
      ['PC2 is on the same subnet, so PC1 delivered straight to it; the gateway is only for other subnets', 1, 'Right.'],
      ['The switch routed it', 0, 'A layer 2 switch does not route.'],
      ['PC2 was the gateway', 0, 'R1 is the gateway.'],
      ['The ping was cached', 0, 'Nothing is cached here.'],
    ]),
  },
};
