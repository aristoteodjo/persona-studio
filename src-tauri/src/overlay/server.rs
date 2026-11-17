use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::broadcast::error::RecvError;

use super::guard::{host_allowed, origin_allowed};
use super::{OverlayHub, BASE_PORT, MAX_SIGNAL_BYTES, PORT_ATTEMPTS};
use crate::profiles;

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    hub: Arc<OverlayHub>,
    profiles_root: PathBuf,
    port: u16,
    dev_origin: Option<String>,
}

impl Ctx {
    fn origin_ok(&self, headers: &HeaderMap) -> bool {
        let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
        origin_allowed(origin, self.port, self.dev_origin.as_deref())
    }
}

async fn check_host(State(ctx): State<Ctx>, req: Request, next: Next) -> Response {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok());
    if !host_allowed(host, ctx.port) {
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(req).await
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

    let dev_origin = if tauri::is_dev() {
        app.config()
            .build
            .dev_url
            .as_ref()
            .map(|u| u.origin().ascii_serialization())
    } else {
        None
    };
    let ctx = Ctx {
        app,
        hub,
        profiles_root,
        port,
        dev_origin,
    };
    let router = Router::new()
        .route("/overlay", get(overlay_page))
        .route("/ws", get(ws_upgrade))
        .route("/media/{profile}/{file}", get(media))
        .fallback(get(static_asset))
        .layer(middleware::from_fn_with_state(ctx.clone(), check_host))
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
            return Redirect::temporary(&format!("{base}/overlay.html?port={port}"))
                .into_response();
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

async fn media(
    State(ctx): State<Ctx>,
    headers: HeaderMap,
    Path((profile, file)): Path<(String, String)>,
) -> Response {
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
            // WebGL textures need CORS; it is granted only to our own pages, never to any site.
            if let Some(origin) = headers.get(header::ORIGIN) {
                if ctx.origin_ok(&headers) {
                    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
                }
            }
            h.insert(header::VARY, HeaderValue::from_static("Origin"));
            // Media names are content-unique UUIDs, so they never change in place.
            h.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=31536000, immutable"),
            );
            h.insert(
                "x-content-type-options",
                HeaderValue::from_static("nosniff"),
            );
            res
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn ws_upgrade(State(ctx): State<Ctx>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    if !ctx.origin_ok(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.on_upgrade(move |socket| client_loop(ctx, socket))
}

fn notify_clients(ctx: &Ctx) {
    let _ = ctx.app.emit("overlay://info", ctx.hub.info());
}

#[derive(Serialize, Clone)]
struct ClientEvent {
    id: u64,
    connected: bool,
}

#[derive(Serialize, Clone)]
struct SignalEvent<'a> {
    from: u64,
    message: &'a str,
}

async fn client_loop(ctx: Ctx, mut socket: WebSocket) {
    let mut rx = ctx.hub.tx.subscribe();
    let (id, mut direct) = ctx.hub.register();
    notify_clients(&ctx);

    let greeted = match ctx.hub.current_profile() {
        Some(profile) => socket
            .send(Message::Text(profile.as_ref().into()))
            .await
            .is_ok(),
        None => true,
    };
    if greeted {
        let _ = ctx.app.emit(
            "overlay://client",
            ClientEvent {
                id,
                connected: true,
            },
        );
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
                msg = direct.recv() => match msg {
                    Some(text) => {
                        if socket.send(Message::Text(text.as_ref().into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                },
                incoming = socket.recv() => match incoming {
                    Some(Ok(Message::Text(text))) => {
                        // Overlays only ever send WebRTC signaling back to the studio.
                        if text.len() <= MAX_SIGNAL_BYTES {
                            let _ = ctx.app.emit("overlay://signal", SignalEvent { from: id, message: text.as_str() });
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(_)) => {}
                },
            }
        }
    }

    ctx.hub.unregister(id);
    let _ = ctx.app.emit(
        "overlay://client",
        ClientEvent {
            id,
            connected: false,
        },
    );
    notify_clients(&ctx);
}
