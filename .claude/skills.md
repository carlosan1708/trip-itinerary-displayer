# Project Skills

Skill files live in `.claude/skills/<name>/SKILL.md`.

| Skill | Description | Who can invoke |
|-------|-------------|----------------|
| `/deploy` | Build + deploy to Firebase Hosting | User only |
| `/deploy-rules` | Deploy Firestore security rules only | User only |
| `/add-user` | Guide through adding a user via Admin Panel | Both |
| `/sync` | Bidireccional — siempre gana la versión más nueva | Both |
| `/sync-download` | Pull cloud → local (solo si cloud es más nuevo) | Both |
| `/sync-upload` | Push local → cloud (solo si local es más nuevo) | Both |
| `/plan-trip` | Guided trip planning → generates itinerary JSON with correct image URLs | Both |
