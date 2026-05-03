/** @type {import('tailwindcss').Config} */
const themeVariables = require('./theme');

module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: themeVariables.colors,
      borderRadius: {
        "card":   `${themeVariables.radius.card}px`,
        "card-lg": `${themeVariables.radius.cardLg}px`,
        "input":  `${themeVariables.radius.input}px`,
        "btn":    `${themeVariables.radius.btn}px`,
        "hero":   `${themeVariables.radius.hero}px`,
        "icon":   `${themeVariables.radius.icon}px`,
      },
    },
  },
  plugins: [],
};
