package conduit

import (
	"strings"
	"sync"
)

// Topic is a handle to a topic subscription.
//
// The pattern may be an exact topic name or a namespace prefix ending in ".*".
// A Topic is safe for concurrent use.
type Topic struct {
	pattern string
	client  *Client

	mu     sync.RWMutex
	open   bool
	closed bool

	onMessage func(data any, topic string, from string)
	onClose   func()
}

func newTopic(pattern string, client *Client) *Topic {
	return &Topic{pattern: pattern, client: client}
}

// Pattern returns the subscribed topic name or prefix pattern.
func (t *Topic) Pattern() string {
	return t.pattern
}

// Open reports whether the server has confirmed the subscription.
func (t *Topic) Open() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.open
}

// OnMessage sets the callback fired for each matching publication. The topic
// passed to it is the concrete published name, not the pattern that matched.
func (t *Topic) OnMessage(fn func(data any, topic string, from string)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onMessage = fn
}

// OnClose sets the callback fired once the subscription is removed.
func (t *Topic) OnClose(fn func()) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onClose = fn
}

// Unsubscribe stops delivery on this subscription.
func (t *Topic) Unsubscribe() error {
	t.mu.RLock()
	closed := t.closed
	t.mu.RUnlock()
	if closed {
		return nil
	}

	msg, err := NewMessage(MessageTypeUnsubscribe, "", SubscribePayload{Topic: t.pattern})
	if err != nil {
		return err
	}
	return t.client.Send(msg)
}

// -- internal, driven by the owning Client ---------------------------------

func (t *Topic) confirm() {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return
	}
	t.open = true
	t.mu.Unlock()
}

func (t *Topic) message(data any, topic string, from string) {
	t.mu.RLock()
	if t.closed {
		t.mu.RUnlock()
		return
	}
	fn := t.onMessage
	t.mu.RUnlock()

	if fn != nil {
		fn(data, topic, from)
	}
}

func (t *Topic) close() {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return
	}
	t.closed = true
	t.open = false
	fn := t.onClose
	t.onMessage = nil
	t.onClose = nil
	t.mu.Unlock()

	if fn != nil {
		fn()
	}
}

// patternMatches reports whether a subscription pattern matches a published
// topic.
//
// Mirrors the server's rule: an exact name, or a namespace prefix ending in
// ".*". Applied client-side only to route one delivered copy to every matching
// handle; the server has already decided what this peer receives.
func patternMatches(pattern, topic string) bool {
	if pattern == topic {
		return true
	}
	if !strings.HasSuffix(pattern, ".*") {
		return false
	}
	// Keep the dot so "chat.*" matches "chat.general" but not "chatter.general".
	return strings.HasPrefix(topic, pattern[:len(pattern)-1])
}
