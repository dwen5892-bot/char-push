import { buildPushHTTPRequest } from "@pushforge/builder";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // 接收订阅信息
    if (url.pathname === "/subscribe" && request.method === "POST") {
      const subscription = await request.json();
      await env.PUSH_KV.put(subscription.endpoint, JSON.stringify(subscription));
      return json({ ok: true });
    }

    // 发送推送
    if (url.pathname === "/push" && request.method === "POST") {
      const { title, body } = await request.json();
      const privateJWK = vapidKeysToJWK(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
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
          // 订阅已失效，清理掉
          await env.PUSH_KV.delete(key.name);
        }
      }
      return json({ ok: true, sent });
    }

    return json({ ok: false, message: "not found" }, 404);
  },
};

// 把网页生成器给的 公钥/私钥(base64url 格式)转换成库需要的 JWK 格式
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
