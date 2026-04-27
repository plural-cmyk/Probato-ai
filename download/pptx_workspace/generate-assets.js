/**
 * Generate gradient PNG backgrounds and icon PNGs for the Probato presentation
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const WORKSPACE = __dirname;

async function generateGradient(filename, w, h, color1, color2, angle = 'diagonal') {
  let gradientDef;
  if (angle === 'diagonal') {
    gradientDef = `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">`;
  } else if (angle === 'vertical') {
    gradientDef = `<linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">`;
  } else {
    gradientDef = `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>${gradientDef}
      <stop offset="0%" style="stop-color:${color1}"/>
      <stop offset="100%" style="stop-color:${color2}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(WORKSPACE, filename));
  console.log(`Generated: ${filename}`);
}

// Create a circle icon with number
async function generateNumberIcon(filename, number, bgColor, textColor = '#FFFFFF', size = 80) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${bgColor}"/>
    <text x="${size/2}" y="${size/2 + size*0.12}" text-anchor="middle" font-family="Trebuchet MS, Corbel, sans-serif" font-size="${size*0.45}" font-weight="bold" fill="${textColor}">${number}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(WORKSPACE, filename));
  console.log(`Generated: ${filename}`);
}

// Create step arrow icon
async function generateArrowIcon(filename, color, size = 64) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" fill="${color}"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(WORKSPACE, filename));
  console.log(`Generated: ${filename}`);
}

// Create a simple icon shape (circle with symbol)
async function generateIcon(filename, symbol, bgColor, fgColor = '#FFFFFF', size = 80) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${size*0.15}" fill="${bgColor}"/>
    <text x="${size/2}" y="${size/2 + size*0.1}" text-anchor="middle" font-family="Trebuchet MS, Corbel, sans-serif" font-size="${size*0.4}" font-weight="bold" fill="${fgColor}">${symbol}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(WORKSPACE, filename));
  console.log(`Generated: ${filename}`);
}

async function main() {
  // Cover gradient (dark blue to deep blue)
  await generateGradient('cover-bg.png', 1920, 1080, '#0C2A40', '#144468', 'diagonal');
  
  // Accent gradient for split slides (orange to deep orange)
  await generateGradient('accent-panel.png', 800, 1080, '#FF6B2B', '#E05A20', 'vertical');
  
  // Dark bg gradient for rhythm-breaking slides
  await generateGradient('dark-bg.png', 1920, 1080, '#0C2A40', '#1E5F8C', 'diagonal');

  // Closing gradient
  await generateGradient('closing-bg.png', 1920, 1080, '#0C2A40', '#144468', 'diagonal');

  // Number icons for steps
  for (let i = 1; i <= 7; i++) {
    await generateNumberIcon(`num-${i}.png`, i, '#FF6B2B', '#FFFFFF', 80);
    await generateNumberIcon(`num-${i}-dark.png`, i, '#144468', '#FFFFFF', 80);
  }

  // Step icons for How It Works
  await generateIcon('icon-connect.png', 'C', '#FF6B2B', '#FFFFFF', 80);
  await generateIcon('icon-discover.png', 'D', '#1E5F8C', '#FFFFFF', 80);
  await generateIcon('icon-test.png', 'T', '#4085B0', '#FFFFFF', 80);
  await generateIcon('icon-fix.png', 'F', '#9270E1', '#FFFFFF', 80);

  // Arrow icons
  await generateArrowIcon('arrow-right.png', '#FF6B2B', 48);

  // Phase icons for roadmap
  const phases = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
  for (const p of phases) {
    await generateIcon(`phase-${p}.png`, p, '#FF6B2B', '#FFFFFF', 80);
  }

  console.log('All assets generated!');
}

main().catch(console.error);
