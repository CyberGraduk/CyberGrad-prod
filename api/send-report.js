// api/send-report.js
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  try {
    const { name, email, university, status, score, categories, priorities, band } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    // Build HTML email with full report
    const emailHtml = buildReportEmail({ name, email, university, score, categories, priorities, band });

    // Send via Resend
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
        html: emailHtml
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
    return res.status(500).json({ error: 'Server error' });
  }
}

function buildReportEmail({ name, email, university, score, categories, priorities, band }) {
  const firstName = name.split(' ')[0];
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Score colour
  const scoreColour = score >= 80 ? '#00C896' : score >= 60 ? '#3B82F6' : score >= 40 ? '#D97706' : '#DC2626';

  // Category rows
  const categoryRows = (categories || []).map(cat => {
    const pct = Math.round((cat.score / cat.max) * 100);
    const col = cat.score / cat.max >= 0.75 ? '#00C896' : cat.score / cat.max >= 0.5 ? '#D97706' : '#DC2626';
    return `
      <tr>
        <td style="padding:10px 16px;font-size:14px;color:#333333;border-bottom:1px solid #f0f0f0">${cat.name}</td>
        <td style="padding:10px 16px;text-align:center;font-weight:700;color:${col};border-bottom:1px solid #f0f0f0">${cat.score}/${cat.max}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0">
          <div style="background:#f0f0f0;border-radius:4px;height:8px;overflow:hidden">
            <div style="background:${col};height:8px;width:${pct}%;border-radius:4px"></div>
          </div>
        </td>
      </tr>`;
  }).join('');

  // Priority action items
  const priorityItems = (priorities || []).slice(0, 5).map((p, i) => `
    <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">
      <div style="width:24px;height:24px;border-radius:50%;background:#00C896;color:#060B16;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-align:center;line-height:24px">${i + 1}</div>
      <div style="font-size:14px;color:#555555;line-height:1.6"><strong style="color:#333333">${p.title}:</strong> ${p.fix}</div>
    </div>`).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">

  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <!-- HEADER -->
    <div style="background:#060B16;border-radius:12px 12px 0 0;padding:24px 32px;display:flex;align-items:center;gap:12px">
      <div style="background:#00C896;border-radius:8px;padding:6px 12px;font-weight:800;font-size:14px;color:#060B16;display:inline-block">CyberGrad</div>
      <span style="color:#8896B3;font-size:14px;margin-left:8px">UK CV Report</span>
    </div>

    <!-- SCORE HERO -->
    <div style="background:#ffffff;padding:32px;border-left:1px solid #e8e8e8;border-right:1px solid #e8e8e8">
      <p style="font-size:15px;color:#555555;margin:0 0 20px">Hi ${firstName},</p>
      <p style="font-size:15px;color:#555555;margin:0 0 28px;line-height:1.65">Here's your full CyberGrad CV report. Your score, every category breakdown, and your top priority fixes are all below.</p>

      <!-- BIG SCORE -->
      <div style="background:#f9fafb;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;border:1px solid #e8e8e8">
        <div style="font-size:64px;font-weight:800;color:${scoreColour};letter-spacing:-2px;line-height:1">${score}</div>
        <div style="font-size:16px;color:#777777;margin-top:4px">out of 100</div>
        <div style="display:inline-block;margin-top:12px;background:${scoreColour}22;border:1px solid ${scoreColour}44;border-radius:6px;padding:5px 16px;font-size:13px;font-weight:700;color:${scoreColour}">${band || 'Your score'}</div>
        <div style="margin-top:16px;font-size:14px;color:#555555">Checked on ${date} · ${university || 'UK University'}</div>
      </div>

      <!-- CATEGORY BREAKDOWN -->
      <h2 style="font-size:18px;font-weight:700;color:#111111;margin:0 0 16px;letter-spacing:-0.3px">Score breakdown</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:32px;border:1px solid #e8e8e8;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#777777">Category</th>
            <th style="padding:10px 16px;text-align:center;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#777777">Score</th>
            <th style="padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#777777">Progress</th>
          </tr>
        </thead>
        <tbody>${categoryRows}</tbody>
      </table>

      <!-- PRIORITY ACTIONS -->
      <h2 style="font-size:18px;font-weight:700;color:#111111;margin:0 0 16px;letter-spacing:-0.3px">Your top 5 priority fixes</h2>
      <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:32px;border:1px solid #e8e8e8">
        ${priorityItems || '<p style="color:#777777;font-size:14px">No critical issues found — great work!</p>'}
      </div>

      <!-- CTA -->
      <div style="background:#060B16;border-radius:12px;padding:28px;text-align:center">
        <p style="color:#F0F6FF;font-size:16px;font-weight:700;margin:0 0 8px">Want a human expert to review this?</p>
        <p style="color:#8896B3;font-size:14px;margin:0 0 20px;line-height:1.6">Rakesh personally reviews every CV on the Foundation plan — live sessions, 1-to-1 coaching, and everything you need to land UK cyber roles.</p>
        <a href="https://www.cyber-grad.co.uk/pricing.html" style="display:inline-block;background:#00C896;color:#060B16;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none">See Foundation Plan →</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="background:#f0f0f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center">
      <p style="font-size:12px;color:#999999;margin:0 0 4px;font-style:italic">"Guidance, not guarantees." · cyber-grad.co.uk</p>
      <p style="font-size:12px;color:#999999;margin:0">© 2026 CyberGrad · cybergraduk@gmail.com</p>
    </div>

  </div>
</body>
</html>`;
}
