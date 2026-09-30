import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

export async function resolvePaymentWebhookDestination(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443") {
    throw new Error("Use an HTTPS destination on port 443 without credentials or fragments.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The destination must resolve exclusively to public addresses.");
  }
  return { url, address: addresses[0] };
}

// DNS is checked for every attempt, then the HTTPS connection uses exactly that address.
// TLS still verifies the original hostname. No redirects or response bodies are retained.
export async function sendPaymentWebhook(rawUrl: string, body: string, headers: Record<string, string>) {
  const destination = await resolvePaymentWebhookDestination(rawUrl);
  return new Promise<number>((resolve, reject) => {
    const req = request(destination.url, {
      method: "POST", autoSelectFamily: false,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [destination.address]);
        else callback(null, destination.address.address, destination.address.family);
      },
      headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body).toString() },
    }, (response) => {
      clearTimeout(timer);
      const status = response.statusCode ?? 0;
      response.destroy();
      resolve(status);
    });
    const timer = setTimeout(() => req.destroy(new Error("DELIVERY_TIMEOUT")), 3_000);
    req.on("error", (error) => { clearTimeout(timer); reject(error); });
    req.end(body);
  });
}
