package conduit

import (
	"encoding/json"
	"sync"
	"testing"
)

// ---------------------------------------------------------------------------
// Message type parity
// ---------------------------------------------------------------------------

func TestGroupMessageTypes_AreValid(t *testing.T) {
	t.Parallel()

	group := []MessageType{
		MessageTypeJoin, MessageTypeLeaveRoom, MessageTypeRoomState,
		MessageTypePeerJoined, MessageTypePeerLeft,
		MessageTypeSubscribe, MessageTypeUnsubscribe,
		MessageTypeSubscribed, MessageTypeUnsubscribed,
		MessageTypePublish, MessageTypeTopicMessage, MessageTypeRoomBroadcast,
	}
	for _, mt := range group {
		if !mt.IsValid() {
			t.Errorf("expected %q to be valid", mt)
		}
	}
}

func TestLeaveAndLeaveRoom_AreDistinct(t *testing.T) {
	t.Parallel()

	// Overloading LEAVE would make an old client's message ambiguous to a new
	// server, so the two must never converge.
	if MessageTypeLeave == MessageTypeLeaveRoom {
		t.Fatal("LEAVE and LEAVE_ROOM must be distinct message types")
	}
}

// ---------------------------------------------------------------------------
// Wire format parity with the TypeScript client
// ---------------------------------------------------------------------------

func TestGroupPayloads_WireFormat(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		payload any
		want    string
	}{
		{"join", JoinPayload{Room: "lobby"}, `{"room":"lobby"}`},
		{"leaveRoom", LeaveRoomPayload{Room: "lobby"}, `{"room":"lobby"}`},
		{
			"roomState",
			RoomStatePayload{Room: "lobby", Members: []string{"a", "b"}},
			`{"room":"lobby","members":["a","b"]}`,
		},
		{
			"peerJoined",
			PeerJoinedPayload{Room: "lobby", PeerID: "a"},
			`{"room":"lobby","peerId":"a"}`,
		},
		{
			"peerLeft",
			PeerLeftPayload{Room: "lobby", PeerID: "a"},
			`{"room":"lobby","peerId":"a"}`,
		},
		{"subscribe", SubscribePayload{Topic: "chat.*"}, `{"topic":"chat.*"}`},
		{
			"publish",
			PublishPayload{Topic: "chat.general", Data: "hi"},
			`{"topic":"chat.general","data":"hi"}`,
		},
		{
			"publishSelf",
			PublishPayload{Topic: "chat", Data: 1, SelfDeliver: true},
			`{"topic":"chat","data":1,"selfDeliver":true}`,
		},
		{
			"topicMessage",
			TopicMessagePayload{Topic: "chat.general", Data: "hi"},
			`{"topic":"chat.general","data":"hi"}`,
		},
		{
			"roomBroadcast",
			RoomBroadcastPayload{Room: "lobby", Data: "hi"},
			`{"room":"lobby","data":"hi"}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := json.Marshal(tc.payload)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			if string(got) != tc.want {
				t.Errorf("wire format drift:\n  got  %s\n  want %s", got, tc.want)
			}
		})
	}
}

func TestGroupPayloads_RoundTrip(t *testing.T) {
	t.Parallel()

	// The shape the server actually emits.
	raw := `{"room":"lobby","members":["peer-b","peer-c"]}`
	var state RoomStatePayload
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if state.Room != "lobby" || len(state.Members) != 2 {
		t.Errorf("unexpected round trip: %+v", state)
	}
}

func TestErrorPayload_CarriesGroupContext(t *testing.T) {
	t.Parallel()

	raw := `{"msg":"Not permitted to join that room","room":"private"}`
	var ep ErrorPayload
	if err := json.Unmarshal([]byte(raw), &ep); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if ep.Room != "private" {
		t.Errorf("expected room context, got %q", ep.Room)
	}

	// A connection-level error carries no group context and stays fatal.
	var plain ErrorPayload
	if err := json.Unmarshal([]byte(`{"msg":"Invalid key provided"}`), &plain); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if plain.Room != "" || plain.Topic != "" {
		t.Errorf("expected no group context, got %+v", plain)
	}
}

// ---------------------------------------------------------------------------
// Pattern matching, mirroring the server rule
// ---------------------------------------------------------------------------

func TestPatternMatches(t *testing.T) {
	t.Parallel()

	cases := []struct {
		pattern string
		topic   string
		want    bool
	}{
		{"chat.general", "chat.general", true},
		{"chat.general", "chat.other", false},
		{"chat.*", "chat.general", true},
		{"chat.*", "chat.a.b", true},
		// A sibling namespace sharing a literal prefix must not match.
		{"chat.*", "chatter.general", false},
		{"chat.*", "chat", false},
		{"a.b.*", "a.b.c.d", true},
		{"a.b.*", "a.c.d", false},
	}

	for _, tc := range cases {
		if got := patternMatches(tc.pattern, tc.topic); got != tc.want {
			t.Errorf("patternMatches(%q, %q) = %v, want %v", tc.pattern, tc.topic, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// Room handle
// ---------------------------------------------------------------------------

func TestRoom_MembershipLifecycle(t *testing.T) {
	t.Parallel()

	room := newRoom("lobby", nil)

	room.setMembers([]string{"peer-b"})
	if !room.Open() {
		t.Error("expected room to be open after the server reported membership")
	}
	if len(room.Members()) != 1 {
		t.Errorf("expected 1 member, got %d", len(room.Members()))
	}

	var joined, left []string
	var mu sync.Mutex
	room.OnPeerJoined(func(id string) {
		mu.Lock()
		joined = append(joined, id)
		mu.Unlock()
	})
	room.OnPeerLeft(func(id string) {
		mu.Lock()
		left = append(left, id)
		mu.Unlock()
	})

	room.peerJoined("peer-c")
	room.peerLeft("peer-b")

	mu.Lock()
	defer mu.Unlock()
	if len(joined) != 1 || joined[0] != "peer-c" {
		t.Errorf("unexpected arrivals: %v", joined)
	}
	if len(left) != 1 || left[0] != "peer-b" {
		t.Errorf("unexpected departures: %v", left)
	}
	if members := room.Members(); len(members) != 1 || members[0] != "peer-c" {
		t.Errorf("unexpected membership: %v", members)
	}
}

func TestRoom_CloseReleasesCallbacks(t *testing.T) {
	t.Parallel()

	room := newRoom("lobby", nil)
	room.setMembers(nil)

	closed := false
	room.OnClose(func() { closed = true })
	room.OnPeerJoined(func(string) { t.Error("callback fired after close") })

	room.close()

	if !closed {
		t.Error("expected OnClose to fire")
	}
	if room.Open() {
		t.Error("expected a closed room to report not open")
	}
	// A closed handle must not keep an application's closures alive.
	room.peerJoined("peer-z")
	if len(room.Members()) != 0 {
		t.Error("expected a closed room to hold no members")
	}
}

func TestRoom_CloseIsIdempotent(t *testing.T) {
	t.Parallel()

	room := newRoom("lobby", nil)
	calls := 0
	room.OnClose(func() { calls++ })

	room.close()
	room.close()

	if calls != 1 {
		t.Errorf("expected OnClose once, got %d", calls)
	}
}

func TestRoom_BroadcastAfterLeaveFails(t *testing.T) {
	t.Parallel()

	room := newRoom("lobby", nil)
	room.close()

	if err := room.Broadcast("hi"); err == nil {
		t.Error("expected broadcasting on a left room to fail")
	}
}

// ---------------------------------------------------------------------------
// Topic handle
// ---------------------------------------------------------------------------

func TestTopic_Lifecycle(t *testing.T) {
	t.Parallel()

	topic := newTopic("chat.*", nil)
	if topic.Open() {
		t.Error("expected a new topic to be unconfirmed")
	}

	topic.confirm()
	if !topic.Open() {
		t.Error("expected confirmation to open the topic")
	}

	var got []string
	var mu sync.Mutex
	topic.OnMessage(func(_ any, name string, _ string) {
		mu.Lock()
		got = append(got, name)
		mu.Unlock()
	})

	topic.message("payload", "chat.general", "peer-b")

	mu.Lock()
	defer mu.Unlock()
	if len(got) != 1 || got[0] != "chat.general" {
		t.Errorf("unexpected deliveries: %v", got)
	}
}

func TestTopic_CloseReleasesCallbacks(t *testing.T) {
	t.Parallel()

	topic := newTopic("chat", nil)
	topic.confirm()
	topic.OnMessage(func(any, string, string) { t.Error("callback fired after close") })

	topic.close()
	topic.message("x", "chat", "peer-b")

	if topic.Open() {
		t.Error("expected a closed topic to report not open")
	}
}

// ---------------------------------------------------------------------------
// Client registries
// ---------------------------------------------------------------------------

func TestClient_MatchingTopics(t *testing.T) {
	t.Parallel()

	c := &Client{
		topics: map[string]*Topic{
			"chat.general": newTopic("chat.general", nil),
			"chat.*":       newTopic("chat.*", nil),
			"other":        newTopic("other", nil),
		},
	}

	// One published topic may match several subscriptions; each handle gets it.
	matched := c.matchingTopics("chat.general")
	if len(matched) != 2 {
		t.Errorf("expected 2 matching subscriptions, got %d", len(matched))
	}

	if got := c.matchingTopics("nothing.here"); len(got) != 0 {
		t.Errorf("expected no matches, got %d", len(got))
	}
}

func TestClient_ReleaseGroupsOnDisconnect(t *testing.T) {
	t.Parallel()

	room := newRoom("lobby", nil)
	topic := newTopic("chat", nil)
	c := &Client{
		rooms:  map[string]*Room{"lobby": room},
		topics: map[string]*Topic{"chat": topic},
	}

	roomClosed, topicClosed := false, false
	room.OnClose(func() { roomClosed = true })
	topic.OnClose(func() { topicClosed = true })

	c.releaseGroups()

	if !roomClosed || !topicClosed {
		t.Error("expected every handle to close on disconnect")
	}
	// Group state is server-side and is not restored on reconnect.
	if len(c.Rooms()) != 0 || len(c.Topics()) != 0 {
		t.Error("expected the registries to be empty after release")
	}
}

func TestClient_RouteGroupError(t *testing.T) {
	t.Parallel()

	room := newRoom("private", nil)
	c := &Client{rooms: map[string]*Room{"private": room}}

	if !c.routeGroupError(ErrorPayload{Msg: "denied", Room: "private"}) {
		t.Error("expected an error naming a room to be routed to its handle")
	}
	if len(c.Rooms()) != 0 {
		t.Error("expected the refused room to be dropped")
	}

	// An error with no group context is left to the connection-level path.
	if c.routeGroupError(ErrorPayload{Msg: "Invalid key provided"}) {
		t.Error("expected a context-free error not to be routed to a handle")
	}
}

func TestClient_ConcurrentGroupAccess(t *testing.T) {
	t.Parallel()

	c := &Client{
		rooms:  map[string]*Room{},
		topics: map[string]*Topic{},
	}
	c.rooms["lobby"] = newRoom("lobby", c)
	c.topics["chat"] = newTopic("chat", c)

	// Exercise the registries concurrently; `go test -race` is what makes this
	// meaningful.
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(3)
		go func() {
			defer wg.Done()
			_ = c.Rooms()
		}()
		go func() {
			defer wg.Done()
			_ = c.matchingTopics("chat")
		}()
		go func() {
			defer wg.Done()
			if r := c.room("lobby"); r != nil {
				r.peerJoined("peer-x")
				_ = r.Members()
			}
		}()
	}
	wg.Wait()
}
