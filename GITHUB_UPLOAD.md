# Upload Zap Suite to GitHub

## Step 1: Create Repository on GitHub

1. Go to [github.com](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Fill in the repository details:
   - **Repository name**: `zap-suite`
   - **Description**: `A lightweight web-based test suite for running and analyzing Wingman tests with clean JSON output display`
   - **Public**: ✅ Check this box
   - **Add a README file**: ❌ Leave unchecked (we already have one)
   - **Add .gitignore**: ❌ Leave unchecked
   - **Choose a license**: Optional (MIT recommended)
5. Click "Create repository"

## Step 2: Prepare Local Repository

Run these commands in your zap-suite directory:

```bash
# Initialize git repository
git init

# Add all files to git
git add .

# Create initial commit
git commit -m "Initial commit: Zap Suite - Wingman test runner with clean JSON output"

# Add GitHub remote (replace with your actual repo URL)
git remote add origin https://github.com/sarang-sharma/zap-suite.git

# Set main branch
git branch -M main

# Push to GitHub
git push -u origin main
```

## Step 3: Verify Upload

1. Go to your repository: `https://github.com/sarang-sharma/zap-suite`
2. Verify all files are uploaded
3. Check that README.md displays correctly

## Repository Features

Your repository will include:
- ✅ Clean, professional README
- ✅ Easy setup scripts (`setup.sh`, `run.sh`)
- ✅ Comprehensive installation guide (`INSTALL.md`)
- ✅ All source code and dependencies
- ✅ Sample configuration file
- ✅ MIT license (if chosen)

## Sharing with Colleagues

Once uploaded, colleagues can clone and run:

```bash
# Clone the repository
git clone https://github.com/sarang-sharma/zap-suite.git
cd zap-suite

# One-command setup
./setup.sh

# Edit configuration
# nano test-suite-config.yaml

# Run the application
./run.sh
```

## Repository URL
After upload, your repository will be available at:
**https://github.com/sarang-sharma/zap-suite**
