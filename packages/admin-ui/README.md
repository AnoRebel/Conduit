# @conduit/admin-ui

Vue 3/Nuxt 4 admin dashboard for monitoring and managing Conduit servers.

**Live instance**: [`conduit-ui.anorebel.net`](https://conduit-ui.anorebel.net)

## Features

- **Real-time Dashboard** - Live metrics, mini activity charts, and status indicators
- **Client Management** - DataTable with search, pagination, sorting, and context menus
- **Ban Management** - Ban/unban clients and IPs with stats cards and type filters
- **Metrics Visualization** - Theme-reactive Chart.js charts for throughput, latency, and connections
- **Audit Log** - Filterable DataTable with pagination and action type filters
- **Socket.IO-style Connection** - Dynamic server connection dialog (URL, auth type, credentials)
- **Dark/Light Theme** - System-aware theme with smooth transitions
- **Floating Header & Footer** - Glass-morphism header and pill footer with scroll behavior
- **Responsive Design** - Sidebar layout that works on desktop and mobile
- **Tour Guide** - First-visit onboarding tours for each page
- **Sonner Notifications** - Rich toast notifications for all actions
- **VueUse Integration** - Leverages VueUse composables throughout

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
NUXT_PUBLIC_ADMIN_API_URL=http://localhost:9000/admin
# WebSocket endpoint for real-time updates
NUXT_PUBLIC_ADMIN_WS_URL=ws://localhost:9000/admin/ws
```

### Running with the CLI

The easiest way to get the full stack running (server + admin API + dashboard):

```bash
# Terminal 1: Start the server with admin API
conduit start --admin --admin-api-key "your-key"

# Terminal 2: Start the admin UI
cd packages/admin-ui
bun run dev
```

Or use Docker Compose to run everything together:

```bash
cd docker
export ADMIN_API_KEY=$(openssl rand -base64 32)
docker compose --profile admin up -d
# Dashboard at http://localhost:3000
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with overview metrics and quick actions |
| `/clients` | Client list with search and filtering |
| `/clients/:id` | Detailed view of a specific client |
| `/metrics` | Detailed metrics charts and historical data |
| `/bans` | Ban management with stats, search, and type filters |
| `/audit` | Audit log with filtering by action type |
| `/settings` | Dashboard settings and preferences |

## Connection Dialog

The admin UI features a Socket.IO Admin-style connection dialog that lets you connect to any Conduit server dynamically. No hardcoded server URLs needed.

On first visit, the connection dialog prompts for:
- **Server URL** — The admin API endpoint (e.g., `https://conduit.anorebel.net/admin/v1`)
- **Auth Type** — API Key, Basic, or None
- **Credentials** — API key or username/password depending on auth type

Connection settings are persisted in `localStorage` for subsequent visits. You can change the connection at any time from the header or sidebar.

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

# Build for production (SSR)
bun run build

# Preview production build
bun run preview

# Build as static SPA
bun run generate
```

## Building for Production

### As Standalone App (SSR)

```bash
bun run build
```

The output will be in `.output/` directory. Deploy with `bun run .output/server/index.mjs`.

### As Static SPA

```bash
bun run generate
```

The output will be in `.output/public/` directory. Deploy to any static hosting, or use the embedded admin UI feature to serve from the Conduit server itself:

```bash
conduit start --admin --admin-api-key "your-key" --admin-ui .output/public
```

## Docker

```bash
# Build and run with Docker
docker build -f docker/Dockerfile.admin-ui -t conduit-admin-ui .
docker run -p 3000:3000 \
  -e NUXT_PUBLIC_ADMIN_API_URL=https://your-server.com/admin/v1 \
  -e NUXT_PUBLIC_ADMIN_WS_URL=wss://your-server.com/admin/v1/ws \
  conduit-admin-ui
```

Or use the all-in-one image that bundles server + admin API + admin UI:

```bash
docker compose --profile all-in-one up -d
# UI at http://localhost:9000/ui
```

## Requirements

- Bun 1.3+ or Node.js 24+
- Vue 3.5+
- Modern browser with ES2022 support

## License

MIT
