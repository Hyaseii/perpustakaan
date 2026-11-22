from datetime import timedelta
from utils.text import initials
from database.db import cursor

CHART_DAYS = 7        # grafik "buku dipinjam per hari": 7 hari, berakhir di tanggal acuan
TOP_BORROWERS = 4     # jumlah baris "Peminjam paling aktif"
RECENT_LOANS = 5      # jumlah baris "Peminjaman terbaru"


class Stats:
    @staticmethod
    def dashboard(ref):
        """Semua angka dashboard admin. `ref` = tanggal acuan (objek date), biasanya hari ini."""
        week_ago = ref - timedelta(days=7)

        with cursor() as cur:
            # buku: jumlah judul dan jumlah eksemplar yang masih tersedia di rak
            cur.execute(
                "SELECT COUNT(*) AS titles, COALESCE(SUM(stock), 0) AS available FROM buku"
            )
            books = cur.fetchone()

            # peminjaman saat ini: sedang dipinjam, menunggu konfirmasi, terlambat
            cur.execute(
                "SELECT COALESCE(SUM(status = 'borrowed'), 0) AS borrowed, "
                "COALESCE(SUM(status = 'pending'), 0) AS pending, "
                "COALESCE(SUM(status = 'borrowed' AND due_date < CURRENT_DATE()), 0) AS overdue "
                "FROM peminjaman"
            )
            loans = cur.fetchone()

            # anggota: total, dan yang mendaftar di bulan tanggal acuan
            cur.execute(
                "SELECT COUNT(*) AS total, "
                "COALESCE(SUM(YEAR(created_at) = YEAR(%s) AND MONTH(created_at) = MONTH(%s)), 0) "
                "AS new_month "
                "FROM `user` WHERE role = 'member'",
                (ref, ref),
            )
            members = cur.fetchone()

            # jumlah pinjaman dikonfirmasi per hari, dari 7 hari sebelum acuan sampai acuan.
            # Satu query ini cukup untuk: angka hari ini, pembanding minggu lalu, dan grafik.
            cur.execute(
                "SELECT DATE(confirmed_at) AS day, COUNT(*) AS total FROM peminjaman "
                "WHERE status IN ('borrowed', 'returned') "
                "AND DATE(confirmed_at) BETWEEN %s AND %s "
                "GROUP BY DATE(confirmed_at)",
                (week_ago, ref),
            )
            per_day = {row["day"]: row["total"] for row in cur.fetchall()}

            # buku yang dikembalikan pada tanggal acuan
            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman "
                "WHERE status = 'returned' AND DATE(returned_at) = %s",
                (ref,),
            )
            returned_today = cur.fetchone()["total"]

            # anggota paling aktif meminjam di bulan tanggal acuan
            cur.execute(
                "SELECT u.id, u.username, u.full_name, COUNT(*) AS total "
                "FROM peminjaman p JOIN `user` u ON u.id = p.user_id "
                "WHERE p.status IN ('borrowed', 'returned') "
                "AND YEAR(p.confirmed_at) = YEAR(%s) AND MONTH(p.confirmed_at) = MONTH(%s) "
                "GROUP BY u.id, u.username, u.full_name "
                "ORDER BY total DESC, u.id "
                "LIMIT %s",
                (ref, ref, TOP_BORROWERS),
            )
            top_rows = cur.fetchall()

            # transaksi terbaru (termasuk yang masih menunggu konfirmasi)
            cur.execute(
                "SELECT p.id, p.status, p.borrowed_at, p.confirmed_at, p.due_date, "
                "b.title, u.username, u.full_name "
                "FROM peminjaman p "
                "JOIN buku b ON b.id = p.book_id "
                "JOIN `user` u ON u.id = p.user_id "
                "WHERE p.status IN ('pending', 'borrowed', 'returned') "
                "ORDER BY p.borrowed_at DESC, p.id DESC "
                "LIMIT %s",
                (RECENT_LOANS,),
            )
            recent_rows = cur.fetchall()

            cur.execute(
                "SELECT COUNT(*) AS total FROM peminjaman "
                "WHERE status IN ('pending', 'borrowed', 'returned')"
            )
            recent_total = cur.fetchone()["total"]

        available = int(books["available"])
        borrowed = int(loans["borrowed"])
        pending = int(loans["pending"])

        # susun 7 hari lengkap (hari tanpa pinjaman diisi 0), urut dari yang terlama
        days = [ref - timedelta(days=n) for n in range(CHART_DAYS - 1, -1, -1)]

        top = []
        for row in top_rows:
            name = row["full_name"] or row["username"]
            top.append({
                "member_id": f"MB-{row['id']:04d}",
                "name": name,
                "initials": initials(name),
                "total": row["total"],
            })

        recent = []
        for row in recent_rows:
            recent.append({
                "id": row["id"],
                "borrower": row["full_name"] or row["username"],
                "title": row["title"],
                "status": row["status"],
                "loaned_at": row["confirmed_at"] or row["borrowed_at"],
                "due_date": row["due_date"],
            })

        return {
            "date": ref,
            "borrowed_today": per_day.get(ref, 0),
            "borrowed_last_week": per_day.get(week_ago, 0),
            "returned_today": returned_today,
            "unique_titles": books["titles"],
            "total_copies": available + borrowed + pending,
            "active_members": members["total"],
            "new_members_month": int(members["new_month"]),
            "overdue": int(loans["overdue"]),
            "collection": {
                "available": available,
                "borrowed": borrowed,
                "pending": pending,
            },
            "borrowed_per_day": [{"date": d, "total": per_day.get(d, 0)} for d in days],
            "top_borrowers": top,
            "recent_loans": recent,
            "recent_total": recent_total,
        }