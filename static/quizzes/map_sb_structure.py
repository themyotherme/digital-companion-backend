from playwright.sync_api import sync_playwright
import json
import time

def get_sb_structure():
    """Map out the structure of Srimad Bhagavatam"""
    structure = {}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Start with Canto 1
        canto = 1
        while True:
            print(f"\nChecking Canto {canto}")
            structure[canto] = {}
            
            # Check chapters in this canto
            chapter = 1
            while True:
                url = f"https://vedabase.io/en/library/sb/{canto}/{chapter}/1/"
                print(f"Checking {url}")
                
                page.goto(url)
                page.wait_for_timeout(2000)
                
                # Check if page shows "Not Found"
                not_found = page.query_selector("text=Not Found!")
                if not_found:
                    print(f"Chapter {chapter} not found - end of canto")
                    break
                
                # Count verses in this chapter
                verse = 1
                while True:
                    verse_url = f"https://vedabase.io/en/library/sb/{canto}/{chapter}/{verse}/"
                    page.goto(verse_url)
                    page.wait_for_timeout(1000)
                    
                    not_found = page.query_selector("text=Not Found!")
                    if not_found:
                        break
                    verse += 1
                
                structure[canto][chapter] = verse - 1
                print(f"Canto {canto}, Chapter {chapter}: {verse-1} verses")
                chapter += 1
                time.sleep(1)  # Small delay between chapters
            
            if chapter == 1:  # No chapters found in this canto
                break
                
            canto += 1
            time.sleep(2)  # Small delay between cantos
        
        browser.close()
    
    # Save structure to file
    with open("sb_structure.json", "w", encoding="utf-8") as f:
        json.dump(structure, f, ensure_ascii=False, indent=2)
    
    return structure

# Run the structure mapping
print("Mapping Srimad Bhagavatam structure...")
structure = get_sb_structure()
print("\nStructure saved to sb_structure.json")

# Print summary
print("\nSummary of Srimad Bhagavatam structure:")
for canto, chapters in structure.items():
    total_verses = sum(chapters.values())
    print(f"Canto {canto}: {len(chapters)} chapters, {total_verses} verses")