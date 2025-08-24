import json
import os
from pathlib import Path

def is_quiz_file(filename):
    """Check if file is a JSON quiz file."""
    return filename.endswith('.json') and not filename == 'quiz_index.json'

def convert_to_flat_array(quiz_data):
    """Convert quiz data to flat array format with default values."""
    if isinstance(quiz_data, list):
        return quiz_data
    if isinstance(quiz_data, dict):
        possible_keys = ['questions', 'quiz', 'items', 'data']
        for key in possible_keys:
            if key in quiz_data and isinstance(quiz_data[key], list):
                return quiz_data[key]
    return []

def infer_type_and_answer(q):
    """Infer question type and correct answer for compatibility with the app."""
    options = q.get('options', [])
    correct_answer = q.get('correct_answer', '')
    qtype = q.get('type', '')
    # Infer type
    if not qtype:
        if isinstance(options, list) and len(options) >= 3:
            qtype = 'mcq'
        elif isinstance(options, list) and len(options) == 2 and all(opt.lower() in ['true', 'false'] for opt in options):
            qtype = 'tf'
        else:
            qtype = 'mcq'  # fallback
    # Fix correct_answer
    if not correct_answer:
        # Try to infer from 'answer' or 'correct' fields
        if 'answer' in q:
            correct_answer = q['answer']
        elif 'correct' in q:
            correct_answer = q['correct']
        else:
            # fallback: first option
            if isinstance(options, list) and options:
                correct_answer = options[0]
            else:
                correct_answer = ''
    # For tf, ensure options are ["True", "False"]
    if qtype == 'tf':
        options = ["True", "False"]
        if str(correct_answer).lower() in ['true', 'false']:
            correct_answer = correct_answer.capitalize()
        else:
            correct_answer = "True"  # fallback
    return qtype, options, correct_answer

def process_quiz_file(file_path):
    """Process a single quiz file and convert it to the correct format."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Convert to flat array
        flat_array = convert_to_flat_array(data)
        
        # Ensure each question has required fields with defaults
        processed_questions = []
        for q in flat_array:
            if not isinstance(q, dict):
                continue
                
            qtype, options, correct_answer = infer_type_and_answer(q)
            
            processed_q = {
                'question': q.get('question', ''),
                'options': options,
                'correct_answer': correct_answer,
                'explanation': q.get('explanation', ''),
                'category': q.get('category', 'General'),
                'difficulty': q.get('difficulty', 'medium'),
                'type': qtype
            }
            
            # Ensure options is a list of 4 items
            if not isinstance(processed_q['options'], list):
                processed_q['options'] = []
            while len(processed_q['options']) < 4:
                processed_q['options'].append('')
            
            processed_questions.append(processed_q)
        
        # Save the processed file with '_processed' suffix
        output_path = str(file_path).replace('.json', '_processed.json')
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(processed_questions, f, indent=2, ensure_ascii=False)
        
        print(f"Processed {file_path.name} -> {Path(output_path).name}")
        return True
        
    except Exception as e:
        print(f"Error processing {file_path.name}: {str(e)}")
        return False

def main():
    quiz_dir = Path(__file__).parent
    processed_count = 0
    error_count = 0
    
    print("Starting quiz file conversion...")
    
    for file_path in quiz_dir.glob('*.json'):
        if is_quiz_file(file_path.name):
            if process_quiz_file(file_path):
                processed_count += 1
            else:
                error_count += 1
    
    print(f"\nConversion complete!")
    print(f"Successfully processed: {processed_count} files")
    print(f"Errors encountered: {error_count} files")

if __name__ == '__main__':
    main() 