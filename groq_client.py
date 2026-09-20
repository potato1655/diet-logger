import requests
import json
import os
from flask import current_app
from config import GROQ_API_KEY

def call_groq_summary(prompt):
    """Call the Groq API (OpenAI compatible endpoint) for text summarization."""
    if not GROQ_API_KEY:
        raise Exception("GROQ_API_KEY is not set in environment variables.")
        
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Using Llama 3 8B
    data = {
        "model": os.environ.get("GROQ_MODEL", "llama3-8b-8192"),
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.7,
        "max_tokens": 512
    }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code != 200:
        current_app.logger.error(f"Groq API Error: {response.status_code} - {response.text}")
        raise Exception(f"Groq API Error: {response.status_code} - {response.text}")
        
    resp_json = response.json()
    return resp_json["choices"][0]["message"]["content"]
