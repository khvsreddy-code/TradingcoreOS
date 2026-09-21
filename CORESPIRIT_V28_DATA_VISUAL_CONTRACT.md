# CoreSpirit v28 Data + Visual Contract

## Data

- `CoreSpiritDataState`: historical | confirmed | developing | realtime.
- `CoreSpiritDataSnapshot`: value + provenance + timestamp + state + revision metadata.
- `CoreSpiritDataCache`: bounded host-side LRU-like cache; no network access.
- `alignSnapshots()`: last-known-value alignment that does not fabricate a leading value.
- `groupIntrabars()`: deterministic parent-bar grouping for lower-timeframe observations.

## Visualization

- `CoreSpiritFootprintScene`: normalized row intensities for high-cardinality footprint rendering.
- `CoreSpiritObject(kind=footprint)`: renderer-independent footprint scene intent.
- Chart controller renders rows on the existing canvas overlay, preserving the Lightweight Charts series count.

## Next

1. feed-native footprint adapters
2. session/calendar-aware alignment
3. multi-pane scene graph
4. viewport virtualization
5. hot reload transactional frames
6. first-class `features {}` and `model {}` lowering
