from django.urls import path

from . import views, views_auth

urlpatterns = [
    path("health", views.health),

    # ── Auth (public) ──
    path("auth/request-otp", views_auth.request_otp),
    path("auth/verify-otp", views_auth.verify_otp),
    path("auth/google", views_auth.google_login),
    path("auth/refresh", views_auth.refresh_token),
    path("auth/me", views_auth.me),  # GET / PATCH

    # ── Directory ──
    path("users", views.users),  # GET list / ?query= search
    path("users/<int:pk>", views.user_detail),
    path("friends", views.friends),  # GET list / POST add
    path("friends/<int:uid>", views.friend_detail),  # DELETE unfriend

    # ── Groups ──
    path("groups", views.groups),  # GET my groups (?archived=1 for archived) / POST create
    path("groups/<int:pk>", views.groups_detail),  # GET / DELETE (archive, owner-only)
    path("groups/<int:pk>/restore", views.groups_restore),  # POST un-archive (owner-only)
    path("groups/<int:pk>/members", views.group_members),  # POST add
    path("groups/<int:pk>/members/<int:uid>", views.group_member_detail),  # DELETE
    path("groups/<int:pk>/expenses", views.group_expenses),
    path("groups/<int:pk>/balances", views.group_balances),
    path("groups/<int:pk>/turn", views.group_turn),

    # ── Expenses ──
    path("expenses", views.expenses_create),  # POST
    path("expenses/personal", views.personal_expenses),  # GET non-group splits (?with=uid)
    path("expenses/<int:pk>", views.expense_detail),  # GET / PATCH / DELETE
    path("expenses/<int:pk>/restore", views.expenses_restore),  # POST
    path("expenses/<int:pk>/comments", views.expense_comments),  # GET / POST

    # ── Balances ──
    path("balances/personal", views.personal_balances),  # GET pairwise non-group nets

    # ── Settlements ──
    path("settlements", views.settlements),  # GET history / POST create
    path("settlements/<int:pk>/confirm", views.settlements_confirm),
    path("settlements/<int:pk>/dispute", views.settlements_dispute),

    # ── AI + activity ──
    path("ai/parse", views.ai_parse),
    path("ai/categorize", views.ai_categorize),
    path("activity", views.activity_feed),
]
