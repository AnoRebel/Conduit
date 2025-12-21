# Conduit

WebRTC peer-to-peer data, video, and audio connections made simple.

Conduit provides an easy-to-use API for creating peer-to-peer connections using WebRTC. It handles the complexity of WebRTC signaling and offers automatic fallback to WebSocket relay when direct connections aren't possible.

## Features

- **Simple API** - Connect to peers with just a few lines of code
- **Multiple Transports** - WebRTC DataChannels, WebSocket relay, or automatic fallback
- **Media Streaming** - Video and audio calls with MediaStream support
- **Multiple Serialization** - Binary, JSON, MessagePack, or raw data
- **Framework Adapters** - Works with Node.js, Express, Fastify, Hono, and Bun
- **TypeScript** - Full type definitions included
- **Cloud Server** - Free cloud server at `conduit.anorebel.net` or self-host
- **Security** - Rate limiting, input validation, HTTPS enforcement, origin validation

## Packages

| Package | Description |
|---------|-------------|
| [`conduit`](./packages/client) | Browser/Node.js client library |
| [`@conduit/server`](./packages/server) | Signaling server |
| [`@conduit/shared`](./packages/shared) | Shared types and enums |
| [`@conduit/admin`](./packages/admin) | Admin API and monitoring tools |
| [`@conduit/admin-ui`](./packages/admin-ui) | Vue 3/Nuxt 4 admin dashboard |

## Quick Start

### Client

```bash
npm install conduit
# or
bun add conduit
# or
yarn add conduit
```

```typescript
import { Conduit } from 'conduit';

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
npm install @conduit/server
# or
bun add @conduit/server
# or
yarn add @conduit/server
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
npx @conduit/server
# or
bunx @conduit/server
```

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
    key: 'conduit',
    allowDiscovery: false,
    requireSecure: true, // Enforce HTTPS/WSS
    allowedOrigins: ['https://your-app.com'],
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
import { honoConduitAdapter } from '@conduit/server/adapters/hono';

const app = new Hono();
const conduit = honoConduitAdapter({ config: { path: '/' } });

app.route('/', conduit.routes);
```

### Bun

```typescript
import { createConduitServer } from '@conduit/server/adapters/bun';

const server = createConduitServer({ config: { port: 9000 } });
server.serve();
```

## Admin API

The `@conduit/admin` package provides monitoring and administration capabilities for your Conduit servers.

### Embedded Mode

```typescript
import express from 'express';
import { ExpressConduitServer } from '@conduit/server';
import { ExpressAdminServer } from '@conduit/admin/adapters/express';

const app = express();
const server = app.listen(9000);

// Create Conduit server
const conduit = ExpressConduitServer(server, { config: { path: '/conduit' } });

// Attach admin API
const admin = ExpressAdminServer({
  serverCore: conduit.core,
  auth: { type: 'apiKey', apiKey: process.env.ADMIN_API_KEY },
});

app.use('/admin/v1', admin);
```

### Standalone Dashboard

Run the admin UI as a standalone Nuxt application:

```bash
cd packages/admin-ui
bun run dev
```

Configure the API endpoint via environment variables:

```bash
NUXT_PUBLIC_ADMIN_API_URL=http://localhost:9000/admin/v1
NUXT_PUBLIC_ADMIN_WS_URL=ws://localhost:9000/admin/v1/ws
```

### Admin Features

- **Real-time Monitoring** - Live metrics, throughput, latency
- **Client Management** - View, disconnect, and ban clients
- **IP Banning** - Block abusive IP addresses
- **Audit Logging** - Track all admin actions
- **Multiple Auth Methods** - API Key, JWT, or Basic authentication
- **Framework Adapters** - Express, Fastify, Hono, or Node.js HTTP

## Comparison with Alternatives

| Feature | Conduit | PeerJS | Socket.IO | ws | simple-peer |
|---------|---------|--------|-----------|-----|-------------|
| **Connection Type** | P2P + Relay | P2P only | Server relay | Server relay | P2P only |
| **WebRTC Data** | Yes | Yes | No | No | Yes |
| **WebRTC Media** | Yes | Yes | No | No | Yes |
| **WebSocket Fallback** | Yes | No | N/A | N/A | No |
| **Auto Fallback** | Yes | No | No | No | No |
| **Built-in Signaling** | Yes | Yes | N/A | No | No |
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
- Video/audio calls between browsers
- A complete solution with signaling server, client, and admin tools
- Framework flexibility (Express, Fastify, Hono, Bun)
- Production-ready security (rate limiting, origin validation, bans)

**Choose PeerJS when you need:**
- Simple P2P connections without fallback requirements
- Drop-in compatibility (Conduit offers a PeerJS compatibility layer)
- Minimal setup for prototypes

**Choose Socket.IO when you need:**
- Server-to-client broadcasting
- Room-based messaging
- Automatic reconnection with state sync
- You don't need P2P connections

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

## Migration from PeerJS

Conduit provides a compatibility layer for easy migration:

```typescript
// Before (PeerJS)
import { Peer } from 'peerjs';
const peer = new Peer('my-id');

// After (Conduit with compat layer)
import { Peer } from 'conduit/peerjs-compat';
const peer = new Peer('my-id');
```

## Development

This is a Bun monorepo. To get started:

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test

# Run linting
bun run lint
```

## License

MIT
