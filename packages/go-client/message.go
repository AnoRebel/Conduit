package conduit

import "encoding/json"

// MessageType represents the signaling message types used by the Conduit protocol.
type MessageType string

const (
	// MessageTypeOpen indicates the server confirmed the connection is open.
	MessageTypeOpen MessageType = "OPEN"
	// MessageTypeLeave indicates a peer is leaving/disconnecting.
	MessageTypeLeave MessageType = "LEAVE"
	// MessageTypeCandidate carries an ICE candidate for peer connection negotiation.
	MessageTypeCandidate MessageType = "CANDIDATE"
	// MessageTypeOffer carries an SDP offer for connection negotiation.
	MessageTypeOffer MessageType = "OFFER"
	// MessageTypeAnswer carries an SDP answer for connection negotiation.
	MessageTypeAnswer MessageType = "ANSWER"
	// MessageTypeExpire indicates a message or offer has expired.
	MessageTypeExpire MessageType = "EXPIRE"
	// MessageTypeHeartbeat is a keep-alive ping sent periodically by the client.
	MessageTypeHeartbeat MessageType = "HEARTBEAT"
	// MessageTypeIDTaken indicates the requested client ID is already in use.
	MessageTypeIDTaken MessageType = "ID-TAKEN"
	// MessageTypeError carries a generic error from the server.
	MessageTypeError MessageType = "ERROR"
	// MessageTypeRelay carries data relayed through the server (WebSocket fallback).
	MessageTypeRelay MessageType = "RELAY"
	// MessageTypeRelayOpen indicates a WebSocket relay channel was established.
	MessageTypeRelayOpen MessageType = "RELAY_OPEN"
	// MessageTypeRelayClose indicates a WebSocket relay channel was closed.
	MessageTypeRelayClose MessageType = "RELAY_CLOSE"
	// MessageTypeGoAway indicates the server is shutting down gracefully.
	MessageTypeGoAway MessageType = "GOAWAY"

	// MessageTypeJoin requests membership of a named room.
	MessageTypeJoin MessageType = "JOIN"
	// MessageTypeLeaveRoom requests departure from a named room. Distinct from
	// MessageTypeLeave, which remains peer-to-peer.
	MessageTypeLeaveRoom MessageType = "LEAVE_ROOM"
	// MessageTypeRoomState carries a room's membership to a peer that just joined.
	MessageTypeRoomState MessageType = "ROOM_STATE"
	// MessageTypePeerJoined announces that a peer joined a shared room.
	MessageTypePeerJoined MessageType = "PEER_JOINED"
	// MessageTypePeerLeft announces that a peer left a shared room.
	MessageTypePeerLeft MessageType = "PEER_LEFT"

	// MessageTypeSubscribe requests a subscription to a topic or prefix pattern.
	MessageTypeSubscribe MessageType = "SUBSCRIBE"
	// MessageTypeUnsubscribe removes a subscription.
	MessageTypeUnsubscribe MessageType = "UNSUBSCRIBE"
	// MessageTypeSubscribed confirms a recorded subscription.
	MessageTypeSubscribed MessageType = "SUBSCRIBED"
	// MessageTypeUnsubscribed confirms a removed subscription.
	MessageTypeUnsubscribed MessageType = "UNSUBSCRIBED"
	// MessageTypePublish publishes a message to a topic.
	MessageTypePublish MessageType = "PUBLISH"
	// MessageTypeTopicMessage carries a publication to a matching subscriber.
	MessageTypeTopicMessage MessageType = "TOPIC_MESSAGE"
	// MessageTypeRoomBroadcast multicasts a message to a room's members.
	MessageTypeRoomBroadcast MessageType = "ROOM_BROADCAST"
)

// AllMessageTypes returns all valid MessageType values.
func AllMessageTypes() []MessageType {
	return []MessageType{
		MessageTypeOpen,
		MessageTypeLeave,
		MessageTypeCandidate,
		MessageTypeOffer,
		MessageTypeAnswer,
		MessageTypeExpire,
		MessageTypeHeartbeat,
		MessageTypeIDTaken,
		MessageTypeError,
		MessageTypeRelay,
		MessageTypeRelayOpen,
		MessageTypeRelayClose,
		MessageTypeGoAway,
		MessageTypeJoin,
		MessageTypeLeaveRoom,
		MessageTypeRoomState,
		MessageTypePeerJoined,
		MessageTypePeerLeft,
		MessageTypeSubscribe,
		MessageTypeUnsubscribe,
		MessageTypeSubscribed,
		MessageTypeUnsubscribed,
		MessageTypePublish,
		MessageTypeTopicMessage,
		MessageTypeRoomBroadcast,
	}
}

// IsValid reports whether the MessageType is a recognized Conduit message type.
func (mt MessageType) IsValid() bool {
	switch mt {
	case MessageTypeOpen, MessageTypeLeave, MessageTypeCandidate,
		MessageTypeOffer, MessageTypeAnswer, MessageTypeExpire,
		MessageTypeHeartbeat, MessageTypeIDTaken, MessageTypeError,
		MessageTypeRelay, MessageTypeRelayOpen, MessageTypeRelayClose,
		MessageTypeGoAway,
		MessageTypeJoin, MessageTypeLeaveRoom, MessageTypeRoomState,
		MessageTypePeerJoined, MessageTypePeerLeft,
		MessageTypeSubscribe, MessageTypeUnsubscribe,
		MessageTypeSubscribed, MessageTypeUnsubscribed,
		MessageTypePublish, MessageTypeTopicMessage, MessageTypeRoomBroadcast:
		return true
	default:
		return false
	}
}

// String returns the string representation of the MessageType.
func (mt MessageType) String() string {
	return string(mt)
}

// Message represents a signaling message exchanged between client and server.
type Message struct {
	// Type is the message type (e.g., OFFER, ANSWER, CANDIDATE).
	Type MessageType `json:"type"`
	// Src is the sender's client ID (set by the server for incoming messages).
	Src string `json:"src,omitempty"`
	// Dst is the recipient's client ID.
	Dst string `json:"dst,omitempty"`
	// Payload carries type-specific data as raw JSON.
	Payload json.RawMessage `json:"payload,omitempty"`
}

// OpenPayload is the payload for OPEN messages from the server.
type OpenPayload struct {
	ID string `json:"id,omitempty"`
}

// ErrorPayload is the payload for ERROR messages from the server.
//
// Room and Topic name the subject of the failure when the server knows it,
// which lets a client attribute the error to one room or subscription rather
// than treating every server error as fatal to the whole connection.
type ErrorPayload struct {
	Msg   string `json:"msg,omitempty"`
	Room  string `json:"room,omitempty"`
	Topic string `json:"topic,omitempty"`
}

// HeartbeatPayload is the payload for HEARTBEAT messages.
type HeartbeatPayload struct {
	Timestamp int64 `json:"timestamp,omitempty"`
}

// GoAwayPayload is the payload for GOAWAY messages from the server.
type GoAwayPayload struct {
	Msg            string `json:"msg,omitempty"`
	Reason         string `json:"reason,omitempty"`
	ReconnectDelay int    `json:"reconnectDelay,omitempty"`
}

// LeavePayload is the payload for LEAVE messages.
type LeavePayload struct {
	PeerID string `json:"peerId,omitempty"`
}

// RelayPayload is the payload for RELAY messages.
type RelayPayload struct {
	ConnectionID string `json:"connectionId"`
	Data         any    `json:"data"`
}

// RelayControlPayload is the payload for RELAY_OPEN and RELAY_CLOSE messages.
type RelayControlPayload struct {
	ConnectionID string `json:"connectionId"`
}

// JoinPayload is the payload for JOIN messages.
type JoinPayload struct {
	Room string `json:"room"`
}

// LeaveRoomPayload is the payload for LEAVE_ROOM messages.
type LeaveRoomPayload struct {
	Room string `json:"room"`
}

// RoomStatePayload is the payload for ROOM_STATE messages. Members never
// includes the receiving peer.
type RoomStatePayload struct {
	Room    string   `json:"room"`
	Members []string `json:"members"`
}

// PeerJoinedPayload is the payload for PEER_JOINED messages.
type PeerJoinedPayload struct {
	Room   string `json:"room"`
	PeerID string `json:"peerId"`
}

// PeerLeftPayload is the payload for PEER_LEFT messages.
type PeerLeftPayload struct {
	Room   string `json:"room"`
	PeerID string `json:"peerId"`
}

// SubscribePayload is the payload for SUBSCRIBE, UNSUBSCRIBE, SUBSCRIBED and
// UNSUBSCRIBED messages. Topic is an exact name or a prefix pattern ending in
// ".*".
type SubscribePayload struct {
	Topic string `json:"topic"`
}

// PublishPayload is the payload for PUBLISH messages.
type PublishPayload struct {
	Topic string `json:"topic"`
	Data  any    `json:"data"`
	// SelfDeliver requests a copy back when the publisher also holds a matching
	// subscription.
	SelfDeliver bool `json:"selfDeliver,omitempty"`
}

// TopicMessagePayload is the payload for TOPIC_MESSAGE messages. Topic is the
// concrete published topic, not the pattern that matched it.
type TopicMessagePayload struct {
	Topic string `json:"topic"`
	Data  any    `json:"data"`
}

// RoomBroadcastPayload is the payload for ROOM_BROADCAST messages.
type RoomBroadcastPayload struct {
	Room string `json:"room"`
	Data any    `json:"data"`
}

// NewMessage creates a new Message with the given type, destination, and payload.
// The payload is marshaled to JSON. If payload is nil, the Payload field is omitted.
func NewMessage(msgType MessageType, dst string, payload any) (Message, error) {
	msg := Message{
		Type: msgType,
		Dst:  dst,
	}

	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return Message{}, err
		}
		msg.Payload = data
	}

	return msg, nil
}

// ParsePayload unmarshals the message payload into the provided destination.
func (m *Message) ParsePayload(dst any) error {
	if m.Payload == nil {
		return nil
	}
	return json.Unmarshal(m.Payload, dst)
}
