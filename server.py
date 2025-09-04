#!/usr/bin/env python3
"""
Zap Suite Backend Server
Handles test execution and provides API endpoints for the GUI
"""

import os
import json
import time
import yaml
import subprocess
import tempfile
import asyncio
import concurrent.futures
import uuid
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Global configuration
CONFIG_FILE = 'test-suite-config.yaml'
config = None

def load_config():
    """Load configuration from YAML file"""
    global config
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = yaml.safe_load(f)
        return True
    except Exception as e:
        print(f"Error loading config: {e}")
        return False

def extract_json_from_output(raw_output):
    """Extract clean JSON from wingman output, removing spinner noise and extracting from backticks"""
    if not raw_output:
        return None
    
    try:
        # Remove ANSI escape sequences and spinner characters
        import re
        cleaned = re.sub(r'\x1b\[[0-9;]*[mK]', '', raw_output)  # Remove ANSI escape sequences
        cleaned = re.sub(r'[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]', '', cleaned)  # Remove spinner characters
        cleaned = re.sub(r'Thinking\.\.\.', '', cleaned)  # Remove "Thinking..."
        cleaned = re.sub(r'Tool \w+ execution time: \d+ms', '', cleaned)  # Remove tool execution times
        cleaned = re.sub(r'\n+', '\n', cleaned)  # Normalize newlines
        
        # Look for JSON content in backticks
        json_match = re.search(r'```json\s*(.*?)\s*```', cleaned, re.DOTALL)
        if json_match:
            return json_match.group(1).strip()
        
        # Fallback: look for JSON content without backticks
        json_match = re.search(r'\{[\s\S]*"analysis_results"[\s\S]*\}', cleaned)
        if json_match:
            return json_match.group(0).strip()
            
        return None
    except Exception as e:
        print(f"Error extracting JSON: {e}")
        return None

def extract_tool_analytics(raw_output):
    """Extract tool execution analytics from raw output"""
    if not raw_output:
        return {}
    
    try:
        import re
        analytics = {
            "tools_executed": [],
            "total_execution_time": 0,
            "tool_count": 0
        }
        
        # Find all tool execution patterns
        tool_pattern = r'Tool (\w+) execution time: (\d+)ms'
        matches = re.findall(tool_pattern, raw_output)
        
        for tool_name, execution_time in matches:
            execution_time_ms = int(execution_time)
            analytics["tools_executed"].append({
                "tool": tool_name,
                "execution_time_ms": execution_time_ms,
                "execution_time_s": round(execution_time_ms / 1000, 2)
            })
            analytics["total_execution_time"] += execution_time_ms
            analytics["tool_count"] += 1
        
        analytics["total_execution_time_s"] = round(analytics["total_execution_time"] / 1000, 2)
        
        return analytics
    except Exception as e:
        print(f"Error extracting tool analytics: {e}")
        return {}

def get_input_files(inputs_path):
    """Get all .txt files from inputs directory"""
    try:
        inputs_dir = Path(inputs_path)
        return [f.name for f in inputs_dir.glob('*.txt')]
    except Exception as e:
        print(f"Error getting input files: {e}")
        return []

def run_wingman_test(repo_path, input_file_path, inputs_path, output_path, run_number):
    """Run a single wingman test with timing"""
    start_time = time.time()
    
    try:
        # Generate unique session ID for this entire test run
        session_id = str(uuid.uuid4())
        
        # Set up environment variables
        env = os.environ.copy()
        env['PERPLEXITY_API_KEY'] = config['perplexity_key']
        env['BWM_CODE_CONTEXT_BIN_PATH'] = '/Users/sarangsharma/code/code-context/modules/code-context/code-context'
        
        # Create index if needed - using the same session ID
        index_path = None
        create_index_cmd = [
            env['BWM_CODE_CONTEXT_BIN_PATH'],
            'create_index',
            '-r',
            repo_path
        ]
        
        # Run create_index
        try:
            result = subprocess.run(
                create_index_cmd,
                cwd=repo_path,
                env=env,
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode == 0:
                # Parse index path from JSON output
                try:
                    output_json = json.loads(result.stdout)
                    if 'output' in output_json and len(output_json['output']) > 0:
                        index_path = output_json['output'][0].get('index_path')
                    else:
                        # Fallback to parsing stdout for index_path
                        for line in result.stdout.split('\n'):
                            if 'INDEX_PATH=' in line:
                                index_path = line.split('INDEX_PATH=')[1].strip()
                                break
                except:
                    # Fallback to parsing stdout for index_path
                    for line in result.stdout.split('\n'):
                        if 'INDEX_PATH=' in line:
                            index_path = line.split('INDEX_PATH=')[1].strip()
                            break
        except Exception as e:
            print(f"Warning: create_index failed: {e}")
        
        if index_path:
            env['BWM_CODE_CONTEXT_INDEX'] = index_path
        
        # Use full path to input file
        full_input_path = os.path.join(inputs_path, input_file_path)
        
        # Run wingman test
        wingman_cmd = [
            config['wingman_binary_path'],
            '-v',  # Add verbose flag
            '-c', config['wingman_config_path'],
            '-p', full_input_path,
            '-s', session_id
        ]
        
        # Debug: Log the command and environment
        print(f"Executing wingman command: {' '.join(wingman_cmd)}")
        print(f"Working directory: {repo_path}")
        print(f"Input file path: {full_input_path}")
        print(f"Environment variables:")
        for key in ['PERPLEXITY_API_KEY', 'BWM_CODE_CONTEXT_BIN_PATH', 'BWM_CODE_CONTEXT_INDEX']:
            print(f"  {key}={env.get(key, 'NOT SET')}")
        
        result = subprocess.run(
            wingman_cmd,
            cwd=repo_path,
            env=env,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        # Debug: Log the result
        print(f"Return code: {result.returncode}")
        print(f"STDOUT: {result.stdout[:500]}...")
        print(f"STDERR: {result.stderr[:500]}...")
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Parse JSON output - extract content from backticks
        try:
            # Extract JSON from backticks
            clean_json = extract_json_from_output(result.stdout)
            if clean_json:
                output = json.loads(clean_json)
            else:
                output = {"raw_output": result.stdout}
        except Exception as e:
            output = {"raw_output": result.stdout, "parse_error": str(e)}
        
        # Extract tool analytics from raw output
        tool_analytics = extract_tool_analytics(result.stdout)
        
        return {
            "success": result.returncode == 0,
            "output": output,
            "raw_output": result.stdout,
            "raw_error": result.stderr,
            "tool_analytics": tool_analytics,
            "error": result.stderr if result.returncode != 0 else None,
            "duration": duration,
            "timestamp": datetime.now().isoformat(),
            "session_id": session_id,
            "commands": {
                "create_index": " ".join(create_index_cmd) if create_index_cmd else None,
                "wingman": " ".join(wingman_cmd),
                "index_path": index_path
            }
        }
        
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "output": {},
            "error": "Test timed out after 5 minutes",
            "duration": 300,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "output": {},
            "error": str(e),
            "duration": time.time() - start_time,
            "timestamp": datetime.now().isoformat()
        }

@app.route('/')
def serve_index():
    """Serve the main HTML file"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_from_directory('.', filename)

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get configuration"""
    if not config and not load_config():
        return jsonify({"error": "Failed to load configuration"}), 500
    
    return jsonify(config)

@app.route('/api/input-files', methods=['POST'])
def get_input_files_api():
    """Get input files from a directory"""
    data = request.json
    inputs_path = data.get('inputs_path')
    
    if not inputs_path:
        return jsonify({"error": "inputs_path is required"}), 400
    
    try:
        files = get_input_files(inputs_path)
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/run-test', methods=['POST'])
def run_test():
    """Run a single test"""
    if not config and not load_config():
        return jsonify({"error": "Configuration not loaded"}), 500
    
    data = request.json
    required_fields = ['repo_path', 'input_file', 'inputs_path', 'output_path', 'run_number']
    
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    result = run_wingman_test(
        data['repo_path'],
        data['input_file'],
        data['inputs_path'],
        data['output_path'],
        data['run_number']
    )
    
    return jsonify(result)

def run_test_parallel(args):
    """Wrapper function for parallel execution"""
    repo_path, input_file, inputs_path, output_path, run_number = args
    return run_wingman_test(repo_path, input_file, inputs_path, output_path, run_number)

@app.route('/api/run-all', methods=['POST'])
def run_all_tests():
    """Run all tests with parallel execution within each repository (sequentially by repo)"""
    if not config and not load_config():
        return jsonify({"error": "Configuration not loaded"}), 500
    
    results = []
    max_workers = config.get('parallel_workers', 3)
    
    # Process each repository sequentially to avoid BWM_CODE_CONTEXT_INDEX conflicts
    for repo in config['repos']:
        inputs_path = repo['inputs_path']
        input_files = get_input_files(inputs_path)
        
        # Prepare test tasks for this repository only
        repo_test_tasks = []
        for input_file in input_files:
            for run in range(1, config['run_count'] + 1):
                repo_test_tasks.append((
                    repo['repo_path'],
                    input_file,
                    inputs_path,
                    repo['output_path'],
                    run
                ))
        
        # Execute tests for this repository in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {executor.submit(run_test_parallel, task): task for task in repo_test_tasks}
            
            for future in concurrent.futures.as_completed(future_to_task):
                task = future_to_task[future]
                repo_path, input_file, inputs_path, output_path, run_number = task
                
                try:
                    result = future.result()
                    results.append({
                        "repo": repo_path,
                        "input_file": input_file,
                        "run_number": run_number,
                        **result
                    })
                except Exception as exc:
                    results.append({
                        "repo": repo_path,
                        "input_file": input_file,
                        "run_number": run_number,
                        "success": False,
                        "output": {},
                        "error": str(exc),
                        "duration": 0,
                        "timestamp": datetime.now().isoformat()
                    })
    
    return jsonify({"results": results})

if __name__ == '__main__':
    if load_config():
        print("Configuration loaded successfully")
        print(f"Found {len(config.get('repos', []))} repositories")
        for repo in config.get('repos', []):
            inputs = get_input_files(repo['inputs_path'])
            print(f"  {repo['repo_path']}: {len(inputs)} input files")
    else:
        print("Warning: Could not load configuration")
    
    app.run(debug=True, host='0.0.0.0', port=9000)
