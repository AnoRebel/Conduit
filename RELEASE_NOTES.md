## Release v3.1.2

### Changes since v3.1.1

- e193e33 chore: rename the dashboard domain to conduit-admin.anorebel.net
- 5f94cc8 fix(docker): skip lifecycle scripts in the dev image build
- cbab8e3 chore: stop committing release artifacts to the repository
- cfee2cc ci: build every Docker image on push and pull request
- eed0256 fix(ci): call publish and docker from the release workflow

### Installation

#### JSR
```bash
bunx jsr add @conduit/client@3.1.2
bunx jsr add @conduit/server@3.1.2
# or with npx
npx jsr add @conduit/client@3.1.2
npx jsr add @conduit/server@3.1.2
# or with deno
deno add jsr:@conduit/client@3.1.2
deno add jsr:@conduit/server@3.1.2
```

#### Go
```bash
go get github.com/AnoRebel/Conduit/packages/go-client@v3.1.2
```

### Docker

```bash
docker pull ghcr.io/anorebel/conduit/server:3.1.2
docker pull ghcr.io/anorebel/conduit/server-admin:3.1.2
docker pull ghcr.io/anorebel/conduit/admin-ui:3.1.2
```
