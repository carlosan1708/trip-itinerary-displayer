---
name: deploy-rules
description: Deploy Firestore security rules without rebuilding the app. Use after editing firestore.rules.
tools: Bash
disable-model-invocation: true
---

# Deploy Firestore Rules

Deploy only the Firestore security rules:
```
firebase deploy --only firestore:rules
```

Report the result. If it fails, show the full error — common causes are syntax errors in `firestore.rules`.
