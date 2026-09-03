package conduit

import (
	"errors"
	"fmt"
	"sync"
)

// ErrRoomClosed is returned by operations on a room this client has left.
var ErrRoomClosed = errors.New("conduit: room has been left")

// Room is a handle to a joined room.
//
// The member list mirrors what the server reports. It is a convenience for
// discovering peers to connect to, never an authority: the server decides who
// may do what, and a client that treated this list as permission would be
// trusting data it does not own.
//
// A Room is safe for concurrent use.
type Room struct {
	name   string
	client *Client

	mu      sync.RWMutex
	members map[string]struct{}
	open    bool
	closed  bool

	onPeerJoined func(peerID string)
	onPeerLeft   func(peerID string)
	onMessage    func(data any, from string)
	onClose      func()
}

func newRoom(name string, client *Client) *Room {
	return &Room{
		name:    name,
		client:  client,
		members: make(map[string]struct{}),
	}
}

// Name returns the room's name.
func (r *Room) Name() string {
	return r.name
}

// Members returns the peers currently in the room, excluding this one.
func (r *Room) Members() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	members := make([]string, 0, len(r.members))
	for id := range r.members {
		members = append(members, id)
	}
	return members
}

// Open reports whether the server has confirmed the join.
func (r *Room) Open() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.open
}

// OnPeerJoined sets the callback fired when another peer joins the room.
// It must be set before the room receives traffic.
func (r *Room) OnPeerJoined(fn func(peerID string)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.onPeerJoined = fn
}

// OnPeerLeft sets the callback fired when another peer leaves the room.
func (r *Room) OnPeerLeft(fn func(peerID string)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.onPeerLeft = fn
}

// OnMessage sets the callback fired when another member broadcasts.
func (r *Room) OnMessage(fn func(data any, from string)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.onMessage = fn
}

// OnClose sets the callback fired once this peer has left the room.
func (r *Room) OnClose(fn func()) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.onClose = fn
}

// Broadcast sends a message to the room's other members.
func (r *Room) Broadcast(data any) error {
	r.mu.RLock()
	closed := r.closed
	r.mu.RUnlock()
	if closed {
		return fmt.Errorf("%w: %s", ErrRoomClosed, r.name)
	}

	msg, err := NewMessage(MessageTypeRoomBroadcast, "", RoomBroadcastPayload{
		Room: r.name,
		Data: data,
	})
	if err != nil {
		return err
	}
	return r.client.Send(msg)
}

// Leave departs the room. The handle closes once the server confirms.
func (r *Room) Leave() error {
	r.mu.RLock()
	closed := r.closed
	r.mu.RUnlock()
	if closed {
		return nil
	}

	msg, err := NewMessage(MessageTypeLeaveRoom, "", LeaveRoomPayload{Room: r.name})
	if err != nil {
		return err
	}
	return r.client.Send(msg)
}

// -- internal, driven by the owning Client ---------------------------------

// setMembers applies the membership the server reported on join.
func (r *Room) setMembers(members []string) {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.members = make(map[string]struct{}, len(members))
	for _, id := range members {
		r.members[id] = struct{}{}
	}
	r.open = true
	r.mu.Unlock()
}

// peerJoined records an arrival and fires the callback outside the lock.
//
// A closed handle ignores it: a late notification must not resurrect state for
// a room this client has already left.
func (r *Room) peerJoined(peerID string) {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.members[peerID] = struct{}{}
	fn := r.onPeerJoined
	r.mu.Unlock()

	if fn != nil {
		fn(peerID)
	}
}

// peerLeft records a departure and fires the callback outside the lock.
func (r *Room) peerLeft(peerID string) {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	delete(r.members, peerID)
	fn := r.onPeerLeft
	r.mu.Unlock()

	if fn != nil {
		fn(peerID)
	}
}

// message delivers a broadcast from another member.
func (r *Room) message(data any, from string) {
	r.mu.RLock()
	if r.closed {
		r.mu.RUnlock()
		return
	}
	fn := r.onMessage
	r.mu.RUnlock()

	if fn != nil {
		fn(data, from)
	}
}

// close tears the handle down. Callbacks are cleared so a closed handle cannot
// keep an application's closures alive.
func (r *Room) close() {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.closed = true
	r.open = false
	r.members = make(map[string]struct{})
	fn := r.onClose
	r.onPeerJoined = nil
	r.onPeerLeft = nil
	r.onMessage = nil
	r.onClose = nil
	r.mu.Unlock()

	if fn != nil {
		fn()
	}
}
