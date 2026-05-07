#!/usr/bin/env node
/**
 * Voegt BreadcrumbList JSON-LD toe aan alle gids-pagina's die er nog
 * geen hebben. One-shot script voor SEO-uniformiteit.
 *
 * Detecteert h1 en URL-pad, bouwt BreadcrumbList, plaatst vóór bestaande
 * application/ld+json block.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GIDS_DIR = path.join(__dirname, '..', 'website', 'gids');
const BASE_URL = 'https://www.boekhoudbaar.nl';

const files = fs.readdirSync(GIDS_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
let bewerkt = 0;
let alAanwezig = 0;

files.forEach(file => {
  const filePath = path.join(GIDS_DIR, file);
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('"BreadcrumbList"')) {
    alAanwezig++;
    return;
  }
  // Extract h1
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1Match) {
    console.warn('Geen <h1> in', file);
    return;
  }
  const h1Tekst = h1Match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/—.*$/, '')
    .trim();
  const slug = file.replace(/\.html$/, '');
  const url = BASE_URL + '/gids/' + slug + '/';

  const breadcrumb = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
  {"@type":"ListItem","position":1,"name":"Boekhoudbaar","item":"${BASE_URL}/"},
  {"@type":"ListItem","position":2,"name":"Gidsen","item":"${BASE_URL}/gids/"},
  {"@type":"ListItem","position":3,"name":${JSON.stringify(h1Tekst)},"item":"${url}"}
]}
</script>
`;
  // Insert vóór de eerste <script type="application/ld+json"> als die bestaat,
  // anders vóór </head>
  const ldjsonRegex = /<script type=["']application\/ld\+json["']>/i;
  if (ldjsonRegex.test(html)) {
    html = html.replace(ldjsonRegex, breadcrumb + '<script type="application/ld+json">');
  } else {
    html = html.replace(/<\/head>/i, breadcrumb + '</head>');
  }
  fs.writeFileSync(filePath, html);
  bewerkt++;
});
console.log(`✅ ${bewerkt} gidsen bewerkt, ${alAanwezig} hadden al BreadcrumbList.`);
