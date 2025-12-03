// Content script - Supabase backend version
// Sends article HTML to Supabase Edge Function and highlights results

(async function() {
  'use strict';
  
  Logger.info('Moneo extension loaded (Supabase backend)');
  
  // Check if already processed
  if (document.body.hasAttribute('data-moneo-processed')) {
    Logger.info('Page already processed, skipping');
    return;
  }
  
  // Mark as processed
  document.body.setAttribute('data-moneo-processed', 'true');
  
  try {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
    
    Logger.info('Starting fact-checking pipeline...');
    Logger.time('Total pipeline execution');
    
    // Show loading indicator immediately
    showLoadingIndicator('Analyzing article...');
    
    // Step 1: Extract article HTML
    Logger.group('Step 1: Extract Article HTML');
    const articleHTML = document.documentElement.outerHTML;
    const articleURL = window.location.href;
    
    if (!articleHTML || articleHTML.length < 100) {
      Logger.warn('Insufficient article HTML, aborting');
      Logger.groupEnd();
      hideLoadingIndicator();
      return;
    }
    
    Logger.info(`Extracted ${articleHTML.length} characters of HTML`);
    Logger.info(`Article URL: ${articleURL}`);
    Logger.groupEnd();
    
    // Step 2: Send to Supabase Edge Function
    Logger.group('Step 2: Send to Supabase');
    updateLoadingIndicator('Sending to server...');
    
    const result = await SupabaseClient.factCheck(articleHTML, articleURL);
    
    if (!result.success) {
      throw new Error(result.error || 'Fact-check failed');
    }
    
    const claims = result.claims || [];
    
    if (claims.length === 0) {
      Logger.warn('No claims found');
      Logger.groupEnd();
      hideLoadingIndicator();
      return;
    }
    
    Logger.info(`Received ${claims.length} scored claims`);
    if (result.cached) {
      Logger.info('(Results from cache)');
    }
    Logger.groupEnd();
    
    // Step 3: Highlight claims in DOM
    Logger.group('Step 3: Highlight Claims');
    updateLoadingIndicator('Highlighting claims...');
    await Highlighter.highlight(claims);
    Logger.info('Highlighting complete');
    Logger.groupEnd();
    
    // Hide loading indicator
    hideLoadingIndicator();
    
    Logger.timeEnd('Total pipeline execution');
    Logger.info('✅ Fact-checking pipeline complete!');
    
    // Log summary and save stats
    const summaryStats = logSummary(claims);
    await saveStats(summaryStats);
    
  } catch (error) {
    Logger.error('Pipeline execution failed:', error);
    
    // Hide loading indicator if visible
    hideLoadingIndicator();
    
    // Show user-friendly error
    let errorMessage = 'Moneo encountered an error.';
    
    if (error.message && error.message.includes('Supabase configuration')) {
      errorMessage = 'Please configure Supabase in extension settings.';
    } else if (error.message && error.message.includes('HTTP')) {
      errorMessage = 'Server error. Please try again later.';
    }
    
    showErrorNotification(errorMessage);
  }
})();

/**
 * Save statistics for popup
 * @param {Object} stats - Summary statistics
 */
async function saveStats(stats) {
  try {
    chrome.runtime.sendMessage({
      type: 'saveStats',
      stats: stats
    });
  } catch (error) {
    Logger.error('Failed to save stats:', error);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleHighlights') {
    if (message.enabled) {
      const highlights = document.querySelectorAll('.moneo-highlight');
      highlights.forEach(el => {
        el.style.backgroundColor = '';
        el.style.borderBottom = '';
      });
    } else {
      const highlights = document.querySelectorAll('.moneo-highlight');
      highlights.forEach(el => {
        el.style.backgroundColor = 'transparent';
        el.style.borderBottom = 'none';
      });
    }
    sendResponse({ success: true });
  }
  return true;
});

/**
 * Log summary of results and return stats object
 * @param {Array<object>} scoredClaims - Scored claims
 * @returns {Object} Statistics object
 */
function logSummary(scoredClaims) {
  Logger.group('📊 Summary');
  
  const highTrust = scoredClaims.filter(c => c.trustScore >= 7).length;
  const mediumTrust = scoredClaims.filter(c => c.trustScore >= 3 && c.trustScore < 7).length;
  const lowTrust = scoredClaims.filter(c => c.trustScore < 3).length;
  
  Logger.info(`Total claims: ${scoredClaims.length}`);
  Logger.info(`High trust (≥7): ${highTrust}`);
  Logger.info(`Medium trust (3-7): ${mediumTrust}`);
  Logger.info(`Low trust (<3): ${lowTrust}`);
  
  // Classification breakdown
  const classifications = {
    current_news: 0,
    general_knowledge: 0,
    empirical_fact: 0
  };
  
  scoredClaims.forEach(claim => {
    classifications[claim.classification]++;
  });
  
  Logger.info('Classifications:');
  Logger.info(`  - Current News: ${classifications.current_news}`);
  Logger.info(`  - General Knowledge: ${classifications.general_knowledge}`);
  Logger.info(`  - Empirical Fact: ${classifications.empirical_fact}`);
  
  Logger.groupEnd();
  
  return {
    totalClaims: scoredClaims.length,
    highTrust,
    mediumTrust,
    lowTrust,
    classifications,
    left: 0,
    center: 0,
    right: 0
  };
}

/**
 * Show loading indicator
 * @param {string} message - Loading message
 */
function showLoadingIndicator(message) {
  hideLoadingIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'moneo-loading-indicator';
  
  const lighthouseUrl = chrome.runtime.getURL('icons/lighthouse-search.gif');
  
  indicator.innerHTML = `
    <div class="moneo-loading-text">${message}</div>
    <img src="${lighthouseUrl}" class="moneo-loading-gif" alt="Loading">
  `;
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #220725;
    color: white;
    padding: 0;
    border-radius: 12px;
    box-shadow: 0 8px 16px rgba(0,0,0,0.2);
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    width: 200px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: moneo-slide-in 0.3s ease-out;
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes moneo-slide-in {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .moneo-loading-text {
      line-height: 1.4;
      font-weight: 500;
      text-align: center;
      padding: 12px 16px;
      margin: 0;
    }
    
    .moneo-loading-gif {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 0 0 12px 12px;
      margin: 0;
      padding: 0;
      mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 100%);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 100%);
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(indicator);
}

/**
 * Update loading indicator text
 * @param {string} message - New loading message
 */
function updateLoadingIndicator(message) {
  const indicator = document.getElementById('moneo-loading-indicator');
  if (indicator) {
    const textElement = indicator.querySelector('.moneo-loading-text');
    if (textElement) {
      textElement.textContent = message;
    }
  }
}

/**
 * Hide loading indicator with fade out
 */
function hideLoadingIndicator() {
  const indicator = document.getElementById('moneo-loading-indicator');
  if (indicator) {
    indicator.style.animation = 'moneo-slide-in 0.3s ease-out reverse';
    setTimeout(() => {
      indicator.remove();
    }, 300);
  }
}

/**
 * Show error notification to user
 * @param {string} message - Error message
 */
function showErrorNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'moneo-error-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 300px;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

