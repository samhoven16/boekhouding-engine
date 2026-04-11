/**
 * gs-transform.js
 * Jest transform voor .gs bestanden.
 *
 * GAS-bestanden zijn gewone JavaScript — geen transpilatie nodig.
 * Dit vertelt Jest: behandel .gs exact als .js.
 */
module.exports = {
  process(sourceText) {
    return { code: sourceText };
  },
};
