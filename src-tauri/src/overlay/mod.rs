mod server;

use std::sync::atomic::{AtomicU16, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use serde::Serialize;
use tokio::sync::broadcast;

pub use server::start;

pub const BASE_PORT: u16 = 39540;
pub const PORT_ATTEMPTS: u16 = 10;
pub const MAX_FRAME_BYTES: usize = 16 * 1024;

/// Relay between the studio window and every overlay (OBS browser sources).
/// The studio owns the rig; overlays only render what they receive.
pub struct OverlayHub {
    port: AtomicU16,
    clients: AtomicUsize,
    profile: RwLock<Option<Arc<str>>>,
    tx: broadcast::Sender<Arc<str>>,
}

#[derive(Serialize, Clone)]
pub struct OverlayInfo {
    pub port: u16,
    pub url: String,
    pub clients: usize,
}

impl OverlayHub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(8);
        Self {
            port: AtomicU16::new(0),
            clients: AtomicUsize::new(0),
            profile: RwLock::new(None),
            tx,
        }
    }

    pub fn info(&self) -> OverlayInfo {
        let port = self.port.load(Ordering::Relaxed);
        OverlayInfo {
            port,
            url: if port == 0 {
                String::new()
            } else {
                format!("http://127.0.0.1:{port}/overlay")
            },
            clients: self.clients.load(Ordering::Relaxed),
        }
    }

    pub fn set_profile(&self, message: String) {
        let message: Arc<str> = message.into();
        if let Ok(mut slot) = self.profile.write() {
            *slot = Some(message.clone());
        }
        let _ = self.tx.send(message);
    }

    pub fn push_frame(&self, message: String) -> Result<(), String> {
        if message.len() > MAX_FRAME_BYTES {
            return Err("frame too large".into());
        }
        let _ = self.tx.send(message.into());
        Ok(())
    }

    fn current_profile(&self) -> Option<Arc<str>> {
        self.profile.read().ok().and_then(|p| p.clone())
    }
}

impl Default for OverlayHub {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn late_subscribers_get_profile_and_live_frames() {
        let hub = OverlayHub::new();
        hub.set_profile("p1".into());
        let mut rx = hub.tx.subscribe();
        assert_eq!(hub.current_profile().as_deref(), Some("p1"));
        hub.push_frame("f1".into()).unwrap();
        assert_eq!(&*rx.recv().await.unwrap(), "f1");
        assert!(hub.push_frame("x".repeat(MAX_FRAME_BYTES + 1)).is_err());
    }

    #[test]
    fn url_is_empty_until_bound() {
        let hub = OverlayHub::new();
        assert!(hub.info().url.is_empty());
        hub.port.store(BASE_PORT, Ordering::Relaxed);
        assert_eq!(hub.info().url, "http://127.0.0.1:39540/overlay");
    }
}
