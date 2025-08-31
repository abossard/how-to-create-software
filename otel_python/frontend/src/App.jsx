import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function App() {
  const [input, setInput] = useState('');

  const send = (endpoint) => {
    fetch(`${API_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  };

  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => send('task1')}>Task1</button>
      <button onClick={() => send('task2')}>Task2</button>
      <button onClick={() => send('task3')}>Task3</button>
    </div>
  );
}
