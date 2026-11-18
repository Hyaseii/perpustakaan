import os

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "perpustakaan")

HOST = os.environ.get("APP_HOST", "127.0.0.1")
PORT = 3000
PRODUCTION = os.environ.get("APP_ENV") == "production"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")
SCHEMA_PATH = os.path.join(BASE_DIR, "database", "perpustakaan.sql")

# --- Email (untuk Forgot Password) ---
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
# App Password Gmail biasanya tampil dengan spasi, jadi spasinya dibuang
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").replace(" ", "")
MAIL_FROM_NAME = "Unindra Library"  # nama pengirim; ganti kalau nama resmi sudah diputuskan
# Alamat dasar untuk tautan di email. Saat hosting, ganti lewat $env:APP_BASE_URL
APP_BASE_URL = os.environ.get("APP_BASE_URL", f"http://{HOST}:{PORT}").rstrip("/")