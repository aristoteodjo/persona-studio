//! Lists the images of a PNGTuber pack folder so the studio can map them to expressions.
use std::fs;
use std::path::Path;

use serde::Serialize;

const MAX_DEPTH: usize = 3;
const MAX_FILES: usize = 300;

#[derive(Serialize, Debug, PartialEq)]
pub struct PackFolder {
    pub name: String,
    pub files: Vec<String>,
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            matches!(
                e.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "gif"
            )
        })
        .unwrap_or(false)
}

/// Every folder (the root included) that directly holds images, depth-first and sorted.
pub fn scan(root: &Path) -> Result<Vec<PackFolder>, String> {
    if !root.is_dir() {
        return Err("not a folder".into());
    }
    let mut out = Vec::new();
    let mut total = 0;
    walk(root, 0, &mut out, &mut total);
    Ok(out)
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<PackFolder>, total: &mut usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut paths: Vec<_> = entries.flatten().map(|e| e.path()).collect();
    paths.sort();
    let mut files = Vec::new();
    let mut subdirs = Vec::new();
    for p in paths {
        let hidden = p
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with('.'));
        if hidden {
            continue;
        }
        // Symlinks are skipped so a pack cannot point the scan outside its folder.
        let Ok(meta) = fs::symlink_metadata(&p) else {
            continue;
        };
        if meta.is_dir() {
            subdirs.push(p);
        } else if meta.is_file() && is_image(&p) && *total < MAX_FILES {
            *total += 1;
            files.push(p.to_string_lossy().into_owned());
        }
    }
    if !files.is_empty() {
        let name = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Pack")
            .to_string();
        out.push(PackFolder { name, files });
    }
    if depth < MAX_DEPTH {
        for d in subdirs {
            walk(&d, depth + 1, out, total);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_image_folders_recursively() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("Chat")).unwrap();
        fs::create_dir_all(root.join("Gaming")).unwrap();
        fs::write(root.join("Cover.png"), b"x").unwrap();
        fs::write(root.join("notes.txt"), b"x").unwrap();
        fs::write(root.join("Chat/EyesOpenMouthClosed.png"), b"x").unwrap();
        fs::write(root.join("Gaming/EyesOpenMouthOpen.PNG"), b"x").unwrap();
        let found = scan(root).unwrap();
        let names: Vec<_> = found.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names.len(), 3);
        assert!(names.contains(&"Chat") && names.contains(&"Gaming"));
        assert!(found
            .iter()
            .all(|f| f.files.iter().all(|p| !p.ends_with(".txt"))));
        assert!(scan(&root.join("Cover.png")).is_err());
    }
}
