import base64
import binascii
import os
import secrets

import config

COVER_DIR = os.path.join(config.FRONTEND_DIR, "assets", "covers")
COVER_PREFIX = "assets/covers/"      # awalan yang ditulis ke kolom cover di database
MAX_COVER_BYTES = 800_000

# tipe gambar yang diizinkan: (ekstensi, tanda awal isi berkas)
_TYPES = {
    "image/jpeg": ("jpg", b"\xff\xd8\xff"),
    "image/png": ("png", b"\x89PNG\r\n\x1a\n"),
    "image/webp": ("webp", b"RIFF"),
}


class CoverError(Exception):
    """Gambar sampul tidak valid."""


def save_cover(book_id, data_url):
    """Simpan gambar dari data URL ke assets/covers. Hasil: path untuk kolom cover."""
    if not isinstance(data_url, str) or not data_url.startswith("data:") or ";base64," not in data_url:
        raise CoverError("Format gambar tidak valid")

    header, encoded = data_url.split(";base64,", 1)
    mime = header[5:]
    if mime not in _TYPES:
        raise CoverError("Gambar harus berformat JPG, PNG, atau WEBP")

    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise CoverError("Data gambar rusak")
    if len(raw) > MAX_COVER_BYTES:
        raise CoverError("Ukuran gambar terlalu besar (maksimal 800 KB)")

    ext, magic = _TYPES[mime]
    if not raw.startswith(magic) or (mime == "image/webp" and raw[8:12] != b"WEBP"):
        raise CoverError("Isi berkas bukan gambar yang valid")

    os.makedirs(COVER_DIR, exist_ok=True)
    name = f"book-{book_id}-{secrets.token_hex(4)}.{ext}"
    with open(os.path.join(COVER_DIR, name), "wb") as f:
        f.write(raw)
    return COVER_PREFIX + name


def delete_cover_file(path):
    """Hapus berkas sampul lama. Hanya berkas di assets/covers yang boleh dihapus."""
    if not path or not path.startswith(COVER_PREFIX):
        return
    target = os.path.join(COVER_DIR, os.path.basename(path))   # basename: cegah "../"
    try:
        os.remove(target)
    except FileNotFoundError:
        pass