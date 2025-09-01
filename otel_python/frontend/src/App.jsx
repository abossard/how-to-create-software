import React, { useState, useCallback, useEffect } from 'react';
import { useAppInsightsContext, useTrackEvent } from '@microsoft/applicationinsights-react-js';
import { createApiClient } from './apiClient';

// Runtime-injected by Fastify via <script>window.API_BASE = "...";</script>
// Fallback remains localhost:8000 if not set (useful for dev without server injection).
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || 'http://localhost:8000';

export default function App() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});

  // App Insights tracking hooks
  const appInsights = useAppInsightsContext();
  const trackTaskSubmission = useTrackEvent(appInsights, 'TaskSubmitted');
  const trackTaskCompletion = useTrackEvent(appInsights, 'TaskCompleted');

  // Create API client with Application Insights tracking
  const apiClient = createApiClient(appInsights, API_BASE);

  // Track page view on component mount
  useEffect(() => {
    if (appInsights && appInsights.trackPageView) {
      appInsights.trackPageView({ 
        name: 'TaskProcessingDemo',
        properties: {
          apiBase: API_BASE,
          timestamp: new Date().toISOString()
        }
      });
    }
  }, [appInsights]);

  // Poll for task result using enhanced API client
  const pollResult = useCallback(async (taskId, maxAttempts = 20, taskSpan = null) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await apiClient.get(`result/${taskId}`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${data?.error || 'Unknown error'}`);
        }
        
        if (data.status === 'done') {
          setResults(prev => ({ ...prev, [taskId]: { 
            status: 'done', 
            result: data.result, 
            completedAt: new Date().toISOString() 
          } }));
          setStatus(prev => prev?.taskId === taskId ? { ...prev, completed: true } : prev);
          
          // Complete task span with success
          if (taskSpan) {
            taskSpan.complete(data.result, 'completed');
          }
          
          // Track task completion with correlation data
          if (appInsights && appInsights.trackEvent) {
            appInsights.trackEvent(
              { name: 'TaskCompleted' },
              { 
                taskId, 
                result: data.result,
                inputLength: input.length,
                pollingAttempts: attempt + 1,
                correlationHeaders: response.headers.get('Request-Id') || 'none',
                'task.span_id': taskSpan ? taskSpan.spanName : 'unknown'
              }
            );
          }
          
          return data.result;
        }
        
        // Update polling status
        setResults(prev => ({ ...prev, [taskId]: { 
          status: 'pending', 
          attempt: attempt + 1, 
          startedAt: prev[taskId]?.startedAt || new Date().toISOString() 
        } }));
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error('Polling error:', err);
        setResults(prev => ({ ...prev, [taskId]: { 
          status: 'error', 
          error: err.message, 
          errorAt: new Date().toISOString() 
        } }));
        setStatus(prev => prev?.taskId === taskId ? { ...prev, error: err.message } : prev);
        
        // Complete task span with error
        if (taskSpan) {
          taskSpan.complete(null, 'polling_error', err.message);
        }
        
        // Track polling error with correlation context
        if (appInsights && appInsights.trackException) {
          appInsights.trackException(
            { exception: err },
            { 
              taskId, 
              operation: 'polling', 
              attempt: attempt + 1,
              apiEndpoint: `result/${taskId}`,
              apiBase: API_BASE,
              'task.span_id': taskSpan ? taskSpan.spanName : 'unknown'
            }
          );
        }
        
        return null;
      }
    }
    
    // Timeout after max attempts with enhanced tracking
    const timeoutError = 'Task timeout - result not available';
    setResults(prev => ({ ...prev, [taskId]: { 
      status: 'timeout', 
      error: timeoutError, 
      timeoutAt: new Date().toISOString() 
    } }));
    setStatus(prev => prev?.taskId === taskId ? { ...prev, error: timeoutError } : prev);
    
    // Complete task span with timeout
    if (taskSpan) {
      taskSpan.complete(null, 'timeout', timeoutError);
    }
    
    // Track timeout as custom event
    if (appInsights && appInsights.trackEvent) {
      appInsights.trackEvent(
        { name: 'TaskTimeout' },
        { 
          taskId, 
          maxAttempts, 
          operation: 'polling',
          apiBase: API_BASE,
          'task.span_id': taskSpan ? taskSpan.spanName : 'unknown'
        }
      );
    }
    
    return null;
  }, [appInsights, apiClient, input.length]);

  const send = (endpoint) => {
    setLoading(true);
    setStatus(null);
    
    // Create custom task span with input text
    const taskSpan = apiClient.createTaskSpan(endpoint, input);
    
    // Use enhanced API client for task submission
    apiClient.post(endpoint, input)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        
        const taskId = data.task_id;
        setStatus({ kind: endpoint, taskId, submitted: true });
        
        // Update task span with task ID
        taskSpan.taskId = taskId;
        
        // Initialize result tracking with submission timestamp
        setResults(prev => ({ ...prev, [taskId]: { 
          status: 'pending', 
          attempt: 0, 
          submittedAt: new Date().toISOString(),
          taskType: endpoint 
        } }));
        
        // Track task submission with correlation data and task span context
        if (appInsights && appInsights.trackEvent) {
          appInsights.trackEvent(
            { name: 'TaskSubmitted' },
            { 
              taskType: endpoint, 
              taskId, 
              inputText: input,
              inputLength: input.length,
              correlationHeaders: response.headers.get('Request-Id') || 'none',
              apiBase: API_BASE,
              'task.span_id': taskSpan.spanName
            }
          );
        }
        
        // Start polling for result with task span context
        pollResult(taskId, 20, taskSpan);
      })
      .catch((err) => {
        console.error('API error', err);
        setStatus({ error: err.message });
        
        // Complete task span with error
        taskSpan.complete(null, 'failed', err.message);
        
        // Enhanced API error tracking with correlation context
        if (appInsights && appInsights.trackException) {
          appInsights.trackException(
            { exception: err },
            { 
              operation: 'taskSubmission', 
              endpoint, 
              inputText: input,
              apiBase: API_BASE,
              timestamp: new Date().toISOString(),
              'task.span_id': taskSpan.spanName
            }
          );
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Task Processing Demo</h1>
      <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#666' }}>API: {API_BASE}</p>
      
      <div style={{ marginBottom: '20px' }}>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to process..."
          style={{ padding: '8px', marginRight: '10px', width: '200px' }}
        />
        <button disabled={loading} onClick={() => send('task1')}>
          Task1 (Reverse)
        </button>
        <button disabled={loading} onClick={() => send('task2')} style={{ marginLeft: '5px' }}>
          Task2 (Uppercase)
        </button>
        <button disabled={loading} onClick={() => send('task3')} style={{ marginLeft: '5px' }}>
          Task3 (Slow Process)
        </button>
      </div>

      {loading && <p style={{ color: '#007acc' }}>Submitting task...</p>}
      
      {status && !status.error && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f8ff', border: '1px solid #007acc' }}>
          <p><strong>Task Submitted:</strong> {status.kind} (ID: {status.taskId})</p>
          {status.completed ? (
            <p style={{ color: 'green' }}>✅ Task completed!</p>
          ) : (
            <p style={{ color: '#007acc' }}>⏳ Processing...</p>
          )}
        </div>
      )}
      
      {status && status.error && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#ffe6e6', border: '1px solid #cc0000' }}>
          <p style={{ color: 'red' }}><strong>Error:</strong> {status.error}</p>
        </div>
      )}

      {Object.keys(results).length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h2>Results:</h2>
          {Object.entries(results)
            .sort(([, a], [, b]) => {
              // Sort by latest timestamp (completed, error, timeout, or submitted) - newest first
              const timestampA = a.completedAt || a.errorAt || a.timeoutAt || a.submittedAt || '';
              const timestampB = b.completedAt || b.errorAt || b.timeoutAt || b.submittedAt || '';
              // For newest first: if A is newer (later), it should come before B (negative result)
              return new Date(timestampB) - new Date(timestampA); // Newest first
            })
            .map(([taskId, result]) => (
              <div key={taskId} style={{ 
                padding: '10px', 
                margin: '10px 0', 
                border: '1px solid #ddd',
                backgroundColor: result.status === 'done' ? '#e8f5e8' : 
                                result.status === 'error' || result.status === 'timeout' ? '#ffe6e6' : '#fff3cd'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '1.1em' }}>
                    {result.taskType ? result.taskType.toUpperCase() : 'TASK'} - {taskId.slice(-8)}
                  </strong>
                  <span style={{ fontSize: '0.8em', color: '#666' }}>
                    {result.completedAt && `✅ ${new Date(result.completedAt).toLocaleTimeString()}`}
                    {result.errorAt && `❌ ${new Date(result.errorAt).toLocaleTimeString()}`}
                    {result.timeoutAt && `⏱️ ${new Date(result.timeoutAt).toLocaleTimeString()}`}
                    {!result.completedAt && !result.errorAt && !result.timeoutAt && result.submittedAt && 
                      `⏳ ${new Date(result.submittedAt).toLocaleTimeString()}`}
                  </span>
                </div>
                <p><strong>Status:</strong> {result.status}</p>
                {result.status === 'pending' && (
                  <p><strong>Polling attempt:</strong> {result.attempt || 1}</p>
                )}
                {result.result && (
                  <p><strong>Result:</strong> <code style={{ backgroundColor: '#f5f5f5', padding: '2px 4px' }}>{result.result}</code></p>
                )}
                {result.error && (
                  <p style={{ color: 'red' }}><strong>Error:</strong> {result.error}</p>
                )}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
