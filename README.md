# @kaigilb/twinpod-auth

Solid-OIDC authentication composable for Vue 3 apps connecting to a TwinPod server.

Handles login, logout, and OIDC redirect processing via `@inrupt/solid-client-authn-browser`.

---

## Install

```bash
npm install @kaigilb/twinpod-auth
```

Requires a `.npmrc` pointing `@kaigilb` at GitHub Packages:

```
@kaigilb:registry=https://npm.pkg.github.com
```

---

## Public API

### `useTwinPodAuth(options?)`

```js
import { useTwinPodAuth } from '@kaigilb/twinpod-auth'

const {
  isLoggedIn,     // Ref<boolean>  — true when an active session exists
  webId,          // Ref<string|null>  — the authenticated user's WebID URI
  loading,        // Ref<boolean>  — true while any auth operation is in progress
  error,          // Ref<{type, message}|null>  — set when any operation fails
  session,        // Session object — use session.fetch as a DPoP-aware fetch replacement
  handleRedirect, // () => Promise<void>  — call once on every page load
  login,          // (oidcIssuer, redirectUrl?) => Promise<void>
  logout          // () => Promise<void>
} = useTwinPodAuth({ clientName: 'MyApp' })
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientName` | `string` | `'NoteWorld'` | App name shown in the OIDC consent screen |
| `_sessionOverride` | `object\|null` | `null` | Inject a mock Session in tests |

---

## Usage

### 1. Wrap your app (App.vue)

Call `useTwinPodAuth` once at the app root. Provide `auth` and `twinpodFetch` to all child components.

```vue
<script setup>
import { provide, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTwinPodAuth } from '@kaigilb/twinpod-auth'

const router = useRouter()
const route = useRoute()

const { isLoggedIn, webId, loading, error, session, handleRedirect, login, logout } =
  useTwinPodAuth({ clientName: 'MyApp' })

// Provide DPoP-aware fetch for child composables that read/write TwinPod data
provide('twinpodFetch', (url, options) => session.fetch(url, options))
provide('auth', { isLoggedIn, webId, loading, error, login, logout })

onMounted(async () => {
  await handleRedirect()
  if (isLoggedIn.value && route.path === '/login') router.push('/')
  else if (!isLoggedIn.value && route.path !== '/login') router.push('/login')
})
</script>
```

### 2. Login view

```vue
<script setup>
import { inject } from 'vue'
const { login, loading, error } = inject('auth')
</script>

<template>
  <button @click="login(import.meta.env.VITE_TWINPOD_URL)" :disabled="loading">
    Connect to TwinPod
  </button>
</template>
```

### 3. TwinPod data composables

```js
const twinpodFetch = inject('twinpodFetch')
const response = await twinpodFetch(podUrl)  // DPoP auth headers added automatically
```

---

## Environment variable

Set `VITE_TWINPOD_URL` in your `.env.local` to the TwinPod OIDC issuer URL:

```
VITE_TWINPOD_URL=https://tst-first.demo.systemtwin.com/i
```

---

## Spec

`/Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md`
