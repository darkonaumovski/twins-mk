import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Run `npm run icons` after changing public/icon.svg.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#2f2a26' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#2f2a26' } },
  },
  images: ['public/icon.svg'],
});
