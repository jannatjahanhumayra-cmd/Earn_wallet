
import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from flask import Flask, render_template, jsonify

app = Flask(__name__)

db = None

def connect_firebase():
    global db

    firebase_json = os.environ.get(
        "FIREBASE_SERVICE_ACCOUNT_JSON"
    )

    if not firebase_json:
        print("Firebase credentials not configured")
        return

    try:
        service_account = json.loads(firebase_json)

        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account)
            firebase_admin.initialize_app(cred)

        db = firestore.client()
        print("Firebase connected successfully")

    except Exception as error:
        print("Firebase error:", error)


connect_firebase()


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({
        "status": "running",
        "firebase_connected": db is not None
    })


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000))
    )
