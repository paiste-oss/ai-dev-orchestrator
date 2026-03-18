"""Tests für Customer-Endpoints: GET /customers, POST, PATCH, DELETE, /stats"""
import pytest
import uuid

from models.customer import Customer
from core.security import hash_password


async def _create_customer(db_session, **kwargs) -> Customer:
    defaults = dict(
        name="Extra User",
        email=f"extra_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("x"),
        segment="personal",
        is_active=True,
    )
    defaults.update(kwargs)
    c = Customer(**defaults)
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


class TestListCustomers:
    async def test_list_empty(self, client):
        resp = await client.get("/v1/customers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_returns_existing_customers(self, client, regular_user, admin_user):
        resp = await client.get("/v1/customers")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    async def test_search_by_name(self, client, regular_user):
        resp = await client.get("/v1/customers?search=Test User")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["name"] == "Test User"

    async def test_search_case_insensitive(self, client, regular_user):
        resp = await client.get("/v1/customers?search=test user")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_filter_inactive(self, client, regular_user, inactive_user):
        resp = await client.get("/v1/customers?is_active=false")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["is_active"] is False

    async def test_filter_by_segment(self, client, db_session):
        await _create_customer(db_session, segment="corporate")
        await _create_customer(db_session, segment="personal")

        resp = await client.get("/v1/customers?segment=corporate")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_pagination(self, client, db_session):
        for i in range(5):
            await _create_customer(db_session, name=f"Page User {i}")

        resp = await client.get("/v1/customers?page=1&page_size=3")
        data = resp.json()
        assert len(data["items"]) == 3
        assert data["total"] == 5


class TestCreateCustomer:
    async def test_create_success(self, client):
        resp = await client.post("/v1/customers", json={
            "name": "Neuer Kunde",
            "email": "neukunde@test.local",
            "segment": "corporate",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Neuer Kunde"
        assert data["segment"] == "corporate"
        assert "id" in data

    async def test_create_duplicate_email_returns_409(self, client, regular_user):
        resp = await client.post("/v1/customers", json={
            "name": "Kopie",
            "email": "user@test.local",
        })
        assert resp.status_code == 409

    async def test_created_customer_appears_in_list(self, client):
        await client.post("/v1/customers", json={
            "name": "List Check",
            "email": "listcheck@test.local",
        })
        resp = await client.get("/v1/customers?search=List Check")
        assert resp.json()["total"] == 1


class TestGetCustomer:
    async def test_get_existing(self, client, regular_user):
        resp = await client.get(f"/v1/customers/{regular_user.id}")
        assert resp.status_code == 200
        assert resp.json()["email"] == "user@test.local"

    async def test_get_nonexistent_returns_404(self, client):
        resp = await client.get(f"/v1/customers/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_lookup_by_email(self, client, regular_user):
        resp = await client.get("/v1/customers/lookup?email=user@test.local")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(regular_user.id)

    async def test_lookup_unknown_email_returns_404(self, client):
        resp = await client.get("/v1/customers/lookup?email=keiner@test.local")
        assert resp.status_code == 404


class TestUpdateCustomer:
    async def test_update_requires_admin(self, client, regular_user, user_headers):
        resp = await client.patch(
            f"/v1/customers/{regular_user.id}",
            json={"name": "Hack"},
            headers=user_headers,
        )
        assert resp.status_code == 403

    async def test_update_as_admin(self, client, regular_user, admin_user, admin_headers):
        resp = await client.patch(
            f"/v1/customers/{regular_user.id}",
            json={"name": "Geändert", "segment": "elderly"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Geändert"
        assert data["segment"] == "elderly"

    async def test_update_partial_fields(self, client, regular_user, admin_user, admin_headers):
        resp = await client.patch(
            f"/v1/customers/{regular_user.id}",
            json={"name": "Nur Name"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["segment"] == "personal"  # unverändert

    async def test_update_nonexistent_returns_404(self, client, admin_user, admin_headers):
        resp = await client.patch(
            f"/v1/customers/{uuid.uuid4()}",
            json={"name": "Ghost"},
            headers=admin_headers,
        )
        assert resp.status_code == 404


class TestToggleActive:
    async def test_toggle_deactivates_active_user(self, client, regular_user):
        resp = await client.patch(f"/v1/customers/{regular_user.id}/toggle-active")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_toggle_twice_restores_original(self, client, regular_user):
        await client.patch(f"/v1/customers/{regular_user.id}/toggle-active")
        resp = await client.patch(f"/v1/customers/{regular_user.id}/toggle-active")
        assert resp.json()["is_active"] is True

    async def test_toggle_nonexistent_returns_404(self, client):
        resp = await client.patch(f"/v1/customers/{uuid.uuid4()}/toggle-active")
        assert resp.status_code == 404


class TestDeleteCustomer:
    async def test_delete_requires_admin(self, client, regular_user, user_headers):
        resp = await client.delete(
            f"/v1/customers/{regular_user.id}", headers=user_headers
        )
        assert resp.status_code == 403

    async def test_delete_as_admin_returns_204(self, client, regular_user, admin_user, admin_headers):
        resp = await client.delete(
            f"/v1/customers/{regular_user.id}", headers=admin_headers
        )
        assert resp.status_code == 204

    async def test_deleted_customer_not_found(self, client, regular_user, admin_user, admin_headers):
        await client.delete(f"/v1/customers/{regular_user.id}", headers=admin_headers)
        resp = await client.get(f"/v1/customers/{regular_user.id}")
        assert resp.status_code == 404

    async def test_delete_cascades_buddy_and_threads(
        self, client, db_session, regular_user, admin_user, admin_headers
    ):
        from sqlalchemy import select
        from models.buddy import AiBuddy, ConversationThread, Message

        buddy = AiBuddy(
            customer_id=regular_user.id,
            name="ZuLöschenderBuddy",
            usecase_id="firma",
            segment="personal",
        )
        db_session.add(buddy)
        await db_session.commit()
        await db_session.refresh(buddy)

        thread = ConversationThread(buddy_id=buddy.id)
        db_session.add(thread)
        await db_session.commit()
        await db_session.refresh(thread)

        db_session.add(Message(thread_id=thread.id, role="user", content="Hallo"))
        await db_session.commit()

        resp = await client.delete(
            f"/v1/customers/{regular_user.id}", headers=admin_headers
        )
        assert resp.status_code == 204

        result = await db_session.execute(
            select(AiBuddy).where(AiBuddy.customer_id == regular_user.id)
        )
        assert result.scalar_one_or_none() is None

    async def test_delete_nonexistent_returns_404(self, client, admin_user, admin_headers):
        resp = await client.delete(
            f"/v1/customers/{uuid.uuid4()}", headers=admin_headers
        )
        assert resp.status_code == 404


class TestCustomerStats:
    async def test_stats_without_buddies(self, client, regular_user):
        resp = await client.get(f"/v1/customers/{regular_user.id}/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["threads"] == 0
        assert data["messages"] == 0
        assert data["total_tokens"] == 0
        assert data["by_model"] == {}

    async def test_stats_nonexistent_customer(self, client):
        # Auch für unbekannte IDs sollte ein leeres Stats-Objekt kommen (kein 404)
        resp = await client.get(f"/v1/customers/{uuid.uuid4()}/stats")
        assert resp.status_code == 200
        assert resp.json()["threads"] == 0
