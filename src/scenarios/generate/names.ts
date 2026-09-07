/** Naming pools for generated scenarios: South Orange County streets, symptom phrasings, hint text. Pure data. */

export const STREETS: string[] = [
  'Vista Court',
  'Calle Sol',
  'Paseo Vista',
  'Camino Alto',
  'Via Ladera',
  'Antonio Pkwy',
  'Cow Camp Rd',
  'Rancho Viejo Rd',
  'Marguerite Pkwy',
  'Alicia Pkwy',
  'La Paz Rd',
  'Oso Pkwy',
  'Crown Valley Pkwy',
  'Avenida Pico',
  'Camino Capistrano',
  'Via Estrada',
  'Calle Arroyo',
  'Paseo de Colinas',
  'Camino del Avion',
  'Via Cordova',
  'Sendero Way',
  'Calle Frontera',
];

export const CROSS_STREETS: string[] = ['Calle Sol', 'Camino Alto', 'Via Ladera', 'Antonio Pkwy', 'Ortega Hwy', 'Oso Pkwy', 'Crown Valley Pkwy', 'Camino Capistrano'];

export const SYMPTOMS = {
  unpowered: [
    "All the lights on the fiber box are off and the internet's out.",
    "The internet's down and that little box on the wall is completely dark.",
    'No internet since this morning; the box has no lights at all.',
  ],
  dark: [
    'Internet dead since yesterday evening, box light is red.',
    'Red alarm light on the ONT, no internet.',
    'Everything went out around dinner time.',
    'No service since about 5 last night, the box shows a red light.',
  ],
  darkNeighbourhood: ["TV and internet down. Neighbor's out too.", 'Whole street lost internet at the same time.', 'Three of us on this block are down since last night.'],
  degraded: [
    'Internet keeps dropping, the box light blinks orange every few minutes.',
    'Speeds have been terrible since the gardeners re-did the yard.',
    'Service cuts out every few minutes, then comes back.',
    'Video calls freeze constantly; the box light flickers.',
  ],
  logical: ["Wi-Fi's connected, pages just spin.", 'Laptop says no internet access but all the box lights are green.', 'Nothing loads even though the fiber box looks fine.'],
  dns: ['Internet says connected but nothing loads.', "Netflix says 'no internet' but the box lights are all green.", "Can't get to any websites since about 7:30."],
  redHerring: ['Internet gets slow every night around 8.', 'Wi-Fi drops in the evenings.', 'Streaming buffers at night.'],
};

export const HINTS = {
  'ont-unpowered': [
    "Before you test anything: what do the ONT's status LEDs tell you about power versus light?",
    'Ask the OLT. `show ont status` tells you whether the ONT is reporting loss of signal or simply went dark.',
    "If the OLT says the ONT went dark and your power meter still sees healthy light at the ONT's input, the fiber isn't the problem.",
  ],
  'connector-dirty': [
    'A reflective, lossy event right at the demarc is almost always a connector, not the cable.',
    'Inspect before you connect: put the scope on the NID jumper before you trust any reading through it.',
    'A failed end-face inspection at the NID is the proof; clean, re-inspect, and re-test before you claim anything else.',
  ],
  macrobend: [
    'Loss that is much worse at longer wavelengths is a bend, not a splice.',
    'A VFL from the pedestal will glow through the jacket right where the drop is pinched.',
    'Check where the drop enters the house: staples, tight loops, and door frames are the usual suspects.',
  ],
  'fiber-break': [
    'Start at the OLT: how many ONTs went to LOS, and what do they have in common?',
    'No light at the terminal but light at the cabinet means the cable between them is cut.',
    'Shine the VFL from the upstream end and walk the route; the leak is where the dig happened.',
  ],
  'fusion-splice-degraded': [
    'One customer with low light and no reflective event points at a splice, not a connector.',
    'Only an OTDR shot resolves a splice; use 1625 nm so you never test in-band on a live PON.',
    'Shoot from the cabinet toward the customer and look for a non-reflective step in the middle of the distribution run.',
  ],
  'wrong-tube-continuity': ['What do the affected addresses have in common? Check the port assignments and the splice sheet against what the meter actually says.'],
  'ont-serial-mismatch': [
    'The customer sees light but never gets online. Ask the OLT what it thinks this ONT is.',
    'Compare the serial the OLT expects with the serial printed on the ONT.',
    'A serial mismatch is a provisioning problem: no fiber work will fix it.',
  ],
  'transceiver-rx-power-low': [
    'Every customer on the OLT is fine, but the uplink optic is reporting an alarm.',
    '`show interfaces transceiver detail` on the distribution router shows the receive level.',
    'A receive level below the low-alarm threshold on an uplink optic is the fault, even while traffic still passes.',
  ],
  'dhcp-scope-exhausted': [
    'Light is fine, ONTs are online, and yet the laptop has a 169.254 address.',
    'Whose job is it to hand out addresses on VLAN 100, and does it have any left?',
    'Check the relay target and the scope on the distribution router.',
  ],
  'rogue-ont': [],
  'dns-server-unresponsive': [],
  'locate-ticket-expired': [
    'Before anyone puts a shovel in the ground, is the DigAlert ticket still valid?',
    'Pull the work order for this dig site and check the ticket date against the 28-day validity window.',
  ],
};
