// MVP: Minimal content script for Supabase backend
// Lean startup - simplest version that works

(async function() {
  'use strict';
  
  Logger.info('Moneo MVP loaded');
  
  // Skip if already processed
  if (document.body.hasAttribute('data-moneo-processed')) {
    return;
  }
  document.body.setAttribute('data-moneo-processed', 'true');
  
  try {
    // Wait for page load
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    
    showLoadingIndicator('Analyzing article...');
    
    // Extract HTML and send to Supabase
    const html = document.documentElement.outerHTML;
    const url = window.location.href;
    
    updateLoadingIndicator('Processing...');
    
    const result = await SupabaseClient.factCheck(html, url);
    
    if (!result.success || !result.claims || result.claims.length === 0) {
      hideLoadingIndicator();
      return;
    }
    
    // Highlight claims
    updateLoadingIndicator('Highlighting...');
    await Highlighter.highlight(result.claims);
    
    hideLoadingIndicator();
    Logger.info(`✅ Processed ${result.claims.length} claims`);
    
  } catch (error) {
    Logger.error('Error:', error);
    hideLoadingIndicator();
    showErrorNotification('Moneo error. Check console for details.');
  }
})();

/**
 * Show loading indicator with lighthouse animation
 * @param {string} message - Loading message
 */
function showLoadingIndicator(message) {
  // Remove any existing indicator
  hideLoadingIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'moneo-loading-indicator';
  
  // Get the lighthouse GIF URL from extension
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
  
  // Add styles (only if not already added)
  if (!document.getElementById('moneo-loading-styles')) {
    const style = document.createElement('style');
    style.id = 'moneo-loading-styles';
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
  }
  
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

function showErrorNotification(message) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 999999;
    background: #ef4444; color: white; padding: 12px 16px;
    border-radius: 8px; font-family: system-ui; font-size: 14px;
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}
