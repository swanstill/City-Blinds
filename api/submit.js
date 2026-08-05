/**
 * Vercel Function — POST /api/submit
 *
 * Receives the survey lead from the landing page and sends it to the
 * business via Twilio SMS (see lib/send-lead.js).
 */
const { sendLeadSms, validateLead } = require('../lib/send-lead');

const MAX_BODY_BYTES = 32 * 1024; // generous; real payload is < 1 KB

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('Payload too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', function () { resolve(data); });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method Not Allowed' });

  let payload;
  try {
    payload = JSON.parse(await readJsonBody(req));
  } catch (e) {
    return send(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const errors = validateLead(payload);
  if (errors.length) return send(res, 400, { ok: false, error: errors[0] });

  try {
    await sendLeadSms(payload);
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('Failed to send lead SMS:', err.message);
    return send(res, 500, { ok: false, error: 'Failed to send. Please try again.' });
  }
};
