## Release v3.2.2

### Changes since v3.2.1

- 7f7b9bf fix(docker): build all-in-one's assets on the build platform
- 02dc92e ci(docker): don't fail an image build when the cache upload fails
- d6944dc ci(docker): fail the image build after 45 minutes

### Installation

#### JSR
```bash
bunx jsr add @conduit/client@3.2.2
bunx jsr add @conduit/server@3.2.2
# or with npx
npx jsr add @conduit/client@3.2.2
npx jsr add @conduit/server@3.2.2
# or with deno
deno add jsr:@conduit/client@3.2.2
deno add jsr:@conduit/server@3.2.2
```

#### Go
```bash
go get github.com/AnoRebel/Conduit/packages/go-client@v3.2.2
```

### Docker

```bash
docker pull ghcr.io/anorebel/conduit/server:3.2.2
docker pull ghcr.io/anorebel/conduit/server-admin:3.2.2
docker pull ghcr.io/anorebel/conduit/admin-ui:3.2.2
```
