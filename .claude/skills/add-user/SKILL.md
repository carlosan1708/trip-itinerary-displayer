---
name: add-user
description: Guide the user through adding a new email to a trip's allowed-users whitelist via the Admin Panel.
tools: Read
---

# Add User to Trip

Claude cannot write to Firestore directly. Walk the user through the UI:

1. Read `.env.local` to confirm the `VITE_TRIP_ID` and `VITE_ADMIN_EMAIL` values.
2. Instruct the user to:
   - Open the app and sign in with the admin email (`VITE_ADMIN_EMAIL`)
   - Open the **Admin Panel**
   - Enter the new email address and click **Add User**
3. Confirm the user understands only the admin account can modify the whitelist.
