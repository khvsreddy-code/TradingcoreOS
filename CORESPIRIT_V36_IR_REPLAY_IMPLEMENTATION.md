# CoreSpirit v36 — IR + Replay implementation

Implemented:

- Stable IR v1 contract with canonical opcode allowlist and structural validation.
- Canonical IR serialization for cache/persistence/worker transport.
- Executable artifacts now validate against the IR contract and derive identity from canonical IR.
- Compiler refuses to produce an artifact if generated IR violates the stable contract.
- Replay service consumes validated IR directly; it does not execute AST nodes.
- Deterministic replay returns output/state/per-bar trace checksums.
- Determinism helper runs the same IR+dataset twice and fails on checksum divergence.
- Stage 36 contract covers IR validation, opcode stability, and replay determinism.
