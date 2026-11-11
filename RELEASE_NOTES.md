## Release v3.2.0

### Changes since v3.1.2

- fed74e9 build(go): move the Go client to Go 1.27.4
- ce5bf7b Merge pull request #102 from AnoRebel/chore/deps-latest-majors
- 2805b6d docs(server): explain why TURN credentials use HMAC-SHA1
- 7a3ccd3 fix(docker): give the Nuxt builders a Node binary
- 04175ed chore: add a security policy and a read-only token for CI
- eed6184 chore: relicense under Apache-2.0
- d02bda8 feat: issue short-lived TURN credentials from the signaling server
- 31b6934 chore(deps): upgrade every dependency to its latest major
- f08786c build: add a dependency license gate
- 1b1c874 Merge pull request #99 from AnoRebel/fix/analytics-build-args
- dbf214f fix(docker): pass the analytics site ids into the admin-ui build
- f5412f1 build: drop imbios/bun-node and pin Bun 1.4.1 everywhere
- c71dc44 chore(admin-ui): drop @nuxt/image, add the OG image renderer it masked
- 26882f4 chore: track Bun 1.4 instead of pinning 1.3.14

### Installation

#### JSR
```bash
bunx jsr add @conduit/client@3.2.0
bunx jsr add @conduit/server@3.2.0
# or with npx
npx jsr add @conduit/client@3.2.0
npx jsr add @conduit/server@3.2.0
# or with deno
deno add jsr:@conduit/client@3.2.0
deno add jsr:@conduit/server@3.2.0
```

#### Go
```bash
go get github.com/AnoRebel/Conduit/packages/go-client@v3.2.0
```

### Docker

```bash
docker pull ghcr.io/anorebel/conduit/server:3.2.0
docker pull ghcr.io/anorebel/conduit/server-admin:3.2.0
docker pull ghcr.io/anorebel/conduit/admin-ui:3.2.0
```
