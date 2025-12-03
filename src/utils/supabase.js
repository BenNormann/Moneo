/**
 * Supabase client for Moneo extension
 * Handles communication with Supabase Edge Functions
 */

const SupabaseClient = {
  supabaseUrl: null,
  supabaseAnonKey: null,
  
  /**
   * Initialize Supabase client
   * @param {string} url - Supabase project URL
   * @param {string} anonKey - Supabase anonymous key
   */
  init(url, anonKey) {
    this.supabaseUrl = url;
    this.supabaseAnonKey = anonKey;
  },
  
  /**
   * Get Supabase configuration from storage or config
   * @returns {Promise<{url: string, anonKey: string}>}
   */
  async getConfig() {
    try {
      // Try to get from Chrome storage first
      const stored = await chrome.storage.local.get(['supabase_url', 'supabase_anon_key']);
      
      if (stored.supabase_url && stored.supabase_anon_key) {
        return {
          url: stored.supabase_url,
          anonKey: stored.supabase_anon_key
        };
      }
      
      // Fallback to config (if set)
      if (CONFIG.supabase && CONFIG.supabase.url && CONFIG.supabase.anonKey) {
        return {
          url: CONFIG.supabase.url,
          anonKey: CONFIG.supabase.anonKey
        };
      }
      
      throw new Error('Supabase configuration not found');
    } catch (error) {
      Logger.error('Failed to get Supabase config:', error);
      throw error;
    }
  },
  
  /**
   * Call Supabase Edge Function for fact-checking
   * @param {string} html - Article HTML
   * @param {string} url - Article URL
   * @returns {Promise<{success: boolean, claims: Array, cached: boolean}>}
   */
  async factCheck(html, url) {
    try {
      const config = await this.getConfig();
      
      if (!this.supabaseUrl || !this.supabaseAnonKey) {
        this.init(config.url, config.anonKey);
      }
      
      const functionUrl = `${this.supabaseUrl}/functions/v1/fact-check`;
      
      Logger.log('Calling Supabase fact-check function...');
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
          'apikey': this.supabaseAnonKey
        },
        body: JSON.stringify({
          html: html,
          url: url
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.cached) {
        Logger.log('✅ Cache hit - using cached results');
      } else {
        Logger.log('✅ New analysis complete');
      }
      
      return data;
    } catch (error) {
      Logger.error('Supabase fact-check failed:', error);
      throw error;
    }
  },
  
  /**
   * Set Supabase configuration
   * @param {string} url - Supabase project URL
   * @param {string} anonKey - Supabase anonymous key
   */
  async setConfig(url, anonKey) {
    try {
      await chrome.storage.local.set({
        supabase_url: url,
        supabase_anon_key: anonKey
      });
      
      this.init(url, anonKey);
      Logger.info('Supabase configuration saved');
    } catch (error) {
      Logger.error('Failed to save Supabase config:', error);
      throw error;
    }
  }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseClient;
}

