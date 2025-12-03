// Configuration constants for Moneo extension

const CONFIG = {
  // Supabase configuration
  supabase: {
    url: 'https://tqholygduvliggwkdaqy.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxaG9seWdkdXZsaWdnd2tkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MzQ3NDIsImV4cCI6MjA4MDIxMDc0Mn0.-EqYirG8EZFT4NJY9iKZ-ormM_69N-BZOI2iEjqB37U'
  },
  
  // OpenAI (legacy - now handled by Supabase Edge Functions)
  openai: {
    apiKey: '', // Set via chrome.storage or environment
    model: 'gpt-4o-mini' // Faster, cheaper, better rate limits
  },
  
  // Scoring weights by classification type
  scoringWeights: {
    current_news: {
      aiRating: 0.4,
      toneAnalysis: 0.3,
      scholarlyMatch: 0.0,
      webReinforced: 0.3
    },
    general_knowledge: {
      aiRating: 0.4,
      toneAnalysis: 0.3,
      scholarlyMatch: 0.0,
      webReinforced: 0.3
    },
    empirical_fact: {
      aiRating: 0.2,
      toneAnalysis: 0.25,
      scholarlyMatch: 0.3,
      webReinforced: 0.25
    }
  },
  
  // UI colors
  colors: {
    high: '#22c55e',    // Green
    medium: '#eab308',  // Yellow
    low: '#ef4444'      // Red
  },
  
  // Caching
  cache: {
    ttl: 86400  // 24 hours in seconds
  },
  
  // Performance
  maxClaimsPerArticle: 50,
  timeoutSeconds: 30,
  
  // Scholar search domains
  scholarDomains: {
    scholar: 'https://scholar.google.com/scholar',
    pubmed: 'https://pubmed.ncbi.nlm.nih.gov',
    britannica: 'https://www.britannica.com',
    arxiv: 'https://arxiv.org'
  },
  
  // Web search
  webSearch: {
    maxResults: 10,
    minSources: 4
  }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

