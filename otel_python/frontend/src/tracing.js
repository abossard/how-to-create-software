// Application Insights initialization (replaces prior OpenTelemetry web tracer setup)
import { ApplicationInsights, DistributedTracingModes } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';

export const APPINSIGHTS_CONNECTION_STRING = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING;

// Validate connection string format
const isValidConnectionString = (connectionString) => {
  if (!connectionString) return false;
  // Connection string should contain InstrumentationKey and IngestionEndpoint
  return connectionString.includes('InstrumentationKey=') && 
         connectionString.includes('IngestionEndpoint=');
};

const reactPlugin = new ReactPlugin();
let appInsightsInstance;

// Only initialize if we have a valid connection string
if (isValidConnectionString(APPINSIGHTS_CONNECTION_STRING)) {
  appInsightsInstance = new ApplicationInsights({
    config: {
      connectionString: APPINSIGHTS_CONNECTION_STRING,
      enableAutoRouteTracking: true,
      autoTrackPageVisitTime: true,
      enableAjaxErrorStatusText: true,
      enableRequestHeaderTracking: true, // Track outgoing headers for correlation
      enableResponseHeaderTracking: false, // Avoid PII in responses
      enableCorsCorrelation: true, // ✅ Enable cross-origin correlation headers
      distributedTracingMode: DistributedTracingModes.AI_AND_W3C, // ✅ W3C + AI compatibility
      correlationHeaderExcludedDomains: [], // ✅ Don't exclude any domains (allow all)
      samplingPercentage: 100,
      
      // 🔥 Live Metrics Stream Configuration
      enableLiveMetrics: true,                    // Enable Live Metrics Stream
      maxBatchInterval: 1000,                     // Send data every 1 second (instead of default 15s)
      maxBatchSizeInBytes: 10000,                 // Smaller batches for faster delivery
      enableAjaxPerfTracking: true,               // Track AJAX performance metrics in real-time
      enableUnhandledPromiseRejectionTracking: true, // Track unhandled promise rejections
      enableDebugExceptions: true,                // Enhanced exception tracking
      
      // Enhanced Real-time Session Tracking
      enableSessionStorageBuffer: true,           // Use session storage for better buffering
      isStorageUseDisabled: false,                // Allow local storage for performance
      enablePerfMgr: true,                        // Enable performance manager for live metrics
      maxAjaxCallsPerView: 50,                    // Track more AJAX calls for comprehensive view
      isBrowserLinkTrackingEnabled: false,       // Disable browser link tracking for cleaner data
      
      extensions: [reactPlugin],
      extensionConfig: {
        [reactPlugin.identifier]: { history: null }
      }
    }
  });

  appInsightsInstance.loadAppInsights();
  
  if (import.meta.env.DEV) {
    console.log('[AI] Application Insights initialized successfully with Live Metrics');
    console.log('[AI] Connection string format valid:', isValidConnectionString(APPINSIGHTS_CONNECTION_STRING));
    console.log('[AI] Live Metrics enabled: Real-time data will appear in Azure portal within 1-5 seconds');
    console.log('[AI] Batch interval: 1000ms, Enhanced tracking: enabled');
  }
} else {
  console.warn('[AI] Application Insights not initialized - invalid or missing connection string');
  console.warn('[AI] Expected format: InstrumentationKey=xxx;IngestionEndpoint=xxx;...');
  
  // Create a mock appInsights object to prevent errors
  appInsightsInstance = {
    trackEvent: () => console.warn('[AI] trackEvent called but App Insights not initialized'),
    trackException: () => console.warn('[AI] trackException called but App Insights not initialized'),
    trackPageView: () => console.warn('[AI] trackPageView called but App Insights not initialized'),
    trackMetric: () => console.warn('[AI] trackMetric called but App Insights not initialized'),
    loadAppInsights: () => {},
  };
}

export const appInsights = appInsightsInstance;

// Example custom event helper
export function trackEvent(name, properties) {
  appInsights.trackEvent({ name }, properties);
}

// Example error capture helper
export function trackError(error, props) {
  appInsights.trackException({ exception: error }, props);
}
