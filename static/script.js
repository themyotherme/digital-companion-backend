const App = {
    // --- App State & Configuration ---
    currentKnowledgeBases: [],
    kbList: [],
    isProcessing: false,
    promptQueue: [],
    DEFAULTS: {
        role: "Expert",
        mood: "Friendly",
        mode: "Smartplus",
    },

    // --- Initialization ---
    init() {
        document.addEventListener("DOMContentLoaded", async () => {
            console.log("App Initializing...");
            this.populateDropdowns();
            this.setupEventListeners();
            this.updateModeStatus();
    //        this.restoreSelectedKBs();
            lucide.createIcons();
            // After KB list loads, clean orphaned KBs
            await this.renderKBManagerList();
            this.cleanSelectedKBs();
            console.log("App Initialized Successfully.");
        });
    },

    // --- Event Setup ---
    setupEventListeners() {
        document.getElementById("send-button")?.addEventListener("click", () => this.sendMessage());
        document.getElementById("user-input")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        document.getElementById('kb-manager-btn')?.addEventListener('click', () => this.openKBManager());
        document.getElementById('mode-select')?.addEventListener('change', () => this.updateModeStatus());
        document.getElementById('btn-generate-quiz')?.addEventListener('click', () => this.handleStudyTool("Generate Quiz"));

        // --- FIX: Add event listeners for all study tools ---
        document.getElementById('btn-write-summary')?.addEventListener('click', () => this.handleStudyTool("Write Summary"));
        document.getElementById('btn-brief-overview')?.addEventListener('click', () => this.handleStudyTool("Brief Overview"));
        document.getElementById('btn-study-guide')?.addEventListener('click', () => this.handleStudyTool("Prepare Study Guide"));
        document.getElementById('btn-self-test')?.addEventListener('click', () => this.handleStudyTool("Self-Test"));

        // --- BEGIN FIX: Restore sidebar toggle functionality ---
        const sidebar = document.getElementById('chat-history-sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        const openSidebarBtn = document.getElementById('open-sidebar');
        const closeSidebarBtn = document.getElementById('close-sidebar');

        const toggleSidebar = () => {
            sidebar.classList.toggle('-translate-x-full');
            overlay.classList.toggle('hidden');
        };

        if (openSidebarBtn) openSidebarBtn.addEventListener('click', toggleSidebar);
        if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleSidebar);
        if (overlay) overlay.addEventListener('click', toggleSidebar);
        // --- END FIX ---

        // --- THEME TOGGLE ---
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const body = document.body;
                body.classList.toggle('dark');
                // Optionally persist theme
                if (body.classList.contains('dark')) {
                    localStorage.setItem('theme', 'dark');
                    themeBtn.innerHTML = '<i data-lucide="moon"></i>';
                } else {
                    localStorage.setItem('theme', 'light');
                    themeBtn.innerHTML = '<i data-lucide="sun"></i>';
                }
                lucide.createIcons();
            });
            // On load, set theme
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                document.body.classList.add('dark');
                themeBtn.innerHTML = '<i data-lucide="moon"></i>';
            } else {
                document.body.classList.remove('dark');
                themeBtn.innerHTML = '<i data-lucide="sun"></i>';
            }
            lucide.createIcons();
        }

        // --- SETTINGS BUTTON ---
        const settingsBtn = document.getElementById('settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                alert('Settings functionality is not yet implemented.');
            });
        }

        // --- LOGIN BUTTON ---
        const loginBtn = document.getElementById('login');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                alert('Login functionality is not yet implemented.');
            });
        }

        // --- FILE ATTACHMENT (PAPERCLIP) BUTTON ---
        const fileUploadBtn = document.getElementById('file-upload');
        if (fileUploadBtn) {
            fileUploadBtn.addEventListener('click', () => {
                // Create a hidden file input if not present
                let input = document.getElementById('chat-file-input');
                if (!input) {
                    input = document.createElement('input');
                    input.type = 'file';
                    input.id = 'chat-file-input';
                    input.multiple = true;
                    input.accept = '.pdf,.txt,.json';
                    input.style.display = 'none';
                    document.body.appendChild(input);
                }
                input.value = '';
                input.click();
                input.onchange = async (e) => {
                    const files = Array.from(input.files);
                    if (!files.length) return;
                    // Use the same upload logic as KB Manager
                    const formData = new FormData();
                    for (const file of files) {
                        formData.append('file', file);
                    }
                    this.showStatus('Uploading...');
                    try {
                        const res = await fetch('/api/upload', { method: 'POST', body: formData });
                        if (!res.ok) throw new Error('Upload failed.');
                        this.showStatus('Upload successful!');
                        this.renderKBManagerList();
                    } catch (error) {
                        this.showStatus(`Error: ${error.message}`);
                    }
                };
            });
        }
    },
    
    // --- FIX: Add function to populate dropdowns ---
    async populateDropdowns() {
        try {
            const res = await fetch('/static/ui-config.json');
            if (!res.ok) throw new Error('Failed to load UI config');
            const config = await res.json();

            const populate = (selectId, options, titles = {}) => {
                const select = document.getElementById(selectId);
                if (!select) return;
                select.innerHTML = '';
                options.forEach(optionValue => {
                    const option = document.createElement('option');
                    option.value = optionValue;
                    option.textContent = optionValue;
                    option.title = titles[optionValue] || `Select ${optionValue}`;
                    select.appendChild(option);
                });
            };

            populate('role-select', config.role);
            populate('mood-select', config.mood);
            populate('mode-select', config.mode);
            
            // Set default/last selected values
            document.getElementById('mode-select').value = this.DEFAULTS.mode;
        } catch (error) {
            console.error("Error populating dropdowns:", error);
            // Fallback to hardcoded values if config fails
            this.populateDropdownsFallback();
        }
    },

    populateDropdownsFallback() {
        const roles = ["Expert", "Friend", "Teacher"];
        const moods = ["Friendly", "Neutral", "Formal"];
        const modes = ["Smartplus", "Smart", "Creative"];
        const populate = (selectId, options) => {
            const select = document.getElementById(selectId);
            if (!select) return;
            select.innerHTML = '';
            options.forEach(o => {
                const option = document.createElement('option');
                option.value = o; option.textContent = o;
                select.appendChild(option);
            });
        };
        populate('role-select', roles);
        populate('mood-select', moods);
        populate('mode-select', modes);
        document.getElementById('mode-select').value = this.DEFAULTS.mode;
    },

    // --- Knowledge Base Management ---
    async openKBManager() {
        // Create and show modal
        const modal = this.createModal('kb-manager-modal', 'Knowledge Base Manager');
        const modalBody = modal.querySelector('.modal-body');

        // Add Upload Form (no Upload button, auto-upload on file select)
        modalBody.innerHTML = `
            <div id="kb-upload-section" style="margin-bottom: 1em; padding: 1em; border: 1px solid #ddd; border-radius: 8px;">
                <h3 style="margin-top: 0;">Upload New Knowledge Base</h3>
                <input type="file" id="kb-file-input" multiple>
                <div id="upload-status" style="margin-top: 0.5em;color:#e11d48;"></div>
            </div>
            <div id="kb-list-section">
                <h3>Available Knowledge Bases</h3>
                <div id="kb-list-container">Loading...</div>
            </div>
        `;

        // Auto-upload on file select
        document.getElementById('kb-file-input').addEventListener('change', async (e) => {
            const fileInput = e.target;
            const statusDiv = document.getElementById('upload-status');
            if (fileInput.files.length === 0) return;
            const formData = new FormData();
            for (const file of fileInput.files) {
                formData.append('file', file);
            }
            statusDiv.textContent = '';
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Upload failed.');
                }
                fileInput.value = '';
                await this.renderKBManagerList(); // Refresh list
                // Auto-select the newly uploaded file(s)
                if (Array.isArray(this.kbList)) {
                    for (const file of fileInput.files) {
                        const kb = this.kbList.find(k => (k.original_filename || k.original_name) === file.name);
                        if (kb && !this.currentKnowledgeBases.includes(kb.hash_name)) {
                            this.currentKnowledgeBases.push(kb.hash_name);
                        }
                    }
                    sessionStorage.setItem('selectedKBs', JSON.stringify(this.currentKnowledgeBases));
                    this.updateModeStatus();
                }
            } catch (error) {
                statusDiv.textContent = `Error: ${error.message}`;
            }
        });
        await this.renderKBManagerList();
    },

    async renderKBManagerList() {
        const listContainer = document.getElementById('kb-list-container');
        if (!listContainer) return;
        listContainer.innerHTML = 'Loading...';
        try {
            const res = await fetch('/api/list-uploads');
            this.kbList = await res.json();
            
            if (!Array.isArray(this.kbList)) throw new Error("Invalid data from server");

            if (this.kbList.length === 0) {
                listContainer.innerHTML = '<p>No knowledge bases uploaded yet.</p>';
                return;
            }
            
            const groups = this.getGroupedSortedKBList();
            let html = '';
            const groupLabels = { json: 'JSON', pdf: 'PDF', txt: 'Text', doc: 'Docs', other: 'Other' };
            for (const key of ['json', 'pdf', 'txt', 'doc', 'other']) {
                if (groups[key].length > 0) {
                    html += `<div style="font-weight:bold;margin-top:1em;">${groupLabels[key]}</div>`;
                    html += groups[key].map(kb => `
                        <div class="kb-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5em; border-bottom: 1px solid #eee;">
                            <input type="checkbox" class="kb-checkbox" data-kb-hash="${kb.hash_name}" ${this.currentKnowledgeBases.includes(kb.hash_name) ? 'checked' : ''}>
                            <span style="flex-grow: 1; margin-left: 0.5em;" title="Hashed name: ${kb.hash_name}">${kb.original_filename || kb.original_name || kb.hash_name}</span>
                            <button class="kb-delete-btn" data-kb-hash="${kb.hash_name}" style="color: #ef4444;">Delete</button>
                        </div>
                    `).join('');
                }
            }
            listContainer.innerHTML = html;
            listContainer.querySelectorAll('.kb-checkbox').forEach(cb => cb.addEventListener('change', (e) => this.handleKBSelection(e)));
            listContainer.querySelectorAll('.kb-delete-btn').forEach(btn => btn.addEventListener('click', (e) => this.deleteKB(e)));

        } catch (error) {
            listContainer.innerHTML = `<p style="color: red;">Error loading knowledge bases: ${error.message}</p>`;
        }
        // After rendering, clean orphaned KBs
        this.cleanSelectedKBs();
    },
    
    handleKBSelection(event) {
        const checkbox = event.target;
        const hashName = checkbox.dataset.kbHash;
        if (checkbox.checked) {
            if (!this.currentKnowledgeBases.includes(hashName)) {
                this.currentKnowledgeBases.push(hashName);
            }
        } else {
            this.currentKnowledgeBases = this.currentKnowledgeBases.filter(kb => kb !== hashName);
        }
        sessionStorage.setItem('selectedKBs', JSON.stringify(this.currentKnowledgeBases));
        this.updateModeStatus();
    },

    async deleteKB(event) {
        const hashName = event.target.dataset.kbHash;
        const kb = this.kbList.find(k => k.hash_name === hashName);
        const displayName = kb ? (kb.original_filename || kb.original_name || kb.hash_name) : hashName;
        if (confirm(`Are you sure you want to delete "${displayName}"?`)) {
            try {
                const res = await fetch(`/api/delete-upload/${hashName}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Server deletion failed.');
                this.renderKBManagerList(); // Refresh list
                // Also remove from selection if it was selected
                this.currentKnowledgeBases = this.currentKnowledgeBases.filter(kb => kb !== hashName);
                sessionStorage.setItem('selectedKBs', JSON.stringify(this.currentKnowledgeBases));
                this.updateModeStatus();
            } catch (error) {
                alert(`Error deleting file: ${error.message}`);
            }
        }
        // After deletion, clean orphaned KBs
        this.cleanSelectedKBs();
    },

    // --- Main Chat Logic ---
    async sendMessage() {
        const userInput = document.getElementById('user-input');
        const text = userInput.value.trim();
        if (!text) return;
        // Detect if the text matches a study tool command
        const studyToolMap = {
            'write summary': 'Write Summary',
            'brief overview': 'Brief Overview',
            'prepare study guide': 'Prepare Study Guide',
            'generate quiz': 'Generate Quiz',
            'self-test': 'Self-Test',
            'self test': 'Self-Test',
        };
        const lower = text.toLowerCase();
        if (studyToolMap[lower]) {
            await this.handleStudyTool(studyToolMap[lower]);
            userInput.value = '';
            return;
        }
        this.addMessage(text, 'user');
        this.promptQueue.push(text);
        userInput.value = '';
        if (!this.isProcessing) {
            this.processQueue();
        }
    },

    async processQueue() {
        if (this.promptQueue.length === 0) {
            this.isProcessing = false;
            return;
        }
        this.isProcessing = true;
        const text = this.promptQueue.shift();
        this.addMessage("Thinking...", 'assistant', true);

        const payload = {
            role: this.getSelectedRole(),
            mood: this.getSelectedMood(),
            mode: this.getSelectedMode(),
            question: text,
            knowledge_bases: this.currentKnowledgeBases
        };

        try {
            const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            document.querySelector('.message.assistant:last-child').remove();
            this.addMessage(data.response, 'assistant');
        } catch (error) {
            document.querySelector('.message.assistant:last-child').remove();
            this.addMessage("Sorry, an error occurred communicating with the server.", 'assistant');
        } finally {
            this.isProcessing = false;
            this.processQueue();
        }
    },

    // --- FIX: Add function for system-generated prompts ---
    sendSystemPrompt(prompt) {
        if (this.currentKnowledgeBases.length === 0) {
            alert("Please select a Knowledge Base file before using a study tool.");
            return;
        }
        this.addMessage(prompt, 'user');
        this.promptQueue.push(prompt);
        if (!this.isProcessing) {
            this.processQueue();
        }
        // Close sidebar after clicking a tool
        const sidebar = document.getElementById('chat-history-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar && overlay) {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        }
    },

    // --- Study Tools ---
    async generateQuiz() {
        if (this.currentKnowledgeBases.length === 0) {
            alert('Please select a knowledge base file from the KB Manager first.');
            return;
        }
        const title = prompt('Enter a title for your new quiz:', 'My Custom Quiz');
        if (!title) return;

        this.showStatus(`Generating quiz "${title}"... This may take a minute.`);
        
        try {
            const res = await fetch('/api/generate_quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kb_filenames: this.currentKnowledgeBases, quiz_title: title })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.showStatus(`Quiz "${title}" created successfully!`);
                if (confirm(`Quiz "${title}" created successfully!\nIt's saved in 'static/quizzes/'.\n\nOpen the quiz page now?`)) {
                    window.open('/static/welcome.html', '_blank');
                }
            } else {
                throw new Error(data.error || 'Unknown server error');
            }
        } catch (err) {
            this.showStatus(`Error: Quiz generation failed.`);
            alert(`Quiz generation failed: ${err.message}`);
        }
    },

    // --- UI Helpers ---
    addMessage(text, sender, isThinking = false) {
        const responseWindow = document.getElementById("response-window");
        const messageEl = document.createElement("div");
        messageEl.className = `message ${sender}`;
        
        if (isThinking) {
            messageEl.innerHTML = `<div class="thinking-indicator"></div>`;
        } else {
            messageEl.textContent = text;
        }
        
        responseWindow.appendChild(messageEl);
        responseWindow.scrollTop = responseWindow.scrollHeight;
    },

    updateModeStatus() {
        const statusDiv = document.getElementById('mode-status-bar');
        if (!statusDiv) return;
        const mode = this.getSelectedMode();
        let statusText = `Mode: <strong>${mode.charAt(0).toUpperCase() + mode.slice(1)}</strong>`;
        
        if (this.currentKnowledgeBases && this.currentKnowledgeBases.length > 0) {
            // We need the full kbList to show original names
            const displayNames = this.currentKnowledgeBases.map(hash => {
                const kb = this.kbList.find(k => k.hash_name === hash);
                return kb ? (kb.original_filename || kb.original_name || hash) : hash; // Fallback to hash if not found
            }).join(', ');
            statusText += ` | KB: <strong title="${displayNames}">${displayNames}</strong>`;
        }
        statusDiv.innerHTML = statusText;
    },
    
    showStatus(msg) {
      let statusDiv = document.getElementById('kb-status');
      if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'kb-status';
        document.body.insertBefore(statusDiv, document.body.firstChild);
      }
      statusDiv.textContent = msg;
    },
    
    createModal(id, title) {
        document.getElementById(id)?.remove(); // Remove old modal if exists
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.style.position = 'fixed';
        modal.style.top = '20%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, 0)';
        modal.style.zIndex = 10000;
        modal.innerHTML = `
            <div class="modal-content" style="position:relative;">
                <div class="modal-header" style="cursor:move;user-select:none;">
                    <h2 style="display:inline-block;">${title}</h2>
                    <button class="close-button" style="float:right;">&times;</button>
                </div>
                <div class="modal-body"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-button').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        // --- Make modal draggable ---
        const header = modal.querySelector('.modal-header');
        let isDragging = false, startX, startY, startLeft, startTop;
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = modal.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            modal.style.left = `${startLeft + dx + modal.offsetWidth/2}px`;
            modal.style.top = `${startTop + dy}px`;
            modal.style.transform = 'translate(-50%, 0)';
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.userSelect = '';
        });
        return modal;
    },

    // --- Getters ---
    getSelectedRole() { return document.getElementById('role-select')?.value || this.DEFAULTS.role; },
    getSelectedMood() { return document.getElementById('mood-select')?.value || this.DEFAULTS.mood; },
    getSelectedMode() { return document.getElementById('mode-select')?.value || this.DEFAULTS.mode; },

    // --- Utility: List all quiz files from uploads and static/quizzes by display name, index on the fly if needed ---
    async getAllQuizFiles() {
        // List all .json files in uploads/ (regardless of index)
        let uploads = [];
        try {
            const res = await fetch('/api/list-uploads');
            let kbList = [];
            if (res.ok) kbList = await res.json();
            // Get all files in uploads/ directory
            const uploadsDirRes = await fetch('/uploads/');
            if (uploadsDirRes.ok) {
                const text = await uploadsDirRes.text();
                // Parse directory listing (if available)
                const matches = text.match(/href="([^"]+\.json)"/g) || [];
                const allFiles = matches.map(m => decodeURIComponent(m.match(/href="([^"]+)"/)[1]));
                for (const file of allFiles) {
                    // Ignore hash files for display, but allow if not indexed
                    if (file.endsWith('.json') && !file.match(/^[a-f0-9]{64}.*-knowledge\.json$/)) {
                        // Check if indexed
                        let kb = kbList.find(k => (k.original_filename || k.original_name) === file);
                        if (!kb) {
                            // Index on the fly: create a minimal entry
                            uploads.push({ name: file, source: 'uploads', hash_name: file });
                        } else {
                            uploads.push({ name: file, source: 'uploads', hash_name: kb.hash_name });
                        }
                    }
                }
            }
        } catch {}
        // Fetch static/quizzes directory (by reading quiz_index.json)
        let quizzes = [];
        try {
            const res = await fetch('/static/quizzes/quiz_index.json');
            if (res.ok) {
                const index = await res.json();
                if (index && Array.isArray(index.quizzes)) {
                    quizzes = index.quizzes.map(q => ({
                        name: q.file,
                        source: 'static/quizzes',
                        title: q.title || q.file
                    }));
                }
            }
        } catch {}
        // Merge and deduplicate by name (uploads take precedence)
        const all = [...uploads];
        for (const q of quizzes) {
            if (!all.find(u => u.name === q.name)) all.push(q);
        }
        // Sort alphabetically by title or name
        all.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, undefined, {numeric:true,sensitivity:'base'}));
        return all;
    },

    // --- Self-Test Modal for Quiz File Selection (supports both locations, always by display name) ---
    async handleStudyTool(action) {
        if (action === 'Self-Test') {
            const quizFiles = await this.getAllQuizFiles();
            if (quizFiles.length === 0) {
                alert('No quiz files available. Please upload or add a quiz-formatted JSON file.');
                return;
            }
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `
                <div style="background:#fff;padding:2em;border-radius:12px;min-width:320px;max-width:90vw;">
                    <h3>Select a Quiz File</h3>
                    <select id="quiz-file-select" style="width:100%;margin:1em 0;">
                        ${quizFiles.map(q => `<option value="${q.name}|${q.source}">${q.title || q.name} (${q.source})</option>`).join('')}
                    </select>
                    <div style="text-align:right;">
                        <button id="quiz-modal-cancel" style="margin-right:1em;">Cancel</button>
                        <button id="quiz-modal-ok">Start Quiz</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('quiz-modal-cancel').onclick = () => modal.remove();
            document.getElementById('quiz-modal-ok').onclick = async () => {
                const val = document.getElementById('quiz-file-select').value;
                const [filename, source] = val.split('|');
                const isQuiz = await this.isQuizFile(filename, source);
                if (!isQuiz) {
                    alert('This is not a quiz file. Please select a quiz-formatted JSON file.');
                    return;
                }
                modal.remove();
                this.launchQuiz(filename, source);
            };
            return;
        }
        if (this.currentKnowledgeBases.length === 0) {
            alert('Please select or upload a file first.');
            return;
        }
        const hashName = this.currentKnowledgeBases[0]; // Only support one file for now for simplicity
        const isQuiz = await this.isQuizFile(hashName);
        if (["Write Summary", "Brief Overview", "Prepare Study Guide", "Generate Quiz"].includes(action)) {
            if (isQuiz) {
                alert('This action is only for knowledge base files (text, PDF, etc). Please attach a non-quiz file.');
                return;
            }
            // Route to the appropriate handler (existing logic)
            if (action === "Write Summary") {
                this.sendSystemPrompt("Write a detailed summary of the provided knowledge base.");
            } else if (action === "Brief Overview") {
                this.sendSystemPrompt("Give me a brief overview of the key points in the knowledge base.");
            } else if (action === "Prepare Study Guide") {
                this.sendSystemPrompt("Prepare a study guide based on the content of the knowledge base.");
            } else if (action === "Generate Quiz") {
                this.generateQuiz();
            }
        }
    },

    // --- Utility: Detect if a file is a quiz file (supports both locations, always by display name) ---
    async isQuizFile(filename, source) {
        let url = '';
        if (source === 'uploads') url = `/uploads/${filename}`;
        else if (source === 'static/quizzes') url = `/static/quizzes/${filename}`;
        else return false;
        try {
            const res = await fetch(url);
            if (!res.ok) return false;
            const data = await res.json();
            console.log('[Quiz Debug] Loaded quiz file data:', data); // Debug log
            if (Array.isArray(data)) {
                // Use normalization logic for quiz questions
                const normalized = this.normalizeQuizQuestions(data);
                if (normalized.length > 0) return true;
            }
        } catch (e) {
            console.error('[Quiz Debug] Error parsing quiz file:', e);
            return false;
        }
        return false;
    },

    // --- Normalize quiz questions: default type to 'mcq' if options exist, ignore if neither type nor options ---
    normalizeQuizQuestions(questions) {
        return questions
            .map(q => {
                // If type is missing but options exist, default to "mcq"
                if (!q.type && Array.isArray(q.options)) {
                    return { ...q, type: "mcq" };
                }
                return q;
            })
            // Only keep questions that have a type and required fields
            .filter(q =>
                typeof q.question === "string" &&
                q.type &&
                (
                    (q.type === "mcq" && Array.isArray(q.options) && q.options.length > 0 && q.correct_answer && String(q.correct_answer).length > 0)
                    // Add more types/logic here if needed
                )
            );
    },

    // --- Launch Quiz Interface (modern modal UI, with quiz_index.json support, both locations, always by display name) ---
    async launchQuiz(filename, source) {
        try {
            // Try to load quiz_index.json for title/music
            let quizMeta = null;
            try {
                const res = await fetch('/static/quizzes/quiz_index.json');
                if (res.ok) {
                    const index = await res.json();
                    if (index && Array.isArray(index.quizzes)) {
                        quizMeta = index.quizzes.find(q => q.file === filename);
                    }
                }
            } catch (e) { /* ignore */ }
            // Fetch and filter valid questions
            let url = '';
            if (source === 'uploads') url = `/uploads/${filename}`;
            else if (source === 'static/quizzes') url = `/static/quizzes/${filename}`;
            else throw new Error('Unknown quiz file source.');
            const res = await fetch(url);
            if (!res.ok) throw new Error('Could not load quiz file.');
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('Quiz file is not a valid array.');
            // Use normalization logic for quiz questions
            const validQuestions = this.normalizeQuizQuestions(data);
            if (validQuestions.length === 0) {
                alert('No valid quiz questions found in this file.');
                return;
            }
            // Play music if available
            if (quizMeta && quizMeta.music) {
                let audio = document.getElementById('quiz-music-audio');
                if (!audio) {
                    audio = document.createElement('audio');
                    audio.id = 'quiz-music-audio';
                    document.body.appendChild(audio);
                }
                audio.src = `/static/${quizMeta.music}`;
                audio.volume = 0.5;
                audio.play().catch(()=>{});
            }
            // Show quiz modal with better title
            this.showQuizModal(validQuestions, quizMeta ? quizMeta.title : filename);
        } catch (e) {
            alert('Error loading quiz: ' + e.message);
        }
    },

    // --- Show Quiz Modal (with title) ---
    showQuizModal(questions, quizTitle) {
        let current = 0;
        const userAnswers = Array(questions.length).fill(null);
        let quizDone = false;
        let quizSaved = false;
        // Add CSS for quiz button states if not already present
        if (!document.getElementById('quiz-btn-style')) {
            const style = document.createElement('style');
            style.id = 'quiz-btn-style';
            style.textContent = `
.quiz-btn { padding: 0.5em 1.2em; border-radius: 6px; border: none; font-weight: 500; margin: 0 0.2em; transition: background 0.2s, color 0.2s; }
.quiz-btn:disabled { background: #e5e7eb !important; color: #9ca3af !important; cursor: not-allowed; }
.quiz-btn-green { background: #16a34a; color: #fff; }
.quiz-btn-red { background: #e11d48; color: #fff; }
.quiz-btn-gray { background: #6b7280; color: #fff; }
`;
            document.head.appendChild(style);
        }
        // On quiz start, check for saved progress
        const progressKey = 'quiz-progress-' + encodeURIComponent(quizTitle);
        const saved = localStorage.getItem(progressKey);
        if (saved) {
            if (confirm('Resume your previous quiz attempt?')) {
                try {
                    const progress = JSON.parse(saved);
                    if (typeof progress.current === 'number' && Array.isArray(progress.userAnswers)) {
                        current = Math.min(progress.current, questions.length - 1);
                        for (let i = 0; i < questions.length; ++i) {
                            userAnswers[i] = progress.userAnswers[i] ?? null;
                        }
                    }
                } catch {}
            } else {
                localStorage.removeItem(progressKey);
            }
        }
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center;';
        const render = () => {
            if (quizDone) {
                // Show results
                let correct = 0;
                let html = `<div style='background:#fff;padding:2em 2em 1em 2em;border-radius:12px;min-width:320px;max-width:90vw;max-height:90vh;overflow-y:auto;'>`;
                html += `<h2 style='margin-bottom:0.5em;'>${quizTitle ? quizTitle : 'Quiz Results'}</h2>`;
                html += `<div style='margin-bottom:1em;'>Score: <b>${userAnswers.filter((a,i)=>a!==null&&a===questions[i].correct_answer).length}</b> / ${questions.length}</div>`;
                html += `<ol style='padding-left:1.2em;'>`;
                questions.forEach((q, i) => {
                    const userAns = userAnswers[i];
                    const isCorrect = userAns === q.correct_answer;
                    html += `<li style='margin-bottom:1em;'>
                        <div><b>Q${i+1}:</b> ${q.question}</div>
                        <div>Your answer: <span style='color:${isCorrect ? '#16a34a':'#e11d48'};font-weight:bold;'>${userAns ?? '<i>None</i>'}</span></div>
                        <div>Correct answer: <b>${q.correct_answer}</b></div>
                        ${q.explanation ? `<div style='color:#64748b;font-size:0.95em;margin-top:0.2em;'>Explanation: ${q.explanation}</div>` : ''}
                    </li>`;
                });
                html += `</ol>`;
                html += `<div style='text-align:right;'><button id='quiz-close-btn' class='quiz-btn quiz-btn-gray' style='margin-top:1em;'>Close</button></div>`;
                html += `</div>`;
                modal.innerHTML = html;
                document.getElementById('quiz-close-btn').onclick = () => {
                    // Stop music if playing
                    const audio = document.getElementById('quiz-music-audio');
                    if (audio) { audio.pause(); audio.currentTime = 0; }
                    modal.remove();
                };
                // Clear saved progress on finish
                localStorage.removeItem(progressKey);
                return;
            }
            // Show current question
            const q = questions[current];
            let html = `<div style='background:#fff;padding:2em 2em 1em 2em;border-radius:12px;min-width:320px;max-width:90vw;max-height:90vh;overflow-y:auto;'>`;
            html += `<div style='font-size:1.1em;margin-bottom:0.5em;'><b>${quizTitle ? quizTitle : 'Quiz'}: Question ${current+1} of ${questions.length}</b></div>`;
            html += `<div style='margin-bottom:1em;'>${q.question}</div>`;
            html += `<form id='quiz-form'>`;
            q.options.forEach((opt, idx) => {
                if (!opt) return;
                const checked = userAnswers[current] === opt ? 'checked' : '';
                html += `<div style='margin-bottom:0.3em;'><label><input type='radio' name='quiz-opt' value='${opt.replace(/'/g, "&apos;")}' ${checked}> ${opt}</label></div>`;
            });
            html += `</form>`;
            html += `<div style='margin-top:1em;display:flex;justify-content:space-between;gap:1em;flex-wrap:wrap;'>`;
            html += `<button id='quiz-prev-btn' class='quiz-btn quiz-btn-gray' ${current===0?'disabled':''}>Previous</button>`;
            html += `<button id='quiz-next-btn' class='quiz-btn quiz-btn-gray' ${current===questions.length-1?'disabled':''}>Next</button>`;
            html += `<button id='quiz-submit-btn' class='quiz-btn ${current===questions.length-1 && !userAnswers.includes(null) && !quizDone ? 'quiz-btn-green' : 'quiz-btn-gray'}' ${(current!==questions.length-1 || userAnswers.includes(null) || quizDone)?'disabled':''}>Submit</button>`;
            html += `<button id='quiz-save-btn' class='quiz-btn quiz-btn-red'>Save & Exit</button>`;
            html += `<button id='quiz-close-btn' class='quiz-btn quiz-btn-gray'>Close</button>`;
            html += `</div>`;
            html += `</div>`;
            modal.innerHTML = html;
            // Handlers
            document.getElementById('quiz-prev-btn').onclick = () => { if (current > 0) { current = Math.max(0, current-1); render(); } };
            document.getElementById('quiz-next-btn').onclick = () => { if (current < questions.length-1) { current = Math.min(questions.length-1, current+1); render(); } };
            document.getElementById('quiz-close-btn').onclick = () => {
                if (!quizDone && !quizSaved && userAnswers.some(a => a !== null)) {
                    if (confirm('Are you sure you want to quit? Your progress will be lost unless you save.')) {
                        // Stop music if playing
                        const audio = document.getElementById('quiz-music-audio');
                        if (audio) { audio.pause(); audio.currentTime = 0; }
                        modal.remove();
                    }
                } else {
                    // Stop music if playing
                    const audio = document.getElementById('quiz-music-audio');
                    if (audio) { audio.pause(); audio.currentTime = 0; }
                    modal.remove();
                }
            };
            document.getElementById('quiz-save-btn').onclick = () => {
                localStorage.setItem(progressKey, JSON.stringify({current, userAnswers}));
                quizSaved = true;
                alert('Quiz progress saved! You can resume later.');
                // Stop music if playing
                const audio = document.getElementById('quiz-music-audio');
                if (audio) { audio.pause(); audio.currentTime = 0; }
                modal.remove();
            };
            document.getElementById('quiz-form').onchange = (e) => {
                if (e.target.name === 'quiz-opt') {
                    userAnswers[current] = e.target.value;
                    render();
                }
            };
            document.getElementById('quiz-submit-btn').onclick = () => {
                if (!userAnswers.includes(null) && current === questions.length-1 && !quizDone) {
                    quizDone = true;
                    render();
                }
            };
        };
        document.body.appendChild(modal);
        render();
    },

    // --- Utility: Group and Sort KB Files ---
    getGroupedSortedKBList() {
        const groups = { json: [], pdf: [], txt: [], doc: [], other: [] };
        for (const kb of this.kbList) {
            const name = kb.original_filename || kb.original_name || kb.hash_name;
            if (name.endsWith('.json')) groups.json.push(kb);
            else if (name.endsWith('.pdf')) groups.pdf.push(kb);
            else if (name.endsWith('.txt')) groups.txt.push(kb);
            else if (name.match(/\.(docx?|odt)$/i)) groups.doc.push(kb);
            else groups.other.push(kb);
        }
        for (const key in groups) {
            groups[key].sort((a, b) => (a.original_filename || a.original_name || a.hash_name).localeCompare(b.original_filename || b.original_name || b.hash_name));
        }
        return groups;
    },

    // --- Remove orphaned KBs from selection and update status bar ---
    cleanSelectedKBs() {
        // Remove any selected KBs that are not present in the current kbList
        const validHashes = new Set(this.kbList.map(kb => kb.hash_name));
        const filtered = this.currentKnowledgeBases.filter(hash => validHashes.has(hash));
        if (filtered.length !== this.currentKnowledgeBases.length) {
            this.currentKnowledgeBases = filtered;
            sessionStorage.setItem('selectedKBs', JSON.stringify(this.currentKnowledgeBases));
            this.updateModeStatus();
        }
    },
};

// --- Start The App ---
App.init();
