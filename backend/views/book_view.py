from core.response import Response


def book_data(book):
    """Pilih data buku yang boleh dikirim ke browser."""
    return {
        "id": book["id"],
        "title": book["title"],
        "author": book["author"],
        "category": book["category"],
        "isbn": book["isbn"],
        "stock": book["stock"],
        "cover": book["cover"],
        "available": book["stock"] > 0,
    }


def book_list(books):
    return Response(200, {"books": [book_data(b) for b in books]})


def book_detail(book):
    return Response(200, {"book": book_data(book)})