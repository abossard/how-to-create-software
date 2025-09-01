import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './tracing.js';
import { AppInsightsProvider } from './appInsightsProvider.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
	<AppInsightsProvider>
		<App />
	</AppInsightsProvider>
);
