// Guided mode for the labs: the thinking first, then the command built from a
// bank of tiles, then a check that it did what you meant.
//
// For each goal:
//   think   a multiple-choice question about why, asked before any command
//   steps   the commands, each built from tiles in order; `traps` are wrong
//           tiles that look right, each with the reason it is wrong
//   verify  optional: what to look at to prove it worked
// Each lab ends with a teach-back: pick the best explanation of what you did.
//
// Mode changes (enable, configure terminal, interface ...) are steps too,
// because knowing which mode a command lives in is half of IOS. A mode step
// the router is already in is skipped at run time.

import { GUIDED_SWITCH } from './guided-switch.js';

const Q = (q, choices) => ({ q, choices: choices.map(([text, ok, why]) => ({ text, ok: Boolean(ok), why })) });
const S = (device, tiles, traps = []) => ({ device, tiles, traps: traps.map(([text, why]) => ({ text, why })) });

const ENABLE = (d) => S(d, ['enable'], [['configure terminal', 'Not yet. configure terminal only works from privileged mode (#), and the prompt still ends in >.']]);
const CONF = (d) => S(d, ['configure terminal'], [['interface', 'Interfaces are configured from global configuration. Get there first.'], ['enable', 'You are already in privileged mode; the # says so.']]);
const IFACE = (d, name, wrong, why) => S(d, ['interface', name], [[wrong, why]]);
const MASK_TRAP = ['0.0.0.255', 'That is a wildcard mask, the inverse of a subnet mask. ip address and ip route take the subnet mask; OSPF network statements take the wildcard.'];
const WILD_TRAP = ['255.255.255.0', 'That is a subnet mask. A network statement takes a wildcard, its inverse: 0.0.0.255.'];

export const GUIDED = {
  'ios-first-boot': {
    goals: {
      config: {
        think: Q('The prompt reads Router>. What does the > tell you?', [
          ['User EXEC: you can look at a few things and change nothing', 1, 'Right. > is the lowest level. enable takes you to #.'],
          ['Privileged EXEC', 0, 'Privileged EXEC ends in #.'],
          ['Global configuration', 0, 'That prompt reads Router(config)#.'],
          ['The router is locked', 0, 'It is just the starting level. Nothing is locked yet.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1')],
      },
      hostname: {
        think: Q('Where does a setting for the whole router, like its name, live?', [
          ['Global configuration', 1, 'Right. Router-wide settings go in global configuration, (config)#.'],
          ['Interface configuration', 0, 'Interface mode is for one port at a time.'],
          ['Privileged EXEC', 0, 'EXEC modes look and operate; changes happen in configuration modes.'],
          ['On the console cable', 0, 'The cable only carries your typing.'],
        ]),
        steps: [S('R1', ['hostname', 'R1'], [['name', 'Not an IOS command. The keyword is hostname.']])],
        verify: Q('How can you tell the name took?', [
          ['The prompt changed to R1(config)#', 1, 'Right. IOS shows the hostname in every prompt.'],
          ['The router reboots', 0, 'Changing the hostname takes effect immediately, no reboot.'],
          ['A message says "hostname set"', 0, 'IOS says nothing when a command works. Silence is success.'],
        ]),
      },
      secret: {
        think: Q('Why enable secret instead of enable password?', [
          ['enable secret is stored as a hash; enable password sits in plain text', 1, 'Right. Anyone who sees the config can read enable password.'],
          ['enable secret also locks the console', 0, 'The console has its own login settings.'],
          ['enable password no longer works', 0, 'It works. It is just weak.'],
        ]),
        steps: [S('R1', ['enable secret', 'Cisco123!'], [['enable password', 'It works, but it is stored in plain text. enable secret is hashed.']])],
      },
      ip: {
        think: Q('The work order says 10.0.12.1/24. What is /24 as a dotted mask?', [
          ['255.255.255.0', 1, 'Right. 24 ones, then 8 zeros.'],
          ['0.0.0.255', 0, 'That is the wildcard, the inverse. Interfaces take the subnet mask.'],
          ['255.255.0.0', 0, 'That is /16.'],
          ['255.255.255.255', 0, 'That is /32, a single host.'],
        ]),
        steps: [
          IFACE('R1', 'g0/0', 'g0/1', 'Gi0/1 is not the cable to R2. The work order says Gi0/0.'),
          S('R1', ['ip address', '10.0.12.1', '255.255.255.0'], [MASK_TRAP, ['10.0.12.2', 'That is R2\'s address. Two devices on a link cannot share one.']]),
        ],
      },
      desc: {
        think: Q('What does an interface description change on the network?', [
          ['Nothing. It is a label for the next person who reads the config', 1, 'Right. Descriptions are free, and they save the next tech from guessing.'],
          ['It names the link for OSPF', 0, 'Routing protocols ignore descriptions.'],
          ['It is shown to the device on the other end', 0, 'It stays on this router.'],
        ]),
        steps: [S('R1', ['description', 'Link to R2'], [['banner motd', 'A banner is shown at login. It does not label an interface.']])],
      },
      up: {
        think: Q('show ip interface brief would say Gi0/0 is "administratively down". Why?', [
          ['Router interfaces start shut down until someone enables them', 1, 'Right. Switch ports usually start on; router ports do not.'],
          ['The cable is unplugged', 0, 'An unplugged cable shows down/down, not administratively down.'],
          ['It needs an IP address first', 0, 'An address does not bring a port up by itself.'],
        ]),
        steps: [S('R1', ['no shutdown'], [['shutdown', 'That is the state it is already in. The no form turns it on.']])],
        verify: Q('Which console line proves the link is up?', [
          ['%LINEPROTO-5-UPDOWN: ... changed state to up', 1, 'Right. Line protocol up means the far end answered too.'],
          ['Enter configuration commands, one per line', 0, 'That appears when you enter configuration mode.'],
          ['% Incomplete command', 0, 'That is an error message.'],
        ]),
      },
      ping: {
        think: Q('You are at R1(config-if)#. How do you run ping without leaving?', [
          ['Put do in front of it', 1, 'Right. do runs an EXEC command from any configuration mode.'],
          ['Just type ping', 0, 'Configuration modes reject EXEC commands unless you add do.'],
          ['Type exit until you reach #', 0, 'That works, but do saves the trip.'],
        ]),
        steps: [S('R1', ['ping', '10.0.12.2'], [['10.0.12.1', 'That is R1\'s own address. It proves nothing about the cable.']])],
        verify: Q('What does !!!!! mean?', [
          ['All 5 pings got a reply', 1, 'Right. Each ! is a reply; each . is a timeout.'],
          ['5 errors', 0, 'Errors show as dots or letters, not !.'],
          ['The link is congested', 0, 'Congestion would show as some dots.'],
        ]),
      },
    },
    teach: Q('Why did R1\'s Gi0/0 need no shutdown when R2\'s side already worked?', [
      ['Router interfaces start shut down; R2\'s had already been enabled', 1, 'Right. The link only comes up when both ends are on.'],
      ['The description switched it on', 0, 'Descriptions are labels only.'],
      ['The enable secret unlocked the port', 0, 'enable secret protects privileged mode, not ports.'],
      ['R2 had to send it an address first', 0, 'Addresses here are set by hand on each end.'],
    ]),
  },

  'ios-save': {
    goals: {
      compare: {
        think: Q('Where does each configuration live?', [
          ['Running config in RAM, startup config in NVRAM', 1, 'Right. RAM is lost on reload; NVRAM is what boots.'],
          ['Both in flash', 0, 'Flash holds the IOS image.'],
          ['Running in NVRAM, startup in RAM', 0, 'The other way around.'],
        ]),
        steps: [ENABLE('R1'), S('R1', ['show', 'running-config'], [['ip interface brief', 'That lists interfaces. You want the whole configuration.']]), S('R1', ['show', 'startup-config'], [['running-config', 'You just looked at that one. Now the saved one.']])],
      },
      save: {
        think: Q('Which way does a save copy?', [
          ['From running config to startup config', 1, 'Right. copy SOURCE DESTINATION: running into startup.'],
          ['From startup config to running config', 0, 'That merges the saved config back in. It saves nothing.'],
          ['From RAM to flash', 0, 'Configs are saved to NVRAM as startup-config.'],
        ]),
        steps: [S('R1', ['copy', 'running-config', 'startup-config'], [['startup-config', 'Order matters: copy FROM running-config TO startup-config.']]), S('R1', ['Enter'], [['n', 'IOS is offering the default name, startup-config. Enter accepts it.']])],
      },
      reload: {
        think: Q('If you reload now, what happens to the running config?', [
          ['It is replaced by the startup config at boot', 1, 'Right. Which is why you saved first.'],
          ['It is kept as it is', 0, 'RAM is wiped on reload.'],
          ['It is saved automatically', 0, 'IOS asks first. It never saves on its own.'],
        ]),
        steps: [S('R1', ['reload'], [['write erase', 'That deletes the startup config. The opposite of what you want.']]), S('R1', ['Enter'], [['no', 'That cancels the reload.']])],
      },
      survived: {
        think: Q('After the reload, the prompt is R1>. What does that prove already?', [
          ['The hostname survived, so the saved config loaded', 1, 'Right. Now check the interface.'],
          ['Nothing; the hostname is built in', 0, 'A blank router would say Router>.'],
          ['The reload failed', 0, 'The reload finished; you are at a fresh prompt.'],
        ]),
        steps: [S('R1', ['show', 'ip interface brief'], [['running-config', 'That works too, but ip interface brief shows every address on one screen.']])],
      },
    },
    teach: Q('Why did the address survive the reload?', [
      ['It was copied from running config (RAM) to startup config (NVRAM), which loads at boot', 1, 'Right.'],
      ['IOS keeps the running config through a reload', 0, 'RAM is wiped on every reload.'],
      ['show ip interface brief restored it', 0, 'Show commands only look.'],
      ['R2 sent it back over the link', 0, 'Routers do not hand each other their configs.'],
    ]),
  },

  'ios-ssh': {
    goals: {
      hostname: {
        think: Q('Why does SSH care about the hostname?', [
          ['The RSA keys are named hostname.domain, and "Router" is not allowed', 1, 'Right. So the name comes first.'],
          ['SSH clients connect by hostname only', 0, 'Clients connect by IP just fine.'],
          ['It does not; it is just tidy', 0, 'Try generating keys as "Router" and IOS refuses.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1'), S('R1', ['hostname', 'R1'], [['ip domain name', 'Domain is next. The hostname comes first.']])],
      },
      domain: {
        think: Q('What is the domain name used for here?', [
          ['It completes the key name: R1.lab.local', 1, 'Right.'],
          ['It sets the DNS server', 0, 'That is ip name-server.'],
          ['It is the SSH password', 0, 'Passwords come from the user you create.'],
        ]),
        steps: [S('R1', ['ip domain name', 'lab.local'], [['ip host', 'ip host maps one name to one address. You want the domain.']])],
      },
      keys: {
        think: Q('How big should the RSA key be for SSH version 2?', [
          ['At least 768 bits; 2048 is the sensible choice', 1, 'Right. Bigger keys are stronger; 2048 is standard.'],
          ['512 bits, the default', 0, 'Too small for SSH version 2.'],
          ['Size does not matter', 0, 'SSH v2 refuses keys under 768 bits.'],
        ]),
        steps: [S('R1', ['crypto key generate rsa', 'modulus', '2048'], [['512', 'Too small for SSH version 2.']])],
      },
      v2: {
        think: Q('Why force version 2?', [
          ['Version 1 has known weaknesses', 1, 'Right. Version 2 only.'],
          ['Version 2 is faster', 0, 'Speed is not the reason.'],
          ['Clients cannot speak version 1', 0, 'Some can, which is the problem.'],
        ]),
        steps: [S('R1', ['ip ssh version', '2'], [['1', 'Version 1 is the weak one.']])],
      },
      user: {
        think: Q('Why a local user instead of one shared line password?', [
          ['Each admin signs in as themselves, so the logs show who did what', 1, 'Right. And one person leaving does not mean changing everyone\'s password.'],
          ['SSH cannot use line passwords at all', 0, 'It needs a username, which is why login local matters.'],
          ['It is faster', 0, 'Speed is not the point.'],
        ]),
        steps: [S('R1', ['username', 'admin', 'secret', 'Str0ngPass'], [['password', 'password stores it in plain text. secret hashes it.']])],
      },
      local: {
        think: Q('What do the VTY lines handle?', [
          ['Remote logins over the network', 1, 'Right. Console is the cable; VTY lines are SSH and Telnet sessions.'],
          ['The console port', 0, 'That is line con 0.'],
          ['Routing updates', 0, 'Lines are for people logging in.'],
        ]),
        steps: [S('R1', ['line vty', '0', '4'], [['console', 'The console is the cable in your hand. Remote access comes in on VTY.']]), S('R1', ['login', 'local'], [['password', 'A line password is one shared secret. login local uses the users you created.']])],
      },
      sshonly: {
        think: Q('What does transport input decide?', [
          ['Which protocols may connect to these lines', 1, 'Right. ssh alone shuts Telnet out.'],
          ['Which users may connect', 0, 'Users come from login local.'],
          ['The SSH version', 0, 'That is ip ssh version.'],
        ]),
        steps: [S('R1', ['transport input', 'ssh'], [['telnet', 'Telnet sends everything, passwords included, in plain text.'], ['all', 'That keeps Telnet open.']])],
      },
      verify: {
        think: Q('You are in line configuration. How do you run show ip ssh?', [
          ['do show ip ssh', 1, 'Right.'],
          ['show ip ssh', 0, 'Configuration modes reject show without do.'],
          ['exit, then show', 0, 'Works, but do saves the trip.'],
        ]),
        steps: [S('R1', ['show', 'ip ssh'], [['ip interface brief', 'That shows interfaces, not SSH.']])],
        verify: Q('What should show ip ssh say?', [
          ['SSH Enabled - version 2.0', 1, 'Right.'],
          ['SSH Enabled - version 1.99', 0, '1.99 means both versions are allowed. You forced 2.'],
          ['SSH Disabled', 0, 'That would mean no keys.'],
        ]),
      },
    },
    teach: Q('Why did crypto key generate rsa need a hostname and a domain first?', [
      ['The key is named hostname.domain, so both have to exist', 1, 'Right.'],
      ['SSH clients look the router up in DNS', 0, 'Clients can connect by address.'],
      ['IOS needs them to pick the key size', 0, 'You pick the size.'],
      ['They become the SSH login', 0, 'Logins come from the local users.'],
    ]),
  },

  'route-reading': {
    goals: {
      read: {
        think: Q('Which command shows where a router sends traffic?', [
          ['show ip route', 1, 'Right. The routing table.'],
          ['show ip interface brief', 0, 'That lists interfaces and addresses.'],
          ['show running-config', 0, 'That shows what was configured, not what was learned.'],
        ]),
        steps: [ENABLE('R1'), S('R1', ['show', 'ip route'], [['ip interface brief', 'That lists interfaces, not routes.']])],
      },
      exit: {
        think: Q('In a route line, where is the exit interface?', [
          ['At the end of the line', 1, 'Right. "via NEXT-HOP, age, INTERFACE".'],
          ['In the square brackets', 0, 'The brackets hold AD and metric.'],
          ['In the code letter', 0, 'The letter says where the route came from.'],
        ]),
        choices: ['Gi0/0', 'Gi0/1', 'Gi0/2', 'Lo0'],
      },
      admet: {
        think: Q('In [110/3], which number is the administrative distance?', [
          ['110, the first one', 1, 'Right. AD first, metric second.'],
          ['3, the second one', 0, 'The second number is the metric.'],
          ['Neither; it is a timer', 0, 'Timers come after the next hop.'],
        ]),
        choices: ['110/3', '110/2', '1/0', '3/110'],
      },
      gw: {
        think: Q('What is a gateway of last resort?', [
          ['Where traffic goes when no other route matches: the default route', 1, 'Right. 0.0.0.0/0.'],
          ['The router\'s own address', 0, 'It is a next hop, not this router.'],
          ['The OSPF DR', 0, 'Unrelated to the DR.'],
        ]),
        choices: ['203.0.113.1', '203.0.113.2', '10.0.12.2', '0.0.0.0'],
      },
      nbr: {
        think: Q('How does OSPF identify a neighbor in show ip ospf neighbor?', [
          ['By its router ID', 1, 'Right. The first column.'],
          ['By its interface address', 0, 'That is listed too, but the ID is the router ID.'],
          ['By its hostname', 0, 'OSPF does not use hostnames.'],
        ]),
        steps: [S('R1', ['show', 'ip ospf neighbor'], [['ip ospf interface', 'That shows interfaces. You want neighbors.']])],
        choices: ['2.2.2.2', '10.0.12.2', '1.1.1.1', '3.3.3.3'],
      },
    },
    teach: Q('In [110/3], what does the 110 tell you?', [
      ['The route came from OSPF; 110 is OSPF\'s administrative distance', 1, 'Right. Static is 1, connected 0.'],
      ['The route is 110 hops away', 0, 'That is not a hop count.'],
      ['The link speed is 110 Mbps', 0, 'Not a speed.'],
      ['It expires in 110 seconds', 0, 'Not a timer.'],
    ]),
  },

  'static-basic': {
    goals: {
      r1: {
        think: Q('R1 needs to reach 192.168.3.0/24. What does a static route need?', [
          ['The destination network, its mask, and the next hop toward it', 1, 'Right. ip route NETWORK MASK NEXT-HOP.'],
          ['The destination\'s hostname', 0, 'Routes are by address.'],
          ['Only the next hop', 0, 'The router also needs to know which destinations go there.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1'), S('R1', ['ip route', '192.168.3.0', '255.255.255.0', '10.0.12.2'], [MASK_TRAP, ['10.0.12.1', 'That is R1\'s own address. The next hop is the neighbor, R2.'], ['192.168.3.1', 'That is the far LAN\'s gateway. R1 cannot reach it directly; the next hop is the router beside you.']])],
      },
      r3: {
        think: Q('R3 only has one way out, through R2. What is the simplest route?', [
          ['A default route: everything unknown goes to R2', 1, 'Right. 0.0.0.0 0.0.0.0.'],
          ['A route for every network in the company', 0, 'Works, but a default covers them all.'],
          ['No route; R3 will work it out', 0, 'Without a route, R3 drops the replies.'],
        ]),
        steps: [ENABLE('R3'), CONF('R3'), S('R3', ['ip route', '0.0.0.0', '0.0.0.0', '10.0.23.2'], [['255.255.255.255', 'That is a host mask. A default route has mask 0.0.0.0.'], ['10.0.23.3', 'That is R3\'s own address.']])],
      },
      r2: {
        think: Q('R2 sits in the middle. What does it already know?', [
          ['Only its two directly connected links, not either LAN', 1, 'Right. So it needs a route to each LAN.'],
          ['Everything, because it is in the middle', 0, 'Routers only know connected networks until told otherwise.'],
          ['Both LANs, learned from R1 and R3', 0, 'Static routes are not shared with neighbors.'],
        ]),
        steps: [ENABLE('R2'), CONF('R2'),
          S('R2', ['ip route', '192.168.1.0', '255.255.255.0', '10.0.12.1'], [['10.0.23.3', 'R3 is the wrong direction for 192.168.1.0.'], MASK_TRAP]),
          S('R2', ['ip route', '192.168.3.0', '255.255.255.0', '10.0.23.3'], [['10.0.12.1', 'R1 is the wrong direction for 192.168.3.0.']])],
      },
      ping: {
        think: Q('Why source the ping from 192.168.1.1?', [
          ['So the reply has to find its way back to the LAN, testing the whole path', 1, 'Right. A plain ping uses Gi0/0 and only tests half.'],
          ['Pings must always have a source', 0, 'They default to the exit interface.'],
          ['To make it faster', 0, 'Speed is the same.'],
        ]),
        steps: [S('R1', ['ping', '192.168.3.1', 'source', '192.168.1.1'], [['10.0.12.1', 'That source only proves the link to R2.']])],
      },
    },
    teach: Q('Why did R3 need a route back even though R1\'s route was right?', [
      ['A ping needs a path there and a path back; R3 did not know how to reach 192.168.1.0', 1, 'Right. Routing is one-way per router.'],
      ['R3 had to approve R1\'s route', 0, 'Routers do not approve each other\'s routes.'],
      ['Static routes only work in pairs', 0, 'Each one stands alone; the return is a separate need.'],
      ['R3 was shut down', 0, 'Its interfaces were up.'],
    ]),
  },

  'static-floating': {
    goals: {
      float1: {
        think: Q('Two routes to the same network. Which one does R1 install?', [
          ['The one with the lower administrative distance', 1, 'Right. So the backup gets a higher one.'],
          ['The newest one', 0, 'Age does not decide.'],
          ['Both, sharing traffic', 0, 'Only if their ADs are equal.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1'), S('R1', ['ip route', '192.168.3.0', '255.255.255.0', '10.0.13.3', '200'], [['1', 'AD 1 ties the main route, so both would be used at once.'], ['10.0.12.2', 'That is the main path. The backup goes via R3 directly.']])],
      },
      float3: {
        think: Q('If only R1 has a backup, what happens to replies when R2 dies?', [
          ['They still head for R2 and are lost; R3 needs its own backup', 1, 'Right. Both directions need one.'],
          ['They follow R1\'s backup automatically', 0, 'R3 does not know about R1\'s routes.'],
          ['R3 drops nothing', 0, 'It would drop every reply.'],
        ]),
        steps: [ENABLE('R3'), CONF('R3'), S('R3', ['ip route', '192.168.1.0', '255.255.255.0', '10.0.13.1', '200'], [['10.0.23.2', 'That is the main path through R2.']])],
      },
      hidden: {
        think: Q('While R2 is up, should the AD 200 route be in R1\'s table?', [
          ['No. It waits in the config until the better route disappears', 1, 'Right. That is what "floating" means.'],
          ['Yes, beside the main route', 0, 'Only the best AD is installed.'],
          ['Yes, replacing the main route', 0, 'Higher AD loses.'],
        ]),
        steps: [S('R1', ['show', 'ip route', 'static'], [['running-config', 'The config shows both routes. The table shows which one is used.']])],
      },
      fail: {
        think: Q('Why shut both of R2\'s interfaces instead of just R1\'s cable?', [
          ['A static route only notices a failure on its own link; R3 would keep using R2', 1, 'Right. Killing R2 fails the path for both ends.'],
          ['IOS needs two shutdowns', 0, 'One is enough for one interface.'],
          ['To save power', 0, 'Not the point.'],
        ]),
        steps: [ENABLE('R2'), CONF('R2'), IFACE('R2', 'g0/0', 'g0/2', 'R2 has no Gi0/2 in use. Its links are Gi0/0 and Gi0/1.'), S('R2', ['shutdown'], [['no shutdown', 'That turns it on. You are failing it.']]), IFACE('R2', 'g0/1', 'g0/0', 'Done already. Now the other side.'), S('R2', ['shutdown'])],
      },
      failover: {
        think: Q('R2 is down. What should R1\'s table show for 192.168.3.0/24 now?', [
          ['[200/0] via 10.0.13.3', 1, 'Right. The backup floated in.'],
          ['[1/0] via 10.0.12.2', 0, 'That next hop is unreachable now.'],
          ['No route at all', 0, 'The backup is there for exactly this.'],
        ]),
        steps: [S('R1', ['ping', '192.168.3.1', 'source', '192.168.1.1'], [['10.0.12.1', 'That interface is down now.']])],
      },
      restore: {
        think: Q('When R2 comes back, what happens to the backup route?', [
          ['It leaves the table again; AD 1 beats AD 200', 1, 'Right. No action needed.'],
          ['It stays, because it was installed first', 0, 'Install order does not matter.'],
          ['You must delete it by hand', 0, 'It goes back to waiting on its own.'],
        ]),
        steps: [ENABLE('R2'), CONF('R2'), IFACE('R2', 'g0/0', 'g0/2', 'R2\'s links are Gi0/0 and Gi0/1.'), S('R2', ['no shutdown'], [['shutdown', 'It is already shut.']]), IFACE('R2', 'g0/1', 'g0/0', 'Done already. Now the other side.'), S('R2', ['no shutdown']), S('R1', ['show', 'ip route', 'static'])],
      },
    },
    teach: Q('Why did the backup stay out of R1\'s table while R2 was up?', [
      ['Its AD of 200 lost to the main route\'s AD of 1; only the best route is installed', 1, 'Right.'],
      ['It was waiting for a ping', 0, 'Pings do not install routes.'],
      ['Static routes take a minute to appear', 0, 'They appear at once when they are the best.'],
      ['R3 had not approved it', 0, 'Routers do not approve routes.'],
    ]),
  },

  'ospf-basic': {
    goals: {
      rid: {
        think: Q('Why set the router ID before the network statements?', [
          ['Once OSPF starts on an interface, the ID locks until the process is reset', 1, 'Right. Set it first and you never need clear ip ospf process.'],
          ['Network statements are rejected without it', 0, 'They work; OSPF picks an ID itself.'],
          ['The order does not matter', 0, 'Try it in the other order and IOS asks for a reset.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1'), S('R1', ['router ospf', '1'], [['router-id', 'First open the OSPF process.']]), S('R1', ['router-id', '1.1.1.1'], [['10.0.12.1', 'That is an interface address. A fixed ID like 1.1.1.1 is easier to read.']]),
          ENABLE('R2'), CONF('R2'), S('R2', ['router ospf', '1']), S('R2', ['router-id', '2.2.2.2'], [['1.1.1.1', 'R1 has that. IDs must be unique.']]),
          ENABLE('R3'), CONF('R3'), S('R3', ['router ospf', '1']), S('R3', ['router-id', '3.3.3.3'], [['2.2.2.2', 'R2 has that. IDs must be unique.']])],
      },
      networks: {
        think: Q('A network statement for 10.0.12.0/24 takes which wildcard?', [
          ['0.0.0.255', 1, 'Right. The inverse of 255.255.255.0.'],
          ['255.255.255.0', 0, 'That is the subnet mask. OSPF wants the inverse.'],
          ['0.0.0.0', 0, 'That matches one exact address, not the subnet.'],
        ]),
        steps: [
          S('R1', ['network', '10.0.12.0', '0.0.0.255', 'area', '0'], [WILD_TRAP]), S('R1', ['network', '192.168.1.0', '0.0.0.255', 'area', '0'], [WILD_TRAP]),
          S('R2', ['network', '10.0.12.0', '0.0.0.255', 'area', '0'], [WILD_TRAP]), S('R2', ['network', '10.0.23.0', '0.0.0.255', 'area', '0'], [['area 1', 'Single-area OSPF: everything goes in area 0.']]),
          S('R3', ['network', '10.0.23.0', '0.0.0.255', 'area', '0'], [WILD_TRAP]), S('R3', ['network', '192.168.3.0', '0.0.0.255', 'area', '0'], [WILD_TRAP]),
        ],
      },
      passive: {
        think: Q('What does passive-interface do to a LAN interface?', [
          ['Stops hellos there, but still advertises the LAN', 1, 'Right. No routers on the LAN, so no hellos needed.'],
          ['Removes the LAN from OSPF', 0, 'The network is still advertised.'],
          ['Shuts the interface down', 0, 'The interface stays up.'],
        ]),
        steps: [S('R1', ['passive-interface', 'g0/1'], [['g0/0', 'Gi0/0 faces R2. Making it passive kills the adjacency.']]), S('R3', ['passive-interface', 'g0/1'], [['g0/0', 'Gi0/0 faces R2. Making it passive kills the adjacency.']])],
      },
      full: {
        think: Q('Which state means two OSPF neighbors have synced?', [
          ['FULL', 1, 'Right.'],
          ['2WAY', 0, 'They see each other but have not swapped databases.'],
          ['INIT', 0, 'Only one side has heard the other.'],
        ]),
        steps: [S('R2', ['show', 'ip ospf neighbor'], [['ip ospf interface', 'You want the neighbor list.']])],
      },
      learned: {
        think: Q('Which code letter marks an OSPF route?', [
          ['O', 1, 'Right.'],
          ['S', 0, 'S is static.'],
          ['C', 0, 'C is connected.'],
        ]),
        steps: [S('R1', ['show', 'ip route', 'ospf'], [['static', 'No static routes in this lab.']])],
      },
      ping: {
        think: Q('Why source the ping from the LAN?', [
          ['So the reply needs OSPF\'s route back to 192.168.1.0', 1, 'Right. That tests both directions.'],
          ['OSPF requires it', 0, 'OSPF does not care about pings.'],
          ['To skip R2', 0, 'Traffic still goes through R2.'],
        ]),
        steps: [S('R1', ['ping', '192.168.3.1', 'source', '192.168.1.1'], [['10.0.12.1', 'That only tests the link to R2.']])],
      },
    },
    teach: Q('Why make the LAN interfaces passive?', [
      ['No routers live there, so hellos are wasted and a risk; the LAN is still advertised', 1, 'Right.'],
      ['Passive interfaces are faster', 0, 'Speed is the same.'],
      ['It hides the LAN from OSPF', 0, 'The LAN is still advertised.'],
      ['OSPF needs at least one passive interface', 0, 'It needs none.'],
    ]),
  },

  'ospf-dr': {
    goals: {
      who: {
        think: Q('With every priority at 1, who wins the DR election?', [
          ['The highest router ID', 1, 'Right.'],
          ['The lowest router ID', 0, 'Highest wins.'],
          ['The first router to boot', 0, 'Only when routers start at different times. These started together.'],
        ]),
        steps: [ENABLE('R2'), S('R2', ['show', 'ip ospf neighbor'], [['ip route', 'Routes do not show roles.']])],
        choices: ['3.3.3.3', '1.1.1.1', '2.2.2.2', '10.0.0.3'],
      },
      r1prio: {
        think: Q('Where is OSPF priority set?', [
          ['On the interface, because roles are per segment', 1, 'Right. ip ospf priority under the interface.'],
          ['Under router ospf', 0, 'It is per interface.'],
          ['In global configuration', 0, 'It is per interface.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1'), IFACE('R1', 'g0/0', 'g0/1', 'The shared switch is on Gi0/0.'), S('R1', ['ip ospf priority', '255'], [['0', 'Priority 0 means never DR. The opposite.']])],
      },
      r3zero: {
        think: Q('Which priority keeps a router out of the election entirely?', [
          ['0', 1, 'Right.'],
          ['1', 0, 'That is the default.'],
          ['255', 0, 'That is the highest priority.'],
        ]),
        steps: [ENABLE('R3'), CONF('R3'), IFACE('R3', 'g0/0', 'g0/1', 'The shared switch is on Gi0/0.'), S('R3', ['ip ospf priority', '0'], [['255', 'That would make R3 the strongest candidate.']])],
      },
      elected: {
        think: Q('R3 just stepped down, so its BDR (R2) became DR. How do you get R1 in?', [
          ['Clear the OSPF process on R2, the current DR, so its BDR, R1, takes over', 1, 'Right. Elections are not preemptive; the DR has to leave.'],
          ['Wait; R1 will take over by itself', 0, 'A higher priority never preempts.'],
          ['Clear the process on R1', 0, 'Clearing a non-DR changes nothing about the DR.'],
        ]),
        steps: [ENABLE('R2'), S('R2', ['clear', 'ip ospf process'], [['ip route', 'Routes are not the problem.']]), S('R2', ['yes'], [['no', 'That cancels the reset.']])],
      },
      confirm: {
        think: Q('On R2, what should R1\'s line say now?', [
          ['FULL/DR', 1, 'Right.'],
          ['FULL/BDR', 0, 'R2 is the BDR now.'],
          ['2WAY/DROTHER', 0, 'R1 holds the top role.'],
        ]),
        steps: [S('R2', ['show', 'ip ospf neighbor'])],
      },
    },
    teach: Q('Why did raising R1\'s priority not make it DR right away?', [
      ['OSPF elections are not preemptive; the role only moves when the DR leaves', 1, 'Right.'],
      ['Priority only counts after a reload', 0, 'It counts at the next election, whatever starts it.'],
      ['255 is too high', 0, '255 is valid.'],
      ['R1 needed a new router ID', 0, 'The ID was fine.'],
    ]),
  },
};

Object.assign(GUIDED, GUIDED_SWITCH);

export const guidedFor = (labId) => GUIDED[labId] ?? null;
