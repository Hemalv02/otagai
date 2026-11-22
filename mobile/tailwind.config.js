const plugin = require("tailwindcss/plugin");
const {
  colors,
  spacing,
  controls,
  fonts,
  typography,
} = require("./src/theme/tokens.json");

const pixels = (value) => `${value}px`;
const { wordmark, ...textRoles } = typography;
const typeUtilities = {
  ".type-wordmark": {
    fontFamily: fonts.wordmark,
    fontSize: pixels(wordmark.size),
    lineHeight: pixels(wordmark.lineHeight),
  },
};

for (const [role, { size, weight, lineHeight }] of Object.entries(textRoles)) {
  for (const [language, height] of Object.entries(lineHeight)) {
    const suffix = language === "en" ? "" : `-${language}`;
    typeUtilities[`.type-${role}${suffix}`] = {
      fontFamily: fonts[language][weight],
      fontSize: pixels(size),
      lineHeight: pixels(height),
    };
  }
}

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  safelist: Object.keys(typeUtilities).map((selector) => selector.slice(1)),
  theme: {
    extend: {
      colors,
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([name, value]) => [name, pixels(value)]),
      ),
      borderRadius: { control: pixels(controls.radius) },
      minHeight: {
        "touch-target": pixels(controls["touch-target"]),
        "primary-control": pixels(controls["primary-control"]),
      },
      minWidth: { "touch-target": pixels(controls["touch-target"]) },
      borderWidth: { focus: pixels(controls["focus-width"]) },
      ringWidth: { focus: pixels(controls["focus-width"]) },
      ringOffsetWidth: { focus: pixels(controls["focus-offset"]) },
    },
  },
  plugins: [plugin(({ addUtilities }) => addUtilities(typeUtilities))],
};
