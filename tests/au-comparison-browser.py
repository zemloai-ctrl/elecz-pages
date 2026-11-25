"""Fixture-only browser regression, following the repository's Italian harness.

PREVIEW_ORIGIN uses an existing local preview; otherwise use an isolated static
server. No Core/Contracts/public request is made. All fixture prices are marked.
"""
import json
import os
import shutil
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
FIXTURE=json.loads((ROOT/'tests/fixtures/au-responses.json').read_text())
SHARED='This comparison includes plans available across all listed distributor options for your postcode. Selecting your exact distributor may reveal additional or cheaper plans.'


def payload(postcode='2650',network=None):
    common=postcode=='2650' and network is None
    return {'contract_comparison':'available','market':'AU_NSW','currency':'AUD',
        'cost_scope':'annual_electricity_supply_including_gst','postcode':postcode,
        'annual_consumption_kwh':4500,'freshness':'fresh',
        'distributor':None if common else network or 'Ausgrid',
        'distributors':FIXTURE['groups'] if postcode=='2650' else ['Ausgrid'],
        'offers':[FIXTURE['offer']],'recommended':FIXTURE['offer'],
        **({'distributor_scope':'all_listed','comparison_scope':'common_eligible_offers','distributor_notice':FIXTURE['notice']} if common else {})}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


@contextmanager
def origin():
    existing=os.getenv('PREVIEW_ORIGIN')
    if existing:
        if urlsplit(existing).hostname not in ('localhost','127.0.0.1'):raise ValueError('Only a local preview is allowed')
        yield existing.rstrip('/');return
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    try:yield f'http://127.0.0.1:{server.server_port}'
    finally:server.shutdown();server.server_close()


def run(browser,base,width,height,screenshots):
    context=browser.new_context(viewport={'width':width,'height':height})
    page=context.new_page()
    mode=['disabled'];requests=[];errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def intercept(route):
        if not route.request.url.startswith(base+'/'):route.abort();return
        url=urlsplit(route.request.url)
        if url.path!='/signal/contract':route.continue_();return
        query=parse_qs(url.query);requests.append(query)
        current=payload(query['postcode'][0],query.get('distributor',[None])[0])
        assert query['zone']==['AU-NSW']
        if mode[0]=='http_error':route.fulfill(status=503,body='{}',content_type='application/json');return
        if mode[0]=='network_error':route.abort();return
        if mode[0]=='disabled':data={'contract_comparison':'not_available','zone':'AU-NSW'}
        elif mode[0]=='needs':data={'contract_comparison':'needs_distributor','distributors':FIXTURE['groups'],'distributor_resolution':FIXTURE['resolution']}
        elif mode[0]=='empty':data={**current,'offers':[],'recommended':None}
        elif mode[0]=='stale':data={**current,'freshness':'stale'}
        elif mode[0]=='malicious':
            item={**FIXTURE['offer'],'supplier':'<img src=x onerror=alert(1)>'}
            data={**payload(),'offers':[item],'recommended':item}
        else:data=payload(query['postcode'][0],query.get('distributor',[None])[0])
        route.fulfill(status=200,body=json.dumps(data),content_type='application/json')
    page.route('**/*',intercept)
    page.goto(base+'/au/compare/')
    expect(page.locator('#comparison-form')).to_be_visible()
    expect(page.locator('.availability')).to_contain_text('not yet publicly available')
    # Native postcode validation cannot trigger a comparison.
    page.locator('#postcode').fill('abc')
    page.locator('#consumption').fill('4500')
    page.get_by_role('button',name='Check plans').click()
    assert requests==[]
    page.locator('#postcode').fill('2650')
    page.get_by_role('button',name='Check plans').click()
    expect(page.locator('#comparison-status')).to_have_text('NSW electricity plan comparison is not yet publicly available.')
    expect(page.locator('.offer')).to_have_count(0)
    if screenshots:
        page.screenshot(path=str(screenshots/f'nsw-disabled-{width}.png'),full_page=True)
    mode[0]='available'
    page.get_by_role('button',name='Check plans').click()
    expect(page.locator('.offer')).to_have_count(1)
    expect(page.locator('.scope')).to_contain_text(SHARED)
    expect(page.locator('.offer .price')).to_contain_text('1,976.54')
    # Explicit test-only marking is screenshot harness code, never site code.
    page.evaluate("""() => { const note=document.createElement('div');note.textContent='SYNTHETIC TEST RESPONSE — NOT A LIVE OFFER';note.style.cssText='padding:12px;background:#17213b;color:white;text-align:center;font:700 14px system-ui';document.body.prepend(note); }""")
    if screenshots:page.screenshot(path=str(screenshots/f'nsw-common-{width}.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    # Confirmation details are optional; exact source choices go back unchanged.
    mode[0]='needs'
    page.get_by_role('button',name='Check plans').click()
    expect(page.locator('#comparison-status')).to_contain_text('No safe shared comparison')
    expect(page.locator('#distributor')).to_be_visible()
    expect(page.locator('#comparison-result')).to_contain_text(FIXTURE['resolution']['message'])
    mode[0]='available'
    page.locator('#distributor').select_option('Essential Energy Standard')
    page.locator('#meter-type').select_option('Type 6')
    page.get_by_role('button',name='Check plans').click()
    expect(page.locator('.offer')).to_have_count(1)
    expect(page.locator('#comparison-result')).to_contain_text('Distributor or tariff area: Essential Energy Standard')
    assert requests[-1]['distributor']==['Essential Energy Standard'] and requests[-1]['meter_type']==['Type 6']
    expect(page.locator('.scope')).to_have_count(0)
    page.locator('#postcode').fill('2000')
    page.get_by_role('button',name='Check plans').click()
    expect(page.locator('#comparison-result')).to_contain_text('Distributor or tariff area: Ausgrid')
    assert 'distributor' not in requests[-1]
    for current in ('empty','stale','http_error','network_error','disabled'):
        mode[0]=current
        page.get_by_role('button',name='Check plans').click()
        expect(page.locator('#compare-button')).to_be_enabled()
        expect(page.locator('.offer')).to_have_count(0)
    page.locator('#postcode').fill('2650');mode[0]='malicious'
    page.get_by_role('button',name='Check plans').click()
    expect(page.locator('.offer h3')).to_have_text('<img src=x onerror=alert(1)>')
    expect(page.locator('#comparison-result img')).to_have_count(0)
    assert not errors,errors
    page.goto(base+'/au/')
    expect(page.get_by_role('heading',level=1)).to_have_text('A clearer look at electricity plans')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    if screenshots:page.screenshot(path=str(screenshots/f'nsw-home-{width}.png'),full_page=True)
    context.close()
    print(f'AU browser scenarios passed at {width}x{height}; {len(requests)} mocked API calls; no live calls')


def main():
    screenshots=Path(os.environ['SCREENSHOT_DIR']) if os.getenv('SCREENSHOT_DIR') else None
    if screenshots:screenshots.mkdir(parents=True,exist_ok=True)
    with origin() as base,sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'))
        for size in ((320,740),(375,812),(1440,1000)):run(browser,base,*size,screenshots)
        browser.close()


if __name__=='__main__':main()
