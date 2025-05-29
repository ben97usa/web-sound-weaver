import os
import subprocess
from flask import Flask, render_template, request, send_file, Response, stream_with_context

app = Flask(__name__)
# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'separated'
# Ensure upload/output directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/separate', methods=['POST'])
def separate():
    file = request.files.get('file')
    if not file:
        return "No file uploaded.", 400
    # Save uploaded file
    filename = file.filename
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    # Prepare output folder for this track
    track_name = os.path.splitext(os.path.basename(filename))[0]
    track_output_dir = os.path.join(OUTPUT_FOLDER, 'htdemucs', track_name)
    if os.path.exists(track_output_dir):
        # Remove previous output if exists to avoid conflicts
        import shutil
        shutil.rmtree(track_output_dir)

    # Demucs command: using two-stems (vocals vs. instrumental)
    cmd = ['python3', '-m', 'demucs', '--two-stems', 'vocals', '--out', OUTPUT_FOLDER, filepath]

    def generate():
        # Run Demucs subprocess and stream output
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1, universal_newlines=True)
        # Immediately yield 0% to start progress
        yield "data: 0\n\n"
        for line in process.stdout:
            # Look for percentage progress in Demucs output
            if '%' in line:
                try:
                    percent_text = line.strip().split('%')[0]
                    percent_text = percent_text.split()[-1]  # last token before '%'
                    percent_val = int(float(percent_text))
                except Exception:
                    percent_val = None
                if percent_val is not None:
                    # Cap at 99% until done (to avoid premature 100%)
                    if percent_val > 99:
                        percent_val = 99
                    yield f"data: {percent_val}\n\n"
        process.wait()
        if process.returncode != 0:
            # In lỗi ra console để debug
            for line in process.stdout:
                print("ERROR LINE:", line)
            yield "data: ERROR\n\n"
            return

        # On success, rename output files to include original track name
        vocal_path = os.path.join(track_output_dir, 'vocals.wav')
        inst_path = os.path.join(track_output_dir, 'no_vocals.wav')
        new_vocal_name = f"{track_name}_vocals.wav"
        new_inst_name = f"{track_name}_instrumental.wav"
        try:
            os.replace(vocal_path, os.path.join(track_output_dir, new_vocal_name))
        except FileNotFoundError:
            pass
        try:
            os.replace(inst_path, os.path.join(track_output_dir, new_inst_name))
        except FileNotFoundError:
            pass
        # Send final DONE message with filenames (use '|' as delimiter)
        yield f"data: DONE|{new_vocal_name}|{new_inst_name}\n\n"
    # Stream the response as an event-stream (Server-Sent Events)
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/download/<path:filename>')
def download(filename):
    # Only allow downloading files from the separated/htdemucs directory
    base_dir = os.path.join(OUTPUT_FOLDER, 'htdemucs')
    for root, dirs, files in os.walk(base_dir):
        if filename in files:
            file_path = os.path.join(root, filename)
            # Send file with original filename for download
            return send_file(file_path, as_attachment=True, download_name=filename)
    return "File not found", 404

if __name__ == '__main__':
    # Note: Ensure Demucs is installed in the environment (e.g., pip install demucs)
    app.run(debug=True)
