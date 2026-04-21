---
name: sync-upload
description: Push local trip JSON files from src/data/ up to Firestore cloud. Always uses the newest version — if cloud is newer it won't be overwritten.
tools: Bash
disable-model-invocation: true
---

# Sync Local → Cloud

1. Show current status:
   ```
   npm run sync:status
   ```

2. Upload files where local version is newer than cloud:
   ```
   npm run sync:upload
   ```

3. Report what was uploaded and what was skipped.

Note: uses the newest version — local only overwrites cloud if local version > cloud version.
If the user wants full bidirectional sync (newest wins either way), use `/sync` instead.
