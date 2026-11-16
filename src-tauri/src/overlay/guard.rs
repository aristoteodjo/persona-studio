//! Request guards for the local overlay server. Binding to 127.0.0.1 is not enough:
//! any web page the user opens can reach it, so Host and Origin are checked too.

/// Rejects DNS-rebinding requests: only the loopback names on our own port are accepted.
pub fn host_allowed(host: Option<&str>, port: u16) -> bool {
    match host {
        Some(h) => h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}"),
        None => false,
    }
}

/// Origins allowed to open the WebSocket and read media through CORS: the overlay
/// itself, the studio webview and, in development, the Vite server.
/// A missing Origin means a non-browser client (OBS plugins, curl), which a web page cannot forge.
pub fn origin_allowed(origin: Option<&str>, port: u16, dev_origin: Option<&str>) -> bool {
    let Some(origin) = origin else { return true };
    origin == format!("http://127.0.0.1:{port}")
        || origin == format!("http://localhost:{port}")
        || origin == "tauri://localhost"
        || origin == "http://tauri.localhost"
        || dev_origin.is_some_and(|d| d == origin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_must_be_loopback_on_our_port() {
        assert!(host_allowed(Some("127.0.0.1:39540"), 39540));
        assert!(host_allowed(Some("localhost:39540"), 39540));
        assert!(!host_allowed(Some("evil.example:39540"), 39540));
        assert!(!host_allowed(Some("127.0.0.1:1"), 39540));
        assert!(!host_allowed(None, 39540));
    }

    #[test]
    fn foreign_origins_are_rejected() {
        let dev = Some("http://localhost:1436");
        assert!(origin_allowed(None, 39540, None));
        assert!(origin_allowed(Some("http://127.0.0.1:39540"), 39540, None));
        assert!(origin_allowed(Some("tauri://localhost"), 39540, None));
        assert!(origin_allowed(Some("http://localhost:1436"), 39540, dev));
        assert!(!origin_allowed(Some("http://localhost:1436"), 39540, None));
        assert!(!origin_allowed(Some("https://evil.example"), 39540, dev));
        assert!(!origin_allowed(Some("null"), 39540, dev));
    }
}
