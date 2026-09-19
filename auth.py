import os
from flask import session, redirect, request, jsonify, current_app
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from google_auth_oauthlib.flow import Flow
from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI

SCOPES = [
    'https://www.googleapis.com/auth/googlehealth.nutrition.writeonly',
    'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
    'openid',
    'email',
]

def get_client_config():
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [REDIRECT_URI],
        }
    }

def load_credentials():
    data = session.get('google_token')
    if not data:
        return None
        
    creds = Credentials(
        token=data.get('token'),
        refresh_token=data.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            save_token(creds)
        except Exception as e:
            print(f"Token refresh failed: {e}")
            return None
    return creds

def save_token(creds):
    data = {'token': creds.token, 'refresh_token': creds.refresh_token}
    session['google_token'] = data

def init_auth_routes(app):
    @app.route('/oauth/login')
    def oauth_login():
        flow = Flow.from_client_config(get_client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
        auth_url, state = flow.authorization_url(access_type='offline', prompt='consent')
        session['oauth_state'] = state
        if hasattr(flow, 'code_verifier'):
            session['code_verifier'] = flow.code_verifier
        return redirect(auth_url)

    @app.route('/oauth/callback')
    def oauth_callback():
        try:
            kwargs = {}
            if 'code_verifier' in session:
                kwargs['code_verifier'] = session['code_verifier']
                
            state = session.get('oauth_state')
            if not state:
                return "Authentication failed: Missing state.", 400
                
            flow = Flow.from_client_config(
                get_client_config(),
                scopes=SCOPES,
                redirect_uri=REDIRECT_URI,
                state=state,
                **kwargs
            )
            
            auth_response = request.url
            if REDIRECT_URI.startswith('https') and auth_response.startswith('http:'):
                auth_response = auth_response.replace('http:', 'https:', 1)
                
            flow.fetch_token(authorization_response=auth_response)
            save_token(flow.credentials)
            
            session.pop('oauth_state', None)
            session.pop('code_verifier', None)
            
            return redirect('/?auth=success')
        except Exception as e:
            current_app.logger.error(f"OAuth Callback Error: {e}", exc_info=True)
            return "Authentication failed. Please try again.", 500

    @app.route('/oauth/logout', methods=['POST'])
    def oauth_logout():
        session.clear()
        return jsonify({'success': True})

    @app.route('/auth/status')
    def auth_status():
        if '_csrf_token' not in session:
            session['_csrf_token'] = os.urandom(24).hex()
            
        creds = load_credentials()
        if creds and creds.valid:
            return jsonify({'authenticated': True, 'csrf_token': session['_csrf_token']})
        return jsonify({'authenticated': False, 'csrf_token': session['_csrf_token']})
