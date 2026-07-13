"""People who already share a group become friends (data backfill).

Forward-only: pairs every set of active co-members into `friendships`
(ignoring pairs that already exist). From this migration on, group create /
add-member keeps the table in sync (core.membership_service.befriend).
"""

from django.db import migrations


def backfill(apps, schema_editor):
    GroupMember = apps.get_model("core", "GroupMember")
    Friendship = apps.get_model("core", "Friendship")

    by_group: dict[int, list[int]] = {}
    for gid, uid in GroupMember.objects.filter(left_at__isnull=True).values_list("group_id", "user_id"):
        by_group.setdefault(gid, []).append(uid)

    pairs = set()
    for ids in by_group.values():
        ids = sorted(set(ids))
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                pairs.add((a, b))

    Friendship.objects.bulk_create(
        [Friendship(user_low_id=a, user_high_id=b) for a, b in sorted(pairs)],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0009_alter_group_type"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
