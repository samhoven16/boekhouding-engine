/**
 * Brand.gs
 * Centrale design-tokens voor alle dialogs.
 *
 * Voorheen werden kleuren/spacing/font-stack in elk dialog opnieuw
 * geschreven. Nu gebruiken dialogs `${THEMA.PRIMAIR}` etc. via template
 * literals — één plek wijzigen = alle dialogs mee.
 *
 * Voorbeeld in een dialog:
 *   const html = HtmlService.createHtmlOutput(`
 *     <style>
 *       body{background:${THEMA.BG};color:${THEMA.TEKST};font-family:${THEMA.FONT}}
 *       .btn{background:${THEMA.PRIMAIR};color:#fff;...}
 *     </style>
 *     ...
 *   `).setWidth(...).setHeight(...).setSandboxMode(HtmlService.SandboxMode.IFRAME);
 */

const THEMA = {
  // Kleuren
  PRIMAIR:        '#0D1B4E',   // navy — buttons, headers
  PRIMAIR_HOVER:  '#1A2A6B',   // donkerder bij hover
  ACCENT:         '#2EC4B6',   // teal — links, accents, active states
  ACCENT_HOVER:   '#28B0A4',
  BG:             '#F7F9FC',   // page-background (zacht grijs-blauw)
  BG_KAART:       '#FFFFFF',   // card-background
  RAND:           '#E5EAF2',   // border-color
  TEKST:          '#1A1A1A',   // body-tekst
  TEKST_GEDIMD:   '#5F6B7A',   // secundaire tekst
  TEKST_INVERS:   '#FFFFFF',

  // Status-kleuren
  SUCCES_BG:      '#E8F5E9',
  SUCCES_FG:      '#1B5E20',
  FOUT_BG:        '#FFEBEE',
  FOUT_FG:        '#B71C1C',
  WAARSCHUWING_BG:'#FFF8E1',
  WAARSCHUWING_FG:'#5A3F00',
  INFO_BG:        '#E3F2FD',
  INFO_FG:        '#0D47A1',

  // Typography
  FONT:           "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif",
  FONT_MONO:      "'SF Mono', Monaco, Consolas, monospace",
  FONT_GROOTTE:   '14px',
  FONT_GROOTTE_KLEIN: '12px',
  FONT_GROOTTE_HEADER: '20px',

  // Spacing
  SPACING_XS:     '4px',
  SPACING_S:      '8px',
  SPACING_M:      '14px',
  SPACING_L:      '22px',
  SPACING_XL:     '32px',

  // Border-radius
  RADIUS_S:       '4px',
  RADIUS_M:       '8px',
  RADIUS_L:       '12px',
  RADIUS_PILL:    '20px',

  // Shadows
  SHADOW_KAART:   '0 1px 2px rgba(13,27,78,0.04)',
  SHADOW_HOVER:   '0 6px 18px rgba(13,27,78,0.10)',
  SHADOW_BTN:     '0 2px 6px rgba(46,196,182,0.30)',
};

/**
 * Genereert de standaard <style>-regels die in elk dialog gebruikt worden.
 * Roep aan in template literal:
 *   <style>${standaardCss_()}</style>
 * Voorkomt copy-paste van 50+ regels CSS in elk dialog.
 */
function standaardCss_() {
  return (
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:' + THEMA.FONT + ';background:' + THEMA.BG + ';color:' + THEMA.TEKST + ';' +
      'padding:' + THEMA.SPACING_L + ';font-size:' + THEMA.FONT_GROOTTE + ';-webkit-font-smoothing:antialiased}' +
    'h1,h2,h3{color:' + THEMA.PRIMAIR + ';font-weight:700;letter-spacing:-0.01em}' +
    'h1{font-size:22px;margin-bottom:' + THEMA.SPACING_S + '}' +
    'h2{font-size:18px;margin-bottom:' + THEMA.SPACING_S + '}' +
    'h3{font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:' + THEMA.ACCENT + ';margin-top:' + THEMA.SPACING_M + ';margin-bottom:' + THEMA.SPACING_XS + '}' +
    '.btn{background:' + THEMA.PRIMAIR + ';color:' + THEMA.TEKST_INVERS + ';border:none;' +
      'padding:10px 18px;border-radius:' + THEMA.RADIUS_M + ';cursor:pointer;font-size:13px;font-weight:600;' +
      'font-family:inherit;transition:background .15s}' +
    '.btn:hover{background:' + THEMA.PRIMAIR_HOVER + '}' +
    '.btn-sec{background:' + THEMA.BG + ';color:' + THEMA.PRIMAIR + ';border:1px solid ' + THEMA.RAND + ';' +
      'padding:9px 16px;border-radius:' + THEMA.RADIUS_M + ';cursor:pointer;font-size:13px;font-weight:600;' +
      'font-family:inherit;margin-left:' + THEMA.SPACING_S + ';transition:background .15s}' +
    '.btn-sec:hover{background:#EEF2F8}' +
    'input,select,textarea{width:100%;padding:9px 12px;border:1px solid ' + THEMA.RAND + ';' +
      'border-radius:' + THEMA.RADIUS_M + ';font-size:13px;font-family:inherit;background:' + THEMA.BG_KAART + ';transition:border-color .15s}' +
    'input:focus,select:focus,textarea:focus{outline:none;border-color:' + THEMA.ACCENT + '}' +
    'label{display:block;font-weight:600;font-size:12px;color:' + THEMA.PRIMAIR + ';margin:' + THEMA.SPACING_S + ' 0 ' + THEMA.SPACING_XS + '}' +
    // Loading-utility — body.classList.add('laden') toont overlay+spinner
    'body.laden::after{content:"";position:fixed;inset:0;background:rgba(247,249,252,.7);z-index:9998}' +
    'body.laden::before{content:"";position:fixed;top:50%;left:50%;width:36px;height:36px;border:3px solid ' + THEMA.RAND + ';' +
      'border-top-color:' + THEMA.ACCENT + ';border-radius:50%;animation:spin .8s linear infinite;z-index:9999;' +
      'transform:translate(-50%,-50%);margin-left:-2px;margin-top:-2px}' +
    '@keyframes spin{to{transform:translate(-50%,-50%) rotate(360deg)}}' +
    // Mobile-min-width: dialogs mogen max 100% van viewport gebruiken
    '@media (max-width:480px){body{padding:' + THEMA.SPACING_M + '}}'
  );
}
