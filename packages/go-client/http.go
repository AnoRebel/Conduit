package conduit

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// httpClient handles HTTP interactions with the Conduit signaling server.
type httpClient struct {
	baseURL    string
	key        string
	httpClient *http.Client
}

func newHTTPClient(host, path, key string, secure bool) *httpClient {
	scheme := "http"
	if secure {
		scheme = "https"
	}

	// Normalize path to ensure proper URL construction.
	path = normalizePath(path)

	baseURL := fmt.Sprintf("%s://%s%s", scheme, host, path)

	return &httpClient{
		baseURL:    baseURL,
		key:        key,
		httpClient: &http.Client{},
	}
}

// GetID requests a new client ID from the server.
func (h *httpClient) GetID(ctx context.Context) (string, error) {
	url := fmt.Sprintf("%s%s/id", h.baseURL, h.key)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("conduit: creating ID request: %w", err)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("conduit: requesting ID: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("conduit: server returned status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("conduit: reading ID response: %w", err)
	}

	id := strings.TrimSpace(string(body))
	if id == "" {
		return "", fmt.Errorf("conduit: server returned empty ID")
	}

	return id, nil
}

// ListConduits returns the list of connected peer IDs (requires discovery to be enabled on the server).
func (h *httpClient) ListConduits(ctx context.Context) ([]string, error) {
	url := fmt.Sprintf("%s%s/conduits", h.baseURL, h.key)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("conduit: creating conduits request: %w", err)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("conduit: requesting conduits: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("conduit: peer discovery is disabled on the server")
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("conduit: server returned status %d: %s", resp.StatusCode, string(body))
	}

	var peers []string
	if err := json.NewDecoder(resp.Body).Decode(&peers); err != nil {
		return nil, fmt.Errorf("conduit: decoding conduits response: %w", err)
	}

	return peers, nil
}

// normalizePath ensures a path ends with "/" for proper URL concatenation.
func normalizePath(path string) string {
	if path == "" {
		path = "/"
	}
	if !strings.HasSuffix(path, "/") {
		path += "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return path
}
