from controllers.admin_controller import _check_profile   # aturan nama/email/HP yang sama dengan halaman admin
from core.response import Response, error

from models.member import Member, MemberRuleError


def _profile_data(row):
    name = row["full_name"] or row["username"]
    return {
        "id": row["id"],
        "code": f"MB-{row['id']:04d}",
        "name": name,
        "username": row["username"],
        "npm": row["npm"] or row["username"],     # akun lama belum punya NPM: pakai username
        "email": row["email"],
        "phone": row["phone"],
        "role": row["role"],
        "created_at": row["created_at"],
        "visits_this_month": row["visits_this_month"],
    }


def get_profile(request):
    row = Member.profile(request.user["id"])
    if row is None:
        return error("Akun tidak ditemukan", 404)
    return Response(200, {"profile": _profile_data(row)})


def update_profile(request):
    profile, problem = _check_profile(request.json())
    if problem:
        return error(problem, 400)

    try:
        Member.update_own(request.user["id"], *profile)
    except MemberRuleError as exc:
        return error(str(exc), 409)

    return Response(200, {"profile": _profile_data(Member.profile(request.user["id"]))})