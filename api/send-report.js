// api/send-report.js — V1.5
// Generates a real branded PDF using pdf-lib, attaches to Resend email

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

    const firstName = name.split(' ')[0];

    // Generate PDF
    const pdfBytes = await generatePDF({ name, firstName, email, university, score, categories, priorities, band });
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    // Build HTML email body
    const emailHtml = buildEmailHtml({ firstName, score, band, categories, priorities });

    // Send via Resend with PDF attached
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Rakesh at CyberGrad <hello@cyber-grad.co.uk>',
        to: [email],
        subject: `Your CyberGrad CV Report — ${score}/100`,
        html: emailHtml,
        attachments: [
          {
            filename: `CyberGrad-CV-Report-${firstName}.pdf`,
            content: pdfBase64,
            content_type: 'application/pdf'
          }
        ]
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

// ────────────────────────────────────────
// PDF GENERATION
// ────────────────────────────────────────
async function generatePDF({ name, firstName, email, university, score, categories, priorities, band }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const teal  = rgb(0, 0.784, 0.588);
  const dark  = rgb(0.024, 0.043, 0.086);
  const white = rgb(1, 1, 1);
  const grey  = rgb(0.533, 0.537, 0.702);
  const offwhite = rgb(0.961, 0.965, 1);

  const scoreColour = score >= 80 ? teal
    : score >= 60 ? rgb(0.231, 0.51, 0.965)
    : score >= 40 ? rgb(0.851, 0.467, 0.024)
    : rgb(0.863, 0.149, 0.149);

  let y = height;

  // ── HEADER BAR ──
  page.drawRectangle({ x: 0, y: height - 68, width, height: 68, color: dark });
  page.drawRectangle({ x: 30, y: height - 50, width: 34, height: 26, color: teal, borderRadius: 4 });
  page.drawText('CG', { x: 38, y: height - 41, size: 12, font: fontBold, color: dark });
  page.drawText('CyberGrad', { x: 72, y: height - 40, size: 15, font: fontBold, color: white });
  page.drawText('UK CV Analysis Report', { x: 72, y: height - 54, size: 9, font: fontReg, color: grey });
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  page.drawText(date, { x: width - 140, y: height - 42, size: 9, font: fontReg, color: grey });

  y = height - 86;

  // ── SCORE BLOCK ──
  page.drawRectangle({ x: 30, y: y - 86, width: width - 60, height: 96, color: rgb(0.039, 0.063, 0.122), borderRadius: 8 });

  const scoreStr = String(score);
  page.drawText(scoreStr, { x: 50, y: y - 60, size: 52, font: fontBold, color: scoreColour });
  page.drawText('/100', { x: 50 + scoreStr.length * 28, y: y - 52, size: 16, font: fontReg, color: grey });

  const bandLabel = band || getBandLabel(score);
  const bandW = fontBold.widthOfTextAtSize(bandLabel, 9) + 16;
  page.drawRectangle({ x: 50, y: y - 82, width: bandW, height: 16, color: scoreColour, borderRadius: 3 });
  page.drawText(bandLabel, { x: 58, y: y - 78, size: 9, font: fontBold, color: dark });

  // Student info right
  page.drawText(name, { x: width - 210, y: y - 38, size: 12, font: fontBold, color: white });
  if (university) page.drawText(university, { x: width - 210, y: y - 53, size: 9, font: fontReg, color: grey });
  page.drawText(email, { x: width - 210, y: y - 66, size: 9, font: fontReg, color: grey });

  y -= 104;

  // ── SECTION: BREAKDOWN ──
  page.drawText('Score Breakdown', { x: 30, y, size: 13, font: fontBold, color: dark });
  y -= 6;
  page.drawLine({ start: { x: 30, y }, end: { x: width - 30, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.9) });
  y -= 16;

  const cats = categories || [];
  for (const cat of cats) {
    const pct = cat.max > 0 ? Math.min(cat.score / cat.max, 1) : 0;
    const catCol = pct >= 0.75 ? teal : pct >= 0.5 ? rgb(0.851, 0.467, 0.024) : rgb(0.863, 0.149, 0.149);
    const barW = 220;
    const barX = 220;

    page.drawText(cat.name, { x: 30, y, size: 10, font: fontReg, color: dark });
    page.drawText(`${cat.score}/${cat.max}`, { x: width - 60, y, size: 10, font: fontBold, color: catCol });

    // Bar
    page.drawRectangle({ x: barX, y: y - 1, width: barW, height: 7, color: rgb(0.88, 0.88, 0.92), borderRadius: 3 });
    if (pct > 0) page.drawRectangle({ x: barX, y: y - 1, width: barW * pct, height: 7, color: catCol, borderRadius: 3 });

    y -= 20;
  }

  y -= 12;

  // ── SECTION: PRIORITY FIXES ──
  page.drawText('Priority Fixes', { x: 30, y, size: 13, font: fontBold, color: dark });
  y -= 6;
  page.drawLine({ start: { x: 30, y }, end: { x: width - 30, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.9) });
  y -= 16;

  const fixes = (priorities || []).slice(0, 6);
  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    const label = fix.title || fix.label || `Fix ${i + 1}`;
    const detail = fix.fix || fix.detail || '';

    // Number badge
    page.drawRectangle({ x: 30, y: y - 1, width: 16, height: 16, color: teal, borderRadius: 3 });
    page.drawText(String(i + 1), { x: 35, y: y + 2, size: 9, font: fontBold, color: dark });

    // Title
    page.drawText(label.substring(0, 60), { x: 54, y: y + 3, size: 10, font: fontBold, color: dark });

    // Detail wrapped
    if (detail) {
      const words = detail.split(' ');
      let line = '';
      let lineY = y - 9;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        const w = fontReg.widthOfTextAtSize(test, 8.5);
        if (w > 480) {
          page.drawText(line, { x: 54, y: lineY, size: 8.5, font: fontReg, color: grey });
          lineY -= 10;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) page.drawText(line, { x: 54, y: lineY, size: 8.5, font: fontReg, color: grey });
      y = lineY - 12;
    } else {
      y -= 24;
    }
  }

  y -= 12;

  // ── CTA BLOCK ──
  const ctaH = 64;
  page.drawRectangle({ x: 30, y: y - ctaH, width: width - 60, height: ctaH, color: rgb(0.039, 0.063, 0.122), borderRadius: 8 });
  page.drawText('Want Rakesh to personally review your CV?', { x: 50, y: y - 18, size: 11, font: fontBold, color: white });
  page.drawText('Foundation — £125 one-time · Live sessions · 1-to-1 coaching · WhatsApp community', { x: 50, y: y - 32, size: 8.5, font: fontReg, color: grey });
  page.drawRectangle({ x: 50, y: y - 56, width: 138, height: 16, color: teal, borderRadius: 3 });
  page.drawText('cyber-grad.co.uk/checkout', { x: 56, y: y - 51, size: 8.5, font: fontBold, color: dark });

  // ── FOOTER ──
  page.drawLine({ start: { x: 30, y: 32 }, end: { x: width - 30, y: 32 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.9) });
  page.drawText('"Guidance, not guarantees."  ·  cyber-grad.co.uk  ·  cybergraduk@gmail.com', { x: 30, y: 18, size: 7.5, font: fontReg, color: grey });

  return await pdfDoc.save();
}

function getBandLabel(score) {
  if (score >= 80) return 'Strong CV';
  if (score >= 65) return 'Good foundation';
  if (score >= 50) return 'Getting there';
  if (score >= 35) return 'Needs work';
  return 'Major gaps';
}

// ────────────────────────────────────────
// HTML EMAIL BODY
// ────────────────────────────────────────
function buildEmailHtml({ firstName, score, band, categories, priorities }) {
  const scoreColour = score >= 80 ? '#00C896' : score >= 60 ? '#3B82F6' : score >= 40 ? '#D97706' : '#DC2626';
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const bandLabel = band || getBandLabel(score);

  const catRows = (categories || []).map(cat => {
    const pct = Math.round((cat.score / cat.max) * 100);
    const col = cat.score / cat.max >= 0.75 ? '#00C896' : cat.score / cat.max >= 0.5 ? '#D97706' : '#DC2626';
    return `<tr>
      <td style="padding:9px 16px;font-size:13px;color:#333;border-bottom:1px solid #f0f0f0">${cat.name}</td>
      <td style="padding:9px 16px;text-align:center;font-weight:700;color:${col};border-bottom:1px solid #f0f0f0">${cat.score}/${cat.max}</td>
      <td style="padding:9px 16px;border-bottom:1px solid #f0f0f0;width:130px">
        <div style="background:#eee;border-radius:3px;height:6px"><div style="background:${col};height:6px;width:${pct}%;border-radius:3px"></div></div>
      </td>
    </tr>`;
  }).join('');

  const fixItems = (priorities || []).slice(0, 5).map((p, i) => `
    <div style="display:flex;gap:12px;margin-bottom:12px">
      <div style="min-width:22px;height:22px;border-radius:50%;background:#00C896;color:#060B16;font-weight:700;font-size:11px;text-align:center;line-height:22px">${i + 1}</div>
      <div style="font-size:13px;color:#555;line-height:1.6"><strong style="color:#333">${p.title || p.label || ''}:</strong> ${p.fix || p.detail || ''}</div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px 16px">
  <div style="background:#060B16;border-radius:12px 12px 0 0;padding:20px 28px">
    <div style="display:inline-block;background:#00C896;border-radius:7px;padding:5px 10px;font-weight:800;font-size:12px;color:#060B16">CG</div>
    <span style="color:#8896B3;font-size:12px;margin-left:10px">CyberGrad · UK CV Report · ${date}</span>
  </div>
  <div style="background:#fff;padding:28px;border-left:1px solid #e8e8e8;border-right:1px solid #e8e8e8">
    <p style="font-size:15px;color:#555;margin:0 0 14px">Hi ${firstName},</p>
    <p style="font-size:15px;color:#555;margin:0 0 22px;line-height:1.65">Your CV report is attached as a PDF. Here's your summary:</p>

    <div style="background:#f9fafb;border-radius:10px;padding:22px;text-align:center;margin-bottom:22px;border:1px solid #eee">
      <div style="font-size:58px;font-weight:800;color:${scoreColour};letter-spacing:-2px;line-height:1">${score}</div>
      <div style="font-size:13px;color:#777;margin-top:4px">out of 100</div>
      <div style="display:inline-block;margin-top:10px;background:${scoreColour}22;border:1px solid ${scoreColour}55;border-radius:5px;padding:4px 14px;font-size:12px;font-weight:700;color:${scoreColour}">${bandLabel}</div>
    </div>

    <h3 style="font-size:14px;font-weight:700;color:#111;margin:0 0 10px">Score breakdown</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:22px">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:8px 16px;text-align:left;font-size:10px;text-transform:uppercase;color:#777;letter-spacing:.5px">Category</th>
        <th style="padding:8px 16px;text-align:center;font-size:10px;text-transform:uppercase;color:#777">Score</th>
        <th style="padding:8px 16px;font-size:10px;text-transform:uppercase;color:#777">Progress</th>
      </tr></thead>
      <tbody>${catRows}</tbody>
    </table>

    <h3 style="font-size:14px;font-weight:700;color:#111;margin:0 0 10px">Top priority fixes</h3>
    <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:22px;border:1px solid #eee">
      ${fixItems || '<p style="color:#777;font-size:13px;margin:0">No critical issues found — strong foundation!</p>'}
    </div>

    <p style="font-size:12px;color:#999;margin:0 0 20px">📎 Full PDF attached to this email — save it and re-check after you've made changes.</p>

    <div style="background:#060B16;border-radius:10px;padding:22px;text-align:center">
      <p style="color:#F0F6FF;font-size:14px;font-weight:700;margin:0 0 8px">Want Rakesh to personally review your CV?</p>
      <p style="color:#8896B3;font-size:13px;margin:0 0 16px;line-height:1.6">Foundation plan — £125 one-time · Live sessions · 1-to-1 coaching · WhatsApp community.</p>
      <a href="https://www.cyber-grad.co.uk/checkout.html" style="display:inline-block;background:#00C896;color:#060B16;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Join Foundation — £125 →</a>
    </div>
  </div>
  <div style="background:#f0f0f0;border-radius:0 0 12px 12px;padding:14px 28px;text-align:center">
    <p style="font-size:11px;color:#999;margin:0;font-style:italic">"Guidance, not guarantees." · cyber-grad.co.uk</p>
  </div>
</div>
</body></html>`;
}
