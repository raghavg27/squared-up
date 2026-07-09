"""Regressions from stress-testing real-world multi-user flows: OTP brute-force
cap, idempotency-key scoping, archived-group read-only, round-robin advance,
owner removal, directory search privacy, unfriending."""

import uuid

import pytest
from rest_framework.test import APIClient

from core.auth import issue_tokens
from core.models import Group, OtpCode, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


def _mk_user(name: str, phone: str | None = None) -> int:
    return User.objects.create(name=name, phone=phone, locale="en").id


def _as(client: APIClient, user_id: int) -> APIClient:
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user_id)['access']}")
    return client


def _expense_body(gid: int | None, payer: int, participants: list[int], amount: int = 9000) -> dict:
    return {
        "group_id": gid, "description": "x", "amount_paise": amount,
        "payers": [{"user_id": payer, "paid_paise": amount}],
        "split": {"type": "equal", "participants": participants},
    }


def _post_expense(client: APIClient, body: dict, key: str | None = None):
    return client.post("/api/v1/expenses", body, format="json",
                       HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()))


def test_otp_attempt_cap_survives_failed_attempts(client):
    phone = "+919777000001"
    code = client.post("/api/v1/auth/request-otp", {"phone": phone}, format="json").data["dev_code"]
    for _ in range(5):
        r = client.post("/api/v1/auth/verify-otp", {"phone": phone, "code": "000000"}, format="json")
        assert r.status_code == 400
    # Wrong guesses must persist: the CORRECT code is now rejected too.
    r = client.post("/api/v1/auth/verify-otp", {"phone": phone, "code": code}, format="json")
    assert r.status_code == 400
    assert OtpCode.objects.get(phone=phone).attempts == 5


def test_otp_code_single_use(client):
    phone = "+919777000002"
    code = client.post("/api/v1/auth/request-otp", {"phone": phone}, format="json").data["dev_code"]
    assert client.post("/api/v1/auth/verify-otp", {"phone": phone, "code": code}, format="json").status_code == 200
    r = client.post("/api/v1/auth/verify-otp", {"phone": phone, "code": code}, format="json")
    assert r.status_code == 400


def test_idempotency_key_scoped_per_user(client):
    a, b = _mk_user("A"), _mk_user("B")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "G", "member_ids": [b]}, format="json").data["id"]
    key = str(uuid.uuid4())
    ra = _post_expense(client, _expense_body(gid, a, [a, b]), key)
    assert ra.status_code == 201
    # Same key, same user → replay of the stored response.
    assert _post_expense(client, _expense_body(gid, a, [a, b]), key).status_code == 200
    # Same key, DIFFERENT user → their own fresh expense, not A's response.
    _as(client, b)
    rb = _post_expense(client, _expense_body(gid, b, [a, b]), key)
    assert rb.status_code == 201
    assert rb.data["id"] != ra.data["id"]
    assert rb.data["created_by"] == b


def test_personal_expense_with_unknown_user_is_clean_404(client):
    a = _mk_user("A")
    _as(client, a)
    r = _post_expense(client, _expense_body(None, a, [a, 987654]))
    assert r.status_code == 404
    assert r.data["error"]["code"] == "NOT_FOUND"


def test_archived_group_is_read_only(client):
    a, b = _mk_user("A"), _mk_user("B")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "G", "member_ids": [b]}, format="json").data["id"]
    eid = _post_expense(client, _expense_body(gid, a, [a, b])).data["id"]
    assert client.delete(f"/api/v1/groups/{gid}").status_code == 200  # archive
    # Members can still read…
    assert client.get(f"/api/v1/groups/{gid}/balances").status_code == 200
    assert client.get(f"/api/v1/expenses/{eid}").status_code == 200
    # …but every mutation inside is blocked.
    assert _post_expense(client, _expense_body(gid, a, [a, b])).status_code == 404
    assert client.patch(f"/api/v1/expenses/{eid}", _expense_body(gid, a, [a, b]), format="json").status_code == 404
    assert client.delete(f"/api/v1/expenses/{eid}").status_code == 404
    assert client.post(f"/api/v1/expenses/{eid}/comments", {"body": "hi"}, format="json").status_code == 404
    assert client.delete(f"/api/v1/groups/{gid}/members/{b}").status_code == 404
    # Restore → mutable again.
    assert client.post(f"/api/v1/groups/{gid}/restore").status_code == 200
    assert client.delete(f"/api/v1/expenses/{eid}").status_code == 204


def test_group_owner_cannot_be_removed(client):
    a, b = _mk_user("A"), _mk_user("B")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "G", "member_ids": [b]}, format="json").data["id"]
    _as(client, b)
    r = client.delete(f"/api/v1/groups/{gid}/members/{a}")
    assert r.status_code == 403
    assert r.data["error"]["code"] == "FORBIDDEN"


def test_round_robin_advances_and_tracks_membership(client):
    a, b, c = _mk_user("A"), _mk_user("B"), _mk_user("C")
    _as(client, a)
    gid = client.post(
        "/api/v1/groups",
        {"name": "RR", "member_ids": [b], "rotation_enabled": True, "rotation_mode": "round_robin"},
        format="json",
    ).data["id"]

    def turn():
        return client.get(f"/api/v1/groups/{gid}/turn").data["next_payer"]["user_id"]

    first = turn()
    body = _expense_body(gid, first, sorted([a, b]))
    body["is_rotation"] = True
    assert _post_expense(client, body).status_code == 201
    second = turn()
    assert second != first  # cursor advanced
    # New member joins the rotation order.
    client.post(f"/api/v1/groups/{gid}/members", {"user_id": c}, format="json")
    assert c in Group.objects.get(id=gid).rotation_rr_order
    # Departing member leaves the order.
    client.delete(f"/api/v1/groups/{gid}/members/{c}")
    assert c not in Group.objects.get(id=gid).rotation_rr_order


def test_search_does_not_enumerate_strangers(client):
    a = _mk_user("Aarav")
    _mk_user("Balaji Stranger", phone="+919777123456")
    _as(client, a)
    # Name substring of a stranger → nothing.
    assert client.get("/api/v1/users?query=Balaji").data == []
    # Partial phone → nothing.
    assert client.get("/api/v1/users?query=97771").data == []
    # Exact full phone (any format) → found; that's the invite flow.
    hits = client.get("/api/v1/users?query=9777123456").data
    assert [u["phone"] for u in hits] == ["+919777123456"]


def test_search_finds_people_in_my_circle(client):
    a, b = _mk_user("Aarav"), _mk_user("Bhavna")
    _as(client, a)
    client.post("/api/v1/friends", {"user_id": b}, format="json")
    assert [u["id"] for u in client.get("/api/v1/users?query=Bhav").data] == [b]


def test_unfriend(client):
    a, b = _mk_user("A"), _mk_user("B")
    _as(client, a)
    client.post("/api/v1/friends", {"user_id": b}, format="json")
    assert [u["id"] for u in client.get("/api/v1/friends").data] == [b]
    r = client.delete(f"/api/v1/friends/{b}")
    assert r.status_code == 200 and r.data["friends"] == []
    # Idempotent: removing again is still OK.
    assert client.delete(f"/api/v1/friends/{b}").status_code == 200
