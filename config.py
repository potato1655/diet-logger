import os

# ── Keys loaded from environment variables (set these on Railway/cloud) ───────
# For local dev: create a .env file or set them in your terminal
# For cloud: set them in Railway's Variables dashboard

GEMINI_API_KEY       = os.environ.get('GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY')
GOOGLE_CLIENT_ID     = os.environ.get('GOOGLE_CLIENT_ID', 'YOUR_CLIENT_ID.apps.googleusercontent.com')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', 'YOUR_CLIENT_SECRET')

# Set this to your Railway URL after deploying, e.g.:
# https://your-app.up.railway.app/oauth/callback
REDIRECT_URI = os.environ.get('REDIRECT_URI', 'http://localhost:5000/oauth/callback')

PORT = int(os.environ.get('PORT', 5000))
