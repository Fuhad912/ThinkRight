/**
 * THINKRIGHT - GROQ AI CONFIGURATION
 * 
 * Configures the Groq API parameters for the JAMB Insider AI Chatbot.
 * Supports:
 * 1. Supabase Edge Function (default & recommended for production security)
 * 2. Client-side local key fallback (for local development & rapid testing)
 */
(function (window) {
  'use strict';

  const STORAGE_KEY = 'tr_groq_api_key';

  const GROQ_CONFIG = {
    // Model options:
    // - 'llama-3.3-70b-versatile' (recommended: superior reasoning & accuracy)
    // - 'llama-3.1-8b-instant' (ultra-fast responses)
    DEFAULT_MODEL: 'llama-3.3-70b-versatile',
    
    // Default placeholder. Replace with your actual Groq API Key or enter it in the UI settings
    API_KEY_PLACEHOLDER: 'YOUR_GROQ_API_KEY_HERE',

    // Edge function name in Supabase
    EDGE_FUNCTION_NAME: 'jamb-insider-ai',

    // Direct endpoint (used when client fallback is active)
    DIRECT_ENDPOINT: 'https://api.groq.com/openai/v1/chat/completions',

    /**
     * Get the active Groq API Key (checking localStorage first, then static config)
     */
    getApiKey: function () {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && stored.trim() && stored !== this.API_KEY_PLACEHOLDER) {
          return stored.trim();
        }
      } catch (e) {
        // ignore storage errors
      }
      return this.API_KEY_PLACEHOLDER;
    },

    /**
     * Save a local Groq API Key to localStorage
     */
    setApiKey: function (key) {
      try {
        if (!key || !key.trim()) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, key.trim());
        }
        return true;
      } catch (e) {
        console.error('Failed to save Groq API key to localStorage:', e);
        return false;
      }
    },

    /**
     * Check if a valid user key has been provided
     */
    hasValidKey: function () {
      const key = this.getApiKey();
      return Boolean(key && key !== this.API_KEY_PLACEHOLDER && key.startsWith('gsk_'));
    },

    /**
     * Clear the saved API key
     */
    clearApiKey: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // ignore
      }
    }
  };

  window.THINKRIGHT_GROQ_CONFIG = GROQ_CONFIG;
})(window);
