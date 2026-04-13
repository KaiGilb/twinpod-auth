// UNIT_TYPE=Hook

/**
 * Manages Solid-OIDC authentication against a TwinPod server.
 *
 * Uses a module-level Session singleton so that all callers within one app
 * share a single authenticated session. Provide the returned state and
 * functions via Vue's provide/inject rather than calling this composable in
 * multiple components.
 *
 * @param {object} [options]
 * @param {string} [options.clientName='NoteWorld'] - App name shown in the OIDC consent screen
 * @param {object|null} [options._sessionOverride=null] - Inject a mock Session in tests; leave null in production
 *
 * @returns {{
 *   isLoggedIn: import('vue').Ref<boolean>,
 *   webId:      import('vue').Ref<string|null>,
 *   loading:    import('vue').Ref<boolean>,
 *   error:      import('vue').Ref<{type: string, message: string}|null>,
 *   session:    object,
 *   handleRedirect: () => Promise<void>,
 *   login:      (oidcIssuer: string, redirectUrl?: string) => Promise<void>,
 *   logout:     () => Promise<void>
 * }}
 *
 * Preconditions: must be called inside a Vue component setup or equivalent context.
 * Errors: exposes error.value with type 'auth' when any OIDC operation fails.
 *
 * @example
 * const { isLoggedIn, webId, session, handleRedirect, login, logout } = useTwinPodAuth()
 * provide('twinpodFetch', (url, options) => session.fetch(url, options))
 */

import { ref } from 'vue'
import { Session } from '@inrupt/solid-client-authn-browser'

// Module-level singleton — one Session per app, shared across all composable calls.
// This matches Solid-OIDC's expectation of a single in-memory token store.
const session = new Session()

export function useTwinPodAuth({ clientName = 'NoteWorld', _sessionOverride = null } = {}) {
  // --- Session selection ---

  // Tests pass a mock via _sessionOverride; production always uses the singleton.
  const _session = _sessionOverride ?? session

  // --- Reactive state ---

  const isLoggedIn = ref(_session.info.isLoggedIn)
  const webId = ref(_session.info.webId ?? null)
  const loading = ref(false)
  const error = ref(null)

  // --- handleRedirect ---

  /**
   * Must be called once on every page load (including after OIDC redirect).
   * If the URL contains an OIDC code/token, the library completes the flow.
   * If not, it is a no-op.
   * restorePreviousSession: true re-hydrates a stored session across page refreshes.
   */
  async function handleRedirect() {
    loading.value = true
    error.value = null
    try {
      await _session.handleIncomingRedirect({
        url: window.location.href,
        restorePreviousSession: true
      })
      // Read updated auth state after the redirect is processed
      isLoggedIn.value = _session.info.isLoggedIn
      webId.value = _session.info.webId ?? null
    } catch (e) {
      error.value = { type: 'auth', message: e.message }
    } finally {
      loading.value = false
    }
  }

  // --- login ---

  /**
   * Initiates the OIDC login flow. The browser will be redirected to the
   * TwinPod OIDC server; this function does not return in the normal case.
   * If login throws (e.g. invalid issuer), error.value is set instead.
   */
  async function login(oidcIssuer, redirectUrl = window.location.origin) {
    error.value = null
    try {
      await _session.login({ oidcIssuer, redirectUrl, clientName })
    } catch (e) {
      error.value = { type: 'auth', message: e.message }
    }
  }

  // --- logout ---

  /**
   * Logs out locally (clears tokens from memory/storage).
   * logoutType: 'app' performs a local-only logout without hitting the IdP's
   * revocation endpoint, which avoids a second redirect.
   */
  async function logout() {
    error.value = null
    try {
      await _session.logout({ logoutType: 'app' })
      isLoggedIn.value = false
      webId.value = null
    } catch (e) {
      error.value = { type: 'auth', message: e.message }
    }
  }

  // --- Expose ---

  return { isLoggedIn, webId, loading, error, session: _session, handleRedirect, login, logout }
}
