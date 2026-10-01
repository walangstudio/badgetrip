import { defineTheme, svgs } from '@walangstudio/badgetrip-assets';

/**
 * A sample theme where every badge is an animated GIF: each built-in icon key points at
 * a GIF in `public/samples/animated/`, with a still PNG for locked badges and reduced
 * motion. Copy the folder and this file to use it in your app.
 */
export const animatedTheme = defineTheme({
  name: 'animated',
  icons: {
    icons: Object.fromEntries(
      Object.keys(svgs).map((key) => [
        key,
        {
          src: `samples/animated/${key}.gif`,
          still: `samples/animated/${key}.png`,
          animated: true,
        },
      ]),
    ),
  },
});
