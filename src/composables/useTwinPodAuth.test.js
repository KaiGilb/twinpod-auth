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

  describe('session', () => {

    test('exposes the session object for use as twinpodFetch', () => {
      const mock = makeMockSession()
      const { session } = useTwinPodAuth({ _sessionOverride: mock })
      expect(session).toBe(mock)
    })

  })

})
