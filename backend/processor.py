import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile


def emit_progress(percent: int, message: str = ''):
    data = {'type': 'progress', 'percent': percent, 'message': message}
    print(json.dumps(data), flush=True)


def emit_status(message: str):
    print(json.dumps({'type': 'status', 'message': message}), flush=True)


def find_stem_files(output_dir, base_name):
    root = os.path.join(output_dir, base_name)
    if not os.path.isdir(root):
        return None, None
    vocal_file = None
    instrumental_file = None
    for file_name in os.listdir(root):
        low = file_name.lower()
        if 'vocal' in low and file_name.endswith('.wav'):
            vocal_file = os.path.join(root, file_name)
        if ('no_vocals' in low or 'instrumental' in low or 'accompaniment' in low) and file_name.endswith('.wav'):
            instrumental_file = os.path.join(root, file_name)
    return vocal_file, instrumental_file


def main():
    parser = argparse.ArgumentParser(description='Demucs two-stem audio processor')
    parser.add_argument('--input', required=True)
    parser.add_argument('--vocal', required=True)
    parser.add_argument('--instrumental', required=True)
    parser.add_argument('--use-gpu', action='store_true')
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        emit_status('Input file not found')
        sys.exit(1)

    use_gpu = args.use_gpu
    device = 'cuda' if use_gpu else 'cpu'

    emit_status('Starting Demucs separation')
    emit_progress(0, 'Preparing model')

    temp_dir = tempfile.mkdtemp(prefix='demucs_')
    try:
        cmd = [sys.executable, '-m', 'demucs', '--two-stems', '-d', device, '--out', temp_dir, args.input]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        if process.stdout:
            for line in process.stdout:
                text = line.strip()
                if not text:
                    continue
                if 'loading' in text.lower() or 'model' in text.lower():
                    emit_progress(10, text)
                elif 'separating' in text.lower() or 'separate' in text.lower():
                    emit_progress(30, text)
                elif 'saving' in text.lower() or 'wrote' in text.lower():
                    emit_progress(70, text)
                else:
                    emit_status(text)
        exit_code = process.wait()
        if exit_code != 0:
            emit_status(f'Demucs exited with code {exit_code}')
            sys.exit(exit_code)

        base_name = os.path.splitext(os.path.basename(args.input))[0]
        vocal_file, instrumental_file = find_stem_files(temp_dir, base_name)
        if not vocal_file or not instrumental_file:
            emit_status('Failed to locate stem files from Demucs output')
            sys.exit(1)

        shutil.copy2(vocal_file, args.vocal)
        shutil.copy2(instrumental_file, args.instrumental)
        emit_progress(100, 'Separation complete')
        emit_status('Stem files written')
        sys.exit(0)
    finally:
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass


if __name__ == '__main__':
    main()
