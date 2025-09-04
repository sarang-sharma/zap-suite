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
        
        # Fallback: look for JSON content without backticks (try both formats)
        json_match = re.search(r'\{[\s\S]*"analysis_results"[\s\S]*\}', cleaned)
        if json_match:
            return json_match.group(0).strip()
        
        # Try the new evaluation_results format
        json_match = re.search(r'\{[\s\S]*"evaluation_results"[\s\S]*\}', cleaned)
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

def checkout_branch(repo_path, branch_name):
    """Checkout the specified branch with error handling"""
    try:
        print(f"Checking out branch '{branch_name}' in {repo_path}")
        
        # First, check if the branch exists
        result = subprocess.run(
            ['git', 'branch', '-a'],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return False, f"Failed to list branches: {result.stderr}"
        
        # Check if branch exists (locally or remotely)
        branches_output = result.stdout
        local_branch_exists = f"  {branch_name}" in branches_output or f"* {branch_name}" in branches_output
        remote_branch_exists = f"remotes/origin/{branch_name}" in branches_output
        
        if not local_branch_exists and not remote_branch_exists:
            return False, f"Branch '{branch_name}' does not exist in repository"
        
        # Try to checkout the branch
        result = subprocess.run(
            ['git', 'checkout', branch_name],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            print(f"Successfully checked out branch '{branch_name}'")
            return True, f"Successfully checked out branch '{branch_name}'"
        else:
            return False, f"Failed to checkout branch '{branch_name}': {result.stderr}"
            
    except subprocess.TimeoutExpired:
        return False, f"Timeout while checking out branch '{branch_name}'"
    except Exception as e:
        return False, f"Error checking out branch '{branch_name}': {str(e)}"

def save_raw_output(output_path, repo_name, input_file, run_number, stdout, stderr, success):
    """Save raw output and error to files in the output directory"""
    try:
        # Create output directory if it doesn't exist
        output_dir = Path(output_path)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        repo_clean = Path(repo_name).name  # Get just the repo name, not full path
        input_clean = Path(input_file).stem  # Remove extension
        
        base_filename = f"{repo_clean}_{input_clean}_run{run_number}_{timestamp}"
        
        # Save stdout
        stdout_file = output_dir / f"{base_filename}_stdout.txt"
        with open(stdout_file, 'w', encoding='utf-8') as f:
            f.write(f"# Raw Output - {datetime.now().isoformat()}\n")
            f.write(f"# Repository: {repo_name}\n")
            f.write(f"# Input File: {input_file}\n")
            f.write(f"# Run Number: {run_number}\n")
            f.write(f"# Success: {success}\n")
            f.write(f"# {'='*50}\n\n")
            f.write(stdout or "No stdout output")
        
        # Save stderr if exists
        stderr_file = None
        if stderr:
            stderr_file = output_dir / f"{base_filename}_stderr.txt"
            with open(stderr_file, 'w', encoding='utf-8') as f:
                f.write(f"# Error Output - {datetime.now().isoformat()}\n")
                f.write(f"# Repository: {repo_name}\n")
                f.write(f"# Input File: {input_file}\n")
                f.write(f"# Run Number: {run_number}\n")
                f.write(f"# Success: {success}\n")
                f.write(f"# {'='*50}\n\n")
                f.write(stderr)
        
        print(f"Raw output saved to: {stdout_file}")
        if stderr_file:
            print(f"Error output saved to: {stderr_file}")
            
        return {
            "stdout_file": str(stdout_file),
            "stderr_file": str(stderr_file) if stderr_file else None
        }
        
    except Exception as e:
        print(f"Warning: Failed to save raw output: {e}")
        return None

def get_input_files(inputs_path):
    """Get all .txt files from inputs directory"""
    try:
        inputs_dir = Path(inputs_path)
        return [f.name for f in inputs_dir.glob('*.txt')]
    except Exception as e:
        print(f"Error getting input files: {e}")
        return []

def run_wingman_test(repo_path, input_file_path, inputs_path, output_path, run_number, branch_name=None):
    """Run a single wingman test with timing and branch checkout"""
    start_time = time.time()
    stdout_output = ""
    stderr_output = ""
    
    try:
        # Checkout branch if specified
        if branch_name:
            branch_success, branch_message = checkout_branch(repo_path, branch_name)
            if not branch_success:
                error_msg = f"Branch checkout failed: {branch_message}"
                # Still save raw output even for branch failures
                save_raw_output(output_path, repo_path, input_file_path, run_number, "", error_msg, False)
                return {
                    "success": False,
                    "output": {},
                    "raw_output": "",
                    "raw_error": error_msg,
                    "tool_analytics": {},
                    "error": error_msg,
                    "duration": time.time() - start_time,
                    "timestamp": datetime.now().isoformat(),
                    "branch_checkout": {"success": False, "message": branch_message}
                }
        
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
        
        stdout_output = result.stdout or ""
        stderr_output = result.stderr or ""
        
        # Debug: Log the result
        print(f"Return code: {result.returncode}")
        print(f"STDOUT: {stdout_output[:500]}...")
        print(f"STDERR: {stderr_output[:500]}...")
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Always save raw output to files
        saved_files = save_raw_output(output_path, repo_path, input_file_path, run_number, stdout_output, stderr_output, result.returncode == 0)
        
        # Parse JSON output - extract content from backticks
        try:
            # Extract JSON from backticks
            clean_json = extract_json_from_output(stdout_output)
            if clean_json:
                output = json.loads(clean_json)
            else:
                output = {"raw_output": stdout_output}
        except Exception as e:
            output = {"raw_output": stdout_output, "parse_error": str(e)}
        
        # Extract tool analytics from raw output
        tool_analytics = extract_tool_analytics(stdout_output)
        
        response = {
            "success": result.returncode == 0,
            "output": output,
            "raw_output": stdout_output,
            "raw_error": stderr_output,
            "tool_analytics": tool_analytics,
            "error": stderr_output if result.returncode != 0 else None,
            "duration": duration,
            "timestamp": datetime.now().isoformat(),
            "session_id": session_id,
            "commands": {
                "create_index": " ".join(create_index_cmd) if create_index_cmd else None,
                "wingman": " ".join(wingman_cmd),
                "index_path": index_path
            }
        }
        
        # Add branch checkout info if applicable
        if branch_name:
            response["branch_checkout"] = {"success": True, "message": f"Successfully checked out branch '{branch_name}'"}
        
        # Add saved file info
        if saved_files:
            response["saved_files"] = saved_files
        
        return response
        
    except subprocess.TimeoutExpired:
        # Save raw output even for timeouts
        error_msg = "Test timed out after 5 minutes"
        save_raw_output(output_path, repo_path, input_file_path, run_number, stdout_output, error_msg, False)
        return {
            "success": False,
            "output": {},
            "raw_output": stdout_output,
            "raw_error": error_msg,
            "tool_analytics": {},
            "error": error_msg,
            "duration": 300,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        # Save raw output even for exceptions
        error_msg = str(e)
        save_raw_output(output_path, repo_path, input_file_path, run_number, stdout_output, error_msg, False)
        return {
            "success": False,
            "output": {},
            "raw_output": stdout_output,
            "raw_error": error_msg,
            "tool_analytics": {},
            "error": error_msg,
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
    
    # Find branch name for the repository from config
    branch_name = None
    for repo in config.get('repos', []):
        if repo['repo_path'] == data['repo_path']:
            branch_name = repo.get('branch')
            break
    
    result = run_wingman_test(
        data['repo_path'],
        data['input_file'],
        data['inputs_path'],
        data['output_path'],
        data['run_number'],
        branch_name
    )
    
    return jsonify(result)

def run_test_parallel(args):
    """Wrapper function for parallel execution"""
    repo_path, input_file, inputs_path, output_path, run_number, branch_name = args
    return run_wingman_test(repo_path, input_file, inputs_path, output_path, run_number, branch_name)

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
        branch_name = repo.get('branch')  # Get branch name for this repo
        for input_file in input_files:
            for run in range(1, config['run_count'] + 1):
                repo_test_tasks.append((
                    repo['repo_path'],
                    input_file,
                    inputs_path,
                    repo['output_path'],
                    run,
                    branch_name
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
