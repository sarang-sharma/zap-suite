// Zap Suite Application
class ZapSuite {
    constructor() {
        this.config = null;
        this.testResults = [];
        this.currentTestIndex = 0;
        this.isRunning = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('loadConfigBtn').addEventListener('click', () => this.loadConfiguration());
        document.getElementById('runAllBtn').addEventListener('click', () => this.runAllTests());
    }

    async loadConfiguration() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Failed to load configuration');
            
            this.config = await response.json();
            this.displayConfiguration();
            document.getElementById('runAllBtn').disabled = false;
        } catch (error) {
            alert('Error loading configuration: ' + error.message);
        }
    }

    displayConfiguration() {
        const configDisplay = document.getElementById('configDisplay');
        configDisplay.innerHTML = `
            <h3>Configuration Loaded</h3>
            <p><strong>Wingman Binary:</strong> ${this.config.wingman_binary_path}</p>
            <p><strong>Wingman Config:</strong> ${this.config.wingman_config_path}</p>
            <p><strong>Perplexity Key:</strong> ${this.config.perplexity_key ? '✓ Set' : '✗ Missing'}</p>
            <p><strong>Run Count:</strong> ${this.config.run_count} times per input</p>
            <h4>Repositories:</h4>
            <ul>
                ${this.config.repos.map(repo => `
                    <li>
                        <strong>Path:</strong> ${repo.repo_path}<br>
                        <strong>Inputs:</strong> ${repo.inputs_path}<br>
                        <strong>Outputs:</strong> ${repo.output_path}
                    </li>
                `).join('')}
            </ul>
        `;
    }

    async runAllTests() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.testResults = [];
        this.currentTestIndex = 0;
        
        const modal = document.getElementById('loadingModal');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        modal.style.display = 'block';
        progressText.textContent = 'Scanning input files...';
        
        // First, gather all input files from all repos
        const repoInputFiles = [];
        for (const repo of this.config.repos) {
            const inputFiles = await this.getInputFiles(repo.inputs_path);
            repoInputFiles.push({ repo, inputFiles });
        }
        
        // Calculate total tests
        const totalTests = repoInputFiles.reduce((sum, {repo, inputFiles}) => {
            return sum + inputFiles.length * this.config.run_count;
        }, 0);
        
        let completedTests = 0;
        
        // Run all tests
        for (const {repo, inputFiles} of repoInputFiles) {
            for (const inputFile of inputFiles) {
                for (let run = 1; run <= this.config.run_count; run++) {
                    progressText.textContent = `Running ${repo.repo_path} - ${inputFile} (Run ${run}/${this.config.run_count})`;
                    
                    const result = await this.runSingleTest(repo, inputFile, run);
                    this.testResults.push(result);
                    
                    completedTests++;
                    const progress = (completedTests / totalTests) * 100;
                    progressFill.style.width = `${progress}%`;
                }
            }
        }
        
        modal.style.display = 'none';
        this.displayResults();
        this.isRunning = false;
    }

    async getInputFiles(inputsPath) {
        try {
            const response = await fetch('/api/input-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs_path: inputsPath
                })
            });
            
            if (!response.ok) throw new Error('Failed to fetch input files');
            
            const result = await response.json();
            return result.files || [];
        } catch (error) {
            console.error('Error fetching input files:', error);
            return [];
        }
    }

    async runSingleTest(repo, inputFile, runNumber) {
        const startTime = performance.now();
        
        try {
            const response = await fetch('/api/run-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repo_path: repo.repo_path,
                    inputs_path: repo.inputs_path,
                    output_path: repo.output_path,
                    input_file: inputFile,
                    run_number: runNumber
                })
            });
            
            const result = await response.json();
            const endTime = performance.now();
            
            return {
                repo: repo.repo_path,
                inputFile,
                runNumber,
                success: result.success,
                output: result.output || {},
                raw_output: result.raw_output || '',
                raw_error: result.raw_error || '',
                tool_analytics: result.tool_analytics || {},
                commands: result.commands || null,
                session_id: result.session_id || null,
                error: result.error || null,
                duration: (endTime - startTime) / 1000, // Convert to seconds
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            const endTime = performance.now();
            return {
                repo: repo.repo_path,
                inputFile,
                runNumber,
                success: false,
                output: {},
                error: error.message,
                duration: (endTime - startTime) / 1000,
                timestamp: new Date().toISOString()
            };
        }
    }

    displayResults() {
        const resultsContainer = document.getElementById('resultsContainer');
        const testRuns = document.getElementById('testRuns');
        
        // Group results by repo and input file
        const groupedResults = this.groupResultsByRepoAndInput();
        
        let resultsHTML = '<h3>Test Results Summary</h3>';
        let testRunsHTML = '<h3>Individual Test Runs</h3>';
        
        // Summary statistics
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - successfulTests;
        const avgDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0) / totalTests;
        
        resultsHTML += `
            <div class="stats-summary">
                <h4>Overall Statistics</h4>
                <p><strong>Total Tests:</strong> ${totalTests}</p>
                <p><strong>Successful:</strong> ${successfulTests}</p>
                <p><strong>Failed:</strong> ${failedTests}</p>
                <p><strong>Average Duration:</strong> ${avgDuration.toFixed(2)}s</p>
            </div>
        `;
        
        // Detailed results by repo and input
        for (const [repo, inputs] of Object.entries(groupedResults)) {
            resultsHTML += `<div class="repo-section">
                <h3>Repository: ${repo}</h3>`;
            
            for (const [inputFile, runs] of Object.entries(inputs)) {
                const inputAvgDuration = runs.reduce((sum, r) => sum + r.duration, 0) / runs.length;
                const inputSuccessRate = runs.filter(r => r.success).length / runs.length * 100;
                
                resultsHTML += `
                    <div class="input-file">
                        <h5>Input: ${inputFile}</h5>
                        <p><strong>Average Duration:</strong> ${inputAvgDuration.toFixed(2)}s</p>
                        <p><strong>Success Rate:</strong> ${inputSuccessRate.toFixed(1)}%</p>
                        <p><strong>Runs:</strong> ${runs.length}</p>
                    </div>
                `;
                
                // Individual runs
                runs.forEach((run, index) => {
                    const runId = `run-${repo.replace(/[^a-zA-Z0-9]/g, '_')}-${inputFile.replace(/[^a-zA-Z0-9]/g, '_')}-${run.runNumber}`;
                    
                    testRunsHTML += `
                        <div class="test-item">
                            <h4>${repo} - ${inputFile} (Run ${run.runNumber})</h4>
                            <p><strong>Status:</strong> ${run.success ? '✓ Success' : '✗ Failed'}</p>
                            <p><strong>Duration:</strong> ${run.duration.toFixed(2)}s</p>
                            <p><strong>Timestamp:</strong> ${new Date(run.timestamp).toLocaleString()}</p>
                            
                            ${run.commands ? `
                                <div class="commands-section">
                                    <h5>Commands Executed:</h5>
                                    ${run.commands.create_index ? `<p><strong>Create Index:</strong> <code>${run.commands.create_index}</code></p>` : ''}
                                    ${run.commands.index_path ? `<p><strong>Index Path:</strong> <code>${run.commands.index_path}</code></p>` : ''}
                                    <p><strong>Wingman:</strong> <code>${run.commands.wingman}</code></p>
                                    ${run.session_id ? `<p><strong>Session ID:</strong> <code>${run.session_id}</code></p>` : ''}
                                </div>
                            ` : ''}
                            
                            ${run.error ? `<p><strong>Error:</strong> ${run.error}</p>` : ''}
                            
                            ${this.formatToolAnalytics(run.tool_analytics)}
                            
                            <div class="output-section">
                                <h5>Analysis Results:</h5>
                                ${this.formatAnalysisResults(run.output)}
                                
                                <details class="raw-output-details">
                                    <summary>Show Raw Output</summary>
                                    <div class="raw-output">
                                        ${run.raw_output ? `
                                            <h6>Standard Output:</h6>
                                            <pre>${run.raw_output}</pre>
                                        ` : ''}
                                        ${run.raw_error ? `
                                            <h6>Standard Error:</h6>
                                            <pre class="error">${run.raw_error}</pre>
                                        ` : ''}
                                    </div>
                                </details>
                            </div>
                        </div>
                    `;
                });
            }
            
            resultsHTML += '</div>';
        }
        
        resultsContainer.innerHTML = resultsHTML;
        testRuns.innerHTML = testRunsHTML;
    }

    formatToolAnalytics(analytics) {
        if (!analytics || !analytics.tools_executed || analytics.tools_executed.length === 0) {
            return '';
        }

        let html = `
            <div class="tool-analytics-section">
                <h5>Tool Execution Analytics:</h5>
                <div class="tool-analytics">
                    <p><strong>Total Tools:</strong> ${analytics.tool_count || 0}</p>
                    <p><strong>Total Execution Time:</strong> ${analytics.total_execution_time_s || 0}s</p>
                    
                    <details class="tool-details">
                        <summary>Show Individual Tool Times</summary>
                        <div class="tool-list">
                            ${analytics.tools_executed.map(tool => `
                                <div class="tool-item">
                                    <span class="tool-name">${tool.tool}</span>
                                    <span class="tool-time">${tool.execution_time_s}s (${tool.execution_time_ms}ms)</span>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                </div>
            </div>
        `;

        return html;
    }

    formatAnalysisResults(output) {
        if (!output || typeof output !== 'object') {
            return '<p class="no-results">No analysis results available</p>';
        }
        
        if (output.raw_output && !output.analysis_results) {
            return `<p class="raw-fallback">Raw output available - check "Show Raw Output" below</p>`;
        }
        
        if (!output.analysis_results || !Array.isArray(output.analysis_results)) {
            return '<p class="no-results">No structured analysis results found</p>';
        }
        
        let html = '<div class="analysis-results">';
        
        output.analysis_results.forEach((result, index) => {
            const isAccurate = result.analysis?.is_accurate ?? null;
            const accuracyClass = isAccurate === true ? 'accurate' : isAccurate === false ? 'inaccurate' : 'unknown';
            
            html += `
                <div class="analysis-item ${accuracyClass}">
                    <div class="analysis-header">
                        <h6>Feedback ${index + 1}</h6>
                        <span class="accuracy-badge ${accuracyClass}">
                            ${isAccurate === true ? '✓ Accurate' : isAccurate === false ? '✗ Inaccurate' : '? Unknown'}
                        </span>
                    </div>
                    
                    <div class="feedback-details">
                        <p><strong>File:</strong> <code>${result.feedback_file || 'Unknown'}</code></p>
                        <p><strong>Line:</strong> <code>${result.line_number || 'Unknown'}</code></p>
                        
                        <div class="pr-comment">
                            <strong>PR Comment:</strong>
                            <div class="comment-text">${result.pr_comment || 'No comment provided'}</div>
                        </div>
                        
                        ${result.analysis ? `
                            <div class="analysis-summary">
                                <strong>Analysis Summary:</strong>
                                <ul>
                                    <li><strong>Accurate:</strong> ${result.analysis.is_accurate ? 'Yes' : 'No'}</li>
                                    <li><strong>Code Fix Valid:</strong> ${result.analysis.code_fix_patch_valid ? 'Yes' : 'No'}</li>
                                    <li><strong>Compilation Issue:</strong> ${result.analysis.causes_compilation_failure ? 'Yes' : 'No'}</li>
                                    <li><strong>Parameter Counting:</strong> ${result.analysis.is_parameter_counting_related_issue ? 'Yes' : 'No'}</li>
                                    <li><strong>Same as Diff:</strong> ${result.analysis.is_code_fix_patch_same_as_diff || 'Unknown'}</li>
                                </ul>
                                
                                ${result.analysis.triviality_analysis ? `
                                    <div class="triviality-analysis">
                                        <strong>Triviality Flags:</strong>
                                        <ul>
                                            <li>Defensive Programming: ${result.analysis.triviality_analysis.overly_defensive_programming ? 'Yes' : 'No'}</li>
                                            <li>Style/Formatting: ${result.analysis.triviality_analysis.indentation_spacing_imports_dependencies ? 'Yes' : 'No'}</li>
                                            <li>Verification Request: ${result.analysis.triviality_analysis.verification_or_confirmation_request ? 'Yes' : 'No'}</li>
                                            <li>Summary Only: ${result.analysis.triviality_analysis.summary_or_restatement_only ? 'Yes' : 'No'}</li>
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                        
                        <details class="analysis-details">
                            <summary>Show Detailed Analysis</summary>
                            <pre class="analysis-json">${JSON.stringify(result.analysis_details || {}, null, 2)}</pre>
                        </details>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    groupResultsByRepoAndInput() {
        const grouped = {};
        
        this.testResults.forEach(result => {
            if (!grouped[result.repo]) {
                grouped[result.repo] = {};
            }
            if (!grouped[result.repo][result.inputFile]) {
                grouped[result.repo][result.inputFile] = [];
            }
            grouped[result.repo][result.inputFile].push(result);
        });
        
        return grouped;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ZapSuite();
});
