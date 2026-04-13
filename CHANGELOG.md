# Changelog

## [1.0.1] - 2026-04-13
### Fixed
- `login()` now sets `loading.value = true/false` — button is correctly disabled during the OIDC flow
- `logout()` now sets `loading.value = true/false` — Logout button is correctly disabled during the call

## [1.0.0] - 2026-04-13
### Initial release
- `useTwinPodAuth` composable — Solid-OIDC login, logout, and redirect handling against TwinPod
