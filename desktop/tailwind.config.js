/** @type {import('tailwindcss').Config} */
export default {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
	darkMode: ['class', '[data-theme="dark"]'],
	theme: {
		extend: {
			transitionProperty: {
				height: 'height',
			},
		},
	},
}
