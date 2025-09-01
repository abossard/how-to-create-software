import React from 'react';
import { AppInsightsContext, AppInsightsErrorBoundary } from '@microsoft/applicationinsights-react-js';
import { appInsights } from './tracing';

export function AppInsightsProvider({ children }) {
  return (
    <AppInsightsContext.Provider value={appInsights}>
      <AppInsightsErrorBoundary 
        onError={() => (
          <div style={{ padding: '20px', backgroundColor: '#ffe6e6', border: '1px solid #cc0000' }}>
            <h2>Something went wrong</h2>
            <p>An error occurred and has been logged for investigation.</p>
            <button onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        )} 
        appInsights={appInsights}
      >
        {children}
      </AppInsightsErrorBoundary>
    </AppInsightsContext.Provider>
  );
}
