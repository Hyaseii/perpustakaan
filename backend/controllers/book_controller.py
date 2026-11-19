from core.response import Response
from models.book import Book
from views import book_view


def list_books(request):
    search = request.query.get("q", "").strip()
    category = request.query.get("category", "").strip()
    if category == "All":
        category = ""
    books = Book.find_all(search or None, category or None)
    return book_view.book_list(books)


def get_book(request):
    raw_id = request.params.get("id", "")
    if not raw_id.isdigit():
        return Response(404, {"message": "Buku tidak ditemukan"})

    book = Book.find_by_id(int(raw_id))
    if book is None:
        return Response(404, {"message": "Buku tidak ditemukan"})
    return book_view.book_detail(book)