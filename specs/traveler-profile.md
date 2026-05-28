# Spec: Traveler Profile

## Status
Shipped — see [as-built.md § Traveler Profile](as-built.md). Downstream consumers (countdown, contacts, currency, time zones) read `users/{email}` directly.

## Context

> "Same details apply to every trip I plan: passport number, allergies, insurance policy, emergency contact."

Every trip would re-collect the same info today. Nothing personal exists at the user level.

---

## Data Model

Per-user document.

```js
users/{email}: {
  passportNumber?,
  passportExpiry?,
  insurancePolicy?,
  bloodType?,
  allergies?: string[],
  emergencyContact?: { name, phone, relation },
  homeCurrency?: "USD",
  homeTimezone?: "America/Costa_Rica"
}
```

---

## UI

- Small "Profile" item in the header dropdown.
- New `UserProfileDialog.jsx` with grouped sections (Identity, Health, Emergency, Preferences).

---

## Permissions

| Action | Who |
|--------|-----|
| Read own profile | Self only |
| Write own profile | Self only |
| Read other users' profiles | Nobody (until explicit "share emergency info" feature) |

Firestore rule: `match /users/{email} { allow read, write: if request.auth.token.email == email; }`

---

## Scope

- New `UserProfileDialog.jsx`.
- New `users/` collection + rules.
- E2E: open profile, set field, reopen → field persists.

---

## Risks

- Personal data sensitivity. Document explicitly that this stays in the user's own Firestore doc and is never shared with co-travelers (unless we later add explicit "share emergency info").

---

## Consumers

- [today-view.md](today-view.md) — passport expiry warning in the pre-departure banner; `homeTimezone` as the secondary clock.
- [booking-and-contacts.md](booking-and-contacts.md) — emergency contact in the Contacts drawer.
- [expenses.md](expenses.md) — `homeCurrency` for denormalized expense totals and the FX converter.
