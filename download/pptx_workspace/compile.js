/**
 * Compile all HTML slides into a single PPTX presentation
 * Using html2pptx.js from the ppt skill
 */
const pptxgen = require('pptxgenjs');
const path = require('path');
const html2pptx = require('/home/z/my-project/skills/ppt/scripts/html2pptx.js');

const WORKSPACE = __dirname;
const OUTPUT = '/home/z/my-project/download/Probato_Presentation.pptx';

const SLIDES = [
  'slide01.html', // Cover
  'slide02.html', // The Problem
  'slide03.html', // Introducing Probato
  'slide04.html', // How It Works
  'slide05.html', // Market Opportunity
  'slide06.html', // Competitive Landscape
  'slide07.html', // Key Differentiators
  'slide08.html', // Test Site Experience
  'slide09.html', // Pricing
  'slide10.html', // Go-To-Market
  'slide11.html', // Product Roadmap
  'slide12.html', // Financial Projections
  'slide13.html', // Investment Opportunity
  'slide14.html', // Closing
];

async function main() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Probato Team';
  pptx.company = 'Probato';
  pptx.subject = 'Probato - Autonomous AI-Powered QA Testing Platform';
  pptx.title = 'Probato Pitch Deck';

  // Font config: CJK = Microsoft YaHei, Latin = Corbel (as specified)
  const fontConfig = { cjk: 'Microsoft YaHei', latin: 'Corbel' };

  const allWarnings = [];

  for (let i = 0; i < SLIDES.length; i++) {
    const htmlFile = path.join(WORKSPACE, SLIDES[i]);
    console.log(`Processing slide ${i + 1}: ${SLIDES[i]}...`);

    try {
      const { slide, placeholders, warnings } = await html2pptx(htmlFile, pptx, { fontConfig });

      if (warnings.length > 0) {
        console.log(`  Warnings for slide ${i + 1}:`);
        warnings.forEach(w => console.log(`    ${w}`));
        allWarnings.push({ slide: i + 1, warnings });
      } else {
        console.log(`  Slide ${i + 1} OK`);
      }

      if (placeholders.length > 0) {
        console.log(`  Placeholders: ${JSON.stringify(placeholders)}`);
      }
    } catch (err) {
      console.error(`  ERROR on slide ${i + 1}: ${err.message}`);
      // Try to continue with remaining slides
    }
  }

  console.log('\nSaving PPTX...');
  await pptx.writeFile({ fileName: OUTPUT });
  console.log(`\nPresentation saved to: ${OUTPUT}`);

  if (allWarnings.length > 0) {
    console.log('\n--- Summary of Warnings ---');
    allWarnings.forEach(({ slide, warnings }) => {
      console.log(`Slide ${slide}:`);
      warnings.forEach(w => console.log(`  ${w}`));
    });
  } else {
    console.log('\nAll slides processed without warnings!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
