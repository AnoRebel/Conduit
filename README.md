# Conduit

[![CI](https://github.com/AnoRebel/conduit/actions/workflows/ci.yml/badge.svg)](https://github.com/AnoRebel/conduit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@conduit/server)](https://www.npmjs.com/package/@conduit/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-436-brightgreen)](https://github.com/AnoRebel/conduit/actions/workflows/ci.yml)

WebRTC peer-to-peer data, video, and audio connections made simple.

Conduit provides an easy-to-use API for creating peer-to-peer connections using WebRTC. It handles the complexity of WebRTC signaling and offers automatic fallback to WebSocket relay when direct connections aren't possible.

## Features

- **Simple API** - Connect to peers with just a few lines of code
- **Multiple Transports** - WebRTC DataChannels, WebSocket relay, or automatic fallback
- **Media Streaming** - Video and audio calls with MediaStream support
- **Multiple Serialization** - Binary, JSON, MessagePack, or raw data
- **Framework Adapters** - Works with Node.js, Express, Fastify, Hono, and Bun
- **TypeScript** - Full type definitions included
- **Cloud Server** - Free cloud server at [`conduit.anorebel.net`](https://conduit.anorebel.net) or self-host
- **Admin Dashboard** - Live monitoring UI at [`conduit-ui.anorebel.net`](https://conduit-ui.anorebel.net)
- **Security** - Timing-safe auth, rate limiting, body size limits, CSRF protection, input validation, HTTPS enforcement, origin validation

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
bun add @conduit/client
# or
npm install @conduit/client
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
bun add @conduit/server
# or
npm install @conduit/server
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
```

### Embedded Mode

For custom setups, you can embed the admin API in your own Express/Fastify/Hono app:

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

app.use('/admin', admin);
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

- **Real-time Monitoring** - Live metrics, throughput, latency
- **Client Management** - View, disconnect, and ban clients
- **IP Banning** - Block abusive IP addresses
- **Audit Logging** - Track all admin actions
- **Multiple Auth Methods** - API Key, JWT, or Basic authentication
- **Role-Based Access** - JWT viewers (read-only) vs admins (full access)
- **Framework Adapters** - Express, Fastify, Hono, or Node.js HTTP

## Security

Conduit includes comprehensive security features for production deployments:

- **Timing-Safe Key Comparison** - API key authentication uses constant-time comparison to prevent timing attacks
- **Body Size Limits** - Request bodies are capped at 1MB to prevent denial-of-service via large payloads
- **CSRF Protection** - Content-Type validation on mutating requests prevents cross-site request forgery
- **Rate Limiting** - Token bucket rate limiting is enforced on both the signaling server and the admin API
- **JWT Role Enforcement** - JWT tokens carry a `role` claim (`viewer` or `admin`); viewers can only read (`GET`), admins have full access
- **Input Validation** - Client IDs, tokens, and keys are validated against safe patterns; JSON parsing includes depth limits
- **HTTPS/WSS Enforcement** - Optional `requireSecure: true` rejects non-HTTPS/WSS connections in production
- **Origin Validation** - Restrict WebSocket connections to specific origins via `allowedOrigins`
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
import { Peer } from '@conduit/client/peerjs-compat';
const peer = new Peer('my-id');
```

## Installation

### From npm (recommended)

```bash
# Client
bun add @conduit/client
# or
npm install @conduit/client

# Server
bun add @conduit/server
# or
npm install @conduit/server
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

Docker images use [`imbios/bun-node`](https://hub.docker.com/r/imbios/bun-node) for both Bun and Node.js compatibility:

- **Builder stage**: `imbios/bun-node:1.3.10-24-debian`
- **Production stage**: `imbios/bun-node:1.3.10-24-slim`

| Image | Description | Port |
|-------|-------------|------|
| `server` | Signaling server only | 9000 |
| `server-admin` | Server with Admin API | 9000 |
| `admin-ui` | Admin Dashboard (Nuxt) | 3000 |

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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `9000` |
| `HOST` | Bind address | `0.0.0.0` |
| `CONDUIT_KEY` | API key for clients | `conduit` |
| `ALLOW_DISCOVERY` | Enable peer discovery endpoint | `false` |
| `ADMIN_ENABLED` | Enable admin API | `false` |
| `ADMIN_PATH` | Admin API path prefix | `/admin` |
| `ADMIN_AUTH_TYPE` | Authentication method (`apiKey`, `jwt`, `basic`) | `apiKey` |
| `ADMIN_API_KEY` | Admin API authentication key (use `openssl rand -base64 32`) | - |
| `ADMIN_JWT_SECRET` | Secret for JWT token signing/verification | - |
| `ADMIN_BASIC_USER` | Username for Basic authentication | - |
| `ADMIN_BASIC_PASS` | Password for Basic authentication | - |

## Development

This is a Bun monorepo with [lefthook](https://github.com/evilmartians/lefthook) git hooks for automated quality checks.

```bash
# Install dependencies (also installs git hooks via lefthook)
bun install

# Build all packages
bun run build

# Run tests (436 tests across all packages)
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
│   └── admin-ui/    # Vue 3/Nuxt 4 dashboard
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
