import os
import socket
from flask import Flask, jsonify
from flask_cors import CORS
from config import REDIRECT_URI, PORT

from auth import init_auth_routes
from routes import init_routes

app = Flask(__name__, static_folder='static')

app.secret_key = os.environ.get('FLASK_SECRET_KEY')
if not app.secret_key:
    # We fallback to a random key if one is not provided, but save it locally
    # so sessions aren't lost on every local server restart.
    # Note: On Railway, this file is ephemeral, so users should set FLASK_SECRET_KEY.
    os.makedirs('data', exist_ok=True)
    secret_file = 'data/secret_key.txt'
    if os.path.exists(secret_file):
        with open(secret_file, 'rb') as f:
            app.secret_key = f.read()
    else:
        app.secret_key = os.urandom(24)
        with open(secret_file, 'wb') as f:
            f.write(app.secret_key)

CORS(app, supports_credentials=True)

# Secure global exception handler
@app.errorhandler(Exception)
def handle_exception(e):
    # Log the full stack trace internally
    app.logger.error(f"Unhandled Exception: {e}", exc_info=True)
    # Return a generic error to the client to avoid leaking internals
    return jsonify({
        "success": False,
        "error": "Internal Server Error"
    }), 500

# Initialize routes from modules
init_auth_routes(app)
init_routes(app)

if __name__ == '__main__':
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        local_ip = '127.0.0.1'

    print('\n' + '='*55)
    print('  🥗  Diet Logger is running!')
    print('='*55)
    print(f'  💻  On this PC    : http://localhost:{PORT}')
    print(f'  📱  On your phone : http://{local_ip}:{PORT}')
    print('      (phone must be on the same WiFi)')
    print('='*55)
    print('  Press Ctrl+C to stop.\n')

    os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
    if REDIRECT_URI.startswith('http://localhost'):
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    app.run(debug=False, host='0.0.0.0', port=PORT)
