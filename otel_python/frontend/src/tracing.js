// Application Insights initialization (replaces prior OpenTelemetry web tracer setup)
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';

export const APPINSIGHTS_CONNECTION_STRING = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING;

const reactPlugin = new ReactPlugin();
export const appInsights = new ApplicationInsights({
  config: {
    connectionString: APPINSIGHTS_CONNECTION_STRING,
    enableAutoRouteTracking: true,
    autoTrackPageVisitTime: true,
    enableAjaxErrorStatusText: true,
    enableRequestHeaderTracking: false, // flip to true if you need headers (mind PII)
    enableResponseHeaderTracking: false,
    samplingPercentage: 100,
    extensions: [reactPlugin],
    extensionConfig: {
      [reactPlugin.identifier]: { history: null }
    }
  }
});

appInsights.loadAppInsights();

if (import.meta.env.DEV) {
  console.log('[AI] Application Insights initialized. Connection string present?', !!APPINSIGHTS_CONNECTION_STRING);
}

// Example custom event helper
export function trackEvent(name, properties) {
  appInsights.trackEvent({ name }, properties);
}

// Example error capture helper
export function trackError(error, props) {
  appInsights.trackException({ exception: error }, props);
}
