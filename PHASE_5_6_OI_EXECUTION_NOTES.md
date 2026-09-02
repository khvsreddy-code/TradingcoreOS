# OI overlay upgrade

The OI layer is now a renderer-friendly contract rather than a chart-only flag. `/api/oi/summary` returns PCR, max pain, call/put walls, OI support/resistance and movement classifications.

The browser renderer supports:
- strength-weighted wall thickness
- opacity based on OI concentration
- call/put heat zones
- CE/PE labels with OI and delta OI
- independently togglable layers
- max-pain line
- buildup/unwinding data for future markers

The renderer waits for a broker-normalized option-chain payload. It does not fabricate broker OI data.
