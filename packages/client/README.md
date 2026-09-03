# Conduit Client

[![JSR @conduit/client](https://jsr.io/badges/@conduit/client)](https://jsr.io/@conduit/client)

WebRTC peer-to-peer data, video, and audio connections for browsers and Node.js.

## Installation

```bash
# JSR (recommended)
bunx jsr add @conduit/client
# or
npx jsr add @conduit/client
```

> **Note for npm consumers:** the package now ships a tree of `.d.ts` declaration
> files instead of three bundled ones (TypeScript 7 removed the compiler API the
> declaration bundler relied on). Type resolution is unchanged — the `exports` map
> in `package.json` points at the new paths. JSR consumers are unaffected, since
> JSR publishes from source.

## Usage

### Basic Data Connection

```typescript
import { Conduit } from '@conduit/client';

// Create a new Conduit instance (uses cloud server by default)
const conduit = new Conduit('my-peer-id');

conduit.on('open', (id) => {
  console.log('My peer ID is:', id);
});

// Connect to another peer
const conn = conduit.connect('other-peer-id');

conn.on('open', () => {
  conn.send('Hello!');
  conn.send({ type: 'message', content: 'Structured data works too!' });
});

conn.on('data', (data) => {
  console.log('Received:', data);
});

// Handle incoming connections
conduit.on('connection', (conn) => {
  console.log('Incoming connection from:', conn.peer);

  conn.on('data', (data) => {
    console.log('Received:', data);
    conn.send('Got your message!');
  });
});
```

### Media Calls

```typescript
// Make a video/audio call
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true,
});

const call = conduit.call('peer-id', stream);

call.on('stream', (remoteStream) => {
  videoElement.srcObject = remoteStream;
});

// Answer incoming calls
conduit.on('call', (call) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  call.answer(stream);

  call.on('stream', (remoteStream) => {
    videoElement.srcObject = remoteStream;
  });
});
```

### Transport Types

```typescript
import { Conduit, TransportType } from '@conduit/client';

const conduit = new Conduit('my-id', {
  transport: TransportType.Auto, // Default: try WebRTC, fallback to WebSocket
});

// Per-connection transport
const conn = conduit.connect('peer-id', {
  transport: TransportType.WebSocket, // Force WebSocket relay
});
```

Available transports:
- `TransportType.WebRTC` - Direct P2P via WebRTC DataChannels
- `TransportType.WebSocket` - Relay through signaling server
- `TransportType.Auto` - WebRTC with automatic fallback to WebSocket

### Serialization

```typescript
import { Conduit, SerializationType } from '@conduit/client';

const conn = conduit.connect('peer-id', {
  serialization: SerializationType.JSON,
});
```

Available serialization types:
- `SerializationType.Binary` - BinaryPack (default, efficient)
- `SerializationType.JSON` - JSON format
- `SerializationType.MsgPack` - MessagePack (requires streams support)
- `SerializationType.None` - Raw ArrayBuffer/Blob

### Custom Server

```typescript
const conduit = new Conduit('my-id', {
  host: 'your-server.com',
  port: 9000,
  path: '/',
  secure: true,
  // Must match the key the signaling server was started with
  key: 'your-server-key',
});
```

### Connection Options

```typescript
const conn = conduit.connect('peer-id', {
  label: 'my-connection',      // Custom label
  metadata: { user: 'alice' }, // Custom metadata
  serialization: SerializationType.Binary,
  transport: TransportType.Auto,
  webrtcTimeout: 5000,         // Fallback timeout (ms)
  reliable: true,              // Use reliable DataChannel
});
```

## Rooms and Presence

Join a named room to discover peers instead of distributing IDs out of band.
`join` resolves once the server confirms and reports the membership; it rejects
on timeout, which is what an older server ignoring the message looks like.

```typescript
const room = await conduit.join('standup');

console.log('already here:', room.members);

room.on('peerJoined', (peerId) => {
  const conn = conduit.connect(peerId);
  conn.on('open', () => conn.send('hello'));
});

room.on('peerLeft', (peerId) => console.log(peerId, 'left'));
room.on('message', (data, from) => console.log(from, 'broadcast', data));

// Requires topics to be enabled on the server.
room.broadcast({ text: 'to everyone here' });

room.leave();
```

The member list is a convenience for discovering peers, never an authority: the
server decides who may do what, and a client should not derive permission from
it.

## Topics

```typescript
// Exact name, or a namespace prefix ending in `.*`
const topic = await conduit.subscribe('chat.*');

topic.on('message', (data, name, from) => {
  console.log(`${from} published to ${name}:`, data);
});

conduit.publish('chat.general', { text: 'hello' });

// Ask for a copy back when you also hold a matching subscription
conduit.publish('chat.general', { text: 'hi' }, { selfDeliver: true });

topic.unsubscribe();
```

`chat.*` matches `chat.general` but **not** `chatter.general`: matching is by
whole segment. Publications are never queued — a subscriber that is offline
misses them rather than receiving a backlog on reconnect.

Room and topic handles release their listeners when closed, and `conduit.destroy()`
closes every handle it holds.

## API Reference

### Conduit

#### Constructor

```typescript
new Conduit(options?: ConduitOptions)
new Conduit(id: string, options?: ConduitOptions)
```

#### Options

> **On the default host.** When `host` is omitted the client talks to
> `conduit.anorebel.net`, a best-effort demo instance run by the maintainer for
> evaluation. It has no uptime or retention guarantee, is rate limited, and may
> be withdrawn at any time. Pass your own `host` for anything you depend on.

```typescript
interface ConduitOptions {
  key?: string;              // API key (must match the server's configured key)
  host?: string;             // Server host (default: 'conduit.anorebel.net' — see note below)
  port?: number;             // Server port (default: 443)
  path?: string;             // Server path (default: '/')
  secure?: boolean;          // Use HTTPS/WSS (default: true)
  token?: string;            // Custom token
  config?: RTCConfiguration; // WebRTC config
  debug?: LogLevel;          // Debug level
  transport?: TransportType; // Default transport
  serialization?: SerializationType; // Default serialization
}
```

#### Properties

- `id: string | null` - The peer ID
- `open: boolean` - Whether connected to signaling server
- `destroyed: boolean` - Whether the conduit has been destroyed
- `disconnected: boolean` - Whether disconnected from server
- `connections: Map` - All active connections

#### Methods

- `connect(peerId, options?)` - Create a data connection
- `call(peerId, stream, options?)` - Create a media connection
- `disconnect()` - Disconnect from signaling server
- `reconnect()` - Reconnect to signaling server
- `destroy()` - Close all connections and cleanup
- `listAllConduits()` - List all connected peers (if discovery enabled)

#### Events

- `open` - Connected to signaling server
- `connection` - Incoming data connection
- `call` - Incoming media call
- `close` - Conduit destroyed
- `disconnected` - Disconnected from server
- `error` - Error occurred

### DataConnection

#### Properties

- `peer: string` - Remote peer ID
- `open: boolean` - Connection is open
- `label: string` - Connection label
- `metadata: unknown` - Custom metadata
- `serialization: SerializationType` - Data serialization type

#### Methods

- `send(data)` - Send data to peer
- `close()` - Close the connection

#### Events

- `open` - Connection established
- `data` - Data received
- `close` - Connection closed
- `error` - Error occurred

### MediaConnection

#### Properties

- `peer: string` - Remote peer ID
- `open: boolean` - Connection is open
- `metadata: unknown` - Custom metadata
- `localStream: MediaStream` - Local media stream
- `remoteStream: MediaStream` - Remote media stream

#### Methods

- `answer(stream, options?)` - Answer the call
- `close()` - Close the connection

#### Events

- `stream` - Remote stream received
- `close` - Connection closed
- `error` - Error occurred

## Migration from PeerJS

Use the compatibility layer for drop-in replacement:

```typescript
// Replace your PeerJS import
import { Peer } from '@conduit/client/peerjs-compat';

// Your existing code works unchanged
const peer = new Peer('my-id');
```

## Browser Support

Conduit works in all modern browsers that support WebRTC:
- Chrome 56+
- Firefox 44+
- Safari 11+
- Edge 79+

## License

MIT
