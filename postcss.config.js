// postcss.config.js
module.exports = {
  plugins: [
    require('@tailwindcss/postcss'), // Usa este paquete como plugin
    require('autoprefixer'),
  ],
}
