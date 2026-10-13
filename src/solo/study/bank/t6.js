// Tree 6, Automation and Programmability: controller-based and
// software-defined networking, AI and ML in operations, REST APIs,
// configuration management, and JSON.

import { Q, X } from './qb.js';

const JSON_OK = `
{
  "hostname": "R1",
  "uptime_days": 23,
  "ospf_enabled": true,
  "interfaces": [
    { "name": "Gi0/0", "ip": "10.0.12.1", "enabled": true },
    { "name": "Gi0/1", "ip": null, "enabled": false }
  ]
}`;
const JSON_MARKS = [
  [/"(hostname|uptime_days|ospf_enabled|interfaces|name|ip|enabled)"(?=:)/, 'key', 'Key (always a quoted string)'],
  [/"R1"|"Gi0\/[01]"|"10\.0\.12\.1"/, 'ip', 'String value'], [/(?<=: )23/, 'count', 'Number'], [/\b(true|false)\b/, 'state', 'Boolean'], [/\bnull\b/, 'fail', 'null'],
  [/\[|\]/, 'vlan', 'Array brackets'],
];

export const T6 = [
  // ---------- t6-sdn ----------
  Q('b6-sdn-01', 'AUTO', 't6-sdn', 'In a traditional network, where does each device\'s control plane run?', [
    ['On every device, independently (distributed)', true, 'Each router computes its own routes.'],
    ['On a central controller', false, 'That is controller-based.'],
    ['In the cloud only', false, 'No.'],
    ['On the access points', false, 'No.'],
  ], 'Traditionally each device runs its own routing, STP and ARP and is configured one CLI session at a time. Controller-based networking centralizes policy and much of the control logic, then programs the devices.'),
  Q('b6-sdn-02', 'AUTO', 't6-sdn', 'Which plane forwards user packets?', [
    ['The data plane', true, 'Forwarding.'],
    ['The control plane', false, 'Decides paths.'],
    ['The management plane', false, 'Configuration and monitoring.'],
    ['The orchestration plane', false, 'Not one of the three classic planes.'],
  ], 'Data plane: move packets using forwarding tables. Control plane: build those tables (OSPF, STP, ARP). Management plane: how admins configure and monitor (SSH, SNMP, APIs). SDN separates and centralizes control.'),
  Q('b6-sdn-03', 'AUTO', 't6-sdn', 'Which API direction does an application use to tell an SDN controller what it wants?', [
    ['Northbound', true, 'Apps to controller, usually REST.'],
    ['Southbound', false, 'Controller to devices.'],
    ['Eastbound', false, 'Between controllers in some designs, not this.'],
    ['Inbound', false, 'Not an API direction term here.'],
  ], 'Picture the controller in the middle: applications and scripts sit above it (northbound, REST with JSON), network devices below it (southbound: NETCONF, RESTCONF, OpenFlow, CLI over SSH, SNMP).'),
  Q('b6-sdn-04', 'AUTO', 't6-sdn', 'Which are southbound interfaces a controller might use to program devices? (Choose two.)', [
    ['NETCONF', true, 'XML over SSH, YANG models.'],
    ['OpenFlow', true, 'Programs flow tables.'],
    ['A REST API offered to a ticketing system', false, 'That is northbound.'],
    ['A web dashboard for admins', false, 'A user interface on top.'],
  ], 'Southbound protocols reach the devices: OpenFlow, NETCONF, RESTCONF, OpFlex, plus plain CLI over SSH and SNMP. Northbound APIs expose the controller to people and programs.'),
  Q('b6-sdn-05', 'AUTO', 't6-sdn', 'In SD-Access, what is the underlay?', [
    ['The physical routed network that carries the fabric\'s tunnels', true, 'Switches, links, IP routing.'],
    ['The virtual networks users see', false, 'That is the overlay.'],
    ['The controller', false, 'Catalyst Center manages it.'],
    ['The wireless network only', false, 'No.'],
  ], 'The underlay provides plain IP reachability between fabric nodes (Cisco uses IS-IS). The overlay rides on top in VXLAN tunnels, with LISP for control and security group tags for policy. Together they form the fabric.'),
  Q('b6-sdn-06', 'AUTO', 't6-sdn', 'Which statement about overlays is true?', [
    ['They are logical networks built with tunnels on top of the physical network', true, 'For example VXLAN.'],
    ['They replace physical cabling', false, 'They need the underlay.'],
    ['They are only used in Wi-Fi', false, 'No.'],
    ['They cannot carry policy', false, 'SD-Access carries SGTs.'],
  ], 'Overlays decouple where users appear logically from where they plug in physically. A user in the Finance virtual network gets the same policy on any switch in the fabric.'),
  Q('b6-sdn-07', 'AUTO', 't6-sdn', 'Which controller manages Cisco SD-Access campus fabrics?', [
    ['Catalyst Center (formerly DNA Center)', true, 'Campus controller.'],
    ['A WLC only', false, 'Wireless control, integrated in the fabric.'],
    ['An SNMP server', false, 'Monitoring only.'],
    ['A DHCP server', false, 'No.'],
  ], 'Catalyst Center provides design, policy, provisioning and assurance for the campus, using APIs northbound and device protocols southbound. It is the reference example of intent-based networking.'),
  Q('b6-sdn-08', 'AUTO', 't6-sdn', 'How does automation change network management? (Choose two.)', [
    ['Changes are applied consistently across many devices, reducing typos and drift', true, 'Consistency.'],
    ['Repetitive tasks take minutes instead of hours', true, 'Speed and scale.'],
    ['It removes the need to understand networking', false, 'You still need to know what to automate.'],
    ['It guarantees no outages', false, 'Bad automation can break many devices fast.'],
  ], 'Automation turns manual, error-prone, device-by-device work into repeatable code or controller policy. It makes good changes fast and bad changes fast too, which is why testing and review still matter.'),
  Q('b6-sdn-09', 'AUTO', 't6-sdn', 'What is intent-based networking?', [
    ['Stating the desired outcome or policy and letting the controller translate, deploy and continuously verify it', true, 'Intent, translation, assurance.'],
    ['Typing every command by hand', false, 'Traditional.'],
    ['Using only static routes', false, 'No.'],
    ['A routing protocol', false, 'No.'],
  ], 'Instead of configuring VLANs and ACLs per switch, you express "contractors may reach only the web apps" and the controller renders the configuration and checks the network keeps matching that intent.'),
  Q('b6-sdn-10', 'AUTO', 't6-sdn', 'Which statement compares traditional and controller-based networks?', [
    ['Controller-based networks centralize configuration and policy; traditional ones are configured device by device', true, 'The key contrast.'],
    ['Traditional networks have no control plane', false, 'Each device has one.'],
    ['Controller-based networks need no physical switches', false, 'They do.'],
    ['Only traditional networks can use OSPF', false, 'Underlays route too.'],
  ], 'Controllers give one point of policy and visibility, an API for automation, and faster consistent changes. The trade-off is reliance on the controller and new skills.'),
  Q('b6-sdn-11', 'AUTO', 't6-sdn', 'Which SD-WAN component handles the control plane, distributing routes and policy to the WAN edge routers?', [
    ['The SD-WAN controller (vSmart)', true, 'Control plane.'],
    ['The manager (vManage)', false, 'Management plane and GUI.'],
    ['The validator (vBond)', false, 'Orchestration and onboarding.'],
    ['The WAN edge router', false, 'Data plane.'],
  ], 'Cisco Catalyst SD-WAN: Manager (vManage) for configuration and monitoring, Controller (vSmart) for control and policy, Validator (vBond) to authenticate and onboard devices, and WAN Edge routers carrying traffic.'),
  Q('b6-sdn-12', 'AUTO', 't6-sdn', 'What is the role of OpenFlow?', [
    ['A southbound protocol that lets a controller program forwarding tables on switches', true, 'Flow entries.'],
    ['A routing protocol between routers', false, 'No.'],
    ['A northbound REST API', false, 'Southbound.'],
    ['A wireless standard', false, 'No.'],
  ], 'OpenFlow was the original SDN protocol: the controller installs match-action flow entries directly. Cisco\'s solutions lean more on NETCONF, RESTCONF and their own fabric protocols, but the concept is the same.'),
  Q('b6-sdn-13', 'AUTO', 't6-sdn', 'What does the fabric mean in SD-Access?', [
    ['The underlay plus the overlay working as one system of switches managed together', true, 'The whole architecture.'],
    ['The cabling only', false, 'That is part of the underlay.'],
    ['The controller\'s GUI', false, 'No.'],
    ['A type of fiber', false, 'No.'],
  ], 'Fabric nodes have roles: edge nodes (where endpoints connect), border nodes (exit to other networks) and control plane nodes (LISP map servers). Catalyst Center provisions them all.'),
  Q('b6-sdn-14', 'AUTO', 't6-sdn', 'Which protocol carries VXLAN overlay traffic in SD-Access, and what is the control plane protocol?', [
    ['VXLAN for data, LISP for control', true, 'The SD-Access stack.'],
    ['GRE for data, OSPF for control', false, 'Not SD-Access.'],
    ['MPLS for data, BGP for control', false, 'Provider stack.'],
    ['STP for data, CDP for control', false, 'No.'],
  ], 'VXLAN encapsulates Layer 2 or Layer 3 traffic in UDP across the underlay; LISP maps where each endpoint lives; Cisco TrustSec tags carry group-based policy. The CCNA expects the vocabulary, not the details.'),
  Q('b6-sdn-15', 'AUTO', 't6-sdn', 'What is configuration drift, and how do controllers help?', [
    ['Devices diverging from the intended configuration over time; controllers detect and correct it', true, 'Continuous compliance.'],
    ['Clock drift between routers', false, 'That is NTP\'s concern.'],
    ['Wireless clients roaming', false, 'No.'],
    ['Routes changing during convergence', false, 'No.'],
  ], 'Manual fixes at 2 a.m. never get documented, and devices slowly differ. Controllers and configuration management tools compare actual with intended state and either report or push it back.'),
  Q('b6-sdn-16', 'AUTO', 't6-sdn', 'Which data format is most commonly returned by a modern controller\'s northbound REST API?', [
    ['JSON', true, 'Lightweight and easy to parse.'],
    ['CSV', false, 'Rare for APIs.'],
    ['Plain CLI text', false, 'Hard to parse.'],
    ['Binary', false, 'Not typical.'],
  ], 'REST APIs mostly speak JSON (some also XML). Scripts parse it into dictionaries and lists. NETCONF uses XML and RESTCONF uses JSON or XML, both based on YANG data models.'),

  // ---------- t6-ai ----------
  Q('b6-ai-01', 'AUTO', 't6-ai', 'What does predictive AI do in network operations?', [
    ['Uses historical data to forecast problems such as link saturation or failing hardware before they happen', true, 'Forecasting and anomaly detection.'],
    ['Writes new configuration text from a prompt', false, 'That is generative AI.'],
    ['Replaces routing protocols', false, 'No.'],
    ['Encrypts traffic', false, 'No.'],
  ], 'Predictive models learn normal baselines for traffic, errors, CPU and client experience, then flag deviations or forecast trends, turning reactive firefighting into planned fixes.'),
  Q('b6-ai-02', 'AUTO', 't6-ai', 'What is a typical use of generative AI for network engineers?', [
    ['Drafting configurations, scripts or documentation from natural-language requests, for human review', true, 'Generation, then verification.'],
    ['Forwarding packets', false, 'No.'],
    ['Replacing all monitoring', false, 'No.'],
    ['Assigning IP addresses', false, 'No.'],
  ], 'Generative AI can draft an ACL, explain an unfamiliar show output, or summarize a long log. It can also be confidently wrong, so outputs must be checked before they touch production.'),
  Q('b6-ai-03', 'AUTO', 't6-ai', 'What is the main risk of applying generative AI output directly to production devices?', [
    ['It can produce plausible but incorrect commands (hallucinations), causing outages or security holes', true, 'Verify before applying.'],
    ['It is always slower than typing', false, 'Not the main risk.'],
    ['It cannot produce IOS syntax', false, 'It can.'],
    ['It requires SNMPv1', false, 'No.'],
  ], 'Treat AI output like a colleague\'s untested draft: review it, test in a lab or with dry runs, and roll out with the same change control as anything else.'),
  Q('b6-ai-04', 'AUTO', 't6-ai', 'What does machine learning need to detect anomalies in network behavior?', [
    ['Data that represents normal behavior to learn a baseline', true, 'Training data.'],
    ['A routing protocol', false, 'No.'],
    ['Static IP addresses', false, 'No.'],
    ['A console cable', false, 'No.'],
  ], 'ML models learn from data. In operations that means telemetry, logs and flow records. With a baseline learned, the model flags unusual patterns such as a sudden spike in DHCP failures at one site.'),
  Q('b6-ai-05', 'AUTO', 't6-ai', 'Which is an example of AIOps in a network?', [
    ['A system correlating thousands of alerts into one probable root cause', true, 'Noise reduction and correlation.'],
    ['A static route', false, 'No.'],
    ['A patch panel', false, 'No.'],
    ['A VLAN', false, 'No.'],
  ], 'When a core link fails, hundreds of devices log symptoms. AI-driven operations tools group them and point at the likely cause, so the engineer starts in the right place.'),
  Q('b6-ai-06', 'AUTO', 't6-ai', 'Which statement compares supervised and unsupervised machine learning?', [
    ['Supervised learns from labeled examples; unsupervised finds patterns or clusters in unlabeled data', true, 'Labels are the difference.'],
    ['Supervised needs no data', false, 'It needs labeled data.'],
    ['Unsupervised always needs a human at runtime', false, 'No.'],
    ['They are identical', false, 'No.'],
  ], 'Supervised: "these 10,000 flows are malicious, these are benign; classify new ones". Unsupervised: "group these flows and tell me what looks unusual". Both appear in security and operations tools.'),
  Q('b6-ai-07', 'AUTO', 't6-ai', 'An assurance platform warns that a branch\'s WAN link will hit 90% utilization within three weeks. What kind of AI is this?', [
    ['Predictive', true, 'A forecast from trends.'],
    ['Generative', false, 'Generates content.'],
    ['Rule-based scripting', false, 'Not learning.'],
    ['None; this is SNMP', false, 'SNMP may supply data, but the forecast is predictive analytics.'],
  ], 'Forecasting capacity from historical trends is a classic predictive use. Generative AI would instead, for example, draft the change request or explain the trend in plain language.'),
  Q('b6-ai-08', 'AUTO', 't6-ai', 'Why should sensitive configuration data be handled carefully with public generative AI tools?', [
    ['Prompts may be stored or used by the provider, exposing passwords, keys or topology', true, 'Data leakage risk.'],
    ['AI cannot read configurations', false, 'It can.'],
    ['It always deletes the data immediately', false, 'Not guaranteed.'],
    ['Configurations are public anyway', false, 'They are sensitive.'],
  ], 'Strip secrets (passwords, keys, SNMP communities, public IPs) before pasting configs into external tools, and follow company policy on approved AI services.'),
  Q('b6-ai-09', 'AUTO', 't6-ai', 'Which task suits AI-driven anomaly detection best?', [
    ['Spotting an unusual traffic pattern that might be malware spreading', true, 'Deviation from baseline.'],
    ['Assigning VLAN numbers', false, 'Simple configuration.'],
    ['Crimping cables', false, 'Physical work.'],
    ['Setting a hostname', false, 'Trivial.'],
  ], 'Anomaly detection excels where "normal" is complex and changes over time, such as traffic mixes and client behavior, and where fixed thresholds miss subtle problems.'),
  Q('b6-ai-10', 'AUTO', 't6-ai', 'What does a network assistant chatbot built on generative AI typically use to answer questions about your network accurately?', [
    ['Live data from the network and documentation retrieved at question time, combined with the model', true, 'Grounding reduces hallucination.'],
    ['Only its training data from years ago', false, 'It would know nothing about your network.'],
    ['Random guesses', false, 'No.'],
    ['SNMP traps alone', false, 'One possible source, not the method.'],
  ], 'Useful assistants ground the model in current inventory, telemetry and documentation, so answers reflect your network. Without grounding they generalize, which is where wrong answers come from.'),

  // ---------- t6-rest ----------
  Q('b6-rest-01', 'AUTO', 't6-rest', 'Which HTTP verbs map to CRUD operations?', [
    ['Create POST, Read GET, Update PUT or PATCH, Delete DELETE', true, 'The standard mapping.'],
    ['Create GET, Read POST, Update DELETE, Delete PUT', false, 'Mixed up.'],
    ['Create PUT, Read HEAD, Update GET, Delete POST', false, 'Mixed up.'],
    ['All operations use POST', false, 'Not RESTful.'],
  ], 'POST creates a new resource, GET reads, PUT replaces a resource entirely, PATCH changes part of it, DELETE removes it. GET, PUT and DELETE are idempotent; POST is not.'),
  Q('b6-rest-02', 'AUTO', 't6-rest', 'What does HTTP status 401 mean when calling a controller API?', [
    ['Unauthorized: missing or invalid authentication', true, 'Get a valid token.'],
    ['Not Found', false, 'That is 404.'],
    ['Created', false, 'That is 201.'],
    ['Server error', false, 'That is 500.'],
  ], '2xx success (200 OK, 201 Created, 204 No Content), 4xx client errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found), 5xx server errors (500 Internal Server Error, 503 Service Unavailable).'),
  Q('b6-rest-03', 'AUTO', 't6-rest', 'What does this API exchange show?', [
    ['A successful GET that returned the device list as JSON', true, '200 OK with a JSON body.'],
    ['A failed authentication', false, 'That would be 401.'],
    ['A new device was created', false, 'That would be POST with 201.'],
    ['The server crashed', false, 'That would be 5xx.'],
  ], 'Read a REST exchange as: method and URI, request headers (Accept, Authorization), then status line, response headers (Content-Type) and body. A 200 to a GET with application/json means you have parseable data.', {
    exhibit: X(`
GET /api/v1/network-device HTTP/1.1
Host: controller.example.local
Accept: application/json
X-Auth-Token: eyJhbGciOi...

HTTP/1.1 200 OK
Content-Type: application/json

{"response": [{"hostname": "edge-sw1", "managementIpAddress": "10.10.20.51"}]}`,
      [/^GET/m, 'cmd', 'HTTP method'], ['/api/v1/network-device', 'key', 'Resource URI'], ['X-Auth-Token: eyJhbGciOi...', 'key', 'Auth token header'], [/application\/json/, 'state', 'JSON data'], ['200 OK', 'ok', 'Status: success'], ['10.10.20.51', 'ip']),
  }),
  Q('b6-rest-04', 'AUTO', 't6-rest', 'Which characteristics define a REST API? (Choose two.)', [
    ['Stateless: each request carries everything needed, including authentication', true, 'No server-side session state.'],
    ['Client-server, using a uniform interface of resources and HTTP methods', true, 'Resources named by URIs.'],
    ['It requires a persistent TCP session for every operation', false, 'Each request stands alone.'],
    ['It only works with XML', false, 'JSON is most common.'],
  ], 'REST constraints include client-server separation, statelessness, cacheability, a uniform interface and a layered system. In practice: resources at URIs, HTTP verbs, JSON bodies, a token in every request.'),
  Q('b6-rest-05', 'AUTO', 't6-rest', 'Which authentication method sends a token in the Authorization header after an initial login?', [
    ['Bearer token authentication', true, 'Authorization: Bearer <token>.'],
    ['Community strings', false, 'SNMP v1/v2c.'],
    ['Pre-shared key', false, 'IPsec or Wi-Fi.'],
    ['Enable secret', false, 'IOS privileged EXEC.'],
  ], 'Common API auth types: HTTP basic (base64 user:password in each request, needs TLS), API keys, bearer tokens obtained from a login endpoint, and OAuth flows. Tokens expire, so scripts refresh them.'),
  Q('b6-rest-06', 'AUTO', 't6-rest', 'A script calls DELETE /api/v1/vlan/30 and gets 204. What happened?', [
    ['VLAN 30 was deleted and the server returned no body', true, 'Success, no content.'],
    ['The request failed', false, '2xx is success.'],
    ['VLAN 30 was created', false, 'DELETE removes.'],
    ['The server needs authentication', false, 'That would be 401.'],
  ], '204 No Content is the usual reply to a successful DELETE or PUT that has nothing to return. Scripts should check the status code before assuming success.'),
  Q('b6-rest-07', 'AUTO', 't6-rest', 'Which HTTP header tells the server the body you are sending is JSON?', [
    ['Content-Type: application/json', true, 'Describes the body sent.'],
    ['Accept: application/json', false, 'Says what you want back.'],
    ['Authorization: application/json', false, 'Not how authorization works.'],
    ['Host: application/json', false, 'Host names the server.'],
  ], 'Content-Type describes what is in this message\'s body; Accept tells the server which formats the client wants in the response. Getting them wrong commonly produces 415 Unsupported Media Type or 400 errors.'),
  Q('b6-rest-08', 'AUTO', 't6-rest', 'Which HTTP method is not idempotent, meaning repeating it can create duplicates?', [
    ['POST', true, 'Each call may create a new resource.'],
    ['GET', false, 'Reading has no side effects.'],
    ['PUT', false, 'Replacing with the same data gives the same result.'],
    ['DELETE', false, 'Deleting twice leaves it deleted.'],
  ], 'Idempotency matters for retries: a script can safely retry a GET, PUT or DELETE after a timeout, but retrying a POST may create the same object twice.'),
  Q('b6-rest-09', 'AUTO', 't6-rest', 'Which status code should a script expect after successfully creating an object with POST?', [
    ['201 Created', true, 'Often with the new resource\'s location.'],
    ['404 Not Found', false, 'Error.'],
    ['301 Moved Permanently', false, 'Redirect.'],
    ['403 Forbidden', false, 'Permission denied.'],
  ], 'Many APIs return 201 with a Location header or the new object in the body. Some return 200 or 202 (accepted, processing asynchronously), so read the API documentation.'),
  Q('b6-rest-10', 'AUTO', 't6-rest', 'A request returns 403 Forbidden. What is the most likely issue?', [
    ['The credentials are valid but lack permission for that resource or action', true, 'Authenticated, not authorized.'],
    ['The URI does not exist', false, '404.'],
    ['The token is missing', false, '401.'],
    ['The server is overloaded', false, '503.'],
  ], '401 means "who are you?" and 403 means "I know who you are, and you may not do this". Fix 403 with a role that has the right permissions, not by logging in again.'),
  Q('b6-rest-11', 'AUTO', 't6-rest', 'What does this response tell the script?', [
    ['The request body was malformed or invalid', true, '400 Bad Request.'],
    ['The device was updated', false, 'Failure.'],
    ['The token expired', false, 'That is usually 401.'],
    ['The server crashed', false, '5xx.'],
  ], '400 means the server understood the request line but rejected the body or parameters, here invalid JSON or a bad field value. Check the payload against the API schema.', {
    exhibit: X(`
PUT /api/v1/interface/Gi0-1 HTTP/1.1
Content-Type: application/json

{"description": "Uplink", "enabled": yes}

HTTP/1.1 400 Bad Request
{"error": "Invalid JSON at line 1: unexpected token 'yes'"}`,
      [/^PUT/m, 'cmd', 'HTTP method'], ['/api/v1/interface/Gi0-1', 'key', 'Resource URI'], ['yes', 'fail', 'Not valid JSON (use true)'], ['400 Bad Request', 'fail', 'Status: client error']),
  }),
  Q('b6-rest-12', 'AUTO', 't6-rest', 'Which part of this URI identifies the specific resource? https://ctrl.example.local/api/v1/sites/12/devices?role=access', [
    ['/api/v1/sites/12/devices', true, 'The path names the resource.'],
    ['https', false, 'The scheme.'],
    ['ctrl.example.local', false, 'The host.'],
    ['role=access', false, 'A query parameter that filters results.'],
  ], 'URI anatomy: scheme (https), host, path (the resource, often versioned like /api/v1), and query string after ? for filters or paging. Path variables such as 12 select one item.'),
  Q('b6-rest-13', 'AUTO', 't6-rest', 'Which data encodings are commonly used by network APIs? (Choose two.)', [
    ['JSON', true, 'Most REST APIs.'],
    ['XML', true, 'NETCONF and some REST APIs.'],
    ['MP3', false, 'Audio.'],
    ['PNG', false, 'Images.'],
  ], 'JSON dominates REST; XML is native to NETCONF; YAML is used by Ansible playbooks and some tools. All three represent the same nested key-value structures.'),
  Q('b6-rest-14', 'AUTO', 't6-rest', 'Why is HTTPS required when an API uses basic authentication?', [
    ['Basic auth only base64-encodes the username and password, which anyone can decode', true, 'Encoding is not encryption.'],
    ['Basic auth needs port 443', false, 'TLS is the reason.'],
    ['HTTP cannot carry headers', false, 'It can.'],
    ['It is faster', false, 'No.'],
  ], 'Base64 is reversible in one line of code. Without TLS, credentials in every request are exposed on the wire. Tokens over HTTPS limit exposure further because they expire.'),
  Q('b6-rest-15', 'AUTO', 't6-rest', 'Which method changes only the description of an interface without resending all its settings?', [
    ['PATCH', true, 'Partial update.'],
    ['PUT', false, 'Replaces the whole resource.'],
    ['POST', false, 'Creates.'],
    ['GET', false, 'Reads.'],
  ], 'PUT replaces the entire resource with what you send, so omitted fields may be reset. PATCH changes just the fields provided, which is safer for small edits.'),
  Q('b6-rest-16', 'AUTO', 't6-rest', 'An API call returns 500 Internal Server Error. Where is the problem most likely?', [
    ['On the server side, not in the client\'s request format', true, '5xx is a server fault.'],
    ['In the client\'s credentials', false, '401/403.'],
    ['In the URI', false, '404.'],
    ['In the JSON syntax', false, '400.'],
  ], 'Retry later or check the controller\'s health and logs. If the same request always triggers 500, report it with the request details, since the server should have returned a 4xx if the input was at fault.'),

  // ---------- t6-config ----------
  Q('b6-cfg-01', 'AUTO', 't6-config', 'Which configuration management tool is agentless and pushes changes over SSH using YAML playbooks?', [
    ['Ansible', true, 'Agentless, push, YAML.'],
    ['Puppet', false, 'Agent-based, pull, its own DSL.'],
    ['Chef', false, 'Agent-based, Ruby.'],
    ['SNMP', false, 'Monitoring protocol.'],
  ], 'Ansible runs from a control node, connects to devices over SSH (or APIs), and needs no software on them, which suits network gear. Playbooks list tasks in YAML; an inventory lists the devices.'),
  Q('b6-cfg-02', 'AUTO', 't6-config', 'Which tool describes infrastructure declaratively in HCL and keeps a state file of what it built?', [
    ['Terraform', true, 'Infrastructure as code.'],
    ['Ansible', false, 'Procedural tasks in YAML.'],
    ['Syslog', false, 'Logging.'],
    ['TFTP', false, 'File transfer.'],
  ], 'Terraform compares the desired state in your files with its recorded state, shows a plan, and applies only the differences. Providers let it manage clouds and many network platforms.'),
  Q('b6-cfg-03', 'AUTO', 't6-config', 'In an Ansible setup, what is the inventory?', [
    ['The list of managed hosts and groups, with connection variables', true, 'What to manage.'],
    ['The list of tasks to run', false, 'That is the playbook.'],
    ['An agent on each router', false, 'Ansible is agentless.'],
    ['A log of past changes', false, 'No.'],
  ], 'Inventory (INI or YAML) groups devices, for example [branch_routers], with variables like ansible_network_os. A playbook targets groups from it and runs modules such as ios_config.'),
  Q('b6-cfg-04', 'AUTO', 't6-config', 'What is a key benefit of declarative tools like Terraform?', [
    ['You describe the end state and the tool works out the steps', true, 'Declarative.'],
    ['You must list every command in order', false, 'That is procedural.'],
    ['They need no planning', false, 'terraform plan previews changes.'],
    ['They replace routing protocols', false, 'No.'],
  ], 'Declarative: "there should be these three VLANs". Procedural: "create VLAN 10, then 20, then 30". Declarative tools also remove things that are no longer described, which keeps reality matching the code.'),
  Q('b6-cfg-05', 'AUTO', 't6-config', 'Which statement about Puppet and Chef is true?', [
    ['Both traditionally use agents on managed nodes that pull configuration from a server', true, 'Agent-based, pull.'],
    ['Both are agentless', false, 'That is Ansible.'],
    ['Both use YAML playbooks', false, 'Puppet DSL and Ruby.'],
    ['They only manage wireless', false, 'No.'],
  ], 'Puppet uses manifests in its own language; Chef uses recipes and cookbooks in Ruby. Agent requirements made them less common for network devices; the v1.1 blueprint names Ansible and Terraform.'),
  Q('b6-cfg-06', 'AUTO', 't6-config', 'What does storing network configurations as code in a version control system such as Git provide?', [
    ['History of every change, review before deployment and easy rollback', true, 'Infrastructure as code practices.'],
    ['Faster packet forwarding', false, 'No.'],
    ['Automatic encryption of traffic', false, 'No.'],
    ['DHCP leases', false, 'No.'],
  ], 'With configs and playbooks in Git, every change has an author, a message and a diff, can be peer-reviewed in a pull request, and can be reverted. That is the same discipline software teams use.'),
  Q('b6-cfg-07', 'AUTO', 't6-config', 'Which statement describes push versus pull configuration management?', [
    ['Push: a central server sends changes to devices; pull: devices periodically fetch their configuration', true, 'Ansible pushes; Puppet agents pull.'],
    ['Push is always slower', false, 'Not inherently.'],
    ['Pull requires no server', false, 'Agents pull from a server.'],
    ['They are the same', false, 'Direction differs.'],
  ], 'Push gives immediate, operator-driven changes. Pull keeps devices converging to the desired state on a schedule. Network automation mostly uses push because devices rarely run agents.'),
  Q('b6-cfg-08', 'AUTO', 't6-config', 'Which file format are Ansible playbooks written in?', [
    ['YAML', true, 'Indentation-based.'],
    ['JSON only', false, 'YAML is standard for playbooks.'],
    ['HCL', false, 'Terraform.'],
    ['Ruby', false, 'Chef.'],
  ], 'YAML is a human-friendly superset of JSON. Indentation defines structure, so a misplaced space breaks a playbook. Lists start with "- " and mappings use key: value.'),
  Q('b6-cfg-09', 'AUTO', 't6-config', 'This Ansible task runs against branch routers. What does it do?', [
    ['Ensures NTP points to 10.1.1.1 on every router in the branch group', true, 'ios_config pushes those lines.'],
    ['Reboots the routers', false, 'No reload task.'],
    ['Collects show version output', false, 'That would be ios_command or facts.'],
    ['Installs an agent', false, 'Ansible is agentless.'],
  ], 'A play names the hosts (from inventory) and a list of tasks. cisco.ios.ios_config sends configuration lines and only changes devices that differ, reporting "changed" or "ok" per device.', {
    exhibit: X(`
- name: Standard NTP on branch routers
  hosts: branch_routers
  gather_facts: no
  tasks:
    - name: Point NTP at the core server
      cisco.ios.ios_config:
        lines:
          - ntp server 10.1.1.1`,
      ['hosts: branch_routers', 'key', 'Target group from inventory'], ['cisco.ios.ios_config', 'cmd', 'Module'], ['ntp server 10.1.1.1', 'ok', 'Configuration pushed'], ['10.1.1.1', 'ip']),
  }),
  Q('b6-cfg-10', 'AUTO', 't6-config', 'Which command previews the changes Terraform would make without applying them?', [
    ['terraform plan', true, 'Dry run.'],
    ['terraform apply', false, 'Makes the changes.'],
    ['terraform destroy', false, 'Removes resources.'],
    ['terraform show-run', false, 'Not a command.'],
  ], 'plan compares code with state and the deployed infrastructure and lists what will be created, changed or destroyed. Reviewing the plan before apply is the main safety step.'),
  Q('b6-cfg-11', 'AUTO', 't6-config', 'What is idempotence in configuration management?', [
    ['Running the same automation twice leaves the device in the same state, making no extra changes the second time', true, 'Safe to rerun.'],
    ['Running it twice doubles the configuration', false, 'The opposite.'],
    ['It only runs once ever', false, 'No.'],
    ['It requires a reboot', false, 'No.'],
  ], 'Well-written playbooks check before changing, so reruns report "ok" instead of "changed". That makes scheduled compliance runs safe and drift visible.'),
  Q('b6-cfg-12', 'AUTO', 't6-config', 'Why is configuration management valuable at scale? (Choose two.)', [
    ['Hundreds of devices get the same standard configuration consistently', true, 'Consistency.'],
    ['Drift from the standard is detected and corrected', true, 'Compliance.'],
    ['Devices no longer need IP addresses', false, 'No.'],
    ['It removes the need for change control', false, 'Changes still need review.'],
  ], 'Templates plus inventory variables generate per-device configs from one source of truth. The same tooling can audit what is actually running against what should be.'),
  Q('b6-cfg-13', 'AUTO', 't6-config', 'Which language is HCL associated with?', [
    ['Terraform configuration files', true, 'HashiCorp Configuration Language.'],
    ['Ansible playbooks', false, 'YAML.'],
    ['Cisco IOS', false, 'IOS CLI.'],
    ['JSON Schema', false, 'No.'],
  ], 'Terraform reads .tf files written in HCL, a declarative language with resources, variables and outputs. It can also accept JSON-formatted configuration.'),
  Q('b6-cfg-14', 'AUTO', 't6-config', 'What does Ansible need on a Cisco router to manage it?', [
    ['SSH access and credentials (or an API); no agent is installed', true, 'Agentless.'],
    ['A Python agent installed on IOS', false, 'Not needed.'],
    ['A Puppet master', false, 'Unrelated.'],
    ['SNMPv1 read-write', false, 'Not how it manages.'],
  ], 'Ansible\'s network modules log in over SSH (network_cli) or use NETCONF or RESTCONF. Python runs on the control node, not on the router.'),

  // ---------- t6-json ----------
  Q('b6-json-01', 'AUTO', 't6-json', 'How many keys does the top-level object in this JSON have?', [
    ['4', true, 'hostname, uptime_days, ospf_enabled, interfaces.'],
    ['3', false, 'Count again: four.'],
    ['6', false, 'That counts keys inside the array objects too.'],
    ['2', false, 'Too few.'],
  ], 'Count only the keys at the outer brace level. interfaces holds an array of two objects, each with its own name, ip and enabled keys, but those belong to the inner objects.', { exhibit: X(JSON_OK, ...JSON_MARKS) }),
  Q('b6-json-02', 'AUTO', 't6-json', 'What data type is the value of "interfaces"?', [
    ['An array of objects', true, 'Square brackets holding objects.'],
    ['A string', false, 'Strings are in quotes.'],
    ['An object', false, 'Objects use braces at that level.'],
    ['A boolean', false, 'Booleans are true or false.'],
  ], 'JSON value types: string, number, boolean (true or false), null, object { }, and array [ ]. Arrays are ordered lists; objects are unordered sets of key-value pairs.', { exhibit: X(JSON_OK, ...JSON_MARKS) }),
  Q('b6-json-03', 'AUTO', 't6-json', 'What is the value of "ip" for Gi0/1, and what does it mean?', [
    ['null: the key exists but has no value', true, 'Explicitly empty.'],
    ['An empty string', false, 'That would be "".'],
    ['false', false, 'That is a boolean.'],
    ['0', false, 'That is a number.'],
  ], 'null is its own JSON type meaning "no value". It is different from an empty string, zero or false, and scripts should test for it explicitly.', { exhibit: X(JSON_OK, ...JSON_MARKS) }),
  Q('b6-json-04', 'AUTO', 't6-json', 'Why is this JSON invalid?', [
    ['The keys are not in double quotes and there is a trailing comma', true, 'Two syntax errors.'],
    ['JSON cannot hold numbers', false, 'It can.'],
    ['Objects cannot contain booleans', false, 'They can.'],
    ['It is valid', false, 'It is not.'],
  ], 'JSON keys must be strings in double quotes, strings use double quotes (never single), there are no trailing commas and no comments. Validators point at the first error, so fix and recheck.', {
    exhibit: X(`
{
  hostname: "SW1",
  "vlans": [10, 20, 30],
}`,
      ['hostname', 'fail', 'Key without quotes'], [/,(?=\n})/, 'fail', 'Trailing comma'], ['"vlans"', 'key', 'Key (quoted)'], [/10, 20, 30/, 'count', 'Numbers in an array']),
  }),
  Q('b6-json-05', 'AUTO', 't6-json', 'Which is a valid JSON boolean?', [
    ['true', true, 'Lowercase, unquoted.'],
    ['"true"', false, 'That is a string.'],
    ['True', false, 'Case-sensitive.'],
    ['yes', false, 'Not JSON.'],
  ], 'JSON booleans are exactly true and false, lowercase and unquoted. "true" in quotes is a string, which a strict API may reject when it expects a boolean.'),
  Q('b6-json-06', 'AUTO', 't6-json', 'Which JSON correctly lists VLANs 10 and 20 with names?', [
    ['{"vlans": [{"id": 10, "name": "STAFF"}, {"id": 20, "name": "VOICE"}]}', true, 'Array of objects.'],
    ['{"vlans": {10: "STAFF", 20: "VOICE"}}', false, 'Keys must be quoted strings.'],
    ["{'vlans': [10, 'STAFF']}", false, 'Single quotes are invalid.'],
    ['{"vlans": [{"id": 10, "name": STAFF}]}', false, 'STAFF must be quoted.'],
  ], 'Strings need double quotes, keys are always strings, numbers are bare. An array of objects is the natural way to list items that each have several attributes.'),
  Q('b6-json-07', 'AUTO', 't6-json', 'What does the value at interfaces[0].ip hold?', [
    ['"10.0.12.1"', true, 'First element of the array, its ip key.'],
    ['null', false, 'That is interfaces[1].ip.'],
    ['"Gi0/0"', false, 'That is the name.'],
    ['true', false, 'That is enabled.'],
  ], 'Arrays are indexed from 0. interfaces[0] is the Gi0/0 object, and .ip reads its ip key. Scripts navigate JSON the same way, for example data["interfaces"][0]["ip"] in Python.', { exhibit: X(JSON_OK, ...JSON_MARKS) }),
  Q('b6-json-08', 'AUTO', 't6-json', 'Which characters enclose a JSON object and an array?', [
    ['Object { }, array [ ]', true, 'Braces and brackets.'],
    ['Object [ ], array { }', false, 'Reversed.'],
    ['Both ( )', false, 'Parentheses are not JSON.'],
    ['Both < >', false, 'That is XML.'],
  ], 'Objects use curly braces and contain "key": value pairs separated by commas. Arrays use square brackets and contain values separated by commas. Nesting the two describes any structure.'),
  Q('b6-json-09', 'AUTO', 't6-json', 'Does whitespace and indentation change the meaning of JSON?', [
    ['No; it is only for readability', true, 'Insignificant outside strings.'],
    ['Yes; indentation defines nesting', false, 'That is YAML.'],
    ['Yes; every line must end in a comma', false, 'No.'],
    ['Only tabs are allowed', false, 'Any whitespace works.'],
  ], 'Unlike YAML, JSON structure comes from braces, brackets, colons and commas. APIs often send it minified on one line; tools pretty-print it for humans.'),
  Q('b6-json-10', 'AUTO', 't6-json', 'What type is the value of "uptime_days"?', [
    ['Number', true, 'Unquoted 23.'],
    ['String', false, 'It is not in quotes.'],
    ['Boolean', false, 'No.'],
    ['Array', false, 'No.'],
  ], 'Numbers in JSON are unquoted and can be integers or decimals (no leading zeros, no hex). "23" in quotes would be a string, which matters when a script does arithmetic.', { exhibit: X(JSON_OK, ...JSON_MARKS) }),
  Q('b6-json-11', 'AUTO', 't6-json', 'Which of these is valid JSON?', [
    ['{"ntp": ["10.1.1.1", "10.1.1.2"], "timezone": "UTC"}', true, 'Quoted keys and strings, array, no trailing comma.'],
    ['{"ntp": [10.1.1.1, 10.1.1.2]}', false, 'IP addresses must be quoted strings.'],
    ['{"ntp": "10.1.1.1",}', false, 'Trailing comma.'],
    ['{ntp = "10.1.1.1"}', false, 'Unquoted key and = instead of :.'],
  ], 'Spot the usual errors fast: unquoted keys, single quotes, trailing commas, = instead of :, and unquoted non-numeric values such as IP addresses.'),
  Q('b6-json-12', 'AUTO', 't6-json', 'What separates a key from its value in JSON?', [
    ['A colon', true, '"key": value.'],
    ['An equals sign', false, 'Not JSON.'],
    ['A comma', false, 'Separates pairs.'],
    ['A semicolon', false, 'Not JSON.'],
  ], 'Each pair is "key": value, pairs are separated by commas, and the last pair has no comma after it. The equals sign belongs to other formats such as INI files, and YAML also uses a colon but without the quotes and braces.'),
  Q('b6-json-13', 'AUTO', 't6-json', 'How many elements are in the "interfaces" array?', [
    ['2', true, 'Two objects.'],
    ['3', false, 'Each object has three keys, but there are two objects.'],
    ['6', false, 'Counting keys.'],
    ['1', false, 'Two.'],
  ], 'Count the items between the square brackets at that level: two objects separated by one comma. Array length questions are common because scripts loop over arrays.', { exhibit: X(JSON_OK, ...JSON_MARKS) }),
  Q('b6-json-14', 'AUTO', 't6-json', 'Which JSON value correctly represents an empty list of neighbors?', [
    ['"neighbors": []', true, 'An empty array.'],
    ['"neighbors": ""', false, 'An empty string.'],
    ['"neighbors": none', false, 'Not JSON.'],
    ['"neighbors": [,]', false, 'Invalid.'],
  ], 'Use [] for an empty list and {} for an empty object. null means absent. Choosing the right one keeps scripts that loop over the field from crashing.'),
];
