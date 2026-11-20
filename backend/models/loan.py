from datetime import date

from database.db import cursor

RENEW_DAYS = 7      # satu kali perpanjangan = tambah 7 hari
MAX_RENEWALS = 1    # boleh diperpanjang berapa kali


class LoanNotFoundError(Exception):
    """Pinjaman tidak ada atau bukan milik user ini."""


class LoanRuleError(Exception):
    """Pinjaman ada, tapi aturan tidak mengizinkan."""



class Loan:
    @staticmethod
    def find_active_for_user(user_id):
        with cursor() as cur:
            cur.execute(
                "SELECT p.id, p.user_id, p.book_id, p.borrowed_at, p.due_date, "
                "p.returned_at, p.status, b.title, b.author, b.category, b.cover "
                "FROM peminjaman p "
                "JOIN buku b ON b.id = p.book_id "
                "WHERE p.user_id = %s "
                "ORDER BY p.borrowed_at DESC",
                (user_id,),
            )
            return cur.fetchall()

    @staticmethod
    def create(user_id, book_id=None, title=None):
        with cursor() as cur:
            if book_id is not None:
                cur.execute(
                    "SELECT id, title, author, category, stock, cover FROM buku "
                    "WHERE id = %s FOR UPDATE",
                    (book_id,),
                )
            elif title:
                cur.execute(
                    "SELECT id, title, author, category, stock, cover FROM buku "
                    "WHERE title = %s LIMIT 1 FOR UPDATE",
                    (title,),
                )
            else:
                raise ValueError("Buku tidak valid")

            book = cur.fetchone()
            if book is None:
                raise LookupError("Buku tidak ditemukan")
            if book["stock"] <= 0:
                raise LookupError("Stok buku tidak tersedia")

            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman "
                "WHERE user_id = %s AND status = 'borrowed'",
                (user_id,),
            )
            if cur.fetchone()["total"] >= 5:
                raise LookupError("Maksimal peminjaman 5 buku aktif")

            cur.execute(
                "SELECT id FROM peminjaman "
                "WHERE user_id = %s AND book_id = %s AND status = 'borrowed'",
                (user_id, book["id"]),
            )
            if cur.fetchone() is not None:
                raise LookupError("Buku ini sedang Anda pinjam")

            cur.execute(
                "UPDATE buku SET stock = stock - 1 WHERE id = %s",
                (book["id"],),
            )
            cur.execute(
                "INSERT INTO peminjaman (user_id, book_id, due_date) "
                "VALUES (%s, %s, DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY))",
                (user_id, book["id"]),
            )
            loan_id = cur.lastrowid

            cur.execute(
                "SELECT p.id, p.user_id, p.book_id, p.borrowed_at, p.due_date, "
                "p.returned_at, p.status, b.title, b.author, b.category, b.cover "
                "FROM peminjaman p JOIN buku b ON b.id = p.book_id "
                "WHERE p.id = %s",
                (loan_id,),
            )
            return cur.fetchone()



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
            if loan["status"] != "borrowed":
                raise LoanRuleError("Pinjaman ini sudah dikembalikan")
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

            cur.execute(
                "SELECT p.id, p.user_id, p.book_id, p.borrowed_at, p.due_date, "
                "p.returned_at, p.status, p.renew_count, b.title, b.author, b.category, b.cover "
                "FROM peminjaman p JOIN buku b ON b.id = p.book_id "
                "WHERE p.id = %s",
                (loan_id,),
            )
            return cur.fetchone()



    @staticmethod
    def count_this_month(user_id):
        """Berapa kali user ini meminjam di bulan berjalan."""
        with cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman "
                "WHERE user_id = %s "
                "AND YEAR(borrowed_at) = YEAR(CURRENT_DATE()) "
                "AND MONTH(borrowed_at) = MONTH(CURRENT_DATE())",
                (user_id,),
            )
            return cur.fetchone()["total"]
