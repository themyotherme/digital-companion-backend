from flask import Flask, send_from_directory, send_file, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import json
import traceback
import PyPDF2
import hashlib
from openai import OpenAI
from werkzeug.utils import secure_filename
from datetime import datetime
import re
import time

# Load environment variables
load_dotenv()

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

def get_ai_response(prompt, model="gpt-3.5-turbo"):
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.7
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        app.logger.error(f"Error getting AI response: {str(e)}")
        raise

# Use correct static folder path
STATIC_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), 'static'))
app = Flask(__name__, static_folder=STATIC_FOLDER)
CORS(app, resources={r"/*": {"origins": "*"}})

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'json'}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB max file size

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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

def process_text_file(file):
    content = file.read().decode('utf-8')
    return {"content": content}

def process_pdf_file(file):
    pdf_reader = PyPDF2.PdfReader(file)
    text = ""
    for page in pdf_reader.pages:
        text += page.extract_text() + "\n"
    return {"content": text}

def process_json_file(file):
    try:
        content = json.load(file)
        return content
    except json.JSONDecodeError:
        return {"content": ""}

@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        if not allowed_file(file.filename):
            return jsonify({"error": f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
        
        original_filename = secure_filename(file.filename)
        file_hash = compute_file_hash(file)
        kb_filename = f"{file_hash}-knowledge.json"
        kb_path = os.path.join(app.config['UPLOAD_FOLDER'], kb_filename)

        index_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kb_index.json')
        
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                kb_index = json.load(f)
        else:
            kb_index = []

        if any(item['hash_name'] == kb_filename for item in kb_index):
            existing_item = next(item for item in kb_index if item['hash_name'] == kb_filename)
            return jsonify({
                "success": True,
                "message": f"Knowledge base for '{existing_item['original_name']}' already exists.",
                "knowledge_base": kb_filename
            })

        file_extension = original_filename.rsplit('.', 1)[1].lower()
        if file_extension == 'txt':
            knowledge = process_text_file(file)
        elif file_extension == 'pdf':
            knowledge = process_pdf_file(file)
        elif file_extension == 'json':
            knowledge = process_json_file(file)
        
        with open(kb_path, 'w', encoding='utf-8') as f:
            json.dump(knowledge, f, ensure_ascii=False, indent=2)

        kb_index.append({
            "hash_name": kb_filename,
            "original_name": original_filename,
            "upload_date": datetime.utcnow().isoformat() + 'Z'
        })
        
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(kb_index, f, ensure_ascii=False, indent=4)

        return jsonify({
            "success": True,
            "message": f"Knowledge base for '{original_filename}' created successfully.",
            "knowledge_base": kb_filename
        })
    except Exception as e:
        app.logger.error(f"Error in upload endpoint: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        required_fields = ['role', 'mood', 'mode', 'question']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        
        mode = data['mode'].lower()
        question = data['question']
        kb_files = data.get('knowledge_bases', [])

        if not kb_files and 'knowledge_base' in data:
            kb_files = [data['knowledge_base']]

        if mode in ['local', 'smart'] and not kb_files:
            return jsonify({"error": "Please select a knowledge base for this mode."}), 400

        context = "No knowledge base provided."
        if mode in ['Smart', 'SmartPlus'] and kb_files:
            app.logger.info(f"Using knowledge bases: {kb_files}")
            context_parts = []
            for h_name in kb_files:
                # --- BEGIN FIX: Extract hash instead of just validating ---
                match = re.search(r'^[a-f0-9]{64}', str(h_name))
                if not match:
                    app.logger.warning(f"Could not find a valid hash in kb filename: {h_name}")
                    continue
                actual_hash = match.group(0)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{actual_hash}-knowledge.json")
                # --- END FIX ---
                
                if os.path.exists(file_path):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        knowledge = json.load(f)
                    context_parts.append(knowledge.get('content', ''))
            
            if context_parts:
                context = "Information from uploaded document(s):\n" + "\n\n".join(context_parts)

        if mode == 'local':
            if context:
                return jsonify({"response": context})
            else:
                return jsonify({"response": "I couldn't find a specific answer in the selected knowledge base(s)."}), 200

        elif mode == 'smart':
            # This is the new implementation for Smart mode
            if not context:
                return jsonify({"response": "I couldn't find any relevant information in the document to answer your question."})
            
            prompt = f"""Based *only* on the following information, please answer the user's question. Do not use any external knowledge. If the answer is not contained in the provided text, say so.

            Provided Information:
            {context}

            Question: {question}
            """
            response = get_ai_response(prompt, model="gpt-3.5-turbo")
            return jsonify({"response": response})

        elif mode == 'smartplus':
            prompt = f"""As {data['role']} in a {data['mood']} mood, please provide a comprehensive answer to the following question. Use the provided information from uploaded documents as primary context, but feel free to supplement with your general knowledge.

            {context if context else "No specific context from documents was found."}

            Question: {question}
            """
            response = get_ai_response(prompt, model="gpt-4")
            return jsonify({"response": response})

        else:
            return jsonify({"error": f"Invalid mode: {mode}"}), 400

    except Exception as e:
        app.logger.error(f"Error in chat endpoint: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'POST':
        try:
            data = request.json
            return jsonify({"status": "success"})
        except Exception as e:
            app.logger.error(f"Error saving settings: {str(e)}")
            return jsonify({"error": "Error saving settings"}), 500
    else:
        try:
            return jsonify({"settings": {}})
        except Exception as e:
            app.logger.error(f"Error retrieving settings: {str(e)}")
            return jsonify({"error": "Error retrieving settings"}), 500

@app.route('/api/list-uploads')
def list_uploads():
    try:
        index_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kb_index.json')
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                kb_index = json.load(f)
            # Sort by upload date, newest first
            kb_index.sort(key=lambda x: x.get('upload_date', ''), reverse=True)
            return jsonify(kb_index)
        else:
            return jsonify([])
    except Exception as e:
        app.logger.error(f"Error listing uploads: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/delete-upload/<path:filename>', methods=['DELETE'])
def delete_upload(filename):
    try:
        # Extract the hash from the filename to be safe
        match = re.search(r'^[a-f0-9]{64}', str(filename))
        if not match:
            return jsonify({"success": False, "error": "Invalid filename format"}), 400
        
        hash_part = match.group(0)
        kb_filename = f"{hash_part}-knowledge.json"
        
        # Delete the actual knowledge base file
        kb_path = os.path.join(app.config['UPLOAD_FOLDER'], kb_filename)
        if os.path.exists(kb_path):
            os.remove(kb_path)
        
        # Remove the entry from the index
        index_path = os.path.join(app.config['UPLOAD_FOLDER'], 'kb_index.json')
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                kb_index = json.load(f)
            
            # The hash_name in the index includes the `-knowledge.json` suffix
            index_filename_to_match = kb_filename
            kb_index_updated = [item for item in kb_index if item.get('hash_name') != index_filename_to_match]
            
            with open(index_path, 'w', encoding='utf-8') as f:
                json.dump(kb_index_updated, f, ensure_ascii=False, indent=4)
                
        return jsonify({"success": True, "message": f"File {filename} deleted."})

    except Exception as e:
        app.logger.error(f"Error deleting file {filename}: {str(e)}\n{traceback.format_exc()}")
@app.route('/api/generate_quiz', methods=['POST'])
def generate_quiz_route():
    data = request.get_json()
    kb_filenames = data.get('kb_filenames', [])
    quiz_title = data.get('quiz_title', 'New Quiz')

    if not kb_filenames:
        return jsonify({"success": False, "error": "No knowledge base files provided."}), 400

    try:
        # Concatenate content from all selected knowledge bases
        full_text_content = ""
        for h_name in kb_filenames:
            # --- BEGIN FIX: Extract hash instead of just validating ---
            match = re.search(r'^[a-f0-9]{64}', str(h_name))
            if not match:
                app.logger.warning(f"Could not find a valid hash in quiz-gen kb filename: {h_name}")
                continue
            actual_hash = match.group(0)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{actual_hash}-knowledge.json")
            # --- END FIX ---

            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    kb_data = json.load(f)
                    full_text_content += kb_data.get('content', '') + "\n\n"
        
        if not full_text_content.strip():
            return jsonify({"success": False, "error": "The selected knowledge base files are empty."}), 400

        # --- BEGIN FIX: Make quiz generation prompt much stricter ---
        num_questions = max(5, min(25, len(full_text_content.split()) // 200))

        # System prompt with very specific instructions and a clear example
        system_prompt = f"""
You are an expert quiz creator. Your task is to generate a JSON object containing a quiz with exactly {num_questions} questions based on the provided text.

RULES:
1. The output MUST be a single, valid JSON object.
2. The JSON object must have one top-level key: "questions".
3. "questions" must be an array of question objects.
4. Each question object must have the following keys: "question" (string), "options" (an array of 4 strings), and "answer" (a string that exactly matches one of the options).
5. DO NOT include any text, explanations, or markdown formatting outside of the main JSON object.

EXAMPLE JSON FORMAT:
{{
  "questions": [
    {{
      "question": "What is the capital of France?",
      "options": ["London", "Berlin", "Paris", "Madrid"],
      "answer": "Paris"
    }},
    {{
      "question": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "answer": "4"
    }}
  ]
}}

Now, create the quiz based on the following text:
"""
        
        user_prompt = full_text_content
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=0.5,
        )
        
        response_text = response.choices[0].message['content']
        # --- END FIX ---
        
        # Clean the response to ensure it's valid JSON
        # Find the first '{' and the last '}' to extract the JSON object
        start_index = response_text.find('{')
        end_index = response_text.rfind('}')
        if start_index == -1 or end_index == -1:
            raise ValueError("AI response did not contain a valid JSON object.")
        
        json_string = response_text[start_index:end_index+1]
        
        quiz_data = json.loads(json_string)

        # Sanitize quiz title for the filename
        safe_title = re.sub(r'[^a-zA-Z0-9_]', '_', quiz_title)
        quiz_filename = f"quiz_{safe_title}_{int(time.time())}.json"
        quiz_filepath = os.path.join('static', 'quizzes', quiz_filename)

        with open(quiz_filepath, 'w', encoding='utf-8') as f:
            json.dump(quiz_data, f, indent=2)

        return jsonify({"success": True, "file": quiz_filename})
    except json.JSONDecodeError:
        app.logger.error(f"Quiz Generation Failed: AI returned invalid JSON. Response was:\n{response_text}")
        return jsonify({"success": False, "error": "The AI returned an invalid format. Please try again."}), 500
    except Exception as e:
        app.logger.error(f"An unexpected error occurred during quiz generation: {e}")
        return jsonify({"success": False, "error": f"An unexpected error occurred: {str(e)}"}), 500

# --- Serve quizzes and quiz index ---
@app.route('/api/quiz_data/<path:filename>')
def get_quiz_data(filename):
    quizzes_dir = os.path.join(app.static_folder, 'quizzes')
    return send_from_directory(quizzes_dir, filename)

@app.route('/static/quizzes/quiz_index.json')
def serve_quiz_index():
    quizzes_dir = os.path.join(app.static_folder, 'quizzes')
    return send_from_directory(quizzes_dir, 'quiz_index.json')

# --- Serve main app page ---
@app.route('/')
def index():
    index_path = os.path.join(app.static_folder, 'index.html')
    return send_file(index_path)

# --- Serve any static file (JS, CSS, etc.) ---
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

# Add this to prevent caching during development
@app.after_request
def add_header(response):
    print(f"Adding no-cache headers for {request.path}")
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True) 
