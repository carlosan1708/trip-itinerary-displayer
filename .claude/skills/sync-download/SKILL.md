---
name: sync-download
description: Pull trip JSON data from Firestore cloud down to local src/data/ files. Always uses the newest version — if local is newer it won't be overwritten.
tools: Bash
disable-model-invocation: true
---

# Sync Cloud → Local

1. Show current status:
   ```
   npm run sync:status
   ```

2. Download files where cloud version is newer than local:
   ```
   npm run sync:download
   ```

3. Report what changed and what was skipped.

Note: uses the newest version — cloud only overwrites local if cloud version > local version.
If the user wants full bidirectional sync (newest wins either way), use `/sync` instead.
