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

  // Generate random string for bulk tasks
  const generateRandomString = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Send 100 random tasks
  const sendBulkTasks = async () => {
    setLoading(true);
    setStatus({ bulk: true, totalTasks: 100, submitted: 0, completed: 0 });

    const taskTypes = ['task1', 'task2', 'task3'];
    const baseText = input || 'BulkTask';
    
    // Track bulk operation start
    if (appInsights && appInsights.trackEvent) {
      appInsights.trackEvent(
        { name: 'BulkTasksStarted' },
        { 
          totalTasks: 100,
          baseText: baseText,
          timestamp: new Date().toISOString(),
          apiBase: API_BASE
        }
      );
    }

    try {
      // Submit all 100 tasks in maximum sized batches for SUPER FAST submission
      const batchSize = 100; // Maximum batch size for speed
      let submittedCount = 0;
      
      for (let batch = 0; batch < 10; batch++) { // 10 batches of 100 tasks each
        const batchPromises = [];
        
        for (let i = 0; i < batchSize; i++) {
          const taskIndex = batch * batchSize + i;
          const randomSuffix = generateRandomString(8);
          const taskText = `${baseText}_${randomSuffix}_${taskIndex}`;
          const endpoint = taskTypes[taskIndex % 3]; // Rotate between task types
          
          // Create task span for this bulk task
          const taskSpan = apiClient.createTaskSpan(endpoint, taskText);
          
          const taskPromise = apiClient.post(endpoint, taskText)
            .then(async (response) => {
              const data = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
              
              const taskId = data.task_id;
              taskSpan.taskId = taskId;
              
              // Initialize result tracking
              setResults(prev => ({ ...prev, [taskId]: { 
                status: 'pending', 
                attempt: 0, 
                submittedAt: new Date().toISOString(),
                taskType: endpoint,
                bulkTask: true,
                bulkIndex: taskIndex
              } }));
              
              // Update bulk status
              setStatus(prev => ({ 
                ...prev, 
                submitted: prev.submitted + 1 
              }));
              
              // Start polling for this task (with shorter timeout for bulk)
              pollResult(taskId, 10, taskSpan);
              
              return { taskId, endpoint, taskText };
            })
            .catch((err) => {
              console.error(`Bulk task ${taskIndex} error:`, err);
              taskSpan.complete(null, 'failed', err.message);
              throw err;
            });
          
          batchPromises.push(taskPromise);
        }
        
        // Fire all requests in parallel - NO DELAYS for maximum speed
        await Promise.allSettled(batchPromises);
        submittedCount += batchSize;
        
        // NO DELAYS between batches - MAXIMUM SPEED
      }
      
      // Track bulk submission completion
      if (appInsights && appInsights.trackEvent) {
        appInsights.trackEvent(
          { name: 'BulkTasksSubmitted' },
          { 
            totalTasks: 100,
            submittedTasks: submittedCount,
            baseText: baseText,
            timestamp: new Date().toISOString(),
            apiBase: API_BASE
          }
        );
      }
      
      setStatus(prev => ({ 
        ...prev, 
        submissionComplete: true,
        message: `All 100 tasks submitted! Check results below as they complete.`
      }));
      
    } catch (err) {
      console.error('Bulk task submission error:', err);
      setStatus(prev => ({ 
        ...prev, 
        error: `Bulk submission failed: ${err.message}` 
      }));
      
      // Track bulk operation error
      if (appInsights && appInsights.trackException) {
        appInsights.trackException(
          { exception: err },
          { 
            operation: 'bulkTaskSubmission',
            totalTasks: 100,
            baseText: baseText,
            apiBase: API_BASE
          }
        );
      }
    } finally {
      setLoading(false);
    }
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

      <div style={{ marginBottom: '20px' }}>
        <button 
          disabled={loading} 
          onClick={sendBulkTasks}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#ff6b35', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          ⚡ BLAST 100 TASKS SUPER FAST ⚡
        </button>
        <span style={{ marginLeft: '10px', fontSize: '0.9em', color: '#666' }}>
          Max speed! Uses input text as prefix + random chars
        </span>
      </div>

      {loading && <p style={{ color: '#007acc' }}>
        {status?.bulk ? 'Submitting bulk tasks...' : 'Submitting task...'}
      </p>}
      
      {status && status.bulk && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>🚀 Bulk Task Operation</h3>
          <p><strong>Total Tasks:</strong> {status.totalTasks}</p>
          <p><strong>Submitted:</strong> {status.submitted || 0}</p>
          {status.submissionComplete && (
            <p style={{ color: 'green', fontWeight: 'bold' }}>✅ {status.message}</p>
          )}
          {status.error && (
            <p style={{ color: 'red', fontWeight: 'bold' }}>❌ {status.error}</p>
          )}
          <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#6c757d' }}>
            <p>� MAXIMUM SPEED: Tasks submitted in batches of 100 with NO delays</p>
            <p>📊 Results will appear below as tasks complete (expect rapid submission!)</p>
          </div>
        </div>
      )}
      
      {status && !status.error && !status.bulk && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f8ff', border: '1px solid #007acc' }}>
          <p><strong>Task Submitted:</strong> {status.kind} (ID: {status.taskId})</p>
          {status.completed ? (
            <p style={{ color: 'green' }}>✅ Task completed!</p>
          ) : (
            <p style={{ color: '#007acc' }}>⏳ Processing...</p>
          )}
        </div>
      )}
      
      {status && status.error && !status.bulk && (
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#ffe6e6', border: '1px solid #cc0000' }}>
          <p style={{ color: 'red' }}><strong>Error:</strong> {status.error}</p>
        </div>
      )}

      {Object.keys(results).length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2>Results: ({Object.keys(results).length} tasks)</h2>
            <div style={{ fontSize: '0.9em', color: '#666' }}>
              <span style={{ marginRight: '15px' }}>
                ✅ Done: {Object.values(results).filter(r => r.status === 'done').length}
              </span>
              <span style={{ marginRight: '15px' }}>
                ⏳ Pending: {Object.values(results).filter(r => r.status === 'pending').length}
              </span>
              <span style={{ marginRight: '15px' }}>
                ❌ Error: {Object.values(results).filter(r => r.status === 'error').length}
              </span>
              <span>
                ⏱️ Timeout: {Object.values(results).filter(r => r.status === 'timeout').length}
              </span>
            </div>
          </div>
          
          <div style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
            {Object.entries(results)
              .sort(([, a], [, b]) => {
                // Sort by latest timestamp (completed, error, timeout, or submitted) - newest first
                const timestampA = a.completedAt || a.errorAt || a.timeoutAt || a.submittedAt || '';
                const timestampB = b.completedAt || b.errorAt || b.timeoutAt || b.submittedAt || '';
                return new Date(timestampB) - new Date(timestampA); // Newest first
              })
              .map(([taskId, result]) => (
                <div key={taskId} style={{ 
                  padding: '8px 12px', 
                  margin: '0',
                  borderBottom: '1px solid #eee',
                  backgroundColor: result.status === 'done' ? '#e8f5e8' : 
                                  result.status === 'error' || result.status === 'timeout' ? '#ffe6e6' : '#fff3cd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.9em'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ marginRight: '8px' }}>
                        {result.taskType ? result.taskType.toUpperCase() : 'TASK'}
                      </strong>
                      <span style={{ fontSize: '0.8em', color: '#666', fontFamily: 'monospace' }}>
                        {taskId.slice(-8)}
                      </span>
                      {result.bulkTask && (
                        <span style={{ 
                          marginLeft: '8px', 
                          fontSize: '0.7em', 
                          backgroundColor: '#ff6b35', 
                          color: 'white', 
                          padding: '1px 4px', 
                          borderRadius: '2px' 
                        }}>
                          BULK #{result.bulkIndex}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ fontSize: '0.8em', color: '#666' }}>
                      Status: {result.status}
                      {result.status === 'pending' && result.attempt && ` (attempt ${result.attempt})`}
                    </div>
                    
                    {result.result && (
                      <div style={{ marginTop: '4px', fontSize: '0.8em' }}>
                        <strong>Result:</strong> 
                        <code style={{ 
                          backgroundColor: '#f5f5f5', 
                          padding: '1px 3px', 
                          marginLeft: '4px',
                          fontSize: '0.9em'
                        }}>
                          {result.result.length > 50 ? `${result.result.substring(0, 50)}...` : result.result}
                        </code>
                      </div>
                    )}
                    
                    {result.error && (
                      <div style={{ marginTop: '4px', fontSize: '0.8em', color: 'red' }}>
                        <strong>Error:</strong> {result.error.length > 100 ? `${result.error.substring(0, 100)}...` : result.error}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ fontSize: '0.75em', color: '#666', textAlign: 'right', minWidth: '80px' }}>
                    {result.completedAt && `✅ ${new Date(result.completedAt).toLocaleTimeString()}`}
                    {result.errorAt && `❌ ${new Date(result.errorAt).toLocaleTimeString()}`}
                    {result.timeoutAt && `⏱️ ${new Date(result.timeoutAt).toLocaleTimeString()}`}
                    {!result.completedAt && !result.errorAt && !result.timeoutAt && result.submittedAt && 
                      `⏳ ${new Date(result.submittedAt).toLocaleTimeString()}`}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
