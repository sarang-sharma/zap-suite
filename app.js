// Zap Suite Application - Redesigned for Easy Access to Suggestions
class ZapSuite {
    constructor() {
        this.config = null;
        this.testResults = [];
        this.isRunning = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('loadConfigBtn').addEventListener('click', () => this.loadConfiguration());
        document.getElementById('runAllBtn').addEventListener('click', () => this.runAllTests());
        
        // Expand/Collapse controls
        const expandAllBtn = document.getElementById('expandAllBtn');
        const collapseAllBtn = document.getElementById('collapseAllBtn');
        
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => this.expandAllItems());
        }
        
        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => this.collapseAllItems());
        }
    }

    expandAllItems() {
        document.querySelectorAll('details').forEach(details => {
            details.open = true;
        });
    }

    collapseAllItems() {
        document.querySelectorAll('details').forEach(details => {
            details.open = false;
        });
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h3 class="font-semibold text-gray-900 mb-2">Configuration Details</h3>
                    <div class="space-y-2 text-sm">
                        <p><span class="font-medium">Wingman Binary:</span> ${this.config.wingman_binary_path}</p>
                        <p><span class="font-medium">Wingman Config:</span> ${this.config.wingman_config_path}</p>
                        <p><span class="font-medium">Perplexity Key:</span> <span class="badge ${this.config.perplexity_key ? 'badge-success' : 'badge-failure'}">${this.config.perplexity_key ? 'Set' : 'Missing'}</span></p>
                        <p><span class="font-medium">Run Count:</span> ${this.config.run_count} times per input</p>
                    </div>
                </div>
                <div>
                    <h3 class="font-semibold text-gray-900 mb-2">Repositories (${this.config.repos.length})</h3>
                    <div class="space-y-2 text-sm">
                        ${this.config.repos.map(repo => `
                            <div class="bg-gray-50 rounded p-2">
                                <p class="font-medium">${repo.repo_path}</p>
                                <p class="text-xs text-gray-600">Inputs: ${repo.inputs_path}</p>
                                <p class="text-xs text-gray-600">Outputs: ${repo.output_path}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    async runAllTests() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.testResults = [];
        
        const modal = document.getElementById('loadingModal');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressDetails = document.getElementById('progressDetails');
        
        modal.classList.remove('hidden');
        
        try {
            // Step 1: Scanning
            this.updateProgressStep('scan', 'active');
            progressText.textContent = 'Scanning input files...';
            progressDetails.textContent = 'Discovering test inputs across repositories';
            progressFill.style.width = '10%';
            
            // First, gather all input files from all repos
            const repoInputFiles = [];
            for (const repo of this.config.repos) {
                progressDetails.textContent = `Scanning ${repo.repo_path}...`;
                const inputFiles = await this.getInputFiles(repo.inputs_path);
                repoInputFiles.push({ repo, inputFiles });
            }
            
            this.updateProgressStep('scan', 'completed');
            
            // Calculate total tests
            const totalTests = repoInputFiles.reduce((sum, {repo, inputFiles}) => {
                return sum + inputFiles.length * this.config.run_count;
            }, 0);
            
            progressDetails.textContent = `Found ${totalTests} total test runs to execute`;
            
            let completedTests = 0;
            
            // Run all tests
            for (const {repo, inputFiles} of repoInputFiles) {
                for (const inputFile of inputFiles) {
                    for (let run = 1; run <= this.config.run_count; run++) {
                        // Step 2: Indexing (for create_index)
                        this.updateProgressStep('index', 'active');
                        progressText.textContent = `Indexing repository: ${repo.repo_path}`;
                        progressDetails.textContent = `Preparing code context for ${inputFile} (Run ${run}/${this.config.run_count})`;
                        
                        const baseProgress = 20;
                        const testProgress = (completedTests / totalTests) * 60;
                        progressFill.style.width = `${baseProgress + testProgress}%`;
                        
                        // Step 3: Analyzing (for wingman execution)
                        this.updateProgressStep('index', 'completed');
                        this.updateProgressStep('analyze', 'active');
                        progressText.textContent = `Analyzing with Wingman AI...`;
                        progressDetails.textContent = `Processing ${inputFile} (Run ${run}/${this.config.run_count}) - This may take a while`;
                        
                        const result = await this.runSingleTest(repo, inputFile, run);
                        this.testResults.push(result);
                        
                        completedTests++;
                        const finalProgress = 20 + (completedTests / totalTests) * 60;
                        progressFill.style.width = `${finalProgress}%`;
                        
                        // Update progress details with results
                        if (result.success) {
                            const suggestions = this.extractSuggestions(result.output);
                            progressDetails.textContent = `Completed ${inputFile} - Found ${suggestions.length} suggestions`;
                        } else {
                            progressDetails.textContent = `Completed ${inputFile} - Error occurred`;
                        }
                    }
                }
            }
            
            // Step 4: Complete
            this.updateProgressStep('analyze', 'completed');
            this.updateProgressStep('complete', 'active');
            progressText.textContent = 'Finalizing results...';
            progressDetails.textContent = `Processing ${completedTests} test results`;
            progressFill.style.width = '90%';
            
            // Small delay to show completion
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.updateProgressStep('complete', 'completed');
            progressFill.style.width = '100%';
            progressText.textContent = 'All tests completed!';
            progressDetails.textContent = `Successfully processed ${completedTests} test runs`;
            
            // Another small delay before hiding modal
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error('Error during test execution:', error);
            progressText.textContent = 'Error occurred during testing';
            progressDetails.textContent = error.message;
            
            // Show error for a moment before closing
            await new Promise(resolve => setTimeout(resolve, 2000));
        } finally {
            modal.classList.add('hidden');
            this.displayResults();
            this.isRunning = false;
            this.resetProgressSteps();
        }
    }

    updateProgressStep(stepId, state) {
        const step = document.getElementById(`step-${stepId}`);
        if (step) {
            step.classList.remove('active', 'completed');
            if (state !== 'inactive') {
                step.classList.add(state);
            }
        }
    }

    resetProgressSteps() {
        ['scan', 'index', 'analyze', 'complete'].forEach(stepId => {
            this.updateProgressStep(stepId, 'inactive');
        });
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
        this.updateQuickStats();
        this.generateTestResults();
        
        // Show results section
        document.getElementById('results').classList.remove('hidden');
    }

    updateQuickStats() {
        const totalTests = this.testResults.length;
        const successfulTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - successfulTests;
        const avgDuration = totalTests > 0 ? (this.testResults.reduce((sum, r) => sum + r.duration, 0) / totalTests).toFixed(1) : 0;
        
        document.getElementById('totalTests').textContent = totalTests;
        document.getElementById('successfulTests').textContent = successfulTests;
        document.getElementById('failedTests').textContent = failedTests;
        document.getElementById('avgDuration').textContent = `${avgDuration}s`;
    }

    generateTestResults() {
        const container = document.getElementById('testResults');
        
        if (this.testResults.length === 0) {
            container.innerHTML = '<p class="text-gray-500">No test results available.</p>';
            return;
        }

        let html = '';
        
        // Group results by input file for better organization
        const groupedResults = this.groupResultsByInput();
        
        for (const [inputKey, results] of Object.entries(groupedResults)) {
            const [repo, inputFile] = inputKey.split('::');
            
            html += `
                <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div class="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-semibold text-gray-900">${inputFile}</h3>
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-gray-500">${repo}</span>
                                <span class="badge badge-success">${results.filter(r => r.success).length}/${results.length} successful</span>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        ${this.generateRunResults(results)}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    generateRunResults(results) {
        return results.map((result, index) => {
            const suggestions = this.extractSuggestions(result.output);
            const hasValidSuggestions = suggestions.length > 0;
            
            return `
                <div class="suggestion-card mb-6">
                    <div class="test-run-header">
                        <div class="test-info">
                            <span class="test-title">Run ${result.runNumber}</span>
                            <span class="badge ${result.success ? 'badge-success' : 'badge-failure'}">
                                ${result.success ? '✓ Success' : '✗ Failed'}
                            </span>
                            <span class="text-sm text-gray-500">${result.duration.toFixed(2)}s</span>
                            <span class="text-sm text-gray-500">${new Date(result.timestamp).toLocaleTimeString()}</span>
                        </div>
                        ${hasValidSuggestions ? `<span class="badge badge-accurate">${suggestions.length} suggestions</span>` : ''}
                    </div>
                    
                    <div class="suggestion-content">
                        ${result.error ? `
                            <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <p class="text-red-800 font-medium">Error:</p>
                                <p class="text-red-700 text-sm">${result.error}</p>
                            </div>
                        ` : ''}
                        
                        ${hasValidSuggestions ? this.renderSuggestions(suggestions) : this.renderNoSuggestions(result)}
                        
                        ${result.tool_analytics && result.tool_analytics.tools_executed ? `
                            <details class="mt-4">
                                <summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                                    Tool Analytics (${result.tool_analytics.tool_count || 0} tools, ${result.tool_analytics.total_execution_time_s || 0}s)
                                </summary>
                                <div class="mt-2">
                                    ${this.renderToolAnalytics(result.tool_analytics)}
                                </div>
                            </details>
                        ` : ''}
                        
                        <details class="mt-4">
                            <summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">Raw Output & Logs</summary>
                            <div class="mt-2 space-y-2">
                                ${result.commands ? `
                                    <div>
                                        <p class="text-xs font-medium text-gray-600 mb-1">Commands:</p>
                                        <div class="code-block text-xs">
                                            ${result.commands.create_index ? `Create Index: ${result.commands.create_index}<br>` : ''}
                                            ${result.commands.index_path ? `Index Path: ${result.commands.index_path}<br>` : ''}
                                            Wingman: ${result.commands.wingman}
                                            ${result.session_id ? `<br>Session ID: ${result.session_id}` : ''}
                                        </div>
                                    </div>
                                ` : ''}
                                
                                ${result.raw_output ? `
                                    <div>
                                        <p class="text-xs font-medium text-gray-600 mb-1">Standard Output:</p>
                                        <pre class="code-block text-xs">${result.raw_output}</pre>
                                    </div>
                                ` : ''}
                                
                                ${result.raw_error ? `
                                    <div>
                                        <p class="text-xs font-medium text-gray-600 mb-1">Standard Error:</p>
                                        <pre class="code-block text-xs text-red-600">${result.raw_error}</pre>
                                    </div>
                                ` : ''}
                            </div>
                        </details>
                    </div>
                </div>
            `;
        }).join('');
    }

    extractSuggestions(output) {
        if (!output || typeof output !== 'object') return [];
        if (!output.analysis_results || !Array.isArray(output.analysis_results)) return [];
        return output.analysis_results;
    }

    detectJsonParsingIssues(result) {
        // Check if we have raw output but no structured output
        if (result.raw_output && (!result.output || Object.keys(result.output).length === 0)) {
            return {
                hasIssue: true,
                type: 'no_json_output',
                message: 'No structured JSON output was generated'
            };
        }

        // Check if output looks like it should have analysis_results but doesn't
        if (result.output && typeof result.output === 'object' && result.success) {
            if (!result.output.analysis_results) {
                return {
                    hasIssue: true,
                    type: 'missing_analysis_results',
                    message: 'JSON output missing analysis_results field'
                };
            }

            if (result.output.analysis_results && !Array.isArray(result.output.analysis_results)) {
                return {
                    hasIssue: true,
                    type: 'invalid_analysis_results',
                    message: 'analysis_results field is not an array'
                };
            }

            if (Array.isArray(result.output.analysis_results) && result.output.analysis_results.length === 0) {
                return {
                    hasIssue: true,
                    type: 'empty_analysis_results',
                    message: 'analysis_results array is empty'
                };
            }
        }

        // Check for potential JSON parsing errors in raw output
        if (result.raw_output && result.raw_output.includes('Error:') && result.raw_output.includes('JSON')) {
            return {
                hasIssue: true,
                type: 'json_parse_error',
                message: 'JSON parsing error detected in output'
            };
        }

        return { hasIssue: false };
    }

    renderSuggestions(suggestions) {
        return `
            <div class="space-y-4">
                <h4 class="font-semibold text-gray-900 mb-3">Analysis Results (${suggestions.length} suggestions)</h4>
                ${suggestions.map((suggestion, index) => this.renderSingleSuggestion(suggestion, index)).join('')}
            </div>
        `;
    }

    renderSingleSuggestion(suggestion, index) {
        const isAccurate = suggestion.analysis?.is_accurate ?? null;
        const accuracyBadge = isAccurate === true ? 'badge-accurate' : isAccurate === false ? 'badge-inaccurate' : 'badge-unknown';
        const accuracyText = isAccurate === true ? '✓ Accurate' : isAccurate === false ? '✗ Inaccurate' : '? Unknown';
        
        return `
            <div class="border border-gray-200 rounded-lg overflow-hidden">
                <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div class="flex items-center justify-between">
                        <h5 class="font-medium text-gray-900">Suggestion ${index + 1}</h5>
                        <span class="badge ${accuracyBadge}">${accuracyText}</span>
                    </div>
                    <div class="mt-1 flex items-center gap-4 text-sm text-gray-600">
                        <span><strong>File:</strong> ${suggestion.feedback_file || 'Unknown'}</span>
                        <span><strong>Line:</strong> ${suggestion.line_number || 'Unknown'}</span>
                    </div>
                </div>
                
                <div class="p-4">
                    <div class="pr-comment mb-4">
                        <p class="font-medium text-gray-700 mb-1">PR Comment:</p>
                        <p class="text-gray-900">${suggestion.pr_comment || 'No comment provided'}</p>
                    </div>
                    
                    ${suggestion.analysis ? `
                        <div class="analysis-grid mb-4">
                            <div class="analysis-item">
                                <strong>Accurate:</strong> ${suggestion.analysis.is_accurate ? 'Yes' : 'No'}
                            </div>
                            <div class="analysis-item">
                                <strong>Code Fix Valid:</strong> ${suggestion.analysis.code_fix_patch_valid ? 'Yes' : 'No'}
                            </div>
                            <div class="analysis-item">
                                <strong>Compilation Issue:</strong> ${suggestion.analysis.causes_compilation_failure ? 'Yes' : 'No'}
                            </div>
                            <div class="analysis-item">
                                <strong>Same as Diff:</strong> ${suggestion.analysis.is_code_fix_patch_same_as_diff || 'Unknown'}
                            </div>
                        </div>
                    ` : ''}
                    
                    <details>
                        <summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 mb-2">
                            Show Full JSON Analysis
                        </summary>
                        <pre class="code-block text-xs">${JSON.stringify(suggestion, null, 2)}</pre>
                    </details>
                </div>
            </div>
        `;
    }

    renderNoSuggestions(result) {
        const parsingIssue = this.detectJsonParsingIssues(result);
        
        if (parsingIssue.hasIssue) {
            return `
                <div class="error-card">
                    <div class="error-title">
                        <span>⚠️</span> JSON Parsing Issue Detected
                    </div>
                    <div class="error-content">
                        <p><strong>Issue Type:</strong> ${parsingIssue.type.replace(/_/g, ' ')}</p>
                        <p><strong>Problem:</strong> ${parsingIssue.message}</p>
                        
                        ${parsingIssue.type === 'json_parse_error' ? `
                            <p class="mt-2"><strong>Likely Cause:</strong> The AI output contains malformed JSON or was truncated.</p>
                        ` : parsingIssue.type === 'no_json_output' ? `
                            <p class="mt-2"><strong>Likely Cause:</strong> The wingman command executed but didn't produce structured output.</p>
                        ` : parsingIssue.type === 'empty_analysis_results' ? `
                            <p class="mt-2"><strong>Likely Cause:</strong> The analysis completed but found no suggestions to report.</p>
                        ` : `
                            <p class="mt-2"><strong>Likely Cause:</strong> The JSON structure doesn't match the expected format.</p>
                        `}
                    </div>
                    
                    ${result.raw_output ? `
                        <details class="mt-3">
                            <summary class="cursor-pointer text-sm font-medium text-red-700 hover:text-red-900">
                                Inspect Raw Output for Debugging
                            </summary>
                            <pre class="code-block text-xs mt-2">${result.raw_output}</pre>
                        </details>
                    ` : ''}
                    
                    ${result.raw_error ? `
                        <details class="mt-3">
                            <summary class="cursor-pointer text-sm font-medium text-red-700 hover:text-red-900">
                                View Error Logs
                            </summary>
                            <pre class="code-block text-xs mt-2 text-red-600">${result.raw_error}</pre>
                        </details>
                    ` : ''}
                </div>
            `;
        }
        
        // If no parsing issues detected but still no suggestions, show a generic message
        return `
            <div class="warning-card">
                <div class="warning-title">
                    <span>ℹ️</span> No Analysis Results
                </div>
                <div class="warning-content">
                    <p>The test completed successfully but no structured analysis results were found.</p>
                    <p class="mt-1">This could mean the AI didn't find any issues to report for this input.</p>
                    
                    ${result.raw_output ? `
                        <details class="mt-3">
                            <summary class="cursor-pointer text-sm font-medium text-orange-700 hover:text-orange-900">
                                View Raw Output
                            </summary>
                            <pre class="code-block text-xs mt-2">${result.raw_output}</pre>
                        </details>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderToolAnalytics(analytics) {
        if (!analytics.tools_executed || analytics.tools_executed.length === 0) {
            return '<p class="text-sm text-gray-500">No tool execution data available</p>';
        }

        return `
            <div class="bg-gray-50 rounded p-3">
                <div class="grid grid-cols-2 gap-2 mb-3 text-sm">
                    <div><strong>Total Tools:</strong> ${analytics.tool_count || 0}</div>
                    <div><strong>Total Time:</strong> ${analytics.total_execution_time_s || 0}s</div>
                </div>
                <div class="space-y-1">
                    ${analytics.tools_executed.map(tool => `
                        <div class="flex justify-between text-xs">
                            <span class="font-medium">${tool.tool}</span>
                            <span>${tool.execution_time_s}s</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    groupResultsByInput() {
        const grouped = {};
        
        this.testResults.forEach(result => {
            const key = `${result.repo}::${result.inputFile}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(result);
        });
        
        return grouped;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ZapSuite();
});
