// Command mincode-vue-go-plugin is the process backend of the Vue + Go plugin
// template. MinCode starts it, talks newline-delimited JSON-RPC 2.0 over
// stdin/stdout (runtime protocol v1) and stops it with plugin.shutdown.
//
// The protocol loop itself — framing, request ids, plugin.initialize /
// plugin.ping / plugin.shutdown, concurrency limits, reverse host requests —
// comes from the MinCode Go plugin SDK (github.com/mincodeai/plugin-sdk-go), vendored
// under third_party/plugin-sdk-go. A plugin only supplies Options and a
// Handler for its actions, so this file is mostly your business logic.
//
// Rules worth remembering:
//   - stdout carries protocol messages only. Log diagnostics to stderr.
//   - Every action the UI calls must be declared in plugin.template.json
//     (contributes.actions, with uiCallable: true).
//   - Keep results small (one message is at most 1 MiB); page large data.
package main

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mincodeai/plugin-sdk-go/jsonx"
	"github.com/mincodeai/plugin-sdk-go/rpc"
)

// actions maps each action name to its implementation. Add an entry here and
// declare the action in plugin.template.json to expose a new operation.
var actions = map[string]func(ctx context.Context, payload json.RawMessage) (any, error){
	"greeting.create": createGreeting,
}

// options configures the SDK. StrictDefaults is the preset for new Go
// plugins: strict JSON lines, "jsonrpc":"2.0" required, invalid lines
// answered with -32700, invokes accepted only after plugin.initialize, and
// invoke params shaped {action, payload: "<JSON text>"}.
func options() rpc.Options {
	o := rpc.StrictDefaults("vue-go-plugin")
	// Written to stderr when the transport fails (e.g. stdout closed).
	o.FatalMessage = "vue-go plugin transport failed"
	// At most 8 invokes run concurrently; the rest are rejected with -32029.
	o.MaxInflight = 8
	o.Busy = rpc.NewError(rpc.CodeBusy, "too many concurrent requests, retry later")
	o.MethodNotFound = "method not found"
	o.InvalidParams = rpc.NewError(rpc.CodeInvalidParams, "invalid invoke parameters")
	// Unknown actions are rejected before the handler runs.
	o.KnownAction = func(action string) bool { _, ok := actions[action]; return ok }
	o.UnknownAction = func(string) *rpc.Error { return rpc.NewError(rpc.CodeInvalidParams, "unknown action") }
	// On plugin.shutdown (or EOF) let running invokes finish and answer them
	// before the shutdown reply. Set o.OnClose to release long-lived
	// resources (connections, watchers) once in-flight work has drained.
	o.DrainReplies = true
	// Handler receives the action name and its JSON object payload. Return a
	// value to reply with it (marshalled with encoding/json), an *rpc.Error
	// for an exact error code/message, or any other error for -32000.
	// host.FromContext(ctx).Call(...) sends reverse requests such as
	// host.storage.get when the manifest grants the capability.
	o.Handler = func(ctx context.Context, action string, payload json.RawMessage) (any, error) {
		return actions[action](ctx, payload)
	}
	return o
}

func main() {
	// rpc.Main serves stdin/stdout until plugin.shutdown, EOF or SIGINT/SIGTERM.
	rpc.Main(options())
}

// run serves one session on the given streams (handy in tests).
func run(input io.Reader, output io.Writer) error {
	return rpc.Serve(context.Background(), input, output, os.Stderr, options())
}

type greetingPayload struct {
	Name string `json:"name"`
}

func createGreeting(_ context.Context, raw json.RawMessage) (any, error) {
	var payload greetingPayload
	// Strict decoding rejects duplicate keys, unknown fields and wrong types,
	// so the UI and backend cannot silently disagree about the payload shape.
	if err := jsonx.DecodeObject(raw, &payload, jsonx.DecodeOptions{Strict: true, DisallowUnknown: true}); err != nil {
		return nil, rpc.NewError(rpc.CodeInvalidParams, "payload must be a JSON object {name}")
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		return nil, rpc.NewError(rpc.CodeInvalidParams, "name is required")
	}
	if utf8.RuneCountInString(name) > 80 {
		return nil, rpc.NewError(rpc.CodeInvalidParams, "name exceeds 80 characters")
	}
	return map[string]any{
		"message":    "你好，" + name + "！",
		"receivedAt": time.Now().UTC().Format(time.RFC3339),
		"runtime":    "go",
	}, nil
}
