# Interactive Quiz App

## Objectives
- Provide a modern, mobile-friendly quiz experience for self-study, practice, or fun.
- Support multiple quiz files, question types (MCQ, True/False, Fill-in), and categories.
- Allow users to add, delete, and select quizzes, and to resume incomplete quizzes.
- Show results, analytics, and allow export/print of results.

## How to Use
1. **Start the App:**
   - Open `welcome.html` in your browser (or go to `http://localhost:8001/static/welcome.html` if running a local server).
2. **Select/Add Quizzes:**
   - Choose from the list, or add your own quiz files (JSON format).
   - Delete quizzes you no longer want.
3. **Start a Quiz:**
   - Select one or more quizzes and click "Start Quiz".
   - The quiz will begin immediately, showing one question at a time.
4. **Answer Questions:**
   - Use Next/Previous to navigate. Pause or Stop as needed.
   - Click "Save & Quit" to save your progress and resume later.
5. **View Results:**
   - After the last question, see your score, analytics, and review answers.
   - Export or print your results if desired.
6. **Resume Incomplete Quiz:**
   - If you saved and quit, the app will prompt you to resume or start a new quiz on your next visit.

## Running on iPhone
- The app is fully mobile-friendly and works in Safari or Chrome on iPhone.
- **Recommended:**
  1. Start a local server on your computer (e.g., `python -m http.server 8001`).
  2. Find your computer's local IP address (e.g., `192.168.1.10`).
  3. On your iPhone, open Safari and go to `http://192.168.1.10:8001/static/welcome.html` (replace with your actual IP).
  4. You can "Add to Home Screen" for a native app-like experience.

## Remote Access (for others to use)
- **Option 1: Local Network**
  - Share your computer's local IP and port as above. Anyone on your WiFi can access the app.
- **Option 2: Public Access**
  - Use a tunneling service like [ngrok](https://ngrok.com/) to expose your local server to the internet:
    - Run: `ngrok http 8001`
    - Share the generated ngrok URL (e.g., `https://xxxx.ngrok.io/static/welcome.html`)
  - For production, deploy the `static` folder to any static web host (GitHub Pages, Netlify, Vercel, etc.).

## Help & Support
- For help, click the **Help** button in the app (top right corner) or read this README.
- Quiz files must be in JSON format. See `test_quiz.json` for an example.
- If you encounter issues, refresh the page or clear your browser's localStorage.

---
Enjoy your interactive quiz experience! 