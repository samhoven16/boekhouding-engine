/**
 * jest.config.js
 * Jest configuratie voor lokaal testen van GAS-bronbestanden.
 *
 * .gs bestanden zijn gewone JavaScript — de transform geeft ze ongewijzigd door.
 * Het gas-runtime helper laadt bestanden in een gesimuleerde GAS-omgeving via vm.
 */
module.exports = {
  testEnvironment: 'node',

  // Zoek testbestanden in de tests/ map
  testMatch: ['**/tests/**/*.test.js'],

  // Behandel .gs als JavaScript (geen transpilatie nodig)
  transform: {
    '\\.gs$': '<rootDir>/tests/__helpers__/gs-transform.js',
  },

  // Node moet .gs bestanden kennen als geldig moduleformaat
  moduleFileExtensions: ['js', 'gs', 'json'],

  // Handige samenvatting bij fouten
  verbose: true,
};
