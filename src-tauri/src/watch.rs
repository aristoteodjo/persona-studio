//! Keeps a persona's VRM in sync with a VRoid Studio export: the file is polled
//! and re-imported when it changes, so exporting from VRoid updates the avatar.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::profiles;

const POLL: Duration = Duration::from_millis(1500);
const SETTLE: Duration = Duration::from_millis(700);

#[derive(Default)]
pub struct ModelWatch(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

#[derive(Serialize, Clone)]
struct Updated {
    id: String,
    file: String,
}

type Stamp = (SystemTime, u64);

fn stamp(path: &Path) -> Option<Stamp> {
    let m = fs::metadata(path).ok()?;
    Some((m.modified().ok()?, m.len()))
}

/// A new export counts once its timestamp moved and its size stopped changing.
pub fn changed(previous: Option<Stamp>, now: Option<Stamp>, settled: Option<Stamp>) -> bool {
    match (now, settled) {
        (Some(n), Some(s)) => Some(n) != previous && n == s && n.1 > 0,
        _ => false,
    }
}

impl ModelWatch {
    pub fn watch(
        &self,
        app: AppHandle,
        root: PathBuf,
        id: String,
        source: Option<PathBuf>,
    ) -> Result<(), String> {
        let mut slot = self.0.lock().map_err(|_| "watch poisoned")?;
        if let Some(h) = slot.take() {
            h.abort();
        }
        let Some(source) = source else { return Ok(()) };
        if !profiles::is_valid_id(&id) {
            return Err("invalid profile id".into());
        }
        let handle = tauri::async_runtime::spawn(async move {
            let mut last = stamp(&source);
            loop {
                tokio::time::sleep(POLL).await;
                let now = stamp(&source);
                if now.is_none() || now == last {
                    continue;
                }
                tokio::time::sleep(SETTLE).await;
                let settled = stamp(&source);
                if !changed(last, now, settled) {
                    continue;
                }
                last = settled;
                let (r, i, s) = (root.clone(), id.clone(), source.clone());
                let imported = tauri::async_runtime::spawn_blocking(move || {
                    profiles::import_image(&r, &i, &s)
                })
                .await;
                match imported {
                    Ok(Ok(file)) if file.ends_with(".vrm") => {
                        let _ = app.emit(
                            "model://updated",
                            Updated {
                                id: id.clone(),
                                file,
                            },
                        );
                    }
                    Ok(Ok(_)) => log::warn!("watched file is not a VRM"),
                    Ok(Err(e)) => log::warn!("re-import failed: {e}"),
                    Err(e) => log::warn!("re-import task failed: {e}"),
                }
            }
        });
        *slot = Some(handle);
        Ok(())
    }
}

/// Opens VRoid Studio if installed. Returns false when it is not found.
pub fn open_vroid() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "VRoid Studio"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub fn open_vroid_download() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg("https://vroid.com/en/studio")
        .status();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_only_settled_new_exports() {
        let t0 = SystemTime::UNIX_EPOCH;
        let t1 = t0 + Duration::from_secs(5);
        assert!(changed(Some((t0, 10)), Some((t1, 20)), Some((t1, 20))));
        assert!(!changed(Some((t1, 20)), Some((t1, 20)), Some((t1, 20))));
        assert!(!changed(Some((t0, 10)), Some((t1, 20)), Some((t1, 25))));
        assert!(!changed(Some((t0, 10)), Some((t1, 0)), Some((t1, 0))));
        assert!(!changed(Some((t0, 10)), None, None));
    }
}
