// Highlight claims in DOM and attach tooltips

// Import biasResolver (uses global scope in browser extension context)
var BiasResolver = (typeof module !== 'undefined' && module.exports) 
  ? require('../utils/biasResolver')  // Node.js
  : window.BiasResolver;              // Browser (from window global)

const Highlighter = {
  highlightedElements: [],
  
  /**
   * Highlight scored claims in the DOM
   * @param {Array<object>} scoredClaims - Claims with scores
   */
  highlight(scoredClaims) {
    try {
      Logger.time('Highlighting claims');
      Logger.info(`Highlighting ${scoredClaims.length} claims...`);
      
      if (!scoredClaims || scoredClaims.length === 0) {
        Logger.warn('No claims to highlight');
        return;
      }
      
      // Filter out claims without valid scores
      const validClaims = scoredClaims.filter(claim => {
        // Check if claim has a valid trustScore (not null, undefined, or NaN)
        const hasValidScore = claim.trustScore !== null && 
                             claim.trustScore !== undefined && 
                             !isNaN(claim.trustScore) &&
                             typeof claim.trustScore === 'number';
        
        if (!hasValidScore) {
          Logger.warn(`Skipping claim without valid score: "${claim.claim.substring(0, 50)}..."`);
          return false;
        }
        
        return true;
      });
      
      Logger.info(`${validClaims.length} of ${scoredClaims.length} claims have valid scores`);
      
      if (validClaims.length === 0) {
        Logger.warn('No claims with valid scores to highlight');
        return;
      }
      
      // Clear any existing highlights
      this.clearHighlights();
      
      // Get article content
      const articleContent = this.findArticleContent();
      
      if (!articleContent) {
        Logger.warn('Could not find article content');
        return;
      }
      
      // Highlight each claim
      let highlightedCount = 0;
      
      for (const claim of validClaims) {
        try {
          const highlighted = this.highlightClaim(claim, articleContent);
          if (highlighted) {
            highlightedCount++;
          }
        } catch (error) {
          Logger.error(`Failed to highlight claim ${claim.id}:`, error);
        }
      }
      
      Logger.info(`Highlighted ${highlightedCount} claims`);
      Logger.timeEnd('Highlighting claims');
    } catch (error) {
      Logger.error('Highlighting failed:', error);
    }
  },
  
  /**
   * Highlight a single claim
   * @param {object} claim - Claim with scores
   * @param {HTMLElement} container - Container to search in
   * @returns {boolean} True if highlighted successfully
   */
  highlightClaim(claim, container) {
    try {
      // Find the claim text across potentially multiple nodes
      const range = this.findTextRange(claim.claim, container);
      
      if (!range) {
        Logger.debug(`Could not find text for claim: "${claim.claim.substring(0, 50)}..."`);
        return false;
      }
      
      // Create highlight wrapper
      const highlight = document.createElement('span');
      highlight.className = this.getHighlightClass(claim.trustScore);
      highlight.setAttribute('data-claim-id', claim.id);
      highlight.setAttribute('data-trust-score', claim.trustScore.toFixed(1));
      highlight.setAttribute('data-classification', claim.classification);
      highlight.setAttribute('data-scores-json', JSON.stringify(claim.scores));
      
      // Store full claim data for tooltip
      if (claim.note) {
        highlight.setAttribute('data-note', claim.note);
      }
      
      // Try to wrap the range - if it fails due to crossing node boundaries,
      // fall back to extracting and re-inserting
      try {
        range.surroundContents(highlight);
      } catch (error) {
        // Range crosses element boundaries (e.g., contains <a> tags)
        // Extract contents and wrap them
        const contents = range.extractContents();
        highlight.appendChild(contents);
        range.insertNode(highlight);
      }
      
      // Add hover event listener for tooltip
      this.addTooltipListener(highlight, claim);
      
      // Store reference
      this.highlightedElements.push(highlight);
      
      return true;
    } catch (error) {
      Logger.debug(`Could not highlight claim: ${error.message}`);
      return false;
    }
  },
  
  /**
   * Find a Range object for the claim text (handles text across multiple nodes)
   * @param {string} claimText - Text to find
   * @param {HTMLElement} container - Container to search in
   * @returns {Range|null} Range object or null
   */
  findTextRange(claimText, container) {
    // Normalize claim text for comparison
    const normalizedClaim = claimText.trim().toLowerCase();
    
    // Get all text content from container
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip empty nodes and nodes in script/style tags
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          
          if (node.parentElement.tagName === 'SCRIPT' || 
              node.parentElement.tagName === 'STYLE' ||
              node.parentElement.classList.contains('moneo-highlight')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    // Collect all text nodes
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }
    
    // Search for claim text across text nodes
    for (let i = 0; i < textNodes.length; i++) {
      let combinedText = '';
      let nodeRanges = [];
      
      // Try building up text from consecutive nodes
      for (let j = i; j < textNodes.length && j < i + 20; j++) {
        const currentNode = textNodes[j];
        const nodeText = currentNode.textContent;
        const startPos = combinedText.length;
        combinedText += nodeText;
        
        nodeRanges.push({
          node: currentNode,
          startInCombined: startPos,
          endInCombined: combinedText.length,
          text: nodeText
        });
        
        // Check if we've found the claim
        const normalizedCombined = combinedText.trim().toLowerCase();
        const claimIndex = normalizedCombined.indexOf(normalizedClaim);
        
        if (claimIndex !== -1) {
          // Found it! Create a range spanning the necessary nodes
          const range = document.createRange();
          
          // Find start node and offset
          let startFound = false;
          let endFound = false;
          
          for (const nodeRange of nodeRanges) {
            const nodeStartInCombined = nodeRange.startInCombined;
            const nodeEndInCombined = nodeRange.endInCombined;
            
            // Check if claim starts in this node
            if (!startFound && claimIndex >= nodeStartInCombined && claimIndex < nodeEndInCombined) {
              const offsetInNode = claimIndex - nodeStartInCombined;
              // Find actual offset in the text node
              const actualOffset = nodeRange.text.toLowerCase().indexOf(normalizedCombined.substring(claimIndex - nodeStartInCombined));
              range.setStart(nodeRange.node, actualOffset >= 0 ? actualOffset : offsetInNode);
              startFound = true;
            }
            
            // Check if claim ends in this node
            const claimEnd = claimIndex + normalizedClaim.length;
            if (startFound && !endFound && claimEnd > nodeStartInCombined && claimEnd <= nodeEndInCombined) {
              const offsetInNode = claimEnd - nodeStartInCombined;
              range.setEnd(nodeRange.node, Math.min(offsetInNode, nodeRange.node.textContent.length));
              endFound = true;
              break;
            }
          }
          
          if (startFound && endFound) {
            return range;
          }
        }
      }
    }
    
    return null;
  },
  
  /**
   * Find text node containing claim text
   * @param {string} claimText - Text to find
   * @param {HTMLElement} container - Container to search in
   * @returns {Text|null} Text node or null
   */
  findTextNode(claimText, container) {
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip empty nodes and nodes in script/style tags
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          
          if (node.parentElement.tagName === 'SCRIPT' || 
              node.parentElement.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Check if node contains claim text (or part of it)
          const firstWords = claimText.split(' ').slice(0, 5).join(' ');
          if (node.textContent.includes(firstWords)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          
          return NodeFilter.FILTER_SKIP;
        }
      }
    );
    
    // Return first matching node
    return walker.nextNode();
  },
  
  /**
   * Add tooltip and click listeners to highlight element
   * @param {HTMLElement} element - Highlight element
   * @param {object} claim - Claim data
   */
  addTooltipListener(element, claim) {
    // Show tooltip on hover
    element.addEventListener('mouseenter', () => {
      Tooltip.show(claim, element);
    });
    
    // Show sources modal on click
    element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showSourcesModal(claim);
    });
    
    // Add visual indicator that it's clickable
    element.style.cursor = 'pointer';
  },
  
  /**
   * Show sources modal for a claim
   * @param {object} claim - Claim data with sources
   */
  showSourcesModal(claim) {
    // Hide tooltip first
    Tooltip.hide();
    
    // Remove any existing modal
    const existingModal = document.getElementById('moneo-sources-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'moneo-sources-modal';
    modal.className = 'moneo-modal';
    
    const sources = claim.sources || { web: [], scholar: [], all: [] };
    const webSources = sources.web || [];
    const scholarSources = sources.scholar || [];
    
    // Categorize web sources by political lean using centralized resolver
    const categorized = { left: [], center: [], right: [], unknown: [] };
    
    webSources.forEach(source => {
      // Use bias from source (must come from Edge Function - no client-side fallback)
      const bias = source.bias || 'unknown';
      
      if (bias === 'left' || bias === 'center' || bias === 'right') {
        categorized[bias].push(source);
      } else {
        categorized.unknown.push(source);
      }
    });
    
    const totalWeb = webSources.length;
    const leftPercent = totalWeb > 0 ? Math.round((categorized.left.length / totalWeb) * 100) : 0;
    const centerPercent = totalWeb > 0 ? Math.round((categorized.center.length / totalWeb) * 100) : 0;
    const rightPercent = totalWeb > 0 ? Math.round((categorized.right.length / totalWeb) * 100) : 0;
    
    modal.innerHTML = `
      <div class="moneo-modal-overlay"></div>
      <div class="moneo-modal-content">
        <div class="moneo-modal-header">
          <h2>📚 Sources & Bibliography</h2>
          <button class="moneo-modal-close">&times;</button>
        </div>
        
        <div class="moneo-modal-body">
          <div class="moneo-claim-text">
            "${claim.claim}"
          </div>
          
          <div class="moneo-trust-badge ${claim.trustScore >= 7 ? 'high' : claim.trustScore >= 3 ? 'medium' : 'low'}">
            Trust Score: ${claim.trustScore.toFixed(1)}/10
          </div>
          
          ${totalWeb > 0 ? `
            <div class="moneo-spectrum-section">
              <h3>Political Spectrum (Web Sources)</h3>
              <div class="moneo-spectrum-bar">
                ${leftPercent > 0 ? `<div class="moneo-spectrum-left" style="width: ${leftPercent}%">${leftPercent}% Left</div>` : ''}
                ${centerPercent > 0 ? `<div class="moneo-spectrum-center" style="width: ${centerPercent}%">${centerPercent}% Center</div>` : ''}
                ${rightPercent > 0 ? `<div class="moneo-spectrum-right" style="width: ${rightPercent}%">${rightPercent}% Right</div>` : ''}
              </div>
            </div>
          ` : ''}
          
          ${webSources.length > 0 ? `
            <div class="moneo-sources-section">
              <h3>🌐 Web Sources (${webSources.length})</h3>
              <div class="moneo-sources-list">
                ${this.renderSourcesByCategory(categorized)}
              </div>
            </div>
          ` : ''}
          
          ${scholarSources.length > 0 ? `
            <div class="moneo-sources-section">
              <h3>🎓 Academic Sources (${scholarSources.length})</h3>
              <div class="moneo-sources-list">
                ${scholarSources.map(source => `
                  <div class="moneo-source-item">
                    <a href="${source.url}" target="_blank" rel="noopener">
                      <div class="moneo-source-title">${source.title}</div>
                      <div class="moneo-source-domain">${source.domain}</div>
                      ${source.snippet ? `<div class="moneo-source-snippet">${source.snippet}</div>` : ''}
                    </a>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          ${webSources.length === 0 && scholarSources.length === 0 ? `
            <div class="moneo-no-sources">
              <p>No sources found for this claim</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add styles if not already added
    if (!document.getElementById('moneo-modal-styles')) {
      this.addModalStyles();
    }
    
    // Close handlers
    modal.querySelector('.moneo-modal-close').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.querySelector('.moneo-modal-overlay').addEventListener('click', () => {
      modal.remove();
    });
    
    // ESC key to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },
  
  /**
   * Render sources grouped by political category
   * @param {object} categorized - Sources grouped by lean
   * @returns {string} HTML string
   */
  renderSourcesByCategory(categorized) {
    let html = '';
    
    const categories = [
      { key: 'left', label: 'Left-Leaning', icon: '🔵' },
      { key: 'center', label: 'Center', icon: '🟣' },
      { key: 'right', label: 'Right-Leaning', icon: '🔴' },
      { key: 'unknown', label: 'Other', icon: '⚪' }
    ];
    
    categories.forEach(cat => {
      const sources = categorized[cat.key];
      if (sources && sources.length > 0) {
        html += `
          <div class="moneo-category-group">
            <div class="moneo-category-label">${cat.icon} ${cat.label} (${sources.length})</div>
            ${sources.map(source => `
              <div class="moneo-source-item">
                <a href="${source.url}" target="_blank" rel="noopener">
                  <div class="moneo-source-title">${source.title}</div>
                  <div class="moneo-source-domain">${source.domain}</div>
                  ${source.snippet ? `<div class="moneo-source-snippet">${source.snippet}</div>` : ''}
                </a>
              </div>
            `).join('')}
          </div>
        `;
      }
    });
    
    return html;
  },
  
  /**
   * Add modal styles to page
   */
  addModalStyles() {
    const style = document.createElement('style');
    style.id = 'moneo-modal-styles';
    style.textContent = `
      .moneo-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      
      .moneo-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
      }
      
      .moneo-modal-content {
        position: relative;
        background: white;
        border-radius: 12px;
        max-width: 700px;
        max-height: 85vh;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .moneo-modal-header {
        padding: 20px 24px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #f9fafb;
      }
      
      .moneo-modal-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #111827;
      }
      
      .moneo-modal-close {
        background: none;
        border: none;
        font-size: 32px;
        line-height: 1;
        cursor: pointer;
        color: #6b7280;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
      }
      
      .moneo-modal-close:hover {
        background: #e5e7eb;
        color: #111827;
      }
      
      .moneo-modal-body {
        padding: 24px;
        overflow-y: auto;
      }
      
      .moneo-claim-text {
        font-size: 15px;
        line-height: 1.6;
        color: #374151;
        background: #f3f4f6;
        padding: 16px;
        border-radius: 8px;
        border-left: 4px solid #8b5cf6;
        margin-bottom: 16px;
        font-style: italic;
      }
      
      .moneo-trust-badge {
        display: inline-block;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 20px;
      }
      
      .moneo-trust-badge.high {
        background: #d1fae5;
        color: #065f46;
      }
      
      .moneo-trust-badge.medium {
        background: #fef3c7;
        color: #92400e;
      }
      
      .moneo-trust-badge.low {
        background: #fee2e2;
        color: #991b1b;
      }
      
      .moneo-spectrum-section {
        margin-bottom: 24px;
      }
      
      .moneo-spectrum-section h3 {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .moneo-spectrum-bar {
        display: flex;
        height: 32px;
        border-radius: 6px;
        overflow: hidden;
        font-size: 12px;
        font-weight: 600;
      }
      
      .moneo-spectrum-left, .moneo-spectrum-center, .moneo-spectrum-right {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        transition: all 0.3s;
      }
      
      .moneo-spectrum-left {
        background: #3b82f6;
      }
      
      .moneo-spectrum-center {
        background: #8b5cf6;
      }
      
      .moneo-spectrum-right {
        background: #ef4444;
      }
      
      .moneo-sources-section {
        margin-bottom: 24px;
      }
      
      .moneo-sources-section h3 {
        font-size: 16px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 12px;
      }
      
      .moneo-sources-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .moneo-category-group {
        margin-bottom: 16px;
      }
      
      .moneo-category-label {
        font-size: 13px;
        font-weight: 600;
        color: #6b7280;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .moneo-source-item {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
        transition: all 0.2s;
      }
      
      .moneo-source-item:hover {
        background: #f3f4f6;
        border-color: #8b5cf6;
        box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1);
      }
      
      .moneo-source-item a {
        text-decoration: none;
        color: inherit;
        display: block;
      }
      
      .moneo-source-title {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 4px;
        line-height: 1.4;
      }
      
      .moneo-source-domain {
        font-size: 12px;
        color: #8b5cf6;
        margin-bottom: 6px;
      }
      
      .moneo-source-snippet {
        font-size: 13px;
        color: #6b7280;
        line-height: 1.5;
      }
      
      .moneo-no-sources {
        text-align: center;
        padding: 40px;
        color: #9ca3af;
      }
    `;
    document.head.appendChild(style);
  },
  
  /**
   * Get highlight CSS class based on trust score
   * @param {number} trustScore - Trust score
   * @returns {string} CSS class name
   */
  getHighlightClass(trustScore) {
    const baseClass = 'moneo-highlight';
    
    if (trustScore >= 7) {
      return `${baseClass} trust-high`;
    } else if (trustScore >= 3) {
      return `${baseClass} trust-medium`;
    } else {
      return `${baseClass} trust-low`;
    }
  },
  
  /**
   * Find main article content container
   * @returns {HTMLElement|null} Article container
   */
  findArticleContent() {
    // Try common article selectors
    const selectors = [
      'article',
      '[role="article"]',
      '.article-content',
      '.article-body',
      '.post-content',
      '.entry-content',
      'main article',
      'main'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        Logger.debug(`Found article content: ${selector}`);
        return element;
      }
    }
    
    // Fallback to body
    Logger.debug('Using document.body as fallback');
    return document.body;
  },
  
  /**
   * Clear all existing highlights
   */
  clearHighlights() {
    for (const element of this.highlightedElements) {
      try {
        // Replace highlight span with its text content
        const parent = element.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(element.textContent), element);
          parent.normalize(); // Merge adjacent text nodes
        }
      } catch (error) {
        Logger.debug('Could not clear highlight:', error);
      }
    }
    
    this.highlightedElements = [];
    
    // Also remove any orphaned tooltip
    Tooltip.hide();
  }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Highlighter;
}

