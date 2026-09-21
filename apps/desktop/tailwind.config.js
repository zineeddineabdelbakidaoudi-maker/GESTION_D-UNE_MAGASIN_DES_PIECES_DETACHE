/** @type {import('tailwindcss').Config} */

/**
 * Thématisation par variables CSS plutôt que par classes conditionnelles.
 *
 * L'interface a été dessinée en sombre : `slate-950` est le fond le plus
 * profond, `slate-100` le texte le plus clair. En mode clair, l'échelle est
 * simplement inversée — les rapports de contraste dessinés à l'origine sont
 * conservés et aucun écran n'a besoin d'être réécrit.
 *
 * Les teintes d'accent subissent le même traitement : les nuances claires
 * (300/400), lisibles sur fond sombre, deviennent des nuances soutenues en mode
 * clair, sinon elles disparaîtraient sur du blanc. Les nuances pleines
 * (500/600), qui servent de fond de bouton avec du texte blanc, ne bougent pas.
 *
 * `<alpha-value>` préserve les modificateurs d'opacité (`bg-slate-900/60`).
 */
const SLATE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const ACCENT_SHADES = [200, 300, 400, 500, 600, 700, 800, 900, 950];
const ACCENTS = ['blue', 'emerald', 'rose', 'amber', 'red', 'green', 'cyan', 'violet', 'indigo', 'purple', 'orange', 'sky', 'teal'];

const varScale = (name, shades) =>
  Object.fromEntries(shades.map(shade => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: varScale('s', SLATE_SHADES),
        ...Object.fromEntries(ACCENTS.map(hue => [hue, varScale(hue, ACCENT_SHADES)])),
        pos: {
          sidebar: '#0f172a',
          accent: '#2563eb',
          danger: '#dc2626',
          success: '#16a34a',
          warning: '#d97706'
        }
      }
    }
  },
  plugins: []
};
