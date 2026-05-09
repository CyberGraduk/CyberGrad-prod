// api/create-checkout.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  try {
    const { email, name, university, plan } = req.body;

    // Plan config
    const plans = {
      foundation: {
        name: 'CyberGrad Foundation',
        description: '4-week cohort programme — live sessions, CV template, LinkedIn guide, community & more.',
        amount: 12900, // £129.00 in pence
        currency: 'gbp'
      }
    };

    const selectedPlan = plans[plan || 'foundation'];

    // Create Stripe checkout session
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'customer_email': email || '',
        'line_items[0][price_data][currency]': selectedPlan.currency,
        'line_items[0][price_data][product_data][name]': selectedPlan.name,
        'line_items[0][price_data][product_data][description]': selectedPlan.description,
        'line_items[0][price_data][unit_amount]': selectedPlan.amount,
        'line_items[0][quantity]': '1',
        'payment_method_types[0]': 'card',
        'payment_method_types[1]': 'klarna',
        'payment_method_types[2]': 'clearpay',
        'success_url': 'https://www.cyber-grad.co.uk/success.html?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url': 'https://www.cyber-grad.co.uk/pricing.html',
        'metadata[name]': name || '',
        'metadata[university]': university || '',
        'metadata[plan]': plan || 'foundation',
        'billing_address_collection': 'auto',
        'allow_promotion_codes': 'true'
      }).toString()
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe error:', session);
      return res.status(500).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ url: session.url, id: session.id });

  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
