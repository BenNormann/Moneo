// src/utils/urlUnwrapper.js
/**
 * URL Unwrapper Utility
 * Handles unwrapping of click-tracking URLs, especially Bing redirects
 * Extracts real destination URLs from tracking parameters
 */

function decodeMulti(s) {
  let out = s;
  for (let i = 0; i < 3; i++) {
    try {
      const dec = decodeURIComponent(out);
      if (dec === out) break;
      out = dec;
    } catch { break; }
  }
  return out;
}

function stripTrackers(u) {
  let url;
  try { url = new URL(u); } catch { return u; }
  const junk = [
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
    'fbclid','gclid','igshid','mc_cid','mc_eid'
  ];
  junk.forEach(k => url.searchParams.delete(k));
  return url.toString();
}

function unwrapBing(urlStr) {
  let url;
  try { url = new URL(urlStr); } catch { return urlStr; }
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('bing.com')) return urlStr;

  const candidates = ['u','url','r','ru','to','target'];
  for (const [k, v] of url.searchParams.entries()) {
    if (candidates.includes(k.toLowerCase()) && v) {
      let result = null;
      
      // Debug: Log what we're working with
      if (typeof Logger !== 'undefined' && Logger.log && k === 'u') {
        Logger.log(`Bing unwrap: found 'u' parameter, value starts with: ${v.substring(0, 50)}...`);
        Logger.log(`Bing unwrap: value length: ${v.length}, starts with a1a: ${v.startsWith('a1a')}`);
      }
      
      // Strategy 1: Try base64 decoding first (Bing often uses base64 in u param with a1a prefix)
      if (v.startsWith('a1a')) {
        // Remove ONLY the '1a' marker, keep the leading 'a' (it's part of the base64)
        let base64Str = 'a' + v.substring(3);
        
        if (typeof Logger !== 'undefined' && Logger.log) {
          Logger.log(`Bing unwrap: reconstructed base64 string, length: ${base64Str.length}`);
          Logger.log(`Bing unwrap: first 40 chars of base64: ${base64Str.substring(0, 40)}`);
        }
        
        try {
          // Convert URL-safe base64 to standard base64
          base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
          
          // Add padding if needed (base64 must be multiple of 4)
          const padding = (4 - (base64Str.length % 4)) % 4;
          if (padding > 0) {
            base64Str += '='.repeat(padding);
            if (typeof Logger !== 'undefined' && Logger.log) {
              Logger.log(`Bing unwrap: added ${padding} padding chars`);
            }
          }
          
          // Try decoding
          const decoded = atob(base64Str);
          
          if (typeof Logger !== 'undefined' && Logger.log) {
            Logger.log(`Bing unwrap: decoded successfully, result: ${decoded.substring(0, 80)}...`);
            Logger.log(`Bing unwrap: starts with http: ${decoded.startsWith('http')}`);
          }
          
          if (decoded && decoded.startsWith('http')) {
            result = decoded;
          }
        } catch (e) {
          // Base64 decoding failed
          if (typeof Logger !== 'undefined' && Logger.log) {
            Logger.log(`Bing unwrap: atob failed: ${e.message}`);
            Logger.log(`Bing unwrap: base64 string was: ${base64Str.substring(0, 100)}...`);
          }
        }
      }
      
      // Strategy 2: Try base64 decoding without a1a prefix (in case it's missing)
      if (!result && !v.startsWith('http') && v.length > 10) {
        try {
          let base64Str = v;
          // Convert URL-safe base64 to standard base64 if needed
          base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
          // Add padding if needed
          const padding = (4 - (base64Str.length % 4)) % 4;
          base64Str += '='.repeat(padding);
          const decoded = atob(base64Str);
          if (decoded && decoded.startsWith('http')) {
            result = decoded;
          }
        } catch (e) {
          // Not base64, continue
        }
      }
      
      // Strategy 3: Try URL decoding
      if (!result) {
        try {
          const urlDecoded = decodeMulti(v);
          if (urlDecoded && urlDecoded.startsWith('http')) {
            result = urlDecoded;
          }
        } catch (e) {
          // URL decode failed
        }
      }
      
      // Strategy 4: If already a URL, use it directly
      if (!result && v.startsWith('http')) {
        result = v;
      }
      
      if (result) {
        return stripTrackers(result);
      }
    }
  }
  return urlStr; // fallback; caller may try network follow if desired
}

function unwrapRedirect(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.toLowerCase().endsWith('bing.com')) {
      return unwrapBing(urlStr);
    }
    return stripTrackers(urlStr);
  } catch {
    return urlStr;
  }
}

// Dual export for browser and Node.js compatibility
if (typeof window !== 'undefined') {
  window.URLUnwrapper = { unwrapRedirect, unwrapBing, stripTrackers, decodeMulti };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { unwrapRedirect, unwrapBing, stripTrackers, decodeMulti };
}
