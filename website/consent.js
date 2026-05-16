/*!
 * Boekhoudbaar — Consent & Affiliate Tracking
 * GDPR/AVG-conform: geen tracking voor consent, transparante categorieen.
 *
 * Cookies:
 *   bhb_consent  (functioneel) — opslag van keuze, 365 dagen, JSON
 *   bhb_ref      (marketing)   — alleen na opt-in marketing-consent, 90 dagen
 *
 * Geen analytics-cookies: Cloudflare Web Analytics is cookieloos.
 */
(function () {
  'use strict';

  var CONSENT_KEY = 'bhb_consent';
  var REF_KEY = 'bhb_ref';
  var CONSENT_DAGEN = 365;
  var REF_DAGEN = 90;
  var VERSIE = 1;

  /* ---------- cookie-helpers ---------- */
  function setCookie(naam, waarde, dagen) {
    var d = new Date();
    d.setTime(d.getTime() + dagen * 24 * 60 * 60 * 1000);
    var sec = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      naam +
      '=' +
      encodeURIComponent(waarde) +
      '; expires=' +
      d.toUTCString() +
      '; path=/; SameSite=Lax' +
      sec;
  }
  function getCookie(naam) {
    var match = document.cookie.match(
      new RegExp('(?:^|; )' + naam.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  }
  function delCookie(naam) {
    document.cookie = naam + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
  }

  /* ---------- consent-state ---------- */
  function leesConsent() {
    var raw = getCookie(CONSENT_KEY);
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (!c || c.v !== VERSIE) return null;
      return c;
    } catch (e) {
      return null;
    }
  }
  function bewaarConsent(marketing) {
    var c = { v: VERSIE, marketing: !!marketing, ts: Date.now() };
    setCookie(CONSENT_KEY, JSON.stringify(c), CONSENT_DAGEN);
    if (!marketing) delCookie(REF_KEY);
    return c;
  }

  /* ---------- affiliate (?ref=) ---------- */
  function leesRef() {
    var match = location.search.match(/[?&]ref=([A-Za-z0-9_-]{2,32})/);
    return match ? match[1] : null;
  }
  function persisteerRefBijConsent(consent) {
    if (!consent || !consent.marketing) return;
    var nieuw = leesRef();
    if (nieuw) {
      setCookie(REF_KEY, nieuw, REF_DAGEN);
    }
  }
  function huidigeRef() {
    return getCookie(REF_KEY);
  }

  /* Vervang alle /kopen links met ?ref=… als die in cookie staat */
  function injecteerRefInKoopLinks() {
    var ref = huidigeRef();
    if (!ref) return;
    var links = document.querySelectorAll('a[href*="/kopen"]');
    links.forEach(function (a) {
      try {
        var url = new URL(a.href, location.origin);
        if (!url.searchParams.has('ref')) {
          url.searchParams.set('ref', ref);
          a.href = url.toString();
        }
      } catch (e) {
        /* ignore */
      }
    });
  }

  /* ---------- banner ---------- */
  function bouwBanner(onSave) {
    var wrap = document.createElement('div');
    wrap.id = 'bhb-consent-banner';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-live', 'polite');
    wrap.setAttribute('aria-label', 'Cookie-keuze');
    wrap.innerHTML =
      '<div class="bhb-c-card">' +
      '<div class="bhb-c-tekst">' +
      '<strong>Cookies</strong> — Boekhoudbaar gebruikt alleen functionele cookies (je keuze hier, je thema-voorkeur). Bezoekersstatistiek is cookieloos (Cloudflare). ' +
      'Wil je dat verwijzingen via een partner-link (90 dagen) onthouden worden? Zet marketing aan. ' +
      '<a href="/privacy/#cookies" target="_blank" rel="noopener">Meer info</a>.' +
      '</div>' +
      '<div class="bhb-c-knoppen">' +
      '<button type="button" class="bhb-c-btn bhb-c-secondary" data-bhb-c="reject">Alleen functioneel</button>' +
      '<button type="button" class="bhb-c-btn bhb-c-primary" data-bhb-c="accept">Alles toestaan</button>' +
      '</div>' +
      '</div>';

    var stijl = document.createElement('style');
    stijl.textContent =
      '#bhb-consent-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:16px;display:flex;justify-content:center;pointer-events:none}' +
      '#bhb-consent-banner .bhb-c-card{pointer-events:auto;max-width:780px;width:100%;background:#0D1B4E;color:#fff;border-radius:12px;padding:16px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;box-shadow:0 8px 32px rgba(0,0,0,.25);font:14px/1.5 system-ui,-apple-system,Segoe UI,Inter,Roboto,sans-serif}' +
      '#bhb-consent-banner .bhb-c-tekst{flex:1;min-width:240px}' +
      '#bhb-consent-banner .bhb-c-tekst a{color:#2EC4B6;text-decoration:underline}' +
      '#bhb-consent-banner .bhb-c-knoppen{display:flex;gap:8px;flex-wrap:wrap}' +
      '#bhb-consent-banner .bhb-c-btn{cursor:pointer;border:0;border-radius:8px;padding:10px 16px;font-weight:600;font-size:14px;font-family:inherit}' +
      // AVG: "Weigeren" en "Accepteren" even prominent (AP-guidance 2025).
      // Beide knoppen identieke fill-stijl met alleen accent-kleur verschil
      // zodat geen van beide visueel grabbing-power wint.
      '#bhb-consent-banner .bhb-c-primary{background:#2EC4B6;color:#0D1B4E}' +
      '#bhb-consent-banner .bhb-c-primary:hover{background:#26a89c}' +
      '#bhb-consent-banner .bhb-c-secondary{background:#fff;color:#0D1B4E;border:1px solid #fff}' +
      '#bhb-consent-banner .bhb-c-secondary:hover{background:#f0f0f0}' +
      '@media(max-width:560px){#bhb-consent-banner{padding:8px}#bhb-consent-banner .bhb-c-card{padding:14px}#bhb-consent-banner .bhb-c-btn{flex:1}}';

    document.head.appendChild(stijl);
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      var actie = e.target && e.target.getAttribute('data-bhb-c');
      if (!actie) return;
      var marketing = actie === 'accept';
      var consent = bewaarConsent(marketing);
      wrap.parentNode && wrap.parentNode.removeChild(wrap);
      onSave(consent);
    });
  }

  /* ---------- publieke API ---------- */
  window.BhbConsent = {
    huidigeConsent: leesConsent,
    huidigeRef: huidigeRef,
    intrekken: function () {
      delCookie(CONSENT_KEY);
      delCookie(REF_KEY);
      location.reload();
    },
    /* knop op /privacy/ om opnieuw te kiezen */
    heropen: function () {
      delCookie(CONSENT_KEY);
      if (!document.getElementById('bhb-consent-banner')) {
        bouwBanner(function (c) {
          persisteerRefBijConsent(c);
          injecteerRefInKoopLinks();
        });
      }
    },
  };

  /* ---------- init ---------- */
  function init() {
    var consent = leesConsent();
    if (consent) {
      persisteerRefBijConsent(consent);
      injecteerRefInKoopLinks();
      return;
    }
    /* Geen consent: toon banner. Geen marketing-cookie tot keuze. */
    bouwBanner(function (c) {
      persisteerRefBijConsent(c);
      injecteerRefInKoopLinks();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
