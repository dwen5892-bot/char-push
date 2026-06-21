const VAPID_PUBLIC_KEY = "BOEVuFwC3Pp1IEeG1iSBRiomYPYsFerhw_JAOusEGic6J2nQFP3ty2CbWVMQKEf_4M1U52ngIWxWCwjaklKRXE4";
const VAPID_PRIVATE_KEY = "etWSauGg81vpesgw_0-d-weHtbk2gUgP22DntkqSBts";

import { buildPushHTTPRequest } from "@pushforge/builder";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      const subscription = await request.json();
      await env.PUSH_KV.put(subscription.endpoint, JSON.stringify(subscription));
      return json({ ok: true });
    }

    if (url.pathname === "/push" && request.method === "POST") {
      const { title, body } = await request.json();
      const privateJWK = vapidKeysToJWK(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      const list = await env.PUSH_KV.list();
      let sent = 0;

      for (const key of list.keys) {
        const raw = await env.PUSH_KV.get(key.name);
        if (!raw) continue;
        const subscription = JSON.parse(raw);

        try {
          const req = await buildPushHTTPRequest({
            privateJWK,
            subscription,
            message: {
              payload: { title, body },
              adminContact: "mailto:you@example.com",
            },
          });
          await fetch(req.endpoint, { method: "POST", headers: req.headers, body: req.body });
          sent++;
        } catch (e) {
          await env.PUSH_KV.delete(key.name);
        }
      }
      return json({ ok: true, sent });
    }

    return json({ ok: false, message: "not found" }, 404);
  },
};

function vapidKeysToJWK(publicKeyB64url, privateKeyB64url) {
  const publicBytes = base64urlToBytes(publicKeyB64url);
  const x = publicBytes.slice(1, 33);
  const y = publicBytes.slice(33, 65);
  const d = base64urlToBytes(privateKeyB64url);
  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64url(x),
    y: bytesToBase64url(y),
    d: bytesToBase64url(d),
  };
}

function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
