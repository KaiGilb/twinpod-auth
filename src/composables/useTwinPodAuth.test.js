import { describe, test, expect, vi } from 'vitest'

// Mock the Solid OIDC library — Session constructor uses browser APIs not available in jsdom.
// All tests inject sessions via _sessionOverride; this mock only prevents the module-level
// `new Session()` from throwing at import time.
vi.mock('@inrupt/solid-client-authn-browser', () => ({
  Session: vi.fn().mockImplementation(() => ({
    info: { isLoggedIn: false, webId: null },
    handleIncomingRedirect: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn()
  }))
}))

import { useTwinPodAuth } from './useTwinPodAuth.js'

// Factory — creates a fresh mock session for each test to avoid shared state.
function makeMockSession({ isLoggedIn = false, webId = null } = {}) {
  return {
    info: { isLoggedIn, webId },
    handleIncomingRedirect: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn()
  }
}

describe('useTwinPodAuth', () => {

  describe('initial state', () => {

    test('isLoggedIn is false when session is not authenticated', () => {
      const mock = makeMockSession({ isLoggedIn: false })
      const { isLoggedIn } = useTwinPodAuth({ _sessionOverride: mock })
      expect(isLoggedIn.value).toBe(false)
    })

    test('webId is null when session is not authenticated', () => {
      const mock = makeMockSession({ webId: null })
      const { webId } = useTwinPodAuth({ _sessionOverride: mock })
      expect(webId.value).toBeNull()
    })

    test('isLoggedIn reflects an already-active session', () => {
      const mock = makeMockSession({ isLoggedIn: true, webId: 'https://pod.example.com/profile/card#me' })
      const { isLoggedIn } = useTwinPodAuth({ _sessionOverride: mock })
      expect(isLoggedIn.value).toBe(true)
    })

    test('loading starts as false', () => {
      const mock = makeMockSession()
      const { loading } = useTwinPodAuth({ _sessionOverride: mock })
      expect(loading.value).toBe(false)
    })

    test('error starts as null', () => {
      const mock = makeMockSession()
      const { error } = useTwinPodAuth({ _sessionOverride: mock })
      expect(error.value).toBeNull()
    })

  })

  // Spec: F.NoteWorld — OIDC redirect must be processed on every page load to establish/restore session
  describe('handleRedirect', () => {

    test('calls handleIncomingRedirect with restorePreviousSession: true', async () => {
      const mock = makeMockSession()
      const { handleRedirect } = useTwinPodAuth({ _sessionOverride: mock })
      await handleRedirect()
      expect(mock.handleIncomingRedirect).toHaveBeenCalledWith({
        url: expect.any(String),
        restorePreviousSession: true
      })
    })

    test('updates isLoggedIn and webId after a successful OIDC redirect', async () => {
      const mock = makeMockSession({ isLoggedIn: false, webId: null })
      // Simulate the library completing the OIDC flow and updating session.info
      mock.handleIncomingRedirect.mockImplementation(async () => {
        mock.info.isLoggedIn = true
        mock.info.webId = 'https://pod.example.com/profile/card#me'
      })
      const { handleRedirect, isLoggedIn, webId } = useTwinPodAuth({ _sessionOverride: mock })
      await handleRedirect()
      expect(isLoggedIn.value).toBe(true)
      expect(webId.value).toBe('https://pod.example.com/profile/card#me')
    })

    test('loading is false after handleRedirect completes', async () => {
      const mock = makeMockSession()
      const { handleRedirect, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await handleRedirect()
      expect(loading.value).toBe(false)
    })

    test('sets error when handleIncomingRedirect throws', async () => {
      const mock = makeMockSession()
      mock.handleIncomingRedirect.mockRejectedValue(new Error('OIDC failure'))
      const { handleRedirect, error } = useTwinPodAuth({ _sessionOverride: mock })
      await handleRedirect()
      expect(error.value).toEqual({ type: 'auth', message: 'OIDC failure' })
    })

    test('loading is false even when handleIncomingRedirect throws', async () => {
      const mock = makeMockSession()
      mock.handleIncomingRedirect.mockRejectedValue(new Error('OIDC failure'))
      const { handleRedirect, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await handleRedirect()
      expect(loading.value).toBe(false)
    })

  })

  describe('login', () => {

    // Spec: F.NoteWorld — user must be able to authenticate against TwinPod via Solid-OIDC
    test('calls session.login with oidcIssuer, redirectUrl, and clientName', async () => {
      const mock = makeMockSession()
      const { login } = useTwinPodAuth({ clientName: 'NoteWorld', _sessionOverride: mock })
      await login('https://tst-first.demo.systemtwin.com/i', 'http://localhost:5173')
      expect(mock.login).toHaveBeenCalledWith({
        oidcIssuer: 'https://tst-first.demo.systemtwin.com/i',
        redirectUrl: 'http://localhost:5173',
        clientName: 'NoteWorld'
      })
    })

    test('uses window.location.origin as default redirectUrl', async () => {
      const mock = makeMockSession()
      const { login } = useTwinPodAuth({ _sessionOverride: mock })
      await login('https://tst-first.demo.systemtwin.com/i')
      expect(mock.login).toHaveBeenCalledWith(
        expect.objectContaining({ redirectUrl: window.location.origin })
      )
    })

    test('sets error when session.login throws', async () => {
      const mock = makeMockSession()
      mock.login.mockRejectedValue(new Error('Invalid issuer'))
      const { login, error } = useTwinPodAuth({ _sessionOverride: mock })
      await login('bad-issuer')
      expect(error.value).toEqual({ type: 'auth', message: 'Invalid issuer' })
    })

    test('clears a previous error before attempting login', async () => {
      const mock = makeMockSession()
      const { login, error } = useTwinPodAuth({ _sessionOverride: mock })
      // Seed an existing error
      error.value = { type: 'auth', message: 'old error' }
      await login('https://tst-first.demo.systemtwin.com/i')
      expect(error.value).toBeNull()
    })

  })

  // Spec: F.NoteWorld — user must be able to disconnect from TwinPod; session must be cleared on logout
  describe('logout', () => {

    test('calls session.logout with logoutType: app', async () => {
      const mock = makeMockSession({ isLoggedIn: true, webId: 'https://pod.example.com/profile/card#me' })
      const { logout } = useTwinPodAuth({ _sessionOverride: mock })
      await logout()
      expect(mock.logout).toHaveBeenCalledWith({ logoutType: 'app' })
    })

    test('sets isLoggedIn to false after logout', async () => {
      const mock = makeMockSession({ isLoggedIn: true, webId: 'https://pod.example.com/profile/card#me' })
      const { logout, isLoggedIn } = useTwinPodAuth({ _sessionOverride: mock })
      await logout()
      expect(isLoggedIn.value).toBe(false)
    })

    test('sets webId to null after logout', async () => {
      const mock = makeMockSession({ isLoggedIn: true, webId: 'https://pod.example.com/profile/card#me' })
      const { logout, webId } = useTwinPodAuth({ _sessionOverride: mock })
      await logout()
      expect(webId.value).toBeNull()
    })

    test('sets error when session.logout throws', async () => {
      const mock = makeMockSession({ isLoggedIn: true })
      mock.logout.mockRejectedValue(new Error('Logout failed'))
      const { logout, error } = useTwinPodAuth({ _sessionOverride: mock })
      await logout()
      expect(error.value).toEqual({ type: 'auth', message: 'Logout failed' })
    })

  })

  // Spec: F.NoteWorld — session.fetch must be provided to child composables for authenticated TwinPod access
  describe('session', () => {

    test('exposes the session object for use as twinpodFetch', () => {
      const mock = makeMockSession()
      const { session } = useTwinPodAuth({ _sessionOverride: mock })
      expect(session).toBe(mock)
    })

  })

  // --- Gap tests written by QATester ---

  describe('login — loading state', () => {

    // Spec: F.NoteWorld — user must be able to authenticate against TwinPod via Solid-OIDC
    // Gap: login() never sets loading.value = true; the LoginView disables its button on loading,
    // so if loading is never set the button is never visually disabled during the login flow.
    test('loading is false after login completes successfully', async () => {
      const mock = makeMockSession()
      const { login, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await login('https://tst-first.demo.systemtwin.com/i')
      expect(loading.value).toBe(false)
    })

    test('loading is false after login throws', async () => {
      const mock = makeMockSession()
      mock.login.mockRejectedValue(new Error('Invalid issuer'))
      const { login, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await login('bad-issuer')
      expect(loading.value).toBe(false)
    })

    test('loading is true while session.login is in progress', async () => {
      const mock = makeMockSession()
      let capturedLoading
      mock.login.mockImplementation(async () => {
        capturedLoading = loading.value
      })
      const { login, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await login('https://tst-first.demo.systemtwin.com/i')
      expect(capturedLoading).toBe(true)
    })

  })

  describe('logout — loading state', () => {

    // Gap: logout() never sets loading.value = true or resets it; no test covers this path.
    test('loading is false after logout completes successfully', async () => {
      const mock = makeMockSession({ isLoggedIn: true, webId: 'https://pod.example.com/profile/card#me' })
      const { logout, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await logout()
      expect(loading.value).toBe(false)
    })

    test('loading is false after logout throws', async () => {
      const mock = makeMockSession({ isLoggedIn: true })
      mock.logout.mockRejectedValue(new Error('Logout failed'))
      const { logout, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await logout()
      expect(loading.value).toBe(false)
    })

    test('loading is true while session.logout is in progress', async () => {
      const mock = makeMockSession({ isLoggedIn: true })
      let capturedLoading
      mock.logout.mockImplementation(async () => {
        capturedLoading = loading.value
      })
      const { logout, loading } = useTwinPodAuth({ _sessionOverride: mock })
      await logout()
      expect(capturedLoading).toBe(true)
    })

    // Gap: no test verifies logout clears a pre-existing error before attempting the call.
    test('clears a previous error before attempting logout', async () => {
      const mock = makeMockSession({ isLoggedIn: true })
      const { logout, error } = useTwinPodAuth({ _sessionOverride: mock })
      error.value = { type: 'auth', message: 'old error' }
      await logout()
      expect(error.value).toBeNull()
    })

  })

  describe('handleRedirect — loading state during operation', () => {

    // Gap: no test verifies loading is true while handleIncomingRedirect is in progress.
    test('loading is true while handleIncomingRedirect is in progress', async () => {
      const mock = makeMockSession()
      let capturedLoading
      mock.handleIncomingRedirect.mockImplementation(async () => {
        // Capture loading mid-flight before the promise resolves
        capturedLoading = undefined // will be set by inspection via the composable ref below
      })
      const { handleRedirect, loading } = useTwinPodAuth({ _sessionOverride: mock })
      // Intercept during the async call
      mock.handleIncomingRedirect.mockImplementation(async () => {
        capturedLoading = loading.value
      })
      await handleRedirect()
      expect(capturedLoading).toBe(true)
    })

  })

  describe('initial state — webId with active session', () => {

    // Gap: explicit test that webId is populated from an already-authenticated session on init.
    test('webId reflects an already-active session webId on init', () => {
      const mock = makeMockSession({ isLoggedIn: true, webId: 'https://pod.example.com/profile/card#me' })
      const { webId } = useTwinPodAuth({ _sessionOverride: mock })
      expect(webId.value).toBe('https://pod.example.com/profile/card#me')
    })

  })

})
