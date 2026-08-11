# @conduit/shared

[![JSR @conduit/shared](https://jsr.io/badges/@conduit/shared)](https://jsr.io/@conduit/shared)

Shared types, enums, and utilities for the Conduit WebRTC signaling ecosystem.

## Installation

```bash
bunx jsr add @conduit/shared
# or
npx jsr add @conduit/shared
```

## What's Included

- **Message Types** — `MessageType` enum for all signaling protocol messages
- **Socket Event Types** — `SocketEventType` for WebSocket events
- **Error Types** — `ConduitErrorType` and `ServerErrorType` enums for standardized error codes
- **Interfaces** — `IMessage`, `IClientInfo`, `IServerConfig`, and other shared contracts
- **Version** — Centralized `VERSION` string for all packages

## Usage

```typescript
import {
  MessageType,
  SocketEventType,
  ConduitErrorType,
  type IClientInfo,
  type IMessage,
  VERSION,
} from "@conduit/shared";

// Use message types for signaling
if (message.type === MessageType.OFFER) {
  // Handle WebRTC offer
}

// Check protocol version
console.log(`Conduit v${VERSION}`);
```

## License

MIT
