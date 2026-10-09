# Fonts for the social-sharing image

`opengraph-image.tsx` renders the headline in Newsreader, the site's serif. The
pages themselves load Newsreader through `next/font/google`; the image renderer
(Satori) needs the font file directly and cannot read WOFF2, so the latin 400
WOFF is kept here.

| File                               | Source package                 | Licence                                          |
| ---------------------------------- | ------------------------------ | ------------------------------------------------ |
| `newsreader-latin-400-normal.woff` | `@fontsource/newsreader@5.3.0` | SIL Open Font License 1.1 (`OFL-Newsreader.txt`) |
