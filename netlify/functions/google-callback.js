exports.handler = async (event) => {
  try {
    const code = event.queryStringParameters.code;

    if (!code) {
      return {
        statusCode: 400,
        body: "Missing authorization code"
      };
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });

    const data = await res.json();

    if (!data.access_token) {
      return {
        statusCode: 500,
        body: JSON.stringify(data)
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `
        <script>
          localStorage.setItem("gdrive_token", "${data.access_token}");
          localStorage.setItem("gdrive_token_expiry", "${Date.now() + (data.expires_in - 60) * 1000}");
          ${data.refresh_token ? `localStorage.setItem("gdrive_refresh_token", "${data.refresh_token}");` : ''}
          window.location.href = "/";
        </script>
      `
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: err.message
    };
  }
};
