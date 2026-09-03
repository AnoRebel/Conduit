## Release v3.1.0

### Changes since v3.0.0

- 038ce39 fix(docker): copy the manifests admin-ui's workspace deps need
- b6abf90 fix(docker): drop the examples workspace before installing
- d2f1938 ci: move the Go toolchain to 1.27.1
- 46ecad8 Merge rooms, topics, multicast, and cluster distribution
- c95e89e docs: document rooms, use cases, and the hosted demo server's limits
- 165db8e test(admin-ui): add a populated demo server for screenshot capture
- 15495c6 docs(examples): add runnable rooms, topics, cluster, and parity examples
- 34498bd fix(admin-ui): stop nesting panels inside panels
- 36ed46b fix(admin-ui): restore pointer cursors on interactive elements
- 18c94f0 fix(admin-ui): keep metrics live and stop reporting an impossible rate
- fdc1486 feat(admin-ui): add a rooms page and instance switching
- 632e1bc feat(admin-ui): adopt TanStack Table v9 and TanStack Charts
- a439445 fix(admin-ui)!: stop sending the API key to the build-time host
- 3f9670e test(admin): cover room administration and fix two latent test bugs
- 27e6a1b fix(admin): populate the room and topic metric gauges
- 7e3d2da feat(admin): add room administration and cluster status
- 4e52b59 feat(go-client): add room and topic support
- 2aa9700 feat(client): add room and topic APIs
- b7913d7 test(server): cover rooms, topics, delivery, interop, and adversarial cases
- 6daab68 feat(server)!: add rooms, presence, topics, and multicast
- 363f94b feat(server): add a pluggable cluster backend with Redis support
- a8e6002 refactor(server): route every delivery through one chokepoint
- 3ece42e feat(shared): add room, topic, and multicast message types
- 9e38098 chore: adopt Bun catalogs and typecheck test files

### Installation

#### JSR
```bash
bunx jsr add @conduit/client@3.1.0
bunx jsr add @conduit/server@3.1.0
# or with npx
npx jsr add @conduit/client@3.1.0
npx jsr add @conduit/server@3.1.0
# or with deno
deno add jsr:@conduit/client@3.1.0
deno add jsr:@conduit/server@3.1.0
```

#### Go
```bash
go get github.com/AnoRebel/Conduit/packages/go-client@v3.1.0
```

### Docker

```bash
docker pull ghcr.io/anorebel/conduit/server:3.1.0
docker pull ghcr.io/anorebel/conduit/server-admin:3.1.0
docker pull ghcr.io/anorebel/conduit/admin-ui:3.1.0
```
