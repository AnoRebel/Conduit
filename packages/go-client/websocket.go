package conduit

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"

	"github.com/gorilla/websocket"
)

// wsConn manages the WebSocket connection to the Conduit signaling server.
type wsConn struct {
	conn   *websocket.Conn
	mu     sync.Mutex
	closed bool
}

// buildWSURL constructs the WebSocket URL for connecting to the Conduit server.
func buildWSURL(host, path, key, id, token string, secure bool) string {
	scheme := "ws"
	if secure {
		scheme = "wss"
	}

	path = normalizePath(path)

	query := url.Values{}
	query.Set("key", key)
	query.Set("id", id)
	if token != "" {
		query.Set("token", token)
	}

	return fmt.Sprintf("%s://%s%sconduit?%s", scheme, host, path, query.Encode())
}

// dialWebSocket opens a new WebSocket connection to the Conduit signaling server.
func dialWebSocket(host, path, key, id, token string, secure bool) (*wsConn, error) {
	wsURL := buildWSURL(host, path, key, id, token, secure)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, http.Header{})
	if err != nil {
		return nil, fmt.Errorf("conduit: dialing websocket %s: %w", wsURL, err)
	}

	return &wsConn{conn: conn}, nil
}

// send marshals and writes a Message over the WebSocket connection.
// It is safe for concurrent use.
func (ws *wsConn) send(msg Message) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	if ws.closed {
		return fmt.Errorf("conduit: websocket connection is closed")
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("conduit: marshaling message: %w", err)
	}

	if err := ws.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return fmt.Errorf("conduit: writing message: %w", err)
	}

	return nil
}

// readMessage reads and unmarshals the next Message from the WebSocket connection.
func (ws *wsConn) readMessage() (Message, error) {
	_, data, err := ws.conn.ReadMessage()
	if err != nil {
		return Message{}, fmt.Errorf("conduit: reading message: %w", err)
	}

	var msg Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return Message{}, fmt.Errorf("conduit: unmarshaling message: %w", err)
	}

	return msg, nil
}

// close performs a graceful WebSocket close handshake.
func (ws *wsConn) close() error {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	if ws.closed {
		return nil
	}
	ws.closed = true

	// Send a close message and then close the underlying connection.
	err := ws.conn.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "client closing"),
	)
	// Always close the connection, even if writing the close message fails.
	closeErr := ws.conn.Close()
	if err != nil {
		return err
	}
	return closeErr
}
