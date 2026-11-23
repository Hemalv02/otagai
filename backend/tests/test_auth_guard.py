from tests.conftest import GOOD_TOKEN

PROTECTED = ["/users/me", "/listings", "/categories", "/users/me/home"]


async def test_health_needs_no_auth(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_missing_bearer_is_401(client):
    for path in PROTECTED:
        response = await client.get(path)
        assert response.status_code == 401, path
        assert response.headers["WWW-Authenticate"] == "Bearer"
        assert "message" in response.json()


async def test_invalid_token_is_401(client):
    response = await client.get(
        "/users/me", headers={"Authorization": "Bearer not-valid"}
    )
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_non_bearer_scheme_is_401(client):
    response = await client.get("/users/me", headers={"Authorization": "Basic abc"})
    assert response.status_code == 401


async def test_valid_token_passes_auth_then_needs_db(client):
    # A valid token clears the auth layer; the profile lookup then needs the
    # database, which is not configured in tests -> 503 (not 401).
    response = await client.get(
        "/users/me", headers={"Authorization": f"Bearer {GOOD_TOKEN}"}
    )
    assert response.status_code == 503


async def test_webhook_skips_auth(client):
    # Webhooks authenticate by signature, not bearer token; with no DB the
    # handler reaches the database dependency (503), proving auth was skipped.
    response = await client.post("/webhooks/stripe", content=b"{}")
    assert response.status_code in (400, 503)
