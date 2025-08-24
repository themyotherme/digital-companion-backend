from playwright.sync_api import sync_playwright
import json

def extract_verse(page, url):
    page.goto(url)
    page.wait_for_timeout(2000)  # Wait for JS to load

    # Extract verse number from URL
    verse_number = url.rstrip('/').split('/')[-1]

    # Extract original Sanskrit text (Devanagari)
    try:
        # The original Sanskrit text appears before the transliteration
        sanskrit = page.query_selector("div:has-text('Devanagari')").evaluate("""
            el => {
                const nextDiv = el.nextElementSibling;
                const text = nextDiv.innerText;
                // Split by newlines and take the first part (original Sanskrit)
                return text.split('\\n')[0];
            }
        """)
    except Exception:
        sanskrit = ""

    # Extract transliteration
    try:
        transliteration = page.query_selector("div:has-text('Devanagari')").evaluate("""
            el => {
                const nextDiv = el.nextElementSibling;
                const text = nextDiv.innerText;
                // Split by newlines and take the second part (transliteration)
                const parts = text.split('\\n');
                return parts.length > 1 ? parts[1] : "";
            }
        """)
    except Exception:
        transliteration = ""

    # Extract synonyms
    try:
        synonyms_heading = page.query_selector("text=Synonyms")
        synonyms = synonyms_heading.evaluate("el => el.nextElementSibling.innerText") if synonyms_heading else ""
    except Exception:
        synonyms = ""

    # Extract translation
    try:
        translation_heading = page.query_selector("text=Translation")
        translation = translation_heading.evaluate("el => el.nextElementSibling.innerText") if translation_heading else ""
    except Exception:
        translation = ""

    # If translation is missing, treat as end of chapter
    if not translation.strip():
        return None

    return {
        "verse_number": verse_number,
        "sanskrit": sanskrit,
        "transliteration": transliteration,
        "synonyms": synonyms,
        "translation": translation,
        "source_url": url
    }

def extract_chapter(canto, chapter):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        verses = []
        verse_num = 1
        while verse_num <= 2:  # Only extract first two verses
            url = f"https://vedabase.io/en/library/sb/{canto}/{chapter}/{verse_num}/"
            print(f"Extracting {url}")
            verse_data = extract_verse(page, url)
            if verse_data is None:
                break
            verses.append(verse_data)
            verse_num += 1
        browser.close()
        return verses

# Usage
canto = 1
chapter = 1
verses = extract_chapter(canto, chapter)
output = {
    "canto": canto,
    "chapter_number": chapter,
    "title": "Questions by the Sages",
    "verses": verses
}
with open("sb_canto1_chapter1.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print("Extraction complete.") 