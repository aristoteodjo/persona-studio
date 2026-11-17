mod guard;
mod server;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use serde::Serialize;
use tokio::sync::{broadcast, mpsc};

pub use server::start;

pub const BASE_PORT: u16 = 39540;
pub const PORT_ATTEMPTS: u16 = 10;
pub const MAX_FRAME_BYTES: usize = 16 * 1024;
/// WebRTC offers, answers and ICE candidates stay well under this.
pub const MAX_SIGNAL_BYTES: usize = 64 * 1024;

/// Relay between the studio window and every overlay (OBS browser sources).
/// The studio owns the rig; overlays only render what they receive.
pub struct OverlayHub {
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
}

impl OverlayHub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(8);
        Self {
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
                format!("http://127.0.0.1:{port}/overlay")
            },
            clients: self.client_ids().len(),
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

    #[tokio::test]
    async fn direct_messages_reach_only_their_client() {
        let hub = OverlayHub::new();
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
        let hub = OverlayHub::new();
        assert!(hub.info().url.is_empty());
        hub.port.store(BASE_PORT, Ordering::Relaxed);
        assert_eq!(hub.info().url, "http://127.0.0.1:39540/overlay");
    }
}
