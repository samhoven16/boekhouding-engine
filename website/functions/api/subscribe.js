/**
 * functions/api/subscribe.js — e-mailinschrijving voor de Light-versie lead magnet.
 *
 * Aangeroepen vanaf /gratis. Stuurt contact naar Brevo zodat een
 * automation-flow ("welkom + Light-sheet-link") getriggerd kan worden.
 *
 * Env vars (Cloudflare Pages → Settings → Environment variables):
 *   BREVO_API_KEY   — verplicht voor live operatie. Type: secret.
 *   BREVO_LIST_ID   — optioneel. Numerieke ID van de Brevo-lijst waar
 *                     nieuwe contacts in komen. Zonder dit komen ze in
 *                     "no list" en moet de Brevo-automation op
 *                     attribuut BRON='gratis-light' triggeren.
 *
 * Als BREVO_API_KEY niet is gezet: function logt en geeft 200 terug.
 * Geen storage in deze repo — privacy-propositie (Layer 1: geen tracking
 * door ons, gebruiker beslist zelf met Brevo wat er mee gebeurt).
 */

function geldigEmail(s) {
  if (typeof s !== 'string') return false;
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function veilig(s, max) {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, max);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch (_) {
    return new Response('Ongeldige verzoekdata.', { status: 400 });
  }

  const email = veilig(data.email, 254).toLowerCase();
  if (!geldigEmail(email)) {
    return new Response('Vul een geldig e-mailadres in.', { status: 400 });
  }

  const naam = veilig(data.naam, 64);
  const bron = veilig(data.bron, 64) || 'website';

  // Geen API key beschikbaar: log + return success zodat de UX niet breekt
  // tijdens initiële deploy. Inschrijvingen gaan dan verloren — bewust
  // gekozen boven een rode foutmelding aan de bezoeker.
  if (!env.BREVO_API_KEY) {
    console.log('[subscribe] Geen BREVO_API_KEY; gemiste lead: ' +
      JSON.stringify({ email, naam, bron }));
    return new Response('OK', { status: 200 });
  }

  const payload = {
    email,
    attributes: {
      VOORNAAM: naam,
      BRON: bron,
      INGESCHREVEN_OP: new Date().toISOString(),
    },
    updateEnabled: true,
  };
  if (env.BREVO_LIST_ID) {
    const id = parseInt(env.BREVO_LIST_ID, 10);
    if (Number.isFinite(id) && id > 0) payload.listIds = [id];
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    // 201 = nieuw contact, 204 = bestaand contact bijgewerkt
    if (resp.ok || resp.status === 204) {
      return new Response('OK', { status: 200 });
    }

    let detail = '';
    try { detail = (await resp.text()).slice(0, 200); } catch (_) {}
    console.error('[subscribe] Brevo error', resp.status, detail);
    return new Response('Inschrijven lukte niet. Mail info@boekhoudbaar.nl als dit blijft hangen.', { status: 502 });
  } catch (err) {
    console.error('[subscribe] Fetch error', err && err.message);
    return new Response('Verbindingsprobleem. Probeer het zo opnieuw.', { status: 502 });
  }
}

export function onRequest() {
  return new Response('Method not allowed.', { status: 405, headers: { allow: 'POST' } });
}
