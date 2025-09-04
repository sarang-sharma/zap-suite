# Zap Suite - Installation & Quick Start

## For Your Colleagues - Quick Setup

### Option 1: One-Command Setup (Recommended)
```bash
# Clone or extract the zap-suite folder, then:
cd zap-suite
./setup.sh
```

### Option 2: Manual Setup
```bash
# 1. Create virtual environment
python3 -m venv venv

# 2. Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt
```

## Configuration

Edit `test-suite-config.yaml` with your paths and settings:

```yaml
# Zap Suite Configuration
wingman_binary_path: /path/to/your/wingman/binary
wingman_config_path: ~/.bitowingman/config.json
perplexity_key: your-perplexity-api-key
run_count: 1  # Number of times to run each input
parallel_workers: 3  # Number of parallel test executions

repos:
  - repo_path: /path/to/your/repository
    inputs_path: /path/to/test-inputs
    output_path: /path/to/outputs
```

## Running

### Option 1: Using Run Script (Recommended)
```bash
./run.sh
```

### Option 2: Manual Run
```bash
source venv/bin/activate
python server.py
```

## Access the Application

Open your browser and go to: **http://localhost:9000**

## Usage Steps

1. Click **"Load Configuration"** to load your YAML settings
2. Click **"Run All Tests"** to execute the tests  
3. View clean, structured results with analysis breakdowns
4. Each feedback entry shows accuracy, file/line info, and detailed analysis

## Features

✅ **Clean JSON Extraction** - Removes spinner noise and extracts final analysis  
✅ **Session Consistency** - Same session ID for create_index and wingman commands  
✅ **Visual Analysis Results** - Color-coded accuracy badges and structured display  
✅ **Collapsible Details** - Hide/show detailed analysis to reduce clutter  
✅ **Performance Tracking** - Timing, statistics, and progress monitoring  
✅ **Multiple Repositories** - Test multiple codebases in one run  

## Input File Format

Your `.txt` input files should contain PR DIFF format:

```
PR DIFF:
 --- index.ts (lines 855-1493)---
855: -  async callExternalAPI(endpoint: string, data: any, retries: number = 3): Promise<any> {
856: -    if (!this.checkRateLimit(endpoint)) {
857: -      throw new Error('Rate limit exceeded');
...

SUGGESTIONS:
[{'feedback file': 'index.ts', 'pr comment': "The cache hit rate calculation is...", 'line number': '1424', 'code fix patch': '@@ -1423,2 +1423,2 @@...'}]
```

## Troubleshooting

**Port already in use:** Change port in `server.py` line 343: `app.run(debug=True, host='0.0.0.0', port=9001)`

**Permission denied:** Make scripts executable:
```bash
chmod +x setup.sh run.sh
```

**Python not found:** Install Python 3.8 or later

**Virtual environment issues:** Delete `venv` folder and run `./setup.sh` again

## Support

- Check `README.md` for detailed documentation
- All files are included - no additional downloads needed
- Works on macOS, Linux, and Windows (with bash)
