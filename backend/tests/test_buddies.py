"""Tests für Buddy-Endpoints: GET /buddies, POST, DELETE, /me, /customer/{id}"""
import pytest
import uuid

from models.buddy import AiBuddy


@pytest.fixture
async def buddy(db_session, regular_user) -> AiBuddy:
    b = AiBuddy(
        customer_id=regular_user.id,
        name="TestBaddi",
        usecase_id="firma",
        segment="personal",
        is_active=True,
    )
    db_session.add(b)
    await db_session.commit()
    await db_session.refresh(b)
    return b


class TestListBuddies:
    async def test_list_empty(self, client):
        resp = await client.get("/v1/buddies")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_returns_active_buddies(self, client, buddy):
        resp = await client.get("/v1/buddies")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "TestBaddi"

    async def test_list_excludes_inactive(self, client, db_session, buddy):
        buddy.is_active = False
        await db_session.commit()
        resp = await client.get("/v1/buddies")
        assert resp.json() == []


class TestMyBuddies:
    async def test_me_returns_own_buddies(self, client, user_headers, buddy):
        resp = await client.get("/v1/buddies/me", headers=user_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["customer_id"] == str(buddy.customer_id)

    async def test_me_requires_auth(self, client):
        resp = await client.get("/v1/buddies/me")
        assert resp.status_code == 401

    async def test_me_returns_only_own_buddies(self, client, db_session, user_headers, regular_user, admin_user):
        # Admin-Buddy anlegen — darf nicht in /me des regular_user auftauchen
        other = AiBuddy(
            customer_id=admin_user.id,
            name="AdminBaddi",
            usecase_id="firma",
            segment="personal",
        )
        db_session.add(other)
        await db_session.commit()

        resp = await client.get("/v1/buddies/me", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json() == []  # regular_user hat keinen eigenen Buddy


class TestCustomerBuddies:
    async def test_list_requires_admin(self, client, regular_user, user_headers, buddy):
        resp = await client.get(
            f"/v1/buddies/customer/{regular_user.id}", headers=user_headers
        )
        assert resp.status_code == 403

    async def test_list_as_admin(self, client, regular_user, admin_user, admin_headers, buddy):
        resp = await client.get(
            f"/v1/buddies/customer/{regular_user.id}", headers=admin_headers
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_list_empty_for_customer_without_buddies(
        self, client, regular_user, admin_user, admin_headers
    ):
        resp = await client.get(
            f"/v1/buddies/customer/{regular_user.id}", headers=admin_headers
        )
        assert resp.status_code == 200
        assert resp.json() == []


class TestGetBuddy:
    async def test_get_existing(self, client, buddy):
        resp = await client.get(f"/v1/buddies/{buddy.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(buddy.id)
        assert resp.json()["name"] == "TestBaddi"

    async def test_get_nonexistent_returns_404(self, client):
        resp = await client.get(f"/v1/buddies/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestCreateBuddy:
    async def test_create_success(self, client, regular_user):
        resp = await client.post("/v1/buddies", json={
            "customer_id": str(regular_user.id),
            "usecase_id": "firma",
            "name": "Aria",
            "segment": "personal",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Aria"
        assert data["usecase_id"] == "firma"
        assert data["is_active"] is True

    async def test_create_sets_default_persona_config(self, client, regular_user):
        resp = await client.post("/v1/buddies", json={
            "customer_id": str(regular_user.id),
            "usecase_id": "firma",
            "name": "Luna",
        })
        assert resp.status_code == 201
        config = resp.json()["persona_config"]
        assert config is not None
        assert "preferred_model" in config

    async def test_create_merges_custom_persona_config(self, client, regular_user):
        resp = await client.post("/v1/buddies", json={
            "customer_id": str(regular_user.id),
            "usecase_id": "firma",
            "name": "Max",
            "persona_config": {"tone": "formal"},
        })
        assert resp.status_code == 201
        config = resp.json()["persona_config"]
        assert config["tone"] == "formal"

    async def test_created_buddy_in_list(self, client, regular_user):
        await client.post("/v1/buddies", json={
            "customer_id": str(regular_user.id),
            "usecase_id": "firma",
            "name": "ListBuddy",
        })
        resp = await client.get("/v1/buddies")
        names = [b["name"] for b in resp.json()]
        assert "ListBuddy" in names


class TestDeleteBuddy:
    async def test_delete_requires_admin(self, client, buddy, user_headers):
        resp = await client.delete(f"/v1/buddies/{buddy.id}", headers=user_headers)
        assert resp.status_code == 403

    async def test_delete_as_admin_returns_204(self, client, buddy, admin_user, admin_headers):
        resp = await client.delete(f"/v1/buddies/{buddy.id}", headers=admin_headers)
        assert resp.status_code == 204

    async def test_delete_is_soft_delete(self, client, db_session, buddy, admin_user, admin_headers):
        await client.delete(f"/v1/buddies/{buddy.id}", headers=admin_headers)
        await db_session.refresh(buddy)
        assert buddy.is_active is False  # Soft-Delete: Record bleibt in DB

    async def test_deleted_buddy_not_in_list(self, client, buddy, admin_user, admin_headers):
        await client.delete(f"/v1/buddies/{buddy.id}", headers=admin_headers)
        resp = await client.get("/v1/buddies")
        assert resp.json() == []

    async def test_delete_nonexistent_returns_404(self, client, admin_user, admin_headers):
        resp = await client.delete(
            f"/v1/buddies/{uuid.uuid4()}", headers=admin_headers
        )
        assert resp.status_code == 404


class TestChatEndpoint:
    async def test_chat_nonexistent_buddy_returns_404(self, client):
        resp = await client.post(
            f"/v1/buddies/{uuid.uuid4()}/chat",
            json={"message": "Hallo", "model": "auto"},
        )
        assert resp.status_code == 404
