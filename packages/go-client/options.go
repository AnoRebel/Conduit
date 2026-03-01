package conduit

import "time"

const (
	// DefaultKey is the default API key for Conduit server connections.
	DefaultKey = "conduit"
	// DefaultPath is the default URL path prefix for the Conduit server.
	DefaultPath = "/"
	// DefaultHeartbeatInterval is the default interval between heartbeat messages.
	DefaultHeartbeatInterval = 10 * time.Second
	// DefaultMaxReconnectAttempts is the default maximum number of reconnection attempts.
	DefaultMaxReconnectAttempts = 5
	// DefaultReconnectBaseDelay is the default base delay between reconnection attempts.
	DefaultReconnectBaseDelay = 1 * time.Second
	// DefaultReconnectMaxDelay is the default maximum delay between reconnection attempts.
	DefaultReconnectMaxDelay = 30 * time.Second
)

// options holds the configuration for a Conduit client.
type options struct {
	key                  string
	id                   string
	token                string
	path                 string
	secure               bool
	heartbeatInterval    time.Duration
	maxReconnectAttempts int
	reconnectBaseDelay   time.Duration
	reconnectMaxDelay    time.Duration
	autoReconnect        bool
}

func defaultOptions() options {
	return options{
		key:                  DefaultKey,
		path:                 DefaultPath,
		secure:               false,
		heartbeatInterval:    DefaultHeartbeatInterval,
		maxReconnectAttempts: DefaultMaxReconnectAttempts,
		reconnectBaseDelay:   DefaultReconnectBaseDelay,
		reconnectMaxDelay:    DefaultReconnectMaxDelay,
		autoReconnect:        true,
	}
}

// Option configures a Conduit client. Use the With* functions to create options.
type Option func(*options)

// WithKey sets the API key for server authentication.
// Default: "conduit".
func WithKey(key string) Option {
	return func(o *options) {
		o.key = key
	}
}

// WithID sets a specific client ID. If not set, the server assigns one.
func WithID(id string) Option {
	return func(o *options) {
		o.id = id
	}
}

// WithToken sets the authentication token for the connection.
func WithToken(token string) Option {
	return func(o *options) {
		o.token = token
	}
}

// WithPath sets the URL path prefix for the Conduit server.
// Default: "/".
func WithPath(path string) Option {
	return func(o *options) {
		o.path = path
	}
}

// WithSecure enables TLS (wss:// and https://) for all connections.
// Default: false.
func WithSecure(secure bool) Option {
	return func(o *options) {
		o.secure = secure
	}
}

// WithHeartbeatInterval sets the interval between heartbeat messages.
// Default: 10 seconds.
func WithHeartbeatInterval(d time.Duration) Option {
	return func(o *options) {
		o.heartbeatInterval = d
	}
}

// WithMaxReconnectAttempts sets the maximum number of reconnection attempts.
// Set to 0 to disable reconnection. Default: 5.
func WithMaxReconnectAttempts(n int) Option {
	return func(o *options) {
		o.maxReconnectAttempts = n
	}
}

// WithReconnectBaseDelay sets the base delay for exponential backoff reconnection.
// Default: 1 second.
func WithReconnectBaseDelay(d time.Duration) Option {
	return func(o *options) {
		o.reconnectBaseDelay = d
	}
}

// WithReconnectMaxDelay sets the maximum delay between reconnection attempts.
// Default: 30 seconds.
func WithReconnectMaxDelay(d time.Duration) Option {
	return func(o *options) {
		o.reconnectMaxDelay = d
	}
}

// WithAutoReconnect enables or disables automatic reconnection on disconnect.
// Default: true.
func WithAutoReconnect(enabled bool) Option {
	return func(o *options) {
		o.autoReconnect = enabled
	}
}
