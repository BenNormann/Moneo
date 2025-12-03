// Supabase Edge Function for fact-checking pipeline
// Handles article HTML → extracts claims → scores → returns results

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FactCheckRequest {
  html: string;
  url: string;
  userId?: string;
}

interface Claim {
  id: string;
  claim: string;
  classification: string;
  scores: {
    aiRating: number | string;
    toneAnalysis: number | string;
    scholarlyMatch: number;
    webReinforced: number;
  };
  trustScore: number;
  sources?: {
    scholar: any[];
    web: any[];
    all: any[];
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const { html, url, userId }: FactCheckRequest = await req.json();

    if (!html || !url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: html, url" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate cache key from URL
    const urlHash = await hashString(url);
    const htmlHash = await hashString(html);

    // Check cache first
    const { data: cached, error: cacheError } = await supabase
      .from("article_cache")
      .select("*")
      .eq("url_hash", urlHash)
      .eq("html_hash", htmlHash)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (cached && !cacheError) {
      console.log("Cache hit for article:", url);
      return new Response(
        JSON.stringify({
          success: true,
          cached: true,
          claims: cached.claims,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Cache miss, processing article:", url);

    // Extract article text from HTML
    const articleText = extractArticleText(html);

    if (!articleText || articleText.length < 100) {
      return new Response(
        JSON.stringify({ error: "Insufficient article text" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Extract claims (using rule-based extraction)
    const claims = await extractClaims(articleText);

    if (claims.length === 0) {
      return new Response(
        JSON.stringify({ success: true, claims: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 2: Classify claims
    const classifiedClaims = await classifyClaims(claims, supabase);

    // Step 3: Score claims
    const scoredClaims = await scoreClaims(classifiedClaims, supabase);

    // Cache the results (24 hour TTL)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await supabase.from("article_cache").upsert({
      url_hash: urlHash,
      url: url,
      html_hash: htmlHash,
      claims: scoredClaims,
      expires_at: expiresAt.toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        claims: scoredClaims,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in fact-check function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Helper function to hash strings
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Extract article text from HTML (simplified version)
function extractArticleText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();
  
  return text;
}

// Extract claims from article text (simplified - you'll port your full logic)
async function extractClaims(text: string): Promise<any[]> {
  // TODO: Port your claim extraction logic from claimExtractor.js
  // For now, return empty array
  return [];
}

// Classify claims using OpenAI
async function classifyClaims(claims: any[], supabase: any): Promise<any[]> {
  // TODO: Port classification logic from claimClassifier.js
  // Check claim_cache first, then call OpenAI if needed
  return claims.map((claim) => ({
    ...claim,
    classification: "general_knowledge", // Default
  }));
}

// Score claims using all scorers
async function scoreClaims(claims: any[], supabase: any): Promise<Claim[]> {
  // TODO: Port scoring logic from claimScorer.js
  // This will call:
  // - OpenAI for credibility and tone
  // - Google Scholar for empirical facts
  // - Brave Search API for web verification
  return claims.map((claim) => ({
    ...claim,
    scores: {
      aiRating: 5,
      toneAnalysis: 5,
      scholarlyMatch: 0,
      webReinforced: 0,
    },
    trustScore: 5,
  }));
}

