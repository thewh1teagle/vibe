//! Relay URLs without the trailing dot, so WebKit can open them.
//!
//! iroh's default relay map names its relays as fully qualified hosts
//! (`https://euc1-1.relay.n0.iroh.link./`, see `iroh::defaults::prod`), and a
//! desktop on that map publishes the same dotted URL as its home relay. Safari
//! and every iOS browser reject a `wss://` connection to the dotted host form
//! ("The certificate was rejected by the server"), while the dot-free name is
//! the same host and the same relay server (iroh issue #4519).
//!
//! So the phone never dials a dotted relay host:
//! - its own relay map is n0's default map with the dot removed, which covers
//!   its home relay and the net-report HTTPS probes;
//! - every relay URL that address lookup returns for a desktop is rewritten
//!   before iroh sees it, so the phone dials the desktop's home relay by its
//!   dot-free name. A relay server routes by endpoint id, so the desktop,
//!   connected to the dotted name, and the phone, connected to the dot-free
//!   name, still meet on it. Desktops need no change.
//!
//! Otherwise this mirrors `presets::N0` in the locked iroh: the `Minimal`
//! preset (crypto provider), the n0 pkarr publisher and resolver, and n0's
//! relays.

use std::sync::Arc;

use iroh::{
    address_lookup::{
        AddressLookup, AddressLookupBuilder, AddressLookupBuilderError, EndpointData,
        EndpointInfo, Error, Item, PkarrPublisher, PkarrResolver,
    },
    endpoint::{presets, Builder},
    Endpoint, EndpointId, RelayConfig, RelayMap, RelayMode, RelayUrl,
};
use n0_future::{boxed::BoxStream, StreamExt};

/// An endpoint builder equivalent to `presets::N0`, minus the dotted relay hosts.
pub fn endpoint_builder() -> Builder {
    Endpoint::builder(presets::Minimal)
        .relay_mode(RelayMode::Custom(relay_map()))
        .address_lookup(PkarrPublisher::n0_dns())
        .address_lookup(DotFree(PkarrResolver::n0_dns()))
}

/// n0's production relay map, with each relay host made dot-free.
pub fn relay_map() -> RelayMap {
    iroh::defaults::prod::default_relay_map()
        .relays::<Vec<Arc<RelayConfig>>>()
        .into_iter()
        .map(|config| {
            let mut config = Arc::unwrap_or_clone(config);
            config.url = dot_free(&config.url);
            config
        })
        .collect()
}

/// `https://host.example./` becomes `https://host.example/`; anything else is
/// returned unchanged.
pub fn dot_free(url: &RelayUrl) -> RelayUrl {
    let Some(host) = url.host_str().and_then(|host| host.strip_suffix('.')) else {
        return url.clone();
    };
    let mut inner: url::Url = (**url).clone();
    match inner.set_host(Some(host)) {
        Ok(()) => RelayUrl::from(inner),
        Err(_) => url.clone(),
    }
}

/// Wraps an address lookup builder so the lookup it builds reports dot-free
/// relay URLs.
#[derive(Debug)]
pub struct DotFree<B>(pub B);

impl<B: AddressLookupBuilder> AddressLookupBuilder for DotFree<B> {
    fn into_address_lookup(
        self,
        endpoint: &Endpoint,
    ) -> Result<impl AddressLookup, AddressLookupBuilderError> {
        Ok(DotFreeLookup(self.0.into_address_lookup(endpoint)?))
    }
}

#[derive(Debug)]
struct DotFreeLookup<L>(L);

impl<L: AddressLookup> AddressLookup for DotFreeLookup<L> {
    fn publish(&self, data: &EndpointData) {
        self.0.publish(data);
    }

    fn resolve(&self, endpoint_id: EndpointId) -> Option<BoxStream<Result<Item, Error>>> {
        let items = self.0.resolve(endpoint_id)?;
        Some(Box::pin(items.map(|item| item.map(dot_free_item))))
    }
}

fn dot_free_item(item: Item) -> Item {
    let provenance = item.provenance();
    let last_updated = item.last_updated();
    let mut info = EndpointInfo::from(item);
    let relays: Vec<RelayUrl> = info.data.relay_urls().map(dot_free).collect();
    info.data.clear_relay_urls();
    for relay in relays {
        info.data.add_relay_url(relay);
    }
    Item::new(info, provenance, last_updated)
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use iroh::SecretKey;

    use super::*;

    fn url(raw: &str) -> RelayUrl {
        raw.parse().unwrap()
    }

    #[test]
    fn strips_the_trailing_dot() {
        let stripped = dot_free(&url("https://euc1-1.relay.n0.iroh.link./"));
        assert_eq!(stripped.as_str(), "https://euc1-1.relay.n0.iroh.link/");
        assert_eq!(stripped, url("https://euc1-1.relay.n0.iroh.link"));
    }

    #[test]
    fn keeps_everything_else() {
        for raw in [
            "https://euc1-1.relay.n0.iroh.link/",
            "https://relay.example:8443/path?x=1",
            "http://127.0.0.1:3340/",
            "http://[::1]:3340/",
        ] {
            assert_eq!(dot_free(&url(raw)), url(raw));
        }
        assert_eq!(
            dot_free(&url("https://relay.example.:8443/a")).as_str(),
            "https://relay.example:8443/a"
        );
    }

    #[test]
    fn relay_map_is_n0_without_dots() {
        let map = relay_map();
        let default = iroh::defaults::prod::default_relay_map();
        assert_eq!(map.len(), default.len());
        for config in default.relays::<Vec<_>>() {
            assert!(config.url.host_str().unwrap().ends_with('.'), "n0 map changed");
            let ours = map.get(&dot_free(&config.url)).expect("relay kept");
            assert_eq!(ours.quic, config.quic);
        }
        for relay in map.urls::<Vec<_>>() {
            assert!(!relay.host_str().unwrap().ends_with('.'), "{relay}");
        }
    }

    #[test]
    fn lookup_items_get_dot_free_relays_and_keep_ip_addrs() {
        let id = SecretKey::generate().public();
        let ip: SocketAddr = "192.0.2.1:4433".parse().unwrap();
        let info = EndpointInfo::new(id)
            .with_relay_url(url("https://euc1-1.relay.n0.iroh.link./"))
            .with_ip_addrs(vec![ip]);
        let item = dot_free_item(Item::new(info, "pkarr", Some(7)));
        assert_eq!(item.provenance(), "pkarr");
        assert_eq!(item.last_updated(), Some(7));
        assert_eq!(item.endpoint_id(), id);
        assert_eq!(
            item.relay_urls().collect::<Vec<_>>(),
            vec![&url("https://euc1-1.relay.n0.iroh.link/")]
        );
        assert_eq!(item.ip_addrs().collect::<Vec<_>>(), vec![&ip]);
    }
}
