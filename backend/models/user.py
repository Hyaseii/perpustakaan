import mysql.connector

from database.db import cursor

DUPLICATE_MESSAGES = {
    "npm": "NPM sudah terdaftar",
    "email": "Email sudah terdaftar",
    "username": "Username sudah dipakai",
}
DEFAULT_DUPLICATE_MESSAGE = "NPM, email, atau username sudah terdaftar"


class DuplicateUserError(Exception):
    """NPM, email, atau username sudah terdaftar."""

    def __init__(self, message=DEFAULT_DUPLICATE_MESSAGE, field=None):
        super().__init__(message)
        self.field = field  # "npm" / "email" / "username" / None


def _duplicate_field(error):
    """Tebak kolom mana yang bentrok dari teks error MySQL 1062."""
    text = str(error)
    if "uq_users_npm" in text:
        return "npm"
    if "uq_users_email" in text:
        return "email"
    if "uq_users_username" in text:
        return "username"
    return None


class User:
    @staticmethod
    def create(username, email, password_hash, role="member",
               npm=None, full_name=None, phone=None):
        try:
            with cursor() as cur:
                cur.execute(
                    "INSERT INTO `user` "
                    "(username, npm, full_name, email, phone, password_hash, role) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (username, npm, full_name, email, phone, password_hash, role),
                )
                return cur.lastrowid
        except mysql.connector.Error as e:
            if e.errno == 1062:
                field = _duplicate_field(e)
                raise DuplicateUserError(
                    DUPLICATE_MESSAGES.get(field, DEFAULT_DUPLICATE_MESSAGE),
                    field=field,
                ) from e
            raise

    @staticmethod
    def find_by_id(user_id):
        with cursor() as cur:
            cur.execute(
                "SELECT id, username, npm, full_name, email, phone, role, created_at "
                "FROM `user` WHERE id = %s",
                (user_id,),
            )
            return cur.fetchone()

    @staticmethod
    def find_by_identifier(identifier):
        with cursor() as cur:
            cur.execute(
                "SELECT id, username, npm, full_name, email, phone, "
                "password_hash, role, created_at "
                "FROM `user` WHERE email = %s OR username = %s OR npm = %s",
                (identifier, identifier, identifier),
            )
            return cur.fetchone()

    @staticmethod
    def find_by_email(email):
        with cursor() as cur:
            cur.execute(
                "SELECT id, email, full_name FROM `user` WHERE email = %s",
                (email,),
            )
            return cur.fetchone()

    @staticmethod
    def update_password(user_id, password_hash):
        with cursor() as cur:
            cur.execute(
                "UPDATE `user` SET password_hash = %s WHERE id = %s",
                (password_hash, user_id),
            )
            return cur.rowcount

    @staticmethod
    def find_for_admin(text):
        """Cari anggota dari teks yang diketik petugas: NPM, ID anggota (MB-0008),
        username, atau nama lengkap. Hasil: daftar (kosong = tidak ada, lebih dari 1 = ambigu)."""
        text = text.strip()
        if not text:
            return []
        upper = text.upper()
        member_id = int(upper[3:]) if upper.startswith("MB-") and upper[3:].isdigit() else 0
        with cursor() as cur:
            cur.execute(
                "SELECT id, username, full_name FROM `user` "
                "WHERE role = 'member' "
                "AND (id = %s OR npm = %s OR username = %s OR full_name = %s) "
                "LIMIT 5",
                (member_id, text, text, text),
            )
            return cur.fetchall()