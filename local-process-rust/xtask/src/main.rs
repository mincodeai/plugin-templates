use serde_json::Value;
use std::{env, fs, path::Path, process::Command};

fn build() -> Result<(), Box<dyn std::error::Error>> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("project root missing")?;
    if env::var_os("CARGO_BUILD_TARGET").is_some() {
        return Err("This starter packages the current host only; build each release on its target platform".into());
    }
    let platform = match env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        _ => return Err("unsupported platform".into()),
    };
    let cargo = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let output = Command::new(cargo)
        .current_dir(root)
        .args([
            "build",
            "--locked",
            "--release",
            "--package",
            "mincode-rust-plugin",
            "--message-format=json",
        ])
        .output()?;
    if !output.status.success() {
        eprint!("{}", String::from_utf8_lossy(&output.stderr));
        return Err("Rust compilation failed".into());
    }
    let executable = String::from_utf8(output.stdout)?
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find_map(|message| {
            if message["reason"] == "compiler-artifact"
                && message["target"]["name"] == "mincode-rust-plugin"
            {
                message["executable"].as_str().map(str::to_owned)
            } else {
                None
            }
        })
        .ok_or("compiled executable not found")?;
    let binary = if cfg!(windows) {
        "mincode-rust-plugin.exe"
    } else {
        "mincode-rust-plugin"
    };
    let dist = root.join("dist-plugin");
    // Refuse symlinked output paths before writing developer build artifacts.
    for path in [
        &dist,
        &dist.join("bin"),
        &dist.join("plugin.json"),
        &dist.join("bin").join(binary),
    ] {
        if let Ok(metadata) = fs::symlink_metadata(path) {
            if metadata.file_type().is_symlink() {
                return Err("symlink in build output".into());
            }
        }
    }
    fs::create_dir_all(dist.join("bin"))?;
    fs::copy(executable, dist.join("bin").join(binary))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            dist.join("bin").join(binary),
            fs::Permissions::from_mode(0o755),
        )?;
    }
    let source = fs::read_to_string(root.join("plugin.template.json"))?
        .replace("__PLATFORM__", platform)
        .replace("__BINARY__", binary);
    let manifest: Value = serde_json::from_str(&source)?;
    fs::write(
        dist.join("plugin.json"),
        serde_json::to_string_pretty(&manifest)? + "\n",
    )?;
    println!("Built dist-plugin for {platform}/{}", env::consts::ARCH);
    Ok(())
}
fn main() {
    if env::args().nth(1).as_deref() != Some("build") {
        eprintln!("Usage: cargo xtask build");
        std::process::exit(2);
    }
    if let Err(error) = build() {
        eprintln!("Build failed: {error}");
        std::process::exit(1);
    }
}
