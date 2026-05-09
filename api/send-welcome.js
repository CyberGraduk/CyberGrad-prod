// api/send-welcome.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  try {
    const { name, email } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Name and email required' });

    const firstName = name.split(' ')[0];

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Rakesh at CyberGrad <hello@cyber-grad.co.uk>',
        to: [email],
        subject: `Welcome to CyberGrad, ${firstName} — you're in.`,
        html: buildWelcomeEmail(firstName)
      })
    });

    const result = await response.json();
    if (!response.ok) return res.status(500).json({ error: result });
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('send-welcome error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

function buildWelcomeEmail(firstName) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">

  <!-- HEADER -->
  <div style="background:#060B16;border-radius:12px 12px 0 0;padding:24px 32px">
    <div style="background:#00C896;border-radius:8px;padding:6px 12px;font-weight:800;font-size:14px;color:#060B16;display:inline-block">CyberGrad</div>
  </div>

  <!-- BODY -->
  <div style="background:#ffffff;padding:36px 32px;border-left:1px solid #e8e8e8;border-right:1px solid #e8e8e8">

    <h1 style="font-size:26px;font-weight:800;color:#111111;margin:0 0 16px;letter-spacing:-0.5px">
      Thanks for choosing CyberGrad, ${firstName}.
    </h1>

    <p style="font-size:15px;color:#555555;line-height:1.7;margin:0 0 20px">
      You've just taken the first step that most international students never do — you stopped applying blindly and decided to do this properly.
    </p>

    <p style="font-size:15px;color:#555555;line-height:1.7;margin:0 0 28px">
      Your free account is active. Here's what you can do right now:
    </p>

    <!-- WHAT'S AVAILABLE -->
    <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;margin-bottom:28px;border:1px solid #eeeeee">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px">
        <div style="width:8px;height:8px;border-radius:50%;background:#00C896;flex-shrink:0;margin-top:6px"></div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#111111;margin-bottom:2px">Check your CV — free</div>
          <div style="font-size:13px;color:#777777;line-height:1.5">Score out of 100 across 6 categories. Your full report is emailed to you immediately.</div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px">
        <div style="width:8px;height:8px;border-radius:50%;background:#00C896;flex-shrink:0;margin-top:6px"></div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#111111;margin-bottom:2px">RoadMap Clarity Quiz</div>
          <div style="font-size:13px;color:#777777;line-height:1.5">Find out which cyber specialisation and certifications fit your profile — powered by YourCyberBuddy.</div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="width:8px;height:8px;border-radius:50%;background:#00C896;flex-shrink:0;margin-top:6px"></div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#111111;margin-bottom:2px">Foundation Programme — £129</div>
          <div style="font-size:13px;color:#777777;line-height:1.5">4 live sessions, 1-to-1 coaching, UK resources, and a peer cohort. One-time payment.</div>
        </div>
      </div>
    </div>

    <!-- PERSONAL NOTE -->
    <div style="border-left:3px solid #00C896;padding-left:18px;margin-bottom:28px">
      <p style="font-size:14px;color:#555555;line-height:1.7;margin:0;font-style:italic">
        "I built CyberGrad because I was exactly where you are. MSc done, Graduate Visa ticking, applications going nowhere. I figured it out — and I want to make sure you don't have to do it alone."
      </p>
      <p style="font-size:13px;color:#999999;margin:8px 0 0;font-weight:600">— Rakesh, Founder · CyberGrad</p>
    </div>

    <!-- CTA -->
    <a href="https://www.cyber-grad.co.uk/cv-checker.html" style="display:inline-block;background:#00C896;color:#060B16;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px">Check my CV now →</a>

    <p style="font-size:13px;color:#999999;margin:16px 0 0;line-height:1.6">
      Any questions? Just reply to this email. I read every one.
    </p>

  </div>

  <!-- FOOTER -->
  <div style="background:#f0f0f0;border-radius:0 0 12px 12px;padding:18px 32px;text-align:center">
    <p style="font-size:12px;color:#999999;margin:0 0 4px;font-style:italic">"Guidance, not guarantees." · cyber-grad.co.uk</p>
    <p style="font-size:12px;color:#999999;margin:0">© 2026 CyberGrad · cybergraduk@gmail.com</p>
  </div>

</div>
</body>
</html>`;
}
