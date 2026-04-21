---
name: sync
description: Full sync between local and Firestore. Registry always pulled from cloud first, then bidirectional data sync where newest version wins.
tools: Bash
---

# Sync completo

1. Pull registry from cloud (cloud always wins for registry):
   ```
   npm run sync:pull-registry
   ```

2. Show current status:
   ```
   npm run sync:status
   ```

3. Ask the user if they want to proceed with the sync. Show a short summary of what will change (uploads, downloads, or already in sync). Wait for confirmation before continuing.

4. If confirmed, run bidirectional data sync (newest version wins):
   ```
   npm run sync
   ```
   - Local newer → uploads to cloud
   - Cloud newer → downloads to local
   - Same version → no change

5. Report the result of each file.
