from database.db import cursor


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
