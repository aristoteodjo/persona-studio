mod overlay;
mod pack;
mod profiles;

use std::path::PathBuf;
use std::sync::Arc;

use serde_json::Value;
use tauri::{Manager, State};

use overlay::{OverlayHub, OverlayInfo};
use profiles::ProfilesDir;

#[tauri::command]
fn profiles_list(dir: State<'_, ProfilesDir>) -> Result<Vec<Value>, String> {
    profiles::list(&dir.0)
}

#[tauri::command]
fn profile_save(dir: State<'_, ProfilesDir>, id: String, json: String) -> Result<(), String> {
    profiles::save(&dir.0, &id, &json)
}

#[tauri::command]
fn profile_delete(dir: State<'_, ProfilesDir>, id: String) -> Result<(), String> {
    profiles::delete(&dir.0, &id)
}

#[tauri::command]
async fn profile_import_image(
    dir: State<'_, ProfilesDir>,
    id: String,
    source: String,
) -> Result<String, String> {
    let root = dir.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        profiles::import_image(&root, &id, &PathBuf::from(source))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pack_scan(dir: String) -> Result<Vec<pack::PackFolder>, String> {
    tauri::async_runtime::spawn_blocking(move || pack::scan(&PathBuf::from(dir)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn profile_prune_media(
    dir: State<'_, ProfilesDir>,
    id: String,
    keep: Vec<String>,
) -> Result<usize, String> {
    profiles::prune_media(&dir.0, &id, &keep)
}

#[tauri::command]
fn overlay_info(hub: State<'_, Arc<OverlayHub>>) -> OverlayInfo {
    hub.info()
}

#[tauri::command]
fn overlay_set_profile(hub: State<'_, Arc<OverlayHub>>, message: String) -> Result<(), String> {
    if message.len() > profiles::MAX_PROFILE_JSON_BYTES {
        return Err("profile too large".into());
    }
    hub.set_profile(message);
    Ok(())
}

#[tauri::command]
fn overlay_push_frame(hub: State<'_, Arc<OverlayHub>>, message: String) -> Result<(), String> {
    hub.push_frame(message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let root = app.path().app_data_dir()?.join("profiles");
            std::fs::create_dir_all(&root)?;
            let hub = Arc::new(OverlayHub::new());
            app.manage(ProfilesDir(root.clone()));
            app.manage(hub.clone());
            tauri::async_runtime::spawn(overlay::start(app.handle().clone(), hub, root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            profiles_list,
            profile_save,
            profile_delete,
            profile_import_image,
            profile_prune_media,
            pack_scan,
            overlay_info,
            overlay_set_profile,
            overlay_push_frame,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Persona Studio");
}
