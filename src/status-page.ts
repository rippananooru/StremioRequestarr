export function getStatusPage(movieId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StremioRequestarr</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111;
      color: #fff;
      font-family: Arial, sans-serif;
    }

    .container {
      width: 420px;
      text-align: center;
    }

    h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }

    .movie-id {
      color: #888;
      font-size: 14px;
      margin-bottom: 30px;
    }

    .status {
      font-size: 20px;
      margin-bottom: 20px;
    }

    .progress {
      width: 100%;
      height: 24px;
      background: #333;
      border-radius: 12px;
      overflow: hidden;
    }

    .progress-bar {
      width: 42%;
      height: 100%;
      background: #4caf50;
    }

    .message {
      margin-top: 15px;
      color: #aaa;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>StremioRequestarr</h1>

    <div class="movie-id">
      Movie ID: ${movieId}
    </div>

    <div class="status">
      Downloading
    </div>

    <div class="progress">
      <div class="progress-bar"></div>
    </div>

    <div class="message">
      Download progress: 42%
    </div>
  </div>
</body>
</html>`;
}