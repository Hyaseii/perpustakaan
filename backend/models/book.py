from database.db import cursor

# nama kategori baku yang boleh disimpan (sama dengan yang dipakai filter di halaman member)
CATEGORIES = ("Fiction", "Arts", "Self-growth", "History", "Nature", "Design")


class BookNotFoundError(Exception):
    """Buku tidak ada."""


class BookRuleError(Exception):
    """Buku ada, tapi aturan tidak mengizinkan."""


# SELECT bersama untuk halaman admin; "active" = eksemplar yang sedang dipinjam atau dibooking
_ADMIN_SELECT = (
    "SELECT b.id, b.title, b.author, b.category, b.stock, b.cover, "
    "COALESCE(a.active, 0) AS active "
    "FROM buku b "
    "LEFT JOIN (SELECT book_id, COUNT(*) AS active FROM peminjaman "
    "           WHERE status IN ('pending', 'borrowed') GROUP BY book_id) a "
    "ON a.book_id = b.id "
)

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
    def admin_set_cover(book_id, cover):
        """Simpan path sampul baru. Hasil: (baris buku, path sampul lama)."""
        with cursor() as cur:
            cur.execute("SELECT cover FROM buku WHERE id = %s FOR UPDATE", (book_id,))
            row = cur.fetchone()
            if row is None:
                raise BookNotFoundError("Buku tidak ditemukan")
            cur.execute("UPDATE buku SET cover = %s WHERE id = %s", (cover, book_id))
            return Book._admin_get(cur, book_id), row["cover"]

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



    @staticmethod
    def _admin_get(cur, book_id):
        cur.execute(_ADMIN_SELECT + "WHERE b.id = %s", (book_id,))
        return cur.fetchone()

    @staticmethod
    def _ensure_unique(cur, title, author, ignore_id=0):
        cur.execute(
            "SELECT id FROM buku WHERE title = %s AND author = %s AND id <> %s LIMIT 1",
            (title, author, ignore_id),
        )
        if cur.fetchone() is not None:
            raise BookRuleError("Buku dengan judul dan penulis yang sama sudah ada")

    @staticmethod
    def admin_search(q="", category="all", status="all", page=1, per_page=8):
        """Daftar buku untuk halaman admin: dengan pencarian, filter, dan halaman."""
        conditions = []
        params = []

        q = q.strip()
        if q:
            like = f"%{q}%"
            parts = ["b.title LIKE %s", "b.author LIKE %s"]
            params += [like, like]
            code = q.upper().removeprefix("BK-").lstrip("0")   # "BK-007" -> "7"
            if code.isdigit():
                parts.append("b.id = %s")
                params.append(int(code))
            conditions.append("(" + " OR ".join(parts) + ")")

        if category != "all":
            conditions.append("b.category = %s")
            params.append(category)

        if status == "available":
            conditions.append("b.stock > 0")
        elif status == "on-loan":
            conditions.append("b.stock = 0")

        where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

        with cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total FROM buku b" + where, tuple(params))
            total = cur.fetchone()["total"]

            cur.execute(
                _ADMIN_SELECT + where + " ORDER BY b.id DESC LIMIT %s OFFSET %s",
                tuple(params) + (per_page, (page - 1) * per_page),
            )
            rows = cur.fetchall()

        return rows, total

    @staticmethod
    def admin_summary():
        """Angka untuk tiga kartu di atas halaman Buku admin."""
        with cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS titles, COALESCE(SUM(stock), 0) AS available, "
                "COUNT(DISTINCT category) AS categories FROM buku"
            )
            books = cur.fetchone()
            cur.execute(
                "SELECT COALESCE(SUM(status = 'borrowed'), 0) AS borrowed, "
                "COALESCE(SUM(status = 'pending'), 0) AS pending FROM peminjaman"
            )
            loans = cur.fetchone()
        return {
            "titles": books["titles"],
            "categories": books["categories"],
            "available": int(books["available"]),
            "borrowed": int(loans["borrowed"]),
            "pending": int(loans["pending"]),
        }

    @staticmethod
    def admin_create(title, author, category, total):
        """Tambah buku baru: semua eksemplar langsung tersedia."""
        with cursor() as cur:
            Book._ensure_unique(cur, title, author)
            cur.execute(
                "INSERT INTO buku (title, author, category, stock) VALUES (%s, %s, %s, %s)",
                (title, author, category, total),
            )
            return Book._admin_get(cur, cur.lastrowid)

    @staticmethod
    def admin_update(book_id, title, author, category, total):
        """Ubah data buku. `total` = stok total; yang tersedia = total - yang sedang keluar."""
        with cursor() as cur:
            cur.execute("SELECT id FROM buku WHERE id = %s FOR UPDATE", (book_id,))
            if cur.fetchone() is None:
                raise BookNotFoundError("Buku tidak ditemukan")

            Book._ensure_unique(cur, title, author, book_id)

            cur.execute(
                "SELECT COUNT(*) AS active FROM peminjaman "
                "WHERE book_id = %s AND status IN ('pending', 'borrowed')",
                (book_id,),
            )
            active = cur.fetchone()["active"]
            if total < active:
                raise BookRuleError(
                    f"Stok tidak boleh kurang dari {active} "
                    "(eksemplar yang sedang dipinjam atau dibooking)"
                )

            cur.execute(
                "UPDATE buku SET title = %s, author = %s, category = %s, stock = %s WHERE id = %s",
                (title, author, category, total - active, book_id),
            )
            return Book._admin_get(cur, book_id)

    @staticmethod
    def admin_delete(book_id):
        """Hapus buku. Hasil: path sampulnya (untuk menghapus berkas)."""
        with cursor() as cur:
            cur.execute("SELECT id, cover FROM buku WHERE id = %s FOR UPDATE", (book_id,))
            book = cur.fetchone()
            if book is None:
                raise BookNotFoundError("Buku tidak ditemukan")

            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman "
                "WHERE book_id = %s AND status IN ('pending', 'borrowed')",
                (book_id,),
            )
            if cur.fetchone()["total"] > 0:
                raise BookRuleError("Buku masih dipinjam atau dibooking, selesaikan dulu peminjamannya")

            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman WHERE book_id = %s AND status = 'returned'",
                (book_id,),
            )
            if cur.fetchone()["total"] > 0:
                raise BookRuleError("Buku ini punya riwayat peminjaman sehingga tidak bisa dihapus")

            cur.execute(
                "DELETE FROM peminjaman WHERE book_id = %s AND status IN ('cancelled', 'expired')",
                (book_id,),
            )
            cur.execute("DELETE FROM buku WHERE id = %s", (book_id,))
            return book["cover"]