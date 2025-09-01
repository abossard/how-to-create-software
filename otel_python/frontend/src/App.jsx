import React, { useState } from 'react';

// Runtime-injected by Fastify via <script>window.API_BASE = "...";</script>
// Fallback remains localhost:8000 if not set (useful for dev without server injection).
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || 'http://localhost:8000';

export default function App() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const send = (endpoint) => {
    setLoading(true);
    setStatus(null);
    fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setStatus({ kind: endpoint, taskId: data.task_id });
      })
      .catch((err) => {
        console.error('API error', err);
        setStatus({ error: err.message });
      })
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <p style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>API: {API_BASE}</p>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button disabled={loading} onClick={() => send('task1')}>Task1</button>
      <button disabled={loading} onClick={() => send('task2')}>Task2</button>
      <button disabled={loading} onClick={() => send('task3')}>Task3</button>
      {loading && <p>Sending...</p>}
      {status && !status.error && (
        <p>Enqueued {status.kind} task. ID: {status.taskId}</p>
      )}
      {status && status.error && (
        <p style={{ color: 'red' }}>Error: {status.error}</p>
      )}
    </div>
  );
}
