# @conduit/admin

Admin API and monitoring tools for Conduit servers.

## Installation

```bash
bun add @conduit/admin
# or
npm install @conduit/admin
```

## Features

- **Real-time Metrics** - Monitor connections, messages, throughput, and latency
- **Client Management** - View, disconnect, and manage connected clients
- **Ban System** - Ban clients by ID or IP address
- **Rate Limit Control** - Dynamically update rate limiting settings
- **Audit Logging** - Track all administrative actions
- **Multiple Auth Methods** - API Key, JWT, or Basic authentication
- **Role-Based Access** - JWT viewers (read-only) vs admins (full access)
- **Framework Adapters** - Express, Fastify, Hono, or standalone Node.js HTTP
- **WebSocket Support** - Real-time updates via WebSocket subscriptions
- **Standalone Mode** - Connect to multiple remote servers from a single dashboard
- **SQLite Persistence** - Optional embedded database for bans, audit logs, and metrics (using `bun:sqlite`)

## Quick Start

### CLI Integration (Recommended)

The simplest way to run the admin API is via the Conduit CLI — no custom code needed:

```bash
# Start server with admin API in one command
conduit start --admin --admin-api-key "$(openssl rand -base64 32)"

# Or use environment variables
ADMIN_ENABLED=true \
ADMIN_API_KEY="your-secret-key" \
ADMIN_AUTH_TYPE=apiKey \
conduit start
```

The CLI handles all wiring: creates the admin core, mounts HTTP routes, sets up WebSocket, and manages graceful shutdown.

### Embedded with Express

```typescript
import express from 'express';
import { ExpressConduitServer } from '@conduit/server';
import { createAdminCore } from '@conduit/admin';
import { createExpressAdminMiddleware } from '@conduit/admin/adapters/express';

const app = express();
const server = app.listen(9000);

// Create Conduit server
const conduit = ExpressConduitServer(server, {
  config: { path: '/conduit' },
});

// Create admin core and attach to signaling server
const adminCore = createAdminCore({
  auth: {
    type: 'apiKey',
    apiKey: process.env.ADMIN_API_KEY || 'secret-key',
  },
});
adminCore.attachToServer(conduit.core);

// Mount admin middleware
app.use('/admin', createExpressAdminMiddleware({ admin: adminCore }));
```

### Embedded with Fastify

```typescript
import Fastify from 'fastify';
import { fastifyConduitPlugin } from '@conduit/server/adapters/fastify';
import { createAdminCore } from '@conduit/admin';
import { createFastifyAdminPlugin } from '@conduit/admin/adapters/fastify';

const fastify = Fastify();

// Register Conduit
await fastify.register(fastifyConduitPlugin, {
  config: { path: '/' },
});

// Create admin core
const adminCore = createAdminCore({
  auth: { type: 'apiKey', apiKey: 'secret-key' },
});

// Register Admin plugin
await fastify.register(createFastifyAdminPlugin({ admin: adminCore }), {
  prefix: '/admin',
});

fastify.listen({ port: 9000 });
```

### Embedded with Hono

```typescript
import { Hono } from 'hono';
import { createConduitMiddleware } from '@conduit/server/adapters/hono';
import { createAdminCore } from '@conduit/admin';
import { createHonoAdminMiddleware } from '@conduit/admin/adapters/hono';

const app = new Hono();

const conduit = createConduitMiddleware({ config: { path: '/' } });
const adminCore = createAdminCore({
  auth: { type: 'apiKey', apiKey: 'secret-key' },
});
adminCore.attachToServer(conduit.core);

app.use('/conduit/*', conduit.middleware);
app.use('/admin/*', createHonoAdminMiddleware({ admin: adminCore }));
```

### Standalone Node.js HTTP

```typescript
import { createConduitServer } from '@conduit/server';
import { createAdminCore } from '@conduit/admin';
import { createNodeAdminServer } from '@conduit/admin/adapters/node';

const conduit = createConduitServer({ config: { port: 9000 } });

// Create admin core and attach to signaling server
const adminCore = createAdminCore({
  auth: { type: 'apiKey', apiKey: 'secret-key' },
});
adminCore.attachToServer(conduit.core);

// Create standalone admin HTTP server
const adminServer = createNodeAdminServer({ admin: adminCore });
adminServer.listen(9001, () => {
  console.log('Admin API running on port 9001');
});
```

## Configuration

```typescript
interface AdminConfig {
  // Authentication
  auth: {
    type: 'apiKey' | 'jwt' | 'basic';
    apiKey?: string;           // For API Key auth
    jwtSecret?: string;        // For JWT auth
    basicUsers?: Map<string, string>; // For Basic auth
  };

  // Rate limiting for admin API
  rateLimit?: {
    enabled: boolean;
    maxRequests: number;       // Default: 100
    windowMs: number;          // Default: 60000 (1 minute)
  };

  // Metrics collection
  metrics?: {
    retentionMs: number;       // Default: 3600000 (1 hour)
    snapshotIntervalMs: number; // Default: 1000
  };

  // Audit logging
  audit?: {
    enabled: boolean;          // Default: true
    maxEntries: number;        // Default: 1000
  };

  // WebSocket real-time updates
  websocket?: {
    enabled: boolean;          // Default: true
    path: string;              // Default: '/ws'
  };
}
```

## Persistence

By default, the admin API stores all data in-memory. For production deployments, enable SQLite persistence to survive server restarts.

### Setup

```typescript
import { createPersistenceStore } from '@conduit/admin/persistence';
import { createAdminCore } from '@conduit/admin';

// Create SQLite persistence store
const store = createPersistenceStore({
  type: 'sqlite',
  dbPath: './conduit.db',
});

const admin = createAdminCore({
  auth: { type: 'apiKey', apiKey: 'secret-key' },
  persistence: store,
});
```

### CLI Usage

The simplest way to enable persistence is via the CLI:

```bash
conduit start --admin --admin-api-key "your-key" --db ./conduit.db

# Or with environment variable
ADMIN_DB_PATH=./conduit.db conduit start --admin
```

### What Gets Persisted

| Data | Without `--db` | With `--db` |
|------|---------------|-------------|
| Bans (client ID & IP) | In-memory, lost on restart | SQLite, persistent |
| Audit logs | In-memory, capped at `maxEntries` | SQLite, permanent |
| Metrics history | In-memory, limited retention | SQLite, queryable |

### Store Interface

Implement custom persistence by conforming to the `PersistenceStore` interface:

```typescript
interface PersistenceStore {
  // Bans
  getBans(): Promise<Ban[]>;
  addBan(ban: Ban): Promise<void>;
  removeBan(type: string, value: string): Promise<void>;
  clearBans(): Promise<void>;

  // Audit
  getAuditLogs(options?: { limit?: number; offset?: number; action?: string }): Promise<AuditEntry[]>;
  addAuditLog(entry: AuditEntry): Promise<void>;
  clearAuditLogs(): Promise<void>;

  // Lifecycle
  close(): Promise<void>;
}
```

The SQLite store uses WAL mode for concurrent read/write performance, indexed queries, and Bun's built-in `bun:sqlite` driver (no native dependencies needed).

## REST API Endpoints

### Status & Info

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/status` | Server status and basic metrics |
| `GET` | `/config` | Current server configuration |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/metrics` | Current metrics snapshot |
| `GET` | `/metrics/history` | Historical metrics (query: `start`, `end`, or `duration`) |
| `GET` | `/metrics/throughput` | Throughput time series |
| `GET` | `/metrics/latency` | Latency time series |
| `GET` | `/metrics/errors` | Error counts by type |
| `POST` | `/metrics/reset` | Reset all metrics |

### Clients

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/clients` | List all connected clients |
| `GET` | `/clients/:id` | Get client details |
| `DELETE` | `/clients/:id` | Disconnect a client |
| `DELETE` | `/clients` | Disconnect all clients |
| `DELETE` | `/clients/:id/queue` | Clear client message queue |

### Bans

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/bans` | List all bans |
| `GET` | `/bans/clients` | List client ID bans |
| `GET` | `/bans/ips` | List IP bans |
| `POST` | `/bans/client/:id` | Ban a client ID |
| `DELETE` | `/bans/client/:id` | Unban a client ID |
| `POST` | `/bans/ip/:ip` | Ban an IP address |
| `DELETE` | `/bans/ip/:ip` | Unban an IP address |
| `DELETE` | `/bans` | Clear all bans |

### Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/audit` | Get audit log (query: `limit`, `offset`, `action`) |
| `DELETE` | `/audit` | Clear audit log |

### Actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/broadcast` | Broadcast message to all clients |
| `PATCH` | `/config/rate-limit` | Update rate limit settings |
| `PATCH` | `/config/features` | Toggle server features |

## WebSocket Events

Connect to the WebSocket endpoint for real-time updates:

```typescript
const ws = new WebSocket('ws://localhost:9000/admin/ws');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  apiKey: 'your-api-key',
}));

// Subscribe to events
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['metrics', 'clients', 'errors'],
}));

// Receive updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data.payload);
};
```

### Available Events

- `metrics` - Periodic metrics snapshots
- `clients` - Client connect/disconnect events
- `errors` - Error occurrences
- `audit` - Audit log entries

## Standalone Mode

Connect to multiple remote Conduit servers:

```typescript
import { createStandaloneAdmin } from '@conduit/admin/standalone';

const admin = createStandaloneAdmin({
  servers: [
    {
      id: 'prod-1',
      url: 'wss://server1.example.com/admin/ws',
      adminKey: process.env.PROD1_ADMIN_KEY,
    },
    {
      id: 'prod-2',
      url: 'wss://server2.example.com/admin/ws',
      adminKey: process.env.PROD2_ADMIN_KEY,
    },
  ],
});

// Get aggregated metrics from all servers
const metrics = admin.getAggregatedMetrics();

// Execute action on specific server
await admin.executeAction('prod-1', 'disconnectClient', { clientId: 'abc123' });
```

## Authentication

### API Key

Simple API key authentication via header:

```bash
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:9000/admin/status
```

### JWT

JWT tokens with configurable expiration and **role-based access control**:

```typescript
import { createAdminCore } from '@conduit/admin';

const admin = createAdminCore({
  auth: {
    type: 'jwt',
    jwtSecret: process.env.JWT_SECRET,
  },
});

// Generate token with role
const token = admin.auth.generateToken({ userId: 'admin', role: 'admin' });

// Use token
curl -H "Authorization: Bearer ${token}" \
  http://localhost:9000/admin/status
```

#### Role-Based Access

JWT tokens carry a `role` claim that controls access:

| Role | Permissions |
|------|-------------|
| `viewer` | Read-only access — `GET` requests only |
| `admin` | Full access — `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |

Viewers can monitor metrics, list clients, and view audit logs but cannot disconnect clients, manage bans, or modify configuration.

### Basic Auth

HTTP Basic authentication:

```typescript
const admin = createAdminCore({
  auth: {
    type: 'basic',
    basicUsers: new Map([
      ['admin', 'password123'],
    ]),
  },
});
```

## Security

The admin API includes multiple layers of security:

- **Timing-Safe Key Comparison** — API key authentication uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks
- **Rate Limiting** — The admin API enforces its own rate limits (default: 100 requests per minute) to prevent brute force attacks
- **CSRF Protection** — Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid `Content-Type` header, preventing simple cross-site request forgery
- **Body Size Limits** — Request bodies are capped at 1MB to prevent denial-of-service via large payloads
- **JWT Role Enforcement** — JWT tokens include a `role` claim; `viewer` tokens can only make `GET` requests, `admin` tokens have full access
- **Audit Logging** — All administrative actions are logged with timestamps, actor, and details

### Security Best Practices

- **Always use HTTPS/WSS in production**
- **Use strong, unique API keys** — Generate with `openssl rand -base64 32`
- **Restrict admin API access** — Use firewall rules or reverse proxy
- **Enable audit logging** — Track all administrative actions
- **Use viewer tokens for monitoring** — Give `viewer` role to read-only integrations

## Metrics Collected

### Counters
- Total messages relayed
- Connections opened/closed
- Rate limit hits and rejections
- Errors by type

### Gauges
- Active connections
- Queued messages
- Memory usage

### Time Series
- Messages per second (throughput)
- Message latency
- Connection duration

## License

MIT
