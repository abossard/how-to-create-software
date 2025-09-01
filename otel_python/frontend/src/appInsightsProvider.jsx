import React from 'react';
import { AppInsightsContext } from '@microsoft/applicationinsights-react-js';
import { appInsights } from './tracing';

export function AppInsightsProvider({ children }) {
  return (
    <AppInsightsContext.Provider value={appInsights}>{children}</AppInsightsContext.Provider>
  );
}
