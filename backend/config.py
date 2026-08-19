import os
from google import genai
from dotenv import load_dotenv

# Only load local dotenv files outside managed Cloud Run / Functions runtime.
if not (os.environ.get("K_SERVICE") or os.environ.get("FUNCTION_TARGET")):
    load_dotenv()

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
# gemini-2.5-pro: higher reasoning quality for patch generation, trip creation,
# and grounded answers (supports streaming, JSON mode, and Search grounding).
# Trades slower first-token latency for better output.
MODEL = "gemini-2.5-pro"

gemini_client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options={'api_version': 'v1beta'}
)
