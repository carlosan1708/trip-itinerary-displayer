import asyncio
import os
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_security = HTTPBearer()
_ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")


def _init_firebase():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.isfile(cred_path):
            # Local dev: use explicit service account file (project inferred from cert)
            cred = credentials.Certificate(cred_path)
        else:
            # Cloud Run: remove the local path so ApplicationDefault() uses
            # the metadata service instead of failing on the missing file.
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
            cred = credentials.ApplicationDefault()

        # verify_id_token needs projectId to validate the token's `aud` claim.
        # Firebase Functions set GCLOUD_PROJECT automatically; direct Cloud Run
        # deployments must pass FIREBASE_PROJECT_ID explicitly.
        project_id = (
            os.environ.get("FIREBASE_PROJECT_ID")
            or os.environ.get("GCLOUD_PROJECT")
            or os.environ.get("GOOGLE_CLOUD_PROJECT")
        )
        options = {"projectId": project_id} if project_id else {}
        firebase_admin.initialize_app(cred, options)

_init_firebase()


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(_security),
) -> dict:
    token = credentials.credentials
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except (
        firebase_auth.InvalidIdTokenError,
        firebase_auth.ExpiredIdTokenError,
        firebase_auth.RevokedIdTokenError,
        firebase_auth.CertificateFetchError,
        ValueError,
    ):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def set_admin_claim(uid: str, email: str, current_claims: dict) -> None:
    """
    Sets { admin: true } custom claim on the Firebase user if their email
    matches ADMIN_EMAIL. Safe to call repeatedly — idempotent.
    Skips all Firebase calls if the claim is already present in the decoded token.
    """
    if not _ADMIN_EMAIL or email != _ADMIN_EMAIL:
        return
    # Claim already propagated — nothing to do
    if current_claims.get("admin"):
        return
    # Run blocking SDK call off the event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: firebase_auth.set_custom_user_claims(uid, {"admin": True}),
    )
