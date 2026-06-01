/**
 * functions/_middleware.js — Cloudflare Pages middleware (draait op elke request).
 *
 * CYCLE-62: noindex voor niet-canonieke hosts.
 *
 * PROBLEEM (bewezen via search): de Cloudflare Pages deploy-URLs
 *   <hash>.boekhouding-engine.pages.dev
 * waren publiek crawlbaar en verschenen in Brave/Google naast
 * www.boekhoudbaar.nl. Gevolg: duplicate content → merk-autoriteit
 * verdund + koper-verwarring ("welke site is de echte?"). Canonical-tags
 * alleen lossen dit niet betrouwbaar op; een hard noindex-header is het
 * juiste signaal voor preview/staging-hosts.
 *
 * AANPAK: alleen de canonieke productie-host (www.boekhoudbaar.nl) mag
 * geïndexeerd worden. Alle andere hosts (*.pages.dev preview + apex
 * zonder www) krijgen `X-Robots-Tag: noindex, nofollow`. De apex
 * boekhoudbaar.nl → www redirect gebeurt al via Cloudflare Redirect
 * Rules; deze middleware is een vangnet voor wat daar doorheen komt.
 *
 * Geen tracking, geen state, geen externe calls — past binnen de
 * privacy-propositie (Layer 1). Eén header-mutatie, edge-side.
 */

const CANONIEKE_HOST = 'www.boekhoudbaar.nl';

export async function onRequest(context) {
  const { request, next } = context;
  const response = await next();

  let host = '';
  try {
    host = new URL(request.url).hostname.toLowerCase();
  } catch (_) {
    host = '';
  }

  // Alleen de canonieke host blijft indexeerbaar. Al het andere
  // (preview-deploys op *.pages.dev, apex zonder www, branch-previews)
  // krijgt een noindex-header zodat search-engines het niet opnemen.
  if (host !== CANONIEKE_HOST) {
    // Kloon de response zodat we headers kunnen muteren (response van
    // next() kan immutable headers hebben bij static assets).
    const nieuw = new Response(response.body, response);
    nieuw.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return nieuw;
  }

  return response;
}
