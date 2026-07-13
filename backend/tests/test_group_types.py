"""Group `type`: standard enum values plus user-defined custom labels.

The Spec §2 `group_type` enum is deliberately widened to free text (see
core/models.py Group.type) so users can create their own types ("Office",
"Society"). Standard types pass unchanged; custom labels are
whitespace-normalized and bounded to 2-24 chars.
"""

import pytest
from rest_framework.test import APIClient

from core.auth import issue_tokens
from core.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    c = APIClient()
    uid = User.objects.create(name="Aarav", locale="en").id
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(uid)['access']}")
    return c


def test_standard_type_unchanged(client):
    r = client.post("/api/v1/groups", {"name": "Goa", "type": "trip"}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["type"] == "trip"


def test_custom_type_saved_and_returned(client):
    r = client.post("/api/v1/groups", {"name": "Work lunches", "type": "Office"}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["type"] == "Office"
    assert client.get(f"/api/v1/groups/{r.data['id']}").data["type"] == "Office"


def test_custom_type_whitespace_normalized(client):
    r = client.post("/api/v1/groups", {"name": "G", "type": "  Cricket   club "}, format="json")
    assert r.status_code == 201
    assert r.data["type"] == "Cricket club"


@pytest.mark.parametrize("bad", ["x", "y" * 25, 7])
def test_custom_type_bounds_rejected(client, bad):
    r = client.post("/api/v1/groups", {"name": "G", "type": bad}, format="json")
    assert r.status_code == 422
    assert r.data["error"]["code"] == "VALIDATION_ERROR"
