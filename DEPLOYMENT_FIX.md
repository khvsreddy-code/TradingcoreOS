# Vercel deployment fix — V30.5

## Root cause
The deployment resolver was given incompatible direct requirements:

- `fyers-apiv3` requires `websocket-client==1.6.1`
- the project required `websocket-client>=1.8`

The resolver therefore had no valid dependency solution and correctly stopped at:

`No solution found when resolving dependencies`

Earlier builds also contained the same class of conflict for `requests`: FYERS requires
`requests==2.31.0`, while the project required `requests>=2.32`.

## Fix
`requirements.txt` now pins the FYERS-compatible dependency graph:

- `fyers-apiv3==3.1.16`
- `websocket-client==1.6.1`
- `requests==2.31.0`

The generated `__pycache__` files are also excluded from the deployment archive.

## Why this is safe for the existing code
The backend imports the `websocket` client for its broker bridge and imports
`fyers_apiv3` lazily inside the FYERS adapter. `websocket-client==1.6.1` provides the
API used by the existing server code, so no application-level websocket API change is
required.

## Important Vercel/runtime note
The Vercel build log is the source of truth: the previous failure occurred during
dependency installation, before application code was built. This fix addresses that
failure directly rather than changing unrelated frontend/backend behavior.

After pushing this archive, use a fresh deployment/build (or clear the Vercel build cache)
so the resolver does not reuse a failed dependency state.
