# conduit-go

A Go client library for the [Conduit](https://github.com/AnoRebel/conduit) WebRTC signaling server.

> **Scope: signaling only.** This client speaks the Conduit signaling
> protocol — it connects, exchanges `OFFER`, `ANSWER` and `CANDIDATE`
> messages with other peers, and lists connected conduits. It does **not**
> establish WebRTC peer connections, data channels, or media streams; pair it
> with a Go WebRTC stack such as [pion/webrtc](https://github.com/pion/webrtc)
> to carry the SDP and ICE payloads it relays. For an end-to-end client with
> built-in data channels and media calls, use
> [`@conduit/client`](../client).

## Installation

```bash
go get github.com/AnoRebel/Conduit/packages/go-client
```

## Quick Start

```go
package main

import (
	"context"
	"fmt"
	"log"

	conduit "github.com/AnoRebel/Conduit/packages/go-client"
)

func main() {
	client, err := conduit.New("localhost:9000",
		conduit.WithKey("your-server-key"), // Must match the key the server was started with
		conduit.WithPath("/"),
		conduit.WithSecure(false),
	)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	client.OnOpen(func(id string) {
		fmt.Printf("Connected with ID: %s\n", id)
	})

	client.OnMessage(func(msg conduit.Message) {
		fmt.Printf("Got %s from %s\n", msg.Type, msg.Src)
	})

	client.OnError(func(err error) {
		log.Printf("Error: %v\n", err)
	})

	client.OnClose(func() {
		fmt.Println("Disconnected")
	})

	ctx := context.Background()

	if err := client.Connect(ctx); err != nil {
		log.Fatal(err)
	}

	// Send an offer to a peer
	client.SendOffer("peer-id", map[string]any{"sdp": "v=0\r\n..."})

	// Keep running
	select {}
}
```

## Features

- **Automatic ID assignment** — Fetches a unique client ID from the server via HTTP, or use `WithID()` to specify one.
- **Heartbeat keep-alive** — Sends periodic `HEARTBEAT` messages (configurable interval, default 10s).
- **Automatic reconnection** — Exponential backoff reconnection (configurable attempts and delays).
- **Thread-safe** — All operations are safe for concurrent use.
- **Context-based cancellation** — All operations respect `context.Context` for timeouts and cancellation.
- **Event callbacks** — `OnOpen`, `OnMessage`, `OnClose`, `OnError` for reactive programming.

## Configuration

Use functional options to configure the client:

```go
client, err := conduit.New("localhost:9000",
	conduit.WithKey("your-server-key"),  // API key (must match the server's configured key)
	conduit.WithID("my-custom-id"),      // Pre-set client ID (default: server-assigned)
	conduit.WithToken("auth-token"),     // Auth token (optional)
	conduit.WithPath("/"),               // URL path prefix (default: "/")
	conduit.WithSecure(true),            // Use wss:// and https:// (default: false)
	conduit.WithHeartbeatInterval(15*time.Second), // Heartbeat interval (default: 10s)
	conduit.WithMaxReconnectAttempts(10),           // Max reconnect attempts (default: 5)
	conduit.WithReconnectBaseDelay(2*time.Second),  // Base backoff delay (default: 1s)
	conduit.WithReconnectMaxDelay(60*time.Second),  // Max backoff delay (default: 30s)
	conduit.WithAutoReconnect(true),                // Auto-reconnect on disconnect (default: true)
)
```

## Signaling

Send WebRTC signaling messages to peers:

```go
// Send an SDP offer
client.SendOffer("peer-id", map[string]any{
	"sdp":          sdpOffer,
	"type":         "data",
	"connectionId": "conn-123",
})

// Send an SDP answer
client.SendAnswer("peer-id", map[string]any{
	"sdp":          sdpAnswer,
	"type":         "data",
	"connectionId": "conn-123",
})

// Send an ICE candidate
client.SendCandidate("peer-id", map[string]any{
	"candidate":    iceCandidate,
	"type":         "data",
	"connectionId": "conn-123",
})

// Send any custom message
msg, _ := conduit.NewMessage(conduit.MessageTypeRelay, "peer-id", payload)
client.Send(msg)
```

## Peer Discovery

List connected peers (requires `allowDiscovery: true` on the server):

```go
peers, err := client.ListConduits(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Connected peers: %v\n", peers)
```

## Message Types

All message types from the Conduit protocol are available as constants:

| Constant | Value | Description |
|---|---|---|
| `MessageTypeOpen` | `OPEN` | Server confirms connection |
| `MessageTypeLeave` | `LEAVE` | Peer disconnecting |
| `MessageTypeCandidate` | `CANDIDATE` | ICE candidate exchange |
| `MessageTypeOffer` | `OFFER` | SDP offer |
| `MessageTypeAnswer` | `ANSWER` | SDP answer |
| `MessageTypeExpire` | `EXPIRE` | Message expired |
| `MessageTypeHeartbeat` | `HEARTBEAT` | Keep-alive |
| `MessageTypeIDTaken` | `ID-TAKEN` | ID already in use |
| `MessageTypeError` | `ERROR` | Server error |
| `MessageTypeRelay` | `RELAY` | Data relay (fallback) |
| `MessageTypeRelayOpen` | `RELAY_OPEN` | Relay channel opened |
| `MessageTypeRelayClose` | `RELAY_CLOSE` | Relay channel closed |
| `MessageTypeGoAway` | `GOAWAY` | Server shutting down |
| `MessageTypeJoin` | `JOIN` | Join a named room |
| `MessageTypeLeaveRoom` | `LEAVE_ROOM` | Leave a room (distinct from `LEAVE`) |
| `MessageTypeRoomState` | `ROOM_STATE` | Room membership on join |
| `MessageTypePeerJoined` | `PEER_JOINED` | A peer joined a shared room |
| `MessageTypePeerLeft` | `PEER_LEFT` | A peer left a shared room |
| `MessageTypeSubscribe` | `SUBSCRIBE` | Subscribe to a topic or prefix |
| `MessageTypeUnsubscribe` | `UNSUBSCRIBE` | Remove a subscription |
| `MessageTypeSubscribed` | `SUBSCRIBED` | Subscription confirmed |
| `MessageTypeUnsubscribed` | `UNSUBSCRIBED` | Subscription removed |
| `MessageTypePublish` | `PUBLISH` | Publish to a topic |
| `MessageTypeTopicMessage` | `TOPIC_MESSAGE` | Publication delivered |
| `MessageTypeRoomBroadcast` | `ROOM_BROADCAST` | Multicast to a room |

## Rooms and Presence

```go
client, err := conduit.New("localhost:9000",
    conduit.WithKey(os.Getenv("CONDUIT_KEY")),
    conduit.WithID("go-peer"),
)
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.Connect(context.Background()); err != nil {
    log.Fatal(err)
}

room, err := client.Join("standup")
if err != nil {
    log.Fatal(err)
}

room.OnPeerJoined(func(peerID string) {
    fmt.Println(peerID, "joined")
})
room.OnPeerLeft(func(peerID string) {
    fmt.Println(peerID, "left")
})
room.OnMessage(func(data any, from string) {
    fmt.Println(from, "broadcast:", data)
})

// Membership arrives asynchronously; Room.Open reports whether the server
// has confirmed the join.
fmt.Println("members:", room.Members())

room.Leave()
```

## Topics

```go
topic, err := client.Subscribe("chat.*")
if err != nil {
    log.Fatal(err)
}

topic.OnMessage(func(data any, name string, from string) {
    fmt.Printf("%s published to %s: %v\n", from, name, data)
})

client.Publish("chat.general", map[string]string{"text": "hello"})

// Ask for a copy back when this client also holds a matching subscription.
client.PublishSelf("chat.general", "mine")

topic.Unsubscribe()
```

`chat.*` matches `chat.general` but not `chatter.general`: matching is by whole
segment, mirroring the server rule exactly.

Room and topic state is released on disconnect and is **not** restored on
reconnect — a returning client joins and subscribes again explicitly, matching
the TypeScript client.

The Go client is signaling-only: it participates in rooms and topics, but has no
built-in WebRTC transport.

## License

[MIT](../../LICENSE)
