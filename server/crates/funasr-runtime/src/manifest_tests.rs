use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tempfile::{tempdir, TempDir};

use super::{is_package_path, ModelKind, Package, HASH_BUFFER_SIZE, MAX_MANIFEST_SIZE};

struct Fixture {
    dir: TempDir,
    manifest: Value,
}

impl Fixture {
    fn new(engine: &str) -> Self {
        let mut fixture = Self {
            dir: tempdir().unwrap(),
            manifest: json!({
                "format_version": 1,
                "engine": engine,
                "revision": "test-revision",
                "files": {}
            }),
        };
        fixture.component("model", b"GGUFtest model payload");
        if engine == "funasr-nano" {
            fixture.component("encoder", b"GGUFtest encoder payload");
        }
        fixture
    }

    fn component(&mut self, name: &str, bytes: &[u8]) {
        let path = format!("{name}.gguf");
        fs::write(self.dir.path().join(&path), bytes).unwrap();
        self.manifest["files"][name] = json!({
            "path": path,
            "size": bytes.len(),
            "sha256": format!("{:x}", Sha256::digest(bytes))
        });
    }

    fn write(&self) -> PathBuf {
        let path = self.dir.path().join("test.vibe-model");
        fs::write(&path, serde_json::to_vec(&self.manifest).unwrap()).unwrap();
        path
    }

    fn reject(&self, expected: &str) {
        assert_rejected(&self.write(), expected);
    }
}

fn assert_rejected(path: &Path, expected: &str) {
    let error = Package::load(path).expect_err("invalid package was accepted");
    let message = format!("{error:#}");
    assert!(
        message.contains(expected),
        "expected {expected:?}, got {message:?} for {}",
        path.display()
    );
}

#[test]
fn loads_valid_nano_and_sensevoice_packages() {
    for (engine, kind) in [("funasr-nano", ModelKind::FunAsrNano), ("sensevoice", ModelKind::SenseVoice)] {
        let fixture = Fixture::new(engine);
        let package = Package::load(fixture.write()).unwrap();
        assert_eq!(package.kind, kind);
        assert_eq!(package.revision, "test-revision");
        assert_eq!(package.model, fixture.dir.path().join("model.gguf").canonicalize().unwrap());
        let encoder = if kind == ModelKind::FunAsrNano {
            Some(fixture.dir.path().join("encoder.gguf").canonicalize().unwrap())
        } else {
            None
        };
        assert_eq!(package.encoder, encoder);
    }
}

#[test]
fn recognizes_package_suffix_without_checking_existence() {
    for path in ["model.vibe-model", "dir/MODEL.VIBE-MODEL", "a.Vibe-Model"] {
        assert!(is_package_path(Path::new(path)), "{path}");
    }
    for path in ["", "/", "model.gguf", "vibe-model", "model.vibe-model.json"] {
        assert!(!is_package_path(Path::new(path)), "{path}");
    }
}

#[test]
fn accepts_nested_paths_uppercase_hash_and_suffix() {
    let mut fixture = Fixture::new("sensevoice");
    fs::create_dir(fixture.dir.path().join("weights")).unwrap();
    fs::rename(
        fixture.dir.path().join("model.gguf"),
        fixture.dir.path().join("weights/model.gguf"),
    )
    .unwrap();
    fixture.manifest["files"]["model"]["path"] = json!("weights/model.gguf");
    fixture.manifest["files"]["model"]["sha256"] = json!(fixture.manifest["files"]["model"]["sha256"]
        .as_str()
        .unwrap()
        .to_ascii_uppercase());
    let path = fixture.dir.path().join("MODEL.VIBE-MODEL");
    fs::rename(fixture.write(), &path).unwrap();
    assert_eq!(
        Package::load(path).unwrap().model,
        fixture.dir.path().join("weights/model.gguf").canonicalize().unwrap()
    );
}

#[test]
fn shallow_load_skips_the_sha256_pass_but_keeps_the_other_checks() {
    let mut fixture = Fixture::new("sensevoice");
    // A hash the file cannot match: the shallow load must accept it, the strict one must not.
    fixture.manifest["files"]["model"]["sha256"] = json!("0".repeat(64));
    let path = fixture.write();
    Package::load_shallow(&path).expect("shallow validation must not hash the component");
    assert_rejected(&path, "sha256 mismatch");

    // Everything except the hash still applies: a size the file cannot match rejects both loads.
    let mut fixture = Fixture::new("sensevoice");
    fixture.manifest["files"]["model"]["size"] = json!(4);
    let path = fixture.write();
    let error = Package::load_shallow(&path).expect_err("shallow validation must still check sizes");
    assert!(format!("{error:#}").contains("size mismatch"), "unexpected error: {error:#}");
}

#[test]
fn hashes_components_across_multiple_read_buffers() {
    let mut fixture = Fixture::new("funasr-nano");
    let mut bytes = vec![0xa5; HASH_BUFFER_SIZE * 2 + 17];
    bytes[..4].copy_from_slice(b"GGUF");
    fixture.component("model", &bytes);
    fixture.component("encoder", &bytes);
    Package::load(fixture.write()).unwrap();
    // Corrupt the last chunk without changing the size or magic.
    let last = bytes.len() - 1;
    bytes[last] ^= 1;
    fs::write(fixture.dir.path().join("encoder.gguf"), bytes).unwrap();
    fixture.reject("sha256 mismatch");
}

#[test]
fn rejects_unsupported_versions_engines_and_empty_revisions() {
    let mut fixture = Fixture::new("sensevoice");
    let original = fixture.manifest.clone();
    for (key, value, expected) in [
        ("format_version", json!(0), "unsupported format_version"),
        ("format_version", json!(2), "unsupported format_version"),
        ("engine", json!("unknown"), "unsupported engine"),
        ("engine", json!("SenseVoice"), "unsupported engine"),
        ("engine", json!(""), "unsupported engine"),
        ("revision", json!(""), "revision must not be empty"),
        ("revision", json!(" \n\t"), "revision must not be empty"),
    ] {
        fixture.manifest = original.clone();
        fixture.manifest[key] = value;
        fixture.reject(expected);
    }
}

#[test]
fn enforces_engine_encoder_contract_and_rejects_null() {
    let mut nano = Fixture::new("funasr-nano");
    nano.manifest["files"].as_object_mut().unwrap().remove("encoder");
    nano.reject("funasr-nano requires encoder");

    let mut sensevoice = Fixture::new("sensevoice");
    sensevoice.component("encoder", b"GGUFencoder");
    sensevoice.reject("sensevoice forbids encoder");

    for engine in ["funasr-nano", "sensevoice"] {
        let mut fixture = Fixture::new(engine);
        fixture.manifest["files"]["encoder"] = Value::Null;
        fixture.reject("invalid package manifest");
    }
}

#[test]
fn rejects_missing_required_fields_at_every_level() {
    let mut fixture = Fixture::new("funasr-nano");
    let original = fixture.manifest.clone();
    for (pointer, keys) in [
        ("", &["format_version", "engine", "revision", "files"][..]),
        ("/files", &["model"][..]),
        ("/files/model", &["path", "size", "sha256"][..]),
        ("/files/encoder", &["path", "size", "sha256"][..]),
    ] {
        for key in keys {
            fixture.manifest = original.clone();
            fixture
                .manifest
                .pointer_mut(pointer)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .remove(*key);
            fixture.reject("missing field");
        }
    }
}

#[test]
fn rejects_unknown_fields_at_every_level() {
    let mut fixture = Fixture::new("funasr-nano");
    let original = fixture.manifest.clone();
    for pointer in ["", "/files", "/files/model", "/files/encoder"] {
        fixture.manifest = original.clone();
        fixture.manifest.pointer_mut(pointer).unwrap()["unexpected"] = json!(true);
        fixture.reject("unknown field");
    }
}

#[test]
fn rejects_wrong_schema_types() {
    let mut fixture = Fixture::new("funasr-nano");
    let original = fixture.manifest.clone();
    for (pointer, values) in [
        ("", vec![Value::Null, json!([]), json!(1)]),
        (
            "/format_version",
            vec![Value::Null, json!("1"), json!(-1), json!(1.5), json!(4294967296_u64)],
        ),
        ("/engine", vec![Value::Null, json!(1)]),
        ("/revision", vec![Value::Null, json!(1)]),
        ("/files", vec![Value::Null, json!([])]),
        ("/files/model", vec![Value::Null, json!("model.gguf")]),
        ("/files/encoder", vec![Value::Null, json!(false)]),
        ("/files/model/path", vec![Value::Null, json!(1)]),
        ("/files/model/size", vec![Value::Null, json!("4"), json!(-1), json!(4.5)]),
        ("/files/model/sha256", vec![Value::Null, json!(123)]),
        ("/files/encoder/path", vec![Value::Null, json!(1)]),
        ("/files/encoder/size", vec![Value::Null, json!(-1)]),
        ("/files/encoder/sha256", vec![Value::Null, json!(123)]),
    ] {
        for value in values {
            fixture.manifest = original.clone();
            *fixture.manifest.pointer_mut(pointer).unwrap() = value;
            fixture.reject("invalid package manifest");
        }
    }
}

#[test]
fn rejects_malformed_json_duplicate_fields_and_trailing_data() {
    let fixture = Fixture::new("sensevoice");
    let path = fixture.write();
    let valid = serde_json::to_string(&fixture.manifest).unwrap();
    for bytes in [
        Vec::new(),
        b"{".to_vec(),
        vec![0xff, 0xfe],
        format!("{valid} {{}}").into_bytes(),
        valid
            .replacen("\"format_version\":1", "\"format_version\":1,\"format_version\":1", 1)
            .into_bytes(),
    ] {
        fs::write(&path, bytes).unwrap();
        assert_rejected(&path, "invalid package manifest");
    }
}

#[test]
fn rejects_traversal_absolute_and_ambiguous_paths_for_both_components() {
    let mut fixture = Fixture::new("funasr-nano");
    let original = fixture.manifest.clone();
    for name in ["model", "encoder"] {
        for path in [
            "",
            ".",
            "..",
            "../outside.gguf",
            "weights/../../outside.gguf",
            "weights/../model.gguf",
            "./model.gguf",
            "weights/./model.gguf",
            "/model.gguf",
            "//server/model.gguf",
            "weights//model.gguf",
            "weights/",
            "C:/model.gguf",
            "C:\\model.gguf",
            "weights\\model.gguf",
            "model.gguf:stream",
            "model\0.gguf",
        ] {
            fixture.manifest = original.clone();
            fixture.manifest["files"][name]["path"] = json!(path);
            fixture.reject("path must be relative");
        }
    }
}

#[cfg(unix)]
#[test]
fn rejects_file_and_directory_symlink_escapes() {
    use std::os::unix::fs::symlink;

    let mut fixture = Fixture::new("funasr-nano");
    let base = fixture.dir.path().join("package");
    // A shared string prefix must not count as a shared path prefix.
    let outside = fixture.dir.path().join("package-outside");
    fs::create_dir(&base).unwrap();
    fs::create_dir(&outside).unwrap();
    for name in ["model", "encoder"] {
        let file = format!("{name}.gguf");
        fs::copy(fixture.dir.path().join(&file), base.join(&file)).unwrap();
        fs::copy(fixture.dir.path().join(&file), outside.join(&file)).unwrap();
        symlink(outside.join(&file), base.join(format!("{name}-link.gguf"))).unwrap();
    }
    symlink(&outside, base.join("linked-dir")).unwrap();
    let original = fixture.manifest.clone();
    let path = base.join("test.vibe-model");
    for name in ["model", "encoder"] {
        for relative in [format!("{name}-link.gguf"), format!("linked-dir/{name}.gguf")] {
            fixture.manifest = original.clone();
            fixture.manifest["files"][name]["path"] = json!(relative);
            fs::write(&path, serde_json::to_vec(&fixture.manifest).unwrap()).unwrap();
            assert_rejected(&path, "file escapes manifest directory");
        }
    }
}

#[cfg(unix)]
#[test]
fn accepts_symlinks_that_resolve_inside_the_package() {
    use std::os::unix::fs::symlink;

    let mut fixture = Fixture::new("sensevoice");
    symlink("model.gguf", fixture.dir.path().join("linked.gguf")).unwrap();
    fixture.manifest["files"]["model"]["path"] = json!("linked.gguf");
    assert_eq!(
        Package::load(fixture.write()).unwrap().model,
        fixture.dir.path().join("model.gguf").canonicalize().unwrap()
    );
}

#[test]
fn rejects_invalid_sha256_and_digest_mismatch_for_both_components() {
    let mut fixture = Fixture::new("funasr-nano");
    let original = fixture.manifest.clone();
    for name in ["model", "encoder"] {
        for hash in [String::new(), "a".repeat(63), "a".repeat(65), "g".repeat(64), "é".repeat(32)] {
            fixture.manifest = original.clone();
            fixture.manifest["files"][name]["sha256"] = json!(hash);
            fixture.reject("sha256 must contain exactly 64 hexadecimal characters");
        }
        fixture.manifest = original.clone();
        fixture.manifest["files"][name]["sha256"] = json!("0".repeat(64));
        fixture.reject("sha256 mismatch");
    }
}

#[test]
fn rejects_invalid_sizes_and_size_mismatch_for_both_components() {
    let mut fixture = Fixture::new("funasr-nano");
    let original = fixture.manifest.clone();
    for name in ["model", "encoder"] {
        for size in [0, 1, 3] {
            fixture.manifest = original.clone();
            fixture.manifest["files"][name]["size"] = json!(size);
            fixture.reject("size must be at least 4 bytes");
        }
        let actual = original["files"][name]["size"].as_u64().unwrap();
        for size in [4, actual - 1, actual + 1, u64::MAX] {
            fixture.manifest = original.clone();
            fixture.manifest["files"][name]["size"] = json!(size);
            fixture.reject("size mismatch");
        }
    }
}

#[test]
fn rejects_bad_gguf_magic_even_with_correct_size_and_hash() {
    for name in ["model", "encoder"] {
        let mut fixture = Fixture::new("funasr-nano");
        for bytes in [b"gguf".as_slice(), b"FUGGpayload", b"\0\0\0\0"] {
            fixture.component(name, bytes);
            fixture.reject("invalid GGUF magic");
        }
    }
}

#[test]
fn accepts_minimum_four_byte_gguf_components() {
    let mut fixture = Fixture::new("funasr-nano");
    fixture.component("model", b"GGUF");
    fixture.component("encoder", b"GGUF");
    Package::load(fixture.write()).unwrap();
}

#[test]
fn rejects_missing_and_non_regular_components() {
    for name in ["model", "encoder"] {
        let fixture = Fixture::new("funasr-nano");
        let path = fixture.dir.path().join(format!("{name}.gguf"));
        fs::remove_file(&path).unwrap();
        fixture.reject("cannot resolve file");
        fs::create_dir(&path).unwrap();
        fixture.reject("model component must be a regular file");
    }
}

#[test]
fn rejects_missing_non_regular_and_wrong_suffix_manifests() {
    let fixture = Fixture::new("sensevoice");
    let missing = fixture.dir.path().join("missing.vibe-model");
    assert_rejected(&missing, "cannot inspect manifest");
    fs::create_dir(&missing).unwrap();
    assert_rejected(&missing, "manifest must be a regular file");
    let wrong_suffix = fixture.dir.path().join("model.json");
    fs::rename(fixture.write(), &wrong_suffix).unwrap();
    assert_rejected(&wrong_suffix, "package must use the .vibe-model suffix");
}

#[test]
fn enforces_manifest_size_limit_including_exact_boundary() {
    let fixture = Fixture::new("sensevoice");
    let path = fixture.write();
    let mut bytes = serde_json::to_vec(&fixture.manifest).unwrap();
    bytes.resize(MAX_MANIFEST_SIZE as usize, b' ');
    fs::write(&path, &bytes).unwrap();
    Package::load(&path).unwrap();
    bytes.push(b' ');
    fs::write(&path, &bytes).unwrap();
    assert_rejected(&path, "manifest exceeds 64 KiB");
}
