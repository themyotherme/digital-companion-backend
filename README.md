# FantasizeMe: Your Personal AI Assistant

FantaziseMe is a privacy-first, multi-mode AI assistant for education, productivity, and personal knowledge management. It works on desktop and mobile, supports offline/local and cloud AI, and features world-class UI/UX.

## Features
- **Smart & SmartPlus Modes:** AI chat with role, mood, and context awareness (OpenAI or your own LLM)
- **Local Mode:** Private, offline Q&A and summarization on your own files (PDF/TXT/JSON)
- **Batch Document Q&A:** Upload and query multiple files at once
- **Reports:** Generate, view, and manage professional PDF summary reports
- **Mobile Access:** Use on iPhone/Android via Ngrok public URL
- **Multilingual Support:** Q&A and summaries in multiple languages
- **Session Export:** Save your Q&A and summaries
- **Modern UI:** Clean, accessible, responsive design

## Folder Structure
```
FantasizeMe/
├── backend/
│   ├── app.py
│   ├── .env (located in C:\AI\FantasizeMeUltimate\core\static\Cursor)
│   └── requirements.txt
├── static/
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   ├── reports.js
│   ├── dropdowns.js
│   ├── semantic-search.js
│   ├── local.html
│   ├── help.html
│   ├── manifest.json
│   ├── service-worker.js
│   ├── ui-config.json
│   ├── Timeline_Indian_History.pdf (optional)
│   ├── Timeline_Indian_History-knowledge.json (optional)
│   └── favicon.svg
├── run_app.bat
├── setup.bat
├── README.md
└── API_SETUP_GUIDE.md
```

## Setup Instructions

### 1. Clone or Copy the Project
- Place the folder anywhere (e.g., `C:\AI\FantasizeMe`)

### 2. Install Python Dependencies
- Open a terminal in `FantasizeMe/backend`
- Run:
  ```
  pip install -r requirements.txt
  ```

### 3. Configure API Keys
- The `.env` file is located in `C:\AI\FantasizeMeUltimate\core\static\Cursor`. Ensure it contains your OpenAI or other API keys.
- See `API_SETUP_GUIDE.md` for details

### 4. Start the Backend
- In `FantasizeMe/backend`, run:
  ```
  python app.py
  ```

### 5. Start Ngrok (for mobile access)
- In the project root, run:
  ```
  ngrok http 5000
  ```
- Use the public URL on your iPhone/Android

### 6. Open the App
- On your computer: [http://localhost:5000](http://localhost:5000)
- On your phone: Use the Ngrok URL

## Usage
- **Select Role, Mood, and Mode** at the top
- **Upload files** for Local Mode
- **Chat** in Smart/SmartPlus for AI-powered answers
- **Generate and view reports** in the Reports section
- **Export sessions** as needed

## Troubleshooting
- **405/500 errors:** Make sure backend is running and API keys are set
- **Ngrok not working:** Only one session per account; close other tunnels
- **PDF/Icons missing:** Ensure `favicon.svg` is present in `static/`
- **Mobile not connecting:** Use Ngrok public URL, ensure computer is on

## License
MIT (or your choice)

---
For advanced setup, see `API_SETUP_GUIDE.md`.