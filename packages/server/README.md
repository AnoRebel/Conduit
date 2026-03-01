# @conduit/server

WebRTC signaling server for Conduit peer-to-peer connections.

## Installation

```bash
bun add @conduit/server
# or
npm install @conduit/server
```

## Quick Start

### Standalone Server

```typescript
import { createConduitServer } from '@conduit/server';

const server = createConduitServer({
  config: {
    port: 9000,
    path: '/',
    key: 'conduit',
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
| `-k, --key <key>` | API key for clients | `conduit` |
| `--path <path>` | Path prefix | `/` |
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

#### Environment Variables

The CLI also reads these environment variables (env vars take precedence over CLI flags for admin settings):

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_ENABLED` | Enable admin API (`true` or `1`) | `false` |
| `ADMIN_PATH` | Admin API path prefix | `/admin` |
| `ADMIN_AUTH_TYPE` | Authentication method (`apiKey`, `jwt`, `basic`) | `apiKey` |
| `ADMIN_API_KEY` | Admin API authentication key | - |
| `ADMIN_JWT_SECRET` | Secret for JWT token signing/verification | - |
| `ADMIN_BASIC_USER` | Username for Basic authentication | - |
| `ADMIN_BASIC_PASS` | Password for Basic authentication | - |

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
    key: 'conduit',
  },
});

fastify.listen({ port: 9000 });
```

### Hono

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { honoConduitAdapter } from '@conduit/server/adapters/hono';

const app = new Hono();
const conduit = honoConduitAdapter({
  config: { path: '/' },
});

// Use the middleware
app.use('*', conduit.middleware);

// Or use the routes directly
const routes = conduit.getRoutes();
routes.forEach(({ path, method, handler }) => {
  app.on(method, path, handler);
});

serve({ fetch: app.fetch, port: 9000 });
```

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
```

## Configuration

```typescript
interface ServerConfig {
  port: number;           // Server port (default: 9000)
  host: string;           // Server host (default: '0.0.0.0')
  path: string;           // Base path (default: '/')
  key: string;            // API key (default: 'conduit')
  expireTimeout: number;  // Message expiry in ms (default: 5000)
  aliveTimeout: number;   // Connection timeout in ms (default: 60000)
  concurrentLimit: number; // Max concurrent connections (default: 5000)
  allowDiscovery: boolean; // Enable conduit discovery (default: false)
  cleanupOutMsgs: number; // Cleanup interval in ms (default: 1000)
  corsOrigin: string | string[] | boolean; // CORS origin (default: true)
  allowedOrigins?: string[]; // WebSocket origin whitelist (default: undefined = allow all)
  proxied: boolean | string; // Behind proxy (default: false)
  requireSecure: boolean; // Require HTTPS/WSS (default: false)
  relay: {
    enabled: boolean;     // Enable WebSocket relay (default: true)
    maxMessageSize: number; // Max message size in bytes (default: 65536)
  };
  rateLimit: {
    enabled: boolean;     // Enable rate limiting (default: true)
    maxTokens: number;    // Burst capacity (default: 100)
    refillRate: number;   // Messages per second (default: 50)
  };
  logging: {
    level: LogLevel;      // Log level (default: 'info')
    pretty: boolean;      // Pretty print logs (default: false)
  };
}
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check, returns server info |
| `GET /{key}/id` | Generate a new client ID |
| `GET /{key}/conduits` | List connected conduits (if discovery enabled) |
| `WS /{path}/conduit` | WebSocket connection for signaling |

## Events

The server core emits events for monitoring:

```typescript
const server = createConduitServer();

server.core.on('connection', (client) => {
  console.log('Client connected:', client.id);
});

server.core.on('disconnect', (client) => {
  console.log('Client disconnected:', client.id);
});

server.core.on('message', (client, message) => {
  console.log('Message from', client.id, message);
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

Docker images use [`imbios/bun-node`](https://hub.docker.com/r/imbios/bun-node) for both Bun and Node.js compatibility:

```dockerfile
# Builder stage
FROM imbios/bun-node:1.3.10-24-debian AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --ignore-scripts
COPY . .
RUN bun run build

# Production stage
FROM imbios/bun-node:1.3.10-24-slim AS production
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
      - CONDUIT_KEY=conduit
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
- **Use a unique API key** for your deployment - Generate with `openssl rand -base64 32`
- **Restrict WebSocket origins** with `allowedOrigins` for web apps

## License

MIT
