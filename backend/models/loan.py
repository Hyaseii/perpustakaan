from datetime import date

from database.db import cursor

RENEW_DAYS = 7           # satu kali perpanjangan = tambah 7 hari
MAX_RENEWALS = 1         # boleh diperpanjang berapa kali
LOAN_DAYS = 14           # masa pinjam, dihitung sejak admin mengonfirmasi
MAX_ACTIVE_LOANS = 5     # jatah buku aktif (menunggu konfirmasi + sedang dipinjam)
CONFIRM_HOURS = 24       # batas booking sebelum hangus

# Kolom yang selalu diambil saat menampilkan pinjaman (digabung dengan data buku).
# confirm_seconds_left = sisa detik sampai booking hangus. Dihitung MySQL supaya
# hitung mundur di browser tidak bergantung pada jam atau zona waktu komputer user.
_LOAN_SELECT = (
    "SELECT p.id, p.user_id, p.book_id, p.borrowed_at, p.due_date, p.confirmed_at, "
    "p.returned_at, p.status, p.renew_count, "
    f"DATE_ADD(p.borrowed_at, INTERVAL {CONFIRM_HOURS} HOUR) AS confirm_deadline, "
    "GREATEST(TIMESTAMPDIFF(SECOND, NOW(), "
    f"DATE_ADD(p.borrowed_at, INTERVAL {CONFIRM_HOURS} HOUR)), 0) AS confirm_seconds_left, "
    "b.title, b.author, b.category, b.cover "
    "FROM peminjaman p JOIN buku b ON b.id = p.book_id "
)


class LoanNotFoundError(Exception):
    """Buku atau pinjaman tidak ada (atau bukan milik user ini)."""


class LoanRuleError(Exception):
    """Datanya ada, tapi aturan perpustakaan tidak mengizinkan."""


class Loan:
    @staticmethod
    def _select_one(cur, loan_id):
        cur.execute(_LOAN_SELECT + "WHERE p.id = %s", (loan_id,))
        return cur.fetchone()

    @staticmethod
    def find_active_for_user(user_id):
        """Pinjaman aktif milik user: menunggu konfirmasi dan sedang dipinjam."""
        with cursor() as cur:
            cur.execute(
                _LOAN_SELECT
                + "WHERE p.user_id = %s AND p.status IN ('pending', 'borrowed') "
                "ORDER BY p.borrowed_at DESC",
                (user_id,),
            )
            return cur.fetchall()

    @staticmethod
    def expire_stale():
        """Booking yang lewat CONFIRM_HOURS jam tanpa konfirmasi jadi 'expired', stok kembali."""
        with cursor() as cur:
            cur.execute(
                "SELECT id, book_id FROM peminjaman "
                "WHERE status = 'pending' "
                f"AND borrowed_at < DATE_SUB(NOW(), INTERVAL {CONFIRM_HOURS} HOUR) "
                "FOR UPDATE"
            )
            stale = cur.fetchall()
            for row in stale:
                cur.execute(
                    "UPDATE peminjaman SET status = 'expired' WHERE id = %s",
                    (row["id"],),
                )
                cur.execute(
                    "UPDATE buku SET stock = stock + 1 WHERE id = %s",
                    (row["book_id"],),
                )
            return len(stale)

    @staticmethod
    def create(user_id, book_id=None, title=None):
        """Booking buku: status pending, stok langsung berkurang."""
        with cursor() as cur:
            if book_id is not None:
                cur.execute(
                    "SELECT id, stock FROM buku WHERE id = %s FOR UPDATE",
                    (book_id,),
                )
            elif title:
                cur.execute(
                    "SELECT id, stock FROM buku WHERE title = %s LIMIT 1 FOR UPDATE",
                    (title,),
                )
            else:
                raise ValueError("Buku tidak valid")

            book = cur.fetchone()
            if book is None:
                raise LoanNotFoundError("Buku tidak ditemukan")
            if book["stock"] <= 0:
                raise LoanRuleError("Stok buku tidak tersedia")

            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman "
                "WHERE user_id = %s AND status IN ('pending', 'borrowed')",
                (user_id,),
            )
            if cur.fetchone()["total"] >= MAX_ACTIVE_LOANS:
                raise LoanRuleError(f"Maksimal peminjaman {MAX_ACTIVE_LOANS} buku aktif")

            cur.execute(
                "SELECT id FROM peminjaman "
                "WHERE user_id = %s AND book_id = %s AND status IN ('pending', 'borrowed')",
                (user_id, book["id"]),
            )
            if cur.fetchone() is not None:
                raise LoanRuleError("Buku ini sedang Anda pinjam")

            cur.execute(
                "UPDATE buku SET stock = stock - 1 WHERE id = %s",
                (book["id"],),
            )
            cur.execute(
                "INSERT INTO peminjaman (user_id, book_id, status) "
                "VALUES (%s, %s, 'pending')",
                (user_id, book["id"]),
            )
            return Loan._select_one(cur, cur.lastrowid)

    @staticmethod
    def cancel(user_id, loan_id):
        """Member membatalkan booking selama masih pending: stok kembali."""
        with cursor() as cur:
            cur.execute(
                "SELECT id, book_id, status FROM peminjaman "
                "WHERE id = %s AND user_id = %s FOR UPDATE",
                (loan_id, user_id),
            )
            loan = cur.fetchone()

            if loan is None:
                raise LoanNotFoundError("Pinjaman tidak ditemukan")
            if loan["status"] == "expired":
                raise LoanRuleError("Booking sudah hangus karena lewat 24 jam")
            if loan["status"] != "pending":
                raise LoanRuleError(
                    "Hanya pinjaman yang menunggu konfirmasi yang bisa dibatalkan"
                )

            cur.execute(
                "UPDATE peminjaman SET status = 'cancelled' WHERE id = %s",
                (loan_id,),
            )
            cur.execute(
                "UPDATE buku SET stock = stock + 1 WHERE id = %s",
                (loan["book_id"],),
            )
            return Loan._select_one(cur, loan_id)

    @staticmethod
    def confirm(loan_id):
        """Admin mengonfirmasi booking: pending -> borrowed, masa pinjam mulai dihitung."""
        with cursor() as cur:
            cur.execute(
                "SELECT id, status FROM peminjaman WHERE id = %s FOR UPDATE",
                (loan_id,),
            )
            loan = cur.fetchone()

            if loan is None:
                raise LoanNotFoundError("Pinjaman tidak ditemukan")
            if loan["status"] == "expired":
                raise LoanRuleError("Booking sudah hangus karena lewat 24 jam")
            if loan["status"] == "cancelled":
                raise LoanRuleError("Booking sudah dibatalkan oleh anggota")
            if loan["status"] != "pending":
                raise LoanRuleError("Pinjaman ini sudah dikonfirmasi sebelumnya")

            cur.execute(
                "UPDATE peminjaman "
                "SET status = 'borrowed', confirmed_at = NOW(), "
                "due_date = DATE_ADD(CURRENT_DATE(), INTERVAL %s DAY) "
                "WHERE id = %s",
                (LOAN_DAYS, loan_id),
            )
            return Loan._select_one(cur, loan_id)

    @staticmethod
    def renew(user_id, loan_id):
        """Perpanjang satu pinjaman milik user: jatuh tempo + RENEW_DAYS hari."""
        with cursor() as cur:
            # FOR UPDATE = "kunci baris ini", supaya klik ganda tidak memperpanjang dua kali
            cur.execute(
                "SELECT id, status, due_date, renew_count FROM peminjaman "
                "WHERE id = %s AND user_id = %s FOR UPDATE",
                (loan_id, user_id),
            )
            loan = cur.fetchone()

            if loan is None:
                raise LoanNotFoundError("Pinjaman tidak ditemukan")
            if loan["status"] == "pending":
                raise LoanRuleError("Pinjaman belum dikonfirmasi admin")
            if loan["status"] != "borrowed":
                raise LoanRuleError("Pinjaman ini sudah tidak aktif")
            if loan["renew_count"] >= MAX_RENEWALS:
                raise LoanRuleError(f"Pinjaman ini sudah diperpanjang {MAX_RENEWALS} kali")
            if loan["due_date"] < date.today():
                raise LoanRuleError(
                    "Pinjaman sudah lewat jatuh tempo, silakan hubungi petugas perpustakaan"
                )

            cur.execute(
                "UPDATE peminjaman "
                "SET due_date = DATE_ADD(due_date, INTERVAL %s DAY), "
                "renew_count = renew_count + 1 "
                "WHERE id = %s",
                (RENEW_DAYS, loan_id),
            )
            return Loan._select_one(cur, loan_id)

    @staticmethod
    def count_this_month(user_id):
        """Berapa pinjaman user yang dikonfirmasi di bulan berjalan."""
        with cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman "
                "WHERE user_id = %s AND status IN ('borrowed', 'returned') "
                "AND YEAR(confirmed_at) = YEAR(CURRENT_DATE()) "
                "AND MONTH(confirmed_at) = MONTH(CURRENT_DATE())",
                (user_id,),
            )
            return cur.fetchone()["total"]