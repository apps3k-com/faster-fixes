"""Real local browser/database acceptance; does not simulate a Plane connection."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright

base = os.getenv("FF_E2E_URL", "http://localhost:3100")
if urlparse(base).hostname not in ("localhost", "127.0.0.1"):
    raise RuntimeError("This fixture is restricted to a local FF instance")
feedback_id = os.environ["FF_E2E_FEEDBACK_ID"]
output = Path(os.getenv("FF_E2E_OUTPUT", "/tmp/ff-plane-browser-evidence"))
output.mkdir(parents=True, exist_ok=True)
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1100})
    page.goto(f"{base}/login")
    page.wait_for_load_state("networkidle")
    if page.get_by_role("button", name="Reject all").count():
        page.get_by_role("button", name="Reject all").click()
    page.get_by_label("Email", exact=True).fill("plane-e2e@example.invalid")
    page.get_by_label("Password", exact=True).fill("Local-Plane-E2E-Only-2026")
    page.get_by_role("button", name="Sign in", exact=True).click()
    page.wait_for_url("**/account")
    checks.append("dashboard sign-in")

    page.goto(f"{base}/api/plane/feedback/{feedback_id}")
    page.wait_for_url(f"**/inbox?feedbackId={feedback_id}")
    discussion = page.get_by_role("region", name="Team discussion")
    expect(discussion).to_be_visible()
    checks.append("authorized feedback deep link selects organization and project")

    message = f"Browser acceptance {uuid4()}"
    discussion.get_by_label("New team comment").fill(message)
    discussion.get_by_role("button", name="Add comment", exact=True).click()
    row = discussion.locator("li").filter(has=page.get_by_text(message, exact=True))
    expect(row).to_be_visible()
    row.get_by_role("button", name="Edit", exact=True).click()
    edited = message + " edited"
    row.get_by_label("Edit comment").fill(edited)
    discussion.get_by_role("button", name="Save", exact=True).click()
    row = discussion.locator("li").filter(has=page.get_by_text(edited, exact=True))
    expect(row.get_by_role("button", name="Remove", exact=True)).to_be_visible()
    row.get_by_role("button", name="Remove", exact=True).click()
    expect(discussion.get_by_text(edited, exact=True)).to_have_count(0)
    expect(discussion.get_by_text("Comment removed by its author.").first).to_be_visible()
    checks.append("team discussion create, edit and tombstone")
    page.screenshot(path=str(output / "discussion.png"), full_page=True)

    page.goto(f"{base}/reviewers")
    page.wait_for_load_state("networkidle")
    row = page.get_by_role("row").filter(has=page.get_by_text("E2E Reviewer", exact=True))
    row.get_by_role("button", name="Edit reviewer email").click()
    row.locator("input[type=email]").fill("reviewer-updated@example.invalid")
    row.get_by_role("button", name="Save reviewer email").click()
    expect(row.get_by_text("reviewer-updated@example.invalid", exact=True)).to_be_visible()
    checks.append("admin-maintained reviewer email")
    page.screenshot(path=str(output / "reviewer-email.png"), full_page=True)

    page.goto(f"{base}/integrations")
    expect(page.get_by_text("Plane integration is disabled", exact=False)).to_be_visible()
    expect(page.get_by_role("link", name="Connect to Plane", exact=True)).to_have_count(0)
    checks.append("disabled provider has actionable setup state")
    page.screenshot(path=str(output / "integrations.png"), full_page=True)
    browser.close()

report = {"evidence": "real Chromium + Next.js + isolated PostgreSQL; Plane Cloud not exercised", "passed": checks}
(output / "result.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report))
