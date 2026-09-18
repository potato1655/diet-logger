import time
import random
import json
from google import genai
from config import GEMINI_API_KEYS

gemini_clients = [genai.Client(api_key=key) for key in GEMINI_API_KEYS]

def call_gemini_with_retry(prompt, img_bytes=None):
    clients_to_try = list(gemini_clients)
    random.shuffle(clients_to_try)
    
    last_exception = None
    for attempt, client in enumerate(clients_to_try):
        try:
            if img_bytes:
                contents = [
                    prompt,
                    genai.types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg'),
                ]
            else:
                contents = [prompt]
                
            return client.models.generate_content(
                model='gemini-3.6-flash',
                contents=contents,
            )
        except Exception as e:
            last_exception = e
            if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e) or '503' in str(e):
                if attempt < len(clients_to_try) - 1:
                    time.sleep(1)
                    continue
                else:
                    raise
            else:
                raise
    
    if last_exception:
        raise last_exception
