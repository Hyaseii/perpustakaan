import hashlib
import secrets
import threading
import time

RESET_TTL = 1800  # 30 menit

_lock = threading.Lock()
_tokens = {}  # {hash_token: (user_id, waktu_kedaluwarsa)}


def _hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _purge(now):
    """Buang catatan yang sudah kedaluwarsa. Panggil hanya saat memegang _lock."""
    for key in [k for k, (_, exp) in _tokens.items() if exp <= now]:
        del _tokens[key]


def create(user_id, ttl=RESET_TTL):
    """Buat kode baru. Kode lama milik user yang sama otomatis dibuang."""
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _lock:
        _purge(now)
        for key in [k for k, (uid, _) in _tokens.items() if uid == user_id]:
            del _tokens[key]
        _tokens[_hash(token)] = (user_id, now + ttl)
    return token


def peek(token):
    """Cek kode tanpa menghapusnya. Hasil: user_id atau None."""
    if not isinstance(token, str) or not token:
        return None
    now = time.time()
    with _lock:
        _purge(now)
        item = _tokens.get(_hash(token))
    return item[0] if item else None


def consume(token):
    """Cek kode lalu hapus (sekali pakai). Hasil: user_id atau None."""
    if not isinstance(token, str) or not token:
        return None
    now = time.time()
    with _lock:
        _purge(now)
        item = _tokens.pop(_hash(token), None)
    return item[0] if item else None