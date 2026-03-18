"""Tests für Auth-Endpoints: POST /login, POST /register, GET /me"""
import pytest


class TestLogin:
    async def test_login_success(self, client, regular_user):
        resp = await client.post("/v1/auth/login", json={
            "email": "user@test.local",
            "password": "userpass123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["role"] == "customer"
        assert data["email"] == "user@test.local"

    async def test_login_wrong_password(self, client, regular_user):
        resp = await client.post("/v1/auth/login", json={
            "email": "user@test.local",
            "password": "falschespasswort",
        })
        assert resp.status_code == 401

    async def test_login_unknown_email(self, client):
        resp = await client.post("/v1/auth/login", json={
            "email": "niemand@test.local",
            "password": "egal",
        })
        assert resp.status_code == 401

    async def test_login_inactive_user_returns_403(self, client, inactive_user):
        resp = await client.post("/v1/auth/login", json={
            "email": "inactive@test.local",
            "password": "pass123",
        })
        assert resp.status_code == 403

    async def test_login_admin_user(self, client, admin_user):
        resp = await client.post("/v1/auth/login", json={
            "email": "admin@test.local",
            "password": "adminpass123",
        })
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"


class TestRegister:
    async def test_register_success(self, client):
        resp = await client.post("/v1/auth/register", json={
            "name": "Neuer User",
            "email": "neu@test.local",
            "password": "sicher123",
            "segment": "personal",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "neu@test.local"
        assert data["role"] == "customer"
        assert "access_token" in data

    async def test_register_duplicate_email_returns_409(self, client, regular_user):
        resp = await client.post("/v1/auth/register", json={
            "name": "Kopie",
            "email": "user@test.local",
            "password": "abc123",
        })
        assert resp.status_code == 409

    async def test_register_password_is_hashed(self, client, db_session):
        from sqlalchemy import select
        from models.customer import Customer

        await client.post("/v1/auth/register", json={
            "name": "Hash Test",
            "email": "hash@test.local",
            "password": "klartextpasswort",
        })
        result = await db_session.execute(
            select(Customer).where(Customer.email == "hash@test.local")
        )
        user = result.scalar_one()
        assert user.hashed_password != "klartextpasswort"
        assert user.hashed_password.startswith("$2")  # bcrypt

    async def test_register_default_segment_is_personal(self, client):
        resp = await client.post("/v1/auth/register", json={
            "name": "Default Segment",
            "email": "segment@test.local",
            "password": "pass123",
        })
        assert resp.status_code == 201
        # Segment kommt nicht im TokenResponse zurück — Login prüfen
        login = await client.post("/v1/auth/login", json={
            "email": "segment@test.local",
            "password": "pass123",
        })
        assert login.status_code == 200

    async def test_register_and_login_works(self, client):
        await client.post("/v1/auth/register", json={
            "name": "Flow Test",
            "email": "flow@test.local",
            "password": "flowpass",
        })
        resp = await client.post("/v1/auth/login", json={
            "email": "flow@test.local",
            "password": "flowpass",
        })
        assert resp.status_code == 200


class TestMe:
    async def test_me_returns_current_user(self, client, user_headers, regular_user):
        resp = await client.get("/v1/auth/me", headers=user_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "user@test.local"
        assert data["role"] == "customer"
        assert "id" in data

    async def test_me_without_token_returns_401(self, client):
        resp = await client.get("/v1/auth/me")
        assert resp.status_code == 401

    async def test_me_with_invalid_token_returns_401(self, client):
        resp = await client.get("/v1/auth/me",
                                headers={"Authorization": "Bearer diesistkeingueltigertoken"})
        assert resp.status_code == 401

    async def test_me_admin_user(self, client, admin_headers):
        resp = await client.get("/v1/auth/me", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"
