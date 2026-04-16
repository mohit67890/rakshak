#!/usr/bin/env node
/**
 * Generates social-preview.png (1280x640) for GitHub repo social preview.
 * Upload via: GitHub repo → Settings → General → Social preview
 */
import sharp from "sharp";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function createSocialCard() {
  const width = 1280;
  const height = 640;

  const logo = await sharp(resolve(ROOT, "rakshak_logo.png"))
    .resize(200, 200, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const svgOverlay = `
    <svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1614;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#2a2320;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>

      <!-- Accent lines -->
      <rect x="0" y="0" width="${width}" height="4" fill="#C4864A"/>
      <rect x="0" y="${height - 4}" width="${width}" height="4" fill="#C4864A"/>

      <!-- Title -->
      <text x="380" y="230" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">Rakshak</text>

      <!-- Sanskrit -->
      <text x="380" y="280" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24" fill="#C4864A">रक्षक — protector</text>

      <!-- Tagline -->
      <text x="380" y="340" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="28" fill="#d4c5b0">AI-powered POSH workplace safety bot</text>
      <text x="380" y="378" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="28" fill="#d4c5b0">for Microsoft Teams</text>

      <!-- Motto -->
      <text x="380" y="460" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="20" font-style="italic" fill="#8a7e74">Because complaints shouldn't need courage.</text>

      <!-- Feature pills -->
      <rect x="380" y="500" width="180" height="32" rx="16" fill="#C4864A" opacity="0.2"/>
      <text x="410" y="522" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14" fill="#C4864A">POSH Act 2013</text>

      <rect x="575" y="500" width="200" height="32" rx="16" fill="#C4864A" opacity="0.2"/>
      <text x="600" y="522" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14" fill="#C4864A">Dead Man's Switch</text>

      <rect x="790" y="500" width="150" height="32" rx="16" fill="#C4864A" opacity="0.2"/>
      <text x="815" y="522" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14" fill="#C4864A">Open Source</text>

      <rect x="955" y="500" width="160" height="32" rx="16" fill="#C4864A" opacity="0.2"/>
      <text x="980" y="522" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14" fill="#C4864A">DPDPA 2023</text>
    </svg>
  `;

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 26, g: 22, b: 20, alpha: 1 },
    },
  })
    .composite([
      { input: Buffer.from(svgOverlay), top: 0, left: 0 },
      { input: logo, top: 195, left: 100 },
    ])
    .png()
    .toFile(resolve(ROOT, "social-preview.png"));

  console.log("Created social-preview.png (1280x640)");
  console.log("Upload it: GitHub repo → Settings → General → Social preview");
}

createSocialCard().catch(console.error);
