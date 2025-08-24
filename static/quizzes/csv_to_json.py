import csv
import json

input_csv = 'questions.csv'   # Your exported CSV file
output_json = 'questions.json'

questions = []
with open(input_csv, newline='', encoding='utf-8-sig') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        qtype = row.get('type', '').strip().lower()
        question_text = row.get('question', '').strip()
        if not qtype or not question_text:
            print(f"Skipping row with missing type or question: {row}")
            continue
        feedback = {}
        if row.get('feedback_correct', '').strip():
            feedback['correct'] = row['feedback_correct'].strip()
        if row.get('feedback_incorrect', '').strip():
            feedback['incorrect'] = row['feedback_incorrect'].strip()
        if row.get('feedback_partial', '').strip():
            feedback['partial'] = row['feedback_partial'].strip()
        if row.get('feedback.detailed', '').strip():
            feedback['detailed'] = row['feedback.detailed'].strip()
        # Get points as integer, default to 0 if missing or invalid
        try:
            points = int(row.get('points', '0') or 0)
        except Exception:
            points = 0
        # Parse partial credit column (comma-separated for MCQ, fill)
        partial = []
        if row.get('partial'):
            if qtype == 'mcq':
                # partial = list of indices (0-based)
                partial = [int(x.strip()) for x in row['partial'].split(',') if x.strip().isdigit()]
            elif qtype == 'fill':
                # partial = list of acceptable answers (case-insensitive)
                partial = [x.strip() for x in row['partial'].split(',') if x.strip()]
        question = {
            'type': qtype,
            'question': question_text,
            'difficulty': row.get('difficulty', '').strip(),
            'category': row.get('category', '').strip(),
            'points': points,
            'feedback': feedback
        }
        # Only include 'partial' if valid and non-empty
        if qtype == 'mcq' and partial and all(isinstance(x, int) for x in partial):
            question['partial'] = partial
        elif qtype == 'fill' and partial and all(isinstance(x, str) for x in partial):
            question['partial'] = partial
        # Only include 'hint' if present
        if row.get('hint'):
            question['hint'] = row['hint'].strip()
        if qtype == 'mcq':
            options = [row.get(f'option{i}', '').strip() for i in range(1, 5)]
            options = [opt for opt in options if opt]  # Remove empty options
            if not options or not row.get('correct'):
                print(f"Skipping MCQ with missing options or correct: {row}")
                continue
            try:
                correct_index = int(row['correct']) - 1
                if correct_index < 0 or correct_index >= len(options):
                    print(f"Skipping MCQ with invalid correct index: {row}")
                    continue
            except Exception as e:
                print(f"Skipping MCQ with invalid correct value: {row}")
                continue
            question['options'] = options
            question['correct'] = correct_index
        elif qtype == 'tf':
            correct_val = row.get('correct', '').strip().upper()
            if correct_val not in ['TRUE', 'FALSE']:
                print(f"Skipping TF with invalid correct value: {row}")
                continue
            question['correct'] = (correct_val == 'TRUE')
        elif qtype == 'fill':
            correct_ans = row.get('correct', '').strip()
            if not correct_ans:
                print(f"Skipping fill with missing correct answer: {row}")
                continue
            question['correct'] = correct_ans
        else:
            print(f"Skipping unknown type: {row}")
            continue
        questions.append(question)

with open(output_json, 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print(f"Converted {input_csv} to {output_json} ({len(questions)} questions)")