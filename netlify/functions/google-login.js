exports.handler = async () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirect = process.env.GOOGLE_REDIRECT_URI;

  const url =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirect}` +
    `&response_type=code` +
    `&scope=https://www.googleapis.com/auth/drive.file` +
    `&access_type=offline` +
    `&prompt=consent`;

  return {
    statusCode: 302,
    headers: {
      Location: url
    }
  };
};
