from datetime import date, timedelta
from math import ceil

from controllers.loan_controller import loan_data
from core.response import Response, error

from models.book import Book
from models.loan import MAX_DUE_DAYS, Loan, LoanNotFoundError, LoanRuleError
from models.stats import Stats
from models.user import User
from utils.text import initials

PER_PAGE = 8   # transaksi per halaman, sesuai tulisan di desain


def dashboard(request):
    # ?date=2026-11-22 -> tanggal acuan; kosong = hari ini
    raw = request.query.get("date", "")
    try:
        ref = date.fromisoformat(raw) if raw else date.today()
    except ValueError:
        return error("Format tanggal harus YYYY-MM-DD", 400)

    Loan.expire_stale()   # bereskan booking yang sudah hangus supaya angkanya akurat
    return Response(200, Stats.dashboard(ref))


def _display_status(row):
    """Status untuk tampilan: 'borrowed' yang lewat jatuh tempo jadi 'overdue'."""
    if row["status"] == "borrowed" and row["due_date"] and row["due_date"] < date.today():
        return "overdue"
    return row["status"]


def _loan_row(row):
    name = row["full_name"] or row["username"]
    return {
        "id": row["id"],
        "code": f"PN-{row['id']:04d}",
        "book_id": row["book_id"],
        "title": row["title"],
        "borrower": {
            "id": row["user_id"],
            "name": name,
            "initials": initials(name),
            "member_id": f"MB-{row['user_id']:04d}",
        },
        "status": row["status"],
        "display_status": _display_status(row),
        "borrowed_at": row["borrowed_at"],
        "confirmed_at": row["confirmed_at"],
        "due_date": row["due_date"],
        "returned_at": row["returned_at"],
    }


def loans(request):
    Loan.expire_stale()

    status = request.query.get("status", "all")
    period = request.query.get("period", "all")
    q = request.query.get("q", "")
    raw_page = request.query.get("page", "1")
    page = int(raw_page) if raw_page.isdigit() and int(raw_page) > 0 else 1

    rows, total = Loan.admin_search(status, q, period, page, PER_PAGE)
    return Response(200, {
        "loans": [_loan_row(row) for row in rows],
        "total": total,
        "page": page,
        "per_page": PER_PAGE,
        "pages": max(1, ceil(total / PER_PAGE)),
        "summary": Loan.admin_summary(),
    })

def create_loan(request):
    """Petugas mencatat peminjaman langsung di meja layanan (tanpa booking)."""
    body = request.json()
    member_text = str(body.get("member") or "").strip()
    book_text = str(body.get("book") or "").strip()
    raw_due = body.get("due_date")

    if not member_text or not book_text:
        return error("Peminjam dan judul buku wajib diisi", 400)

    members = User.find_for_admin(member_text)
    if not members:
        return error(
            "Anggota tidak ditemukan. Gunakan NPM, ID anggota (MB-0008), atau nama lengkap", 404
        )
    if len(members) > 1:
        return error("Ada lebih dari satu anggota yang cocok, gunakan NPM atau ID anggota", 409)

    books = Book.find_for_admin(book_text)
    if not books:
        return error("Buku tidak ditemukan. Gunakan judul persis atau kode BK-007", 404)
    if len(books) > 1:
        return error("Ada lebih dari satu buku yang cocok, gunakan kode BK-007", 409)

    due = None
    if raw_due:
        try:
            due = date.fromisoformat(str(raw_due))
        except ValueError:
            return error("Format jatuh tempo harus YYYY-MM-DD", 400)
        today = date.today()
        if due < today or due > today + timedelta(days=MAX_DUE_DAYS):
            return error(
                f"Jatuh tempo harus antara hari ini dan {MAX_DUE_DAYS} hari ke depan", 400
            )

    Loan.expire_stale()
    try:
        loan = Loan.create(members[0]["id"], book_id=books[0]["id"], confirmed=True, due_date=due)
        return Response(201, {"loan": loan_data(loan)})
    except LoanNotFoundError as exc:
        return error(str(exc), 404)
    except LoanRuleError as exc:
        return error(str(exc), 409)