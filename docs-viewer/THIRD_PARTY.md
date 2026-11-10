# Docs viewer third-party assets

This first delivery imports exact upstream browser bundles, licences and
provenance under `docs-viewer/vendor/`. The existing viewer template and
installer remain CDN-first until Part 2 switches them to these local files;
Part 1 alone does not provide offline rendering. These are immutable upstream
release artifacts; do not edit minified bytes locally.

| Local file | npm package | Version | SHA-256 | License |
|---|---|---:|---|---|
| `marked.min.js` | `marked` | 12.0.2 | `15fabce5b65898b32b03f5ed25e9f891a729ad4c0d6d877110a7744aa847a894` | MIT (`LICENSE-marked.txt`) |
| `highlight.min.js` | `@highlightjs/cdn-assets` | 11.9.0 | `837a6fa5b0c736b52bbde2b2b6190f305da3fc9ed41681db5321507057b5c846` | BSD-3-Clause (`LICENSE-highlightjs.txt`) |
| `highlight-github.min.css` | `@highlightjs/cdn-assets` | 11.9.0 | `3a9a5def8b9c311e5ae43abde85c63133185eed4f0d9f67fea4b00a8308cf066` | BSD-3-Clause (`LICENSE-highlightjs.txt`) |
| `mermaid.min.js` | `mermaid` | 10.9.8 | `8d607d7ef1d077a8aa202e18e62212bfa992c68bfeabc5cf45d51a128fe6675d` | MIT (`LICENSE-mermaid.txt`) |

The npm registry tarballs and integrity values are the acquisition authority:

| Package | Primary tarball | npm integrity | Extracted member(s) |
|---|---|---|---|
| `marked@12.0.2` | `https://registry.npmjs.org/marked/-/marked-12.0.2.tgz` | `sha512-qXUm7e/YKFoqFPYPa3Ukg9xlI5cyAtGmyEIzMfW//m6kXwCy2Ps9DYf5ioijFKQ8qyuscrHoY04iJGctu2Kg0Q==` | `package/marked.min.js`, `package/LICENSE.md` |
| `@highlightjs/cdn-assets@11.9.0` | `https://registry.npmjs.org/@highlightjs/cdn-assets/-/cdn-assets-11.9.0.tgz` | `sha512-F1vJKVAkLwj2Uz2ik1PDc+mDbkrecLI6gcBlAxSRUjyDpMPJjeDBanT9Y2B+xpNe1MT6zSG204Ohm/+nUMCApQ==` | `package/highlight.min.js`, `package/styles/github.min.css`, `package/LICENSE` |
| `mermaid@10.9.8` | `https://registry.npmjs.org/mermaid/-/mermaid-10.9.8.tgz` | `sha512-gmIhmkmD/3DL5lErDV71E/cFUkEbBW4VTFpsJH1HSYjeBICRKOoc4AZem+RNz/FhhCXKBMZiD75bIfBlb2A4yA==` | `package/dist/mermaid.min.js` |

The Mermaid 10.9.8 package declares MIT but omits its license file, so the
license text is pinned from upstream commit
`49c1a1c7d1faa995b07cc7224543bd0d9a7a9e70`, the package's `gitHead`.
Its npm tarball contains no separate notice file. The distributed bundle keeps
its upstream `/*! ... */` notices, including DOMPurify's Apache-2.0/MPL-2.0
notice and the MIT notices for js-yaml and other embedded code.

The viewer renders repository-authored documentation. Vendoring removes the
CDN dependency; it does not make arbitrary untrusted Markdown safe to render.
