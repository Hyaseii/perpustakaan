from core.response import Response, error

from models.loan import Loan


def loan_data(loan):
    return {
        "id": loan["id"],
        "book_id": loan["book_id"],
        "title": loan["title"],
        "author": loan["author"],
        "category": loan["category"],
        "cover": loan["cover"],
        "borrowed_at": loan["borrowed_at"],
        "due_date": loan["due_date"],
        "returned_at": loan["returned_at"],
        "status": loan["status"],
    }


def list_loans(request):
    loans = Loan.find_active_for_user(request.user["id"])
    return Response(200, {"loans": [loan_data(loan) for loan in loans]})


def borrow(request):
    body = request.json()
    raw_book_id = body.get("book_id")
    book_id = int(raw_book_id) if isinstance(raw_book_id, int) or (
        isinstance(raw_book_id, str) and raw_book_id.isdigit()
    ) else None
    title = body.get("title")

    if book_id is None and not isinstance(title, str):
        return error("Buku tidak valid", 400)

    try:
        loan = Loan.create(request.user["id"], book_id=book_id, title=title)
        return Response(201, {"loan": loan_data(loan)})
    except LookupError as exc:
        return error(str(exc), 409)
