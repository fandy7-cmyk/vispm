const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

async function getAuthClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return auth.getClient();
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { fileId } = JSON.parse(event.body || '{}');
    if (!fileId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'fileId diperlukan' }) };

    const authClient = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    await drive.files.delete({ fileId });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('DELETE ERROR:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
