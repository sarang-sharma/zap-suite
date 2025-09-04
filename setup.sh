#!/bin/bash
# Zap Suite Setup Script
set -e

echo "🚀 Setting up Zap Suite..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not found. Please install Python 3.8 or later."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📋 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Make the script executable
chmod +x setup.sh
chmod +x run.sh

echo ""
echo "✅ Zap Suite setup complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Edit 'test-suite-config.yaml' with your settings"
echo "2. Run './run.sh' to start the application"
echo "3. Open http://localhost:9000 in your browser"
echo ""
echo "📚 For more information, see README.md"
