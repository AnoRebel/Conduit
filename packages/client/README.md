# Conduit Client

WebRTC peer-to-peer data, video, and audio connections for browsers and Node.js.

## Installation

```bash
npm install @conduit/client
# or
bun add @conduit/client
# or
yarn add @conduit/client
```

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
  key: 'conduit',
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

## API Reference

### Conduit

#### Constructor

```typescript
new Conduit(options?: ConduitOptions)
new Conduit(id: string, options?: ConduitOptions)
```

#### Options

```typescript
interface ConduitOptions {
  key?: string;              // API key (default: 'conduit')
  host?: string;             // Server host (default: 'conduit.anorebel.net')
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
