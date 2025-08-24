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

// Load questions from JSON file in data subfolder
async function loadQuestions() {
  const response = await fetch('/api/quiz_data/questions.json');
  if (!response.ok) throw new Error('Failed to load questions.json');
  const questions = await response.json();
  return questions;
}

// Initialize quiz (async)
async function initQuiz() {
  // This function is now a no-op or can be removed
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
  // Defensive: check question pool
  if (!quizState.questionPool || !quizState.questionPool.length) {
    console.error('No questions loaded! quizState:', quizState);
    document.getElementById('question-container').innerHTML = '<div class="error">No questions loaded. Please check your quiz file or try reloading.</div>';
    return;
  }
  // Clear feedback from previous question
  const feedbackDiv = document.getElementById('feedback-container');
  if (feedbackDiv) feedbackDiv.innerHTML = '';

  // Start timing for this question
  questionStartTime = Date.now();
  questionPausedTime = 0;
  questionPauseStart = null;

  const question = quizState.questionPool[quizState.currentQuestion];
  console.log('Current question:', question);
  const questionDiv = document.getElementById('question-container');
  let html = '';
  if (!question) {
    questionDiv.innerHTML = '<div class="error">No question data available.</div>';
    return;
  }
  const infoTags = [];
  if (question.difficulty) infoTags.push(`<span class='tag difficulty-tag ${question.difficulty}' style='font-weight:bold;color:#fff;background:#4a90e2;padding:0.2em 0.7em;border-radius:6px;margin-right:0.2em;'>${question.difficulty}</span>`);
  if (question.category) infoTags.push(`<span class='tag category-tag' style='font-weight:bold;color:#fff;background:#27ae60;padding:0.2em 0.7em;border-radius:6px;margin-right:0.2em;'>${question.category}</span>`);
  if (typeof question.points !== 'undefined') infoTags.push(`<span class='tag points-tag' style='font-weight:bold;color:#fff;background:#a259e6;padding:0.2em 0.7em;border-radius:6px;margin-right:0.2em;'>${question.points} points</span>`);
  document.getElementById('info-tags-bar').innerHTML = infoTags.join('');
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
      <input type="text" class="fill-answer" placeholder="Type your answer here">
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
  // Update question number and total questions in the UI
  const qNumElem = document.getElementById('question-number');
  const totalElem = document.getElementById('total-questions');
  if (qNumElem) qNumElem.textContent = quizState.currentQuestion + 1;
  if (totalElem) totalElem.textContent = quizState.questionPool.length;
  answeredThisQuestion = false;

  // In showQuestion(), render the running counter in the quiz header
  const counterElem = document.getElementById('question-counter-bar');
  if (counterElem) {
    counterElem.innerHTML = `<span style='font-weight:bold;color:#357ab8;'>Question ${quizState.currentQuestion + 1} of ${quizState.questionPool.length}</span>`;
  }
  // Remove the old question count display from #question-count-bar
  const qCountBar = document.getElementById('question-count-bar');
  if (qCountBar) qCountBar.innerHTML = '';
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
function checkAnswer() {
  if (answeredThisQuestion) return; // Prevent double answer
  answeredThisQuestion = true;
  const question = quizState.questionPool[quizState.currentQuestion];
  let isCorrect = false;
  let userAnswer;
  let userAnswerText = '';
  let partialCredit = 0;
  if (!question) return;
  if (question.type === 'mcq') {
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) return;
    userAnswer = parseInt(selected.value);
    isCorrect = userAnswer === question.correct;
    userAnswerText = (question.options && question.options[userAnswer]) || userAnswer;
    // Partial credit: if 'partial' field is present and userAnswer is in it, award partial points
    if (!isCorrect && Array.isArray(question.partial) && question.partial.includes(userAnswer)) {
      partialCredit = Math.round((question.points || 0) * 0.5); // 50% by default
    }
  } else if (question.type === 'tf') {
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) return;
    userAnswer = selected.value === 'true';
    isCorrect = userAnswer === question.correct;
    userAnswerText = userAnswer ? 'True' : 'False';
    // No partial credit for tf
  } else if (question.type === 'fill') {
    const fillInput = document.querySelector('.fill-answer');
    if (!fillInput) return;
    userAnswer = fillInput.value.trim();
    isCorrect = userAnswer.toLowerCase() === String(question.correct).toLowerCase();
    userAnswerText = userAnswer;
    // Partial credit: if 'partial' field is present and userAnswer matches (case-insensitive)
    if (!isCorrect && Array.isArray(question.partial) && question.partial.some(p => typeof p === 'string' && p.toLowerCase() === userAnswer.toLowerCase())) {
      partialCredit = Math.round((question.points || 0) * 0.5);
    }
  }
  // Update scores
  let pointsEarned = 0;
  if (isCorrect) {
    pointsEarned = question.points || 0;
    quizState.score += pointsEarned;
    if (question.category) quizState.categoryScores[question.category] = (quizState.categoryScores[question.category] || 0) + pointsEarned;
    if (question.difficulty) quizState.difficultyScores[question.difficulty] = (quizState.difficultyScores[question.difficulty] || 0) + pointsEarned;
  } else if (partialCredit > 0) {
    pointsEarned = partialCredit;
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
    correctAnswer: question.type === 'mcq' ? (question.options && question.options[question.correct]) : question.correct,
    isCorrect: isCorrect,
    points: pointsEarned,
    partial: partialCredit > 0,
    timeSpent: questionTimeSpent,
    explanation: (isCorrect && question.feedback && question.feedback.correct) ||
                 (partialCredit > 0 && question.feedback && question.feedback.partial) ||
                 (question.feedback && question.feedback.incorrect) || '',
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
  let correctMsg = (feedback && typeof feedback.correct === 'string') ? feedback.correct : 'Correct!';
  let incorrectMsg = (feedback && typeof feedback.incorrect === 'string') ? feedback.incorrect : 'Incorrect!';
  feedbackDiv.innerHTML = `
    <div class="feedback ${isCorrect ? 'correct' : 'incorrect'}">
      ${isCorrect ? correctMsg : incorrectMsg}
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
  // Count attempted and correct answers
  let attempted = 0;
  let correct = 0;
  let partial = 0;
  (quizState.userAnswers || []).forEach(ans => {
    if (ans && ans.userAnswer !== undefined && ans.userAnswer !== '' && ans.userAnswer !== null) attempted++;
    if (ans && ans.isCorrect) correct++;
    else if (ans && ans.partial) partial++;
  });
  const total = quizState.questionPool.length;
  const percentage = (correct / (total || 1)) * 100;
  const passed = percentage >= quizConfig.passingScore;
  // Fix time calculation
  let timeSpentMs = (quizStartTime && quizEndTime) ? (quizEndTime - quizStartTime - totalPausedTime) : 0;
  let timeSpentSec = Math.max(0, Math.floor(timeSpentMs / 1000));
  let minutes = Math.floor(timeSpentSec / 60);
  let seconds = timeSpentSec % 60;
  let timeSpentStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const resultsDiv = document.getElementById('results-container');
  resultsDiv.innerHTML = `
    <div style="display: flex; flex-direction: column; background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.07); position: relative;">
      <div class="results-header" style="position: sticky; top: 0; background: #fff; z-index: 2; padding-bottom: 0.5em; border-bottom: 1px solid #eee;">
        <h2 style="margin-bottom:0.5em;">Quiz Results</h2>
        <div style="display:flex; align-items:center; gap:2em; justify-content:center; flex-wrap:wrap;">
          <div class="final-score ${passed ? 'passed' : 'failed'}" style="margin-bottom:0;">Score: ${correct}/${total} (${percentage.toFixed(1)}%)</div>
          <div style="font-size: 1.1em;">Time taken: <b>${timeSpentStr}</b></div>
          <button id="export-csv-btn" class="start-btn" style="background:#27ae60; color:#fff; font-size:0.95em; padding:0.5em 1em;">Export CSV</button>
          <button id="print-btn" class="start-btn" style="background:#2980b9; color:#fff; font-size:0.95em; padding:0.5em 1em;">Print / PDF</button>
        </div>
      </div>
      <div class="results-tabs-wrap">
        <div id="results-tab-content">
          <div class="category-scores tab-section" id="tab-section-category" style="display:none;">
            <h3>Category Scores</h3>
            ${Object.entries(quizState.categoryScores).map(([category, score]) => `
              <div class="score-item">
                <span class="category">${category}</span>
                <span class="score">${score} points</span>
              </div>
            `).join('') || '<div>No category scores.</div>'}
          </div>
          <div class="difficulty-scores tab-section" id="tab-section-difficulty" style="display:none;">
            <h3>Difficulty Scores</h3>
            ${Object.entries(quizState.difficultyScores).map(([difficulty, score]) => `
              <div class="score-item">
                <span class="difficulty">${difficulty}</span>
                <span class="score">${score} points</span>
              </div>
            `).join('') || '<div>No difficulty scores.</div>'}
          </div>
          <div class="question-review tab-section" id="tab-section-review" style="display:block;">
            <h3>Question Review</h3>
            ${quizState.questionPool.map((q, index) => {
              const answer = quizState.userAnswers[index] || {};
              const isCorrect = answer.isCorrect;
              const isPartial = answer.partial;
              let feedbackMsg = '';
              let feedbackClass = '';
              // Defensive feedback handling
              const qFeedback = q.feedback || {};
              if (isCorrect) {
                let msg = (typeof qFeedback.correct === 'string' ? qFeedback.correct : 'Correct!');
                let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
                feedbackMsg = (msgNorm.startsWith('correct')) ? msg : ('Correct! ' + msg);
                feedbackClass = 'correct';
              } else if (isPartial) {
                let msg = (typeof qFeedback.partial === 'string' ? qFeedback.partial : 'Partial credit.');
                let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
                feedbackMsg = (msgNorm.startsWith('partialcredit')) ? msg : ('Partial credit: ' + msg);
                feedbackClass = 'partial';
              } else {
                let msg = (typeof qFeedback.incorrect === 'string' ? qFeedback.incorrect : 'Incorrect!');
                let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
                feedbackMsg = (msgNorm.startsWith('incorrect')) ? msg : ('Incorrect! ' + msg);
                feedbackClass = 'incorrect';
              }
              return `
                <div class="review-item ${feedbackClass}">
                  <div class="question">${index + 1}. ${q.question}</div>
                  <div class="answer">Your answer: ${answer.userAnswer !== undefined ? answer.userAnswer : '<i>No answer</i>'}</div>
                  <div class="correct-answer">Correct answer: ${q.type === 'mcq' ? (Array.isArray(q.options) && typeof q.correct === 'number' && q.options[q.correct] !== undefined ? q.options[q.correct] : q.correct) : q.correct}</div>
                  <div class="points">Points: ${answer.points !== undefined ? answer.points : 0}${isPartial ? ' (partial credit)' : ''}</div>
                  <div class="time-spent">Time spent: ${answer.timeSpent !== undefined ? answer.timeSpent + 's' : '-'}</div>
                  <div class="explanation">${feedbackMsg}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
      <div style="position:sticky;bottom:0;background:#fff;z-index:2;padding-top:0.5em;border-top:1px solid #eee;display:flex;justify-content:center;gap:1em;">
        <button id="retake-quiz-btn" class="restart-btn">Retake Quiz</button>
        <button id="take-another-quiz-btn" class="start-btn" style="background:#4a90e2;">Take Another Quiz</button>
        <button id="quit-btn" class="start-btn" style="background:#e74c3c;">Quit</button>
      </div>
      <div id="review-modal" class="review-modal" style="display:none;position:fixed;z-index:9999;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);justify-content:center;align-items:center;">
        <div class="review-modal-content" style="background:#fff;max-width:700px;width:96vw;max-height:90vh;overflow-y:auto;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.2);padding:1.5em;position:relative;">
          <button id="close-review-modal" style="position:absolute;top:0.7em;right:1em;font-size:1.5em;background:none;border:none;color:#888;cursor:pointer;">&times;</button>
          <h3>Question Review</h3>
          ${quizState.questionPool.map((q, index) => {
            const answer = quizState.userAnswers[index] || {};
            const isCorrect = answer.isCorrect;
            const isPartial = answer.partial;
            let feedbackMsg = '';
            let feedbackClass = '';
            const qFeedback = q.feedback || {};
            if (isCorrect) {
              let msg = (typeof qFeedback.correct === 'string' ? qFeedback.correct : 'Correct!');
              let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
              feedbackMsg = (msgNorm.startsWith('correct')) ? msg : ('Correct! ' + msg);
              feedbackClass = 'correct';
            } else if (isPartial) {
              let msg = (typeof qFeedback.partial === 'string' ? qFeedback.partial : 'Partial credit.');
              let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
              feedbackMsg = (msgNorm.startsWith('partialcredit')) ? msg : ('Partial credit: ' + msg);
              feedbackClass = 'partial';
            } else {
              let msg = (typeof qFeedback.incorrect === 'string' ? qFeedback.incorrect : 'Incorrect!');
              let msgNorm = msg.trim().toLowerCase().replace(/[^a-z]/g, '');
              feedbackMsg = (msgNorm.startsWith('incorrect')) ? msg : ('Incorrect! ' + msg);
              feedbackClass = 'incorrect';
            }
            return `
              <div class="review-item ${feedbackClass}">
                <div class="question">${index + 1}. ${q.question}</div>
                <div class="answer">Your answer: ${answer.userAnswer !== undefined ? answer.userAnswer : '<i>No answer</i>'}</div>
                <div class="correct-answer">Correct answer: ${q.type === 'mcq' ? (Array.isArray(q.options) && typeof q.correct === 'number' && q.options[q.correct] !== undefined ? q.options[q.correct] : q.correct) : q.correct}</div>
                <div class="points">Points: ${answer.points !== undefined ? answer.points : 0}${isPartial ? ' (partial credit)' : ''}</div>
                <div class="time-spent">Time spent: ${answer.timeSpent !== undefined ? answer.timeSpent + 's' : '-'}</div>
                <div class="explanation">${feedbackMsg}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  document.getElementById('quiz-screen').style.display = 'none';
  resultsDiv.style.display = 'block';
  // Tab switching logic
  function showTab(tab) {
    document.getElementById('tab-section-category').style.display = (tab === 'category') ? 'block' : 'none';
    document.getElementById('tab-section-difficulty').style.display = (tab === 'difficulty') ? 'block' : 'none';
    document.getElementById('tab-section-review').style.display = (tab === 'review') ? 'block' : 'none';
    const tabCategory = document.getElementById('tab-category');
    const tabDifficulty = document.getElementById('tab-difficulty');
    const tabReview = document.getElementById('tab-review');
    if (tabCategory) tabCategory.classList.toggle('active', tab === 'category');
    if (tabDifficulty) tabDifficulty.classList.toggle('active', tab === 'difficulty');
    if (tabReview) tabReview.classList.toggle('active', tab === 'review');
  }
  // Default to review tab
  showTab('review');
  // Pop-out modal for Question Review
  const reviewSection = document.getElementById('tab-section-review');
  const reviewModal = document.getElementById('review-modal');
  const closeReviewModal = document.getElementById('close-review-modal');
  if (reviewSection && reviewModal && closeReviewModal) {
    reviewSection.style.cursor = 'pointer';
    reviewSection.title = 'Tap to expand';
    reviewSection.onclick = function(e) {
      // Only open modal if not clicking a link or button
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
        reviewModal.style.display = 'flex';
      }
    };
    closeReviewModal.onclick = function() {
      reviewModal.style.display = 'none';
    };
    // Also close modal on background click
    reviewModal.onclick = function(e) {
      if (e.target === reviewModal) reviewModal.style.display = 'none';
    };
  }
  // Attach results page navigation buttons with robust logging
  let retakeBtn = document.getElementById('retake-quiz-btn');
  let anotherBtn = document.getElementById('take-another-quiz-btn');
  let quitBtn = document.getElementById('quit-btn');
  let exportBtn2 = document.getElementById('export-csv-btn');
  let printBtn2 = document.getElementById('print-btn');

  if (!retakeBtn) console.warn('Retake Quiz button not found in DOM');
  if (!anotherBtn) console.warn('Take Another Quiz button not found in DOM');
  if (!quitBtn) console.warn('Quit button not found in DOM');
  if (!exportBtn2) console.warn('Export CSV button not found in DOM');
  if (!printBtn2) console.warn('Print button not found in DOM');

  if (retakeBtn) {
    retakeBtn.onclick = function() {
      localStorage.removeItem('quizState');
      window.location.href = 'welcome.html';
    };
    console.log('Retake Quiz button listener attached');
  }
  if (anotherBtn) {
    anotherBtn.onclick = function() {
      localStorage.removeItem('quizState');
      window.location.href = 'welcome.html';
    };
    console.log('Take Another Quiz button listener attached');
  }
  if (quitBtn) {
    quitBtn.addEventListener('click', function() {
      // Try to close the window/tab, or redirect to a goodbye page or home
      if (window.close) {
        window.close();
      } else {
        window.location.href = '/'; // Or set to a goodbye page if you have one
      }
    });
    console.log('Quit button listener attached');
  }
  if (exportBtn2) {
    exportBtn2.onclick = exportResultsAsCSV;
    console.log('Export CSV button listener attached');
  }
  if (printBtn2) {
    printBtn2.onclick = printResults;
    console.log('Print button listener attached');
  }
  console.log('Results page button attachment complete.');
  // Render analytics and feedback (these can be added as more tabs in the future)
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
      window.location.href = 'welcome.html'; // Always go to welcome page
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
      csvEscape(q.type === 'mcq' ? (q.options && q.options[q.correct]) : q.correct),
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
  const totalPoints = quizState.questionPool.reduce((sum, q) => sum + (q.points || 0), 0);
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
            <div class="correct-answer">Correct answer: ${q.type === 'mcq' ? (q.options && q.options[q.correct]) : q.correct}</div>
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

// Helper: Get URL parameter
function getUrlParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

// Helper: Fetch JSON and return with file name
async function fetchQuizJson(file) {
  const res = await fetch('/api/quiz_data/' + file);
  if (!res.ok) throw new Error('Failed to load ' + file);
  const data = await res.json();
  data.__file = file;
  return data;
}

// Helper: List available quiz files in data/
async function listQuizFiles() {
  // Try to fetch a manifest or index file first
  try {
    const res = await fetch('/api/quiz_data/quiz_index.json');
    if (res.ok) return await res.json();
  } catch {}
  // Fallback: try to list files via a static list (update as needed)
  // You may need to update this list manually if running on a static server
  return [
    'data/questions_math.json',
    'data/questions_english.json',
    'data/questions_physics.json',
    'data/questions_science.json',
    'data/questions_history.json'
  ];
}

// Helper: Format filename as fallback title
function formatFilenameTitle(file) {
  const base = file.split('/').pop().replace(/questions_|\.json/gi, '').replace(/_/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Helper to flatten questions from both array and object formats
function flattenQuestions(quizData) {
  let questions = [];
  if (Array.isArray(quizData)) questions = quizData;
  else if (typeof quizData === 'object' && quizData !== null) {
    if (Array.isArray(quizData.questions)) questions = quizData.questions;
    else questions = Object.values(quizData).flat();
  }
  // Patch: add defaults if missing, and robust MCQ/TF inference
  return questions.map((q, i) => {
    let type = q.type;
    if (!type) {
      if (Array.isArray(q.options)) type = 'mcq';
      else type = 'tf';
    }
    let correct = q.correct;
    // For MCQ: if correct is missing but answer is present, use index of answer in options
    if (type === 'mcq') {
      if (correct === undefined && q.answer !== undefined && Array.isArray(q.options)) {
        correct = q.options.findIndex(opt => opt === q.answer);
        if (correct === -1) correct = 0; // fallback to first option
      }
    } else if (type === 'tf') {
      // For TF: if correct is missing but answer is boolean, use it
      if (correct === undefined && typeof q.answer === 'boolean') {
        correct = q.answer;
      }
    }
    const patched = {
      type,
      difficulty: q.difficulty || 'easy',
      category: q.category || 'General',
      points: q.points !== undefined ? q.points : 1,
      correct: correct,
      question: q.question || `Question ${i + 1}`,
      options: q.options || (type === 'mcq' ? ['Option 1', 'Option 2', 'Option 3', 'Option 4'] : undefined),
      explanation: q.explanation || '',
      ...q
    };
    // Defensive: ensure MCQ has at least 2 options
    if (patched.type === 'mcq' && (!Array.isArray(patched.options) || patched.options.length < 2)) {
      patched.options = ['Option 1', 'Option 2'];
      patched.correct = 0;
    }
    // Defensive: ensure TF has correct boolean
    if (patched.type === 'tf' && typeof patched.correct !== 'boolean') {
      patched.correct = false;
    }
    return patched;
  });
}

// Start the quiz with a given array of questions
function startQuiz(questions) {
  // Set timing for new quiz
  quizStartTime = Date.now();
  quizEndTime = null;
  totalPausedTime = 0;
  pauseStartTime = null;
  // Filter out invalid questions
  const validQuestions = questions.filter(q => {
    if (!q || typeof q !== 'object') return false;
    if (!q.type || !q.question) return false;
    if (q.type === 'mcq' && (!Array.isArray(q.options) || q.options.length < 2 || typeof q.correct !== 'number')) return false;
    if (q.type === 'tf' && typeof q.correct !== 'boolean') return false;
    return true;
  });
  console.log('Loaded valid questions:', validQuestions.length, validQuestions);
  if (!validQuestions.length) {
    // Show a user-friendly message and a button to return to welcome
    const quizScreen = document.getElementById('quiz-screen');
    const resultsContainer = document.getElementById('results-container');
    if (quizScreen) quizScreen.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'none';
    const container = document.querySelector('.container');
    if (container) {
      container.innerHTML = `<div style='text-align:center;margin-top:3em;'>
        <div style='color:#c62828;font-size:1.3em;margin-bottom:1em;'>No valid questions found in this quiz!</div>
        <button onclick="window.location.href='welcome.html'" style='padding:1em 2em;font-size:1.1em;background:#4a90e2;color:#fff;border:none;border-radius:8px;cursor:pointer;'>Choose Another Quiz</button>
      </div>`;
    }
    return;
  }
  let loadedQuestions = shuffleArray(validQuestions);
  // On quiz start, get question count from sessionStorage
  let questionCount = 10;
  try {
    questionCount = parseInt(sessionStorage.getItem('question_count'), 10);
    if (isNaN(questionCount) || questionCount < 0) questionCount = 0;
  } catch { questionCount = 10; }
  // When selecting questions, use questionCount (or max available)
  if (questionCount > 0 && loadedQuestions.length > questionCount) {
    loadedQuestions = loadedQuestions.slice(0, questionCount);
  }
  // Render question count in #question-count-bar
  const qCountBar = document.getElementById('question-count-bar');
  if (qCountBar) {
    qCountBar.innerHTML = `<span style='font-weight:bold;color:#4a90e2;'>Questions: ${loadedQuestions.length}</span>`;
  }
  // Otherwise, use all available questions
  quizState.fullPool = loadedQuestions;
  quizState.usedIndices = [];
  quizState.questionPool = [...loadedQuestions];
  quizState.currentQuestion = 0;
  quizState.score = 0;
  quizState.categoryScores = {};
  quizState.difficultyScores = {};
  quizState.timeRemaining = quizConfig.timeLimit;
  quizState.userAnswers = [];
  quizState.isPaused = false;
  console.log('Question pool after startQuiz:', quizState.questionPool);
  showQuestion();
  startTimer();
  updateProgressBar();
  window.QuizModule = window.QuizModule || {};
  window.QuizModule.initQuiz = () => startQuiz(questions);
}

// Checkbox-based quiz selection UI only

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('quiz-selection-form');
  const quizContainer = document.getElementById('quiz-container');
  // Use quiz_index.json for quiz selection
  fetch('/api/quiz_data/quiz_index.json')
    .then(res => {
      if (!res.ok) throw new Error('Quiz list not found');
      return res.json();
    })
    .then(fileInfos => {
      const selectionForm = document.getElementById('quiz-selection-form');
      if (selectionForm) {
        selectionForm.innerHTML = '';
        fileInfos.forEach(({ file, title }) => {
          const label = document.createElement('label');
          label.innerHTML = `<input type="checkbox" name="quiz" value="${file}"> <b>${title}</b> <span style='color:gray'>(${file})</span><br>`;
          selectionForm.appendChild(label);
        });
        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.textContent = 'Start Quiz';
        selectionForm.appendChild(btn);
      }
    })
    .catch(err => {
      const selectionForm = document.getElementById('quiz-selection-form');
      if (selectionForm) {
        selectionForm.innerHTML = `<div style="color:red;">Could not load quiz list. Please check your connection or try again later.</div>`;
      }
      console.error('Error loading quiz list:', err);
    });

  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      // Get the selected file names as strings
      const selected = Array.from(document.querySelectorAll('input[name="quiz"]:checked')).map(cb => cb.value);
      if (selected.length === 0) {
        alert('Please select at least one quiz.');
        return;
      }
      // Fetch each selected quiz file using the correct path
      Promise.all(selected.map(file =>
        fetch('/api/quiz_data/' + file).then(res => res.json())
      )).then((quizzes) => {
        let allQuestions = [];
        quizzes.forEach((quiz, idx) => {
          // Flatten all questions from all sections/chapters
          const flat = flattenQuestions(quiz);
          flat.forEach(q => {
            q.subject = fileTitleFromName(selected[idx]);
            allQuestions.push(q);
          });
        });
        // Shuffle questions
        for (let i = allQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
        }
        // Hide selection form, show quiz UI
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('quiz-screen').style.display = 'block';
        document.getElementById('results-container').style.display = 'none';
        quizContainer.style.display = '';
        // Start the quiz with allQuestions
        startQuiz(allQuestions);
      });
    });
  }
});

// Helper to get a nice title from the file name
function fileTitleFromName(file) {
  if (file === 'gita_quiz.json') return 'Bhagavad Gita';
  if (file === 'yogasutra_quiz.json') return 'Patanjali Yoga Sutras';
  if (file === 'kamasutra_quiz.json') return 'Kamasutra';
  // Fallback: prettify the file name
  return file.replace('_quiz.json', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Quiz entry point
window.addEventListener('DOMContentLoaded', async function() {
  const quizContainer = document.querySelector('.container') || document.body;
  const params = new URLSearchParams(window.location.search);
  if (params.has('resume')) {
    // Resume saved quiz state
    const saved = loadQuizState();
    if (saved && saved.questionPool && saved.questionPool.length) {
      quizState = saved;
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('quiz-screen').style.display = 'block';
      document.getElementById('results-container').style.display = 'none';
      showQuestion();
      startTimer();
      updateProgressBar();
      return;
    } else {
      // No valid saved state, clear and show error
      clearQuizState();
      quizContainer.innerHTML = `<div style='color:red;text-align:center;margin-top:2em;'>No saved quiz to resume. <a href='welcome.html'>Go to Welcome Screen</a></div>`;
      return;
    }
  }
  let quizFile = getQuizFileFromUrlOrSequence();
  if (!quizFile) {
    quizContainer.innerHTML = `<div style="color:red;text-align:center;margin-top:2em;">No quiz selected. <a href="welcome.html">Go to Welcome Screen</a></div>`;
    return;
  }
  // If in sequence mode, load the quiz file from the sequence and start the quiz
  if (params.has('sequence')) {
    const seq = parseInt(params.get('sequence'), 10);
    const quizSeq = JSON.parse(sessionStorage.getItem('quiz_sequence') || '[]');
    if (quizSeq.length && seq > 0 && seq <= quizSeq.length) {
      quizFile = quizSeq[seq - 1];
      let quizData = await getQuizData(quizFile);
      if (!quizData) {
        quizContainer.innerHTML = `<div style="color:red;text-align:center;margin-top:2em;">Failed to load quiz file: ${quizFile}</div>`;
        return;
      }
      window.quizTitle = quizData.title || quizData.subject || formatFilenameTitle(quizFile);
      // Always flatten questions, whether array or object
      const questions = flattenQuestions(quizData);
      console.log('Loaded quizData (sequence):', Array.isArray(quizData) ? 'array' : typeof quizData, questions.length);
      window._quizQuestions = questions;
      window.loadQuestions = async () => window._quizQuestions;
      const titleDiv = document.createElement('div');
      titleDiv.className = 'quiz-title';
      titleDiv.style = 'font-size:1.5em;font-weight:bold;text-align:center;margin-bottom:1em;color:#4a90e2;';
      titleDiv.textContent = window.quizTitle;
      const container = document.querySelector('.container');
      if (container) container.insertBefore(titleDiv, container.firstChild);
      // Hide start screen, show quiz screen
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('quiz-screen').style.display = 'block';
      document.getElementById('results-container').style.display = 'none';
      startQuiz(questions);
      return;
    }
  }
  // Otherwise, load as single quiz file
  let quizData = await getQuizData(quizFile);
  if (!quizData) {
    quizContainer.innerHTML = `<div style="color:red;text-align:center;margin-top:2em;">Failed to load quiz file: ${quizFile}</div>`;
    return;
  }
  window.quizTitle = quizData.title || quizData.subject || formatFilenameTitle(quizFile);
  // Always flatten questions, whether array or object
  const questions = flattenQuestions(quizData);
  console.log('Loaded quizData (single):', Array.isArray(quizData) ? 'array' : typeof quizData, questions.length);
  window._quizQuestions = questions;
  window.loadQuestions = async () => window._quizQuestions;
  const titleDiv = document.createElement('div');
  titleDiv.className = 'quiz-title';
  titleDiv.style = 'font-size:1.5em;font-weight:bold;text-align:center;margin-bottom:1em;color:#4a90e2;';
  titleDiv.textContent = window.quizTitle;
  const container = document.querySelector('.container');
  if (container) container.insertBefore(titleDiv, container.firstChild);
  // Hide start screen, show quiz screen
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quiz-screen').style.display = 'block';
  document.getElementById('results-container').style.display = 'none';
  startQuiz(questions);
});

// At the top, add a helper to get quiz file from URL or sequence
function getQuizFileFromUrlOrSequence() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('file')) return params.get('file');
    if (params.has('sequence')) {
        const seq = parseInt(params.get('sequence'), 10);
        const quizSeq = JSON.parse(sessionStorage.getItem('quiz_sequence') || '[]');
        if (quizSeq.length && seq > 0 && seq <= quizSeq.length) {
            return quizSeq[seq - 1];
        }
    }
    return null;
}

// At the end of quiz, if in sequence mode, advance to next quiz
function finishQuiz() {
    // ... existing code for showing results ...
    const params = new URLSearchParams(window.location.search);
    if (params.has('sequence')) {
        const seq = parseInt(params.get('sequence'), 10);
        const quizSeq = JSON.parse(sessionStorage.getItem('quiz_sequence') || '[]');
        if (seq < quizSeq.length) {
            // Go to next quiz in sequence
            window.location.href = 'QuizFolder/quiz.html?sequence=' + (seq + 1);
        } else {
            // All done
            document.getElementById('quiz-container').innerHTML += '<div style="margin-top:2em;color:#357ab8;font-size:1.2em;">All selected quizzes completed!</div>';
        }
    }
}

// Helper to get quiz index (from localStorage or file)
async function getQuizIndex() {
    let quizIndexObj = {};
    try {
        quizIndexObj = JSON.parse(localStorage.getItem('quiz_index.json') || '{}');
    } catch { quizIndexObj = {}; }
    let quizzes = Array.isArray(quizIndexObj.quizzes) ? quizIndexObj.quizzes : [];
    if (quizzes.length) return quizzes;
    try {
        const res = await fetch('/api/quiz_data/quiz_index.json');
        quizIndexObj = await res.json();
        quizzes = Array.isArray(quizIndexObj.quizzes) ? quizIndexObj.quizzes : [];
    } catch {}
    return quizzes;
}

// Helper to get quiz data (from localStorage or file)
async function getQuizData(quizFile) {
    if (!quizFile) return null;
    // Try localStorage first
    try {
        const data = localStorage.getItem(quizFile);
        if (data) return JSON.parse(data);
    } catch {}
    // Fallback to fetch
    try {
        const res = await fetch('/api/quiz_data/' + quizFile);
        if (res.ok) return await res.json();
    } catch {}
    return null;
}

// Replace quiz file loading logic with:
const quizFile = getQuizFileFromUrlOrSequence();
let quizData = null;

async function loadQuiz() {
    if (!quizFile) {
        document.getElementById('quiz-container').innerHTML = '<div style="color:red;">No quiz selected.</div>';
        return;
    }
    quizData = await getQuizData(quizFile);
    if (!quizData) {
        document.getElementById('quiz-container').innerHTML = '<div style="color:red;">Failed to load quiz file.</div>';
        return;
    }
    // ... continue with quiz rendering ...
}

// Patch the Restart Quiz button on results page
function patchRestartQuizButton() {
  const restartBtn = document.querySelector('.restart-btn');
  if (restartBtn) {
    restartBtn.onclick = function() {
      // If all questions are answered (i.e., on results page), clear quizState and go to welcome
      if (quizState && quizState.userAnswers && quizState.userAnswers.length === quizState.questionPool.length) {
        localStorage.removeItem('quizState');
        window.location.href = 'welcome.html';
      } else {
        window.location.reload();
      }
    };
  }
}

// --- Resume Modal Logic ---
window.onload = function() {
  // Only show resume modal if there is an incomplete quiz
  const saved = localStorage.getItem('quizState');
  if (saved) {
    try {
      const state = JSON.parse(saved);
      if (state && state.userAnswers && state.questionPool && state.userAnswers.length < state.questionPool.length) {
        document.getElementById('resume-modal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('resume-quiz-btn').onclick = function() {
          // Go to first unanswered question
          window.location.href = 'QuizFolder/quiz.html?resume=1';
        };
        document.getElementById('new-quiz-btn').onclick = function() {
          localStorage.removeItem('quizState');
          document.getElementById('resume-modal').style.display = 'none';
          document.body.style.overflow = '';
          window.location.href = 'welcome.html';
        };
      } else {
        // All questions answered, clear quizState
        localStorage.removeItem('quizState');
      }
    } catch {
      localStorage.removeItem('quizState');
    }
  }
};

// At the point where you would show 'No quiz selected', redirect instead:
function redirectToWelcomeIfNoQuiz() {
  // You can set this to your actual welcome page
  window.location.href = '/static/index.html';
}

window.addEventListener('DOMContentLoaded', function() {
  // Add close button to quiz screen if not present
  const quizScreen = document.getElementById('quiz-screen');
  if (quizScreen && !document.getElementById('close-quiz-btn')) {
    const closeBtn = document.createElement('button');
    closeBtn.id = 'close-quiz-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close Quiz';
    closeBtn.style = 'position:absolute;top:16px;right:18px;background:transparent;border:none;font-size:2em;color:#aaa;cursor:pointer;z-index:1000;';
    closeBtn.onclick = function() {
      if (confirm('Are you sure you want to exit the quiz? Your progress will be lost.')) {
        window.location.href = 'welcome.html';
      }
    };
    quizScreen.style.position = 'relative';
    quizScreen.appendChild(closeBtn);
  }
}); 