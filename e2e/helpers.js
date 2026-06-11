// Shared helpers for injecting mock auth/firestore state before page load.
// Call these before page.goto() — addInitScript must run before page JS evaluates.

const GATEWAY_TRIP_ID = 'canada-trip'
const ADMIN_EMAIL = 'admin@test.com'
const USER_EMAIL = 'user@test.com'

/** Registry stored in Firestore (cloud), new flat shape: array of trips.
 *  Dashboard groups them by role (My Trips / All Trips). Test trips are
 *  authored by USER_EMAIL so non-admin tests see them in "My Trips". */
const MOCK_REGISTRY_TRIPS = [
  {
    id: 'canada-trip',
    label: 'Ruta Este',
    subtitle: 'SJO → YYZ · Toronto, Ottawa, Montreal',
    dates: 'Sep 12–30, 2026',
    duration: '19 días',
    author: USER_EMAIL,
    viewers: [USER_EMAIL],
  },
  {
    id: 'canada-trip-2',
    label: 'Ruta Oeste',
    subtitle: 'SJO → YVR · Vancouver, Victoria',
    dates: 'Sep 12–30, 2026',
    duration: '19 días',
    author: USER_EMAIL,
    viewers: [USER_EMAIL],
  },
]

/** Minimal itinerary data used in tests.
 * version is set very high so it always beats the local bundled JSON (v4). */
const MOCK_ITINERARY = {
  version: 999,
  author: ADMIN_EMAIL,
  title: 'Itinerario Canadá',
  subtitle: 'Sep 12 – Sep 30, 2026',
  stats: ['19 días', '3 provincias', '5 ciudades', 'SJO → YYZ'],
  parts: [
    {
      id: 1,
      emoji: '🏔️',
      title: 'Las Rocosas',
      color: '#2E7D32',
      daysRange: 'Días 1 – 2',
      days: [
        {
          dayNumber: 1,
          date: 'Sáb 12 Sep',
          location: 'Calgary',
          subtitle: 'Llegada Nocturna',
          logistics: [
            { type: 'flight', label: 'Vuelo', value: 'SJO → YYC' },
            { type: 'stay', label: 'Alojamiento', value: 'Hotel Centro Calgary' },
          ],
          activities: ['Aterrizaje en YYC', 'Check-in y descanso'],
          tips: ['Recuerda el adaptador de voltaje'],
          warnings: [],
          links: [{ label: 'Calgary Tower', url: 'https://example.com' }],
        },
        {
          dayNumber: 2,
          date: 'Dom 13 Sep',
          location: 'Banff',
          subtitle: 'Exploración Inicial',
          logistics: [
            { type: 'drive', label: 'Drive', value: 'Calgary → Banff: 130 km' },
            { type: 'stay', label: 'Alojamiento', value: 'Banff Hotel' },
          ],
          activities: ['Visita Bow Falls', 'Paseo por Banff Avenue'],
          tips: [],
          warnings: ['Lleva ropa de abrigo'],
          links: [],
        },
      ],
    },
  ],
}

/**
 * Inject mock state for an unauthenticated user (default — just omit calling any helper).
 * The mock firebase-auth already defaults to null user.
 */
export async function setupNoAuth(page) {
  await page.addInitScript(() => {
    window.__mockAuth = { currentUser: null }
  })
}

/**
 * Inject mock state for an authenticated admin user with full access.
 */
export async function setupAdminAuth(page) {
  const adminEmail = ADMIN_EMAIL
  const gatewayTripId = GATEWAY_TRIP_ID
  const itinerary = MOCK_ITINERARY
  const registry = MOCK_REGISTRY_TRIPS

  await page.addInitScript(
    ({ adminEmail, gatewayTripId, itinerary, registry }) => {
      window.__mockAuth = {
        currentUser: {
          email: adminEmail, uid: 'admin-uid', displayName: 'Admin User',
          getIdToken: () => Promise.resolve('mock-id-token'),
          getIdTokenResult: () => Promise.resolve({ claims: { admin: true } }),
        },
      }
      window.__mockFirestore = {
        docs: {
          [`trips/${gatewayTripId}/allowed_users/${adminEmail}`]: { email: adminEmail },
          [`trips/${gatewayTripId}/data/itinerary`]: itinerary,
          [`trips/${gatewayTripId}/registry/main`]: { trips: registry },
        },
      }
    },
    { adminEmail, gatewayTripId, itinerary, registry }
  )
}

/**
 * Inject mock state for an authenticated regular user who is allowed.
 */
export async function setupAllowedUserAuth(page) {
  const userEmail = USER_EMAIL
  const gatewayTripId = GATEWAY_TRIP_ID
  const itinerary = MOCK_ITINERARY
  const registry = MOCK_REGISTRY_TRIPS

  await page.addInitScript(
    ({ userEmail, gatewayTripId, itinerary, registry }) => {
      window.__mockAuth = {
        currentUser: {
          email: userEmail, uid: 'user-uid', displayName: 'Regular User',
          getIdToken: () => Promise.resolve('mock-id-token'),
          getIdTokenResult: () => Promise.resolve({ claims: {} }),
        },
      }
      window.__mockFirestore = {
        docs: {
          [`trips/${gatewayTripId}/allowed_users/${userEmail}`]: { email: userEmail },
          [`trips/${gatewayTripId}/data/itinerary`]: itinerary,
          [`trips/${gatewayTripId}/registry/main`]: { trips: registry },
        },
      }
    },
    { userEmail, gatewayTripId, itinerary, registry }
  )
}

/** Trips authored by a mix of the admin and another user, for testing the
 *  My Trips / All Trips split. */
const MIXED_REGISTRY_TRIPS = [
  {
    id: 'canada-trip', label: 'Ruta Este',
    subtitle: 'Mine', dates: 'Sep 12–30, 2026', duration: '19 días',
    author: ADMIN_EMAIL, viewers: [ADMIN_EMAIL],
  },
  {
    id: 'other-trip-1', label: 'Japan Adventure',
    subtitle: 'Someone else', dates: 'Oct 2026', duration: '10 days',
    author: 'someone@test.com', viewers: ['someone@test.com'],
  },
  {
    id: 'other-trip-2', label: 'Patagonia Trek',
    subtitle: 'Another', dates: 'Nov 2026', duration: '14 days',
    author: 'another@test.com', viewers: ['another@test.com'],
  },
]

/**
 * Admin with a mix of own + others' trips, so My Trips and All Trips both populate.
 */
export async function setupAdminWithMixedTrips(page) {
  const adminEmail = ADMIN_EMAIL
  const gatewayTripId = GATEWAY_TRIP_ID
  const itinerary = MOCK_ITINERARY
  const registry = MIXED_REGISTRY_TRIPS

  await page.addInitScript(
    ({ adminEmail, gatewayTripId, itinerary, registry }) => {
      window.__mockAuth = {
        currentUser: {
          email: adminEmail, uid: 'admin-uid', displayName: 'Admin User',
          getIdToken: () => Promise.resolve('mock-id-token'),
          getIdTokenResult: () => Promise.resolve({ claims: { admin: true } }),
        },
      }
      window.__mockFirestore = {
        docs: {
          [`trips/${gatewayTripId}/allowed_users/${adminEmail}`]: { email: adminEmail },
          [`trips/${gatewayTripId}/data/itinerary`]: itinerary,
          [`trips/${gatewayTripId}/registry/main`]: { trips: registry },
          // Itinerary data for the other-author trips so they're openable
          [`trips/other-trip-1/data/itinerary`]: { ...itinerary, title: 'Japan Adventure', author: 'someone@test.com' },
          [`trips/other-trip-2/data/itinerary`]: { ...itinerary, title: 'Patagonia Trek', author: 'another@test.com' },
        },
      }
    },
    { adminEmail, gatewayTripId, itinerary, registry }
  )
}

/**
 * Regular user who authored one trip; the registry also contains other users'
 * trips that should NOT be visible to them.
 */
export async function setupUserWithOthersTrips(page) {
  const userEmail = USER_EMAIL
  const gatewayTripId = GATEWAY_TRIP_ID
  const itinerary = MOCK_ITINERARY
  const registry = [
    {
      id: 'canada-trip', label: 'My Own Trip',
      subtitle: 'Mine', dates: '2026', duration: '7 días',
      author: userEmail, viewers: [userEmail],
    },
    {
      id: 'secret-trip', label: 'Secret Other Trip',
      subtitle: 'Hidden', dates: '2026', duration: '5 days',
      author: 'someone@test.com', viewers: ['someone@test.com'],
    },
  ]

  await page.addInitScript(
    ({ userEmail, gatewayTripId, itinerary, registry }) => {
      window.__mockAuth = {
        currentUser: {
          email: userEmail, uid: 'user-uid', displayName: 'Regular User',
          getIdToken: () => Promise.resolve('mock-id-token'),
          getIdTokenResult: () => Promise.resolve({ claims: {} }),
        },
      }
      window.__mockFirestore = {
        docs: {
          [`trips/${gatewayTripId}/allowed_users/${userEmail}`]: { email: userEmail },
          [`trips/${gatewayTripId}/data/itinerary`]: itinerary,
          [`trips/${gatewayTripId}/registry/main`]: { trips: registry },
        },
      }
    },
    { userEmail, gatewayTripId, itinerary, registry }
  )
}

/**
 * Demo mode: start unauthenticated (LoginScreen). The demo namespace
 * (demo-gateway) is pre-seeded with one sample trip. Turnstile is bypassed
 * via window.__turnstileBypassToken and /demo/start is mocked to succeed, so
 * clicking "Try the demo" signs the visitor in anonymously and lands them on
 * the demo dashboard.
 */
export async function setupDemoEntry(page) {
  const demoGateway = 'demo-gateway'
  const itinerary = MOCK_ITINERARY

  // Mock the backend Turnstile verification endpoint.
  await page.route('**/demo/start', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )

  await page.addInitScript(
    ({ demoGateway, itinerary }) => {
      // Start logged out.
      window.__mockAuth = { currentUser: null }
      // The anonymous user that signInAnonymously() will resolve to.
      window.__mockAnonUser = {
        uid: 'anon-123', email: null, isAnonymous: true,
        getIdToken: () => Promise.resolve('mock-anon-token'),
        getIdTokenResult: () => Promise.resolve({ claims: {} }),
      }
      // Skip the real Cloudflare widget in tests.
      window.__turnstileBypassToken = 'test-token'
      window.__mockFirestore = {
        docs: {
          [`trips/demo-sample/data/itinerary`]: { ...itinerary, title: 'Sample Trip', author: 'demo-sample' },
          [`trips/${demoGateway}/registry/main`]: {
            trips: [{
              id: 'demo-sample', label: 'Sample Trip', subtitle: 'Demo',
              dates: '3 days', duration: '3 days', author: 'demo-sample',
            }],
          },
        },
      }
    },
    { demoGateway, itinerary }
  )
}

/**
 * Inject mock state for an authenticated user NOT on the allowed list.
 */
export async function setupUnauthorizedAuth(page) {
  const email = 'stranger@test.com'
  const gatewayTripId = GATEWAY_TRIP_ID

  await page.addInitScript(
    ({ email, gatewayTripId }) => {
      window.__mockAuth = {
        currentUser: {
          email, uid: 'stranger-uid', displayName: 'Stranger',
          getIdToken: () => Promise.resolve('mock-id-token'),
          getIdTokenResult: () => Promise.resolve({ claims: {} }),
        },
      }
      // allowed_users doc deliberately absent → getDoc returns exists() = false
      window.__mockFirestore = { docs: {} }
    },
    { email, gatewayTripId }
  )
}
