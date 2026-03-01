exports.handler = async (event) => {
  try {
    // ==============================
    // PARSE REQUEST
    // ==============================
    const body = JSON.parse(event.body || "{}");

    const accessToken = body.accessToken;
    const fileName = body.fileName;
    const fileBase64 = body.fileBase64;
    const folderId = body.folderId;

    if (!accessToken || !fileName || !fileBase64 || !folderId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields"
        })
      };
    }

    // ==============================
    // FIX BASE64 (REMOVE HEADER)
    // ==============================
    const base64Data = fileBase64.includes(",")
      ? fileBase64.split(",")[1]
      : fileBase64;

    const fileBytes = Buffer.from(base64Data, "base64");

    console.log("Uploading file:", {
      fileName,
      folderId,
      size: fileBytes.length
    });

    // ==============================
    // BUILD MULTIPART BODY
    // ==============================
    const boundary = "foo_bar_baz";

    const metadata = {
      name: fileName,
      parents: [folderId]
    };

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`;

    const endBoundary = `\r\n--${boundary}--`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(multipartBody),
      fileBytes,
      Buffer.from(endBoundary)
    ]);

    // ==============================
    // UPLOAD TO GOOGLE DRIVE
    // ==============================
    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": bodyBuffer.length
        },
        body: bodyBuffer
      }
    );

    const result = await response.json();

    console.log("Drive response:", result);

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify(result)
      };
    }

    // ==============================
    // SUCCESS
    // ==============================
    const fileUrl = `https://drive.google.com/file/d/${result.id}/view`;
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          fileId: result.id,
          name: result.name,
          fileUrl: fileUrl
        },
        fileId: result.id,
        fileUrl: fileUrl
      })
    };
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
