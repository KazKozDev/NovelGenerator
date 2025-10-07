/**
 * API Resilience Utilities - Fallback mechanisms and user notification system
 */

import { useState, useEffect } from 'react';

export interface APIStatus {
  isAvailable: boolean;
  lastError?: string;
  retryCount: number;
  lastSuccessTime?: number;
  estimatedRecoveryTime?: number;
}

export interface FallbackOptions {
  enableQueue: boolean;
  showUserNotifications: boolean;
  maxRetries: number;
  fallbackToLocalStorage: boolean;
}

class APIResilienceManager {
  private status: APIStatus = {
    isAvailable: true,
    retryCount: 0
  };

  private options: FallbackOptions = {
    enableQueue: true,
    showUserNotifications: true,
    maxRetries: 5,
    fallbackToLocalStorage: false
  };

  private listeners: Array<(status: APIStatus) => void> = [];

  updateStatus(isAvailable: boolean, error?: string) {
    const wasAvailable = this.status.isAvailable;

    this.status.isAvailable = isAvailable;
    this.status.lastError = error;

    if (isAvailable) {
      this.status.retryCount = 0;
      this.status.lastSuccessTime = Date.now();
      this.status.estimatedRecoveryTime = undefined;

      if (!wasAvailable) {
        this.notifyRecovery();
      }
    } else {
      this.status.retryCount++;
      this.estimateRecoveryTime();
      this.notifyOutage(error);
    }

    // Notify all listeners
    this.listeners.forEach(listener => listener(this.status));
  }

  private estimateRecoveryTime() {
    // Estimate recovery time based on error type and retry count
    let baseEstimate = 2 * 60 * 1000; // 2 minutes base

    if (this.status.lastError?.includes('overloaded') || this.status.lastError?.includes('UNAVAILABLE')) {
      baseEstimate = 5 * 60 * 1000; // 5 minutes for overload
    } else if (this.status.lastError?.includes('quota')) {
      baseEstimate = 60 * 60 * 1000; // 1 hour for quota
    }

    // Exponential backoff estimation
    const estimate = baseEstimate * Math.pow(1.5, Math.min(this.status.retryCount, 10));
    this.status.estimatedRecoveryTime = Date.now() + estimate;
  }

  private notifyOutage(error?: string) {
    if (!this.options.showUserNotifications) return;

    const errorType = this.getErrorType(error);
    const message = this.getErrorMessage(errorType);

    console.warn('🚨 API Outage detected:', {
      error: errorType,
      message,
      retryCount: this.status.retryCount,
      estimatedRecovery: this.status.estimatedRecoveryTime ?
        new Date(this.status.estimatedRecoveryTime).toLocaleTimeString() : 'Unknown'
    });

    // Could integrate with toast notifications here
    this.showUserNotification(message, 'warning');
  }

  private notifyRecovery() {
    if (!this.options.showUserNotifications) return;

    console.log('✅ API Service recovered');
    this.showUserNotification('API service has recovered. Generation can continue.', 'success');
  }

  private getErrorType(error?: string): string {
    if (!error) return 'unknown';

    if (error.includes('UNAVAILABLE') || error.includes('503') || error.includes('overloaded')) {
      return 'overload';
    } else if (error.includes('RESOURCE_EXHAUSTED') || error.includes('429')) {
      return 'rate_limit';
    } else if (error.includes('quota')) {
      return 'quota_exceeded';
    } else if (error.includes('API key')) {
      return 'auth_error';
    }

    return 'unknown';
  }

  private getErrorMessage(errorType: string): string {
    const messages = {
      overload: 'API service is temporarily overloaded. Your requests are queued and will be processed when service recovers.',
      rate_limit: 'Rate limit reached. Requests are being automatically spaced out.',
      quota_exceeded: 'API quota has been exceeded. Please check your account limits.',
      auth_error: 'API authentication error. Please check your API key configuration.',
      unknown: 'API service is experiencing issues. Retrying automatically...'
    };

    return messages[errorType] || messages.unknown;
  }

  private showUserNotification(message: string, type: 'success' | 'warning' | 'error') {
    // Simple console notification - could be enhanced with UI toasts
    const emoji = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌';
    console.log(`${emoji} ${message}`);

    // In a real implementation, this would trigger UI notifications
    // Example: toast.show({ message, type, duration: 5000 });
  }

  getStatus(): APIStatus {
    return { ...this.status };
  }

  onStatusChange(listener: (status: APIStatus) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  setOptions(newOptions: Partial<FallbackOptions>) {
    this.options = { ...this.options, ...newOptions };
  }

  // Fallback mechanisms
  suggestFallbackActions(): string[] {
    const suggestions = [];

    if (this.status.retryCount > 2) {
      suggestions.push('💡 Consider enabling queue mode to automatically retry requests');
    }

    if (this.status.lastError?.includes('overloaded')) {
      suggestions.push('💡 Try again in 5-10 minutes when server load decreases');
    }

    if (this.status.retryCount > 5) {
      suggestions.push('💡 Save your current progress and try again later');
    }

    return suggestions;
  }
}

// Global instance
export const apiResilienceManager = new APIResilienceManager();

/**
 * Wrapper function that updates resilience status based on API call results
 */
export async function withResilienceTracking<T>(
  apiCall: () => Promise<T>
): Promise<T> {
  try {
    const result = await apiCall();
    apiResilienceManager.updateStatus(true);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiResilienceManager.updateStatus(false, errorMessage);
    throw error;
  }
}

/**
 * Hook for React components to track API status
 */
export function useAPIStatus() {
  const [status, setStatus] = useState(apiResilienceManager.getStatus());

  useEffect(() => {
    const unsubscribe = apiResilienceManager.onStatusChange(setStatus);
    return unsubscribe;
  }, []);

  return status;
}