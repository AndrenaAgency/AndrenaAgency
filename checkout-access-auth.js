// Cloudflare Access identity verification. No request header is trusted until its JWT signature is verified.
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}
export async function verifyAccessIdentity(request, env) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const allowed = env.ACCESS_ADMIN_EMAILS;
  if (!domain || !audience || !allowed) return null; // fail closed
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain)) return null;
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt || jwt.length > 10000) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson(parts[0]);
    const payload = decodeJson(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== "https://" + domain || !Array.isArray(payload.aud) || !payload.aud.includes(audience)) return null;
    if (!Number.isInteger(payload.exp) || payload.exp <= now || !Number.isInteger(payload.iat) || payload.iat > now + 60) return null;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const permitted = allowed.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!email || !permitted.includes(email)) return null;
    const response = await fetch("https://" + domain + "/cdn-cgi/access/certs", { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!response.ok) return null;
    const keys = (await response.json()).keys;
    const jwk = Array.isArray(keys) ? keys.find(k => k.kid === header.kid && k.kty === "RSA" && (!k.alg || k.alg === "RS256")) : null;
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    return valid ? { email, subject: payload.sub } : null;
  } catch {
    return null;
  }
}
