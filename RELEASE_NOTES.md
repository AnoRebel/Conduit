## Release v2.0.0

### Changes since v1.0.5

- c60959e ci: run the e2e suite against the runner's preinstalled Chrome
- 673eba3 docs(go-client): state that the Go client is signaling-only
- 7514c63 test(admin-ui): add manual visual and connected-state capture scripts
- e4f33f1 fix(admin-ui): populate metrics stats, stamp real version, fix flaky e2e
- 87414c8 fix(admin-ui): share connection settings across composable instances
- a21d2ef chore: ignore local agent and openspec working directories
- a8ced48 fix(admin-ui): inject Rybbit analytics via app.head
- 82482f9 ci: align workflow runtimes and action versions
- c7ce7fb feat(server): implement WebSocket signaling for the Hono adapter
- 5978f30 chore: clear pre-existing lint debt and fix a flaky test
- 8484f64 docs: reconcile documentation with actual behaviour
- 103f729 test(admin-ui): add browser smoke tests with bunwright
- 19af897 fix(admin): harden audit identity, broadcasts, realtime, and startup
- 145798c fix(server): enforce bans, require a real key, and harden peer identity
- afb1b10 fix(admin): enforce identical protections across all four adapters
- 474b2d6 build: migrate toolchain to TypeScript 7 and drop dead dependencies

### Installation

#### JSR
```bash
bunx jsr add @conduit/client@2.0.0
bunx jsr add @conduit/server@2.0.0
# or with npx
npx jsr add @conduit/client@2.0.0
npx jsr add @conduit/server@2.0.0
# or with deno
deno add jsr:@conduit/client@2.0.0
deno add jsr:@conduit/server@2.0.0
```

#### Go
```bash
go get github.com/AnoRebel/Conduit/packages/go-client@v2.0.0
```

### Docker

```bash
docker pull ghcr.io/anorebel/conduit/server:2.0.0
docker pull ghcr.io/anorebel/conduit/server-admin:2.0.0
docker pull ghcr.io/anorebel/conduit/admin-ui:2.0.0
```
