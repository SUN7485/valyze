import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.all('/proxy', async (req, res) => {
  try {
    const { body, headers } = req;
    const apiKey = headers['x-api-key'];
    if (!apiKey?.startsWith('sk-ant-')) {
      res.status(401).json({ error: { message: 'Missing or invalid API key' } });
      return;
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`🚀 Proxy server running on http://localhost:${PORT}`));