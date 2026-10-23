package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// invoke runs one initialized session that invokes an action with the given
// {action, payload} params and returns the reply's error, if any.
func invoke(params json.RawMessage) (any, error) {
	input := `{"jsonrpc":"2.0","id":"init","method":"plugin.initialize","params":{}}` + "\n" +
		`{"jsonrpc":"2.0","id":"call","method":"plugin.invoke","params":` + string(params) + "}\n"
	var output bytes.Buffer
	if err := run(strings.NewReader(input), &output); err != nil {
		return nil, err
	}
	for _, line := range strings.Split(strings.TrimSpace(output.String()), "\n") {
		var reply struct {
			ID     string          `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal([]byte(line), &reply) != nil || reply.ID != "call" {
			continue
		}
		if reply.Error != nil {
			return nil, errors.New(reply.Error.Message)
		}
		return reply.Result, nil
	}
	return nil, errors.New("no reply to invoke: " + output.String())
}

func TestRunLifecycleAndInvoke(t *testing.T) {
	input := strings.Join([]string{
		`{"jsonrpc":"2.0","id":"1","method":"plugin.initialize","params":{}}`,
		`{"jsonrpc":"2.0","id":"2","method":"plugin.ping","params":{}}`,
		`{"jsonrpc":"2.0","id":"3","method":"plugin.invoke","params":{"action":"greeting.create","payload":"{\"name\":\"MinCode\"}"}}`,
		`{"jsonrpc":"2.0","id":"4","method":"plugin.shutdown","params":{}}`,
	}, "\n") + "\n"
	var output bytes.Buffer

	if err := run(strings.NewReader(input), &output); err != nil {
		t.Fatalf("run returned error: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 4 {
		t.Fatalf("response count = %d, want 4: %s", len(lines), output.String())
	}
	var invokeResponse struct {
		Result struct {
			Message string `json:"message"`
			Runtime string `json:"runtime"`
		} `json:"result"`
	}
	if err := json.Unmarshal([]byte(lines[2]), &invokeResponse); err != nil {
		t.Fatalf("decode invoke response: %v", err)
	}
	if invokeResponse.Result.Message != "你好，MinCode！" || invokeResponse.Result.Runtime != "go" {
		t.Fatalf("unexpected invoke response: %+v", invokeResponse.Result)
	}
}

func TestInvokeRejectsUnknownActionAndEmptyName(t *testing.T) {
	for name, params := range map[string]json.RawMessage{
		"unknown action": json.RawMessage(`{"action":"missing","payload":"{}"}`),
		"empty name":     json.RawMessage(`{"action":"greeting.create","payload":"{\"name\":\"  \"}"}`),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := invoke(params); err == nil {
				t.Fatal("invoke returned nil error")
			}
		})
	}
}
