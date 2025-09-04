#!/bin/bash
# Zap Suite Run Script
set -e

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run './setup.sh' first."
    exit 1
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Check if config file exists
if [ ! -f "test-suite-config.yaml" ]; then
    echo "⚠️  Configuration file 'test-suite-config.yaml' not found."
    echo "Please create and configure it before running."
    exit 1
fi

# Start the server
echo "🚀 Starting Zap Suite..."
echo "📍 Server will be available at: http://localhost:9000"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

python server.py
