"""Application services — DB access + domain math. Mirrors the old API modules
(directory / expenses / balances / turn / settlements). Responses are built as
JSON-safe dicts (datetimes as ISO strings) so they can also be stored verbatim
in an IdempotencyRecord for safe replays (I9).
"""

import uuid

from django.db import transaction

from domain import (
    DomainError,
    compute_shares,
    compute_nets,
    assert_balanced,
    simplify,
    next_payer_balanced,
    next_payer_round_robin,
    compute_rotation_nets,
    build_upi_intent,
)

from .models import (
    User,
    Group,
    GroupMember,
    Expense,
    ExpenseShare,
    Settlement,
    ActivityEvent,
    Comment,
    IdempotencyRecord,
)


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def log_activity(actor_id: int, type_: str, target: str, payload: dict) -> None:
    ActivityEvent.objects.create(actor_id=actor_id, type=type_, target=target, payload=payload)


def active_members(group_id: int):
    return GroupMember.objects.filter(group_id=group_id, left_at__isnull=True)


def is_active_member(group_id: int, user_id: int) -> bool:
    return active_members(group_id).filter(user_id=user_id).exists()


def require_group_member(group_id: int, actor_id: int) -> Group:
    """Authorization gate for anything scoped to a group: the group must exist
    and the actor must be an active member. 404s both ways so outsiders can't
    probe which group ids exist."""
    g = Group.objects.filter(id=group_id, deleted_at__isnull=True).first()
    if not g or not is_active_member(group_id, actor_id):
        raise DomainError("NOT_FOUND", "group not found")
    return g


def _can_access_expense(e: Expense, actor_id: int) -> bool:
    """Group expenses: any active member. Personal expenses: creator or anyone
    on the split."""
    if e.group_id is not None:
        return is_active_member(e.group_id, actor_id)
    if e.created_by_id == actor_id:
        return True
    return e.shares.filter(user_id=actor_id).exists()


def require_expense_access(expense_id: int, actor_id: int, *, include_deleted: bool = False) -> Expense:
    qs = Expense.objects.filter(id=expense_id)
    if not include_deleted:
        qs = qs.filter(deleted_at__isnull=True)
    e = qs.prefetch_related("shares").first()
    if not e or not _can_access_expense(e, actor_id):
        raise DomainError("NOT_FOUND", "expense not found")
    return e


# ── Directory: users & groups ───────────────────────────────────────────────

def user_to_dict(u: User) -> dict:
    return {
        "id": u.id,
        "phone": u.phone,
        "email": u.email,
        "name": u.name,
        "avatar_url": u.avatar_url,
        "upi_vpa": u.upi_vpa,
        "default_currency": u.default_currency,
        "locale": u.locale,
        "created_at": _iso(u.created_at),
    }


def group_to_dict(g: Group) -> dict:
    members = list(
        active_members(g.id).order_by("user_id").values_list("user_id", flat=True)
    )
    return {
        "id": g.id,
        "name": g.name,
        "type": g.type,
        "cover_url": g.cover_url,
        "base_currency": g.base_currency,
        "rotation_enabled": g.rotation_enabled,
        "rotation_mode": g.rotation_mode,
        "rotation_rr_order": g.rotation_rr_order,
        "rotation_rr_pos": g.rotation_rr_pos,
        "created_by": g.created_by_id,
        "created_at": _iso(g.created_at),
        "members": members,
    }


def create_user(data: dict) -> dict:
    phone = data.get("phone")
    if phone:
        # Same normalization as OTP login, so an invited person and the account
        # they later sign in with resolve to ONE user, not two.
        from .auth_service import normalize_phone

        phone = normalize_phone(phone)
        existing = User.objects.filter(phone=phone).first()
        if existing:
            return user_to_dict(existing)
    u = User.objects.create(
        name=data["name"],
        phone=phone,
        email=data.get("email"),
        upi_vpa=data.get("upi_vpa"),
        locale=data["locale"],
    )
    return user_to_dict(u)


def list_users(for_user: int | None = None) -> list[dict]:
    """Directory scoped to the caller: self, friends, and co-members of any of
    their groups. Passing ``None`` (internal/tests) returns everyone."""
    if for_user is None:
        return [user_to_dict(u) for u in User.objects.order_by("id")]
    from .models import Friendship

    ids = {for_user}
    ids |= set(Friendship.objects.filter(user_low_id=for_user).values_list("user_high_id", flat=True))
    ids |= set(Friendship.objects.filter(user_high_id=for_user).values_list("user_low_id", flat=True))
    my_groups = GroupMember.objects.filter(user_id=for_user, left_at__isnull=True).values_list("group_id", flat=True)
    ids |= set(GroupMember.objects.filter(group_id__in=list(my_groups)).values_list("user_id", flat=True))
    return [user_to_dict(u) for u in User.objects.filter(id__in=ids).order_by("id")]


def get_user(user_id: int) -> dict | None:
    u = User.objects.filter(id=user_id).first()
    return user_to_dict(u) if u else None


def update_user(user_id: int, data: dict) -> dict:
    u = User.objects.filter(id=user_id).first()
    if not u:
        raise DomainError("NOT_FOUND", "user not found")
    fields = []
    # name/locale must stay non-empty; upi_vpa/avatar_url may be cleared (null).
    for key in ("name", "locale"):
        if key in data and isinstance(data[key], str) and data[key].strip():
            setattr(u, key, data[key].strip()[:100])
            fields.append(key)
    for key in ("upi_vpa", "avatar_url"):
        if key in data:
            v = data[key]
            if v is not None and not isinstance(v, str):
                raise DomainError("VALIDATION_ERROR", f"{key} must be a string or null")
            v = (v or "").strip() or None
            if key == "upi_vpa" and v is not None and "@" not in v:
                raise DomainError("VALIDATION_ERROR", "UPI ID should look like name@bank")
            setattr(u, key, v)
            fields.append(key)
    if fields:
        u.save(update_fields=fields)
    return user_to_dict(u)


def search_users(query: str, exclude_id: int | None = None, limit: int = 20) -> list[dict]:
    from django.db.models import Q

    q = (query or "").strip()
    if not q:
        return []
    qs = User.objects.filter(Q(name__icontains=q) | Q(phone__icontains=q) | Q(email__icontains=q))
    if exclude_id is not None:
        qs = qs.exclude(id=exclude_id)
    return [user_to_dict(u) for u in qs.order_by("name")[:limit]]


# ── Friends ─────────────────────────────────────────────────────────────────

def list_friends(user_id: int) -> list[dict]:
    from .models import Friendship

    pairs = Friendship.objects.filter(user_low_id=user_id).values_list("user_high_id", flat=True)
    pairs2 = Friendship.objects.filter(user_high_id=user_id).values_list("user_low_id", flat=True)
    ids = set(pairs) | set(pairs2)
    return [user_to_dict(u) for u in User.objects.filter(id__in=ids).order_by("name")]


def add_friend(user_id: int, other_id: int) -> dict:
    from .models import Friendship

    if user_id == other_id:
        raise DomainError("VALIDATION_ERROR", "cannot friend yourself")
    if not User.objects.filter(id=other_id).exists():
        raise DomainError("NOT_FOUND", "user not found")
    lo, hi = sorted((user_id, other_id))
    Friendship.objects.get_or_create(user_low_id=lo, user_high_id=hi)
    return {"ok": True, "friends": list_friends(user_id)}


# ── Group membership management ──────────────────────────────────────────────

def add_group_member(group_id: int, actor_id: int, user_id: int) -> dict:
    g = Group.objects.filter(id=group_id, deleted_at__isnull=True).first()
    if not g:
        raise DomainError("NOT_FOUND", "group not found")
    if not is_active_member(group_id, actor_id):
        raise DomainError("FORBIDDEN", "only members can add people")
    if not User.objects.filter(id=user_id).exists():
        raise DomainError("NOT_FOUND", "user not found")
    existing = GroupMember.objects.filter(group_id=group_id, user_id=user_id).first()
    if existing:
        if existing.left_at is not None:
            existing.left_at = None
            existing.save(update_fields=["left_at"])
    else:
        GroupMember.objects.create(group_id=group_id, user_id=user_id, role="member", in_rotation=g.rotation_enabled)
    log_activity(actor_id, "group.member_added", f"group:{group_id}", {"user_id": user_id})
    return get_group(group_id)


def remove_group_member(group_id: int, actor_id: int, user_id: int) -> dict:
    from django.utils import timezone

    if not is_active_member(group_id, actor_id):
        raise DomainError("FORBIDDEN", "only members can remove people")
    # Guard: can't remove someone who still owes/is owed money (§ integrity).
    bal = group_balances(group_id)
    net = next((m["net_paise"] for m in bal["members"] if m["user_id"] == user_id), 0)
    if net != 0:
        raise DomainError("MEMBER_HAS_BALANCE", "settle up before removing this member")
    m = GroupMember.objects.filter(group_id=group_id, user_id=user_id, left_at__isnull=True).first()
    if m:
        m.left_at = timezone.now()
        m.save(update_fields=["left_at"])
        log_activity(actor_id, "group.member_removed", f"group:{group_id}", {"user_id": user_id})
    return get_group(group_id)


@transaction.atomic
def create_group(data: dict) -> dict:
    member_ids = list(dict.fromkeys([data["created_by"], *data["member_ids"]]))
    existing = set(User.objects.filter(id__in=member_ids).values_list("id", flat=True))
    missing = [m for m in member_ids if m not in existing]
    if missing:
        raise DomainError("NOT_FOUND", f"user {missing[0]} not found")
    g = Group.objects.create(
        name=data["name"],
        type=data["type"],
        rotation_enabled=data["rotation_enabled"],
        rotation_mode=data["rotation_mode"],
        rotation_rr_order=member_ids if data["rotation_mode"] == "round_robin" else [],
        rotation_rr_pos=0,
        created_by_id=data["created_by"],
    )
    for uid in member_ids:
        GroupMember.objects.create(
            group=g,
            user_id=uid,
            role="owner" if uid == data["created_by"] else "member",
            in_rotation=data["rotation_enabled"],
        )
    log_activity(data["created_by"], "group.created", f"group:{g.id}", {"name": g.name})
    return group_to_dict(g)


def list_groups(user_id: int | None = None) -> list[dict]:
    qs = Group.objects.filter(deleted_at__isnull=True).order_by("id")
    out = []
    for g in qs:
        if user_id is not None and not is_active_member(g.id, user_id):
            continue
        out.append(group_to_dict(g))
    return out


def get_group(group_id: int) -> dict | None:
    g = Group.objects.filter(id=group_id, deleted_at__isnull=True).first()
    return group_to_dict(g) if g else None


# ── Expenses ────────────────────────────────────────────────────────────────

def _expense_to_response(e: Expense, shares: list[dict]) -> dict:
    return {
        "id": e.id,
        "group_id": e.group_id,
        "description": e.description,
        "amount_paise": e.amount_paise,
        "currency": e.currency,
        "expense_date": e.expense_date.isoformat() if not isinstance(e.expense_date, str) else e.expense_date,
        "is_rotation": e.is_rotation,
        "created_by": e.created_by_id,
        "shares": [
            {**s, "net_paise": s["paid_paise"] - s["owed_paise"]} for s in shares
        ],
        "created_at": _iso(e.created_at),
    }


def create_expense(data: dict, idempotency_key: str) -> tuple[int, dict]:
    replay = IdempotencyRecord.objects.filter(key=idempotency_key).first()
    if replay:
        return 200, replay.body

    with transaction.atomic():
        group_id = data["group_id"]

        # Authorization: payers & participants must be active members (§).
        if group_id is not None:
            everyone = {p["user_id"] for p in data["payers"]} | set(data["split"]["participants"])
            for u in everyone:
                if not is_active_member(group_id, u):
                    raise DomainError("NOT_GROUP_MEMBER", f"user {u} is not an active member")

        # Rotation expenses: participants must equal ALL active rotation members (§9.2).
        if data["is_rotation"]:
            if group_id is None:
                raise DomainError("ROTATION_PARTICIPANTS_MISMATCH", "rotation expense needs a group")
            rot_members = sorted(
                active_members(group_id).filter(in_rotation=True).values_list("user_id", flat=True)
            )
            parts = sorted(data["split"]["participants"])
            if rot_members != parts or len(data["payers"]) != 1:
                raise DomainError("ROTATION_PARTICIPANTS_MISMATCH")

        # Money math — largest-remainder, integer paise (§5). Throws §11 codes.
        shares = compute_shares(data["amount_paise"], data["payers"], data["split"])

        # Invariant I1/I2 belt-and-suspenders assert before persisting.
        total_paid = sum(s["paid_paise"] for s in shares)
        total_owed = sum(s["owed_paise"] for s in shares)
        if total_paid != data["amount_paise"] or total_owed != data["amount_paise"]:
            raise DomainError("PAYERS_SUM_MISMATCH", "invariant I1 violated")

        e = Expense.objects.create(
            group_id=group_id,
            description=data["description"],
            amount_paise=data["amount_paise"],
            currency=data["currency"],
            category_id=data["category_id"],
            expense_date=data["expense_date"],
            source=data["source"],
            is_rotation=data["is_rotation"],
            created_by_id=data["created_by"],
            idempotency_key=uuid.UUID(idempotency_key) if _is_uuid(idempotency_key) else None,
        )
        ExpenseShare.objects.bulk_create(
            [
                ExpenseShare(
                    expense=e,
                    user_id=s["user_id"],
                    paid_paise=s["paid_paise"],
                    owed_paise=s["owed_paise"],
                )
                for s in shares
            ]
        )
        log_activity(
            data["created_by"],
            "expense.created",
            f"expense:{e.id}",
            {
                "group_id": group_id,
                "description": data["description"],
                "amount_paise": data["amount_paise"],
                "participants": sorted({s["user_id"] for s in shares}),
            },
        )

        body = _expense_to_response(e, shares)
        IdempotencyRecord.objects.create(key=idempotency_key, status=201, body=body)
        return 201, body


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _shares_of(e: Expense) -> list[dict]:
    return [
        {"user_id": s.user_id, "paid_paise": s.paid_paise, "owed_paise": s.owed_paise}
        for s in e.shares.all()
    ]


def list_group_expenses(group_id: int) -> list[dict]:
    qs = (
        Expense.objects.filter(group_id=group_id, deleted_at__isnull=True)
        .order_by("-id")
        .prefetch_related("shares")
    )
    return [_expense_to_response(e, _shares_of(e)) for e in qs]


def list_personal_expenses(user_id: int, other_id: int | None = None) -> list[dict]:
    """Non-group ("personal") expenses the user takes part in, newest first.
    These are as first-class as group expenses — the caller sees any split they
    are a share of. Optionally scoped to a single counterparty (``other_id``)."""
    mine = ExpenseShare.objects.filter(user_id=user_id).values_list("expense_id", flat=True)
    qs = (
        Expense.objects.filter(id__in=list(mine), group__isnull=True, deleted_at__isnull=True)
        .order_by("-id")
        .prefetch_related("shares")
    )
    out = []
    for e in qs:
        shares = _shares_of(e)
        if other_id is not None and not any(s["user_id"] == other_id for s in shares):
            continue
        out.append(_expense_to_response(e, shares))
    return out


def get_expense(expense_id: int, actor: int) -> dict:
    e = require_expense_access(expense_id, actor)
    return _expense_to_response(e, _shares_of(e))


def update_expense(expense_id: int, actor: int, data: dict) -> dict:
    """Edit an expense in place: recompute shares from the new amount/split.
    Membership rules mirror create_expense."""
    with transaction.atomic():
        e = Expense.objects.select_for_update().filter(id=expense_id, deleted_at__isnull=True).first()
        if not e:
            raise DomainError("NOT_FOUND", "expense not found")
        group_id = e.group_id
        if group_id is not None:
            if not is_active_member(group_id, actor):
                raise DomainError("FORBIDDEN", "only group members can edit")
        elif e.created_by_id != actor:
            raise DomainError("FORBIDDEN", "only the creator can edit this expense")

        if group_id is not None:
            everyone = {p["user_id"] for p in data["payers"]} | set(data["split"]["participants"])
            for u in everyone:
                if not is_active_member(group_id, u):
                    raise DomainError("NOT_GROUP_MEMBER", f"user {u} is not an active member")

        shares = compute_shares(data["amount_paise"], data["payers"], data["split"])
        total_paid = sum(s["paid_paise"] for s in shares)
        total_owed = sum(s["owed_paise"] for s in shares)
        if total_paid != data["amount_paise"] or total_owed != data["amount_paise"]:
            raise DomainError("PAYERS_SUM_MISMATCH", "invariant I1 violated")

        e.description = data["description"]
        e.amount_paise = data["amount_paise"]
        e.currency = data.get("currency", e.currency)
        if data.get("expense_date"):
            e.expense_date = data["expense_date"]
        e.save(update_fields=["description", "amount_paise", "currency", "expense_date", "updated_at"])

        e.shares.all().delete()
        ExpenseShare.objects.bulk_create(
            [ExpenseShare(expense=e, user_id=s["user_id"], paid_paise=s["paid_paise"], owed_paise=s["owed_paise"]) for s in shares]
        )
        log_activity(actor, "expense.updated", f"expense:{e.id}", {"group_id": group_id, "description": data["description"], "amount_paise": data["amount_paise"], "participants": sorted({s["user_id"] for s in shares})})
        return _expense_to_response(e, shares)


def soft_delete_expense(expense_id: int, actor: int) -> None:
    from django.utils import timezone

    e = Expense.objects.filter(id=expense_id, deleted_at__isnull=True).first()
    if not e:
        return
    if not _can_access_expense(e, actor):
        raise DomainError("NOT_FOUND", "expense not found")
    participants = sorted(e.shares.values_list("user_id", flat=True))
    e.deleted_at = timezone.now()
    e.save(update_fields=["deleted_at"])
    log_activity(actor, "expense.deleted", f"expense:{expense_id}",
                 {"group_id": e.group_id, "description": e.description, "amount_paise": e.amount_paise,
                  "participants": participants})


def restore_expense(expense_id: int, actor: int) -> None:
    e = Expense.objects.filter(id=expense_id, deleted_at__isnull=False).first()
    if not e:
        return
    if not _can_access_expense(e, actor):
        raise DomainError("NOT_FOUND", "expense not found")
    e.deleted_at = None
    e.save(update_fields=["deleted_at"])
    log_activity(actor, "expense.restored", f"expense:{expense_id}", {"group_id": e.group_id})


# ── Comments ────────────────────────────────────────────────────────────────

def _comment_to_dict(c: Comment) -> dict:
    return {
        "id": c.id,
        "expense_id": c.expense_id,
        "user_id": c.user_id,
        "body": c.body,
        "created_at": _iso(c.created_at),
    }


def list_comments(expense_id: int, actor: int) -> list[dict]:
    require_expense_access(expense_id, actor)
    qs = Comment.objects.filter(expense_id=expense_id).order_by("id")
    return [_comment_to_dict(c) for c in qs]


def add_comment(expense_id: int, actor: int, body: str) -> dict:
    body = (body or "").strip()
    if not body:
        raise DomainError("VALIDATION_ERROR", "comment body is required")
    if len(body) > 2000:
        raise DomainError("VALIDATION_ERROR", "comment is too long")
    e = Expense.objects.filter(id=expense_id, deleted_at__isnull=True).first()
    if not e:
        raise DomainError("NOT_FOUND", "expense not found")
    # Only members of the expense's group may comment (personal expenses: creator only).
    if e.group_id is not None:
        if not is_active_member(e.group_id, actor):
            raise DomainError("FORBIDDEN", "only group members can comment")
    elif e.created_by_id != actor:
        raise DomainError("FORBIDDEN", "not allowed to comment")
    c = Comment.objects.create(expense_id=expense_id, user_id=actor, body=body)
    log_activity(actor, "comment.created", f"expense:{expense_id}",
                 {"group_id": e.group_id, "comment_id": c.id, "description": e.description})
    return _comment_to_dict(c)


# ── Balances ────────────────────────────────────────────────────────────────

def group_balances(group_id: int) -> dict:
    shares: list[dict] = []
    for e in Expense.objects.filter(group_id=group_id, deleted_at__isnull=True).prefetch_related("shares"):
        shares.extend(_shares_of(e))
    settlements = [
        {
            "from_user": s.from_user_id,
            "to_user": s.to_user_id,
            "amount_paise": s.amount_paise,
            "status": s.status,
            "deleted_at": _iso(s.deleted_at),
        }
        for s in Settlement.objects.filter(group_id=group_id, deleted_at__isnull=True)
    ]
    nets = compute_nets(shares, settlements)

    # Ensure every active member shows up even with a zero balance.
    for uid in active_members(group_id).values_list("user_id", flat=True):
        nets.setdefault(uid, 0)
    assert_balanced(nets)  # I3

    members = [
        {"user_id": uid, "net_paise": net}
        for uid, net in sorted(nets.items())
    ]
    return {
        "group_id": group_id,
        "members": members,
        "simplified_settlements": simplify(nets),
    }


def personal_balances(user_id: int) -> dict:
    """Pairwise balances from non-group ("personal") expenses & settlements.

    Each personal expense is settled internally (via simplify) so multi-party
    personal expenses still yield correct pairwise debts; confirmed non-group
    settlements then move each pair toward zero. Returns nets from ``user_id``'s
    point of view: + means they owe me, − means I owe them."""
    pair: dict[int, int] = {}

    expenses = (
        Expense.objects.filter(group__isnull=True, deleted_at__isnull=True)
        .prefetch_related("shares")
    )
    for e in expenses:
        share_rows = list(e.shares.all())
        if not any(s.user_id == user_id for s in share_rows):
            continue
        nets = {s.user_id: s.paid_paise - s.owed_paise for s in share_rows}
        for t in simplify(nets):
            if t["from_user"] == user_id:  # I owe the creditor
                pair[t["to_user"]] = pair.get(t["to_user"], 0) - t["amount_paise"]
            elif t["to_user"] == user_id:  # a debtor owes me
                pair[t["from_user"]] = pair.get(t["from_user"], 0) + t["amount_paise"]

    for s in Settlement.objects.filter(
        group__isnull=True, deleted_at__isnull=True, status="confirmed"
    ):
        if s.from_user_id == user_id:  # I paid them → I owe them less
            pair[s.to_user_id] = pair.get(s.to_user_id, 0) + s.amount_paise
        elif s.to_user_id == user_id:  # they paid me → they owe me less
            pair[s.from_user_id] = pair.get(s.from_user_id, 0) - s.amount_paise

    return {
        "user_id": user_id,
        "counterparties": [
            {"user_id": uid, "net_paise": net}
            for uid, net in sorted(pair.items())
            if net != 0
        ],
    }


# ── Turn to Pay ─────────────────────────────────────────────────────────────

def whose_turn(group_id: int) -> dict:
    group = Group.objects.filter(id=group_id, deleted_at__isnull=True).first()
    if not group:
        raise DomainError("ROTATION_DISABLED", "group not found")
    if not group.rotation_enabled:
        raise DomainError("ROTATION_DISABLED")

    members = [
        {"user_id": m.user_id, "in_rotation": m.in_rotation, "left_at": _iso(m.left_at)}
        for m in active_members(group_id)
    ]
    expenses = []
    for e in (
        Expense.objects.filter(group_id=group_id, deleted_at__isnull=True, is_rotation=True)
        .prefetch_related("shares")
    ):
        expenses.append(
            {
                "is_rotation": True,
                "deleted_at": None,
                "expense_date": e.expense_date.isoformat(),
                "shares": _shares_of(e),
            }
        )

    if group.rotation_mode == "round_robin":
        payer = next_payer_round_robin(group.rotation_rr_order, group.rotation_rr_pos)
        if payer is None:
            raise DomainError("ROTATION_DISABLED", "no rotation order set")
        nets = compute_rotation_nets(members, expenses)
        max_abs = max((abs(v["net"]) for v in nets.values()), default=0)
        return {
            "group_id": group_id,
            "mode": "round_robin",
            "next_payer": {
                "user_id": payer,
                "rotation_net_paise": nets.get(payer, {}).get("net", 0),
            },
            "max_abs_rotation_net_paise": max_abs,
            "reason": "Round-robin order",
        }

    t = next_payer_balanced(members, expenses)
    if t is None:
        raise DomainError("ROTATION_DISABLED", "no rotation members")
    behind = (
        f"Behind by ₹{abs(t.rotation_net_paise) / 100} in the rotation"
        if t.rotation_net_paise < 0
        else "Fairly balanced"
    )
    return {
        "group_id": group_id,
        "mode": "balanced",
        "next_payer": {"user_id": t.next_payer, "rotation_net_paise": t.rotation_net_paise},
        "max_abs_rotation_net_paise": t.max_abs_rotation_net_paise,
        "reason": behind,
    }


# ── Settlements ─────────────────────────────────────────────────────────────

def create_settlement(data: dict, idempotency_key: str) -> tuple[int, dict]:
    replay = IdempotencyRecord.objects.filter(key=idempotency_key).first()
    if replay:
        return 200, replay.body

    with transaction.atomic():
        if data["from_user"] == data["to_user"]:
            raise DomainError("NOT_GROUP_MEMBER", "from_user must differ from to_user")
        creditor = User.objects.filter(id=data["to_user"]).first()
        if not creditor:
            raise DomainError("NOT_GROUP_MEMBER", "creditor not found")
        if data["group_id"] is not None:
            require_group_member(data["group_id"], data["from_user"])
            if not is_active_member(data["group_id"], data["to_user"]):
                raise DomainError("NOT_GROUP_MEMBER", "creditor is not a member of this group")

        intent = build_upi_intent(
            vpa=creditor.upi_vpa,
            payee_name=creditor.name,
            amount_paise=data["amount_paise"],
            note=data.get("note") or "Squared Up",
        )
        method = "upi" if (data["method"] == "upi" and intent) else "manual"

        s = Settlement.objects.create(
            group_id=data["group_id"],
            from_user_id=data["from_user"],
            to_user_id=data["to_user"],
            amount_paise=data["amount_paise"],
            method=method,
            status="pending",
            note=data.get("note"),
            idempotency_key=uuid.UUID(idempotency_key) if _is_uuid(idempotency_key) else None,
        )
        log_activity(
            data["from_user"],
            "settlement.created",
            f"settlement:{s.id}",
            {"group_id": data["group_id"], "amount_paise": data["amount_paise"], "to": data["to_user"]},
        )

        body = {
            "id": s.id,
            "status": s.status,
            "method": method,
            "upi_intent": intent if method == "upi" else None,
            "requires_confirmation": True,
        }
        IdempotencyRecord.objects.create(key=idempotency_key, status=201, body=body)
        return 201, body


def _settlement_to_dict(s: Settlement) -> dict:
    return {
        "id": s.id,
        "group_id": s.group_id,
        "from_user": s.from_user_id,
        "to_user": s.to_user_id,
        "amount_paise": s.amount_paise,
        "method": s.method,
        "status": s.status,
        "note": s.note,
        "created_at": _iso(s.created_at),
        "confirmed_at": _iso(s.confirmed_at),
    }


def _require_settlement_party(settlement_id: int, actor: int) -> Settlement:
    s = Settlement.objects.filter(id=settlement_id, deleted_at__isnull=True).first()
    if not s or actor not in (s.from_user_id, s.to_user_id):
        raise DomainError("NOT_FOUND", "settlement not found")
    return s


def confirm_settlement(settlement_id: int, actor: int) -> dict:
    from django.utils import timezone

    s = _require_settlement_party(settlement_id, actor)
    if s.status == "confirmed":
        return _settlement_to_dict(s)
    s.status = "confirmed"
    s.confirmed_at = timezone.now()
    s.save(update_fields=["status", "confirmed_at"])
    log_activity(actor, "settlement.confirmed", f"settlement:{s.id}",
                 {"group_id": s.group_id, "amount_paise": s.amount_paise, "to": s.to_user_id})
    return _settlement_to_dict(s)


def dispute_settlement(settlement_id: int, actor: int) -> dict:
    s = _require_settlement_party(settlement_id, actor)
    s.status = "disputed"
    s.save(update_fields=["status"])
    log_activity(actor, "settlement.disputed", f"settlement:{s.id}",
                 {"group_id": s.group_id, "amount_paise": s.amount_paise, "to": s.to_user_id})
    return _settlement_to_dict(s)


# ── Activity ────────────────────────────────────────────────────────────────

def _activity_to_dict(a: ActivityEvent) -> dict:
    return {
        "id": a.id,
        "actor": a.actor_id,
        "type": a.type,
        "target": a.target,
        "payload": a.payload,
        "created_at": _iso(a.created_at),
    }


def recent_activity(user_id: int | None = None) -> list[dict]:
    """Feed for the current user: events they authored, plus events in any group
    they belong to. Falls back to the global feed when no user is given."""
    rows = list(ActivityEvent.objects.order_by("-id")[:300])
    if user_id is None:
        return [_activity_to_dict(a) for a in rows[:100]]

    my_group_ids = set(
        GroupMember.objects.filter(user_id=user_id, left_at__isnull=True).values_list("group_id", flat=True)
    )
    out = []
    for a in rows:
        target = a.target or ""
        gid = None
        if target.startswith("group:"):
            try:
                gid = int(target.split(":", 1)[1])
            except ValueError:
                gid = None
        payload = a.payload or {}
        if gid is None:
            pgid = payload.get("group_id")
            gid = pgid if isinstance(pgid, int) else None
        participants = payload.get("participants")
        relevant = (
            a.actor_id == user_id
            or (gid is not None and gid in my_group_ids)
            or payload.get("to") == user_id
            or payload.get("user_id") == user_id
            or (isinstance(participants, list) and user_id in participants)
        )
        if relevant:
            out.append(_activity_to_dict(a))
        if len(out) >= 100:
            break
    return out


# ── Settlement history ───────────────────────────────────────────────────────

def list_settlements(user_id: int, group_id: int | None = None) -> list[dict]:
    from django.db.models import Q

    qs = Settlement.objects.filter(deleted_at__isnull=True).order_by("-id")
    if group_id is not None:
        require_group_member(group_id, user_id)
        qs = qs.filter(group_id=group_id)
    else:
        qs = qs.filter(Q(from_user_id=user_id) | Q(to_user_id=user_id))
    return [_settlement_to_dict(s) for s in qs[:200]]
