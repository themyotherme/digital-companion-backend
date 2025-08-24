from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

# Set up headless Chrome
options = Options()
options.headless = True
driver = webdriver.Chrome(options=options)

verse_url = "https://vedabase.io/en/library/sb/1/1/1/"
driver.get(verse_url)
time.sleep(2)  # Wait for JS to load

# Extract translation
try:
    translation = driver.find_element("css selector", ".translation").text
except Exception:
    translation = ""

print("Translation:", translation)
driver.quit()