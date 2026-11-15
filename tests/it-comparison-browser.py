"""Run from the repository root with Python Playwright and Chromium installed."""

import json
import os
import shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BASE = {"market": "IT", "contract_comparison": "available", "cost_scope": "electricity_sales_only"}
FIXED = {
    "provider": "Fornitore test A",
    "name": "Offerta test fissa",
    "contract_type": "fixed",
    "annual_supply_cost_eur": 420.25,
    "conditions_to_disclose": [{"code": "security_deposit"}],
}
INDEXED = {
    "provider": "Fornitore test B",
    "name": "Offerta test indicizzata",
    "contract_type": "pun_indexed",
    "annual_supply_cost_eur": {"min": 360, "max": 510},
}
PAIR = {"best_fixed": FIXED, "best_indexed": INDEXED}
COVERAGE = {
    "scope": "household_offers_in_snapshot",
    "household_offers": 40,
    "compared_offers": 2,
    "not_compared_by_reason": {"regional_only": 38},
}
CASES = [
    ("recommended", {"recommended": FIXED}, "Offerta consigliata tra", 1),
    ("depends_on_pun", {**PAIR, "break_even_pun_eur_mwh": 102.5}, "dipende dal PUN", 2),
    ("cost_tie", {"tied_offers": [FIXED, INDEXED], "recommended": FIXED}, "costi simili", 2),
    ("partial_coverage", {
        **PAIR, "recommended": FIXED, "coverage": COVERAGE,
        "partial_reasons": ["regional_offers_not_compared"],
    }, "copertura è parziale", 2),
    ("insufficient_data", {"recommended": FIXED, "coverage": COVERAGE}, "confronto attendibile", 0),
    ("no_eligible_offers", {"recommended": FIXED}, "Non risultano offerte idonee", 0),
    ("not_available", {"contract_comparison": "not_available"}, "non è ancora disponibile", 0),
    ("temporarily_unavailable", {"contract_comparison": "temporarily_unavailable"}, "Riprova più tardi", 0),
    ("http_error", {}, "Riprova più tardi", 0),
]


class StaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def run(browser, origin, width, height):
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    errors = []
    requests = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    response = {}
    response_status = 200

    def intercept(route):
        url = urlsplit(route.request.url)
        if not route.request.url.startswith(origin + "/"):
            route.abort()
        elif url.path == "/signal/contract":
            requests.append((route.request.method, parse_qs(url.query)))
            route.fulfill(status=response_status, content_type="application/json", body=json.dumps(response))
        else:
            route.continue_()

    page.route("**/*", intercept)
    page.goto(origin + "/it/")
    page.locator(".hero-ctas a[href='/it/confronto/']").click()
    expect(page.get_by_role("heading", name="Confronta le offerte luce in Italia")).to_be_visible()
    expect(page.get_by_role("link", name="Portale Offerte")).to_be_visible()
    expect(page.locator(".source")).to_contain_text("responsabili dei dati delle proprie offerte")
    expect(page.locator("img")).to_have_count(0)
    field = page.get_by_label("Consumo annuo (kWh)")
    submit = page.get_by_role("button", name="Confronta offerte")
    field.fill("200001")
    submit.click()
    assert not field.evaluate("(input) => input.checkValidity()")
    assert not requests
    field.fill("2700")

    for state, fields, message, cards in CASES:
        response = {**BASE, "comparison_state": state, **fields}
        response_status = 503 if state == "http_error" else 200
        submit.click()
        expect(page.get_by_role("status")).to_contain_text(message)
        expect(page.locator(".offer")).to_have_count(cards)
        expect(page.get_by_role("heading", name="Offerta consigliata", exact=True)).to_have_count(
            int(state == "recommended")
        )
        expect(page.get_by_text("PUN di pareggio:", exact=False)).to_have_count(
            int(state == "depends_on_pun")
        )
        if state == "depends_on_pun":
            expect(page.get_by_text("102,5 €/MWh", exact=False)).to_be_visible()
            expect(page.get_by_text("360,00", exact=False)).to_be_visible()
            expect(page.get_by_text("510,00", exact=False)).to_be_visible()
        if state == "recommended":
            expect(page.get_by_text("420,25", exact=False)).to_be_visible()
            expect(page.get_by_text("deposito cauzionale", exact=False)).to_be_visible()
        if state == "partial_coverage":
            page.get_by_text("2 di 40 offerte domestiche", exact=False).click()
            expect(page.get_by_text("Disponibilità limitata per area: 38")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth === window.innerWidth"), state

    assert requests == [("GET", {"zone": ["IT"], "consumption": ["2700"]})] * len(CASES)
    page.get_by_role("link", name="Metodologia (EN)").click()
    expect(page.locator("#italy")).to_contain_text("ENTSO-E A44")
    expect(page.locator("#italy")).to_contain_text("takes precedence over the estimate")
    assert not errors, errors
    context.close()


def main():
    handler = partial(StaticHandler, directory=ROOT)
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    executable_path=os.getenv("CHROMIUM_PATH") or shutil.which("chromium")
                )
                for width, height in ((320, 740), (1440, 900)):
                    run(browser, f"http://127.0.0.1:{server.server_port}", width, height)
                    print(f"Italian comparison verified at {width}×{height}")
                browser.close()
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
