from core.response import Response
from models.book import Book
from views import book_view
from models.loan import Loan

def list_books(request):
    Loan.expire_stale()
    search = request.query.get("q", "").strip()
    category = request.query.get("category", "").strip()
    if category == "All":
        category = ""
    books = Book.find_all(search or None, category or None)
    return book_view.book_list(books)


def get_book(request):
    Loan.expire_stale()
    raw_id = request.params.get("id", "")
    if not raw_id.isdigit():
        return Response(404, {"message": "Buku tidak ditemukan"})

    book = Book.find_by_id(int(raw_id))
    if book is None:
        return Response(404, {"message": "Buku tidak ditemukan"})
    return book_view.book_detail(book)