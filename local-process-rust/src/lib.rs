//! Minimal JSONL runtime example, not a full MinCode SDK. No optional features
//! are negotiated. Keep all logging on stderr and all actions bounded.
use serde_json::{json, Value};
use std::io::{self, BufRead};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

pub const MAX_LINE_BYTES: usize = 1024 * 1024;
pub enum Frame {
    Json(Vec<u8>),
    TooLarge,
    Eof,
}

// Drain oversized lines without allocating their full size, then recover at
// the next newline. Invalid UTF-8 is rejected by serde_json::from_slice.
pub fn read_frame(input: &mut impl BufRead, limit: usize) -> io::Result<Frame> {
    let mut bytes = Vec::new();
    let mut oversized = false;
    loop {
        let chunk = input.fill_buf()?;
        if chunk.is_empty() {
            return Ok(if oversized {
                Frame::TooLarge
            } else if bytes.is_empty() {
                Frame::Eof
            } else {
                Frame::Json(bytes)
            });
        }
        let end = chunk.iter().position(|byte| *byte == b'\n');
        let length = end.unwrap_or(chunk.len());
        if !oversized {
            if bytes.len().saturating_add(length) > limit {
                oversized = true;
                bytes.clear();
            } else {
                bytes.extend_from_slice(&chunk[..length]);
            }
        }
        input.consume(length + usize::from(end.is_some()));
        if end.is_some() {
            return Ok(if oversized {
                Frame::TooLarge
            } else {
                Frame::Json(bytes)
            });
        }
    }
}

pub fn error(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
fn success(id: Value, result: Value) -> Value {
    json!({"jsonrpc":"2.0","id":id,"result":result})
}

#[derive(Default)]
pub struct Dispatch {
    pub response: Option<Value>,
    pub job: Option<Job>,
    pub shutdown: bool,
}
pub struct Job {
    id: Value,
    name: String,
    busy: Arc<AtomicBool>,
}
impl Job {
    pub fn run(self) -> Value {
        success(
            self.id.clone(),
            json!({"message":format!("Hello, {}!", self.name)}),
        )
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        self.busy.store(false, Ordering::Release);
    }
}

pub struct Runtime {
    id: String,
    version: String,
    initialized: bool,
    busy: Arc<AtomicBool>,
}
impl Runtime {
    pub fn new(id: String, version: String) -> Self {
        Self {
            id,
            version,
            initialized: false,
            busy: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn dispatch(&mut self, message: Value) -> Dispatch {
        let raw_id = message.get("id").cloned().unwrap_or(Value::Null);
        // JSON-RPC 2.0: an id is a string, a number or null; anything else is echoed as null.
        let id = if raw_id.is_null() || raw_id.is_string() || raw_id.is_number() {
            raw_id
        } else {
            Value::Null
        };
        let fail = |code, text| Dispatch {
            response: Some(error(id.clone(), code, text)),
            ..Dispatch::default()
        };
        // A message without a method is a (possibly malformed) response; never answer it.
        if message.is_object() && message.get("method").is_none() {
            return Dispatch::default();
        }
        if !message.is_object()
            || message["jsonrpc"] != "2.0"
            || !message["method"].is_string()
            || message["method"] == ""
            || !message
                .get("id")
                .is_none_or(|id| id.is_null() || id.is_string() || id.is_number())
            || !message
                .get("params")
                .is_none_or(|params| params.is_object() || params.is_array())
        {
            return fail(-32600, "Invalid JSON-RPC request");
        }
        // Notifications must never receive replies; no notification actions run.
        if message.get("id").is_none() {
            return Dispatch::default();
        }
        let method = message["method"].as_str().unwrap_or_default();
        if method == "plugin.initialize" {
            let params = &message["params"];
            let version = params
                .get("runtimeProtocolVersion")
                .or_else(|| params.get("apiVersion"));
            if version.and_then(Value::as_u64) != Some(1) {
                return fail(-32602, "Unsupported runtime protocol version");
            }
            self.initialized = true;
            return Dispatch {
                response: Some(success(
                    id,
                    json!({"runtimeProtocolVersion":1,"plugin":{"id":self.id,"version":self.version}}),
                )),
                ..Dispatch::default()
            };
        }
        if !self.initialized {
            return fail(-32000, "Plugin is not initialized");
        }
        match method {
            "plugin.ping" => Dispatch {
                response: Some(success(id, json!({"runtimeProtocolVersion":1}))),
                ..Dispatch::default()
            },
            "plugin.shutdown" => Dispatch {
                response: Some(success(id, json!({}))),
                shutdown: true,
                ..Dispatch::default()
            },
            "plugin.invoke" => {
                let params = &message["params"];
                if !params.is_object() || !params["action"].is_string() {
                    return fail(-32602, "action is required");
                }
                if params["action"] != "hello" {
                    return fail(-32601, "Unknown action");
                }
                let Some(payload) = params["payload"].as_str() else {
                    return fail(-32602, "payload must be a JSON string");
                };
                if payload.len() > 4096 {
                    return fail(-32602, "payload exceeds 4096 bytes");
                }
                let payload = if payload.is_empty() {
                    json!({})
                } else {
                    match serde_json::from_str::<Value>(payload) {
                        Ok(value) => value,
                        Err(_) => return fail(-32602, "Invalid payload JSON"),
                    }
                };
                let Some(object) = payload.as_object() else {
                    return fail(-32602, "payload must contain an object");
                };
                if object.keys().any(|key| key != "name") {
                    return fail(-32602, "Unknown payload field");
                }
                let name = match object.get("name") {
                    None => "MinCode",
                    Some(Value::String(name))
                        if !name.trim().is_empty()
                            && name.chars().count() <= 200
                            && !name.chars().any(char::is_control) =>
                    {
                        name
                    }
                    _ => return fail(-32602, "name must be a single line of 1-200 characters"),
                };
                if self.busy.swap(true, Ordering::AcqRel) {
                    return fail(-32029, "An action is already running");
                }
                Dispatch {
                    job: Some(Job {
                        id,
                        name: name.into(),
                        busy: self.busy.clone(),
                    }),
                    ..Dispatch::default()
                }
            }
            _ => fail(-32601, "Method not found"),
        }
    }
}

/// Answers a JSON-RPC 2.0 batch (§6): one array with the reply of every request,
/// in arrival order; notifications add nothing, so an all-notification batch
/// yields an empty list (write nothing). Actions run inline so their results join
/// the array. The flag reports a plugin.shutdown inside the batch.
pub fn dispatch_batch(runtime: &mut Runtime, items: Vec<Value>) -> (Vec<Value>, bool) {
    if items.is_empty() {
        return (
            vec![error(Value::Null, -32600, "Invalid JSON-RPC request")],
            false,
        );
    }
    let mut replies = Vec::new();
    let mut shutdown = false;
    for item in items {
        let dispatch = runtime.dispatch(item);
        if let Some(response) = dispatch.response {
            replies.push(response);
        }
        if let Some(job) = dispatch.job {
            replies.push(job.run());
        }
        shutdown |= dispatch.shutdown;
    }
    (replies, shutdown)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn lifecycle_and_invoke_use_the_same_language_neutral_contract() {
        let mut runtime = Runtime::new("acme.rust".into(), "1.0.0".into());
        let request =
            |method, params| json!({"jsonrpc":"2.0","id":"x","method":method,"params":params});
        assert_eq!(
            runtime
                .dispatch(request("plugin.ping", json!({})))
                .response
                .unwrap()["error"]["code"],
            -32000
        );
        let initialized = runtime
            .dispatch(request(
                "plugin.initialize",
                json!({"runtimeProtocolVersion":1}),
            ))
            .response
            .unwrap();
        assert_eq!(initialized["result"]["runtimeProtocolVersion"], 1);
        assert_eq!(initialized["result"]["plugin"]["id"], "acme.rust");
        assert!(initialized["result"].get("features").is_none());
        assert_eq!(
            runtime
                .dispatch(request("plugin.ping", json!({})))
                .response
                .unwrap()["result"]["runtimeProtocolVersion"],
            1
        );
        let job = runtime
            .dispatch(request(
                "plugin.invoke",
                json!({"action":"hello","payload":"{\"name\":\"Rust\"}"}),
            ))
            .job
            .unwrap();
        assert_eq!(job.run()["result"]["message"], "Hello, Rust!");
        assert!(
            runtime
                .dispatch(request("plugin.shutdown", json!({})))
                .shutdown
        );
    }

    #[test]
    fn malformed_versions_payloads_and_methods_return_protocol_errors() {
        let mut runtime = Runtime::new("acme.rust".into(), "1.0.0".into());
        let request =
            |method, params| json!({"jsonrpc":"2.0","id":3,"method":method,"params":params});
        assert_eq!(
            runtime
                .dispatch(request(
                    "plugin.initialize",
                    json!({"runtimeProtocolVersion":2})
                ))
                .response
                .unwrap()["error"]["code"],
            -32602
        );
        runtime.dispatch(request(
            "plugin.initialize",
            json!({"runtimeProtocolVersion":1}),
        ));
        for payload in [
            json!(4),
            json!("[1]"),
            json!("{\"name\":3}"),
            json!("{\"name\":\"x\",\"extra\":1}"),
        ] {
            assert_eq!(
                runtime
                    .dispatch(request(
                        "plugin.invoke",
                        json!({"action":"hello","payload":payload})
                    ))
                    .response
                    .unwrap()["error"]["code"],
                -32602
            );
        }
        assert_eq!(
            runtime
                .dispatch(request(
                    "plugin.invoke",
                    json!({"action":"missing","payload":"{}"})
                ))
                .response
                .unwrap()["error"]["code"],
            -32601
        );
        assert_eq!(
            runtime
                .dispatch(request("plugin.task.start", json!({})))
                .response
                .unwrap()["error"]["code"],
            -32601
        );
        assert!(runtime
            .dispatch(json!({"jsonrpc":"2.0","method":"plugin.ping"}))
            .response
            .is_none());
    }

    #[test]
    fn a_full_action_slot_does_not_block_heartbeat() {
        let mut runtime = Runtime::new("acme.rust".into(), "1.0.0".into());
        runtime.dispatch(json!({"jsonrpc":"2.0","id":1,"method":"plugin.initialize","params":{"runtimeProtocolVersion":1}}));
        let invoke = json!({"jsonrpc":"2.0","id":2,"method":"plugin.invoke","params":{"action":"hello","payload":"{}"}});
        let job = runtime.dispatch(invoke.clone()).job.unwrap();
        assert_eq!(
            runtime.dispatch(invoke.clone()).response.unwrap()["error"]["code"],
            -32029
        );
        assert!(runtime
            .dispatch(json!({"jsonrpc":"2.0","id":3,"method":"plugin.ping"}))
            .response
            .unwrap()
            .get("result")
            .is_some());
        drop(job);
        assert!(runtime.dispatch(invoke).job.is_some());
    }

    #[test]
    fn framing_is_bounded_and_recovers_after_an_overlong_line() {
        use std::io::Cursor;
        let mut input = Cursor::new(b"123456\n{}\n".as_slice());
        assert!(matches!(
            read_frame(&mut input, 4).unwrap(),
            Frame::TooLarge
        ));
        assert!(matches!(read_frame(&mut input, 4).unwrap(), Frame::Json(bytes) if bytes == b"{}"));
        assert!(matches!(read_frame(&mut input, 4).unwrap(), Frame::Eof));
    }

    #[test]
    fn jsonrpc2_batches_and_invalid_requests() {
        let mut runtime = Runtime::new("demo".into(), "0.1.0".into());
        let (replies, _) = dispatch_batch(&mut runtime, vec![]);
        assert_eq!(replies[0]["error"]["code"], -32600);
        let (replies, shutdown) = dispatch_batch(
            &mut runtime,
            vec![
                json!({"jsonrpc":"2.0","id":1,"method":"plugin.initialize","params":{"runtimeProtocolVersion":1}}),
                json!({"jsonrpc":"2.0","method":"plugin.ping"}),
                json!(1),
                json!({"jsonrpc":"2.0","id":"h","method":"plugin.invoke","params":{"action":"hello","payload":"{}"}}),
                json!({"jsonrpc":"2.0","id":{"x":1},"method":"plugin.ping"}),
                json!({"jsonrpc":"2.0","id":5,"method":"plugin.ping","params":3}),
                json!({"jsonrpc":"2.0","id":6}),
            ],
        );
        assert!(!shutdown);
        let codes: Vec<_> = replies
            .iter()
            .map(|reply| (reply["id"].clone(), reply["error"]["code"].clone()))
            .collect();
        assert_eq!(
            codes,
            vec![
                (json!(1), Value::Null),
                (Value::Null, json!(-32600)),
                (json!("h"), Value::Null),
                (Value::Null, json!(-32600)),
                (json!(5), json!(-32600)),
            ]
        );
        assert_eq!(replies[2]["result"]["message"], "Hello, MinCode!");
        let (replies, _) = dispatch_batch(
            &mut runtime,
            vec![json!({"jsonrpc":"2.0","method":"plugin.ping"})],
        );
        assert!(replies.is_empty());
    }
}
