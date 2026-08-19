import os
from google import genai
from dotenv import load_dotenv

# Only load local dotenv files outside managed Cloud Run / Functions runtime.
if not (os.environ.get("K_SERVICE") or os.environ.get("FUNCTION_TARGET")):
    load_dotenv()

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
# Model is env-overridable (GEMINI_MODEL) so a retired or renamed model can be
# swapped without a code deploy. This matters: gemini-2.5-pro was retired for new
# projects in 2026 and started returning 404 on every call. Default is a current,
# stable model — gemini-3.7-flash: fast (good for streaming), supports JSON mode
# and Google Search grounding, and much stronger than the old gemini-2.5-flash.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")

gemini_client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options={'api_version': 'v1beta'}
)
