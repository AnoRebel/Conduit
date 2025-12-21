# @conduit/admin

Admin API and monitoring tools for Conduit servers.

## Installation

```bash
npm install @conduit/admin
# or
bun add @conduit/admin
# or
yarn add @conduit/admin
```

## Features

- **Real-time Metrics** - Monitor connections, messages, throughput, and latency
- **Client Management** - View, disconnect, and manage connected clients
- **Ban System** - Ban clients by ID or IP address
- **Rate Limit Control** - Dynamically update rate limiting settings
- **Audit Logging** - Track all administrative actions
- **Multiple Auth Methods** - API Key, JWT, or Basic authentication
- **Framework Adapters** - Express, Fastify, Hono, or standalone Node.js HTTP
- **WebSocket Support** - Real-time updates via WebSocket subscriptions
- **Standalone Mode** - Connect to multiple remote servers from a single dashboard

## Quick Start

### Embedded with Express

```typescript
import express from 'express';
import { ExpressConduitServer } from '@conduit/server';
import { ExpressAdminServer } from '@conduit/admin/adapters/express';

const app = express();
const server = app.listen(9000);

// Create Conduit server
const conduit = ExpressConduitServer(server, {
  config: { path: '/conduit' },
});

// Create admin API
const admin = ExpressAdminServer({
  serverCore: conduit.core,
  auth: {
    type: 'apiKey',
    apiKey: process.env.ADMIN_API_KEY || 'secret-key',
  },
});

app.use('/admin/v1', admin);
```

### Embedded with Fastify

```typescript
import Fastify from 'fastify';
import { fastifyConduitPlugin } from '@conduit/server/adapters/fastify';
import { fastifyAdminPlugin } from '@conduit/admin/adapters/fastify';

const fastify = Fastify();

// Register Conduit
await fastify.register(fastifyConduitPlugin, {
  config: { path: '/' },
});

// Register Admin API
await fastify.register(fastifyAdminPlugin, {
  prefix: '/admin/v1',
  serverCore: fastify.conduit.core,
  auth: { type: 'apiKey', apiKey: 'secret-key' },
});

fastify.listen({ port: 9000 });
```

### Embedded with Hono

```typescript
import { Hono } from 'hono';
import { honoConduitAdapter } from '@conduit/server/adapters/hono';
import { honoAdminAdapter } from '@conduit/admin/adapters/hono';

const app = new Hono();

const conduit = honoConduitAdapter({ config: { path: '/' } });
const admin = honoAdminAdapter({
  serverCore: conduit.core,
  auth: { type: 'apiKey', apiKey: 'secret-key' },
});

app.route('/conduit', conduit.routes);
app.route('/admin/v1', admin);
```

### Standalone Node.js HTTP

```typescript
import http from 'http';
import { NodeAdminServer } from '@conduit/admin/adapters/node';
import { createConduitServer } from '@conduit/server';

const conduit = createConduitServer({ config: { port: 9000 } });

const adminHandler = NodeAdminServer({
  serverCore: conduit.core,
  auth: { type: 'apiKey', apiKey: 'secret-key' },
});

// Handle admin requests at /admin/v1/*
http.createServer((req, res) => {
  if (req.url?.startsWith('/admin/v1')) {
    adminHandler(req, res);
  } else {
    // Handle other requests
  }
}).listen(9000);
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
const ws = new WebSocket('ws://localhost:9000/admin/v1/ws');

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
      url: 'wss://server1.example.com/admin/v1/ws',
      adminKey: process.env.PROD1_ADMIN_KEY,
    },
    {
      id: 'prod-2',
      url: 'wss://server2.example.com/admin/v1/ws',
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
  http://localhost:9000/admin/v1/status
```

### JWT

JWT tokens with configurable expiration:

```typescript
import { createAdminCore } from '@conduit/admin';

const admin = createAdminCore({
  auth: {
    type: 'jwt',
    jwtSecret: process.env.JWT_SECRET,
  },
});

// Generate token
const token = admin.auth.generateToken({ userId: 'admin' });

// Use token
curl -H "Authorization: Bearer ${token}" \
  http://localhost:9000/admin/v1/status
```

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

## Security Considerations

- **Always use HTTPS/WSS in production**
- **Use strong, unique API keys** - Generate with `openssl rand -hex 32`
- **Restrict admin API access** - Use firewall rules or reverse proxy
- **Enable audit logging** - Track all administrative actions
- **Rate limit the admin API** - Prevent brute force attacks

## License

MIT
