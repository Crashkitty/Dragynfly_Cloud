# Provider Web (placeholder)

Provider/PI desktop dashboard. Per the wireframes:

- Patient list (left rail)
- Selected-patient overview
- Charts + AI Summary (powered by BAST AI)
- Tasks / workflow bar

**Not implemented yet.** This is a separate web app. The target implementation
direction is now MERN, so this surface should be a React-based provider
dashboard backed by Node/Express APIs and MongoDB, with Cloudflare security
controls and `cloudflared` available for private-origin exposure.

The DESIGN.md tokens in `/design` will drive theme; `npx @google/design.md
export --format css-tailwind` produces a Tailwind v4 `@theme { ... }` block.
