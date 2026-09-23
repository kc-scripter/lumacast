/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    "blur-[128px]",
    "blur-[140px]",
    "z-30",
    "z-40",
    "z-50",
    "bg-[size:3rem_3rem]",
    "left-[calc(50%+126px)]",
    "pl-[252px]",
    "left-[252px]",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
