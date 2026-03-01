// Package conduit provides a Go client for the Conduit WebRTC signaling server.
//
// The client handles WebSocket connection management, heartbeat keep-alive,
// automatic reconnection with exponential backoff, and message routing for
// the Conduit signaling protocol.
//
// Usage:
//
//	client, err := conduit.New("localhost:9000",
//	    conduit.WithKey("conduit"),
//	    conduit.WithSecure(false),
//	)
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer client.Close()
//
//	client.OnOpen(func(id string) {
//	    fmt.Printf("Connected with ID: %s\n", id)
//	})
//
//	if err := client.Connect(context.Background()); err != nil {
//	    log.Fatal(err)
//	}
package conduit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Client is a Conduit signaling server client. It manages a WebSocket connection,
// sends periodic heartbeats, and supports automatic reconnection.
//
// All callback methods (OnOpen, OnMessage, OnClose, OnError) must be set before
// calling Connect. The Client is safe for concurrent use.
type Client struct {
	host string
	opts options

	http *httpClient
	ws   *wsConn

	mu        sync.RWMutex
	id        string
	connected bool

	cancel context.CancelFunc

	onOpen    func(id string)
	onMessage func(msg Message)
	onClose   func()
	onError   func(err error)
}

// New creates a new Conduit client for the given host (e.g., "localhost:9000").
// Configure the client with functional options:
//
//	client, err := conduit.New("localhost:9000",
//	    conduit.WithKey("mykey"),
//	    conduit.WithPath("/"),
//	    conduit.WithSecure(false),
//	)
func New(host string, opts ...Option) (*Client, error) {
	if host == "" {
		return nil, errors.New("conduit: host must not be empty")
	}

	o := defaultOptions()
	for _, opt := range opts {
		opt(&o)
	}

	httpC := newHTTPClient(host, o.path, o.key, o.secure)

	return &Client{
		host: host,
		opts: o,
		http: httpC,
	}, nil
}

// ID returns the client's assigned ID. Returns an empty string if not yet connected.
func (c *Client) ID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.id
}

// Connected reports whether the client is currently connected to the server.
func (c *Client) Connected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// OnOpen sets the callback invoked when the WebSocket connection is established
// and the server confirms with an OPEN message. The callback receives the assigned client ID.
func (c *Client) OnOpen(fn func(id string)) {
	c.onOpen = fn
}

// OnMessage sets the callback invoked for every incoming message from the server.
// Messages of type OPEN, HEARTBEAT, and internal types are still delivered here
// in addition to triggering their specific handlers.
func (c *Client) OnMessage(fn func(msg Message)) {
	c.onMessage = fn
}

// OnClose sets the callback invoked when the WebSocket connection is closed.
func (c *Client) OnClose(fn func()) {
	c.onClose = fn
}

// OnError sets the callback invoked when an error occurs during connection or message handling.
func (c *Client) OnError(fn func(err error)) {
	c.onError = fn
}

// Connect establishes the connection to the Conduit server. It:
//  1. Requests a client ID from the server via HTTP (if not pre-configured)
//  2. Opens a WebSocket connection
//  3. Waits for the OPEN confirmation message
//  4. Starts heartbeat and message read goroutines
//
// The provided context controls the connection lifecycle. Canceling the context
// will close the connection and stop all background goroutines.
func (c *Client) Connect(ctx context.Context) error {
	// Obtain a client ID if not already set.
	if c.opts.id == "" {
		id, err := c.http.GetID(ctx)
		if err != nil {
			return fmt.Errorf("conduit: getting client ID: %w", err)
		}
		c.mu.Lock()
		c.id = id
		c.opts.id = id
		c.mu.Unlock()
	} else {
		c.mu.Lock()
		c.id = c.opts.id
		c.mu.Unlock()
	}

	return c.connect(ctx)
}

// connect performs the actual WebSocket connection and starts background goroutines.
func (c *Client) connect(ctx context.Context) error {
	c.mu.RLock()
	id := c.id
	c.mu.RUnlock()

	token := c.opts.token
	if token == "" {
		// The server requires a token parameter; use the ID as fallback.
		token = id
	}

	ws, err := dialWebSocket(c.host, c.opts.path, c.opts.key, id, token, c.opts.secure)
	if err != nil {
		return err
	}

	c.mu.Lock()
	c.ws = ws
	c.mu.Unlock()

	// Wait for the OPEN message from the server.
	msg, err := ws.readMessage()
	if err != nil {
		ws.close()
		return fmt.Errorf("conduit: waiting for OPEN message: %w", err)
	}

	if msg.Type == MessageTypeIDTaken {
		ws.close()
		return fmt.Errorf("conduit: requested ID %q is already taken", id)
	}

	if msg.Type == MessageTypeError {
		ws.close()
		var ep ErrorPayload
		msg.ParsePayload(&ep)
		return fmt.Errorf("conduit: server error: %s", ep.Msg)
	}

	if msg.Type != MessageTypeOpen {
		ws.close()
		return fmt.Errorf("conduit: expected OPEN message, got %s", msg.Type)
	}

	c.mu.Lock()
	c.connected = true
	c.mu.Unlock()

	// Fire the open callback.
	if c.onOpen != nil {
		c.onOpen(id)
	}

	// Create a context for background goroutines.
	connCtx, cancel := context.WithCancel(ctx)
	c.mu.Lock()
	c.cancel = cancel
	c.mu.Unlock()

	// Start heartbeat goroutine.
	go c.heartbeatLoop(connCtx)

	// Start read loop goroutine.
	go c.readLoop(connCtx)

	return nil
}

// Close gracefully shuts down the client connection. It stops the heartbeat,
// closes the WebSocket, and invokes the OnClose callback.
func (c *Client) Close() error {
	c.mu.Lock()
	if c.cancel != nil {
		c.cancel()
		c.cancel = nil
	}
	ws := c.ws
	c.connected = false
	c.ws = nil
	c.mu.Unlock()

	if ws != nil {
		return ws.close()
	}
	return nil
}

// Send sends a message to the server. The Src field is automatically set to the client's ID.
func (c *Client) Send(msg Message) error {
	c.mu.RLock()
	ws := c.ws
	id := c.id
	connected := c.connected
	c.mu.RUnlock()

	if !connected || ws == nil {
		return fmt.Errorf("conduit: not connected")
	}

	msg.Src = id

	return ws.send(msg)
}

// SendOffer sends an SDP offer to the specified peer.
func (c *Client) SendOffer(peerID string, payload any) error {
	msg, err := NewMessage(MessageTypeOffer, peerID, payload)
	if err != nil {
		return err
	}
	return c.Send(msg)
}

// SendAnswer sends an SDP answer to the specified peer.
func (c *Client) SendAnswer(peerID string, payload any) error {
	msg, err := NewMessage(MessageTypeAnswer, peerID, payload)
	if err != nil {
		return err
	}
	return c.Send(msg)
}

// SendCandidate sends an ICE candidate to the specified peer.
func (c *Client) SendCandidate(peerID string, payload any) error {
	msg, err := NewMessage(MessageTypeCandidate, peerID, payload)
	if err != nil {
		return err
	}
	return c.Send(msg)
}

// ListConduits returns the list of connected peer IDs from the server.
// Requires peer discovery to be enabled on the server.
func (c *Client) ListConduits(ctx context.Context) ([]string, error) {
	return c.http.ListConduits(ctx)
}

// heartbeatLoop sends periodic HEARTBEAT messages to the server to keep the connection alive.
func (c *Client) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(c.opts.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.mu.RLock()
			ws := c.ws
			c.mu.RUnlock()

			if ws == nil {
				return
			}

			msg := Message{
				Type: MessageTypeHeartbeat,
			}

			if err := ws.send(msg); err != nil {
				c.emitError(fmt.Errorf("conduit: sending heartbeat: %w", err))
				return
			}
		}
	}
}

// readLoop reads messages from the WebSocket and dispatches them to callbacks.
func (c *Client) readLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		c.mu.RLock()
		ws := c.ws
		c.mu.RUnlock()

		if ws == nil {
			return
		}

		msg, err := ws.readMessage()
		if err != nil {
			// Check if the context was canceled (clean shutdown).
			if ctx.Err() != nil {
				return
			}

			// Determine if this is a normal close or an error.
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				c.handleDisconnect()
				return
			}

			c.emitError(fmt.Errorf("conduit: read error: %w", err))
			c.handleDisconnect()

			// Attempt reconnection.
			if c.opts.autoReconnect && c.opts.maxReconnectAttempts > 0 {
				go c.reconnect(ctx)
			}
			return
		}

		c.handleMessage(msg)
	}
}

// handleMessage dispatches an incoming message to the appropriate callback.
func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case MessageTypeOpen:
		// Server re-confirmed open (e.g., after reconnect).
		if c.onOpen != nil {
			c.mu.RLock()
			id := c.id
			c.mu.RUnlock()
			c.onOpen(id)
		}

	case MessageTypeError:
		var ep ErrorPayload
		msg.ParsePayload(&ep)
		c.emitError(fmt.Errorf("conduit: server error: %s", ep.Msg))

	case MessageTypeIDTaken:
		c.emitError(fmt.Errorf("conduit: ID is already taken"))

	case MessageTypeGoAway:
		var gp GoAwayPayload
		msg.ParsePayload(&gp)
		c.emitError(fmt.Errorf("conduit: server going away: %s", gp.Msg))
		c.handleDisconnect()
		return

	case MessageTypeExpire:
		c.emitError(fmt.Errorf("conduit: offer from %s expired", msg.Src))
	}

	// Deliver all messages to the general callback.
	if c.onMessage != nil {
		c.onMessage(msg)
	}
}

// handleDisconnect marks the client as disconnected and fires the OnClose callback.
func (c *Client) handleDisconnect() {
	c.mu.Lock()
	wasConnected := c.connected
	c.connected = false
	c.mu.Unlock()

	if wasConnected && c.onClose != nil {
		c.onClose()
	}
}

// reconnect attempts to re-establish the WebSocket connection using exponential backoff.
func (c *Client) reconnect(parentCtx context.Context) {
	for attempt := range c.opts.maxReconnectAttempts {
		delay := c.backoffDelay(attempt)

		select {
		case <-parentCtx.Done():
			return
		case <-time.After(delay):
		}

		// Create a fresh context for the reconnection attempt (derived from the parent).
		ctx, cancel := context.WithTimeout(parentCtx, 15*time.Second)
		err := c.connect(ctx)
		cancel()

		if err == nil {
			return
		}

		c.emitError(fmt.Errorf("conduit: reconnection attempt %d/%d failed: %w", attempt+1, c.opts.maxReconnectAttempts, err))
	}

	c.emitError(fmt.Errorf("conduit: all %d reconnection attempts exhausted", c.opts.maxReconnectAttempts))
}

// backoffDelay calculates an exponential backoff delay for the given attempt number.
func (c *Client) backoffDelay(attempt int) time.Duration {
	delay := time.Duration(float64(c.opts.reconnectBaseDelay) * math.Pow(2, float64(attempt)))
	if delay > c.opts.reconnectMaxDelay {
		delay = c.opts.reconnectMaxDelay
	}
	return delay
}

// emitError invokes the OnError callback if set.
func (c *Client) emitError(err error) {
	if c.onError != nil {
		c.onError(err)
	}
}

// MarshalMessage is a convenience function that marshals any payload to a [json.RawMessage].
func MarshalMessage(v any) (json.RawMessage, error) {
	return json.Marshal(v)
}
