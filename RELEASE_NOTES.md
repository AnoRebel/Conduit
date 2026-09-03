## Release v3.1.1

### Changes since v3.1.0

- 339fffd fix(release): give JSR resolvable versions for runtime dependencies

### Installation

#### JSR
```bash
bunx jsr add @conduit/client@3.1.1
bunx jsr add @conduit/server@3.1.1
# or with npx
npx jsr add @conduit/client@3.1.1
npx jsr add @conduit/server@3.1.1
# or with deno
deno add jsr:@conduit/client@3.1.1
deno add jsr:@conduit/server@3.1.1
```

#### Go
```bash
go get github.com/AnoRebel/Conduit/packages/go-client@v3.1.1
```

### Docker

```bash
docker pull ghcr.io/anorebel/conduit/server:3.1.1
docker pull ghcr.io/anorebel/conduit/server-admin:3.1.1
docker pull ghcr.io/anorebel/conduit/admin-ui:3.1.1
```
