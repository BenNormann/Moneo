/**
 * Web Scraper - General Web Search
 * Queries DuckDuckGo HTML (free, no auth) for general web search results
 * Falls back to Bing on failure
 * 
 * Returns consistent format: [{url, title, snippet, domain}, ...]
 */

const WebScraper = {
  /**
   * Search the web using DuckDuckGo (with Bing fallback)
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results to return (default 10)
   * @returns {Promise<Array>} Array of {url, title, snippet, domain}
   */
  async search(query, maxResults = 10) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    try {
      // Try DuckDuckGo first
      const ddgResults = await this.searchDuckDuckGo(query, maxResults);
      if (ddgResults.length > 0) {
        return ddgResults;
      }
      
      // DuckDuckGo failed, try Bing
      Logger.info('DuckDuckGo returned no results, trying Bing fallback');
      const bingResults = await this.searchBing(query, maxResults);
      
      if (bingResults.length === 0) {
        Logger.warn('Both DuckDuckGo and Bing returned no results');
      }
      
      return bingResults;
      
    } catch (error) {
      Logger.error('Web search failed:', error);
      return [];
    }
  },
  
  /**
   * Search DuckDuckGo HTML endpoint
   * @param {string} query - Search query
   * @param {number} maxResults - Max results
   * @returns {Promise<Array>} Results array
   */
  async searchDuckDuckGo(query, maxResults) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    
    try {
      // Use background script to bypass CORS
      const response = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Timeout')), 5000);
        
        chrome.runtime.sendMessage({
          type: 'fetch',
          url: url,
          options: {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          }
        }, (response) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (!response.success) {
        Logger.log(`DuckDuckGo failed: ${response.status || 'error'}`);
        throw new Error(`DuckDuckGo HTTP ${response.status || 'error'}`);
      }
      
      Logger.log(`DuckDuckGo returned ${response.data.length} characters of HTML`);
      return this.parseDuckDuckGoHTML(response.data, maxResults);
      
    } catch (error) {
      // Don't log as warning - this is expected to fail sometimes
      return [];
    }
  },
  
  /**
   * Parse DuckDuckGo HTML response
   * @param {string} html - HTML content
   * @param {number} maxResults - Max results to extract
   * @returns {Array} Parsed results
   */
  parseDuckDuckGoHTML(html, maxResults) {
    const results = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // DuckDuckGo HTML uses div.result for each search result
    const resultElements = doc.querySelectorAll('div.result');
    Logger.log(`Found ${resultElements.length} DuckDuckGo result elements`);
    
    for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
      const element = resultElements[i];
      
      try {
        // Extract URL from result__a link
        const linkElement = element.querySelector('a.result__a');
        if (!linkElement) continue;
        
        const href = linkElement.getAttribute('href');
        if (!href) continue;
        
        // DuckDuckGo wraps URLs in their redirect, extract actual URL
        let actualUrl = href;
        if (href.includes('uddg=')) {
          const match = href.match(/uddg=([^&]+)/);
          if (match) {
            actualUrl = decodeURIComponent(match[1]);
          }
        }
        
        // Extract title
        const title = linkElement.textContent.trim();
        
        // Extract snippet from result__snippet
        const snippetElement = element.querySelector('a.result__snippet');
        const snippet = snippetElement 
          ? snippetElement.textContent.trim() 
          : '';
        
        // Extract domain
        const domain = this.extractDomain(actualUrl);
        
        if (actualUrl && title && domain) {
          results.push({
            url: actualUrl,
            title: title,
            snippet: snippet.substring(0, 200), // Limit to 200 chars
            domain: domain
          });
        }
      } catch (error) {
        // Skip malformed results
        continue;
      }
    }
    
    return results;
  },
  
  /**
   * Search Bing as fallback
   * @param {string} query - Search query
   * @param {number} maxResults - Max results
   * @returns {Promise<Array>} Results array
   */
  async searchBing(query, maxResults) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.bing.com/search?q=${encodedQuery}`;
    
    try {
      // Use background script to bypass CORS
      const response = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Timeout')), 5000);
        
        chrome.runtime.sendMessage({
          type: 'fetch',
          url: url,
          options: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          }
        }, (response) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (!response.success) {
        throw new Error(`Bing HTTP ${response.status || 'error'}`);
      }
      
      return await this.parseBingHTML(response.data, maxResults);
      
    } catch (error) {
      // Don't log here - will be logged in main search() if both fail
      return [];
    }
  },
  
  /**
   * Parse Bing HTML response
   * @param {string} html - HTML content
   * @param {number} maxResults - Max results
   * @returns {Promise<Array>} Parsed results
   */
  async parseBingHTML(html, maxResults) {
    // Use global URLUnwrapper exposed by content script load order
    const unwrapRedirect = (typeof window !== 'undefined' && window.URLUnwrapper && window.URLUnwrapper.unwrapRedirect)
      ? window.URLUnwrapper.unwrapRedirect
      : (u) => u;
    
    const rawResults = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Debug: Log the HTML structure to see what we're working with
    Logger.log(`Bing HTML length: ${html.length} characters`);
    
    // Bing uses li.b_algo for organic search results
    const resultElements = doc.querySelectorAll('li.b_algo');
    Logger.log(`Found ${resultElements.length} Bing result elements`);
    
    // Debug: Log the first few result elements to understand the structure
    if (resultElements.length > 0) {
      Logger.log('First Bing result element HTML:');
      Logger.log(resultElements[0].outerHTML.substring(0, 500) + '...');
    }
    
    for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
      const element = resultElements[i];
      
      try {
        // Extract URL from h2 > a
        const linkElement = element.querySelector('h2 a');
        if (!linkElement) {
          Logger.log(`No h2 a found in result ${i}`);
          continue;
        }
        
        const rawUrl = linkElement.getAttribute('href');
        if (!rawUrl) {
          Logger.log(`No href found in result ${i}`);
          continue;
        }
        
        Logger.log(`Bing result ${i}: href="${rawUrl}"`);
        
        // Extract title
        const title = linkElement.textContent.trim();
        
        // Extract snippet from p or .b_caption
        const snippetElement = element.querySelector('.b_caption p, .b_caption');
        const snippet = snippetElement 
          ? snippetElement.textContent.trim() 
          : '';
        
        if (rawUrl && title) {
          rawResults.push({
            url: rawUrl,
            title: title,
            snippet: snippet.substring(0, 200)
          });
        }
      } catch (error) {
        continue;
      }
    }
    
    // Clean the results using URL unwrapper
    // Process results sequentially to handle async URL resolution fallback
    const cleanResults = [];
    for (const r of rawResults) {
      const raw = r.url || r.link || r.href || '';
      let dest = unwrapRedirect(raw);
      let domain = '';
      
      // If unwrapping didn't work (still a Bing URL), try background script resolver
      if (dest && dest.includes('bing.com/ck/a')) {
        Logger.log(`Attempting background URL resolution for: ${dest.substring(0, 80)}...`);
        try {
          // Use background script to resolve the URL
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { type: 'RESOLVE_URL', url: dest },
              resolve
            );
          });
          if (response && response.ok && response.finalUrl) {
            Logger.log(`Background resolved: ${response.finalUrl.substring(0, 60)}...`);
            dest = response.finalUrl;
          } else {
            Logger.log(`Background resolution failed: ${JSON.stringify(response)}`);
          }
        } catch (e) {
          Logger.log(`Background resolution error: ${e.message}`);
        }
      }
      
      try { 
        domain = new URL(dest).hostname.replace(/^www\./, ''); 
      } catch (e) {
        Logger.log(`Failed to extract domain from: ${dest}`);
      }
      
      if (dest && domain && !domain.endsWith('bing.com')) {
        cleanResults.push({ ...r, url: dest, domain });
      }
    }
    
    Logger.log(`Cleaned ${rawResults.length} raw results to ${cleanResults.length} valid results`);
    
    return cleanResults;
  },
  
  /**
   * Extract domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name (e.g., "bbc.com")
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      // Remove www. prefix
      return hostname.replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebScraper;
}

