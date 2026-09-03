export function statusPage(options: {
  title: string;
  statusUrl: string;
  initialStatus: string;
  initialMessage: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>StremioRequestarr</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;

      display: flex;
      align-items: center;
      justify-content: center;

      background: #111;
      color: #fff;

      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Helvetica,
        Arial,
        sans-serif;

      text-align: center;
    }

    .container {
      width: 90%;
      max-width: 600px;
      padding: 40px 30px;
    }

    .logo {
      margin-bottom: 30px;

      font-size: 18px;
      font-weight: 600;

      opacity: 0.6;
    }

    #status {
      margin: 0 0 18px;

      font-size: 32px;
      font-weight: 700;
    }

    .title {
      margin-bottom: 14px;

      font-size: 20px;
      font-weight: 500;
    }

    #message {
      margin: 0;

      font-size: 16px;
      line-height: 1.5;

      opacity: 0.6;
    }

    .loading {
      width: 28px;
      height: 28px;

      margin: 30px auto 0;

      border: 3px solid rgba(255, 255, 255, 0.15);
      border-top-color: rgba(255, 255, 255, 0.8);

      border-radius: 50%;

      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 600px) {
      #status {
        font-size: 26px;
      }

      .title {
        font-size: 18px;
      }

      #message {
        font-size: 15px;
      }
    }
  </style>
</head>

<body>

  <div class="container">

    <div class="logo">
      StremioRequestarr
    </div>

    <h1 id="status">
      ${options.initialStatus}
    </h1>

    <div class="title">
      ${options.title}
    </div>

    <p id="message">
      ${options.initialMessage}
    </p>

    <div class="loading" id="loading"></div>

  </div>

  <script>
    const statusUrl = ${JSON.stringify(options.statusUrl)};

    async function updateStatus() {
      try {
        const response = await fetch(statusUrl, {
          cache: "no-store"
        });

        const data = await response.json();

        document.getElementById("status").textContent =
          data.status;

        document.getElementById("message").textContent =
          data.message;

        if (data.done) {
          document.getElementById("loading").style.display = "none";
          clearInterval(timer);
        }

      } catch (error) {
        console.error("Status update failed:", error);

        document.getElementById("message").textContent =
          "Unable to check status.";
      }
    }

    let timer = setInterval(updateStatus, 3000);

    updateStatus();
  </script>

</body>
</html>`;
}