"""Re-run categorization for labels the old 7-category rules got wrong.

Only machine-set labels existed before this point (the category picker ships
with this change), so rewriting is safe — but be conservative anyway:
- null/"Other" labels are recomputed with the richer rules (e.g. "apple
  laptop" now lands in Shopping instead of Other).
- "Travel" is recomputed only when the new rules place it in Transport
  (daily commute — auto/cab/metro/fuel) or Travel; an LLM-assigned Travel
  that keywords can't confirm is kept.
Everything else (LLM-assigned Food/Groceries/…) is left untouched.
"""

from django.db import migrations


def recategorize(apps, schema_editor):
    from core.categories import categorize

    Expense = apps.get_model("core", "Expense")
    stale = Expense.objects.filter(category_label__in=["Other", "Travel"]) | Expense.objects.filter(
        category_label__isnull=True
    )
    for e in stale.iterator():
        new = categorize(e.description or "")
        if e.category_label == "Travel" and new not in ("Transport", "Travel"):
            continue
        if new != e.category_label:
            e.category_label = new
            e.save(update_fields=["category_label"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("core", "0007_backfill_category_label")]
    operations = [migrations.RunPython(recategorize, noop)]
