from database.db import cursor


class Book:
    @staticmethod
    def find_all(search=None, category=None):
        """Ambil daftar buku. Boleh dicari (judul/penulis/ISBN) dan disaring kategori."""
        sql = "SELECT id, title, author, category, isbn, stock, cover FROM buku"
        conditions = []
        params = []

        if search:
            conditions.append("(title LIKE %s OR author LIKE %s OR isbn LIKE %s)")
            like = f"%{search}%"
            params += [like, like, like]

        if category:
            conditions.append("category = %s")
            params.append(category)

        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY title"

        with cursor() as cur:
            cur.execute(sql, tuple(params))
            return cur.fetchall()

    @staticmethod
    def find_by_id(book_id):
        """Ambil satu buku berdasarkan id. Tidak ada -> None."""
        with cursor() as cur:
            cur.execute(
                "SELECT id, title, author, category, isbn, stock, cover "
                "FROM buku WHERE id = %s",
                (book_id,),
            )
            return cur.fetchone()