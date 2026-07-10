"""Backfill category_label on existing expenses from their description, so
analytics has real categories for pre-existing data (new rows are labelled at
create time in services.create_expense)."""

from django.db import migrations


def backfill(apps, schema_editor):
    from core.ai import categorize

    Expense = apps.get_model("core", "Expense")
    for e in Expense.objects.filter(category_label__isnull=True).iterator():
        e.category_label = categorize(e.description or "")
        e.save(update_fields=["category_label"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("core", "0006_expense_category_label_expenseitem")]
    operations = [migrations.RunPython(backfill, noop)]
