use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::{header, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::broadcast::error::RecvError;

use super::{OverlayHub, BASE_PORT, PORT_ATTEMPTS};
use crate::profiles;

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    hub: Arc<OverlayHub>,
    profiles_root: PathBuf,
}

pub async fn start(app: AppHandle, hub: Arc<OverlayHub>, profiles_root: PathBuf) {
    let mut listener = None;
    for offset in 0..PORT_ATTEMPTS {
        match TcpListener::bind(("127.0.0.1", BASE_PORT + offset)).await {
            Ok(l) => {
                listener = Some(l);
                break;
            }
            Err(e) => log::warn!("overlay port {} unavailable: {e}", BASE_PORT + offset),
        }
    }
    let Some(listener) = listener else {
        log::error!("overlay server could not bind any port");
        let _ = app.emit("overlay://error", "no free port");
        return;
    };
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    hub.port.store(port, Ordering::Relaxed);
    let _ = app.emit("overlay://info", hub.info());

    let ctx = Ctx { app, hub, profiles_root };
    let router = Router::new()
        .route("/overlay", get(overlay_page))
        .route("/ws", get(ws_upgrade))
        .route("/media/{profile}/{file}", get(media))
        .fallback(get(static_asset))
        .with_state(ctx);

    if let Err(e) = axum::serve(listener, router).await {
        log::error!("overlay server stopped: {e}");
    }
}

async fn overlay_page(State(ctx): State<Ctx>) -> Response {
    let port = ctx.hub.port.load(Ordering::Relaxed);
    if tauri::is_dev() {
        if let Some(dev) = ctx.app.config().build.dev_url.clone() {
            let base = dev.as_str().trim_end_matches('/');
            return Redirect::temporary(&format!("{base}/overlay.html?port={port}")).into_response();
        }
    }
    serve_asset(&ctx.app, "/overlay.html")
}

async fn static_asset(State(ctx): State<Ctx>, uri: Uri) -> Response {
    let path = uri.path();
    if !path.starts_with("/static/") && !path.starts_with("/fonts/") {
        return StatusCode::NOT_FOUND.into_response();
    }
    serve_asset(&ctx.app, path)
}

fn serve_asset(app: &AppHandle, path: &str) -> Response {
    match app.asset_resolver().get(path.to_string()) {
        Some(asset) => (
            [
                (header::CONTENT_TYPE, asset.mime_type),
                (header::CACHE_CONTROL, "no-cache".to_string()),
            ],
            asset.bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn media(State(ctx): State<Ctx>, Path((profile, file)): Path<(String, String)>) -> Response {
    let Some(path) = profiles::media_path(&ctx.profiles_root, &profile, &file) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mime = file
        .rsplit_once('.')
        .and_then(|(_, ext)| profiles::image_ext_mime(ext))
        .unwrap_or("application/octet-stream");
    match tokio::fs::read(path).await {
        Ok(bytes) => {
            let mut res = Response::new(Body::from(bytes));
            let h = res.headers_mut();
            h.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            // Overlays draw these into WebGL textures, which needs CORS on a cross-origin image.
            h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
            // Media names are content-unique UUIDs, so they never change in place.
            h.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=31536000, immutable"));
            h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
            res
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn ws_upgrade(State(ctx): State<Ctx>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| client_loop(ctx, socket))
}

fn notify_clients(ctx: &Ctx) {
    let _ = ctx.app.emit("overlay://info", ctx.hub.info());
}

async fn client_loop(ctx: Ctx, mut socket: WebSocket) {
    let mut rx = ctx.hub.tx.subscribe();
    ctx.hub.clients.fetch_add(1, Ordering::Relaxed);
    notify_clients(&ctx);

    if let Some(profile) = ctx.hub.current_profile() {
        if socket.send(Message::Text(profile.as_ref().into())).await.is_err() {
            ctx.hub.clients.fetch_sub(1, Ordering::Relaxed);
            notify_clients(&ctx);
            return;
        }
    }

    loop {
        tokio::select! {
            msg = rx.recv() => match msg {
                Ok(text) => {
                    if socket.send(Message::Text(text.as_ref().into())).await.is_err() {
                        break;
                    }
                }
                // A slow overlay skips stale frames instead of building a backlog.
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(_)) => {}
            },
        }
    }

    ctx.hub.clients.fetch_sub(1, Ordering::Relaxed);
    notify_clients(&ctx);
}
