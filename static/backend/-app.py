from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import json
import traceback
from werkzeug.utils import secure_filename
import PyPDF2
import io
from openai import OpenAI
import hashlib
from datetime import datetime
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Load environment variables
load_dotenv()

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'json'}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB max file size
STATIC_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '/static'))
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), 'settings.json')

# Initialize Flask app
app = Flask(__name__, static_folder=STATIC_FOLDER)
CORS(app, resources={
    r"/*": {
        "origins": ["http://127.0.0.1:5000", "http://localhost:5000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Initialize rate limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
if not os.getenv('OPENAI_API_KEY'):
    print("WARNING: OPENAI_API_KEY not found in environment variables")

# Configure app
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Create uploads folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_ai_response(prompt, model="gpt-3.5-turbo"):
    try:
        print(f"[DEBUG] Getting AI response with model {model}")
        print(f"[DEBUG] Prompt: {prompt}")
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.7
        )
        result = response.choices[0].message.content.strip()
        print(f"[DEBUG] AI Response: {result}")
        return result
    except Exception as e:
        print(f"[ERROR] Error getting AI response: {str(e)}")
        app.logger.error(f"Error getting AI response: {str(e)}")
        raise

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def compute_file_hash(file):
    file.seek(0)
    hasher = hashlib.sha256()
    while True:
        chunk = file.read(8192)
        if not chunk:
            break
        hasher.update(chunk)
    file.seek(0)
    return hasher.hexdigest()

def process_text_file(file, original_filename=None):
    try:
        content = file.read().decode('utf-8')
        # Split into chunks (e.g., paragraphs)
        chunks = [p.strip() for p in content.split('\n\n') if len(p.strip()) > 30]
        knowledge = {
            "chunks": [{"text": chunk} for chunk in chunks],
            "original_filename": original_filename,
            "upload_date": datetime.now().isoformat()
        }
        return knowledge
    except Exception as e:
        app.logger.error(f"Error processing text file: {str(e)}")
        raise

def process_pdf_file(file, original_filename=None):
    try:
        pdf_reader = PyPDF2.PdfReader(file)
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        # Split into chunks (e.g., pages)
        chunks = [p.strip() for p in text.split('\n') if len(p.strip()) > 30]
        knowledge = {
            "chunks": [{"text": chunk} for chunk in chunks],
            "original_filename": original_filename,
            "upload_date": datetime.now().isoformat()
        }
        return knowledge
    except Exception as e:
        app.logger.error(f"Error processing PDF file: {str(e)}")
        raise

def process_json_file(file, original_filename=None):
    try:
        content = json.load(file)
        # Add original filename and upload date if not present
        content["original_filename"] = original_filename
        content["upload_date"] = datetime.now().isoformat()
        return content
    except json.JSONDecodeError as e:
        app.logger.error(f"Error decoding JSON file: {str(e)}")
        raise
    except Exception as e:
        app.logger.error(f"Error processing JSON file: {str(e)}")
        raise

@app.route('/api/upload', methods=['POST'])
@limiter.limit("30 per minute")
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        if not allowed_file(file.filename):
            return jsonify({"error": f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
        # Compute hash
        file_hash = compute_file_hash(file)
        kb_filename = f"{file_hash}-knowledge.json"
        kb_path = os.path.join(app.config['UPLOAD_FOLDER'], kb_filename)
        if os.path.exists(kb_path):
            return jsonify({
                "success": True,
                "message": "Knowledge base already exists for this file.",
                "knowledge_base": kb_filename
            })
        # Process file
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        try:
            if file_extension == 'txt':
                knowledge = process_text_file(file, original_filename=file.filename)
            elif file_extension == 'pdf':
                knowledge = process_pdf_file(file, original_filename=file.filename)
            elif file_extension == 'json':
                knowledge = process_json_file(file, original_filename=file.filename)
            # Save knowledge base
            with open(kb_path, 'w', encoding='utf-8') as f:
                json.dump(knowledge, f, ensure_ascii=False, indent=2)
            return jsonify({
                "success": True,
                "message": "Knowledge base created successfully.",
                "knowledge_base": kb_filename
            })
        except Exception as e:
            app.logger.error(f"Error processing file: {str(e)}\n{traceback.format_exc()}")
            return jsonify({"error": "Error processing file"}), 500
    except Exception as e:
        app.logger.error(f"Error in upload endpoint: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500

# Serve static files


from flask import send_file

@app.route('/')
def index():
    index_path = os.path.join(app.static_folder, 'index.html')
    print("Serving index.html from:", index_path)
    return send_file(index_path)


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# API endpoints
@app.route('/api/chat', methods=['POST'])
@limiter.limit("60 per minute")
def chat():
    try:
        data = request.json
        print("[DEBUG] Received data at /api/chat:", data)
        if not data:
            print("[ERROR] No data provided")
            return jsonify({"error": "No data provided"}), 400

        required_fields = ['role', 'mood', 'mode', 'question']
        for field in required_fields:
            if field not in data:
                print(f"[ERROR] Missing required field: {field}")
                return jsonify({"error": f"Missing required field: {field}"}), 400

        mode = data['mode'].lower()
        question = data['question']
        # Support both single and multiple KBs for backward compatibility
        kb_filenames = data.get('knowledge_bases')
        if not kb_filenames:
            kb_filename = data.get('knowledge_base')
            if kb_filename:
                kb_filenames = [kb_filename]
            else:
                kb_filenames = []
        print(f"[DEBUG] Processing request - Mode: {mode}, Question: {question}, KBs: {kb_filenames}")

        # Detect if the question is a summary request
        is_summary = 'summarize' in question.lower() or 'summary' in question.lower()

        # If summary or file-based question and no KBs selected, return clear message
        if (mode in ['local', 'smart', 'smartplus']) and (is_summary or 'file' in question.lower() or 'document' in question.lower() or 'attachment' in question.lower()):
            if not kb_filenames or not any(kb_filenames):
                return jsonify({"response": "You have selected no attachments."})

        if mode == 'local':
            # Local mode: only one KB, no AI
            try:
                if not kb_filenames or not kb_filenames[0]:
                    print("[ERROR] No knowledge base specified for local mode")
                    return jsonify({"error": "No knowledge base specified."}), 400
                kb_path = os.path.join(app.config['UPLOAD_FOLDER'], kb_filenames[0])
                if not os.path.exists(kb_path):
                    print(f"[ERROR] Knowledge base not found: {kb_path}")
                    return jsonify({"error": "Knowledge base not found"}), 404
                with open(kb_path, 'r', encoding='utf-8') as f:
                    knowledge = json.load(f)
                response = "I couldn't find a specific answer in the knowledge base."
                for chunk in knowledge.get('chunks', []):
                    if any(word.lower() in chunk['text'].lower() for word in question.split()):
                        response = chunk['text']
                        break
                print(f"[DEBUG] Local mode response: {response}")
                return jsonify({"response": response})
            except Exception as e:
                print(f"[ERROR] Error in local mode: {str(e)}")
                app.logger.error(f"Error in local mode: {str(e)}")
                return jsonify({"error": "Error processing local mode request"}), 500

        elif mode == 'smart':
            try:
                if not kb_filenames or not any(kb_filenames):
                    print("[ERROR] No knowledge base specified for smart mode")
                    return jsonify({"error": "Smart mode requires at least one knowledge base."}), 400
                # Combine all KB chunks
                all_chunks = []
                file_names = []
                for kb_filename in kb_filenames:
                    kb_path = os.path.join(app.config['UPLOAD_FOLDER'], kb_filename)
                    if not os.path.exists(kb_path):
                        print(f"[ERROR] Knowledge base not found: {kb_path}")
                        return jsonify({"error": f"Knowledge base not found: {kb_filename}"}), 404
                    with open(kb_path, 'r', encoding='utf-8') as f:
                        knowledge = json.load(f)
                        all_chunks.extend(chunk['text'] for chunk in knowledge.get('chunks', []))
                        file_names.append(knowledge.get('original_filename', kb_filename))
                # For summary requests, use ALL chunks
                if is_summary:
                    context = "\n\n".join(all_chunks)
                    file_list_str = 'Files used for this answer: ' + ', '.join(file_names) + '\n\n'
                    prompt = f"""Answer the following question using ONLY the provided document content. Do NOT use any external knowledge.\n\nDocument content:\n{context}\n\nQuestion: {question}\n\nIf the answer is not in the document, say 'I could not find the answer in the provided documents.'"""
                    response = get_ai_response(prompt, model="gpt-4")
                    response = file_list_str + response
                else:
                    # Find relevant chunks for non-summary questions
                    relevant_chunks = []
                    for chunk in all_chunks:
                        if any(word.lower() in chunk.lower() for word in question.split()):
                            relevant_chunks.append(chunk)
                    context = "\n\n".join(relevant_chunks) if relevant_chunks else ""
                    prompt = f"""As {data['role']} in a {data['mood']} mood, answer the following question using ONLY the provided document content. Do NOT use any external knowledge.\n\nDocument content:\n{context}\n\nQuestion: {question}\n\nIf the answer is not in the document, say 'I could not find the answer in the provided documents.'"""
                    response = get_ai_response(prompt, model="gpt-4")
                if not isinstance(response, str) or not response.strip():
                    response = "Sorry, I couldn't generate a response. Please try again."
                print(f"[DEBUG] Smart mode response: {response}")
                return jsonify({"response": response})
            except Exception as e:
                print(f"[ERROR] Error in smart mode: {str(e)}")
                app.logger.error(f"Error in smart mode: {str(e)}")
                return jsonify({"error": "Error processing smart mode request"}), 500

        elif mode == 'smartplus':
            try:
                context = ""
                file_names = []
                if kb_filenames and any(kb_filenames):
                    all_chunks = []
                    for kb_filename in kb_filenames:
                        kb_path = os.path.join(app.config['UPLOAD_FOLDER'], kb_filename)
                        if os.path.exists(kb_path):
                            with open(kb_path, 'r', encoding='utf-8') as f:
                                knowledge = json.load(f)
                                all_chunks.extend(chunk['text'] for chunk in knowledge.get('chunks', []))
                                # Collect original file names for display
                                file_names.append(knowledge.get('original_filename', kb_filename))
                    # If the question is a summary request, include all chunks
                    if is_summary:
                        relevant_chunks = all_chunks
                    else:
                        relevant_chunks = []
                        for chunk in all_chunks:
                            if any(word.lower() in chunk.lower() for word in question.split()):
                                relevant_chunks.append(chunk)
                    if relevant_chunks:
                        context = "Information from uploaded document(s):\n" + "\n\n".join(relevant_chunks)
                        print(f"[DEBUG] Found relevant chunks in knowledge base(s): {len(relevant_chunks)}")
                # Add file names to the top of the response if any
                file_list_str = ''
                if file_names:
                    file_list_str = 'Files used for this answer: ' + ', '.join(file_names) + '\n\n'
                prompt = f"""As {data['role']} in a {data['mood']} mood, provide a comprehensive answer to the following question.\n\n{file_list_str}{context}\n\nQuestion: {question}\n\nPlease combine the information from the uploaded document(s) (if any) with your own external knowledge."""
                response = get_ai_response(prompt, model="gpt-4")
                if not isinstance(response, str) or not response.strip():
                    response = "Sorry, I couldn't generate a response. Please try again."
                print(f"[DEBUG] SmartPlus mode response: {response}")
                return jsonify({"response": response})
            except Exception as e:
                print(f"[ERROR] Error in smartplus mode: {str(e)}")
                app.logger.error(f"Error in smartplus mode: {str(e)}")
                return jsonify({"error": "Error processing smartplus mode request"}), 500

        else:
            print(f"[ERROR] Invalid mode received: {mode}")
            return jsonify({"error": f"Invalid mode: {mode}"}), 400

    except Exception as e:
        print(f"[ERROR] Error in chat endpoint: {str(e)}")
        app.logger.error(f"Error in chat endpoint: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500

def load_settings():
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        app.logger.error(f"Error loading settings: {str(e)}")
        return {}

def save_settings(settings):
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception as e:
        app.logger.error(f"Error saving settings: {str(e)}")
        return False

@app.route('/api/settings', methods=['GET', 'POST'])
@limiter.limit("30 per minute")
def settings():
    if request.method == 'POST':
        try:
            data = request.json
            if not data:
                return jsonify({"error": "No settings provided"}), 400
            
            current_settings = load_settings()
            current_settings.update(data)
            
            if save_settings(current_settings):
                return jsonify({
                    "status": "success",
                    "message": "Settings updated successfully",
                    "settings": current_settings
                })
            else:
                return jsonify({"error": "Failed to save settings"}), 500
                
        except Exception as e:
            app.logger.error(f"Error saving settings: {str(e)}")
            return jsonify({"error": "Error saving settings"}), 500
    else:
        try:
            settings = load_settings()
            return jsonify({
                "status": "success",
                "settings": settings
            })
        except Exception as e:
            app.logger.error(f"Error retrieving settings: {str(e)}")
            return jsonify({"error": "Error retrieving settings"}), 500

@app.route('/data/<path:filename>')
def serve_data(filename):
    return send_from_directory(os.path.join(app.root_path, 'static', 'data'), filename)

@app.route('/api/list-uploads')
@limiter.limit("30 per minute")
def list_uploads():
    try:
        files = os.listdir(app.config['UPLOAD_FOLDER'])
        return jsonify(files)
    except Exception as e:
        app.logger.error(f"Error listing uploads: {str(e)}")
        return jsonify({"error": "Error listing uploads"}), 500

@app.route('/uploads/<path:filename>', methods=['GET', 'DELETE'])
@limiter.exempt  # Exempt this endpoint from rate limiting
def serve_upload(filename):
    uploads_dir = app.config.get('UPLOAD_FOLDER', 'uploads')
    file_path = os.path.join(uploads_dir, filename)
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    if request.method == 'DELETE':
        try:
            os.remove(file_path)
            return jsonify({"success": True, "message": "File deleted"})
        except Exception as e:
            app.logger.error(f"Error deleting file {filename}: {str(e)}")
            return jsonify({"error": "Error deleting file"}), 500
    if filename.endswith('.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except Exception as e:
            app.logger.error(f"Error reading JSON file {filename}: {str(e)}")
            return jsonify({"error": "Error reading JSON file"}), 500
    return send_from_directory(uploads_dir, filename)

@app.route('/api/quiz_data/<filename>')
def get_quiz_data(filename):
    # Only allow .json files from the quizzes directory
    if not filename.endswith('.json'):
        return "Invalid file type", 400
    quizzes_dir = os.path.join(app.static_folder, 'quizzes')
    return send_from_directory(quizzes_dir, filename)

@app.route('/api/generate_quiz', methods=['POST'])
@limiter.limit("10 per minute")
def generate_quiz():
    try:
        data = request.json
        kb_filenames = data.get('kb_filenames')
        mode = data.get('mode', 'smart').lower()
        quiz_title = data.get('quiz_title', 'Generated Quiz')
        if not kb_filenames or not isinstance(kb_filenames, list):
            return jsonify({'error': 'kb_filenames (list) is required'}), 400
        # Gather all text from KB(s)
        all_chunks = []
        for kb_filename in kb_filenames:
            kb_path = os.path.join(app.config['UPLOAD_FOLDER'], kb_filename)
            if not os.path.exists(kb_path):
                return jsonify({'error': f'Knowledge base not found: {kb_filename}'}), 404
            with open(kb_path, 'r', encoding='utf-8') as f:
                knowledge = json.load(f)
                all_chunks.extend(chunk['text'] for chunk in knowledge.get('chunks', []))
        context = '\n\n'.join(all_chunks)
        # Compose prompt for OpenAI
        if mode == 'smart':
            prompt = f"""Generate a quiz in JSON format (as a Python list of dicts, no extra text) based ONLY on the following document content. Each question should be an MCQ or True/False, and use this format:
[{{'type': 'mcq' or 'tf', 'question': ..., 'options': [...], 'correct': ..., 'difficulty': ..., 'category': ..., 'points': ..., 'explanation': ...}}, ...]
Document content:\n{context}\n\nGenerate 10-20 questions, covering a range of topics and difficulty levels."""
        else:  # smartplus
            prompt = f"""Generate a quiz in JSON format (as a Python list of dicts, no extra text) based on the following document content AND any relevant public domain knowledge. Each question should be an MCQ or True/False, and use this format:
[{{'type': 'mcq' or 'tf', 'question': ..., 'options': [...], 'correct': ..., 'difficulty': ..., 'category': ..., 'points': ..., 'explanation': ...}}, ...]
Document content:\n{context}\n\nGenerate 10-20 questions, covering a range of topics and difficulty levels."""
        # Call OpenAI
        ai_response = get_ai_response(prompt, model="gpt-4")
        # Try to parse the response as JSON
        try:
            quiz_data = json.loads(ai_response)
        except Exception as e:
            # Try to extract JSON from the response
            import re
            match = re.search(r'\[.*\]', ai_response, re.DOTALL)
            if match:
                try:
                    quiz_data = json.loads(match.group(0))
                except Exception as e2:
                    app.logger.error(f"Error parsing AI quiz JSON: {str(e2)}\n{ai_response}")
                    return jsonify({'error': 'Failed to parse AI response as JSON', 'raw': ai_response}), 500
            else:
                app.logger.error(f"No JSON found in AI response: {ai_response}")
                return jsonify({'error': 'No JSON found in AI response', 'raw': ai_response}), 500
        # Save quiz file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        quiz_filename = f"quiz_{timestamp}.json"
        quiz_path = os.path.join(app.static_folder, 'data', quiz_filename)
        with open(quiz_path, 'w', encoding='utf-8') as f:
            json.dump(quiz_data, f, ensure_ascii=False, indent=2)
        # Update quiz_index.json
        quiz_index_path = os.path.join(app.static_folder, 'data', 'quiz_index.json')
        try:
            with open(quiz_index_path, 'r', encoding='utf-8') as f:
                quiz_index = json.load(f)
        except Exception:
            quiz_index = []
        quiz_index.append({'file': quiz_filename, 'title': quiz_title})
        with open(quiz_index_path, 'w', encoding='utf-8') as f:
            json.dump(quiz_index, f, ensure_ascii=False, indent=2)
        return jsonify({'success': True, 'file': quiz_filename, 'title': quiz_title})
    except Exception as e:
        app.logger.error(f"Error in generate_quiz: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

if __name__ == '__main__':
    # Get port from environment variable or use default
    port = int(os.getenv('PORT', 5000))
    # Run the app
    app.run(host='0.0.0.0', port=port, debug=True) 