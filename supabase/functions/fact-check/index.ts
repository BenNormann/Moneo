// @ts-nocheck
// Complete Supabase Edge Function for fact-checking
// Ports all original scoring logic: AI, Scholar, Web, Tone Analysis
// Note: TypeScript errors are false positives - Deno runtime provides all globals

// @ts-ignore - Deno runtime types
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - ESM import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Type declarations for Deno runtime globals
// These are available at runtime but TypeScript needs explicit declarations
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// Web API globals (available in Deno runtime)
// @ts-ignore - Runtime global
declare const Response: any;
// @ts-ignore - Runtime global
declare const fetch: any;
// @ts-ignore - Runtime global
declare const console: any;
// @ts-ignore - Runtime global
declare const TextEncoder: any;
// @ts-ignore - Runtime global
declare const URL: any;
// @ts-ignore - Runtime global
declare const crypto: any;
// @ts-ignore - Runtime global
declare const setTimeout: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FactCheckRequest {
  html: string;
  url: string;
}

// Scoring weights by classification (from claimScorer.js)
const SCORING_WEIGHTS = {
  current_news: {
    aiRating: 0.475,
    toneAnalysis: 0.05,
    scholarlyMatch: 0.0,
    webReinforced: 0.475
  },
  general_knowledge: {
    aiRating: 0.475,
    toneAnalysis: 0.05,
    scholarlyMatch: 0.0,
    webReinforced: 0.475
  },
  empirical_fact: {
    aiRating: 0.25,
    toneAnalysis: 0.05,
    scholarlyMatch: 0.45,
    webReinforced: 0.25
  }
};

// Academic domains (from scholarScorer.js)
const ACADEMIC_DOMAINS = [
  'edu', 'ac.uk', 'nih.gov', 'nature.com', 'science.org',
  'springer.com', 'ieee.org', 'acm.org', 'arxiv.org', 'pubmed', 'researchgate.net'
];

// Bias map (exact copy from biasResolver.js DEFAULT_MAP)
// Single source of truth for domain political bias classification
const BIAS_MAP: Record<string, string> = {
  // LEFT-LEANING
  "cnn.com": "left",
  "nytimes.com": "left",
  "washingtonpost.com": "left",
  "huffpost.com": "left",
  "huffingtonpost.com": "left",
  "motherjones.com": "left",
  "buzzfeednews.com": "left",
  "theguardian.com": "left",
  "msnbc.com": "left",
  "vox.com": "left",
  "slate.com": "left",
  "thedailybeast.com": "left",
  "thinkprogress.org": "left",
  "npr.org": "left",
  "pbs.org": "left",
  "politico.com": "left",
  "theatlantic.com": "left",
  
  // CENTER
  "reuters.com": "center",
  "apnews.com": "center",
  "bbc.com": "center",
  "bbc.co.uk": "center",
  "c-span.org": "center",
  "csmonitor.com": "center",
  "usatoday.com": "center",
  "axios.com": "center",
  "thehill.com": "center",
  "bloomberg.com": "center",
  "marketwatch.com": "center",
  "economist.com": "center",
  "forbes.com": "center",
  "time.com": "center",
  "newsweek.com": "center",
  "abcnews.go.com": "center",
  "cbsnews.com": "center",
  "nbcnews.com": "center",
  
  // RIGHT-LEANING
  "foxnews.com": "right",
  "foxbusiness.com": "right",
  "wsj.com": "right",
  "nationalreview.com": "right",
  "dailywire.com": "right",
  "breitbart.com": "right",
  "nypost.com": "right",
  "washingtontimes.com": "right",
  "theblaze.com": "right",
  "oann.com": "right",
  "newsmax.com": "right",
  "dailycaller.com": "right",
  "townhall.com": "right",
  "spectator.org": "right",
  "washingtonexaminer.com": "right"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { html, url }: FactCheckRequest = await req.json();
    if (!html || !url) {
      return new Response(
        JSON.stringify({ error: "Missing html or url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache (with version check to invalidate old cache format)
    // NOTE: We cache by URL only, not HTML hash, because HTML includes dynamic content
    // (ads, timestamps, tracking) that changes every visit, but article content is stable
    const CACHE_VERSION = 2; // Increment when cache format changes (e.g., added bias to sources)
    const urlHash = await hashString(url);
    console.log(`[Cache] Checking cache for URL: ${url.substring(0, 50)}...`);
    const { data: cached } = await supabase
      .from("article_cache")
      .select("claims, cache_version")
      .eq("url_hash", urlHash)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }) // Get most recent cache entry
      .limit(1)
      .single();
    
    if (cached) {
      console.log(`[Cache] Found cached entry (version: ${cached.cache_version || 'none'})`);
    } else {
      console.log(`[Cache] ❌ Cache MISS - will process and cache results`);
    }

    // Only use cache if version matches (invalidates old cache when we change format)
    if (cached?.claims && (cached.cache_version === CACHE_VERSION || !cached.cache_version)) {
      // If old cache (no version), check if it has the new format (bias in sources)
      const hasNewFormat = cached.claims.some((claim: any) => 
        claim.sources?.web?.some((source: any) => source.bias !== undefined)
      );
      
      if (hasNewFormat || cached.cache_version === CACHE_VERSION) {
        console.log(`[Cache] ✅ Cache HIT for ${url.substring(0, 50)}... - returning cached results instantly`);
        return new Response(
          JSON.stringify({ success: true, cached: true, claims: cached.claims }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Old format cache - will regenerate below
    }

    // Extract article text
    const articleText = extractArticleText(html);
    if (articleText.length < 100) {
      return new Response(
        JSON.stringify({ error: "Insufficient text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Extract claims (full logic)
    const claims = extractClaims(articleText);
    if (claims.length === 0) {
      return new Response(
        JSON.stringify({ success: true, claims: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Classify claims
    console.log(`[Processing] Classifying ${claims.length} claims...`);
    const classifiedClaims = await classifyClaims(claims, supabase);
    console.log(`[Processing] Classification complete`);

    // Step 3: Score all claims (full scoring pipeline)
    console.log(`[Processing] Scoring ${classifiedClaims.length} claims (this may take 10-30 seconds)...`);
    const scoredClaims = await scoreAllClaims(classifiedClaims, supabase, url);
    console.log(`[Processing] Scoring complete`);

    // Cache results (with version for cache invalidation)
    // NOTE: We only cache by URL, not HTML hash, because HTML changes but article content is stable
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    console.log(`[Cache] 💾 Caching results for ${scoredClaims.length} claims (expires: ${expiresAt.toISOString()})`);
    await supabase.from("article_cache").upsert({
      url_hash: urlHash,
      url: url,
      html_hash: '', // No longer used for cache lookup, but kept for backwards compatibility
      claims: scoredClaims,
      cache_version: CACHE_VERSION,
      expires_at: expiresAt.toISOString(),
    }, {
      onConflict: 'url_hash' // Update existing cache entry for this URL
    });
    console.log(`[Cache] ✅ Results cached successfully`);

    return new Response(
      JSON.stringify({ success: true, cached: false, claims: scoredClaims }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(str));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractArticleText(html: string): string {
  // Remove scripts and styles
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Remove navigation/UI elements
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Clean whitespace
  text = text.replace(/\s+/g, " ").trim();
  
  return text;
}

// ============================================================================
// CLAIM EXTRACTION (Full logic from claimExtractor.js)
// ============================================================================

interface Claim {
  id: string;
  claim: string;
  source: string;
  context: string;
  position: { start: number; end: number };
}

function extractClaims(text: string): Claim[] {
  // Remove noise
  text = removeNoiseElements(text);
  
  // Split into sentences
  let sentences = splitIntoSentences(text);
  
  // Merge quoted content
  sentences = mergeQuotedContent(sentences);
  
  const claims: Claim[] = [];
  let currentPos = 0;
  
  for (let i = 0; i < sentences.length && claims.length < 50; i++) {
    const sentence = sentences[i];
    const sentenceStart = text.indexOf(sentence, currentPos);
    if (sentenceStart === -1) {
      currentPos += sentence.length;
      continue;
    }
    
    const sentenceEnd = sentenceStart + sentence.length;
    currentPos = sentenceEnd;
    
    if (isCheckWorthyClaim(sentence)) {
      claims.push({
        id: `claim_${claims.length + 1}`,
        claim: sentence.trim(),
        source: detectSource(sentence),
        context: getContext(sentences, i),
        position: { start: sentenceStart, end: sentenceEnd }
      });
    }
  }
  
  return claims;
}

function removeNoiseElements(text: string): string {
  const lines = text.split('\n');
  const cleanedLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.split(/\s+/).length === 1 && trimmed.length < 15) continue;
    if (/^\d+\s+(days?|hours?|mins?)\s+ago$/i.test(trimmed)) continue;
    if (/^(Share|Save|Facebook|Twitter|Login|Watch TV|Podcasts)$/i.test(trimmed)) continue;
    if (/^(Related|Trending|Popular|See Also|More From)/i.test(trimmed)) break;
    if (/©\s*20\d{2}/i.test(trimmed)) continue;
    if (/All rights reserved/i.test(trimmed)) continue;
    if (/Sign up|Subscribe|Enter email/i.test(trimmed) && trimmed.length < 100) continue;
    
    cleanedLines.push(trimmed);
  }
  
  return cleanedLines.join('\n');
}

function splitIntoSentences(text: string): string[] {
  // Handle abbreviations
  let processed = text
    .replace(/Dr\./g, 'Dr')
    .replace(/Mr\./g, 'Mr')
    .replace(/U\.S\./g, 'US')
    .replace(/etc\./g, 'etc');
  
  const paragraphs = processed.split(/\n+/);
  const allSentences: string[] = [];
  
  for (const para of paragraphs) {
    if (para.trim().length === 0) continue;
    const sentences = smartSplitSentences(para);
    allSentences.push(...sentences);
  }
  
  return allSentences.filter(s => s.trim().length > 20);
}

function smartSplitSentences(text: string): string[] {
  const sentences: string[] = [];
  let currentSentence = '';
  let inQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    currentSentence += char;
    
    if (char === '"' || char === '"') {
      inQuote = !inQuote;
    }
    
    if (!inQuote && /[.!?]/.test(char)) {
      const nextChar = text[i + 1];
      const nextNextChar = text[i + 2];
      
      if (nextChar === ' ' && nextNextChar && /[A-Z]/.test(nextNextChar)) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
        i++;
      } else if (i === text.length - 1 || !nextChar) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
      }
    }
  }
  
  if (currentSentence.trim().length > 0) {
    sentences.push(currentSentence.trim());
  }
  
  return sentences;
}

function mergeQuotedContent(sentences: string[]): string[] {
  const merged: string[] = [];
  let i = 0;
  
  while (i < sentences.length) {
    const sentence = sentences[i];
    const hasQuote = sentence.includes('"') || sentence.includes('"');
    
    if (hasQuote) {
      const openQuotes = (sentence.match(/[""]/g) || []).length;
      const closeQuotes = (sentence.match(/[""]/g) || []).length;
      
      if (openQuotes > closeQuotes) {
        let mergedSentence = sentence;
        let j = i + 1;
        
        while (j < sentences.length && j - i < 4) {
          mergedSentence += ' ' + sentences[j];
          const totalOpen = (mergedSentence.match(/[""]/g) || []).length;
          const totalClose = (mergedSentence.match(/[""]/g) || []).length;
          j++;
          if (totalOpen <= totalClose) break;
        }
        
        merged.push(mergedSentence.trim());
        i = j;
        continue;
      }
    }
    
    merged.push(sentence);
    i++;
  }
  
  return merged;
}

function isCheckWorthyClaim(sentence: string): boolean {
  const trimmed = sentence.trim();
  const lower = trimmed.toLowerCase();
  
  // Structural requirements
  if (trimmed.length < 25) return false;
  if (trimmed.endsWith('?')) return false;
  
  const hasMainVerb = /\b(is|are|was|were|has|have|had|will|would|can|could|may|might|must|said|told|reported|shows|indicates|suggests|found|discovered|revealed|claims|states)\b/i.test(trimmed);
  if (!hasMainVerb) return false;
  
  // Noise filters
  const uiPatterns = [
    /^(click|tap|download|subscribe|read more|learn more|watch|listen|follow|join)\b/i,
    /\bclick here\b/i,
    /\bsign up\b/i
  ];
  
  if (uiPatterns.some(p => p.test(lower))) return false;
  
  // Check-worthiness scoring
  let score = 0;
  
  if (/\b(cause[ds]?|causing|lead[s]?|led|result[s]?|contribute[ds]?|trigger[s]?)\b/i.test(trimmed)) score += 2;
  if (/\b(conclude[ds]?|found|discover[eds]?|reveal[s]?|show[s]?|demonstrate[ds]?|indicate[ds]?|suggest[s]?|confirm[s]?)\b/i.test(trimmed)) score += 2;
  if (/\b(ruled|decided|approved|required|advised|warned|recall|issued)\b/i.test(trimmed)) score += 2;
  
  const hasMeasurement = /\d+\s*(million|billion|percent|%|times|fold|years?|months?)\b/i.test(trimmed);
  if (hasMeasurement) score += 2;
  else if (/\d+/.test(trimmed)) score += 1;
  
  if (/\b([A-Z][a-z]+\s+){1,3}[A-Z][a-z]+\b/.test(trimmed) || /\b(FDA|CDC|WHO|EPA|FBI|CIA|NASA|UN|EU)\b/.test(trimmed)) score += 1;
  if (/(19|20)\d{2}/.test(trimmed)) score += 1;
  if (/\b(according to|said|stated|told|reported|announced)\b/i.test(trimmed) || /["""]/.test(trimmed)) score += 1.5;
  if (/\b(more|less|higher|lower|increased|decreased|than|compared to)\b/i.test(trimmed)) score += 1;
  
  return score >= 2.5;
}

function detectSource(sentence: string): string {
  const hasQuotes = sentence.includes('"') || sentence.includes('"');
  const hasAttribution = /(according to|said that|stated that|claimed that|reported that)/i.test(sentence);
  return (hasQuotes || hasAttribution) ? 'quote' : 'direct';
}

function getContext(sentences: string[], index: number): string {
  const before = index > 0 ? sentences[index - 1] : '';
  const after = index < sentences.length - 1 ? sentences[index + 1] : '';
  return `${before} ${sentences[index]} ${after}`.trim();
}

// ============================================================================
// CLASSIFICATION (from claimClassifier.js)
// ============================================================================

async function classifyClaims(claims: any[], supabase: any): Promise<any[]> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return claims.map(c => ({ ...c, classification: "general_knowledge" }));
  }

  try {
    // Check cache
    const cachedResults: (string | null)[] = [];
    for (const claim of claims) {
      const claimHash = await hashString(claim.claim);
      const { data } = await supabase
        .from("claim_cache")
        .select("classification")
        .eq("claim_hash", claimHash)
        .gt("expires_at", new Date().toISOString())
        .single();
      cachedResults.push(data?.classification || null);
    }

    const uncachedClaims = claims.filter((_, idx) => !cachedResults[idx]);
    
    if (uncachedClaims.length === 0) {
      return claims.map((claim, idx) => ({
        ...claim,
        classification: cachedResults[idx] || "general_knowledge"
      }));
    }

    // Batch classify with OpenAI
    const items = uncachedClaims.map((c, i) => `[${i}] ${c.claim}`).join("\n\n");
    const prompt = `Classify each claim into: "current_news", "general_knowledge", or "empirical_fact". Return JSON: {"classifications": [{"id": 0, "classification": "..."}]}\n\n${items}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a claim classifier. Return only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    // Cache new classifications
    let uncachedIdx = 0;
    for (let i = 0; i < claims.length; i++) {
      if (!cachedResults[i]) {
        const match = result.classifications?.find((c: any) => c.id === uncachedIdx);
        const classification = match?.classification || "general_knowledge";
        
        const claimHash = await hashString(claims[i].claim);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        await supabase.from("claim_cache").upsert({
          claim_hash: claimHash,
          claim_text: claims[i].claim,
          classification: classification,
          expires_at: expiresAt.toISOString()
        });
        
        uncachedIdx++;
      }
    }
    
    return claims.map((claim, idx) => {
      if (cachedResults[idx]) {
        return { ...claim, classification: cachedResults[idx] };
      }
      const match = result.classifications?.find((c: any) => c.id === idx - cachedResults.filter(Boolean).length);
      return {
        ...claim,
        classification: match?.classification || "general_knowledge"
      };
    });
  } catch (error) {
    console.error("Classification error:", error);
    return claims.map(c => ({ ...c, classification: "general_knowledge" }));
  }
}

// ============================================================================
// SCORING ORCHESTRATOR (from claimScorer.js)
// ============================================================================

async function scoreAllClaims(claims: any[], supabase: any, articleUrl: string): Promise<any[]> {
  // Score claims sequentially to respect Brave API rate limits (1 req/sec)
  // AI and Scholar can run in parallel, but web search needs to be sequential
  const scored: any[] = [];
  
  for (const claim of claims) {
    const scoredClaim = await scoreSingleClaim(claim, supabase, articleUrl);
    scored.push(scoredClaim);
  }
  
  return scored;
}

async function scoreSingleClaim(claim: any, supabase: any, articleUrl: string): Promise<any> {
  try {
    // Extract domain from article URL for web search exclusion
    let excludeDomain = '';
    try {
      const urlObj = new URL(articleUrl);
      excludeDomain = urlObj.hostname.replace(/^www\./, '').replace(/^m\./, '');
      console.log(`[Scoring] Excluding domain: ${excludeDomain} for claim: "${claim.claim.substring(0, 50)}..."`);
    } catch (e) {
      console.warn(`[Scoring] Could not extract domain from URL: ${articleUrl}`);
    }
    
    // Run AI and Scholar in parallel (fast)
    // Web search runs separately to respect rate limits
    const [aiRating, toneAnalysis, scholarResult] = await Promise.all([
      withTimeout(scoreAICredibility(claim.claim, claim.classification), 10000, 'n/a'),
      withTimeout(scoreAITone(claim.claim, claim.classification), 10000, 'n/a'),
      withTimeout(scoreScholar(claim.claim, claim.classification), 120000, {score: 0, sources: []})
    ]);
    
    // Web search runs separately (sequential to respect rate limits)
    const webResult = await withTimeout(scoreWeb(claim.claim, claim.classification, excludeDomain), 120000, {score: 0, sources: []});

    const scholarlyMatch = scholarResult.score;
    const webReinforced = webResult.score;
    const scholarSources = scholarResult.sources || [];
    const webSources = webResult.sources || [];

    // Calculate weighted trust score
    const { trustScore, note } = calculateTrustScore(
      { aiRating, toneAnalysis, scholarlyMatch, webReinforced },
      claim.classification
    );

    return {
      ...claim,
      scores: {
        aiRating,
        toneAnalysis,
        scholarlyMatch,
        webReinforced
      },
      trustScore,
      sources: {
        scholar: scholarSources,
        web: webSources,
        all: [...scholarSources, ...webSources]
      },
      ...(note ? { note } : {})
    };
  } catch (error) {
    console.error("Error scoring claim:", error);
    return {
      ...claim,
      scores: { aiRating: 'n/a', toneAnalysis: 'n/a', scholarlyMatch: 0, webReinforced: 0 },
      trustScore: 0,
      note: 'Scoring failed'
    };
  }
}

function calculateTrustScore(scores: any, classification: string): { trustScore: number; note?: string } {
  const weights = SCORING_WEIGHTS[classification as keyof typeof SCORING_WEIGHTS] || SCORING_WEIGHTS.general_knowledge;
  const { aiRating, toneAnalysis, scholarlyMatch, webReinforced } = scores;
  
  const aiAvailable = aiRating !== 'n/a' && typeof aiRating === 'number';
  const toneAvailable = toneAnalysis !== 'n/a' && typeof toneAnalysis === 'number';
  
  let trustScore: number;
  let note: string | undefined;
  
  if (!aiAvailable && !toneAvailable) {
    const totalWeight = weights.scholarlyMatch + weights.webReinforced;
    if (totalWeight === 0) {
      trustScore = (scholarlyMatch + webReinforced) / 2;
    } else {
      const normalizedScholar = weights.scholarlyMatch / totalWeight;
      const normalizedWeb = weights.webReinforced / totalWeight;
      trustScore = (scholarlyMatch * normalizedScholar) + (webReinforced * normalizedWeb);
    }
    note = 'AI scorers unavailable';
  } else if (!aiAvailable && toneAvailable) {
    const totalWeight = weights.toneAnalysis + weights.scholarlyMatch + weights.webReinforced;
    trustScore = (toneAnalysis * weights.toneAnalysis / totalWeight) +
                 (scholarlyMatch * weights.scholarlyMatch / totalWeight) +
                 (webReinforced * weights.webReinforced / totalWeight);
    note = 'AI credibility scorer unavailable';
  } else if (aiAvailable && !toneAvailable) {
    const totalWeight = weights.aiRating + weights.scholarlyMatch + weights.webReinforced;
    trustScore = (aiRating * weights.aiRating / totalWeight) +
                 (scholarlyMatch * weights.scholarlyMatch / totalWeight) +
                 (webReinforced * weights.webReinforced / totalWeight);
    note = 'AI tone scorer unavailable';
  } else {
    trustScore = (aiRating * weights.aiRating) +
                 (toneAnalysis * weights.toneAnalysis) +
                 (scholarlyMatch * weights.scholarlyMatch) +
                 (webReinforced * weights.webReinforced);
  }
  
  trustScore = Math.round(trustScore * 10) / 10;
  return { trustScore, note };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(defaultValue), timeoutMs))
  ]);
}

// ============================================================================
// AI SCORER (from aiScorer.js)
// ============================================================================

async function scoreAICredibility(claim: string, classification: string): Promise<number | string> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return "n/a";

  try {
    const prompt = `You are a fact-checking assistant. Analyze the following claim for credibility.

Claim: "${claim}"
Classification: ${classification}

Rate the credibility of this claim on a scale of 0-10, where:
- 0 = Completely false or misleading
- 5 = Uncertain, needs verification
- 10 = Highly credible and verifiable

Consider:
1. Logical consistency
2. Plausibility based on general knowledge
3. Presence of verifiable facts
4. Absence of logical fallacies

Respond with ONLY a number between 0 and 10 (decimals allowed, e.g., 7.5).`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a precise fact-checking assistant. Always respond with only a number." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 10,
      }),
    });

    const data = await response.json();
    const score = parseFloat(data.choices[0].message.content.trim());
    if (isNaN(score) || score < 0 || score > 10) return "n/a";
    return score;
  } catch (error) {
    console.error("AI credibility scoring error:", error);
    return "n/a";
  }
}

async function scoreAITone(claim: string, classification: string): Promise<number | string> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return "n/a";

  try {
    const prompt = `You are a fact-checking assistant. Analyze the tone and language of the following claim.

Claim: "${claim}"

Rate the neutrality and objectivity of this claim's tone on a scale of 0-10, where:
- 0 = Highly emotional, biased, or manipulative language
- 5 = Somewhat neutral with mild bias
- 10 = Completely neutral, objective, and factual tone

Consider:
1. Emotional language and charged words
2. Loaded terms or propaganda techniques
3. Objectivity vs. subjective opinions
4. Sensationalism or exaggeration

Respond with ONLY a number between 0 and 10 (decimals allowed, e.g., 6.5).`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a precise fact-checking assistant. Always respond with only a number." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 10,
      }),
    });

    const data = await response.json();
    const score = parseFloat(data.choices[0].message.content.trim());
    if (isNaN(score) || score < 0 || score > 10) return "n/a";
    return score;
  } catch (error) {
    console.error("AI tone scoring error:", error);
    return "n/a";
  }
}

// ============================================================================
// SCHOLAR SCORER (from scholarScorer.js)
// ============================================================================

async function scoreScholar(claim: string, classification: string): Promise<{score: number; sources: any[]}> {
  // Only search for empirical facts
  if (classification !== 'empirical_fact') {
    return { score: 0, sources: [] };
  }

  try {
    const scholarQuery = extractScholarTerms(claim);
    const results = await searchGoogleScholar(scholarQuery, 20);
    
    if (results.length === 0) {
      return { score: 0, sources: [] };
    }

    const scoreValue = calculateScholarScore(results);
    return { score: scoreValue, sources: results };
  } catch (error) {
    console.error("Scholar scoring error:", error);
    return { score: 0, sources: [] };
  }
}

function extractScholarTerms(claim: string): string {
  let terms: string[] = [];
  let priorityTerms: string[] = [];
  
  // Extract organizations
  const orgPatterns = [
    /\b(FDA|CDC|WHO|EPA|NIH|USDA|HHS|NHS|EMA)\b/g,
    /\b(Food and Drug Administration|Centers for Disease Control)\b/gi
  ];
  
  for (const pattern of orgPatterns) {
    const matches = claim.match(pattern);
    if (matches) priorityTerms.push(...matches);
  }
  
  // Extract medical/scientific terms
  const medicalPhrases = [
    /elevated\s+levels?\s+of\s+\w+/gi,
    /blood\s+\w+/gi,
    /\w+\s+poisoning/gi,
    /health\s+\w+/gi
  ];
  
  for (const pattern of medicalPhrases) {
    const matches = claim.match(pattern);
    if (matches) terms.push(...matches);
  }
  
  // Extract substances
  const substances = claim.match(/\b(lead|mercury|arsenic|cadmium|aluminum|asbestos|pesticide|toxin|chemical|metal)\b/gi);
  if (substances) terms.push(...substances);
  
  // Extract statistics
  const stats = claim.match(/(\d+(?:\.\d+)?%)|(\d+(?:\.\d+)?)\s*(million|billion|percent|ppm|ppb)/gi);
  if (stats) terms.push(...stats);
  
  // Extract scientific terms
  const scientificTerms = claim.match(/\b(assessment|study|research|published|findings|evidence|data)\b/gi);
  if (scientificTerms) terms.push(...scientificTerms.slice(0, 2));
  
  // Build query
  const uniquePriorityTerms = [...new Set(priorityTerms.map(t => t.trim()))];
  const uniqueTerms = [...new Set(terms.map(t => t.trim()))];
  const allTerms = [...uniquePriorityTerms, ...uniqueTerms].slice(0, 15);
  
  return allTerms.join(' ');
}

async function searchGoogleScholar(query: string, maxResults: number): Promise<any[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://scholar.google.com/scholar?q=${encodedQuery}&hl=en`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return [];
    
    const html = await response.text();
    return parseGoogleScholarHTML(html, maxResults);
  } catch (error) {
    console.error("Google Scholar search error:", error);
    return [];
  }
}

function parseGoogleScholarHTML(html: string, maxResults: number): any[] {
  const results: any[] = [];
  
  // Simple regex-based parsing (DOMParser not available in Deno Edge Functions)
  // Look for result patterns in HTML
  const titlePattern = /<h3[^>]*><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a><\/h3>/gi;
  let match;
  let count = 0;
  
  while ((match = titlePattern.exec(html)) !== null && count < maxResults) {
    const url = match[1].startsWith('http') ? match[1] : `https://scholar.google.com${match[1]}`;
    const title = match[2].trim();
    
    // Extract domain
    let domain = 'scholar.google.com';
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname.replace(/^www\./, '');
    } catch {}
    
    if (title && url) {
      results.push({
        url: url,
        title: title,
        snippet: '',
        domain: domain
      });
      count++;
    }
  }
  
  return results;
}

function calculateScholarScore(results: any[]): number {
  if (results.length === 0) return 0;
  
  let score = 0;
  let authorityCount = 0;
  
  // Count authoritative domains
  for (const result of results) {
    const domain = result.domain.toLowerCase();
    const isAuthoritative = ACADEMIC_DOMAINS.some(acadDomain => domain.includes(acadDomain));
    if (isAuthoritative) authorityCount++;
  }
  
  // Base score from number of results
  if (results.length >= 15) score = 5;
  else if (results.length >= 10) score = 4;
  else if (results.length >= 5) score = 3;
  else if (results.length >= 2) score = 2;
  else score = 1;
  
  // Boost based on authoritative sources
  if (authorityCount >= 5) score += 5;
  else if (authorityCount >= 3) score += 3;
  else if (authorityCount >= 1) score += 2;
  
  return Math.min(score, 10);
}

// ============================================================================
// WEB SCORER (from webScorer.js) - Using Brave Search API
// Replaces DuckDuckGo/Bing HTML scraping with official API
// ============================================================================

async function scoreWeb(claim: string, classification: string, excludeDomain: string): Promise<{score: number; sources: any[]}> {
  try {
    console.log(`[Web Scorer] Starting web search for claim: "${claim.substring(0, 60)}..."`);
    const sourceAnalysis = await analyzeSourceSpectrum(claim, excludeDomain);
    const scoreValue = calculateWebScore(sourceAnalysis.analysis);
    
    console.log(`[Web Scorer] Final score: ${scoreValue}, Sources: ${sourceAnalysis.results?.length || 0}`);
    
    return {
      score: scoreValue,
      sources: sourceAnalysis.results || []
    };
  } catch (error) {
    console.error("[Web Scorer] Web scoring error:", error);
    return { score: 0, sources: [] };
  }
}

async function analyzeSourceSpectrum(claim: string, excludeDomain: string): Promise<{analysis: any; results: any[]}> {
  try {
    console.log(`[Web Search] Analyzing source spectrum for claim: "${claim.substring(0, 60)}..."`);
    
    // Improve search query by extracting key terms from claim
    // This makes searches more relevant and accurate
    const searchQuery = extractKeySearchTerms(claim);
    console.log(`[Web Search] Search query: "${searchQuery.substring(0, 80)}..."`);
    
    // Search web using Brave API with improved query
    const results = await searchWeb(searchQuery, 15);
    console.log(`[Web Search] Total search results: ${results.length}`);
    
    // Filter excluded domain (exact match to avoid over-filtering)
    // e.g., exclude "bbc.com" but allow "bbc.co.uk" (different domain)
    const filteredResults = results.filter(result => {
      if (!excludeDomain) return true;
      const domain = result.domain.toLowerCase();
      const excludeLower = excludeDomain.toLowerCase();
      
      // Exact domain match or parent domain match (e.g., "bbc.com" matches "www.bbc.com" but not "bbc.co.uk")
      const isExactMatch = domain === excludeLower;
      const isParentMatch = domain.endsWith('.' + excludeLower);
      
      if (isExactMatch || isParentMatch) {
        console.log(`[Web Search] Filtered out result from excluded domain: ${domain}`);
        return false;
      }
      return true;
    });
    
    console.log(`[Web Search] After filtering excluded domain "${excludeDomain}": ${filteredResults.length} of ${results.length} results`);
    
    // Analyze bias spectrum using centralized bias resolver logic
    const analysis = {
      total: filteredResults.length,
      left: 0,
      center: 0,
      right: 0,
      unknown: 0
    };
    
    // Add bias classification to each result for UI display
    const resultsWithBias = filteredResults.map(result => {
      const bias = classifyDomain(result.domain);
      return {
        ...result,
        bias: bias // Add bias for political spectrum bar display
      };
    });
    
    // Count biases for analysis
    for (const result of resultsWithBias) {
      if (result.bias === 'left') analysis.left++;
      else if (result.bias === 'center') analysis.center++;
      else if (result.bias === 'right') analysis.right++;
      else analysis.unknown++;
    }
    
    console.log(`[Web Search] Bias analysis: L:${analysis.left} C:${analysis.center} R:${analysis.right} U:${analysis.unknown}`);
    
    return { analysis, results: resultsWithBias };
  } catch (error) {
    console.error("[Web Search] Source spectrum analysis error:", error);
    return {
      analysis: { total: 0, left: 0, center: 0, right: 0, unknown: 0 },
      results: []
    };
  }
}

// Web search: Brave Search API (replaces DuckDuckGo/Bing scraping)
async function searchWeb(query: string, maxResults: number): Promise<any[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  try {
    console.log(`[Web Search] Brave Search query: "${query.substring(0, 50)}..."`);
    const results = await searchBrave(query, maxResults);
    console.log(`[Web Search] Brave Search returned ${results.length} results`);
    return results;
  } catch (error) {
    console.error('[Web Search] Brave Search failed:', error);
    return [];
  }
}

// Rate limiter for Brave API (Free plan: 1 req/sec)
let lastBraveRequest = 0;
const BRAVE_RATE_LIMIT_MS = 1100; // 1.1 seconds between requests (slightly more than 1/sec)

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastBraveRequest;
  
  if (timeSinceLastRequest < BRAVE_RATE_LIMIT_MS) {
    const waitTime = BRAVE_RATE_LIMIT_MS - timeSinceLastRequest;
    console.log(`[Web Search] Rate limiting: waiting ${waitTime}ms before next Brave API request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastBraveRequest = Date.now();
}

// Search Brave Search API
async function searchBrave(query: string, maxResults: number): Promise<any[]> {
  const braveKey = Deno.env.get("BRAVE_API_KEY");
  if (!braveKey) {
    console.error("[Web Search] Brave API key not set");
    return [];
  }

  try {
    // Truncate query to ensure URL-encoded version is under 400 chars
    // URL encoding can add ~20% overhead, so truncate to ~330 chars to be safe
    let truncatedQuery = query;
    if (query.length > 330) {
      truncatedQuery = query.substring(0, 327) + '...';
    }
    
    // Double-check: if encoded version is still too long, truncate more aggressively
    let encodedQuery = encodeURIComponent(truncatedQuery);
    if (encodedQuery.length > 400) {
      // Truncate more aggressively - try 250 chars
      truncatedQuery = query.substring(0, 247) + '...';
      encodedQuery = encodeURIComponent(truncatedQuery);
      
      // If still too long, use a very short version
      if (encodedQuery.length > 400) {
        truncatedQuery = query.substring(0, 200);
        encodedQuery = encodeURIComponent(truncatedQuery);
      }
    }
    
    // Wait for rate limit (Free plan: 1 req/sec)
    await waitForRateLimit();
    
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodedQuery}&count=${maxResults}&safesearch=moderate`;
    
    console.log(`[Web Search] Brave API request: "${truncatedQuery.substring(0, 50)}..." (${truncatedQuery.length} chars, encoded: ${encodedQuery.length} chars)`);
    
    const response = await fetch(url, {
      headers: {
        'X-Subscription-Token': braveKey,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Web Search] Brave API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      
      // If rate limited, return empty (will retry on next article)
      if (response.status === 429) {
        console.warn(`[Web Search] Rate limited - skipping this claim`);
      }
      return [];
    }
    
    const data = await response.json();
    const results: any[] = [];
    
    if (!data.web || !data.web.results) {
      console.warn(`[Web Search] Brave API returned no web results. Response:`, JSON.stringify(data).substring(0, 500));
      return [];
    }
    
    console.log(`[Web Search] Brave API returned ${data.web.results.length} raw results`);
    
    for (const result of data.web.results.slice(0, maxResults)) {
      const domain = extractDomainFromUrl(result.url);
      if (domain) {
        results.push({
          url: result.url,
          title: result.title || '',
          snippet: result.description || '',
          domain: domain
        });
      } else {
        console.warn(`[Web Search] Could not extract domain from URL: ${result.url}`);
      }
    }
    
    console.log(`[Web Search] Brave API parsed ${results.length} valid results`);
    if (results.length > 0) {
      console.log(`[Web Search] Sample domains: ${results.slice(0, 3).map(r => r.domain).join(', ')}`);
    }
    return results;
  } catch (error) {
    console.error("[Web Search] Brave Search error:", error);
    return [];
  }
}

// Extract key search terms from claim to improve search relevance
function extractKeySearchTerms(claim: string): string {
  // Remove quotes and extra whitespace
  let query = claim.trim();
  
  // Remove common quote marks
  query = query.replace(/["""'']/g, '');
  
  // Extract key entities (names, places, organizations)
  const entities: string[] = [];
  
  // Extract capitalized phrases (likely names/entities)
  const capitalizedPhrases = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
  if (capitalizedPhrases) {
    // Take first 2-3 capitalized phrases (usually most important)
    entities.push(...capitalizedPhrases.slice(0, 3));
  }
  
  // Extract numbers with context (statistics, dates)
  const numbers = query.match(/\d+(?:\.\d+)?(?:\s*(?:million|billion|percent|%|years?|months?|days?))?/gi);
  if (numbers) {
    // Include numbers with their context
    numbers.forEach(num => {
      const context = query.substring(Math.max(0, query.indexOf(num) - 20), query.indexOf(num) + num.length + 20);
      if (context.length < 50) entities.push(context.trim());
    });
  }
  
  // If we found key entities, use them + first 100 chars of claim
  if (entities.length > 0) {
    const entityStr = entities.slice(0, 3).join(' ');
    const claimStart = query.substring(0, 150).trim();
    return `${entityStr} ${claimStart}`.trim();
  }
  
  // Otherwise, use first 200 chars of claim (Brave API limit is 400 chars encoded)
  return query.substring(0, 200).trim();
}

// OLD: DuckDuckGo HTML parsing (replaced by Brave API)
// Kept for reference but not used
function parseDuckDuckGoHTML_OLD(html: string, maxResults: number): any[] {
  const results: any[] = [];
  
  // Try multiple patterns - DuckDuckGo HTML structure may vary
  // Pattern 1: <div class="result"> or <div class="web-result">
  let resultPattern = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let matches = html.match(resultPattern);
  
  // Pattern 2: Try <div class="web-result">
  if (!matches || matches.length === 0) {
    resultPattern = /<div[^>]*class="[^"]*web-result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    matches = html.match(resultPattern);
  }
  
  // Pattern 3: Try looking for result links directly
  if (!matches || matches.length === 0) {
    const linkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    matches = html.match(linkPattern);
    if (matches) {
      // Extract results from link matches
      for (let i = 0; i < Math.min(matches.length, maxResults); i++) {
        const linkMatch = matches[i].match(/href="([^"]*)"[^>]*>([^<]*)</i);
        if (linkMatch) {
          let url = linkMatch[1];
          const title = linkMatch[2].trim();
          
          if (url.includes('uddg=')) {
            const uddgMatch = url.match(/uddg=([^&]+)/);
            if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
          }
          
          const domain = extractDomainFromUrl(url);
          if (url && title && domain) {
            results.push({ url, title, snippet: '', domain });
          }
        }
      }
      return results;
    }
  }
  
  if (!matches || matches.length === 0) {
    console.warn('[Web Search] No DuckDuckGo result elements found. HTML sample:', html.substring(0, 500));
    return [];
  }
  
  console.log(`[Web Search] Found ${matches.length} DuckDuckGo result elements`);
  
  for (let i = 0; i < Math.min(matches.length, maxResults); i++) {
    const resultHtml = matches[i];
    
    try {
      // Extract URL from result__a link
      const linkMatch = resultHtml.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i);
      if (!linkMatch) {
        // Try alternative pattern
        const altLinkMatch = resultHtml.match(/<a[^>]*href="([^"]*)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]*)<\/a>/i);
        if (!altLinkMatch) continue;
        linkMatch = altLinkMatch;
      }
      
      let actualUrl = linkMatch[1];
      const title = linkMatch[2].trim();
      
      // DuckDuckGo wraps URLs in their redirect, extract actual URL
      if (actualUrl.includes('uddg=')) {
        const uddgMatch = actualUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          actualUrl = decodeURIComponent(uddgMatch[1]);
        }
      }
      
      // Extract snippet from result__snippet
      const snippetMatch = resultHtml.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)<\/a>/i) ||
                          resultHtml.match(/<span[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)<\/span>/i);
      const snippet = snippetMatch ? snippetMatch[1].trim().substring(0, 200) : '';
      
      // Extract domain
      const domain = extractDomainFromUrl(actualUrl);
      
      if (actualUrl && title && domain) {
        results.push({
          url: actualUrl,
          title: title,
          snippet: snippet,
          domain: domain
        });
      }
    } catch (error) {
      console.warn(`[Web Search] Error parsing result ${i}:`, error);
      continue;
    }
  }
  
  console.log(`[Web Search] Successfully parsed ${results.length} DuckDuckGo results`);
  return results;
}

// OLD: Bing HTML scraping (replaced by Brave API)
// Kept for reference but not used
async function searchBing_OLD(query: string, maxResults: number): Promise<any[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encodedQuery}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Bing HTTP ${response.status}`);
    }
    
    const html = await response.text();
    return parseBingHTML(html, maxResults);
  } catch (error) {
    // Don't log here - will be logged in main search() if both fail
    return [];
  }
}

// OLD: Bing HTML parsing (replaced by Brave API)
// Kept for reference but not used
async function parseBingHTML_OLD(html: string, maxResults: number): Promise<any[]> {
  const rawResults: any[] = [];
  
  console.log(`Bing HTML length: ${html.length} characters`);
  
  // Bing uses li.b_algo for organic search results
  // Pattern: <li class="b_algo">...<h2><a href="...">title</a></h2>...<p class="b_caption">snippet</p>...</li>
  const resultPattern = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  const matches = html.match(resultPattern);
  
  if (!matches) {
    console.log('No Bing result elements found');
    return [];
  }
  
  console.log(`Found ${matches.length} Bing result elements`);
  
  for (let i = 0; i < Math.min(matches.length, maxResults); i++) {
    const resultHtml = matches[i];
    
    try {
      // Extract URL from h2 > a
      const linkMatch = resultHtml.match(/<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a><\/h2>/i);
      if (!linkMatch) continue;
      
      const rawUrl = linkMatch[1];
      const title = linkMatch[2].trim();
      
      // Extract snippet from .b_caption p or .b_caption
      const snippetMatch = resultHtml.match(/<p[^>]*class="[^"]*b_caption[^"]*"[^>]*>([^<]*)<\/p>/i) ||
                          resultHtml.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>([^<]*)<\/div>/i);
      const snippet = snippetMatch ? snippetMatch[1].trim().substring(0, 200) : '';
      
      if (rawUrl && title) {
        rawResults.push({
          url: rawUrl,
          title: title,
          snippet: snippet
        });
      }
    } catch (error) {
      continue;
    }
  }
  
  // Clean the results - resolve Bing redirect URLs
  const cleanResults: any[] = [];
  for (const r of rawResults) {
    let dest = r.url;
    
    // If it's a Bing redirect URL, try to extract the destination
    if (dest && dest.includes('bing.com/ck/a')) {
      // Try to extract from URL parameters
      const urlMatch = dest.match(/u=([^&]+)/);
      if (urlMatch) {
        dest = decodeURIComponent(urlMatch[1]);
      }
    }
    
    let domain = '';
    try {
      domain = new URL(dest).hostname.replace(/^www\./, '');
    } catch (e) {
      console.log(`Failed to extract domain from: ${dest}`);
    }
    
    if (dest && domain && !domain.endsWith('bing.com')) {
      cleanResults.push({ ...r, url: dest, domain });
    }
  }
  
  console.log(`Cleaned ${rawResults.length} raw results to ${cleanResults.length} valid results`);
  
  return cleanResults;
}

function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').replace(/^m\./, '');
  } catch {
    return '';
  }
}

// ============================================================================
// BIAS RESOLVER (exact port from biasResolver.js)
// ============================================================================

/**
 * Normalize hostname from domain or URL
 * Handles URLs, subdomains, and strips common prefixes
 * Exact same logic as biasResolver.js normHost()
 */
function normHost(x: string): string {
  try {
    const url = x.startsWith('http') ? x : `https://${x}`;
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();
  } catch {
    return String(x).replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();
  }
}

/**
 * Extract parent domain (e.g., "edition.cnn.com" -> "cnn.com")
 * Exact same logic as biasResolver.js parent()
 */
function parentDomain(h: string): string {
  const parts = h.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : h;
}

/**
 * Classify domain by political bias
 * Uses exact host matching first, then parent domain matching
 * Exact same logic as biasResolver.js classify()
 * @param {string} domainOrUrl - Domain or URL
 * @returns {string} 'left', 'center', 'right', or 'unknown'
 */
function classifyDomain(domainOrUrl: string): string {
  const normalized = normHost(domainOrUrl);
  const root = parentDomain(normalized);
  
  // Try exact match first (e.g., "edition.cnn.com")
  // Then try parent domain (e.g., "cnn.com")
  return BIAS_MAP[normalized] || BIAS_MAP[root] || 'unknown';
}

function calculateWebScore(analysis: any): number {
  const { total, left, center, right } = analysis;
  
  if (total === 0) return 0;
  
  // Base score from source count (0-7)
  let baseScore = 0;
  if (total <= 2) baseScore = 2;
  else if (total <= 5) baseScore = 4;
  else if (total <= 8) baseScore = 6;
  else baseScore = 7;
  
  // Diversity bonus (0-3 points)
  const spectrumCoverage = [left > 0, center > 0, right > 0].filter(Boolean).length;
  
  let diversityBonus = 0;
  if (spectrumCoverage === 3) diversityBonus = 3;
  else if (spectrumCoverage === 2) diversityBonus = 1.5;
  else if (spectrumCoverage === 1) diversityBonus = 0.5;
  
  const finalScore = Math.min(baseScore + diversityBonus, 10);
  return Math.round(finalScore * 10) / 10;
}
