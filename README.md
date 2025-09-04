# Zap Suite

A lightweight web-based GUI application for running Wingman tests with timing and statistics tracking.

## Features

- **Web-based interface** - Easy to use in any browser
- **Configuration-driven** - Uses YAML configuration file
- **Timing tracking** - Shows duration for each test run
- **Statistics** - Calculates averages and success rates
- **Multiple runs** - Runs each input multiple times as configured
- **Smart parallel execution** - Repositories run sequentially, tests within each repo run in parallel
- **JSON output display** - Shows results in easy-to-read format
- **Progress tracking** - Visual progress bar during test execution

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Test Suite

Edit `test-suite-config.yaml`:

```yaml
# Wingman Test Suite Configuration
wingman_binary_path: /path/to/wingman/binary
wingman_config_path: /path/to/wingman/config
perplexity_key: your-perplexity-key-here
run_count: 3  # Number of times to run each input
parallel_workers: 3  # Number of parallel test executions

repos:
  - repo_path: /Users/sarangsharma/code/repo1
    inputs_path: /Users/sarangsharma/code/repo1/test-inputs
    output_path: /Users/sarangsharma/code/repo1/test-outputs
  
  - repo_path: /Users/sarangsharma/code/repo2
    inputs_path: /Users/sarangsharma/code/repo2/test-inputs
    output_path: /Users/sarangsharma/code/repo2/test-outputs
```

### 3. Start the Server

```bash
python server.py
```

### 4. Open the Application

Navigate to `http://localhost:9000` in your browser.

## Usage

1. **Load Configuration**: Click "Load Configuration" to load your YAML config
2. **Run Tests**: Click "Run All Tests" to execute all configured tests
3. **View Results**: Results appear in the "Results" section with timing and statistics
4. **Individual Runs**: Each test run shows duration, timestamp, and output

## API Endpoints

- `GET /api/config` - Get current configuration
- `POST /api/run-test` - Run a single test
- `POST /api/run-all` - Run all tests (batch processing)

## File Structure

```
wingman-test-suite/
├── index.html          # Main web interface
├── styles.css          # Styling
├── app.js             # Frontend JavaScript
├── server.py          # Python backend server
├── requirements.txt   # Python dependencies
├── test-suite-config.yaml  # Configuration
└── README.md          # This file
```

## Configuration Format

The YAML configuration file supports:

- **wingman_binary_path**: Path to wingman executable
- **wingman_config_path**: Path to wingman configuration
- **perplexity_key**: API key for Perplexity service
- **run_count**: Number of times to run each input
- **repos**: List of repositories to test
  - **repo_path**: Repository directory
  - **inputs_path**: Directory containing .txt input files
  - **output_path**: Directory for storing outputs

## Input Files

Place test input files (with .txt extension) in each repository's `inputs_path` directory. These files should contain the PR DIFF format as specified in the requirements.

## Output Format

Results are displayed as JSON with the following structure:

```json
{
  "repo": "/path/to/repo",
  "inputFile": "test-input-1.txt",
  "runNumber": 1,
  "success": true,
  "output": { ... },
  "duration": 2.34,
  "timestamp": "2025-03-09T13:08:39.123Z"
}
```

## Troubleshooting

- **Port 5000 in use**: Change port in server.py
- **Missing dependencies**: Run `pip install -r requirements.txt`
- **Configuration errors**: Check YAML syntax and file paths
- **Permission issues**: Ensure wingman binary has execute permissions
