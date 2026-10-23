use mincode_rust_plugin::{dispatch_batch, error, read_frame, Frame, Runtime, MAX_LINE_BYTES};
use serde_json::Value;
use std::io::{self, BufReader, Write};
use std::sync::{Arc, Mutex};

fn write(output: &Mutex<io::Stdout>, message: &Value) -> io::Result<()> {
    let mut output = output
        .lock()
        .map_err(|_| io::Error::other("output lock failed"))?;
    serde_json::to_writer(&mut *output, message)?;
    output.write_all(b"\n")?;
    output.flush()
}
fn serve() -> Result<(), Box<dyn std::error::Error>> {
    // This identity belongs to the plugin at compile time, never to host input.
    let manifest: Value = serde_json::from_str(include_str!("../plugin.template.json"))?;
    let mut runtime = Runtime::new(
        manifest["id"].as_str().ok_or("missing id")?.into(),
        manifest["version"]
            .as_str()
            .ok_or("missing version")?
            .into(),
    );
    let output = Arc::new(Mutex::new(io::stdout()));
    let mut input = BufReader::new(io::stdin().lock());
    let mut worker: Option<std::thread::JoinHandle<io::Result<()>>> = None;
    loop {
        let bytes = match read_frame(&mut input, MAX_LINE_BYTES)? {
            Frame::Eof => break,
            Frame::TooLarge => {
                write(&output, &error(Value::Null, -32600, "Message too large"))?;
                continue;
            }
            Frame::Json(bytes) => bytes,
        };
        let message = match serde_json::from_slice::<Value>(&bytes) {
            Ok(value) => value,
            Err(_) => {
                write(&output, &error(Value::Null, -32700, "Parse error"))?;
                continue;
            }
        };
        if let Value::Array(items) = message {
            // A batch is answered after its own work, with one array (or nothing).
            if let Some(previous) = worker.take() {
                previous.join().map_err(|_| "action thread panicked")??;
            }
            let (replies, shutdown) = dispatch_batch(&mut runtime, items);
            if !replies.is_empty() {
                write(&output, &Value::Array(replies))?;
            }
            if shutdown {
                break;
            }
            continue;
        }
        let dispatch = runtime.dispatch(message);
        if let Some(response) = dispatch.response {
            write(&output, &response)?;
        }
        if let Some(job) = dispatch.job {
            if let Some(previous) = worker.take() {
                previous.join().map_err(|_| "action thread panicked")??;
            }
            let output = output.clone();
            worker = Some(std::thread::spawn(move || write(&output, &job.run())));
        }
        if dispatch.shutdown {
            break;
        }
    }
    if let Some(worker) = worker {
        worker.join().map_err(|_| "action thread panicked")??;
    }
    Ok(())
}
fn main() {
    if let Err(error) = serve() {
        eprintln!("Rust plugin transport failed: {error}");
        std::process::exit(1);
    }
}
