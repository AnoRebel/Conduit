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

- **Message Types** — `MessageType` enum for all signaling protocol messages,
  covering peer-to-peer signaling, WebSocket relay, rooms and presence, and
  topics and multicast
- **Socket Event Types** — `SocketEventType` for WebSocket events
- **Error Types** — `ConduitErrorType` and `ServerErrorType` enums for standardized error codes
- **Interfaces** — `IMessage`, `IClientInfo`, `IServerConfig`, and other shared contracts
- **Version** — Centralized `VERSION` string for all packages

### Room, topic, and multicast types

Added alongside the original peer-to-peer protocol; every addition is additive,
so no existing message changed shape.

| Message | Payload | Purpose |
|---|---|---|
| `JOIN` | `IJoinPayload` | Join a named room |
| `LEAVE_ROOM` | `ILeaveRoomPayload` | Leave a room. Distinct from `LEAVE`, which stays peer-to-peer |
| `ROOM_STATE` | `IRoomStatePayload` | Membership sent to a peer that just joined |
| `PEER_JOINED` | `IPeerJoinedPayload` | Presence: a peer arrived |
| `PEER_LEFT` | `IPeerLeftPayload` | Presence: a peer departed |
| `SUBSCRIBE` | `ISubscribePayload` | Subscribe to a topic or `prefix.*` |
| `UNSUBSCRIBE` | `IUnsubscribePayload` | Remove a subscription |
| `SUBSCRIBED` | `ISubscribePayload` | Subscription confirmed |
| `UNSUBSCRIBED` | `IUnsubscribePayload` | Subscription removed |
| `PUBLISH` | `IPublishPayload` | Publish to a topic |
| `TOPIC_MESSAGE` | `ITopicMessagePayload` | A publication delivered to a subscriber |
| `ROOM_BROADCAST` | `IRoomBroadcastPayload` | Multicast to a room's members |

`TypedMessage` includes every one of these, so a `switch` over `message.type`
that assigns its fallthrough to `never` fails to compile when a member is
unhandled.

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

// Room and topic messages are part of the same union
if (message.type === MessageType.ROOM_STATE) {
  const { room, members } = message.payload;
  console.log(`joined ${room} with`, members);
}

// Check protocol version
console.log(`Conduit v${VERSION}`);
```

## License

MIT
