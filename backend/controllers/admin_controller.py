from datetime import date, timedelta
from math import ceil

from controllers.loan_controller import loan_data
from core.response import Response, error

from utils.files import CoverError, delete_cover_file, save_cover
from models.book import CATEGORIES, Book, BookNotFoundError, BookRuleError
from models.loan import MAX_DUE_DAYS, Loan, LoanNotFoundError, LoanRuleError
from models.stats import Stats
from models.user import User
from utils.text import initials

PER_PAGE = 8   # transaksi per halaman, sesuai tulisan di desain
BOOKS_PER_PAGE = 8


def _path_id(request):
    raw = request.params.get("id", "")
    return int(raw) if raw.isdigit() else None


def _canonical_category(text):
    """'self-growth' / 'SELF-GROWTH' -> 'Self-growth'. Tidak dikenal -> None."""
    for name in CATEGORIES:
        if name.lower() == str(text).strip().lower():
            return name
    return None


def _book_row(row):
    available = row["stock"]
    return {
        "id": row["id"],
        "code": f"BK-{row['id']:03d}",
        "title": row["title"],
        "author": row["author"],
        "category": row["category"],
        "cover": row["cover"],
        "total": available + row["active"],       # stok total = tersedia + yang sedang keluar
        "available": available,
        "status": "available" if available > 0 else "on-loan",
    }


def _book_fields(body):
    """Periksa isian buku. Hasil: ((judul, penulis, kategori, total), None) atau (None, pesan)."""
    title = str(body.get("title") or "").strip()
    author = str(body.get("author") or "").strip()
    category = _canonical_category(body.get("category") or "")
    try:
        total = int(body.get("total"))
    except (TypeError, ValueError):
        total = -1

    if not title or len(title) > 255:
        return None, "Judul wajib diisi (maksimal 255 karakter)"
    if not author or len(author) > 255:
        return None, "Penulis wajib diisi (maksimal 255 karakter)"
    if category is None:
        return None, "Kategori tidak valid"
    if not 0 <= total <= 9999:
        return None, "Stok harus berupa angka 0 sampai 9999"
    return (title, author, category, total), None


def books(request):
    Loan.expire_stale()

    q = request.query.get("q", "")
    category = _canonical_category(request.query.get("category", "")) or "all"
    status = request.query.get("status", "all")
    raw_page = request.query.get("page", "1")
    page = int(raw_page) if raw_page.isdigit() and int(raw_page) > 0 else 1

    rows, total = Book.admin_search(q, category, status, page, BOOKS_PER_PAGE)
    return Response(200, {
        "books": [_book_row(row) for row in rows],
        "total": total,
        "page": page,
        "per_page": BOOKS_PER_PAGE,
        "pages": max(1, ceil(total / BOOKS_PER_PAGE)),
        "summary": Book.admin_summary(),
    })


def create_book(request):
    fields, problem = _book_fields(request.json())
    if problem:
        return error(problem, 400)
    if fields[3] < 1:
        return error("Stok minimal 1 untuk buku baru", 400)

    try:
        row = Book.admin_create(*fields)
        return Response(201, {"book": _book_row(row)})
    except BookRuleError as exc:
        return error(str(exc), 409)


def update_book(request):
    book_id = _path_id(request)
    if book_id is None:
        return error("Buku tidak ditemukan", 404)
    fields, problem = _book_fields(request.json())
    if problem:
        return error(problem, 400)

    Loan.expire_stale()
    try:
        row = Book.admin_update(book_id, *fields)
        return Response(200, {"book": _book_row(row)})
    except BookNotFoundError as exc:
        return error(str(exc), 404)
    except BookRuleError as exc:
        return error(str(exc), 409)


def delete_book(request):
    book_id = _path_id(request)
    if book_id is None:
        return error("Buku tidak ditemukan", 404)

    Loan.expire_stale()
    try:
        cover = Book.admin_delete(book_id)
    except BookNotFoundError as exc:
        return error(str(exc), 404)
    except BookRuleError as exc:
        return error(str(exc), 409)

    delete_cover_file(cover)   # berkas sampulnya ikut dihapus
    return Response(200, {"message": "Buku dihapus"})


def set_book_cover(request):
    book_id = _path_id(request)
    if book_id is None:
        return error("Buku tidak ditemukan", 404)

    try:
        path = save_cover(book_id, request.json().get("image"))
    except CoverError as exc:
        return error(str(exc), 400)

    try:
        row, old_cover = Book.admin_set_cover(book_id, path)
    except BookNotFoundError as exc:
        delete_cover_file(path)    # bukunya ternyata tidak ada: buang berkas yang baru disimpan
        return error(str(exc), 404)

    delete_cover_file(old_cover)   # sampul lama diganti
    return Response(200, {"book": _book_row(row)})

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