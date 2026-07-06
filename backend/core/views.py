"""HTTP layer — thin DRF views that validate input, call services, and shape
responses. Error envelope + status codes match the Core Domain Spec.

The acting user is taken from the JWT (``request.user``), never trusted from the
request body — the ``_actor``/``_with_actor`` helpers enforce that.
"""

from datetime import datetime, timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import services
from .ai import parse_natural_language, categorize
from .exceptions import bad_request, not_found
from .validators import (
    validate_create_expense,
    validate_create_settlement,
    validate_create_group,
    validate_create_user,
)


def _require_idempotency_key(request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise bad_request("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required")
    return key


def _actor(request) -> int:
    return request.user.id


def _with_actor(request, field: str) -> dict:
    """Merge the authenticated user id into the body under ``field`` so the
    client can never spoof who created/paid."""
    body = dict(request.data)
    body[field] = request.user.id
    return body


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok", "ts": datetime.now(timezone.utc).isoformat()})


# ── Users / directory ──
@api_view(["GET", "POST"])
def users(request):
    # POST creates a directory/placeholder user (e.g. inviting someone by name
    # who hasn't signed in yet). Requires auth.
    if request.method == "POST":
        return Response(services.create_user(validate_create_user(request.data)), status=201)
    query = request.query_params.get("query")
    if query is not None:
        return Response(services.search_users(query, exclude_id=_actor(request)))
    return Response(services.list_users())


@api_view(["GET"])
def user_detail(request, pk: int):
    u = services.get_user(pk)
    if not u:
        raise not_found("user not found")
    return Response(u)


# ── Friends ──
@api_view(["GET", "POST"])
def friends(request):
    if request.method == "POST":
        other = request.data.get("user_id")
        if not isinstance(other, int):
            raise bad_request("VALIDATION_ERROR", "user_id (int) is required")
        return Response(services.add_friend(_actor(request), other), status=201)
    return Response(services.list_friends(_actor(request)))


# ── Groups ──
@api_view(["GET", "POST"])
def groups(request):
    if request.method == "POST":
        g = services.create_group(validate_create_group(_with_actor(request, "created_by")))
        return Response(services.get_group(g["id"]), status=201)
    # Default to the caller's groups; ?all=1 lists everything (admin/testing).
    if request.query_params.get("all"):
        return Response(services.list_groups(None))
    return Response(services.list_groups(_actor(request)))


@api_view(["GET"])
def groups_detail(request, pk: int):
    g = services.get_group(pk)
    if not g:
        raise not_found("group not found")
    return Response(g)


@api_view(["POST"])
def group_members(request, pk: int):
    user_id = request.data.get("user_id")
    if not isinstance(user_id, int):
        raise bad_request("VALIDATION_ERROR", "user_id (int) is required")
    return Response(services.add_group_member(pk, _actor(request), user_id), status=201)


@api_view(["DELETE"])
def group_member_detail(request, pk: int, uid: int):
    return Response(services.remove_group_member(pk, _actor(request), uid))


# ── Expenses ──
@api_view(["POST"])
def expenses_create(request):
    key = _require_idempotency_key(request)
    status, body = services.create_expense(validate_create_expense(_with_actor(request, "created_by")), key)
    return Response(body, status=status)


@api_view(["GET"])
def group_expenses(request, pk: int):
    return Response(services.list_group_expenses(pk))


@api_view(["GET", "PATCH", "DELETE"])
def expense_detail(request, pk: int):
    if request.method == "PATCH":
        data = validate_create_expense(_with_actor(request, "created_by"))
        return Response(services.update_expense(pk, _actor(request), data))
    if request.method == "DELETE":
        services.soft_delete_expense(pk, _actor(request))
        return Response(status=204)
    e = services.get_expense(pk)
    if not e:
        raise not_found("expense not found")
    return Response(e)


@api_view(["POST"])
def expenses_restore(request, pk: int):
    services.restore_expense(pk, _actor(request))
    return Response({"restored": True})


@api_view(["GET", "POST"])
def expense_comments(request, pk: int):
    if request.method == "POST":
        body = request.data.get("body")
        if not isinstance(body, str):
            raise bad_request("VALIDATION_ERROR", "body (string) is required")
        return Response(services.add_comment(pk, _actor(request), body), status=201)
    return Response(services.list_comments(pk))


# ── Balances & Turn ──
@api_view(["GET"])
def group_balances(request, pk: int):
    return Response(services.group_balances(pk))


@api_view(["GET"])
def group_turn(request, pk: int):
    return Response(services.whose_turn(pk))


# ── Settlements ──
@api_view(["GET", "POST"])
def settlements(request):
    if request.method == "POST":
        key = _require_idempotency_key(request)
        status, body = services.create_settlement(validate_create_settlement(_with_actor(request, "from_user")), key)
        return Response(body, status=status)
    group_id = request.query_params.get("group_id")
    return Response(services.list_settlements(_actor(request), int(group_id) if group_id else None))


@api_view(["PATCH"])
def settlements_confirm(request, pk: int):
    return Response(services.confirm_settlement(pk))


@api_view(["PATCH"])
def settlements_dispute(request, pk: int):
    return Response(services.dispute_settlement(pk))


# ── AI: NL entry (draft only) + categorize ──
@api_view(["POST"])
def ai_parse(request):
    text = request.data.get("text")
    if not isinstance(text, str) or not text:
        raise bad_request("VALIDATION_ERROR", "text is required")
    return Response(parse_natural_language(text))


@api_view(["POST"])
def ai_categorize(request):
    description = request.data.get("description")
    if not isinstance(description, str) or not description:
        raise bad_request("VALIDATION_ERROR", "description is required")
    return Response({"category": categorize(description)})


# ── Activity feed / notifications ──
@api_view(["GET"])
def activity_feed(request):
    return Response(services.recent_activity(_actor(request)))
