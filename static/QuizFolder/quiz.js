// Quiz configuration and state
const quizConfig = {
  difficultyLevels: ['easy', 'medium', 'hard'],
  categories: ['knowledge', 'comprehension', 'application', 'analysis'],
  pointsPerDifficulty: {
    easy: 5,
    medium: 10,
    hard: 15
  },
  questionsPerQuiz: 10,
  timeLimit: 600, // 10 minutes in seconds
  passingScore: 70 // percentage
};

let quizState = {
  currentQuestion: 0,
  score: 0,
  categoryScores: {},
  difficultyScores: {},
  timeRemaining: quizConfig.timeLimit,
  userAnswers: [],
  questionPool: [],
  isPaused: false,
  fullPool: [],
  usedIndices: []
};
let timerInterval = null;

// Track quiz timing
let quizStartTime = null;
let quizEndTime = null;
let totalPausedTime = 0;
let pauseStartTime = null;

// Track per-question timing
let questionStartTime = null;
let questionPausedTime = 0;
let questionPauseStart = null;

let answeredThisQuestion = false;

// Ensure endQuiz is always defined for patching
function endQuiz() {}

// Helper: Get URL parameter
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Helper: Load quiz data from file param ONLY
async function loadQuizData() {
  const file = getUrlParam('file');
  if (file) {
    // Try to fetch from /api/quiz_data/<file>
    try {
      const res = await fetch('/api/quiz_data/' + file);
      if (res.ok) {
        const data = await res.json();
        // Handle both array and object formats
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.questions)) return data.questions;
        // If object, try to flatten all values (legacy support)
        if (data && typeof data === 'object') {
          const vals = Object.values(data).flat();
          if (vals.length && typeof vals[0] === 'object' && vals[0].question) return vals;
        }
        return [];
      }
    } catch {}
  }
  // If no file param or fetch fails, show error
  return null;
}

// Initialize quiz (async)
async function initQuiz() {
  quizStartTime = Date.now();
  quizEndTime = null;
  totalPausedTime = 0;
  pauseStartTime = null;
  let loadedQuestions = await loadQuizData();
  if (!loadedQuestions || !Array.isArray(loadedQuestions) || loadedQuestions.length === 0) {
    document.getElementById('question-container').innerHTML = '<div class="error">No questions found in this quiz file. Please return to the quiz selection page and try again.</div>';
    return;
  }
  loadedQuestions = shuffleArray(loadedQuestions);
  quizState.fullPool = loadedQuestions;
  quizState.usedIndices = [];
  quizState.questionPool = [...loadedQuestions]; // Load all questions for navigation
  quizState.currentQuestion = 0;
  quizState.score = 0;
  quizState.categoryScores = {};
  quizState.difficultyScores = {};
  quizState.timeRemaining = quizConfig.timeLimit;
  quizState.userAnswers = [];
  quizState.isPaused = false;

  document.getElementById('quiz-screen').style.display = 'block';
  document.getElementById('results-container').style.display = 'none';

  showQuestion();
  startTimer();
  updateProgressBar();
  window.QuizModule = window.QuizModule || {};
  window.QuizModule.initQuiz = initQuiz;
}

// Select questions based on difficulty distribution
function selectQuestions() {
  const selected = [];
  const easyCount = Math.ceil(quizConfig.questionsPerQuiz * 0.4); // 40% easy
  const mediumCount = Math.ceil(quizConfig.questionsPerQuiz * 0.4); // 40% medium
  const hardCount = quizConfig.questionsPerQuiz - easyCount - mediumCount; // 20% hard

  // Filter questions by difficulty
  const easyQuestions = questionPool.filter(q => q.difficulty === 'easy');
  const mediumQuestions = questionPool.filter(q => q.difficulty === 'medium');
  const hardQuestions = questionPool.filter(q => q.difficulty === 'hard');

  // Randomly select questions
  selected.push(...getRandomQuestions(easyQuestions, easyCount));
  selected.push(...getRandomQuestions(mediumQuestions, mediumCount));
  selected.push(...getRandomQuestions(hardQuestions, hardCount));

  // Shuffle questions
  return shuffleArray(selected);
}

// Helper function to get random questions
function getRandomQuestions(questions, count) {
  const shuffled = shuffleArray([...questions]);
  return shuffled.slice(0, count);
}

// Helper function to shuffle array (Fisher-Yates)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Shuffle MCQ options and update correct/partial indices
function shuffleMCQOptions(question) {
  if (question.type !== 'mcq' || !Array.isArray(question.options)) return question;
  const optionObjs = question.options.map((opt, idx) => ({
    text: opt,
    origIndex: idx,
    isCorrect: idx === question.correct,
    isPartial: Array.isArray(question.partial) ? question.partial.includes(idx) : false
  }));
  shuffleArray(optionObjs);
  // Find new correct index
  const newCorrect = optionObjs.findIndex(opt => opt.isCorrect);
  // Find new partial indices
  const newPartial = optionObjs
    .map((opt, idx) => (opt.isPartial ? idx : null))
    .filter(idx => idx !== null);
  // Return new question object
  return {
    ...question,
    options: optionObjs.map(opt => opt.text),
    correct: newCorrect,
    partial: newPartial.length ? newPartial : undefined
  };
}

// Display current question
function showQuestion() {
  // Clear feedback from previous question
  const feedbackDiv = document.getElementById('feedback-container');
  if (feedbackDiv) feedbackDiv.innerHTML = '';

  // Start timing for this question
  questionStartTime = Date.now();
  questionPausedTime = 0;
  questionPauseStart = null;

  const question = quizState.questionPool[quizState.currentQuestion];
  const questionDiv = document.getElementById('question-container');
  let html = '';
  if (!question) {
    questionDiv.innerHTML = '<div class="error">No question data available.</div>';
    return;
  }
  html += `<div class="question-header">`;
  html += `<div class="difficulty-badge ${question.difficulty || ''}">${question.difficulty || ''}</div>`;
  html += `<div class="category-badge">${question.category || ''}</div>`;
  html += `<div class="points-badge">${typeof question.points !== 'undefined' ? question.points + ' points' : 'undefined points'}</div>`;
  html += `</div>`;
  html += `<div class="question-text">${question.question || ''}</div>`;
  html += `<div class="answers-container">`;
  if (question.type === 'mcq') {
    if (!Array.isArray(question.options)) {
      html += '<div class="error">Options missing for MCQ.</div>';
    } else {
      html += question.options.map((option, index) => `
        <label class="answer-option">
          <input type="radio" name="answer" value="${index}">
          <span class="answer-text">${option}</span>
        </label>
      `).join('');
    }
  } else if (question.type === 'tf') {
    html += `
      <label class="answer-option">
        <input type="radio" name="answer" value="true">
        <span class="answer-text">True</span>
      </label>
      <label class="answer-option">
        <input type="radio" name="answer" value="false">
        <span class="answer-text">False</span>
      </label>
    `;
  } else if (question.type === 'fill') {
    html += `
      <div class="input-area">
        <div class="input-icons-left">
          <button class="icon-btn"><!-- attach icon --></button>
          <button class="icon-btn"><!-- mic icon --></button>
        </div>
        <textarea class="prompt-input" rows="1" placeholder="Enter your prompt..."></textarea>
        <div class="input-icons-right">
          <button class="icon-btn"><!-- speaker icon --></button>
          <button class="icon-btn"><!-- send icon --></button>
        </div>
      </div>
    `;
  } else {
    html += '<div class="error">Unknown question type.</div>';
  }
  html += '</div>';
  // Add hint button if hint is available
  if (question.hint) {
    html += `<button id="show-hint-btn" class="start-btn" style="background:#f39c12; color:#fff; margin-top:1em;">Show Hint</button>`;
    html += `<div id="hint-box" style="display:none; margin-top:1em; padding:0.8em; background:#fffbe6; border-left:4px solid #f1c40f; border-radius:6px; color:#7a5c00;"></div>`;
  }
  questionDiv.innerHTML = html;
  // Add event listeners
  if (question.type === 'mcq' || question.type === 'tf') {
    document.querySelectorAll('input[name="answer"]').forEach(input => {
      input.addEventListener('change', function() {
        if (!quizState.isPaused) checkAnswer();
      });
      input.disabled = !!quizState.isPaused;
    });
  } else if (question.type === 'fill') {
    const fillInput = document.querySelector('.fill-answer');
    if (fillInput) {
      fillInput.disabled = !!quizState.isPaused;
      fillInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !quizState.isPaused) checkAnswer();
      });
    }
  }
  // Add hint button logic
  if (question.hint) {
    const hintBtn = document.getElementById('show-hint-btn');
    const hintBox = document.getElementById('hint-box');
    if (hintBtn && hintBox) {
      hintBtn.onclick = function() {
        hintBox.textContent = question.hint;
        hintBox.style.display = 'block';
        hintBtn.style.display = 'none';
      };
    }
  }
  // Update nav button states
  updateNavButtons();
  // If on last question, change Next button label and action
  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) {
    if (quizState.currentQuestion === quizState.questionPool.length - 1) {
      nextBtn.textContent = 'View Results';
      nextBtn.disabled = false;
      nextBtn.onclick = endQuiz;
    } else {
      nextBtn.textContent = 'Next ▶';
      nextBtn.disabled = false;
      nextBtn.onclick = goNext;
    }
  }
  // Add a separate 'View Results' button after every 10th question, but NOT on the last question (to avoid duplicate)
  let viewResultsBtn = document.getElementById('view-results-btn');
  if (viewResultsBtn) viewResultsBtn.remove();
  const navDiv = document.getElementById('quiz-nav-buttons');
  if (navDiv) {
    const isLast = quizState.currentQuestion === quizState.questionPool.length - 1;
    const shouldShowViewResults = !isLast && ((quizState.currentQuestion + 1) % 10 === 0 && quizState.currentQuestion !== 0);
    if (shouldShowViewResults) {
      viewResultsBtn = document.createElement('button');
      viewResultsBtn.id = 'view-results-btn';
      viewResultsBtn.className = 'start-btn';
      viewResultsBtn.style = 'background:#4a90e2; margin-left:1em;';
      viewResultsBtn.textContent = 'View Results';
      viewResultsBtn.onclick = endQuiz;
      navDiv.appendChild(viewResultsBtn);
    }
  }

  updateProgressBar();
  saveQuizState();
  // Update question number
  document.getElementById('question-number').textContent = quizState.currentQuestion + 1;
  document.getElementById('total-questions').textContent = quizState.questionPool.length;
  answeredThisQuestion = false;
}

function updateNavButtons() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  if (prevBtn) prevBtn.disabled = quizState.currentQuestion === 0;
  if (nextBtn) nextBtn.disabled = quizState.currentQuestion >= quizState.questionPool.length - 1;
  if (pauseBtn) pauseBtn.textContent = quizState.isPaused ? '▶ Resume' : '⏸ Pause';
}

// Navigation button logic
function goToQuestion(index) {
  if (index < 0 || index >= quizState.questionPool.length) return;
  quizState.currentQuestion = index;
  showQuestion();
}
function goNext() {
  // If reviewing previous questions, just move forward
  if (quizState.currentQuestion < quizState.questionPool.length - 1) {
    quizState.currentQuestion++;
    showQuestion();
    return;
  }
  // If at the last question, always end the quiz
  if (quizState.currentQuestion === quizConfig.questionsPerQuiz - 1) {
    endQuiz();
    return;
  }
  // If we've reached the desired number of questions, end quiz
  if (quizState.questionPool.length >= quizConfig.questionsPerQuiz) {
    endQuiz();
    return;
  }
  // Get last answer and difficulty
  const lastIdx = quizState.questionPool.length - 1;
  const lastQ = quizState.questionPool[lastIdx];
  const lastA = quizState.userAnswers[lastIdx];
  const wasCorrect = lastA ? lastA.isCorrect : false;
  const nextIdx = getNextAdaptiveQuestionIndex(lastQ.difficulty, wasCorrect, quizState.usedIndices, quizState.fullPool);
  if (nextIdx === null) {
    endQuiz();
    return;
  }
  quizState.questionPool.push(quizState.fullPool[nextIdx]);
  quizState.usedIndices.push(nextIdx);
  quizState.currentQuestion++;
  showQuestion();
}
function goPrev() {
  if (quizState.currentQuestion > 0) {
    quizState.currentQuestion--;
    showQuestion();
  }
}
function pauseQuiz() {
  quizState.isPaused = !quizState.isPaused;
  if (quizState.isPaused) {
    if (timerInterval) clearInterval(timerInterval);
    pauseStartTime = Date.now();
    questionPauseStart = Date.now();
  } else {
    if (pauseStartTime) {
      totalPausedTime += Date.now() - pauseStartTime;
      pauseStartTime = null;
    }
    if (questionPauseStart) {
      questionPausedTime += Date.now() - questionPauseStart;
      questionPauseStart = null;
    }
    startTimer();
  }
  showQuestion();
}
function stopQuiz() {
  endQuiz();
}
// Attach nav button listeners
window.addEventListener('DOMContentLoaded', function() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  if (prevBtn) prevBtn.onclick = goPrev;
  if (nextBtn) nextBtn.onclick = goNext;
  if (pauseBtn) pauseBtn.onclick = pauseQuiz;
  if (stopBtn) stopBtn.onclick = stopQuiz;
});

// Check answer and update score
function getPointsForDifficulty(difficulty) {
  if (difficulty === 'easy') return 1;
  if (difficulty === 'medium') return 2;
  if (difficulty === 'hard') return 3;
  return 1;
}

function checkAnswer() {
  if (answeredThisQuestion) return; // Prevent double answer
  answeredThisQuestion = true;
  const question = quizState.questionPool[quizState.currentQuestion];
  let isCorrect = false;
  let userAnswer;
  let userAnswerText = '';
  let partialCredit = 0;
  if (!question) return;
  const pointsForThisQ = getPointsForDifficulty(question.difficulty);
  if (question.type === 'mcq') {
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) return;
    userAnswer = question.options[parseInt(selected.value)];
    isCorrect = userAnswer === question.correct_answer;
    userAnswerText = userAnswer;
  } else if (question.type === 'tf') {
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) return;
    userAnswer = selected.value === 'true' ? 'True' : 'False';
    isCorrect = userAnswer === question.correct_answer;
    userAnswerText = userAnswer;
  } else if (question.type === 'fill') {
    const fillInput = document.querySelector('.fill-answer');
    if (!fillInput) return;
    userAnswer = fillInput.value.trim();
    isCorrect = userAnswer.toLowerCase() === String(question.correct_answer).toLowerCase();
    userAnswerText = userAnswer;
  }
  // Update scores
  let pointsEarned = 0;
  if (isCorrect) {
    pointsEarned = pointsForThisQ;
    quizState.score += pointsEarned;
    if (question.category) quizState.categoryScores[question.category] = (quizState.categoryScores[question.category] || 0) + pointsEarned;
    if (question.difficulty) quizState.difficultyScores[question.difficulty] = (quizState.difficultyScores[question.difficulty] || 0) + pointsEarned;
  } else {
    pointsEarned = Math.floor(pointsForThisQ * 0.5); // Deduct 50% for wrong answer
    quizState.score += pointsEarned;
    if (question.category) quizState.categoryScores[question.category] = (quizState.categoryScores[question.category] || 0) + pointsEarned;
    if (question.difficulty) quizState.difficultyScores[question.difficulty] = (quizState.difficultyScores[question.difficulty] || 0) + pointsEarned;
  }
  // Per-question timing
  let questionEndTime = Date.now();
  let questionTimeSpent = Math.floor((questionEndTime - questionStartTime - questionPausedTime) / 1000);
  // Store user answer
  quizState.userAnswers[quizState.currentQuestion] = {
    question: question.question,
    questionType: question.type,
    options: question.options,
    userAnswer: userAnswerText,
    correctAnswer: question.correct_answer,
    isCorrect: isCorrect,
    points: pointsEarned,
    partial: false,
    timeSpent: questionTimeSpent,
    explanation: (isCorrect && question.feedback && question.feedback.correct) ||
                 (!isCorrect && question.feedback && question.feedback.incorrect) || '',
    detailed: question.feedback && question.feedback.detailed
  };
  // Show feedback
  showFeedback(isCorrect, question.feedback);
  // Do not auto-advance; user must click Next

  saveQuizState();
}

// Show feedback for answer
function showFeedback(isCorrect, feedback) {
  const feedbackDiv = document.getElementById('feedback-container');
  let msg = '';
  if (feedback && typeof feedback === 'object') {
    msg = isCorrect ? (feedback.correct || 'Correct!') : (feedback.incorrect || 'Incorrect.');
  } else {
    msg = isCorrect ? 'Correct!' : 'Incorrect.';
  }
  feedbackDiv.innerHTML = `
    <div class="feedback ${isCorrect ? 'correct' : 'incorrect'}">
      ${msg}
    </div>
  `;
}

// Start timer
function startTimer() {
  const timerDiv = document.getElementById('timer');
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    quizState.timeRemaining--;
    const minutes = Math.floor(quizState.timeRemaining / 60);
    const seconds = quizState.timeRemaining % 60;
    timerDiv.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    saveQuizState();
    if (quizState.timeRemaining <= 0) {
      clearInterval(timerInterval);
      endQuiz();
    }
  }, 1000);
}

// End quiz and show results
const origEndQuiz = endQuiz;
endQuiz = function() {
  clearQuizState();
  quizEndTime = Date.now();
  if (pauseStartTime) {
    totalPausedTime += Date.now() - pauseStartTime;
    pauseStartTime = null;
  }
  // Mark quiz as finished
  quizState.finished = true;
  saveQuizState();
  const totalPoints = quizState.questionPool.reduce((sum, q) => sum + getPointsForDifficulty(q.difficulty), 0);
  const percentage = (quizState.score / (totalPoints || 1)) * 100;
  const passed = percentage >= quizConfig.passingScore;
  const resultsDiv = document.getElementById('results-container');
  // Calculate active time (exclude paused time)
  let timeSpentMs = (quizEndTime - quizStartTime - totalPausedTime);
  let timeSpentSec = Math.floor(timeSpentMs / 1000);
  let minutes = Math.floor(timeSpentSec / 60);
  let seconds = timeSpentSec % 60;
  let timeSpentStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  // Styles for scrollable sections and fixed header/footer
  const resultsStyle = `
    display: flex; flex-direction: column; height: 80vh; max-height: 90vh;
    background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    position: relative;
  `;
  const headerStyle = `
    position: sticky; top: 0; background: #fff; z-index: 2; padding-bottom: 0.5em; border-bottom: 1px solid #eee;
  `;
  const twoColWrapStyle = `
    display: flex; flex-direction: row; gap: 1em; width: 100%; flex: 0 0 22%; min-height: 0; margin-bottom: 0.5em;
  `;
  const sectionStyleCat = `
    flex: 1 1 0; min-width: 0; max-height: 20vh; overflow-y: auto; padding-right: 0.5em; background: #fff;
  `;
  const sectionStyleDiff = `
    flex: 1 1 0; min-width: 0; max-height: 20vh; overflow-y: auto; padding-right: 0.5em; background: #fff;
  `;
  const reviewStyle = `
    flex: 1 1 56%; min-height: 0; max-height: 56vh; overflow-y: auto; margin-bottom: 1em; padding-right: 1em; width: 100%;
  `;
  const footerStyle = `
    position: sticky; bottom: 0; background: #fff; z-index: 2; padding-top: 0.5em; border-top: 1px solid #eee; display: flex; justify-content: center;
  `;
  resultsDiv.innerHTML = `
    <div style="${resultsStyle}">
      <div class="results-header" style="${headerStyle}">
        <h2 style="margin-bottom:0.5em;">Quiz Results</h2>
        <div style="display:flex; align-items:center; gap:2em; justify-content:center; flex-wrap:wrap;">
          <div class="final-score ${passed ? 'passed' : 'failed'}" style="margin-bottom:0;">Score: ${quizState.score}/${totalPoints} (${percentage.toFixed(1)}%)</div>
          <div style="font-size: 1.1em;">Time taken: <b>${timeSpentStr}</b></div>
          <button id="export-csv-btn" class="start-btn" style="background:#27ae60; color:#fff; font-size:0.95em; padding:0.5em 1em;">Export CSV</button>
          <button id="print-btn" class="start-btn" style="background:#2980b9; color:#fff; font-size:0.95em; padding:0.5em 1em;">Print / PDF</button>
        </div>
      </div>
      <div style="${twoColWrapStyle}">
        <div class="category-scores" style="${sectionStyleCat}">
          <h3>Category Scores</h3>
          ${Object.entries(quizState.categoryScores).map(([category, score]) => {
            const textColor = CATEGORY_TEXT_COLORS[category] || CATEGORY_TEXT_COLORS['Default'];
            return `
              <div class="score-item">
                <span class="category" style="color:${textColor};font-weight:bold;">${category}</span>
                <span class="score">${score} points</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="difficulty-scores" style="${sectionStyleDiff}">
          <h3>Difficulty Scores</h3>
          ${Object.entries(quizState.difficultyScores).map(([difficulty, score]) => {
            const diffColor = DIFFICULTY_COLORS[difficulty] || '#888';
            return `
              <div class="score-item">
                <span class="difficulty" style="color:${diffColor};font-weight:bold;">${difficulty}</span>
                <span class="score">${score} points</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="question-review" style="${reviewStyle}">
        <h3>Question Review</h3>
        ${quizState.questionPool.map((q, index) => {
          const answer = quizState.userAnswers[index] || {};
          const isCorrect = answer.isCorrect;
          const isPartial = answer.partial;
          let feedbackMsg = '';
          let feedbackClass = '';
          if (isCorrect) {
            let msg = (q.feedback && q.feedback.correct) || '';
            let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
            feedbackMsg = (msgNorm.startsWith('correct')) ? msg : ('Correct! ' + msg);
            feedbackClass = 'correct';
          } else if (isPartial) {
            let msg = (q.feedback && q.feedback.partial) || '';
            let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
            feedbackMsg = (msgNorm.startsWith('partialcredit')) ? msg : ('Partial credit: ' + msg);
            feedbackClass = 'partial';
          } else {
            let msg = (q.feedback && q.feedback.incorrect) || '';
            let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
            feedbackMsg = (msgNorm.startsWith('incorrect')) ? msg : ('Incorrect! ' + msg);
            feedbackClass = 'incorrect';
          }
          // Category color
          const cat = q.category || 'Default';
          const bgColor = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Default'];
          const textColor = CATEGORY_TEXT_COLORS[cat] || CATEGORY_TEXT_COLORS['Default'];
          const diffColor = DIFFICULTY_COLORS[q.difficulty] || '#888';
          return `
            <div class="review-item ${feedbackClass}" style="background:${bgColor};color:${textColor};border-left:6px solid ${diffColor};margin-bottom:1.5em;">
              <div style="display:flex;align-items:center;gap:1em;margin-bottom:0.5em;">
                <span class="category-badge" style="background:${bgColor};color:${textColor};font-weight:bold;padding:0.3em 1em;border-radius:16px;">${cat}</span>
                <span class="difficulty-badge" style="background:${diffColor};color:#fff;font-weight:bold;padding:0.3em 1em;border-radius:16px;">${q.difficulty || ''}</span>
              </div>
              <div class="question" style="font-weight:bold;font-size:1.1em;">${index + 1}. ${q.question}</div>
              <div class="answer">Your answer: ${answer.userAnswer !== undefined ? answer.userAnswer : '<i>No answer</i>'}</div>
              <div class="correct-answer">Correct answer: ${q.correct_answer}</div>
              <div class="points">Points: ${answer.points !== undefined ? answer.points : 0}${isPartial ? ' (partial credit)' : ''}</div>
              <div class="time-spent">Time spent: ${answer.timeSpent !== undefined ? answer.timeSpent + 's' : '-'}</div>
              <div class="explanation">${feedbackMsg}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="${footerStyle}">
        <button onclick="window.location.reload()" class="restart-btn">Restart Quiz</button>
      </div>
    </div>
  `;
  document.getElementById('quiz-screen').style.display = 'none';
  resultsDiv.style.display = 'block';
  // Attach export/print button listeners
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) exportBtn.onclick = exportResultsAsCSV;
  const printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.onclick = printResults;
  // Render analytics and feedback
  renderAnalytics();
  renderFeedbackInputs();
  const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
  if (submitFeedbackBtn) submitFeedbackBtn.onclick = handleFeedbackSubmit;
};

// --- Progress Bar ---
function updateProgressBar() {
  const fill = document.getElementById('progress-bar-fill');
  if (!fill) return;
  const percent = ((quizState.currentQuestion) / quizState.questionPool.length) * 100;
  fill.style.width = percent + '%';
}

// --- Save & Resume ---
function saveQuizState() {
  localStorage.setItem('quizState', JSON.stringify(quizState));
}
function loadQuizState() {
  const saved = localStorage.getItem('quizState');
  if (!saved) return null;
  return JSON.parse(saved);
}
function clearQuizState() {
  localStorage.removeItem('quizState');
}

function showResumeButtonIfNeeded() {
  const saved = loadQuizState();
  const btn = document.getElementById('resume-btn');
  if (saved && btn) btn.style.display = 'inline-block';
  else if (btn) btn.style.display = 'none';
}

// --- Save & Quit Button ---
document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('save-quit-btn');
  if (btn) {
    btn.onclick = function() {
      saveQuizState();
      alert('Quiz progress saved! You can resume later.');
      document.getElementById('quiz-screen').style.display = 'none';
      document.getElementById('start-screen').style.display = 'block';
      showResumeButtonIfNeeded();
    };
  }
  showResumeButtonIfNeeded();
});

// --- Resume Quiz ---
function resumeQuiz() {
  const saved = loadQuizState();
  if (!saved) return;
  quizState = saved;
  showQuestion();
  startTimer();
  updateProgressBar();
}

// Export functions for use in HTML
window.QuizModule = {
  initQuiz,
  showQuestion,
  checkAnswer,
  endQuiz,
  resumeQuiz
};

// Add responsive CSS for review section and fixed footer
const style = document.createElement('style');
style.innerHTML = `
@media (max-width: 900px) {
  .category-scores, .difficulty-scores { max-height: 80px !important; }
  .question-review { max-height: 120px !important; font-size: 0.95em; }
  .review-item { padding: 0.7em !important; }
  .score-item { font-size: 0.95em; }
  .results-header { font-size: 1em !important; }
  .two-col-wrap { flex-direction: column !important; gap: 0.5em !important; }
}
.review-item.partial { background: #fffbe6; border-left: 4px solid #f1c40f; }
.results-header { top: 0; left: 0; right: 0; }
.restart-btn { width: 100%; max-width: 300px; margin: 0.5em auto; }
`;
document.head.appendChild(style);

// Helper: Export results as CSV
function exportResultsAsCSV() {
  const headers = ['Question', 'Your Answer', 'Correct Answer', 'Points', 'Time Spent (s)'];
  const rows = quizState.questionPool.map((q, i) => {
    const a = quizState.userAnswers[i] || {};
    // Escape double quotes and line breaks for CSV
    function csvEscape(val) {
      if (val === undefined || val === null) return '';
      let s = String(val).replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
      return '"' + s + '"';
    }
    return [
      csvEscape(q.question || ''),
      csvEscape(a.userAnswer !== undefined ? a.userAnswer : ''),
      csvEscape(q.correct_answer),
      a.points !== undefined ? a.points : 0,
      a.timeSpent !== undefined ? a.timeSpent : ''
    ].join(',');
  });
  // Add UTF-8 BOM for Excel compatibility
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quiz-results-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper: Print results (print-friendly)
function printResults() {
  // Generate a clean printable report
  const win = window.open('', '_blank');
  const doc = win.document;
  const style = `
    <style>
      body { font-family: Arial, sans-serif; margin: 2em; background: #fff; color: #222; }
      h2 { text-align: center; }
      .score { font-size: 1.3em; font-weight: bold; margin: 1em 0; text-align: center; }
      .section { margin-bottom: 2em; }
      .review-item { border-radius: 8px; margin-bottom: 1.5em; padding: 1em; border: 1px solid #eee; }
      .review-item.correct { background: #e8f5e9; }
      .review-item.partial { background: #fffbe6; }
      .review-item.incorrect { background: #ffebee; }
      .question { font-weight: bold; margin-bottom: 0.5em; }
      .answer, .correct-answer, .points, .time-spent, .explanation { margin-bottom: 0.3em; }
      .category-scores, .difficulty-scores { margin-bottom: 1em; }
      .score-item { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 0.3em 0; }
    </style>
  `;
  const totalPoints = quizState.questionPool.reduce((sum, q) => sum + getPointsForDifficulty(q.difficulty), 0);
  const percentage = (quizState.score / (totalPoints || 1)) * 100;
  const passed = percentage >= quizConfig.passingScore;
  const now = new Date();
  doc.write(`
    <html><head><title>Quiz Results</title>${style}</head><body>
    <h2>Quiz Results</h2>
    <div class="score ${passed ? 'passed' : 'failed'}">Score: ${quizState.score}/${totalPoints} (${percentage.toFixed(1)}%)</div>
    <div style="text-align:center; margin-bottom:1em;">Date: ${now.toLocaleString()}</div>
    <div class="section category-scores">
      <h3>Category Scores</h3>
      ${(Object.entries(quizState.categoryScores).map(([category, score]) => `
        <div class="score-item"><span>${category}</span><span>${score} points</span></div>
      `).join('')) || '<div>No category scores.</div>'}
    </div>
    <div class="section difficulty-scores">
      <h3>Difficulty Scores</h3>
      ${(Object.entries(quizState.difficultyScores).map(([difficulty, score]) => `
        <div class="score-item"><span>${difficulty}</span><span>${score} points</span></div>
      `).join('')) || '<div>No difficulty scores.</div>'}
    </div>
    <div class="section">
      <h3>Question Review</h3>
      ${quizState.questionPool.map((q, index) => {
        const answer = quizState.userAnswers[index] || {};
        const isCorrect = answer.isCorrect;
        const isPartial = answer.partial;
        let feedbackMsg = '';
        let feedbackClass = '';
        if (isCorrect) {
          let msg = (q.feedback && q.feedback.correct) || '';
          let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
          feedbackMsg = (msgNorm.startsWith('correct')) ? msg : ('Correct! ' + msg);
          feedbackClass = 'correct';
        } else if (isPartial) {
          let msg = (q.feedback && q.feedback.partial) || '';
          let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
          feedbackMsg = (msgNorm.startsWith('partialcredit')) ? msg : ('Partial credit: ' + msg);
          feedbackClass = 'partial';
        } else {
          let msg = (q.feedback && q.feedback.incorrect) || '';
          let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
          feedbackMsg = (msgNorm.startsWith('incorrect')) ? msg : ('Incorrect! ' + msg);
          feedbackClass = 'incorrect';
        }
        return `
          <div class="review-item ${feedbackClass}">
            <div class="question">${index + 1}. ${q.question}</div>
            <div class="answer">Your answer: ${answer.userAnswer !== undefined ? answer.userAnswer : '<i>No answer</i>'}</div>
            <div class="correct-answer">Correct answer: ${q.correct_answer}</div>
            <div class="points">Points: ${answer.points !== undefined ? answer.points : 0}${isPartial ? ' (partial credit)' : ''}</div>
            <div class="time-spent">Time spent: ${answer.timeSpent !== undefined ? answer.timeSpent + 's' : '-'}</div>
            <div class="explanation">${feedbackMsg}</div>
          </div>
        `;
      }).join('')}
    </div>
    </body></html>
  `);
  doc.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// Render analytics charts using Chart.js
function renderAnalytics() {
  const analyticsSection = document.getElementById('analytics-section');
  if (!analyticsSection) return;
  analyticsSection.style.display = 'block';
  const ctx = document.getElementById('analytics-chart').getContext('2d');
  // Prepare data for category and difficulty
  const catLabels = Object.keys(quizState.categoryScores);
  const catData = Object.values(quizState.categoryScores);
  const diffLabels = Object.keys(quizState.difficultyScores);
  const diffData = Object.values(quizState.difficultyScores);
  // Destroy previous chart if exists
  if (window.analyticsChart) window.analyticsChart.destroy();
  window.analyticsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: catLabels.concat(diffLabels),
      datasets: [
        {
          label: 'Category Scores',
          data: catData.concat(new Array(diffLabels.length).fill(null)),
          backgroundColor: 'rgba(52, 152, 219, 0.7)'
        },
        {
          label: 'Difficulty Scores',
          data: new Array(catLabels.length).fill(null).concat(diffData),
          backgroundColor: 'rgba(46, 204, 113, 0.7)'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'Performance by Category & Difficulty' }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// Render per-question feedback inputs
function renderFeedbackInputs() {
  const feedbackSection = document.getElementById('feedback-section');
  const feedbackList = document.getElementById('feedback-list');
  if (!feedbackSection || !feedbackList) return;
  feedbackSection.style.display = 'block';
  feedbackList.innerHTML = quizState.questionPool.map((q, i) => `
    <div class="feedback-item" style="margin-bottom:1em;">
      <div style="font-weight:500;">Q${i + 1}: ${q.question}</div>
      <label>Rating:
        <select id="feedback-rating-${i}">
          <option value="">--</option>
          <option value="1">1 (Poor)</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5 (Excellent)</option>
        </select>
      </label>
      <label style="margin-left:1em;">Comment:
        <input type="text" id="feedback-comment-${i}" style="width:250px;" maxlength="200">
      </label>
    </div>
  `).join('');
}

// Handle feedback submission
function handleFeedbackSubmit() {
  const feedback = quizState.questionPool.map((q, i) => {
    const rating = document.getElementById(`feedback-rating-${i}`)?.value || '';
    const comment = document.getElementById(`feedback-comment-${i}`)?.value || '';
    return {
      question: q.question,
      rating,
      comment
    };
  });
  // For now, just log feedback (could POST to server or save locally)
  console.log('User feedback:', feedback);
  alert('Thank you for your feedback!');
}

// --- Adaptive Difficulty ---
// Helper to get next question index based on performance
function getNextAdaptiveQuestionIndex(lastDifficulty, wasCorrect, usedIndices, pool) {
  // Difficulty order: easy < medium < hard
  const order = ['easy', 'medium', 'hard'];
  let targetIdx = order.indexOf(lastDifficulty);
  if (wasCorrect && targetIdx < order.length - 1) targetIdx++; // go harder
  if (!wasCorrect && targetIdx > 0) targetIdx--; // go easier
  const targetDiff = order[targetIdx];
  // Find unused question of target difficulty
  let candidates = pool.map((q, i) => ({q, i}))
    .filter(({q, i}) => !usedIndices.includes(i) && q.difficulty === targetDiff);
  if (candidates.length === 0) {
    // Fallback: any unused question
    candidates = pool.map((q, i) => ({q, i})).filter(({q, i}) => !usedIndices.includes(i));
  }
  if (candidates.length === 0) return null;
  // Pick randomly among candidates
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return chosen.i;
}

// Category color map
const CATEGORY_COLORS = {
  Science: '#e3f2fd', // blue
  History: '#fbeee6', // brown
  Geography: '#e8f5e9', // green
  Literature: '#f3e5f5', // purple
  Culture: '#fffde7', // yellow
  Economy: '#f9fbe7', // light green
  Music: '#fce4ec', // pink
  Sports: '#e1f5fe', // cyan
  Default: '#f5f5f5' // gray
};
const CATEGORY_TEXT_COLORS = {
  Science: '#1565c0',
  History: '#6d4c41',
  Geography: '#2e7d32',
  Literature: '#7b1fa2',
  Culture: '#bfa600',
  Economy: '#558b2f',
  Music: '#ad1457',
  Sports: '#0277bd',
  Default: '#333'
};
const DIFFICULTY_COLORS = {
  easy: '#43a047',
  medium: '#fb8c00',
  hard: '#e53935'
}; 