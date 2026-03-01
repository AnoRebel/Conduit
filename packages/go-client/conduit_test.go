package conduit

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Message type tests
// ---------------------------------------------------------------------------

func TestMessageType_IsValid(t *testing.T) {
	t.Parallel()

	valid := []MessageType{
		MessageTypeOpen, MessageTypeLeave, MessageTypeCandidate,
		MessageTypeOffer, MessageTypeAnswer, MessageTypeExpire,
		MessageTypeHeartbeat, MessageTypeIDTaken, MessageTypeError,
		MessageTypeRelay, MessageTypeRelayOpen, MessageTypeRelayClose,
		MessageTypeGoAway,
	}
	for _, mt := range valid {
		if !mt.IsValid() {
			t.Errorf("expected %q to be valid", mt)
		}
	}

	invalid := MessageType("UNKNOWN")
	if invalid.IsValid() {
		t.Error("expected UNKNOWN to be invalid")
	}
}

func TestMessageType_String(t *testing.T) {
	t.Parallel()

	if s := MessageTypeOffer.String(); s != "OFFER" {
		t.Errorf("expected OFFER, got %q", s)
	}
}

func TestAllMessageTypes(t *testing.T) {
	t.Parallel()

	all := AllMessageTypes()
	if len(all) != 13 {
		t.Errorf("expected 13 message types, got %d", len(all))
	}
}

// ---------------------------------------------------------------------------
// Message serialization tests
// ---------------------------------------------------------------------------

func TestNewMessage(t *testing.T) {
	t.Parallel()

	payload := map[string]string{"sdp": "v=0\r\n..."}
	msg, err := NewMessage(MessageTypeOffer, "peer-1", payload)
	if err != nil {
		t.Fatalf("NewMessage error: %v", err)
	}

	if msg.Type != MessageTypeOffer {
		t.Errorf("expected type OFFER, got %s", msg.Type)
	}
	if msg.Dst != "peer-1" {
		t.Errorf("expected dst peer-1, got %s", msg.Dst)
	}
	if msg.Payload == nil {
		t.Fatal("expected non-nil payload")
	}

	var parsed map[string]string
	if err := json.Unmarshal(msg.Payload, &parsed); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if parsed["sdp"] != "v=0\r\n..." {
		t.Errorf("unexpected sdp value: %s", parsed["sdp"])
	}
}

func TestNewMessage_NilPayload(t *testing.T) {
	t.Parallel()

	msg, err := NewMessage(MessageTypeHeartbeat, "", nil)
	if err != nil {
		t.Fatalf("NewMessage error: %v", err)
	}
	if msg.Payload != nil {
		t.Error("expected nil payload for heartbeat")
	}
}

func TestMessage_MarshalJSON(t *testing.T) {
	t.Parallel()

	msg := Message{
		Type: MessageTypeHeartbeat,
		Src:  "client-1",
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if decoded["type"] != "HEARTBEAT" {
		t.Errorf("expected type HEARTBEAT, got %v", decoded["type"])
	}
	if decoded["src"] != "client-1" {
		t.Errorf("expected src client-1, got %v", decoded["src"])
	}
	// dst and payload should be omitted.
	if _, ok := decoded["dst"]; ok {
		t.Error("expected dst to be omitted")
	}
	if _, ok := decoded["payload"]; ok {
		t.Error("expected payload to be omitted")
	}
}

func TestMessage_ParsePayload(t *testing.T) {
	t.Parallel()

	raw, _ := json.Marshal(ErrorPayload{Msg: "rate limit exceeded"})
	msg := Message{
		Type:    MessageTypeError,
		Payload: raw,
	}

	var ep ErrorPayload
	if err := msg.ParsePayload(&ep); err != nil {
		t.Fatalf("ParsePayload error: %v", err)
	}
	if ep.Msg != "rate limit exceeded" {
		t.Errorf("expected 'rate limit exceeded', got %q", ep.Msg)
	}
}

func TestMessage_ParsePayload_Nil(t *testing.T) {
	t.Parallel()

	msg := Message{Type: MessageTypeOpen}
	var ep ErrorPayload
	if err := msg.ParsePayload(&ep); err != nil {
		t.Fatalf("ParsePayload on nil should not error: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Option tests
// ---------------------------------------------------------------------------

func TestDefaultOptions(t *testing.T) {
	t.Parallel()

	o := defaultOptions()
	if o.key != DefaultKey {
		t.Errorf("expected key %q, got %q", DefaultKey, o.key)
	}
	if o.path != DefaultPath {
		t.Errorf("expected path %q, got %q", DefaultPath, o.path)
	}
	if o.secure {
		t.Error("expected secure=false")
	}
	if o.heartbeatInterval != DefaultHeartbeatInterval {
		t.Errorf("expected heartbeat %v, got %v", DefaultHeartbeatInterval, o.heartbeatInterval)
	}
	if o.maxReconnectAttempts != DefaultMaxReconnectAttempts {
		t.Errorf("expected maxReconnect %d, got %d", DefaultMaxReconnectAttempts, o.maxReconnectAttempts)
	}
	if !o.autoReconnect {
		t.Error("expected autoReconnect=true")
	}
}

func TestWithOptions(t *testing.T) {
	t.Parallel()

	o := defaultOptions()
	WithKey("mykey")(&o)
	WithID("my-id")(&o)
	WithToken("tok123")(&o)
	WithPath("/mypath")(&o)
	WithSecure(true)(&o)
	WithHeartbeatInterval(5 * time.Second)(&o)
	WithMaxReconnectAttempts(10)(&o)
	WithReconnectBaseDelay(2 * time.Second)(&o)
	WithReconnectMaxDelay(60 * time.Second)(&o)
	WithAutoReconnect(false)(&o)

	if o.key != "mykey" {
		t.Errorf("expected key mykey, got %s", o.key)
	}
	if o.id != "my-id" {
		t.Errorf("expected id my-id, got %s", o.id)
	}
	if o.token != "tok123" {
		t.Errorf("expected token tok123, got %s", o.token)
	}
	if o.path != "/mypath" {
		t.Errorf("expected path /mypath, got %s", o.path)
	}
	if !o.secure {
		t.Error("expected secure=true")
	}
	if o.heartbeatInterval != 5*time.Second {
		t.Errorf("expected heartbeat 5s, got %v", o.heartbeatInterval)
	}
	if o.maxReconnectAttempts != 10 {
		t.Errorf("expected maxReconnect 10, got %d", o.maxReconnectAttempts)
	}
	if o.reconnectBaseDelay != 2*time.Second {
		t.Errorf("expected baseDelay 2s, got %v", o.reconnectBaseDelay)
	}
	if o.reconnectMaxDelay != 60*time.Second {
		t.Errorf("expected maxDelay 60s, got %v", o.reconnectMaxDelay)
	}
	if o.autoReconnect {
		t.Error("expected autoReconnect=false")
	}
}

// ---------------------------------------------------------------------------
// Client constructor tests
// ---------------------------------------------------------------------------

func TestNew_EmptyHost(t *testing.T) {
	t.Parallel()

	_, err := New("")
	if err == nil {
		t.Fatal("expected error for empty host")
	}
}

func TestNew_WithDefaults(t *testing.T) {
	t.Parallel()

	c, err := New("localhost:9000")
	if err != nil {
		t.Fatalf("New error: %v", err)
	}
	if c.host != "localhost:9000" {
		t.Errorf("expected host localhost:9000, got %s", c.host)
	}
	if c.opts.key != "conduit" {
		t.Errorf("expected key conduit, got %s", c.opts.key)
	}
}

func TestNew_WithOptions(t *testing.T) {
	t.Parallel()

	c, err := New("example.com:443",
		WithKey("mykey"),
		WithSecure(true),
		WithPath("/signal"),
	)
	if err != nil {
		t.Fatalf("New error: %v", err)
	}
	if c.opts.key != "mykey" {
		t.Errorf("expected key mykey, got %s", c.opts.key)
	}
	if !c.opts.secure {
		t.Error("expected secure=true")
	}
	if c.opts.path != "/signal" {
		t.Errorf("expected path /signal, got %s", c.opts.path)
	}
}

// ---------------------------------------------------------------------------
// HTTP client tests
// ---------------------------------------------------------------------------

func TestHTTPClient_GetID(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/conduit/id" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		fmt.Fprint(w, "test-id-123")
	}))
	defer srv.Close()

	hc := newHTTPClient(strings.TrimPrefix(srv.URL, "http://"), "/", "conduit", false)

	id, err := hc.GetID(context.Background())
	if err != nil {
		t.Fatalf("GetID error: %v", err)
	}
	if id != "test-id-123" {
		t.Errorf("expected id test-id-123, got %s", id)
	}
}

func TestHTTPClient_GetID_ServerError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "internal error")
	}))
	defer srv.Close()

	hc := newHTTPClient(strings.TrimPrefix(srv.URL, "http://"), "/", "conduit", false)

	_, err := hc.GetID(context.Background())
	if err == nil {
		t.Fatal("expected error for server error")
	}
}

func TestHTTPClient_ListConduits(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/conduit/conduits" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]string{"peer-1", "peer-2"})
	}))
	defer srv.Close()

	hc := newHTTPClient(strings.TrimPrefix(srv.URL, "http://"), "/", "conduit", false)

	peers, err := hc.ListConduits(context.Background())
	if err != nil {
		t.Fatalf("ListConduits error: %v", err)
	}
	if len(peers) != 2 {
		t.Fatalf("expected 2 peers, got %d", len(peers))
	}
	if peers[0] != "peer-1" || peers[1] != "peer-2" {
		t.Errorf("unexpected peers: %v", peers)
	}
}

func TestHTTPClient_ListConduits_Disabled(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Conduit discovery is disabled"})
	}))
	defer srv.Close()

	hc := newHTTPClient(strings.TrimPrefix(srv.URL, "http://"), "/", "conduit", false)

	_, err := hc.ListConduits(context.Background())
	if err == nil {
		t.Fatal("expected error when discovery disabled")
	}
}

// ---------------------------------------------------------------------------
// WebSocket URL building tests
// ---------------------------------------------------------------------------

func TestBuildWSURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		host     string
		path     string
		key      string
		id       string
		token    string
		secure   bool
		contains []string
	}{
		{
			name:     "basic ws",
			host:     "localhost:9000",
			path:     "/",
			key:      "conduit",
			id:       "client-1",
			token:    "tok",
			secure:   false,
			contains: []string{"ws://localhost:9000/conduit?", "key=conduit", "id=client-1", "token=tok"},
		},
		{
			name:     "secure wss",
			host:     "example.com",
			path:     "/signal",
			key:      "mykey",
			id:       "c2",
			token:    "",
			secure:   true,
			contains: []string{"wss://example.com/signal/conduit?", "key=mykey", "id=c2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			url := buildWSURL(tt.host, tt.path, tt.key, tt.id, tt.token, tt.secure)
			for _, substr := range tt.contains {
				if !strings.Contains(url, substr) {
					t.Errorf("URL %q does not contain %q", url, substr)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Path normalization tests
// ---------------------------------------------------------------------------

func TestNormalizePath(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input    string
		expected string
	}{
		{"", "/"},
		{"/", "/"},
		{"/path", "/path/"},
		{"/path/", "/path/"},
		{"path", "/path/"},
		{"path/", "/path/"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			t.Parallel()
			result := normalizePath(tt.input)
			if result != tt.expected {
				t.Errorf("normalizePath(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Backoff delay tests
// ---------------------------------------------------------------------------

func TestBackoffDelay(t *testing.T) {
	t.Parallel()

	c := &Client{
		opts: options{
			reconnectBaseDelay: 1 * time.Second,
			reconnectMaxDelay:  30 * time.Second,
		},
	}

	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{0, 1 * time.Second},
		{1, 2 * time.Second},
		{2, 4 * time.Second},
		{3, 8 * time.Second},
		{4, 16 * time.Second},
		{5, 30 * time.Second}, // Capped at max.
		{6, 30 * time.Second}, // Still capped.
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("attempt_%d", tt.attempt), func(t *testing.T) {
			t.Parallel()
			d := c.backoffDelay(tt.attempt)
			if d != tt.expected {
				t.Errorf("backoffDelay(%d) = %v, want %v", tt.attempt, d, tt.expected)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Integration-style test with a mock WebSocket server
// ---------------------------------------------------------------------------

// upgrader for test server with permissive origin check.
var testUpgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

func TestClient_ConnectAndReceiveMessages(t *testing.T) {
	t.Parallel()

	// Set up a mock Conduit server.
	mux := http.NewServeMux()

	// HTTP ID endpoint.
	mux.HandleFunc("/conduit/id", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, "test-client-id")
	})

	// WebSocket endpoint.
	mux.HandleFunc("/conduit", func(w http.ResponseWriter, r *http.Request) {
		conn, err := testUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("ws upgrade error: %v", err)
			return
		}
		defer conn.Close()

		// Send OPEN message.
		openMsg, _ := json.Marshal(Message{Type: MessageTypeOpen})
		if err := conn.WriteMessage(websocket.TextMessage, openMsg); err != nil {
			return
		}

		// Send a test OFFER message.
		offerPayload, _ := json.Marshal(map[string]string{"sdp": "test-sdp"})
		offerMsg, _ := json.Marshal(Message{
			Type:    MessageTypeOffer,
			Src:     "peer-1",
			Dst:     "test-client-id",
			Payload: offerPayload,
		})
		if err := conn.WriteMessage(websocket.TextMessage, offerMsg); err != nil {
			return
		}

		// Read heartbeat from client (or any message).
		_, _, err = conn.ReadMessage()
		if err != nil {
			// Client may have disconnected, that's fine.
			return
		}
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")

	client, err := New(host,
		WithKey("conduit"),
		WithPath("/"),
		WithSecure(false),
		WithAutoReconnect(false),
		WithHeartbeatInterval(100*time.Millisecond),
	)
	if err != nil {
		t.Fatalf("New error: %v", err)
	}
	defer client.Close()

	openCh := make(chan string, 1)
	msgCh := make(chan Message, 10)
	errCh := make(chan error, 10)

	client.OnOpen(func(id string) {
		select {
		case openCh <- id:
		default:
		}
	})

	client.OnMessage(func(msg Message) {
		select {
		case msgCh <- msg:
		default:
		}
	})

	client.OnError(func(err error) {
		select {
		case errCh <- err:
		default:
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect error: %v", err)
	}

	// Verify OPEN callback.
	select {
	case id := <-openCh:
		if id != "test-client-id" {
			t.Errorf("expected id test-client-id, got %s", id)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for OPEN callback")
	}

	// Verify ID() method.
	if client.ID() != "test-client-id" {
		t.Errorf("expected ID() = test-client-id, got %s", client.ID())
	}

	// Verify Connected() method.
	if !client.Connected() {
		t.Error("expected Connected() = true")
	}

	// Verify we received the OFFER message.
	select {
	case msg := <-msgCh:
		if msg.Type != MessageTypeOffer {
			t.Errorf("expected OFFER message, got %s", msg.Type)
		}
		if msg.Src != "peer-1" {
			t.Errorf("expected src peer-1, got %s", msg.Src)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for OFFER message")
	}
}

func TestClient_SendNotConnected(t *testing.T) {
	t.Parallel()

	c, err := New("localhost:9000")
	if err != nil {
		t.Fatalf("New error: %v", err)
	}

	msg, _ := NewMessage(MessageTypeOffer, "peer-1", nil)
	if err := c.Send(msg); err == nil {
		t.Error("expected error when sending while not connected")
	}
}

// ---------------------------------------------------------------------------
// MarshalMessage tests
// ---------------------------------------------------------------------------

func TestMarshalMessage(t *testing.T) {
	t.Parallel()

	raw, err := MarshalMessage(map[string]int{"count": 42})
	if err != nil {
		t.Fatalf("MarshalMessage error: %v", err)
	}

	var parsed map[string]int
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if parsed["count"] != 42 {
		t.Errorf("expected count=42, got %d", parsed["count"])
	}
}
