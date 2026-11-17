mod guard;
mod server;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use serde::Serialize;
use tokio::sync::{broadcast, mpsc};

pub use server::start;

/// Loads the overlay key, creating it on first launch so the OBS URL stays stable.
pub fn load_or_create_key(path: &std::path::Path) -> std::io::Result<String> {
    if let Ok(k) = std::fs::read_to_string(path) {
        let k = k.trim();
        if k.len() == 32 && k.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(k.to_string());
        }
    }
    let key = uuid::Uuid::new_v4().simple().to_string();
    std::fs::write(path, &key)?;
    Ok(key)
}

pub const BASE_PORT: u16 = 39540;
pub const PORT_ATTEMPTS: u16 = 10;
pub const MAX_FRAME_BYTES: usize = 16 * 1024;
/// WebRTC offers, answers and ICE candidates stay well under this.
pub const MAX_SIGNAL_BYTES: usize = 64 * 1024;

/// Relay between the studio window and every overlay (OBS browser sources).
/// The studio owns the rig; overlays only render what they receive.
pub struct OverlayHub {
    /// Secret required on /ws and /media: binding to loopback still lets any local
    /// process connect, and the WebSocket carries the microphone over WebRTC.
    key: String,
    port: AtomicU16,
    next_id: AtomicU64,
    /// Direct channel to each connected overlay, used for per-client WebRTC signaling.
    clients: Mutex<HashMap<u64, mpsc::UnboundedSender<Arc<str>>>>,
    profile: RwLock<Option<Arc<str>>>,
    tx: broadcast::Sender<Arc<str>>,
}

#[derive(Serialize, Clone)]
pub struct OverlayInfo {
    pub port: u16,
    pub url: String,
    pub clients: usize,
    pub key: String,
}

impl OverlayHub {
    pub fn new(key: String) -> Self {
        let (tx, _) = broadcast::channel(8);
        Self {
            key,
            port: AtomicU16::new(0),
            next_id: AtomicU64::new(1),
            clients: Mutex::new(HashMap::new()),
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
                format!("http://127.0.0.1:{port}/overlay?key={}", self.key)
            },
            clients: self.client_ids().len(),
            key: self.key.clone(),
        }
    }

    pub fn client_ids(&self) -> Vec<u64> {
        let mut ids: Vec<u64> = self
            .clients
            .lock()
            .map(|c| c.keys().copied().collect())
            .unwrap_or_default();
        ids.sort_unstable();
        ids
    }

    fn register(&self) -> (u64, mpsc::UnboundedReceiver<Arc<str>>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::unbounded_channel();
        if let Ok(mut c) = self.clients.lock() {
            c.insert(id, tx);
        }
        (id, rx)
    }

    fn unregister(&self, id: u64) {
        if let Ok(mut c) = self.clients.lock() {
            c.remove(&id);
        }
    }

    pub fn send_to(&self, id: u64, message: String) -> Result<(), String> {
        if message.len() > MAX_SIGNAL_BYTES {
            return Err("message too large".into());
        }
        let clients = self.clients.lock().map_err(|_| "hub poisoned")?;
        let tx = clients.get(&id).ok_or("overlay not connected")?;
        tx.send(message.into())
            .map_err(|_| "overlay not connected".to_string())
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

    pub fn key_matches(&self, candidate: Option<&str>) -> bool {
        let Some(c) = candidate else { return false };
        let (a, b) = (self.key.as_bytes(), c.as_bytes());
        // Length leaks nothing useful (it is fixed); compare the bytes in constant time.
        a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
    }

    fn current_profile(&self) -> Option<Arc<str>> {
        self.profile.read().ok().and_then(|p| p.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn late_subscribers_get_profile_and_live_frames() {
        let hub = OverlayHub::new("k".repeat(32));
        hub.set_profile("p1".into());
        let mut rx = hub.tx.subscribe();
        assert_eq!(hub.current_profile().as_deref(), Some("p1"));
        hub.push_frame("f1".into()).unwrap();
        assert_eq!(&*rx.recv().await.unwrap(), "f1");
        assert!(hub.push_frame("x".repeat(MAX_FRAME_BYTES + 1)).is_err());
    }

    #[tokio::test]
    async fn direct_messages_reach_only_their_client() {
        let hub = OverlayHub::new("k".repeat(32));
        let (a, mut rx_a) = hub.register();
        let (b, mut rx_b) = hub.register();
        assert_eq!(hub.client_ids(), vec![a, b]);
        hub.send_to(b, "offer".into()).unwrap();
        assert_eq!(&*rx_b.recv().await.unwrap(), "offer");
        assert!(rx_a.try_recv().is_err());
        assert!(hub.send_to(b, "x".repeat(MAX_SIGNAL_BYTES + 1)).is_err());
        hub.unregister(b);
        assert!(hub.send_to(b, "late".into()).is_err());
        assert_eq!(hub.info().clients, 1);
    }

    #[test]
    fn url_is_empty_until_bound() {
        let hub = OverlayHub::new("k".repeat(32));
        assert!(hub.info().url.is_empty());
        hub.port.store(BASE_PORT, Ordering::Relaxed);
        assert!(hub
            .info()
            .url
            .starts_with("http://127.0.0.1:39540/overlay?key="));
        assert!(hub.key_matches(Some(&"k".repeat(32))));
        assert!(!hub.key_matches(Some("k")));
        assert!(!hub.key_matches(None));
    }
}
