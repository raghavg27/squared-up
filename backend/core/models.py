"""ORM models — a faithful port of the canonical PostgreSQL schema
(Core Domain Spec §2). Money is integer paise in BIGINT; no floating point.

Auth is phone-OTP + JWT (see core.auth / core.auth_service), not Django auth:
``User`` has no password, and the acting user is always derived from the
bearer token — never from the request body.
"""

from django.db import models


class User(models.Model):
    phone = models.TextField(unique=True, null=True, blank=True)
    email = models.EmailField(unique=True, null=True, blank=True)
    # True when the email was proven via Google sign-in; such emails are locked
    # from user edits (Google is the source of truth). Manually-entered emails
    # stay False and remain editable.
    email_verified = models.BooleanField(default=False)
    # True for an invited-but-not-yet-joined person: a placeholder created by a
    # friend (create_user) so balances can be tracked on their behalf. Cleared
    # the moment they authenticate (OTP verify / Google login) and claim the row.
    is_placeholder = models.BooleanField(default=False)
    name = models.TextField()
    avatar_url = models.TextField(null=True, blank=True)
    upi_vpa = models.TextField(null=True, blank=True)
    default_currency = models.CharField(max_length=3, default="INR")
    locale = models.TextField(default="en")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "users"

    def __str__(self):
        return f"{self.name} (#{self.pk})"

    # DRF permission classes check ``request.user.is_authenticated``. A loaded
    # User row is, by definition, an authenticated principal (see core.auth).
    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False


class OtpCode(models.Model):
    """A one-time login code tied to a phone number. In dev the code is logged
    (not sent via SMS); swap ``core.sms`` for a real provider in production."""

    phone = models.TextField(db_index=True)
    code_hash = models.CharField(max_length=64)  # sha256 hex
    expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "otp_codes"
        indexes = [models.Index(fields=["phone", "created_at"], name="idx_otp_phone_time")]


class Friendship(models.Model):
    user_low = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    user_high = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "friendships"
        constraints = [
            models.UniqueConstraint(fields=["user_low", "user_high"], name="uq_friendship"),
            models.CheckConstraint(condition=models.Q(user_low__lt=models.F("user_high")), name="ck_friend_order"),
        ]


class Group(models.Model):
    TYPE_CHOICES = [("trip", "trip"), ("home", "home"), ("couple", "couple"), ("other", "other")]
    ROTATION_MODE_CHOICES = [("balanced", "balanced"), ("round_robin", "round_robin")]

    name = models.TextField()
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="other")
    cover_url = models.TextField(null=True, blank=True)
    base_currency = models.CharField(max_length=3, default="INR")
    default_split_config = models.JSONField(null=True, blank=True)
    rotation_enabled = models.BooleanField(default=False)
    rotation_mode = models.CharField(max_length=12, choices=ROTATION_MODE_CHOICES, default="balanced")
    rotation_rr_order = models.JSONField(default=list)  # list[int]
    rotation_rr_pos = models.IntegerField(default=0)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="groups_created")
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "groups"


class GroupMember(models.Model):
    ROLE_CHOICES = [("owner", "owner"), ("member", "member")]

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=6, choices=ROLE_CHOICES, default="member")
    in_rotation = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "group_members"
        constraints = [
            models.UniqueConstraint(fields=["group", "user"], name="uq_group_member"),
        ]


class Category(models.Model):
    parent = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children")
    name = models.TextField()
    icon = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "categories"


class Expense(models.Model):
    SOURCE_CHOICES = [("manual", "manual"), ("nl", "nl"), ("import", "import")]

    group = models.ForeignKey(Group, on_delete=models.PROTECT, null=True, blank=True, related_name="expenses")
    description = models.TextField()
    amount_paise = models.BigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    expense_date = models.DateField()
    source = models.CharField(max_length=6, choices=SOURCE_CHOICES, default="manual")
    is_rotation = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="expenses_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.UUIDField(unique=True, null=True, blank=True)

    class Meta:
        db_table = "expenses"
        indexes = [
            models.Index(fields=["group"], name="idx_expenses_group"),
        ]


class ExpenseShare(models.Model):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="shares")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="expense_shares")
    paid_paise = models.BigIntegerField(default=0)
    owed_paise = models.BigIntegerField(default=0)

    class Meta:
        db_table = "expense_shares"
        constraints = [
            models.UniqueConstraint(fields=["expense", "user"], name="uq_expense_share"),
        ]


class Settlement(models.Model):
    METHOD_CHOICES = [("upi", "upi"), ("manual", "manual")]
    STATUS_CHOICES = [
        ("pending", "pending"),
        ("confirmed", "confirmed"),
        ("disputed", "disputed"),
        ("cancelled", "cancelled"),
    ]

    group = models.ForeignKey(Group, on_delete=models.PROTECT, null=True, blank=True, related_name="settlements")
    from_user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="settlements_paid")
    to_user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="settlements_received")
    amount_paise = models.BigIntegerField()
    method = models.CharField(max_length=6, choices=METHOD_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.UUIDField(unique=True, null=True, blank=True)

    class Meta:
        db_table = "settlements"


class Comment(models.Model):
    """A free-text note attached to an expense by a group member."""

    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="comments")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "comments"
        indexes = [models.Index(fields=["expense", "created_at"], name="idx_comments_expense")]


class ActivityEvent(models.Model):
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="activity")
    type = models.TextField()
    target = models.TextField()
    payload = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "activity_events"


class IdempotencyRecord(models.Model):
    """Stores the response body for a mutating request so replays are safe (I9)."""

    key = models.CharField(max_length=255, unique=True)
    status = models.IntegerField()
    body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "idempotency_records"
