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
    
    @staticmethod
    def find_for_admin(text):
        """Cari buku dari teks petugas: judul persis atau kode BK-007. Hasil: daftar."""
        text = text.strip()
        if not text:
            return []
        upper = text.upper()
        book_id = int(upper[3:]) if upper.startswith("BK-") and upper[3:].isdigit() else 0
        with cursor() as cur:
            cur.execute(
                "SELECT id, title, stock FROM buku WHERE id = %s OR title = %s LIMIT 5",
                (book_id, text),
            )
            return cur.fetchall()