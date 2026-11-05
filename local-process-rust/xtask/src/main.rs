use serde_json::Value;
use std::{env, fs, path::Path, process::Command};

/// Marketplace targets: Rust triple, MinCode OS, MinCode architecture.
const TARGETS: [(&str, &str, &str); 4] = [
    ("aarch64-apple-darwin", "darwin", "arm64"),
    ("x86_64-apple-darwin", "darwin", "amd64"),
    ("x86_64-pc-windows-gnu", "windows", "amd64"),
    ("x86_64-unknown-linux-gnu", "linux", "amd64"),
];

fn target_platform(triple: &str) -> Option<(&'static str, &'static str)> {
    TARGETS
        .iter()
        .find(|(candidate, _, _)| *candidate == triple)
        .map(|(_, os, arch)| (*os, *arch))
}

fn target_triple(os: &str, arch: &str) -> Option<&'static str> {
    TARGETS
        .iter()
        .find(|(_, candidate_os, candidate_arch)| *candidate_os == os && *candidate_arch == arch)
        .map(|(triple, _, _)| *triple)
}

fn host_platform() -> Option<(&'static str, &'static str)> {
    let os = match env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        _ => return None,
    };
    let arch = match env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "amd64",
        other => other,
    };
    Some((os, arch))
}

#[derive(Debug, PartialEq)]
struct BuildTarget {
    os: &'static str,
    arch: &'static str,
    /// None builds for the host with the default toolchain.
    triple: Option<&'static str>,
}

/// `mincode plugin release` sets MINCODE_TARGET_OS/MINCODE_TARGET_ARCH. It never
/// exports CARGO_BUILD_TARGET, which would also cross-compile this xtask binary.
fn resolve_target(
    mincode_os: Option<&str>,
    mincode_arch: Option<&str>,
    cargo_build_target: Option<&str>,
    host: Option<(&'static str, &'static str)>,
) -> Result<BuildTarget, String> {
    let mincode_os = mincode_os.filter(|value| !value.is_empty());
    let mincode_arch = mincode_arch.filter(|value| !value.is_empty());
    match (mincode_os, mincode_arch) {
        (Some(os), Some(arch)) => {
            if let Some((host_os, host_arch)) = host {
                if host_os == os && host_arch == arch {
                    return Ok(BuildTarget {
                        os: host_os,
                        arch: host_arch,
                        triple: None,
                    });
                }
            }
            let triple = target_triple(os, arch).ok_or_else(|| {
                format!("unsupported MINCODE_TARGET_OS/MINCODE_TARGET_ARCH {os}/{arch}; supported: darwin/arm64, darwin/amd64, windows/amd64, linux/amd64")
            })?;
            let (os, arch) = target_platform(triple).expect("table entry");
            return Ok(BuildTarget {
                os,
                arch,
                triple: Some(triple),
            });
        }
        (None, None) => {}
        _ => return Err("set both MINCODE_TARGET_OS and MINCODE_TARGET_ARCH".into()),
    }
    if let Some(triple) = cargo_build_target.filter(|value| !value.is_empty()) {
        let (os, arch) = target_platform(triple).ok_or(
            "This starter packages the current host only; build each release on its target platform",
        )?;
        let triple = target_triple(os, arch).expect("table entry");
        return Ok(BuildTarget {
            os,
            arch,
            triple: Some(triple),
        });
    }
    let (os, arch) = host.ok_or("unsupported platform")?;
    Ok(BuildTarget {
        os,
        arch,
        triple: None,
    })
}

fn build() -> Result<(), Box<dyn std::error::Error>> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("project root missing")?;
    let mincode_os = env::var("MINCODE_TARGET_OS").ok();
    let mincode_arch = env::var("MINCODE_TARGET_ARCH").ok();
    let cargo_build_target = env::var("CARGO_BUILD_TARGET").ok();
    let target = resolve_target(
        mincode_os.as_deref(),
        mincode_arch.as_deref(),
        cargo_build_target.as_deref(),
        host_platform(),
    )?;
    let cargo = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let mut command = Command::new(cargo);
    command
        .current_dir(root)
        .env_remove("CARGO_BUILD_TARGET")
        .args([
            "build",
            "--locked",
            "--release",
            "--package",
            "mincode-rust-plugin",
            "--message-format=json",
        ]);
    if let Some(triple) = target.triple {
        // Cross builds land in target/<triple>/release/.
        command.args(["--target", triple]);
    }
    let output = command.output()?;
    if !output.status.success() {
        eprint!("{}", String::from_utf8_lossy(&output.stderr));
        if let Some(triple) = target.triple {
            eprintln!(
                "Cross-compiling needs `rustup target add {triple}` and a linker for {triple}."
            );
        }
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
    let binaries = ["mincode-rust-plugin", "mincode-rust-plugin.exe"];
    let binary = if target.os == "windows" {
        binaries[1]
    } else {
        binaries[0]
    };
    let dist = root.join("dist-plugin");
    // Refuse symlinked output paths before writing developer build artifacts.
    for path in [
        dist.clone(),
        dist.join("bin"),
        dist.join("plugin.json"),
        dist.join("bin").join(binaries[0]),
        dist.join("bin").join(binaries[1]),
    ] {
        if let Ok(metadata) = fs::symlink_metadata(&path) {
            if metadata.file_type().is_symlink() {
                return Err("symlink in build output".into());
            }
        }
    }
    fs::create_dir_all(dist.join("bin"))?;
    // Drop the other platform's executable so one package never ships two builds.
    for stale in binaries {
        let path = dist.join("bin").join(stale);
        if stale != binary && path.is_file() {
            fs::remove_file(path)?;
        }
    }
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
        .replace("__PLATFORM__", target.os)
        .replace("__BINARY__", binary);
    let manifest: Value = serde_json::from_str(&source)?;
    fs::write(
        dist.join("plugin.json"),
        serde_json::to_string_pretty(&manifest)? + "\n",
    )?;
    println!("Built dist-plugin for {}/{}", target.os, target.arch);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_market_triples_to_platforms() {
        assert_eq!(
            target_platform("x86_64-pc-windows-gnu"),
            Some(("windows", "amd64"))
        );
        assert_eq!(
            target_platform("aarch64-apple-darwin"),
            Some(("darwin", "arm64"))
        );
        assert_eq!(
            target_platform("x86_64-apple-darwin"),
            Some(("darwin", "amd64"))
        );
        assert_eq!(
            target_platform("x86_64-unknown-linux-gnu"),
            Some(("linux", "amd64"))
        );
        assert_eq!(target_platform("x86_64-pc-windows-msvc"), None);
        assert_eq!(target_platform("aarch64-unknown-linux-gnu"), None);
    }

    #[test]
    fn maps_platforms_to_triples() {
        assert_eq!(
            target_triple("windows", "amd64"),
            Some("x86_64-pc-windows-gnu")
        );
        assert_eq!(target_triple("linux", "arm64"), None);
    }

    #[test]
    fn resolves_build_target_from_environment() {
        let host = Some(("darwin", "arm64"));
        assert_eq!(
            resolve_target(Some("darwin"), Some("arm64"), None, host),
            Ok(BuildTarget {
                os: "darwin",
                arch: "arm64",
                triple: None
            })
        );
        assert_eq!(
            resolve_target(Some("windows"), Some("amd64"), None, host),
            Ok(BuildTarget {
                os: "windows",
                arch: "amd64",
                triple: Some("x86_64-pc-windows-gnu")
            })
        );
        // MINCODE_TARGET_* wins over an inherited CARGO_BUILD_TARGET.
        assert_eq!(
            resolve_target(
                Some("linux"),
                Some("amd64"),
                Some("aarch64-apple-darwin"),
                host
            ),
            Ok(BuildTarget {
                os: "linux",
                arch: "amd64",
                triple: Some("x86_64-unknown-linux-gnu")
            })
        );
        assert!(resolve_target(Some("linux"), Some("arm64"), None, host).is_err());
        assert!(resolve_target(Some("linux"), None, None, host).is_err());
        assert_eq!(
            resolve_target(None, None, Some("x86_64-apple-darwin"), host),
            Ok(BuildTarget {
                os: "darwin",
                arch: "amd64",
                triple: Some("x86_64-apple-darwin")
            })
        );
        assert_eq!(
            resolve_target(None, None, Some("wasm32-unknown-unknown"), host),
            Err("This starter packages the current host only; build each release on its target platform".into())
        );
        assert_eq!(
            resolve_target(None, Some(""), Some(""), host),
            Ok(BuildTarget {
                os: "darwin",
                arch: "arm64",
                triple: None
            })
        );
        assert_eq!(
            resolve_target(None, None, None, None),
            Err("unsupported platform".into())
        );
    }
}
