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
	}
}

// IsValid reports whether the MessageType is a recognized Conduit message type.
func (mt MessageType) IsValid() bool {
	switch mt {
	case MessageTypeOpen, MessageTypeLeave, MessageTypeCandidate,
		MessageTypeOffer, MessageTypeAnswer, MessageTypeExpire,
		MessageTypeHeartbeat, MessageTypeIDTaken, MessageTypeError,
		MessageTypeRelay, MessageTypeRelayOpen, MessageTypeRelayClose,
		MessageTypeGoAway:
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
type ErrorPayload struct {
	Msg string `json:"msg,omitempty"`
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
