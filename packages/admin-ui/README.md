# @conduit/admin-ui

Vue 3/Nuxt 4 admin dashboard for monitoring and managing Conduit servers.

## Features

- **Real-time Dashboard** - Live metrics, charts, and status indicators
- **Client Management** - View, search, and disconnect clients
- **Ban Management** - Ban/unban clients and IP addresses
- **Metrics Visualization** - Interactive charts for throughput, latency, and connections
- **Audit Log** - View and filter administrative actions
- **Dark/Light Theme** - Automatic theme switching based on system preference
- **Responsive Design** - Works on desktop and mobile
- **Embeddable Components** - Use individual components in your own Vue app

## Quick Start

### Standalone Dashboard

```bash
cd packages/admin-ui

# Install dependencies
bun install

# Start development server
bun run dev
```

Open http://localhost:3000 in your browser.

### Configuration

Create a `.env` file or set environment variables:

```bash
# Admin API endpoint
NUXT_PUBLIC_ADMIN_API_URL=http://localhost:9000/admin/v1

# WebSocket endpoint for real-time updates
NUXT_PUBLIC_ADMIN_WS_URL=ws://localhost:9000/admin/v1/ws
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with overview metrics and quick actions |
| `/clients` | Client list with search and filtering |
| `/clients/:id` | Detailed view of a specific client |
| `/metrics` | Detailed metrics charts and historical data |
| `/audit` | Audit log with filtering by action type |
| `/settings` | Dashboard settings and preferences |

## Embedding Components

Use individual components in your own Vue 3 application:

### Installation

```bash
npm install @conduit/admin-ui
```

### Plugin Setup

```typescript
import { createApp } from 'vue';
import { createAdminPlugin } from '@conduit/admin-ui';

const app = createApp(App);

app.use(createAdminPlugin({
  apiUrl: 'http://localhost:9000/admin/v1',
  wsUrl: 'ws://localhost:9000/admin/v1/ws',
  apiKey: 'your-api-key',
}));
```

### Using Components

```vue
<template>
  <div>
    <!-- Full dashboard -->
    <AdminDashboard />

    <!-- Or individual components -->
    <ServerStatus />
    <ClientList />
    <MetricsChart metric="throughput" />
    <BanManager />
    <AuditLog :limit="50" />
  </div>
</template>

<script setup>
import {
  AdminDashboard,
  ServerStatus,
  ClientList,
  MetricsChart,
  BanManager,
  AuditLog,
} from '@conduit/admin-ui/components';
</script>
```

## Available Components

### AdminDashboard

Complete dashboard with all features.

```vue
<AdminDashboard />
```

### ServerStatus

Server status card with uptime, version, and health indicators.

```vue
<ServerStatus />
```

### ClientList

Paginated list of connected clients with search and actions.

```vue
<ClientList
  :page-size="20"
  :show-actions="true"
/>
```

### ClientDetails

Detailed view of a single client.

```vue
<ClientDetails :client-id="clientId" />
```

### MetricsChart

Interactive chart for a specific metric.

```vue
<MetricsChart
  metric="throughput"
  :duration="'1h'"
  :refresh-interval="5000"
/>
```

Available metrics: `throughput`, `latency`, `connections`, `messages`, `errors`

### BanManager

Interface for managing bans.

```vue
<BanManager />
```

### AuditLog

Paginated audit log with filtering.

```vue
<AuditLog
  :limit="50"
  :action-filter="'disconnect_client'"
/>
```

### QuickActions

Common admin actions in a compact format.

```vue
<QuickActions />
```

### SettingsPanel

User preferences and dashboard settings.

```vue
<SettingsPanel />
```

## Composables

Use the underlying composables directly for custom integrations:

### useAdminApi

```typescript
import { useAdminApi } from '@conduit/admin-ui';

const api = useAdminApi();

// Fetch data
const status = await api.getStatus();
const clients = await api.getClients();
const metrics = await api.getMetrics();

// Perform actions
await api.disconnectClient('client-id');
await api.banClient('client-id', 'Abuse');
await api.banIP('192.168.1.100', 'Spam');
```

### useAdminWebSocket

```typescript
import { useAdminWebSocket } from '@conduit/admin-ui';

const ws = useAdminWebSocket();

// Subscribe to events
ws.subscribe(['metrics', 'clients']);

// Listen for updates
ws.on('metrics', (data) => {
  console.log('New metrics:', data);
});

ws.on('clients', (data) => {
  console.log('Client event:', data);
});
```

### useMetrics

```typescript
import { useMetrics } from '@conduit/admin-ui';

const metrics = useMetrics();

// Access reactive metrics data
const throughput = computed(() => metrics.throughput.value);
const latency = computed(() => metrics.latency.value);
const connections = computed(() => metrics.connections.value);

// Refresh metrics
await metrics.refresh();
```

### useColorMode

```typescript
import { useColorMode } from '@conduit/admin-ui';

const { colorMode, setColorMode, toggleColorMode } = useColorMode();

// Get current mode
console.log(colorMode.value); // 'light' | 'dark' | 'system'

// Set mode
setColorMode('dark');

// Toggle between light and dark
toggleColorMode();
```

## Pinia Store

Access the admin store directly:

```typescript
import { useAdminStore } from '@conduit/admin-ui';

const store = useAdminStore();

// State
console.log(store.status);
console.log(store.clients);
console.log(store.metrics);

// Actions
await store.fetchStatus();
await store.fetchClients();
await store.disconnectClient('id');
```

## Theming

The dashboard uses Tailwind CSS with shadcn-vue components. Customize the theme by modifying:

- `app/assets/css/main.css` - Tailwind configuration and CSS variables
- Theme colors follow the shadcn-vue theming system

### CSS Variables

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --secondary: 210 40% 96.1%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... */
}
```

## Development

```bash
# Install dependencies
bun install

# Start dev server with hot reload
bun run dev

# Type check
bun run typecheck

# Build for production
bun run build

# Preview production build
bun run preview

# Build as library for embedding
bun run build:lib
```

## Building for Production

### As Standalone App

```bash
bun run build
```

The output will be in `.output/` directory. Deploy to any Node.js host or static hosting with SSR support.

### As Embeddable Library

```bash
bun run build:lib
```

The output will be in `dist/` directory, ready for npm publishing.

## Docker

```dockerfile
FROM oven/bun:1.3 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:1.3-alpine
WORKDIR /app
COPY --from=builder /app/.output .output
ENV NUXT_PUBLIC_ADMIN_API_URL=/admin/v1
EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
```

## Requirements

- Node.js 22+ or Bun 1.0+
- Vue 3.5+
- Modern browser with ES2022 support

## License

MIT
