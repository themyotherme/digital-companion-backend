from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://vedabase.io/en/library/sb/1/1/1/")
    page.wait_for_timeout(5000)  # Wait 5 seconds for all JS to load
    html = page.content()
    print(html[:2000])  # Print the first 2000 characters for inspection
    browser.close()