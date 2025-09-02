import React, { useState, useCallback } from 'react';

// Simple, pure components following "Grokking Simplicity" principles

// Pure calculation: determine status color
const getStatusColor = (status) => {
  switch (status) {
    case 'done': return '#e8f5e8';
    case 'error': 
    case 'timeout': return '#ffe6e6';
    default: return '#fff3cd';
  }
};

// Pure calculation: format task display
const formatTaskId = (taskId) => taskId.slice(-8);

// Pure calculation: truncate text
const truncateText = (text, maxLength = 50) => 
  text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;

// Separated UI components (information hiding principle)
const TaskInput = ({ input, setInput, onSubmit, loading }) => (
  <div style={{ marginBottom: '20px' }}>
    <input 
      value={input} 
      onChange={(e) => setInput(e.target.value)}
      placeholder="Enter text to process..."
      style={{ padding: '8px', marginRight: '10px', width: '200px' }}
    />
    <button disabled={loading} onClick={() => onSubmit('task1')}>
      Task1 (Reverse)
    </button>
    <button disabled={loading} onClick={() => onSubmit('task2')} style={{ marginLeft: '5px' }}>
      Task2 (Uppercase)
    </button>
    <button disabled={loading} onClick={() => onSubmit('task3')} style={{ marginLeft: '5px' }}>
      Task3 (Slow Process)
    </button>
  </div>
);

const BulkTaskButton = ({ onBulkSubmit, loading }) => (
  <div style={{ marginBottom: '20px' }}>
    <button 
      disabled={loading} 
      onClick={onBulkSubmit}
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
      ⚡ BLAST 100 TASKS ⚡
    </button>
  </div>
);

const StatusDisplay = ({ status, loading }) => {
  if (loading) {
    return <p style={{ color: '#007acc' }}>
      {status?.bulk ? 'Submitting bulk tasks...' : 'Submitting task...'}
    </p>;
  }
  
  if (!status) return null;
  
  if (status.bulk) {
    return (
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>🚀 Bulk Operation</h3>
        <p><strong>Total:</strong> {status.totalTasks}</p>
        <p><strong>Submitted:</strong> {status.submitted || 0}</p>
        {status.submissionComplete && <p style={{ color: 'green', fontWeight: 'bold' }}>✅ {status.message}</p>}
        {status.error && <p style={{ color: 'red', fontWeight: 'bold' }}>❌ {status.error}</p>}
      </div>
    );
  }
  
  if (status.error) {
    return (
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#ffe6e6', border: '1px solid #cc0000' }}>
        <p style={{ color: 'red' }}><strong>Error:</strong> {status.error}</p>
      </div>
    );
  }
  
  return (
    <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f8ff', border: '1px solid #007acc' }}>
      <p><strong>Task:</strong> {status.kind} (ID: {formatTaskId(status.taskId)})</p>
      {status.completed ? (
        <p style={{ color: 'green' }}>✅ Completed!</p>
      ) : (
        <p style={{ color: '#007acc' }}>⏳ Processing...</p>
      )}
    </div>
  );
};

const ResultsList = ({ results }) => {
  const resultEntries = Object.entries(results);
  if (resultEntries.length === 0) return null;
  
  const stats = {
    done: resultEntries.filter(([, r]) => r.status === 'done').length,
    pending: resultEntries.filter(([, r]) => r.status === 'pending').length,
    error: resultEntries.filter(([, r]) => r.status === 'error').length,
    timeout: resultEntries.filter(([, r]) => r.status === 'timeout').length,
  };
  
  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>Results: ({resultEntries.length} tasks)</h2>
        <div style={{ fontSize: '0.9em', color: '#666' }}>
          <span style={{ marginRight: '15px' }}>✅ {stats.done}</span>
          <span style={{ marginRight: '15px' }}>⏳ {stats.pending}</span>
          <span style={{ marginRight: '15px' }}>❌ {stats.error}</span>
          <span>⏱️ {stats.timeout}</span>
        </div>
      </div>
      
      <div style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
        {resultEntries
          .sort(([, a], [, b]) => {
            const timestampA = a.completedAt || a.errorAt || a.timeoutAt || a.submittedAt || '';
            const timestampB = b.completedAt || b.errorAt || b.timeoutAt || b.submittedAt || '';
            return new Date(timestampB) - new Date(timestampA);
          })
          .map(([taskId, result]) => (
            <div key={taskId} style={{ 
              padding: '8px 12px', 
              borderBottom: '1px solid #eee',
              backgroundColor: getStatusColor(result.status),
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
                    {formatTaskId(taskId)}
                  </span>
                </div>
                
                <div style={{ fontSize: '0.8em', color: '#666' }}>
                  Status: {result.status}
                </div>
                
                {result.result && (
                  <div style={{ marginTop: '4px', fontSize: '0.8em' }}>
                    <strong>Result:</strong> 
                    <code style={{ backgroundColor: '#f5f5f5', padding: '1px 3px', marginLeft: '4px' }}>
                      {truncateText(result.result)}
                    </code>
                  </div>
                )}
                
                {result.error && (
                  <div style={{ marginTop: '4px', fontSize: '0.8em', color: 'red' }}>
                    <strong>Error:</strong> {truncateText(result.error, 100)}
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
  );
};

// Simple API service (information hiding)
class TaskAPI {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  
  async submitTask(endpoint, payload) {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  }
  
  async getResult(taskId) {
    const response = await fetch(`${this.baseUrl}/result/${taskId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  }
}

// Main component - much simpler than original (400+ lines → ~150 lines)
export default function AppClean() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  
  const api = new TaskAPI(window.API_BASE || 'http://localhost:8000');
  
  // Simple polling function
  const pollResult = useCallback(async (taskId, maxAttempts = 20) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await api.getResult(taskId);
        
        if (data.status === 'done') {
          setResults(prev => ({ ...prev, [taskId]: { 
            status: 'done', 
            result: data.result, 
            completedAt: new Date().toISOString() 
          } }));
          
          // Update main status to show completion
          setStatus(prev => 
            prev?.taskId === taskId 
              ? { ...prev, completed: true } 
              : prev
          );
          
          return data.result;
        }
        
        setResults(prev => ({ ...prev, [taskId]: { 
          status: 'pending', 
          attempt: attempt + 1 
        } }));
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        setResults(prev => ({ ...prev, [taskId]: { 
          status: 'error', 
          error: err.message,
          errorAt: new Date().toISOString()
        } }));
        
        // Update main status to show error
        setStatus(prev => 
          prev?.taskId === taskId 
            ? { ...prev, error: err.message } 
            : prev
        );
        
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
    
    // Update main status to show timeout
    setStatus(prev => 
      prev?.taskId === taskId 
        ? { ...prev, error: timeoutError } 
        : prev
    );
    
    return null;
  }, [api]);
  
  // Simple task submission
  const submitTask = async (endpoint) => {
    setLoading(true);
    setStatus(null);
    
    try {
      const data = await api.submitTask(endpoint, input);
      const taskId = data.task_id;
      
      setStatus({ kind: endpoint, taskId, submitted: true });
      setResults(prev => ({ ...prev, [taskId]: { 
        status: 'pending', 
        submittedAt: new Date().toISOString(),
        taskType: endpoint 
      } }));
      
      pollResult(taskId);
    } catch (err) {
      setStatus({ error: err.message });
    } finally {
      setLoading(false);
    }
  };
  
  // Simple bulk submission
  const submitBulkTasks = async () => {
    setLoading(true);
    setStatus({ bulk: true, totalTasks: 100, submitted: 0 });
    
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      endpoint: ['task1', 'task2', 'task3'][i % 3],
      payload: `${input || 'BulkTask'}_${Math.random().toString(36).substr(2, 8)}_${i}`
    }));
    
    try {
      const promises = tasks.map(async (task, i) => {
        const data = await api.submitTask(task.endpoint, task.payload);
        const taskId = data.task_id;
        
        setResults(prev => ({ ...prev, [taskId]: { 
          status: 'pending', 
          submittedAt: new Date().toISOString(),
          taskType: task.endpoint,
          bulkTask: true,
          bulkIndex: i
        } }));
        
        setStatus(prev => ({ ...prev, submitted: prev.submitted + 1 }));
        pollResult(taskId, 10);
      });
      
      await Promise.allSettled(promises);
      setStatus(prev => ({ ...prev, submissionComplete: true, message: 'All tasks submitted!' }));
    } catch (err) {
      setStatus(prev => ({ ...prev, error: err.message }));
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Task Processing Demo (Clean Architecture)</h1>
      <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#666' }}>
        API: {window.API_BASE || 'http://localhost:8000'}
      </p>
      
      <TaskInput 
        input={input} 
        setInput={setInput} 
        onSubmit={submitTask} 
        loading={loading} 
      />
      
      <BulkTaskButton 
        onBulkSubmit={submitBulkTasks} 
        loading={loading} 
      />
      
      <StatusDisplay 
        status={status} 
        loading={loading} 
      />
      
      <ResultsList results={results} />
    </div>
  );
}