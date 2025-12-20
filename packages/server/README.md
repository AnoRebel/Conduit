# @conduit/server

WebRTC signaling server for Conduit peer-to-peer connections.

## Installation

```bash
npm install @conduit/server
# or
bun add @conduit/server
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

Run directly with npx:

```bash
npx @conduit/server --port 9000 --allow-discovery
```

Or install globally:

```bash
npm install -g @conduit/server
conduit --port 9000
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

```dockerfile
FROM oven/bun:1

WORKDIR /app
COPY package.json .
RUN bun install

CMD ["bun", "run", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  conduit:
    build: .
    ports:
      - "9000:9000"
    environment:
      - CONDUIT_PORT=9000
      - CONDUIT_KEY=conduit
      - CONDUIT_ALLOW_DISCOVERY=false
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
- **Use a unique API key** for your deployment
- **Restrict WebSocket origins** with `allowedOrigins` for web apps

## License

MIT
