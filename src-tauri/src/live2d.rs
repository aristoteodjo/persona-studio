use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use serde_json::Value;
use zip::write::SimpleFileOptions;

use crate::profiles::{self, MAX_MODEL_BYTES};

/// Name of the settings file inside a packed model; every other entry is relative to it.
pub const MODEL_ENTRY: &str = "model.model3.json";
const MAX_SETTINGS_BYTES: u64 = 1024 * 1024;

/// A reference must stay inside the model folder: relative, no `..`, no absolute path.
fn safe_relative(reference: &str) -> Option<PathBuf> {
    let path = Path::new(reference);
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

/// Every file a `.model3.json` points to. Sounds are dropped: the avatar never plays them.
pub fn collect_references(settings: &mut Value) -> Result<Vec<String>, String> {
    let refs = settings
        .get_mut("FileReferences")
        .and_then(Value::as_object_mut)
        .ok_or("model3.json sans FileReferences")?;
    let mut out = Vec::new();
    let moc = refs
        .get("Moc")
        .and_then(Value::as_str)
        .ok_or("modèle sans fichier .moc3")?;
    out.push(moc.to_string());
    for key in ["Physics", "Pose", "DisplayInfo", "UserData"] {
        if let Some(f) = refs.get(key).and_then(Value::as_str) {
            out.push(f.to_string());
        }
    }
    let textures = refs
        .get("Textures")
        .and_then(Value::as_array)
        .ok_or("modèle sans textures")?;
    for t in textures {
        out.push(t.as_str().ok_or("texture invalide")?.to_string());
    }
    if let Some(list) = refs.get("Expressions").and_then(Value::as_array) {
        for e in list {
            if let Some(f) = e.get("File").and_then(Value::as_str) {
                out.push(f.to_string());
            }
        }
    }
    if let Some(groups) = refs.get_mut("Motions").and_then(Value::as_object_mut) {
        for motions in groups.values_mut() {
            for m in motions.as_array_mut().into_iter().flatten() {
                if let Some(obj) = m.as_object_mut() {
                    obj.remove("Sound");
                    if let Some(f) = obj.get("File").and_then(Value::as_str) {
                        out.push(f.to_string());
                    }
                }
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// Packs a Live2D model (its `.model3.json` and only the files it references) into one zip.
pub fn pack(model3: &Path) -> Result<Vec<u8>, String> {
    let meta = fs::metadata(model3).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_SETTINGS_BYTES {
        return Err("fichier .model3.json invalide".into());
    }
    let dir = model3
        .parent()
        .ok_or("dossier du modèle introuvable")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let mut settings: Value = serde_json::from_slice(&fs::read(model3).map_err(|e| e.to_string())?)
        .map_err(|_| "model3.json illisible")?;
    let files = collect_references(&mut settings)?;

    let mut buf = std::io::Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(&mut buf);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut total: u64 = 0;
    for reference in &files {
        let rel = safe_relative(reference).ok_or_else(|| format!("chemin refusé : {reference}"))?;
        let path = dir
            .join(&rel)
            .canonicalize()
            .map_err(|_| format!("fichier manquant : {reference}"))?;
        if !path.starts_with(&dir) || !path.is_file() {
            return Err(format!("chemin refusé : {reference}"));
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        total += bytes.len() as u64;
        if total > MAX_MODEL_BYTES {
            return Err("modèle trop lourd (150 Mo max)".into());
        }
        if rel.extension().and_then(|e| e.to_str()) == Some("moc3") && !bytes.starts_with(b"MOC3") {
            return Err("le fichier .moc3 est invalide".into());
        }
        let name = rel.to_string_lossy().replace('\\', "/");
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    zip.start_file(MODEL_ENTRY, opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(settings.to_string().as_bytes())
        .map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(buf.into_inner())
}

/// Packs the model into the profile folder and returns the media name (`<uuid>.zip`).
pub fn import(root: &Path, id: &str, model3: &Path) -> Result<String, String> {
    if !profiles::is_valid_id(id) {
        return Err("invalid profile id".into());
    }
    let bytes = pack(model3)?;
    let dir = root.join(id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = format!("{}.zip", uuid::Uuid::new_v4());
    fs::write(dir.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn model_dir() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        let d = tmp.path();
        fs::create_dir_all(d.join("tex")).unwrap();
        fs::write(d.join("a.moc3"), b"MOC3\x04rest").unwrap();
        fs::write(d.join("tex/t0.png"), b"png").unwrap();
        fs::write(d.join("a.physics3.json"), b"{}").unwrap();
        fs::write(d.join("idle.motion3.json"), b"{}").unwrap();
        fs::write(d.join("unused.txt"), b"secret").unwrap();
        tmp
    }

    fn write_settings(d: &Path, refs: &str) -> PathBuf {
        let p = d.join("a.model3.json");
        fs::write(&p, format!(r#"{{"Version":3,"FileReferences":{refs}}}"#)).unwrap();
        p
    }

    #[test]
    fn packs_only_referenced_files_and_drops_sounds() {
        let tmp = model_dir();
        let p = write_settings(
            tmp.path(),
            r#"{"Moc":"a.moc3","Textures":["tex/t0.png"],"Physics":"a.physics3.json",
                "Motions":{"Idle":[{"File":"idle.motion3.json","Sound":"../x.wav"}]}}"#,
        );
        let bytes = pack(&p).unwrap();
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut names: Vec<String> = zip.file_names().map(String::from).collect();
        names.sort();
        assert_eq!(
            names,
            [
                "a.moc3",
                "a.physics3.json",
                "idle.motion3.json",
                MODEL_ENTRY,
                "tex/t0.png"
            ]
        );
        let mut json = String::new();
        zip.by_name(MODEL_ENTRY)
            .unwrap()
            .read_to_string(&mut json)
            .unwrap();
        assert!(!json.contains("Sound"));
    }

    #[test]
    fn refuses_paths_outside_the_model() {
        let tmp = model_dir();
        for bad in [r#""../a.moc3""#, r#""/etc/passwd""#] {
            let p = write_settings(tmp.path(), &format!(r#"{{"Moc":{bad},"Textures":[]}}"#));
            assert!(pack(&p).is_err(), "{bad} accepted");
        }
    }

    #[test]
    fn refuses_fake_moc_files() {
        let tmp = model_dir();
        fs::write(tmp.path().join("fake.moc3"), b"nope").unwrap();
        let p = write_settings(
            tmp.path(),
            r#"{"Moc":"fake.moc3","Textures":["tex/t0.png"]}"#,
        );
        assert!(pack(&p).is_err());
    }

    #[test]
    fn imports_as_zip_media() {
        let tmp = model_dir();
        let p = write_settings(tmp.path(), r#"{"Moc":"a.moc3","Textures":["tex/t0.png"]}"#);
        let root = tempfile::tempdir().unwrap();
        let id = "0b5f9a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
        let name = import(root.path(), id, &p).unwrap();
        assert!(profiles::media_path(root.path(), id, &name)
            .unwrap()
            .exists());
    }
}
