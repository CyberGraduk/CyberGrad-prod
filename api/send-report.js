// api/send-report.js — V2.1
// 2-page A4 PDF with score breakdown + full Good/Bad/Fix per category
// Product CTA (no personal language), sanitised text, attached via Resend

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  try {
    const { name, email, university, score, categories, priorities, band } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Name and email required' });

    // Use actual name, not email prefix
    const firstName = name && name.trim() && !name.includes('@')
      ? name.split(' ')[0]
      : email.split('@')[0];

    const pdfBytes = await generatePDF({ name: name || email, firstName, email, university, score, categories, priorities, band });
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    const emailHtml = buildEmailHtml({ firstName, score, band, categories, priorities });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'CyberGrad <hello@cyber-grad.co.uk>',
        to: [email],
        subject: `Your CyberGrad CV Report — ${score}/100`,
        html: emailHtml,
        attachments: [{
          filename: `CyberGrad-CV-Report-${sanitiseText(firstName)}.pdf`,
          content: pdfBase64,
          content_type: 'application/pdf'
        }]
      })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Resend error:', result);
      return res.status(500).json({ error: 'Failed to send email', detail: result });
    }
    return res.status(200).json({ success: true, id: result.id });

  } catch (err) {
    console.error('send-report error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

// ── SANITISE (WinAnsi safe) ──
function sanitiseText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u2192\u25BA\u25B6]/g, '->')
    .replace(/[\u2190\u25C4\u25C0]/g, '<-')
    .replace(/\u2013/g, '-').replace(/\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2026/g, '...').replace(/\u00D7/g, 'x')
    .replace(/\u2022/g, '-').replace(/\u2713/g, 'v')
    .replace(/[^\x00-\xFF]/g, '');
}

// ── WRAP TEXT ──
function wrapText(text, font, size, maxWidth) {
  const words = sanitiseText(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── DRAW WRAPPED TEXT, returns new Y position ──
function drawWrapped(page, text, x, y, size, font, color, maxWidth, lineHeight) {
  const lines = wrapText(text, font, size, maxWidth);
  for (const line of lines) {
    if (y < 40) return y; // safety margin
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

// ── DRAW PAGE HEADER ──
function drawHeader(page, pdfDoc, fontBold, fontReg, dark, white, teal, grey, width, height, pageNum) {
  page.drawRectangle({ x: 0, y: height - 52, width, height: 52, color: dark });
  page.drawRectangle({ x: 24, y: height - 40, width: 28, height: 22, color: teal, borderRadius: 3 });
  page.drawText('CG', { x: 30, y: height - 33, size: 10, font: fontBold, color: dark });
  page.drawText('CyberGrad', { x: 60, y: height - 32, size: 13, font: fontBold, color: white });
  page.drawText('UK CV Analysis Report', { x: 60, y: height - 44, size: 8, font: fontReg, color: grey });
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  page.drawText(`${date}   |   Page ${pageNum}`, { x: width - 150, y: height - 38, size: 8, font: fontReg, color: grey });
}

// ── DRAW PAGE FOOTER ──
function drawFooter(page, fontReg, grey, width) {
  page.drawLine({ start: { x: 24, y: 28 }, end: { x: width - 24, y: 28 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) });
  page.drawText('"Guidance, not guarantees."  -  cyber-grad.co.uk  -  cybergraduk@gmail.com', { x: 24, y: 14, size: 7, font: fontReg, color: grey });
}

// ── MAIN PDF GENERATION ──
async function generatePDF({ name, firstName, email, university, score, categories, priorities, band }) {
  const pdfDoc = await PDFDocument.create();
  const W = 595, H = 842; // A4

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const teal  = rgb(0, 0.784, 0.588);
  const dark  = rgb(0.024, 0.043, 0.086);
  const white = rgb(1, 1, 1);
  const grey  = rgb(0.53, 0.54, 0.7);
  const lightgrey = rgb(0.88, 0.88, 0.92);
  const red   = rgb(0.863, 0.149, 0.149);
  const amber = rgb(0.851, 0.467, 0.024);
  const blue  = rgb(0.231, 0.51, 0.965);
  const green = teal;

  const scoreCol = score >= 80 ? teal : score >= 60 ? blue : score >= 40 ? amber : red;
  const bandLabel = sanitiseText(band || getBandLabel(score));

  // ════════════════════════════════════════
  // PAGE 1 — Score + Category breakdown
  // ════════════════════════════════════════
  const p1 = pdfDoc.addPage([W, H]);
  drawHeader(p1, pdfDoc, fontBold, fontReg, dark, white, teal, grey, W, H, 1);
  drawFooter(p1, fontReg, grey, W);

  let y = H - 68;

  // SCORE BLOCK
  p1.drawRectangle({ x: 24, y: y - 80, width: W - 48, height: 90, color: rgb(0.039, 0.063, 0.122), borderRadius: 6 });

  // Big score
  const scoreStr = String(score);
  p1.drawText(scoreStr, { x: 44, y: y - 54, size: 48, font: fontBold, color: scoreCol });
  p1.drawText('/100', { x: 44 + scoreStr.length * 26, y: y - 46, size: 14, font: fontReg, color: grey });

  // Band pill
  const bW = fontBold.widthOfTextAtSize(bandLabel, 9) + 14;
  p1.drawRectangle({ x: 44, y: y - 76, width: bW, height: 15, color: scoreCol, borderRadius: 3 });
  p1.drawText(bandLabel, { x: 51, y: y - 72, size: 9, font: fontBold, color: dark });

  // Student info (right side)
  const displayName = sanitiseText(name && !name.includes('@') ? name : firstName);
  p1.drawText(displayName, { x: W - 220, y: y - 34, size: 11, font: fontBold, color: white });
  if (university) p1.drawText(sanitiseText(university), { x: W - 220, y: y - 48, size: 9, font: fontReg, color: grey });
  p1.drawText(sanitiseText(email), { x: W - 220, y: y - 61, size: 8, font: fontReg, color: grey });

  y -= 96;

  // SCORE BREAKDOWN heading
  p1.drawText('Score Breakdown', { x: 24, y, size: 12, font: fontBold, color: dark });
  y -= 5;
  p1.drawLine({ start: { x: 24, y }, end: { x: W - 24, y }, thickness: 0.5, color: lightgrey });
  y -= 14;

  // Category bars
  for (const cat of (categories || [])) {
    const pct = cat.max > 0 ? Math.min(cat.score / cat.max, 1) : 0;
    const catCol = pct >= 0.75 ? green : pct >= 0.5 ? amber : red;
    const barX = 210, barW = 230;

    p1.drawText(sanitiseText(cat.name), { x: 24, y, size: 9.5, font: fontReg, color: dark });
    p1.drawText(`${cat.score}/${cat.max}`, { x: W - 52, y, size: 9.5, font: fontBold, color: catCol });
    p1.drawRectangle({ x: barX, y: y - 1, width: barW, height: 6, color: lightgrey, borderRadius: 3 });
    if (pct > 0) p1.drawRectangle({ x: barX, y: y - 1, width: barW * pct, height: 6, color: catCol, borderRadius: 3 });

    y -= 19;
  }

  y -= 10;

  // PRIORITY FIXES heading
  p1.drawText('Priority Fixes', { x: 24, y, size: 12, font: fontBold, color: dark });
  y -= 5;
  p1.drawLine({ start: { x: 24, y }, end: { x: W - 24, y }, thickness: 0.5, color: lightgrey });
  y -= 14;

  for (let i = 0; i < (priorities || []).slice(0, 6).length; i++) {
    const fix = priorities[i];
    const label = sanitiseText(fix.title || fix.label || `Fix ${i + 1}`);
    const detail = sanitiseText(fix.fix || fix.detail || '');

    // Badge
    p1.drawRectangle({ x: 24, y: y - 1, width: 15, height: 15, color: teal, borderRadius: 3 });
    p1.drawText(String(i + 1), { x: 29, y: y + 2, size: 8, font: fontBold, color: dark });

    // Title
    p1.drawText(label.substring(0, 65), { x: 46, y: y + 2, size: 9.5, font: fontBold, color: dark });
    y -= 14;

    // Detail wrapped
    if (detail) {
      const detailLines = wrapText(detail, fontReg, 8, 490);
      for (const line of detailLines.slice(0, 2)) {
        p1.drawText(line, { x: 46, y, size: 8, font: fontReg, color: grey });
        y -= 10;
      }
    }
    y -= 6;
  }

  y -= 8;

  // CTA BLOCK — product language, no personal reference
  if (y > 100) {
    const ctaH = 58;
    p1.drawRectangle({ x: 24, y: y - ctaH, width: W - 48, height: ctaH, color: rgb(0.039, 0.063, 0.122), borderRadius: 6 });
    p1.drawText('Ready to fix these issues?', { x: 44, y: y - 16, size: 11, font: fontBold, color: white });
    p1.drawText('The CyberGrad Industry-Ready System - 4 weeks, live sessions, UK Sponsorship Radar, Cohort Community.', { x: 44, y: y - 29, size: 8, font: fontReg, color: grey });
    p1.drawText('Early bird: PS125 one-time. No subscription.', { x: 44, y: y - 41, size: 8, font: fontReg, color: grey });
    p1.drawRectangle({ x: 44, y: y - 55, width: 150, height: 14, color: teal, borderRadius: 3 });
    p1.drawText('cyber-grad.co.uk/checkout', { x: 50, y: y - 50, size: 8, font: fontBold, color: dark });
  }

  // ════════════════════════════════════════
  // PAGE 2 — Full Good / Bad / Fix breakdown
  // ════════════════════════════════════════
  const p2 = pdfDoc.addPage([W, H]);
  drawHeader(p2, pdfDoc, fontBold, fontReg, dark, white, teal, grey, W, H, 2);
  drawFooter(p2, fontReg, grey, W);

  y = H - 68;

  // Page 2 heading
  p2.drawText('Full Category Breakdown', { x: 24, y, size: 13, font: fontBold, color: dark });
  p2.drawText('What is good, what is wrong, and exactly how to fix it.', { x: 24, y: y - 14, size: 9, font: fontReg, color: grey });
  y -= 26;
  p2.drawLine({ start: { x: 24, y }, end: { x: W - 24, y }, thickness: 0.5, color: lightgrey });
  y -= 14;

  // Column headers
  const col1X = 24, col2X = 210, col3X = 390;
  const colW = 165;

  p2.drawText('WHAT IS GOOD', { x: col1X, y, size: 7.5, font: fontBold, color: green });
  p2.drawText('WHAT IS WRONG', { x: col2X, y, size: 7.5, font: fontBold, color: red });
  p2.drawText('HOW TO FIX IT', { x: col3X, y, size: 7.5, font: fontBold, color: blue });
  y -= 8;
  p2.drawLine({ start: { x: 24, y }, end: { x: W - 24, y }, thickness: 0.3, color: lightgrey });
  y -= 10;

  for (const cat of (categories || [])) {
    const pct = cat.score / cat.max;
    const catCol = pct >= 0.75 ? green : pct >= 0.5 ? amber : red;

    // Category label
    p2.drawRectangle({ x: 24, y: y - 2, width: W - 48, height: 16, color: rgb(0.039, 0.063, 0.122), borderRadius: 3 });
    p2.drawText(sanitiseText(cat.name), { x: 30, y: y + 2, size: 9, font: fontBold, color: white });
    p2.drawText(`${cat.score}/${cat.max}`, { x: W - 60, y: y + 2, size: 9, font: fontBold, color: catCol });
    y -= 20;

    const passItems = (cat.items || []).filter(i => i.status === 'pass');
    const failItems = (cat.items || []).filter(i => i.status === 'fail' || i.status === 'warn');
    const fixItems  = failItems.filter(i => i.fix);

    const maxRows = Math.max(passItems.length, failItems.length, fixItems.length, 1);
    const startY = y;

    // Draw each row
    for (let r = 0; r < maxRows; r++) {
      const rowY = startY - r * 22;
      if (rowY < 50) break;

      // Good column
      if (passItems[r]) {
        const title = sanitiseText(passItems[r].title || '');
        p2.drawText('v', { x: col1X, y: rowY, size: 8, font: fontBold, color: green });
        const goodLines = wrapText(title, fontReg, 7.5, colW - 10);
        for (let l = 0; l < Math.min(goodLines.length, 2); l++) {
          p2.drawText(goodLines[l], { x: col1X + 10, y: rowY - l * 8, size: 7.5, font: fontReg, color: dark });
        }
      }

      // Bad column
      if (failItems[r]) {
        const item = failItems[r];
        const badText = sanitiseText(item.desc || item.title || '');
        p2.drawText('x', { x: col2X, y: rowY, size: 8, font: fontBold, color: item.status === 'fail' ? red : amber });
        const badLines = wrapText(badText, fontReg, 7.5, colW - 10);
        for (let l = 0; l < Math.min(badLines.length, 2); l++) {
          p2.drawText(badLines[l], { x: col2X + 10, y: rowY - l * 8, size: 7.5, font: fontReg, color: dark });
        }
      }

      // Fix column
      if (fixItems[r]) {
        const fixText = sanitiseText(fixItems[r].fix || '');
        p2.drawText('->', { x: col3X, y: rowY, size: 8, font: fontBold, color: blue });
        const fixLines = wrapText(fixText, fontReg, 7.5, colW - 12);
        for (let l = 0; l < Math.min(fixLines.length, 2); l++) {
          p2.drawText(fixLines[l], { x: col3X + 14, y: rowY - l * 8, size: 7.5, font: fontReg, color: dark });
        }
      }
    }

    y = startY - maxRows * 22 - 10;

    // Divider between categories
    if (y > 60) {
      p2.drawLine({ start: { x: 24, y }, end: { x: W - 24, y }, thickness: 0.3, color: lightgrey });
      y -= 8;
    }
  }

  // CTA at bottom of page 2
  if (y > 80) {
    const ctaH = 52;
    p2.drawRectangle({ x: 24, y: y - ctaH, width: W - 48, height: ctaH, color: rgb(0.039, 0.063, 0.122), borderRadius: 6 });
    p2.drawText('The CyberGrad Industry-Ready System', { x: 44, y: y - 14, size: 10, font: fontBold, color: white });
    p2.drawText('Practical industry knowledge beyond your degree. 4 weeks. Live sessions. UK Sponsorship Radar.', { x: 44, y: y - 27, size: 8, font: fontReg, color: grey });
    p2.drawText('No job guarantees. No subscription. Early bird: PS125.', { x: 44, y: y - 38, size: 8, font: fontReg, color: grey });
    p2.drawRectangle({ x: 44, y: y - 50, width: 150, height: 12, color: teal, borderRadius: 3 });
    p2.drawText('cyber-grad.co.uk/checkout', { x: 50, y: y - 46, size: 8, font: fontBold, color: dark });
  }

  return await pdfDoc.save();
}

function getBandLabel(score) {
  if (score >= 80) return 'UK-Ready';
  if (score >= 65) return 'Strong Foundation';
  if (score >= 50) return 'Getting There';
  if (score >= 35) return 'Needs Work';
  return 'Not Yet UK-Ready';
}

// ── HTML EMAIL BODY ──
function buildEmailHtml({ firstName, score, band, categories, priorities }) {
  const scoreColour = score >= 80 ? '#00C896' : score >= 60 ? '#3B82F6' : score >= 40 ? '#D97706' : '#DC2626';
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const bandLabel = band || getBandLabel(score);

  const catRows = (categories || []).map(cat => {
    const pct = Math.round((cat.score / cat.max) * 100);
    const col = cat.score / cat.max >= 0.75 ? '#00C896' : cat.score / cat.max >= 0.5 ? '#D97706' : '#DC2626';
    return `<tr>
      <td style="padding:8px 14px;font-size:12px;color:#333;border-bottom:1px solid #f0f0f0">${cat.name}</td>
      <td style="padding:8px 14px;text-align:center;font-weight:700;color:${col};border-bottom:1px solid #f0f0f0">${cat.score}/${cat.max}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f0f0f0;width:120px">
        <div style="background:#eee;border-radius:3px;height:5px"><div style="background:${col};height:5px;width:${pct}%;border-radius:3px"></div></div>
      </td>
    </tr>`;
  }).join('');

  const fixItems = (priorities || []).slice(0, 5).map((p, i) => `
    <div style="display:flex;gap:10px;margin-bottom:10px">
      <div style="min-width:20px;height:20px;border-radius:50%;background:#00C896;color:#060B16;font-weight:700;font-size:10px;text-align:center;line-height:20px;flex-shrink:0">${i + 1}</div>
      <div style="font-size:12px;color:#555;line-height:1.6"><strong style="color:#333">${p.title || p.label || ''}:</strong> ${p.fix || p.detail || ''}</div>
    </div>`).join('');

  // Good/Bad/Fix table per category
  const catBreakdown = (categories || []).map(cat => {
    const passItems = (cat.items || []).filter(i => i.status === 'pass');
    const failItems = (cat.items || []).filter(i => i.status === 'fail' || i.status === 'warn');
    const catCol = cat.score / cat.max >= 0.75 ? '#00C896' : cat.score / cat.max >= 0.5 ? '#D97706' : '#DC2626';

    const goodRows = passItems.map(i => `<div style="font-size:11px;color:#16a34a;margin-bottom:4px">&#10003; <span style="color:#333">${i.title}</span></div>`).join('') || '<div style="font-size:11px;color:#aaa">Nothing passing here</div>';
    const badRows = failItems.map(i => `<div style="font-size:11px;color:#dc2626;margin-bottom:4px">&#10007; <span style="color:#555">${i.desc ? i.desc.substring(0, 80) + (i.desc.length > 80 ? '...' : '') : i.title}</span></div>`).join('') || '<div style="font-size:11px;color:#aaa">No issues here</div>';
    const fixRows = failItems.filter(i => i.fix).map(i => `<div style="font-size:11px;color:#2563eb;margin-bottom:4px">&#8594; <span style="color:#555">${i.fix ? i.fix.substring(0, 80) + (i.fix.length > 80 ? '...' : '') : ''}</span></div>`).join('') || '<div style="font-size:11px;color:#aaa">Nothing to fix</div>';

    return `
      <div style="margin-bottom:16px;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <div style="background:#f9fafb;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:12px;color:#111">${cat.name}</strong>
          <span style="font-size:12px;font-weight:700;color:${catCol}">${cat.score}/${cat.max}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0">
          <div style="padding:10px 12px;border-right:1px solid #f0f0f0">
            <div style="font-size:10px;font-weight:700;color:#16a34a;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Good</div>
            ${goodRows}
          </div>
          <div style="padding:10px 12px;border-right:1px solid #f0f0f0">
            <div style="font-size:10px;font-weight:700;color:#dc2626;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Bad</div>
            ${badRows}
          </div>
          <div style="padding:10px 12px">
            <div style="font-size:10px;font-weight:700;color:#2563eb;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Fix</div>
            ${fixRows}
          </div>
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:20px 16px">

  <div style="background:#060B16;border-radius:10px 10px 0 0;padding:18px 24px;display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="background:#00C896;border-radius:6px;padding:4px 9px;font-weight:800;font-size:11px;color:#060B16">CG</div>
      <span style="color:#F0F6FF;font-weight:700;font-size:14px">CyberGrad</span>
    </div>
    <span style="color:#8896B3;font-size:11px">UK CV Report · ${date}</span>
  </div>

  <div style="background:#fff;padding:24px;border-left:1px solid #eee;border-right:1px solid #eee">
    <p style="font-size:15px;color:#555;margin:0 0 16px">Hi ${firstName},</p>
    <p style="font-size:15px;color:#555;margin:0 0 20px;line-height:1.65">Your CyberGrad CV report is attached as a PDF. Here is your summary:</p>

    <div style="background:#f9fafb;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;border:1px solid #eee">
      <div style="font-size:56px;font-weight:800;color:${scoreColour};letter-spacing:-2px;line-height:1">${score}</div>
      <div style="font-size:13px;color:#777;margin-top:4px">out of 100</div>
      <div style="display:inline-block;margin-top:8px;background:${scoreColour}22;border:1px solid ${scoreColour}55;border-radius:5px;padding:3px 12px;font-size:11px;font-weight:700;color:${scoreColour}">${bandLabel}</div>
    </div>

    <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px">Score breakdown</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:20px">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:8px 14px;text-align:left;font-size:10px;text-transform:uppercase;color:#777">Category</th>
        <th style="padding:8px 14px;text-align:center;font-size:10px;text-transform:uppercase;color:#777">Score</th>
        <th style="padding:8px 14px;font-size:10px;text-transform:uppercase;color:#777">Progress</th>
      </tr></thead>
      <tbody>${catRows}</tbody>
    </table>

    <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px">Top priority fixes</h3>
    <div style="background:#f9fafb;border-radius:10px;padding:14px;margin-bottom:20px;border:1px solid #eee">
      ${fixItems || '<p style="color:#777;font-size:12px;margin:0">Strong CV - no critical issues found.</p>'}
    </div>

    <h3 style="font-size:13px;font-weight:700;color:#111;margin:0 0 10px">Full breakdown — Good / Bad / Fix</h3>
    ${catBreakdown}

    <p style="font-size:11px;color:#999;margin:0 0 18px">The full 2-page PDF report is attached to this email.</p>

    <div style="background:#060B16;border-radius:10px;padding:20px;text-align:center">
      <p style="color:#F0F6FF;font-size:14px;font-weight:700;margin:0 0 6px">The CyberGrad Industry-Ready System</p>
      <p style="color:#8896B3;font-size:12px;margin:0 0 14px;line-height:1.6">Practical industry knowledge beyond your degree. 4 weeks. Live sessions. UK Sponsorship Radar. Early bird: £125.</p>
      <a href="https://www.cyber-grad.co.uk/checkout.html" style="display:inline-block;background:#00C896;color:#060B16;padding:11px 22px;border-radius:7px;font-weight:700;font-size:13px;text-decoration:none">Join Industry-Ready — £125</a>
    </div>
  </div>

  <div style="background:#f0f0f0;border-radius:0 0 10px 10px;padding:12px 24px;text-align:center">
    <p style="font-size:10px;color:#999;margin:0;font-style:italic">"Guidance, not guarantees." · cyber-grad.co.uk</p>
  </div>
</div>
</body></html>`;
}
