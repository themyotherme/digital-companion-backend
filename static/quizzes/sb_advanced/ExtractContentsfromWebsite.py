import os
from playwright.sync_api import sync_playwright

# Number of chapters in each canto (index 0 is dummy for 1-based indexing)
chapters_per_canto = [0, 19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13]

def save_chapter(canto, chapter, content):
    dir_path = f"sb_advanced/canto{canto}"
    os.makedirs(dir_path, exist_ok=True)
    file_path = f"{dir_path}/SB_Canto{canto}_Chapter{chapter}.txt"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved Canto {canto} Chapter {chapter} to {file_path}")

def extract_all_cantos_and_chapters():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        for canto in range(1, 13):
            for chapter in range(1, chapters_per_canto[canto] + 1):
                url = f"https://vedabase.io/en/library/sb/{canto}/{chapter}/advanced-view/"
                print(f"Extracting {url}")
                page.goto(url)
                page.wait_for_timeout(2000)
                main = page.query_selector("main")
                if main:
                    content = main.inner_text()
                else:
                    content = "No main content found."
                save_chapter(canto, chapter, content)
        browser.close()

if __name__ == "__main__":
    extract_all_cantos_and_chapters()
