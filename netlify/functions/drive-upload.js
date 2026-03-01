exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    const accessToken = body.accessToken;
    const fileName = body.fileName;
    const fileBase64 = body.fileBase64;
    const folderId = body.folderId;

    if (!accessToken) {
      return {
        statusCode: 400,
        body: "Missing access token"
      };
    }

    const base64Data = fileBase64.split(",")[1];
    const fileBytes = Buffer.from(base64Data, "base64");

    const metadata = {
      name: fileName,
      parents: [folderId]
    };

    const boundary = "spm_boundary";
    const bodyData = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\n`),
      Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`),
      fileBytes,
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: bodyData
      }
    );

    const result = await uploadRes.json();

    if (!uploadRes.ok) {
      return {
        statusCode: uploadRes.status,
        body: JSON.stringify(result)
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: err.message
    };
  }
};
