/**
 * City Blinds — shared Twilio lead-SMS helper.
 *
 * Used by the Vercel function (api/submit.js) in production and by the
 * local dev server (server.js) so the whole flow can be tested without
 * the Vercel CLI.
 */
const twilio = require('twilio');

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;

/** Human-readable body for the SMS sent to the business. */
function formatLeadSms(payload) {
  const lines = ['New City Blinds lead', '---'];
  Object.keys(payload.answers || {}).forEach(function (q) {
    lines.push(q + ': ' + payload.answers[q]);
  });
  lines.push('---');
  lines.push('Name: ' + [payload.firstName, payload.lastName].filter(Boolean).join(' '));
  lines.push('Phone: ' + payload.phone);
  lines.push('Email: ' + payload.email);
  lines.push('Address: ' + payload.address);
  lines.push('Post code: ' + payload.postcode);
  return lines.join('\n');
}

/** Returns an array of human-readable errors; empty array = valid. */
function validateLead(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['Invalid payload'];
  ['firstName', 'lastName', 'phone', 'email', 'address', 'postcode'].forEach(function (f) {
    if (!payload[f] || !payload[f].toString().trim()) errors.push('Please fill in your ' + f + '.');
  });
  if (errors.length) return errors;
  if (!RE_EMAIL.test(payload.email.toString().trim())) errors.push('Please enter a valid email address.');
  const digits = payload.phone.toString().replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) errors.push('Please enter a valid phone number.');
  if (!RE_POSTCODE.test(payload.postcode.toString().trim())) errors.push('Please enter a valid UK postcode.');
  if (!payload.answers || Object.keys(payload.answers).length < 4) errors.push('Please complete the survey questions.');
  return errors;
}

/** Sends the lead as an SMS to the business using the Twilio API. */
async function sendLeadSms(payload) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.BUSINESS_PHONE;

  if (!accountSid || !authToken || !from || !to) {
    const err = new Error('Twilio environment variables are not configured.');
    err.code = 'ENV_MISSING';
    throw err;
  }

  const client = twilio(accountSid, authToken);
  return client.messages.create({
    from,
    to,
    body: formatLeadSms(payload)
  });
}

module.exports = { formatLeadSms, validateLead, sendLeadSms };
