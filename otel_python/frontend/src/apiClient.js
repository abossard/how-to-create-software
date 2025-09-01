// Enhanced API client with Application Insights dependency tracking and custom task spans
export class AppInsightsApiClient {
  constructor(appInsights, baseUrl) {
    this.appInsights = appInsights;
    this.baseUrl = baseUrl;
  }

  // Create custom task span for business operations
  createTaskSpan(taskType, inputText, taskId = null) {
    const spanName = `Task.${taskType}`;
    const startTime = Date.now();
    
    // Create a custom operation for this task
    const operation = this.appInsights.startTrackPage(spanName);
    
    // Track as custom event with rich attributes
    this.appInsights.trackEvent({
      name: `TaskOperation.${taskType}`,
      properties: {
        'task.type': taskType,
        'task.input_text': inputText,
        'task.input_length': inputText.length,
        'task.id': taskId || 'pending',
        'task.status': 'started',
        'operation.name': spanName,
        'operation.start_time': new Date(startTime).toISOString(),
        'browser.user_agent': navigator.userAgent,
        'task.word_count': inputText.split(/\s+/).length
      },
      measurements: {
        'task.input_characters': inputText.length,
        'task.input_words': inputText.split(/\s+/).length,
        'operation.start_timestamp': startTime
      }
    });

    return {
      spanName,
      startTime,
      operation,
      complete: (result, status = 'completed', error = null) => {
        const duration = Date.now() - startTime;
        
        // Track task completion
        this.appInsights.trackEvent({
          name: `TaskOperation.${taskType}.${status}`,
          properties: {
            'task.type': taskType,
            'task.input_text': inputText,
            'task.input_length': inputText.length,
            'task.id': taskId || 'unknown',
            'task.status': status,
            'task.result': result ? String(result).substring(0, 500) : null,
            'task.error': error,
            'operation.name': spanName,
            'operation.duration_ms': duration,
            'operation.end_time': new Date().toISOString()
          },
          measurements: {
            'task.duration_ms': duration,
            'task.input_characters': inputText.length,
            'task.output_characters': result ? String(result).length : 0
          }
        });

        // Stop the operation
        if (operation && operation.stop) {
          operation.stop();
        }
      }
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/${endpoint}`;
    const startTime = Date.now();
    const method = options.method || 'GET';
    
    // Generate a unique ID for this dependency call
    const dependencyId = this.generateDependencyId();
    
    try {
      console.log(`[AI] Starting ${method} ${endpoint} - Dependency ID: ${dependencyId}`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          // Note: Application Insights SDK will automatically add correlation headers
          // when enableCorsCorrelation is true
        }
      });
      
      const duration = Date.now() - startTime;
      const requestId = response.headers.get('Request-Id') || response.headers.get('request-id');
      
      // Track successful dependency
      this.appInsights.trackDependencyData({
        id: dependencyId,
        target: this.baseUrl,
        name: `${method} /${endpoint}`,
        data: url,
        duration: duration,
        resultCode: response.status,
        success: response.ok,
        type: 'Ajax',
        properties: {
          endpoint: endpoint,
          method: method,
          correlationId: requestId || 'unknown',
          requestSize: options.body ? options.body.length : 0
        }
      });
      
      console.log(`[AI] Completed ${method} ${endpoint} - Status: ${response.status}, Duration: ${duration}ms`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Track failed dependency
      this.appInsights.trackDependencyData({
        id: dependencyId,
        target: this.baseUrl,
        name: `${method} /${endpoint}`,
        data: url,
        duration: duration,
        resultCode: 0,
        success: false,
        type: 'Ajax',
        properties: {
          endpoint: endpoint,
          method: method,
          error: error.message,
          requestSize: options.body ? options.body.length : 0
        }
      });
      
      // Also track as exception
      this.appInsights.trackException({
        exception: error,
        properties: {
          operation: 'api_request',
          endpoint: endpoint,
          method: method,
          url: url
        }
      });
      
      console.error(`[AI] Failed ${method} ${endpoint} - Error: ${error.message}, Duration: ${duration}ms`);
      
      throw error;
    }
  }

  // Helper method to generate unique dependency IDs
  generateDependencyId() {
    return 'dep_' + Math.random().toString(36).substr(2, 9);
  }

  // Convenience methods for common HTTP verbs
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Create a default instance
export const createApiClient = (appInsights, baseUrl) => {
  return new AppInsightsApiClient(appInsights, baseUrl);
};