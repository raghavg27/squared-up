# Adds User.is_placeholder — invited-but-not-yet-joined flag. Existing rows
# default False (treated as already joined); new invites set it True.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_user_email_verified'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_placeholder',
            field=models.BooleanField(default=False),
        ),
    ]
