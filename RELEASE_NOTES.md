## Release v3.0.0

### Changes since v2.0.0

- 29770df docs: document the 3.0.0 library key enforcement as a breaking change
- abfa74a docs: add dashboard screenshots and correct READMEs for v2
- fe2cfe3 fix(server)!: enforce the signaling key in the library, not only the CLI
- 69bacbb fix(docker): align images with v2 and surface unhealthy containers
- 20d07b8 fix(server): derive the CLI banner version from the program version

### Installation

#### JSR
```bash
bunx jsr add @conduit/client@3.0.0
bunx jsr add @conduit/server@3.0.0
# or with npx
npx jsr add @conduit/client@3.0.0
npx jsr add @conduit/server@3.0.0
# or with deno
deno add jsr:@conduit/client@3.0.0
deno add jsr:@conduit/server@3.0.0
```

#### Go
```bash
go get github.com/AnoRebel/Conduit/packages/go-client@v3.0.0
```

### Docker

```bash
docker pull ghcr.io/anorebel/conduit/server:3.0.0
docker pull ghcr.io/anorebel/conduit/server-admin:3.0.0
docker pull ghcr.io/anorebel/conduit/admin-ui:3.0.0
```
