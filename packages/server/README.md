# @conduit/server

[![JSR @conduit/server](https://jsr.io/badges/@conduit/server)](https://jsr.io/@conduit/server)

WebRTC signaling server for Conduit peer-to-peer connections.

## Installation

```bash
# JSR (recommended)
bunx jsr add @conduit/server
# or
npx jsr add @conduit/server
```

## Quick Start

### Standalone Server

```typescript
import { createConduitServer } from '@conduit/server';

const server = createConduitServer({
  config: {
    port: 9000,
    path: '/',
    // Set a real key. The server refuses to start with no key or with the
    // well-known default 'conduit'; when embedding the server, supply your own.
    key: process.env.CONDUIT_KEY,
    allowDiscovery: false,
  },
});

server.listen(9000, '0.0.0.0', () => {
  console.log('Conduit server running on port 9000');
});
```

### CLI

Run directly with bunx/npx:

```bash
bunx @conduit/server start --port 9000 --allow-discovery
# or
npx @conduit/server start --port 9000 --allow-discovery
```

Or install globally:

```bash
bun add -g @conduit/server
# or
npm install -g @conduit/server

conduit start --port 9000
```

#### CLI Commands

**`conduit start`** — Start the server with optional admin API:

```bash
# Basic server
conduit start --port 9000

# Server with admin API
conduit start --admin --admin-api-key "$(openssl rand -base64 32)"

# All admin options
conduit start \
  --admin \
  --admin-path /admin \
  --admin-auth-type apiKey \
  --admin-api-key "your-secret-key"
```

**`conduit init`** — Interactive configuration wizard.

#### CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --port <port>` | Port to listen on | `9000` |
| `-H, --host <host>` | Host to bind to | `0.0.0.0` |
| `-k, --key <key>` | API key for clients (or set `CONDUIT_KEY`) | - (required) |
| `--path <path>` | Path prefix | `/` |
| `--allow-insecure-key` | Start anyway with a missing or default key (local development only) | `false` |
| `--allow-discovery` | Allow peer discovery API | `false` |
| `--concurrent-limit <n>` | Max concurrent connections | `5000` |
| `--alive-timeout <ms>` | Connection alive timeout | `60000` |
| `--expire-timeout <ms>` | Message expire timeout | `5000` |
| `--cors <origin>` | CORS origin (`*` for all) | `*` |
| `--no-relay` | Disable WebSocket relay transport | - |
| `--admin` | Enable admin API | `false` |
| `--admin-path <path>` | Admin API path prefix | `/admin` |
| `--admin-auth-type <type>` | Auth type (`apiKey`, `jwt`, `basic`) | `apiKey` |
| `--admin-api-key <key>` | Admin API key | - |
| `--auth <mode>` | Auth mode for signaling (`key` or `none`) | `key` |
| `--db <path>` | SQLite database path for admin persistence | - |
| `--admin-ui <dir>` | Serve admin UI static files from directory | - |
| `--admin-ui-path <path>` | URL path for admin UI | `/ui` |

#### Environment Variables

The CLI also reads these environment variables (env vars take precedence over CLI flags for admin settings):

| Variable | Description | Default |
|----------|-------------|---------|
| `CONDUIT_KEY` | Signaling API key (takes precedence over `--key`) | - (required) |
| `ADMIN_ENABLED` | Enable admin API (`true` or `1`) | `false` |
| `ADMIN_PATH` | Admin API path prefix | `/admin` |
| `ADMIN_AUTH_TYPE` | Authentication method (`apiKey`, `jwt`, `basic`) | `apiKey` |
| `ADMIN_API_KEY` | Admin API authentication key | - |
| `ADMIN_JWT_SECRET` | Secret for JWT token signing/verification | - |
| `ADMIN_BASIC_USER` | Username for Basic authentication | - |
| `ADMIN_BASIC_PASS` | Password for Basic authentication | - |
| `ADMIN_CORS_ORIGINS` | Allowed CORS origins for admin API | `*` |
| `AUTH_MODE` | Signaling auth mode (`key` or `none`) | `key` |
| `ADMIN_DB_PATH` | SQLite database file path for persistence | - |
| `ADMIN_UI_DIR` | Directory with admin UI static files | - |
| `ADMIN_UI_PATH` | URL path to serve admin UI at | `/ui` |

Example with environment variables:

```bash
ADMIN_ENABLED=true \
ADMIN_API_KEY="$(openssl rand -base64 32)" \
conduit start --port 9000
```

### Admin Integration

The CLI is the primary way to run the server with admin API. When `--admin` is passed (or `ADMIN_ENABLED=true`), the CLI:

1. Dynamically imports `@conduit/admin`
2. Creates an admin core attached to the signaling server
3. Mounts admin HTTP routes under `--admin-path` (default `/admin`)
4. Sets up admin WebSocket at `{admin-path}/ws`
5. Handles graceful shutdown of admin resources

This means you get a complete server + admin API from a single command with no custom code needed:

```bash
# Start everything in one command
conduit start --admin --admin-api-key "your-key"

# Admin REST API available at http://localhost:9000/admin/*
# Admin WebSocket at ws://localhost:9000/admin/ws
```

### Embedded Admin UI

Serve the admin dashboard directly from the Conduit server process:

```bash
# Build the admin UI as a static SPA
cd packages/admin-ui
bun run generate

# Start the server with embedded UI
conduit start \
  --admin \
  --admin-api-key "your-key" \
  --admin-ui ./packages/admin-ui/.output/public \
  --admin-ui-path /ui

# Dashboard at http://localhost:9000/ui
# Admin API at http://localhost:9000/admin/v1
```

The embedded UI serves static files with SPA fallback, cache headers, MIME detection, and directory traversal prevention.

### Optional Authentication

The signaling server can run with or without key authentication:

```bash
# Default: key authentication required
conduit start --auth key --key "your-secret-key"

# No authentication: open access (useful for development)
conduit start --auth none
```

### SQLite Persistence

Enable optional SQLite persistence for bans, audit logs, and metrics history:

```bash
conduit start --admin --admin-api-key "your-key" --db ./conduit.db
```

When `--db` is specified, the admin API uses `bun:sqlite` to persist bans, audit logs, and metrics history across server restarts. Without `--db`, all data is stored in-memory.

## Framework Adapters

### Express

```typescript
import express from 'express';
import { ExpressConduitServer } from '@conduit/server';

const app = express();
const server = app.listen(9000);

const conduit = ExpressConduitServer(server, {
  config: {
    path: '/conduit',
    allowDiscovery: true,
  },
});

app.use('/conduit', conduit);
```

### Fastify

```typescript
import Fastify from 'fastify';
import { fastifyConduitPlugin } from '@conduit/server/adapters/fastify';

const fastify = Fastify();

fastify.register(fastifyConduitPlugin, {
  config: {
    path: '/',
    // Set a real key. The server refuses to start with no key or with the
    // well-known default 'conduit'; when embedding the server, supply your own.
    key: process.env.CONDUIT_KEY,
  },
});

fastify.listen({ port: 9000 });
```

### Hono

```typescript
import { Hono } from 'hono';
import { serve, upgradeWebSocket } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { createConduitMiddleware } from '@conduit/server/adapters/hono';

const app = new Hono();
const conduit = createConduitMiddleware({
  config: { path: '/' },
});

// Use the middleware
app.use('*', conduit.middleware);

// Or use the routes directly
const routes = conduit.getRoutes();
routes.forEach(({ path, method, handler }) => {
  app.on(method, path, handler);
});

// WebSocket signaling
app.get('/conduit', upgradeWebSocket(conduit.createWebSocketHandler));

serve({ fetch: app.fetch, port: 9000, websocket: { server: new WebSocketServer({ noServer: true }) } });

// Graceful shutdown — sends GOAWAY to connected clients
conduit.destroy();
```

`upgradeWebSocket` is runtime-specific. Import it from `@hono/node-server` on
Node, or from `hono/bun`, `hono/deno`, or `hono/cloudflare-workers` on those
runtimes — `@conduit/server` supplies the handlers, not the upgrade helper.

Connection parameters are read from the query string (`key`, `id`, `token`),
and `allowedOrigins` is enforced before the socket is admitted, matching the
other adapters.

### Bun

```typescript
import { createConduitServer } from '@conduit/server/adapters/bun';

const server = createConduitServer({
  config: {
    port: 9000,
    host: '0.0.0.0',
  },
});

server.serve();

// Graceful shutdown — sends GOAWAY to connected clients
server.close();
```

## Configuration

```typescript
interface ServerConfig {
  port: number;           // Server port (default: 9000)
  host: string;           // Server host (default: '0.0.0.0')
  path: string;           // Base path (default: '/')
  key: string;            // API key (library default: 'conduit'). Set via the
                          // CONDUIT_KEY env var or --key. The server refuses to
                          // start when it is unset, empty, or the well-known
                          // default 'conduit'; --allow-insecure-key overrides
                          // this for local development only.
  expireTimeout: number;  // Message expiry in ms (default: 5000)
  aliveTimeout: number;   // Connection timeout in ms (default: 60000)
  concurrentLimit: number; // Max concurrent connections (default: 5000)
  allowDiscovery: boolean; // Enable conduit discovery (default: false)
  cleanupOutMsgs: number; // Cleanup interval in ms (default: 1000)
  corsOrigin: string | string[] | boolean; // CORS origin (default: true)
  allowedOrigins?: string[]; // WebSocket origin whitelist (default: undefined = allow all)
  auth?: {
    mode: 'key' | 'none';  // Auth mode (default: 'key')
  };
  proxied: boolean | string; // Trust forwarded headers — only enable behind a
                          // reverse proxy. Gates whether X-Forwarded-For is
                          // trusted for the client address; a string names the
                          // header to read (e.g. 'CF-Connecting-IP').
                          // (default: false)
  requireSecure: boolean; // Require HTTPS/WSS (default: false)
  relay: {
    enabled: boolean;     // Enable WebSocket relay (default: true)
    maxMessageSize: number; // Max message size in bytes (default: 65536)
  };
  rooms: {
    enabled: boolean;     // Enable rooms and presence (default: true)
    maxRoomsPerPeer: number;    // Rooms one peer may occupy (default: 32)
    maxMembersPerRoom: number;  // Members in one room (default: 256)
    maxRooms: number;           // Rooms in existence (default: 10000)
  };
  topics: {
    enabled: boolean;     // Enable topics and room broadcast (default: FALSE).
                          // Off by default because multicast turns one inbound
                          // message into N outbound ones.
    maxSubscriptionsPerPeer: number; // (default: 64)
    maxSubscribersPerTopic: number;  // (default: 1024)
    maxTopics: number;               // (default: 10000)
    maxRecipientsPerMessage: number; // Hard per-message ceiling (default: 256)
    maxMulticastMessageSize: number; // Bytes per multicast payload (default: 16384)
  };
  cluster: {
    backend: 'memory' | 'redis'; // (default: 'memory' — single process)
    nodeId?: string;      // This node's identifier (generated when omitted)
    peerTtlSeconds: number;   // Peer registration lifetime (default: 90)
    forwardTimeoutMs: number; // Inter-node forward timeout (default: 2000)
    redis: {
      url: string;        // (default: 'redis://127.0.0.1:6379')
      password?: string;  // REQUIRED when backend is 'redis'
      keyPrefix: string;  // (default: 'conduit')
    };
  };
  rateLimit: {
    enabled: boolean;     // Enable rate limiting (default: true)
    maxTokens: number;    // Burst capacity (default: 100). Charged per
                          // *delivery*, so a fan-out to N recipients costs N.
    refillRate: number;   // Deliveries per second (default: 50)
  };
  logging: {
    level: LogLevel;      // Log level (default: 'info')
    pretty: boolean;      // Pretty print logs (default: false)
  };
}
```

## Room and Topic Authorization

By default any authenticated peer may join any room and use any topic, matching
the trust model where the signaling key is the only gate. A room name is an
opaque string, so an unguessable one already acts as a capability.

Deployments needing real tenancy supply a decision function, shaped exactly like
the existing ban predicate — absent by default, consulted after authentication,
and synchronous so it never puts an await in the message path:

```typescript
const server = createConduitServer({
  config: { key: process.env.CONDUIT_KEY },

  authorizeRoom: (peerId, room) => {
    // e.g. only members of the owning tenant may join
    return room.startsWith(`${tenantOf(peerId)}:`);
  },

  authorizeTopic: (peerId, topic, action) => {
    // `action` is "subscribe" or "publish", so reads and writes can differ
    return action === "subscribe" || canPublish(peerId, topic);
  },
});
```

A refused join returns the same error whether the room is full, private, or
absent. That is deliberate: distinguishing them would turn the error into an
oracle for whether a room exists.

## Horizontal Scaling

By default the server is single-process: peers, rooms, and subscriptions live in
memory, and nothing is shared.

> **Multi-instance deployments need a cluster backend.** Without one, two peers
> connected to *different* instances cannot signal to each other at all — an
> offer for a peer on another instance is queued for someone who will never read
> it, then expires. There is no error; the connection simply never establishes.
> This affects every multi-instance deployment prior to this feature.

Configure Redis to share state across instances:

```typescript
import { createClusterBackend } from '@conduit/server';
import { createConduitServer } from '@conduit/server/adapters/node';

const config = {
  key: process.env.CONDUIT_KEY,
  cluster: {
    backend: 'redis' as const,
    redis: {
      url: process.env.REDIS_URL,
      // Required: inter-node messages assert which peer they come from, so an
      // unauthenticated backend would let anyone able to publish impersonate
      // any peer. The server refuses to start without it.
      password: process.env.REDIS_PASSWORD,
    },
  },
};

const cluster = await createClusterBackend(config);
const server = createConduitServer({ config, cluster });
server.listen();
```

Start Redis for local development:

```bash
docker compose -f docker/docker-compose.yml --profile cluster up -d redis
```

### What distribution changes

- **Cross-instance signaling works.** Offers, answers, candidates, and relay
  messages reach a peer on any instance.
- **Rooms and topics span instances.** Membership, presence, and multicast are
  shared, and limits are enforced cluster-wide via an atomic check-and-insert
  rather than a read-then-write that could race.
- **Bans and queue ownership hold cluster-wide.** A banned peer is refused on
  every instance; queued messages are not collectable by a different token on a
  different node.

### Known limits

- **Rooms are ephemeral.** They do not survive a full-cluster restart; clients
  must be prepared to rejoin.
- **Rate limiting is per node.** Each instance keeps its own token bucket, so a
  peer spreading traffic across N instances gets at most N budgets. Fan-out
  amplification stays exactly bounded per node, which is the property that
  matters; exploiting the margin requires holding N connections, which the
  concurrent-connection limit constrains.
- **Membership is eventually consistent.** Capacity-limited joins are atomic, so
  caps cannot be raced past, but a departing node's peers remain registered
  until their TTL lapses.

### When the backend is unreachable

- **At startup:** the server refuses to start, naming the backend. A server that
  looks healthy while unable to route is worse than one that will not start.
- **While running:** peers on the same instance keep working; operations needing
  cluster state return an error rather than reporting a success that did not
  happen. The connection is retried, and this node re-registers what it owns.

See [`examples/cluster.ts`](../../examples/cluster.ts) for a runnable two-instance
program; it skips cleanly when Redis is not running.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check, returns server info |
| `GET /{key}/id` | Generate a new client ID |
| `GET /{key}/conduits` | List connected conduits (if discovery enabled) |
| `WS /{path}/conduit` | WebSocket connection for signaling |

## Lifecycle Callbacks

The server core supports callbacks for monitoring client connections:

```typescript
const server = createConduitServer({
  onClientConnect: (client) => {
    console.log('Client connected:', client.id);
  },
  onClientDisconnect: (clientId) => {
    console.log('Client disconnected:', clientId);
  },
});
```

## WebSocket Relay

When WebRTC connections fail (firewalls, NAT issues), Conduit can relay data through WebSocket connections. This is enabled by default.

```typescript
const server = createConduitServer({
  config: {
    relay: {
      enabled: true,
      maxMessageSize: 65536, // 64KB max per message
    },
  },
});
```

## Docker

Docker images use [`oven/bun`](https://hub.docker.com/r/oven/bun) for both the builder and production stages:

```dockerfile
# Builder stage
FROM oven/bun:1.4.1-slim AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --ignore-scripts
COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1.4.1-slim AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/package.json ./

ENV PORT=9000
ENV HOST=0.0.0.0
EXPOSE 9000

CMD ["/bin/sh", "-c", "exec bun run bin/conduit.js start --port \"${PORT}\" --host \"${HOST}\""]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  conduit:
    build:
      context: ..
      dockerfile: docker/Dockerfile.server
    ports:
      - "9000:9000"
    environment:
      - PORT=9000
      - CONDUIT_KEY=${CONDUIT_KEY:?set CONDUIT_KEY to a generated secret}
      - ADMIN_ENABLED=true
      - ADMIN_API_KEY=your-secure-key
```

## Security Features

Conduit server includes several built-in security features:

### Rate Limiting

Per-client rate limiting using a token bucket algorithm prevents abuse:

```typescript
const server = createConduitServer({
  config: {
    rateLimit: {
      enabled: true,
      maxTokens: 100,   // Burst capacity
      refillRate: 50,   // Messages per second sustained
    },
  },
});
```

### Timing-Safe Authentication

API key comparisons use constant-time algorithms to prevent timing attacks. Always generate strong keys:

```bash
openssl rand -base64 32
```

The server refuses to start when the signaling key is unset, empty, or the well-known default `conduit` — enforced by the library itself, so embedding it directly is not a way around the check. Pass `--allow-insecure-key` (CLI) or `allowInsecureKey: true` (library) to override for local development only.

### Ban Enforcement

Bans are enforced at connection time: banned peer IDs and source addresses are rejected before the connection is established. This requires the admin API (`--admin`), which is where bans are recorded. Address bans behind a reverse proxy depend on `proxied` being set so the forwarded client address is trusted.

### HTTPS/WSS Enforcement

Optionally require secure connections in production:

```typescript
const server = createConduitServer({
  config: {
    requireSecure: true, // Reject non-HTTPS/WSS connections
  },
});
```

### Origin Validation

Restrict WebSocket connections to specific origins:

```typescript
const server = createConduitServer({
  config: {
    allowedOrigins: ['https://your-app.com', 'https://staging.your-app.com'],
  },
});
```

### Input Validation

All inputs are validated:
- Client IDs, tokens, and keys are validated against safe patterns
- Message sizes are limited (default 64KB)
- JSON parsing includes depth limits to prevent JSON bomb attacks

### Graceful Shutdown

The server sends `GOAWAY` messages to connected clients before shutting down:

```typescript
server.close(() => {
  console.log('Server closed gracefully');
});
```

## Structured Logging

Conduit uses [Pino](https://getpino.io/) for high-performance structured logging:

```typescript
const server = createConduitServer({
  config: {
    logging: {
      level: 'info',  // 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
      pretty: true,   // Enable pretty printing for development
    },
  },
});

// Access the logger
server.logger.info('Custom log message');
server.logger.child({ requestId: '123' }).debug('Scoped log');
```

## Security Considerations

- **Always use HTTPS/WSS in production** - Set `requireSecure: true`
- **Set appropriate CORS origins** - Don't use `corsOrigin: true` in production
- **Disable discovery in production** unless you need peer listing
- **Rate limiting is enabled by default** - Tune limits for your use case
- **Use a unique API key** for your deployment - Required; the server refuses to start without one. Generate with `openssl rand -base64 32`
- **Restrict WebSocket origins** with `allowedOrigins` for web apps

## License

MIT
