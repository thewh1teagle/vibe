//! Durable phone credentials. An invitation can enroll one phone, but cannot
//! authorize transcription; each enrolled phone keeps its own revocable secret.

use std::sync::Mutex;

use chrono::Utc;
use eyre::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const CONFIG_KEY: &str = "handoff.pairing";
const MAX_DEVICES: usize = 100;
const MAX_NAME_CHARS: usize = 80;
static PAIRING_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub paired_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeviceCredential {
    id: String,
    name: String,
    paired_at: String,
    token_hash: String,
}

impl DeviceCredential {
    fn public(&self) -> PairedDevice {
        PairedDevice {
            id: self.id.clone(),
            name: self.name.clone(),
            paired_at: self.paired_at.clone(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PairingConfig {
    invitation_token: String,
    devices: Vec<DeviceCredential>,
}

fn valid_hex(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    bool::from(left.as_bytes().ct_eq(right.as_bytes()))
}

fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn normalize_name(name: &str) -> String {
    let name: String = name.chars().filter(|character| !character.is_control()).collect();
    let name: String = name.trim().chars().take(MAX_NAME_CHARS).collect();
    let name = name.trim_end();
    if name.is_empty() {
        "Phone".to_owned()
    } else {
        name.to_owned()
    }
}

impl PairingConfig {
    fn new(invitation_token: String) -> Self {
        Self {
            invitation_token,
            devices: Vec::new(),
        }
    }

    fn validate(&self) -> Result<()> {
        if !valid_hex(&self.invitation_token, 32) || self.devices.len() > MAX_DEVICES {
            bail!("Invalid saved phone pairing configuration");
        }
        for (index, device) in self.devices.iter().enumerate() {
            if !valid_hex(&device.id, 32)
                || !valid_hex(&device.token_hash, 64)
                || device.name != normalize_name(&device.name)
                || chrono::DateTime::parse_from_rfc3339(&device.paired_at).is_err()
                || self.devices[..index]
                    .iter()
                    .any(|previous| previous.id == device.id || constant_time_equal(&previous.token_hash, &device.token_hash))
            {
                bail!("Invalid saved phone device record");
            }
        }
        Ok(())
    }

    fn authorize(&self, token: &str) -> Option<String> {
        if !valid_hex(token, 32) {
            return None;
        }
        let hash = token_hash(token);
        self.devices
            .iter()
            .find(|device| constant_time_equal(&device.token_hash, &hash))
            .map(|device| device.id.clone())
    }

    fn pair(&mut self, invitation: &str, device_token: &str, name: &str) -> Result<PairedDevice> {
        if !valid_hex(device_token, 32) {
            bail!("Invalid phone credential");
        }
        let hash = token_hash(device_token);
        // A phone may retry after its original success response was lost. Its
        // credential authenticates that retry, even though the invitation rotated.
        if let Some(existing) = self
            .devices
            .iter()
            .find(|device| constant_time_equal(&device.token_hash, &hash))
        {
            return Ok(existing.public());
        }
        if !valid_hex(invitation, 32) || !constant_time_equal(invitation, &self.invitation_token) {
            bail!("This pairing code is no longer valid. Scan a new code from Vibe.");
        }
        if constant_time_equal(invitation, device_token) {
            bail!("Phone credential must differ from its pairing code");
        }
        if self.devices.len() >= MAX_DEVICES {
            bail!("Too many paired phones. Revoke a phone before pairing another.");
        }
        let mut id = super::generate_token();
        while self.devices.iter().any(|device| device.id == id) {
            id = super::generate_token();
        }
        let device = DeviceCredential {
            id,
            name: normalize_name(name),
            paired_at: Utc::now().to_rfc3339(),
            token_hash: hash,
        };
        let public = device.public();
        self.devices.push(device);
        self.refresh_invitation();
        Ok(public)
    }

    fn refresh_invitation(&mut self) -> String {
        let old = self.invitation_token.clone();
        loop {
            let next = super::generate_token();
            if !constant_time_equal(&next, &old) && self.authorize(&next).is_none() {
                self.invitation_token = next;
                return self.invitation_token.clone();
            }
        }
    }

    fn revoke(&mut self, id: &str) {
        self.devices.retain(|device| device.id != id);
    }
}

fn migrate_invitation(app: &AppHandle) -> Result<String> {
    let path = super::handoff_dir(app)?.join("token");
    match std::fs::read_to_string(&path) {
        Ok(value) if valid_hex(value.trim(), 32) => Ok(value.trim().to_owned()),
        Ok(_) => Ok(super::generate_token()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(super::generate_token()),
        Err(error) => Err(error).context("Failed to read existing phone pairing code"),
    }
}

fn persist_config(
    previous: Option<serde_json::Value>,
    next: serde_json::Value,
    write: impl Fn(Option<serde_json::Value>),
    save: impl FnOnce() -> Result<()>,
    after_initial_save: impl FnOnce(),
) -> Result<()> {
    if previous.as_ref() == Some(&next) {
        return Ok(());
    }
    let initial_save = previous.is_none();
    write(Some(next));
    if let Err(error) = save() {
        // Never report an enrollment/revocation as successful if it was not
        // persisted. Restore the cache so later calls see the original state.
        write(previous);
        return Err(error).context("Failed to save phone pairing configuration");
    }
    if initial_save {
        after_initial_save();
    }
    Ok(())
}

fn with_config<T>(app: &AppHandle, operation: impl FnOnce(&mut PairingConfig) -> Result<T>) -> Result<T> {
    let _guard = PAIRING_LOCK
        .lock()
        .map_err(|_| eyre::eyre!("Phone pairing store lock failed"))?;
    let store = app.store(crate::config::STORE_FILENAME)?;
    let previous = store.get(CONFIG_KEY);
    let mut config = match &previous {
        Some(value) => {
            serde_json::from_value::<PairingConfig>(value.clone()).context("Invalid saved phone pairing configuration")?
        }
        None => PairingConfig::new(migrate_invitation(app)?),
    };
    config.validate()?;
    let result = operation(&mut config)?;
    let next = serde_json::to_value(&config)?;
    persist_config(
        previous,
        next,
        |value| match value {
            Some(value) => store.set(CONFIG_KEY, value),
            None => {
                store.delete(CONFIG_KEY);
            }
        },
        || store.save().map_err(Into::into),
        || {
            // Once migrated, the legacy invitation must never be imported again
            // after a config reset. Keep it until the new config is safely saved.
            let cleanup = super::handoff_dir(app).and_then(|directory| match std::fs::remove_file(directory.join("token")) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(error.into()),
            });
            if let Err(error) = cleanup {
                tracing::warn!("could not retire legacy phone pairing token: {error}");
            }
        },
    )?;
    Ok(result)
}

pub fn invitation(app: &AppHandle) -> Result<String> {
    with_config(app, |config| Ok(config.invitation_token.clone()))
}

pub fn snapshot(app: &AppHandle) -> Result<(String, Vec<PairedDevice>)> {
    with_config(app, |config| {
        Ok((
            config.invitation_token.clone(),
            config.devices.iter().map(DeviceCredential::public).collect(),
        ))
    })
}

pub fn pair(app: &AppHandle, invitation: &str, device_token: &str, name: &str) -> Result<PairedDevice> {
    with_config(app, |config| config.pair(invitation, device_token, name))
}

pub fn authorize(app: &AppHandle, token: &str) -> Result<Option<String>> {
    with_config(app, |config| Ok(config.authorize(token)))
}

pub fn refresh_invitation(app: &AppHandle) -> Result<String> {
    with_config(app, |config| Ok(config.refresh_invitation()))
}

pub fn revoke(app: &AppHandle, id: &str) -> Result<()> {
    with_config(app, |config| {
        config.revoke(id);
        Ok(())
    })
}

pub fn revoke_all(app: &AppHandle) -> Result<()> {
    with_config(app, |config| {
        config.devices.clear();
        config.refresh_invitation();
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const INVITATION: &str = "11111111111111111111111111111111";
    const PHONE_A: &str = "22222222222222222222222222222222";
    const PHONE_B: &str = "33333333333333333333333333333333";

    #[test]
    fn device_credentials_survive_restart_without_exposing_secrets() {
        let mut config = PairingConfig::new(INVITATION.into());
        let device = config.pair(INVITATION, PHONE_A, "Alice’s iPhone").unwrap();
        let persisted = serde_json::to_string(&config).unwrap();
        assert!(!persisted.contains(PHONE_A));
        let restored: PairingConfig = serde_json::from_str(&persisted).unwrap();
        restored.validate().unwrap();
        assert_eq!(restored.authorize(PHONE_A), Some(device.id.clone()));
        let public = serde_json::to_value(&device).unwrap();
        assert_eq!(public.as_object().unwrap().len(), 3);
        assert!(public.get("pairedAt").is_some());
        assert!(public.get("tokenHash").is_none());
    }

    #[test]
    fn invitations_are_single_use_and_never_authorize_transcription() {
        let mut config = PairingConfig::new(INVITATION.into());
        assert_eq!(config.authorize(INVITATION), None);
        assert!(config.pair(PHONE_B, PHONE_A, "Phone").is_err());
        assert!(config.pair(INVITATION, INVITATION, "Phone").is_err());
        let device = config.pair(INVITATION, PHONE_A, "Phone").unwrap();
        assert!(config.pair(INVITATION, PHONE_B, "Other phone").is_err());
        assert_eq!(config.pair(INVITATION, PHONE_A, "Retry").unwrap(), device);
        assert_eq!(config.devices.len(), 1);
        assert_eq!(config.authorize(INVITATION), None);
        assert_eq!(config.authorize(&config.invitation_token), None);
    }

    #[test]
    fn refresh_and_individual_revocation_preserve_other_phones() {
        let mut config = PairingConfig::new(INVITATION.into());
        let first = config.pair(INVITATION, PHONE_A, "First phone").unwrap();
        let next_invitation = config.invitation_token.clone();
        let second = config.pair(&next_invitation, PHONE_B, "Second phone").unwrap();
        let old_invitation = config.invitation_token.clone();
        config.refresh_invitation();
        assert_ne!(config.invitation_token, old_invitation);
        assert_eq!(config.authorize(PHONE_A), Some(first.id.clone()));
        assert_eq!(config.authorize(PHONE_B), Some(second.id.clone()));
        config.revoke(&first.id);
        assert_eq!(config.authorize(PHONE_A), None);
        assert_eq!(config.authorize(PHONE_B), Some(second.id));
        assert!(config.pair(INVITATION, PHONE_A, "Revoked").is_err());
        assert!(config.pair(&old_invitation, PHONE_A, "Revoked").is_err());
        config.revoke(&first.id); // Repeated revocation is harmless.
        assert_eq!(config.devices.len(), 1);
    }

    #[test]
    fn names_are_bounded_and_invalid_records_fail_closed() {
        let mut config = PairingConfig::new(INVITATION.into());
        let device = config.pair(INVITATION, PHONE_A, "  \nMy\tphone\0  ").unwrap();
        assert_eq!(device.name, "Myphone");
        assert_eq!(normalize_name(" \n\t"), "Phone");
        assert_eq!(normalize_name(&"📱".repeat(100)).chars().count(), 80);
        let boundary_space = format!("{} extra", "a".repeat(79));
        assert_eq!(normalize_name(&boundary_space), "a".repeat(79));
        config.devices[0].token_hash = "broken".into();
        assert!(config.validate().is_err());
        assert!(serde_json::from_str::<PairingConfig>(r#"{"invitationToken":null,"devices":[]}"#).is_err());
        assert!(serde_json::from_str::<PairingConfig>(r#"{"invitationToken":"11111111111111111111111111111111"}"#).is_err());
    }

    #[test]
    fn enrollment_limit_does_not_block_existing_phone_retries() {
        let mut config = PairingConfig::new(INVITATION.into());
        let first = config.pair(INVITATION, PHONE_A, "First").unwrap();
        for index in 1..MAX_DEVICES {
            let invitation = config.invitation_token.clone();
            config.pair(&invitation, &format!("{index:032x}"), "Phone").unwrap();
        }
        let invitation = config.invitation_token.clone();
        assert!(config.pair(&invitation, PHONE_B, "Too many").is_err());
        assert_eq!(config.invitation_token, invitation);
        assert_eq!(config.pair(INVITATION, PHONE_A, "Retry").unwrap(), first);
    }

    #[test]
    fn failed_save_restores_existing_or_absent_configuration() {
        use std::cell::RefCell;

        let original = PairingConfig::new(INVITATION.into());
        let mut enrolled = original.clone();
        enrolled.pair(INVITATION, PHONE_A, "Phone").unwrap();
        let next = serde_json::to_value(&enrolled).unwrap();
        for previous in [None, Some(serde_json::to_value(&original).unwrap())] {
            let cache = RefCell::new(previous.clone());
            let result = persist_config(
                previous.clone(),
                next.clone(),
                |value| *cache.borrow_mut() = value,
                || {
                    assert_eq!(*cache.borrow(), Some(next.clone()));
                    bail!("disk full")
                },
                || panic!("failed saves must preserve the legacy invitation"),
            );
            assert!(result.is_err());
            assert_eq!(*cache.borrow(), previous);
        }
    }

    #[test]
    fn legacy_invitation_is_retired_only_after_successful_initial_save() {
        use std::cell::Cell;

        let config = serde_json::to_value(PairingConfig::new(INVITATION.into())).unwrap();
        let saved = Cell::new(false);
        let retired = Cell::new(false);
        persist_config(
            None,
            config.clone(),
            |_| {},
            || {
                assert!(!retired.get());
                saved.set(true);
                Ok(())
            },
            || {
                assert!(saved.get());
                retired.set(true);
            },
        )
        .unwrap();
        assert!(retired.get());

        let mut changed = PairingConfig::new(INVITATION.into());
        changed.refresh_invitation();
        persist_config(
            Some(config),
            serde_json::to_value(changed).unwrap(),
            |_| {},
            || Ok(()),
            || panic!("existing configurations must not repeat migration cleanup"),
        )
        .unwrap();
    }
}
