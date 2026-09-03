# Conduit

[![CI](https://github.com/AnoRebel/conduit/actions/workflows/ci.yml/badge.svg)](https://github.com/AnoRebel/conduit/actions/workflows/ci.yml)
[![JSR @conduit/server](https://jsr.io/badges/@conduit/server)](https://jsr.io/@conduit/server)
[![JSR @conduit/client](https://jsr.io/badges/@conduit/client)](https://jsr.io/@conduit/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-888-brightgreen)](https://github.com/AnoRebel/conduit/actions/workflows/ci.yml)

WebRTC peer-to-peer data, video, and audio connections made simple.

Conduit provides an easy-to-use API for creating peer-to-peer connections using WebRTC. It handles the complexity of WebRTC signaling and offers automatic fallback to WebSocket relay when direct connections aren't possible.

## Features

- **Simple API** - Connect to peers with just a few lines of code
- **Multiple Transports** - WebRTC DataChannels, WebSocket relay, or automatic fallback
- **Rooms & Presence** - Peers join named rooms and are told when others arrive or leave
- **Topics & Multicast** - Publish/subscribe with prefix patterns and room broadcast (opt-in)
- **Horizontal Scaling** - Optional Redis backend shares peers, rooms, and topics across instances
- **Media Streaming** - Video and audio calls with MediaStream support
- **Multiple Serialization** - Binary, JSON, MessagePack, or raw data
- **Framework Adapters** - Works with Node.js, Express, Fastify, Hono, and Bun
- **TypeScript** - Full type definitions included
- **Cloud Server** - Best-effort demo server at [`conduit.anorebel.net`](https://conduit.anorebel.net) (see [the note below](#about-the-hosted-demo-server)) or self-host
- **Admin Dashboard** - Live monitoring UI at [`conduit-ui.anorebel.net`](https://conduit-ui.anorebel.net)
- **Security** - Timing-safe auth, rate limiting, body size limits, CSRF protection, input validation, HTTPS enforcement, origin validation

## Packages

| Package | Description | Registry |
|---------|-------------|----------|
| [`@conduit/client`](./packages/client) | Browser/Node.js client library | [![JSR](https://jsr.io/badges/@conduit/client)](https://jsr.io/@conduit/client) |
| [`@conduit/server`](./packages/server) | Signaling server | [![JSR](https://jsr.io/badges/@conduit/server)](https://jsr.io/@conduit/server) |
| [`@conduit/shared`](./packages/shared) | Shared types and enums | [![JSR](https://jsr.io/badges/@conduit/shared)](https://jsr.io/@conduit/shared) |
| [`@conduit/admin`](./packages/admin) | Admin API and monitoring tools | [![JSR](https://jsr.io/badges/@conduit/admin)](https://jsr.io/@conduit/admin) |
| [`@conduit/admin-ui`](./packages/admin-ui) | Vue 3/Nuxt 4 admin dashboard | — |
| [`conduit-go`](./packages/go-client) | Go signaling client (no built-in WebRTC transport) | — |

## About the Hosted Demo Server

`conduit.anorebel.net` is a single small instance run by the maintainer so that
the examples in this README work when you paste them, and so the dashboard has
something to connect to. **It is a convenience for trying Conduit out, not a
service to build on.**

It is used only when you do not supply a host of your own. Concretely:

- There is **no uptime guarantee**. It is restarted, redeployed, and occasionally
  taken down without notice.
- There is **no data retention guarantee**. Peers, rooms, and topics live in one
  process; a restart clears them.
- It is **rate limited and capacity limited**, and shared with everyone else
  evaluating the project.
- It may be **withdrawn entirely** at any time.

Do not point a production application at it. Self-hosting is a single container
(see [Docker Deployment](#docker-deployment)) and takes about a minute — pass
your own `host` to the client and the default is never used:

```javascript
const conduit = new Conduit("my-peer-id", {
  host: "signaling.example.com",
  secure: true,
});
```

## Possible Use Cases

Conduit is a signaling server plus a client library. The server introduces peers
to each other and carries the small control messages WebRTC needs; once a
connection is established, media and data flow directly between peers. That
shape suits some problems well and others badly, so this section is as much
about the second group as the first.

### Where it fits

**Peer-to-peer file transfer.** A DataChannel moves bytes between two browsers
without the file touching your servers. Conduit carries only the offer, answer,
and ICE candidates — a few kilobytes regardless of whether the transfer is 2 MB
or 2 GB. This is the case where the economics are most obviously in your favour.

**Video and voice calls.** Rooms give you the membership and presence a call UI
needs: who is here, who just joined, who dropped. Media never traverses the
signaling server, so a four-person call costs the same server-side as an idle
one.

**Collaborative editing and shared cursors.** Peers in a room exchange CRDT
updates or cursor positions over DataChannels. Latency is a direct hop rather
than a round trip through your infrastructure, which is the difference between
cursors that feel attached to the pointer and cursors that lag.

**Local-first and offline-tolerant apps.** Two devices on the same network can
keep talking over a direct connection. The signaling server is needed to
introduce them, not to sustain them.

**Multiplayer game state.** Topics with prefix patterns (`game.lobby.*`) let you
segment traffic by concern, and room broadcast reaches every player in a match.
Suits games where players tolerate peer-authoritative state — see the caveat
below if yours does not.

**Screen sharing and remote assistance.** The same media path as calls, with
rooms scoping who can see whom.

**IoT and device pairing.** The Go client speaks the same protocol, so a device
and a browser can be introduced by the same server. Note that the Go client has
no built-in WebRTC transport — it signals and relays, but does not establish
DataChannels itself.

### Where it does not fit

Being direct about this saves you an architecture you would have to undo:

- **Guaranteed delivery to offline peers.** Conduit introduces peers that are
  both online. It is not a message queue, and it does not store messages for a
  peer that is not connected. Reach for a queue or a database instead.
- **Server-authoritative game state.** Peer-to-peer means peers can lie. If a
  cheating player would ruin your game, you want an authoritative server, and
  Conduit is not one.
- **Large-scale broadcast (one to thousands).** Multicast fan-out is bounded on
  purpose, and a peer's uplink is not a CDN. For one-to-many streaming at scale,
  use an SFU or a media server.
- **Anything requiring an audit trail of message content.** Direct connections
  mean the server never sees the payload. That is a feature for privacy and a
  problem for compliance — if you must log what users send each other, relay it
  through your own service instead.
- **Guaranteed peer-to-peer connectivity.** Symmetric NATs and restrictive
  corporate firewalls defeat direct connections. Conduit falls back to WebSocket
  relay, but relayed traffic does traverse your server and does cost bandwidth.
  Budget for a TURN server if reliability matters.

### Why not just use a WebSocket server?

If every message must pass through your infrastructure anyway — because you need
to validate, persist, or audit it — then a plain WebSocket server is simpler and
you should use one. Conduit earns its place when you want the *server out of the
data path*: lower latency, lower bandwidth cost, and payloads your infrastructure
never sees.

## Quick Start

### Client

```bash
bunx jsr add @conduit/client
# or
npx jsr add @conduit/client
```

```typescript
import { Conduit } from '@conduit/client';

// Create a new Conduit instance
const conduit = new Conduit('my-peer-id');

// Wait for connection to signaling server
conduit.on('open', (id) => {
  console.log('Connected with ID:', id);

  // Connect to another peer
  const conn = conduit.connect('other-peer-id');

  conn.on('open', () => {
    conn.send('Hello!');
  });

  conn.on('data', (data) => {
    console.log('Received:', data);
  });
});

// Handle incoming connections
conduit.on('connection', (conn) => {
  conn.on('data', (data) => {
    console.log('Received:', data);
  });
});
```

### Server

```bash
bunx jsr add @conduit/server
# or
npx jsr add @conduit/server
```

```typescript
import { createConduitServer } from '@conduit/server';

const server = createConduitServer({
  config: {
    port: 9000,
    path: '/',
  }
});

server.listen(9000, () => {
  console.log('Conduit server running on port 9000');
});
```

Or run the CLI:

```bash
bunx @conduit/server start
# or
npx @conduit/server start
```

## Rooms and Presence

Peers join named rooms to discover each other, instead of distributing peer IDs
out of band. Joining returns the current membership, and members are told when
others arrive or leave.

```typescript
const room = await conduit.join('standup');

console.log('already here:', room.members);

room.on('peerJoined', (peerId) => {
  // Connect to the new arrival; the room tells you who to call.
  const conn = conduit.connect(peerId);
  conn.on('open', () => conn.send('hello'));
});

room.on('peerLeft', (peerId) => console.log(peerId, 'left'));

room.leave();
```

Rooms are enabled by default and add no fan-out amplification: the server sends
one presence notification per member, exactly as it would for a direct message.
A room ceases to exist when its last member leaves, and membership is never
restored automatically on reconnect — a returning peer joins again explicitly.

See [`examples/rooms.ts`](./examples/rooms.ts) for a complete runnable program;
it is executed as part of `bun run test`, so it cannot drift from the API.

## Topics and Multicast

Topics deliver a message to every matching subscriber, and `broadcast` reaches
a room's other members. **Both are disabled by default** — they turn one inbound
message into N outbound ones, which changes the server's bandwidth profile from
O(1) to O(recipients) per message.

Enable them explicitly:

```typescript
const server = createConduitServer({
  config: {
    key: process.env.CONDUIT_KEY,
    topics: { enabled: true },
  },
});
```

Then subscribe and publish:

```typescript
// Exact topic, or a namespace prefix ending in `.*`
const topic = await conduit.subscribe('chat.*');

topic.on('message', (data, name, from) => {
  console.log(`${from} published to ${name}:`, data);
});

conduit.publish('chat.general', { text: 'hello' });
```

Prefix matching is by whole segment: `chat.*` matches `chat.general` but **not**
`chatter.general`. Only a single trailing `.*` is supported — arbitrary glob
matching would make resolving subscribers scale with the total number of
subscriptions, which is itself a denial-of-service vector.

### Limits that bound amplification

Every limit has a finite default, so worst-case egress is computable rather than
open-ended:

| Setting | Default | What it bounds |
|---------|---------|----------------|
| `topics.enabled` | `false` | Multicast is opt-in entirely |
| `topics.maxRecipientsPerMessage` | `256` | Recipients one message may reach |
| `topics.maxMulticastMessageSize` | `16384` | Bytes per multicast payload |
| `topics.maxSubscriptionsPerPeer` | `64` | Subscriptions one peer may hold |
| `topics.maxSubscribersPerTopic` | `1024` | Subscribers on one topic |
| `topics.maxTopics` | `10000` | Distinct topics on the server |
| `rooms.maxMembersPerRoom` | `256` | Members in one room |
| `rooms.maxRoomsPerPeer` | `32` | Rooms one peer may occupy |
| `rooms.maxRooms` | `10000` | Rooms in existence |

Worst case per message is `maxRecipientsPerMessage x maxMulticastMessageSize`
(4 MiB by default). Sustained throughput is bounded separately: the rate limiter
charges a sender **per delivery**, not per message, so addressing a 256-member
room consumes a peer's budget 256x faster rather than granting 256x the
throughput.

See [`examples/topics.ts`](./examples/topics.ts) for a runnable program covering
prefix matching, self-delivery, sender exclusion, and the size limit.

## Transport Types

Conduit supports three transport types:

- **`webrtc`** - Direct peer-to-peer using WebRTC DataChannels (default)
- **`websocket`** - Relay through server using WebSockets
- **`auto`** - Try WebRTC first, fallback to WebSocket if it fails

```typescript
const conn = conduit.connect('peer-id', {
  transport: TransportType.Auto,
  webrtcTimeout: 5000, // Fallback after 5 seconds
});
```

## Serialization

Choose how data is serialized:

- **`binary`** - BinaryPack format (default, efficient)
- **`json`** - JSON format (human-readable)
- **`msgpack`** - MessagePack format (compact)
- **`raw`** - No serialization (ArrayBuffer/Blob)

## Media Connections

```typescript
// Make a call
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then((stream) => {
    const call = conduit.call('peer-id', stream);

    call.on('stream', (remoteStream) => {
      // Display remote stream
      videoElement.srcObject = remoteStream;
    });
  });

// Answer a call
conduit.on('call', (call) => {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
      call.answer(stream);

      call.on('stream', (remoteStream) => {
        videoElement.srcObject = remoteStream;
      });
    });
});
```

## Self-Hosting

Run your own signaling server:

```typescript
import { createConduitServer } from '@conduit/server';

const server = createConduitServer({
  config: {
    port: 9000,
    host: '0.0.0.0',
    path: '/',
    // Set a real key. The server refuses to start without one, or with the
    // well-known default "conduit"; when embedding the server yourself, pass
    // your own key here. Keep this out of source control.
    key: process.env.CONDUIT_KEY,
    allowDiscovery: false,
    requireSecure: true, // Enforce HTTPS/WSS
    allowedOrigins: ['https://your-app.com'],
    // Trust X-Forwarded-For only when a reverse proxy sets it. Left false,
    // rate limiting and bans use the transport-level peer address, so a
    // client cannot spoof the header to evade them. Pass a string to read a
    // different header, e.g. 'CF-Connecting-IP'.
    proxied: false,
    relay: {
      enabled: true,
      maxMessageSize: 65536,
    },
    rateLimit: {
      enabled: true,
      maxTokens: 100,
      refillRate: 50,
    },
    logging: {
      level: 'info',
      pretty: false,
    },
  },
});

server.listen();
```

Then connect your client:

```typescript
const conduit = new Conduit('my-id', {
  host: 'your-server.com',
  port: 9000,
  secure: true,
});
```

## Framework Adapters

### Express

```typescript
import express from 'express';
import { ExpressConduitServer } from '@conduit/server';

const app = express();
const server = app.listen(9000);

app.use('/conduit', ExpressConduitServer(server, {
  config: { path: '/conduit' }
}));
```

### Fastify

```typescript
import Fastify from 'fastify';
import { fastifyConduitPlugin } from '@conduit/server/adapters/fastify';

const fastify = Fastify();
fastify.register(fastifyConduitPlugin, { config: { path: '/' } });
fastify.listen({ port: 9000 });
```

### Hono (Bun/Deno/Node)

```typescript
import { Hono } from 'hono';
import { upgradeWebSocket, websocket } from 'hono/bun';
import { createConduitMiddleware } from '@conduit/server/adapters/hono';

const app = new Hono();
const conduit = createConduitMiddleware({ config: { path: '/' } });

app.use('/*', conduit.middleware);

// WebSocket signaling. `upgradeWebSocket` is runtime-specific — import it from
// 'hono/bun', 'hono/deno', 'hono/cloudflare-workers', or '@hono/node-server'.
app.get('/conduit', upgradeWebSocket(conduit.createWebSocketHandler));

export default { fetch: app.fetch, websocket };
```

### Bun

```typescript
import { createConduitServer } from '@conduit/server/adapters/bun';

const server = createConduitServer({ config: { port: 9000 } });
server.serve();
```

## Admin API

The `@conduit/admin` package provides monitoring and administration capabilities for your Conduit servers.

### CLI Integration (Recommended)

The simplest way to run the server with admin API is via the CLI:

```bash
# Start with admin API enabled using CLI flags
conduit start --admin --admin-api-key "your-secret-key"

# Or use environment variables
ADMIN_ENABLED=true ADMIN_API_KEY="your-secret-key" conduit start

# Generate a secure API key
openssl rand -base64 32
```

The CLI supports all admin configuration via flags and environment variables:

```bash
conduit start \
  --admin \
  --admin-path /admin \
  --admin-auth-type apiKey \
  --admin-api-key "$(openssl rand -base64 32)"

# With optional auth mode and SQLite persistence
conduit start --admin --admin-api-key "your-key" --auth none --db ./conduit.db

# With embedded admin UI (serve dashboard from same process)
conduit start --admin --admin-api-key "your-key" --admin-ui ./admin-ui-dist --admin-ui-path /ui
```

### Embedded Mode

For custom setups, you can embed the admin API in your own Express/Fastify/Hono app:

```typescript
import express from 'express';
import { ExpressConduitServer } from '@conduit/server';
import { createExpressAdminMiddleware } from '@conduit/admin/adapters/express';
import { createAdminCore, createAdminConfig } from '@conduit/admin';

const app = express();
const server = app.listen(9000);

// Create Conduit server
const conduit = ExpressConduitServer(server, { config: { path: '/conduit' } });

// Create admin core and attach to server
const adminCore = createAdminCore({
  config: createAdminConfig({
    auth: { methods: ['apiKey'], apiKey: process.env.ADMIN_API_KEY },
  }),
});
adminCore.attachToServer(conduit.core);

// Mount admin middleware
app.use('/admin', createExpressAdminMiddleware({ admin: adminCore }));
```

### Standalone Dashboard

Run the admin UI as a standalone Nuxt application:

```bash
cd packages/admin-ui
bun run dev
```

Configure the API endpoint via environment variables:

```bash
NUXT_PUBLIC_ADMIN_API_URL=http://localhost:9000/admin
NUXT_PUBLIC_ADMIN_WS_URL=ws://localhost:9000/admin/ws
```

The production admin dashboard is deployed at [`conduit-ui.anorebel.net`](https://conduit-ui.anorebel.net).

### Admin Features

- **Real-time Monitoring** - Live metrics, throughput, latency, theme-reactive charts
- **Client Management** - View, disconnect, and ban clients with DataTables
- **Room Administration** - Inspect rooms, place peers into one (creating it), and dissolve rooms
- **IP Banning** - Block abusive IP addresses with SQLite persistence
- **Audit Logging** - Track all admin actions with permanent storage
- **Multiple Auth Methods** - API Key, JWT, or Basic authentication
- **Role-Based Access** - JWT viewers (read-only) vs admins (full access)
- **Framework Adapters** - Express, Fastify, Hono, or Node.js HTTP
- **SQLite Persistence** - Optional embedded database for bans, audit logs, and metrics (`bun:sqlite`)
- **Optional Auth Mode** - Run signaling with or without key authentication (`--auth key|none`)
- **Embedded Admin UI** - Serve the dashboard directly from the server process
- **Socket.IO-style Connection** - Dynamic server connection dialog in the admin UI, with instance switching and a disconnect that clears cached data

## Security

- **Required Signaling Key** - The server refuses to start without a key, or with the well-known default, enforced by the library rather than only the CLI. Set `CONDUIT_KEY` or `--key`; `--allow-insecure-key` exists for local development only. The key is masked in startup output.
- **Timing-Safe Key Comparison** - API key authentication uses constant-time comparison to prevent timing attacks
- **Ban Enforcement** - Banned peer IDs and source addresses are rejected at connection time, and a peer banned while connected is disconnected. Requires the admin API, which owns the ban list.
- **Uniform Adapter Protections** - Rate limiting, role checks, CSRF content-type validation, and body-size limits are enforced identically by every admin adapter (Node, Express, Fastify, Hono), asserted by a parity test suite.
- **Least-Privilege Roles** - A credential that does not explicitly carry the `admin` role is treated as `viewer`, and viewers cannot perform state-changing requests. Grant admin per method with `apiKeyRole`, `basicRole`, or `sessionRole`, or via a JWT `role` claim.
- **Body Size Limits** - Request bodies are capped at 1MB to prevent denial-of-service via large payloads
- **CSRF Protection** - Mutating requests must declare a JSON content type; a missing or form-submittable content type is rejected
- **Rate Limiting** - Token bucket rate limiting is enforced on the signaling server, the admin API, and admin realtime authentication
- **Proxy Trust** - `X-Forwarded-For` is honoured only when the server is configured to sit behind a proxy (`proxied` / `trustProxy`), so a client cannot spoof its address to evade rate limits or bans
- **Peer Identity Protection** - Messages queued for a peer ID are not delivered to a different party that later claims it; server-generated IDs are 96-bit CSPRNG values
- **Input Validation** - Client IDs, tokens, keys, and message destinations are validated against safe patterns; JSON parsing includes depth limits
- **Pinned JWT Algorithms** - Token verification accepts only HS256, so a token cannot dictate how it is verified
- **HTTPS/WSS Enforcement** - Optional `requireSecure: true` rejects non-HTTPS/WSS connections in production
- **Origin Validation** - Restrict WebSocket connections to specific origins via `allowedOrigins`, enforced by every adapter
- **Graceful Shutdown** - Server sends `GOAWAY` messages to clients before shutting down

## Comparison with Alternatives

| Feature | Conduit | PeerJS | Socket.IO | ws | simple-peer |
|---------|---------|--------|-----------|-----|-------------|
| **Connection Type** | P2P + Relay | P2P only | Server relay | Server relay | P2P only |
| **WebRTC Data** | Yes | Yes | No | No | Yes |
| **WebRTC Media** | Yes | Yes | No | No | Yes |
| **WebSocket Fallback** | Yes | No | N/A | N/A | No |
| **Auto Fallback** | Yes | No | No | No | No |
| **Built-in Signaling** | Yes | Yes | N/A | No | No |
| **Rooms & Presence** | Yes | No | Yes | No | No |
| **Pub/Sub Topics** | Yes | No | Yes | No | No |
| **Horizontal Scaling** | Redis (optional) | No | Redis adapter | Manual | N/A |
| **Binary Data** | Yes | Yes | Yes | Yes | Yes |
| **TypeScript** | Full | Partial | Full | Full | Types pkg |
| **Browser + Node** | Yes | Browser | Yes | Node | Yes |
| **Framework Adapters** | Yes | No | Yes | No | No |
| **Admin Dashboard** | Yes | No | Yes | No | No |
| **Rate Limiting** | Built-in | No | No | No | No |
| **Scales to** | P2P: unlimited | P2P: unlimited | Server capacity | Server capacity | P2P: unlimited |

### When to Use What

**Choose Conduit when you need:**
- Direct peer-to-peer connections with automatic server fallback
- Group calls or collaborative sessions, where rooms tell each peer who to connect to
- Video/audio calls between browsers
- A complete solution with signaling server, client, and admin tools
- Framework flexibility (Express, Fastify, Hono, Bun)
- Built-in rate limiting, origin validation, and enforced bans

**Choose PeerJS when you need:**
- Simple P2P connections without fallback requirements
- Drop-in compatibility (Conduit offers a PeerJS compatibility layer)
- Minimal setup for prototypes

**Choose Socket.IO when you need:**
- A mature, general-purpose server-to-client messaging bus
- Acknowledgements, binary streams, and its wider middleware ecosystem
- Automatic reconnection with state sync
- You don't need P2P connections

Conduit now covers rooms, presence, and pub/sub topics, so those alone no longer
decide between them. The distinction is what the two are for: Conduit is a
signaling broker that also relays, and its multicast is deliberately bounded and
off by default. Socket.IO is a message bus first, with a broader feature surface
for that job.

**Choose ws when you need:**
- Raw WebSocket performance
- Custom protocol implementation
- Server-side only WebSocket handling
- Minimal abstraction overhead

**Choose simple-peer when you need:**
- Just WebRTC without signaling
- To build your own signaling layer
- Maximum control over the connection

### Architecture Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                         Conduit                                  │
├─────────────────────────────────────────────────────────────────┤
│  Client A ◄──── WebRTC P2P ────► Client B                       │
│      │                               │                           │
│      └──── WebSocket (fallback) ─────┘                          │
│                    │                                             │
│              Signaling Server                                    │
│         (also handles relay if P2P fails)                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       Socket.IO / ws                             │
├─────────────────────────────────────────────────────────────────┤
│  Client A ◄──── WebSocket ────► Server ◄──── WebSocket ────► Client B │
│                                                                  │
│  (All data flows through the server - no P2P)                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PeerJS / simple-peer                          │
├─────────────────────────────────────────────────────────────────┤
│  Client A ◄──── WebRTC P2P ────► Client B                       │
│                                                                  │
│  (P2P only - fails if direct connection impossible)             │
└─────────────────────────────────────────────────────────────────┘
```

### Performance Characteristics

| Metric | P2P (Conduit/PeerJS) | Server Relay (Socket.IO/ws) |
|--------|---------------------|----------------------------|
| Latency | Lower (direct) | Higher (server hop) |
| Server Load | Minimal (signaling only) | High (all traffic) |
| Bandwidth Cost | None after connection | Linear with traffic |
| NAT Traversal | STUN/TURN required | Not needed |
| Reliability | Depends on network | Server-dependent |
| Scalability | Excellent | Limited by server |

## Upgrading

### Breaking changes in 3.0.0

**The signaling key is enforced by the library, not only the CLI.**

2.0.0 required a key, but only `conduit start` checked it. Creating a server
programmatically still fell back to the public default:

```typescript
// Started in 2.0.0 on the key "conduit". Throws in 3.0.0.
const server = createConduitServer({ config: { port: 9000 } });
```

Pass a key, as the CLI already required:

```typescript
const server = createConduitServer({
  config: { port: 9000, key: process.env.CONDUIT_KEY },
});

// Local development only
const dev = createConduitServer({
  config: { port: 9000 },
  allowInsecureKey: true,
});
```

Servers using `auth: { mode: "none" }` are unaffected, and no CLI behaviour
changed. If you deploy with the CLI or a Docker image and already set
`CONDUIT_KEY`, this release requires nothing of you.

### Breaking changes in 2.0.0

**1. A signaling key is now required.**

The server previously defaulted to the key `conduit`, which is published in
this README and therefore offers no protection. It now refuses to start
without a key, or with that default:

```bash
# Set a real key (new environment variable)
CONDUIT_KEY="$(openssl rand -base64 24)" conduit start
# or
conduit start --key "$(openssl rand -base64 24)"

# Local development only — starts with a warning
conduit start --key conduit --allow-insecure-key
```

`conduit init` now generates a key instead of offering the default.

**2. Admin credentials are least-privilege by default.**

Previously any valid API key, Basic credential, or session was silently
treated as an `admin`, and there was no way to issue a read-only credential.
A credential that does not explicitly carry the `admin` role is now a
`viewer`, and viewers cannot perform state-changing requests.

If you use an API key for writes, grant it the role explicitly:

```typescript
createAdminConfig({
  auth: { methods: ["apiKey"], apiKey: process.env.ADMIN_API_KEY, apiKeyRole: "admin" },
});
```

`basicRole` and `sessionRole` work the same way. JWTs continue to carry
their role in the `role` claim.

**3. Express, Fastify, and Hono admin adapters now enforce the same rules
as the Node adapter.**

Those three adapters previously performed no rate limiting, role checks,
CSRF validation, or body-size limits. They now do. Expect `403` on
viewer-role writes, `429` on rate-limit breaches, `415` on requests that do
not declare a JSON content type, and `413` on oversized bodies — responses
the Node adapter already returned.

**4. `X-Forwarded-For` is no longer trusted by default.**

Set `proxied` (signaling server) or `trustProxy` (admin API) when running
behind a reverse proxy, otherwise rate limiting and bans use the
transport-level peer address:

```typescript
createConduitServer({ config: { proxied: true } });
createAdminConfig({ trustProxy: true });
```

**5. `@conduit/client` type declarations changed shape (npm only).**

The package now ships a tree of `.d.ts` files rather than three bundled
ones, because TypeScript 7 removed the compiler API the bundler relied on.
Type resolution is unchanged for consumers — the `exports` map points at the
new paths. JSR consumers are unaffected, as JSR publishes from source.

## Migration from PeerJS

Conduit provides a compatibility layer for easy migration:

```typescript
// Before (PeerJS)
import { Peer } from 'peerjs';
const peer = new Peer('my-id');

// After (Conduit with compat layer)
import { Peer } from '@conduit/client/peerjs-compat';
const peer = new Peer('my-id');
```

## Installation

### From npm (recommended)

```bash
# Client
bunx jsr add @conduit/client
# or
npx jsr add @conduit/client

# Server
bunx jsr add @conduit/server
# or
npx jsr add @conduit/server
```

### From GitHub

You can also install directly from GitHub:

```bash
# Install the client from GitHub
bun add github:AnoRebel/conduit
# or
npm install github:AnoRebel/conduit#packages/client

# Install the server from GitHub
npm install github:AnoRebel/conduit#packages/server
```

## Docker Deployment

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/AnoRebel/conduit.git
cd conduit/docker

# Start the server (signaling only)
docker compose up server -d

# Or start with admin API enabled
docker compose --profile admin up -d
```

### Docker Images

Docker images use [`imbios/bun-node`](https://hub.docker.com/r/imbios/bun-node) for the builder stage and [`oven/bun`](https://hub.docker.com/r/oven/bun) for production:

- **Builder stage**: `imbios/bun-node:1.3.14-24-debian`
- **Production stage**: `oven/bun:1.3.14-slim`

| Image | Description | Port |
|-------|-------------|------|
| `server` | Signaling server only | 9000 |
| `server-admin` | Server with Admin API | 9000 |
| `admin-ui` | Admin Dashboard (Nuxt) | 3000 |
| `all-in-one` | Server + Admin API + Embedded UI | 9000 |

### Using Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  conduit:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    ports:
      - "9000:9000"
    environment:
      - PORT=9000
      - HOST=0.0.0.0
      - CONDUIT_KEY=your-secret-key
      - ALLOW_DISCOVERY=false
    restart: unless-stopped
```

### Running with Admin Dashboard

```bash
# Generate a secure admin API key
export ADMIN_API_KEY=$(openssl rand -base64 32)

# Start server with admin API and dashboard
docker compose --profile admin up -d

# Access the dashboard at http://localhost:3000
```

The server-admin container reads `ADMIN_ENABLED`, `ADMIN_API_KEY`, and other `ADMIN_*` env vars automatically via the CLI.

### All-in-One Deployment

Run the server, admin API, and dashboard in a single container:

```bash
docker compose --profile all-in-one up -d

# Access the server at http://localhost:9000
# Admin API at http://localhost:9000/admin/v1
# Admin UI at http://localhost:9000/ui
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `9000` |
| `HOST` | Bind address | `0.0.0.0` |
| `CONDUIT_KEY` | Signaling key for clients (required; the server refuses to start without it) | - |
| `ALLOW_DISCOVERY` | Enable peer discovery endpoint | `false` |
| `ADMIN_ENABLED` | Enable admin API | `false` |
| `ADMIN_PATH` | Admin API path prefix | `/admin` |
| `ADMIN_AUTH_TYPE` | Authentication method (`apiKey`, `jwt`, `basic`) | `apiKey` |
| `ADMIN_API_KEY` | Admin API authentication key (use `openssl rand -base64 32`) | - |
| `ADMIN_JWT_SECRET` | Secret for JWT token signing/verification | - |
| `ADMIN_BASIC_USER` | Username for Basic authentication | - |
| `ADMIN_BASIC_PASS` | Password for Basic authentication | - |
| `ADMIN_CORS_ORIGINS` | Allowed CORS origins for admin API | `*` |
| `AUTH_MODE` | Signaling auth mode (`key` or `none`) | `key` |
| `ADMIN_DB_PATH` | SQLite database file path for persistence | - |
| `ADMIN_UI_DIR` | Directory with admin UI static files | - |
| `ADMIN_UI_PATH` | URL path to serve admin UI at | `/ui` |

## Development

This is a Bun monorepo with [lefthook](https://github.com/evilmartians/lefthook) git hooks for automated quality checks.

```bash
# Install dependencies (also installs git hooks via lefthook)
bun install

# Build all packages
bun run build

# Run tests (603 tests across all packages)
bun run test

# Type checking
bun run typecheck

# Run linting (Biome)
bun run lint

# Format code
bun run format

# Full validation (lint + format check + typecheck + build + test)
bun run lint && bun run format:check && bun run typecheck && bun run build && bun run test
```

### Git Hooks

Git hooks are managed by [lefthook](https://github.com/evilmartians/lefthook) and run automatically:

- **Pre-commit**: Lint and format staged files (via Biome)
- **Pre-push**: Type checking and build verification

Hooks are installed automatically when you run `bun install` (via the `prepare` script). To install manually:

```bash
bunx lefthook install
```

### Project Structure

```
conduit/
├── packages/
│   ├── client/      # Browser/Node.js client library
│   ├── server/      # WebRTC signaling server
│   ├── shared/      # Shared types and enums
│   ├── admin/       # Admin API and monitoring
│   ├── admin-ui/    # Vue 3/Nuxt 4 dashboard
│   └── go-client/   # Go client library
├── docker/          # Docker configurations
├── .github/         # CI/CD workflows
└── lefthook.yml     # Git hook configuration
```

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) before submitting a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
