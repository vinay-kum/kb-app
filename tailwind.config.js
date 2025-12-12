/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f6fb",
          100: "#e7ebf7",
          200: "#cbd6f0",
          300: "#a6b7e6",
          400: "#7d91d9",
          500: "#6474cb",
          600: "#5059b3",
          700: "#424891",
          800: "#373c74",
          900: "#2f345f"
        },
        sand: {
          50: "#fdf7ed",
          100: "#f7e7cc",
          200: "#edcf9d",
          300: "#d6ac67",
          400: "#bb853b",
          500: "#a36a22",
          600: "#864e17",
          700: "#6a3b15",
          800: "#533014",
          900: "#432912"
        }
      },
      boxShadow: {
        soft: "0 10px 45px rgba(24, 28, 56, 0.12)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.12)"
      }
    }
  },
  plugins: []
};
