"""Demo seed: 3 flatmates + a rotation-enabled "Home" group, matching the
worked example in Spec §9.7. Lets the web app boot with live data.

Idempotent: does nothing if users already exist. Run with::

    python manage.py seed
"""

import uuid

from django.core.management.base import BaseCommand

from core import services
from core.models import User, Group, Expense


class Command(BaseCommand):
    help = "Seed demo users, groups, and expenses."

    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write("Seed skipped: users already exist.")
            return

        # Demo users are treated as fully joined (not invite placeholders).
        aarav = services.create_user(
            {"name": "Aarav", "phone": "+919000000001", "email": None, "upi_vpa": "aarav@okhdfc", "locale": "en", "is_placeholder": False}
        )
        bhavna = services.create_user(
            {"name": "Bhavna", "phone": "+919000000002", "email": None, "upi_vpa": "bhavna@okaxis", "locale": "en", "is_placeholder": False}
        )
        chetan = services.create_user(
            {"name": "Chetan", "phone": "+919000000003", "email": None, "upi_vpa": None, "locale": "hi", "is_placeholder": False}
        )

        home = services.create_group(
            {
                "name": "Flat 304",
                "type": "home",
                "created_by": aarav["id"],
                "member_ids": [bhavna["id"], chetan["id"]],
                "rotation_enabled": True,
                "rotation_mode": "balanced",
            }
        )
        trip = services.create_group(
            {
                "name": "Goa Trip",
                "type": "trip",
                "created_by": aarav["id"],
                "member_ids": [bhavna["id"], chetan["id"]],
                "rotation_enabled": False,
                "rotation_mode": "balanced",
            }
        )

        services.create_expense(
            {
                "group_id": trip["id"],
                "description": "Beach shack dinner",
                "amount_paise": 180000,
                "currency": "INR",
                "expense_date": "2026-06-20",
                "category_id": None,
                "source": "manual",
                "is_rotation": False,
                "created_by": aarav["id"],
                "payers": [{"user_id": aarav["id"], "paid_paise": 180000}],
                "split": {"type": "equal", "participants": [aarav["id"], bhavna["id"], chetan["id"]]},
            },
            str(uuid.uuid4()),
        )
        services.create_expense(
            {
                "group_id": trip["id"],
                "description": "Scooter rental",
                "amount_paise": 90000,
                "currency": "INR",
                "expense_date": "2026-06-21",
                "category_id": None,
                "source": "manual",
                "is_rotation": False,
                "created_by": bhavna["id"],
                "payers": [{"user_id": bhavna["id"], "paid_paise": 90000}],
                "split": {
                    "type": "shares",
                    "participants": [aarav["id"], bhavna["id"], chetan["id"]],
                    "shares": {str(aarav["id"]): 1, str(bhavna["id"]): 1, str(chetan["id"]): 2},
                },
            },
            str(uuid.uuid4()),
        )
        services.create_expense(
            {
                "group_id": home["id"],
                "description": "Groceries — Blinkit",
                "amount_paise": 90000,
                "currency": "INR",
                "expense_date": "2026-06-22",
                "category_id": None,
                "source": "manual",
                "is_rotation": True,
                "created_by": aarav["id"],
                "payers": [{"user_id": aarav["id"], "paid_paise": 90000}],
                "split": {"type": "equal", "participants": [aarav["id"], bhavna["id"], chetan["id"]]},
            },
            str(uuid.uuid4()),
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"[seed] users={User.objects.count()} groups={Group.objects.count()} expenses={Expense.objects.count()}"
            )
        )
