const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// Register fonts
registerFont('/System/Library/Fonts/Supplemental/Impact.ttf', { family: 'Impact' });
registerFont('/System/Library/Fonts/Supplemental/Arial Black.ttf', { family: 'Arial Black' });

async function createCard() {
    // Load the composited frame image (metallic frame + inner content)
    const base = await loadImage('/tmp/step1.jpg');

    const width = base.width;
    const height = base.height;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw the base image
    ctx.drawImage(base, 0, 0);

    // Add a subtle inner glow vignette
    const innerGrad = ctx.createRadialGradient(width / 2, height / 2.2, 50, width / 2, height / 2.2, 350);
    innerGrad.addColorStop(0, 'rgba(77, 208, 225, 0.15)');
    innerGrad.addColorStop(0.5, 'rgba(0, 131, 143, 0.08)');
    innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = innerGrad;
    ctx.fillRect(60, 80, width - 120, height - 160);

    // Draw central icon: a stylized location pin with a spade
    const cx = width / 2;
    const cy = height / 2 - 40;

    // Outer glow circle
    const glowGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 150);
    glowGrad.addColorStop(0, 'rgba(77, 208, 225, 0.3)');
    glowGrad.addColorStop(0.5, 'rgba(0, 191, 255, 0.1)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fill();

    // Location pin shape
    ctx.save();
    ctx.translate(cx, cy - 20);

    // Pin body (teardrop shape)
    ctx.beginPath();
    ctx.moveTo(0, 75);
    ctx.bezierCurveTo(-10, 50, -55, 10, -55, -25);
    ctx.bezierCurveTo(-55, -58, -30, -80, 0, -80);
    ctx.bezierCurveTo(30, -80, 55, -58, 55, -25);
    ctx.bezierCurveTo(55, 10, 10, 50, 0, 75);
    ctx.closePath();

    // Neon glow stroke
    ctx.shadowColor = '#4dd0e1';
    ctx.shadowBlur = 25;
    ctx.strokeStyle = '#4dd0e1';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill with semi-transparent dark
    ctx.fillStyle = 'rgba(0, 30, 50, 0.7)';
    ctx.fill();

    // Inner circle in the pin
    ctx.beginPath();
    ctx.arc(0, -25, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(77, 208, 225, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#4dd0e1';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#4dd0e1';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Spade symbol inside pin
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#4dd0e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#4dd0e1';
    ctx.shadowBlur = 10;
    ctx.fillText('♠', 0, -25);
    ctx.shadowBlur = 0;

    ctx.restore();

    // Draw three floating venue building silhouettes around the pin
    ctx.save();
    ctx.shadowColor = '#00bfff';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(0, 100, 120, 0.15)';

    // Left building
    ctx.beginPath();
    ctx.rect(cx - 150, cy - 30, 50, 80);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(cx - 145, cy - 20, 12, 15);
    ctx.rect(cx - 125, cy - 20, 12, 15);
    ctx.rect(cx - 145, cy + 5, 12, 15);
    ctx.rect(cx - 125, cy + 5, 12, 15);
    ctx.fillStyle = 'rgba(77, 208, 225, 0.3)';
    ctx.fill();

    // Right building
    ctx.fillStyle = 'rgba(0, 100, 120, 0.15)';
    ctx.beginPath();
    ctx.rect(cx + 100, cy - 50, 55, 100);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(cx + 108, cy - 40, 12, 15);
    ctx.rect(cx + 130, cy - 40, 12, 15);
    ctx.rect(cx + 108, cy - 15, 12, 15);
    ctx.rect(cx + 130, cy - 15, 12, 15);
    ctx.rect(cx + 108, cy + 10, 12, 15);
    ctx.rect(cx + 130, cy + 10, 12, 15);
    ctx.fillStyle = 'rgba(77, 208, 225, 0.3)';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    // Draw connecting lines (like a network/constellation)
    ctx.save();
    ctx.strokeStyle = 'rgba(77, 208, 225, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 8]);

    // Lines from pin to buildings
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 100, cy + 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 20, cy);
    ctx.lineTo(cx + 100, cy);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();

    // Small glowing dots at connection points
    const dots = [
        [cx - 100, cy + 20],
        [cx + 100, cy],
        [cx - 60, cy + 100],
        [cx + 70, cy + 90],
        [cx - 30, cy - 100],
        [cx + 40, cy - 95],
    ];

    dots.forEach(([dx, dy]) => {
        const dotGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, 8);
        dotGrad.addColorStop(0, 'rgba(77, 208, 225, 0.8)');
        dotGrad.addColorStop(1, 'rgba(77, 208, 225, 0)');
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(dx, dy, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#4dd0e1';
        ctx.beginPath();
        ctx.arc(dx, dy, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    // ═══ TITLE TEXT: "MY CLUBS" ═══
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 4;

    // Black outline
    ctx.font = 'bold 72px Impact';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 6;
    ctx.strokeText('MY CLUBS', width / 2, 110);

    // White fill
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MY CLUBS', width / 2, 110);

    // Subtle cyan glow on top
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(77, 208, 225, 0.15)';
    ctx.fillText('MY CLUBS', width / 2, 108);

    ctx.restore();

    // ═══ SUBTITLE TEXT ═══
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;

    ctx.font = 'bold 22px "Arial Black"';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 5;

    const line1 = 'YOUR VENUES, WAITLISTS';
    const line2 = '& LIVE GAMES';

    ctx.strokeText(line1, width / 2, height - 135);
    ctx.strokeText(line2, width / 2, height - 108);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(line1, width / 2, height - 135);
    ctx.fillText(line2, width / 2, height - 108);

    ctx.restore();

    // Save the output
    const outputPath = path.join(__dirname, '..', 'public/cards/my-clubs.jpg');
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
    fs.writeFileSync(outputPath, buffer);
    console.log(`Card saved to ${outputPath} (${buffer.length} bytes)`);
}

createCard().catch(console.error);
