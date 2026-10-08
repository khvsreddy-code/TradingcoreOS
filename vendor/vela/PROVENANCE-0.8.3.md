# Vela vendor provenance

Target source: `@luxalgo/vela@0.8.3`

Supplied source archive:

- File: `Vela-main(2).zip`
- SHA-256: `e14ee0ad50d5a7bedd638ce2711cf1a996ce771dc2782f6d4c1a716a947a2f5b`
- Source files under `src/`: 381

The repository's current `vendor/vela` tree is a TCO-maintained fork and is **not byte-identical** to the supplied 0.8.3 archive. This file records the authoritative upgrade source; it must not be treated as proof that the vendor has already been fully replaced.

Use `node tools/sync-vela-vendor.mjs <path-to-extracted-Vela-main>` to perform the controlled source replacement locally. The sync copies the upstream package metadata plus `src`, `LICENSE`, `NOTICE`, `README.md`, and `CHANGELOG.md`, after validating `@luxalgo/vela` version `0.8.3`.
