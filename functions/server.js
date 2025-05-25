"const express = require("express");
const serverless = require("serverless-http");
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');

const app = express();

app.use(compression());
app.use(bodyParser.json());
app.use(cors());

let apis = null;
const MAX_API_WAIT_TIME = 3000; 
const MAX_TIME = 10000;

async function getapis() {
    try {
        const response = await axios.get('https://github.com/Tenakskd/ytserver/raw/refs/heads/main/instances.json');
        apis = response.data;
        console.log('データを取得しました:', apis);
    } catch (error) {
        console.error('データの取得に失敗しました:', error);
    }
}

async function ggvideo(videoId) {
  const startTime = Date.now();
  const instanceErrors = new Set();
    
  for (let i = 0; i < 20; i++) {
    if (Math.floor(Math.random() * 20) === 0) {
        await getapis();
    }
  }
  if(!apis){
    await getapis();
  }

  for (const instance of apis) {
    try {
      const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: MAX_API_WAIT_TIME });
      if (response.data && response.data.formatStreams) {
        return response.data; 
      }
    } catch (error) {
      instanceErrors.add(instance);
    }
    if (Date.now() - startTime >= MAX_TIME) {
      throw new Error("接続がタイムアウトしました");
    }
  }
  throw new Error("動画を取得する方法が見つかりません");
}

app.get('/', (req, res) => {
    res.sendStatus(200);
});

app.get('/data', (req, res) => {
    if (apis) {
        res.json(apis);
    } else {
        res.status(500).send('データを取得できていません');
    }
});

app.get('/refresh', async (req, res) => {
    await getapis();
    res.sendStatus(200);
});

app.get(['/api/:id', '/api/login/:id'], async (req, res) => {
  const videoId = req.params.id;
  try {
    const videoInfo = await ggvideo(videoId);
    const formatStreams = videoInfo.formatStreams || [];
    const streamUrl = formatStreams.reverse().map(stream => stream.url)[0];
    const audioStreams = videoInfo.adaptiveFormats || [];

    let highstreamUrl = audioStreams
      .filter(stream => stream.container === 'webm' && stream.resolution === '1080p')
      .map(stream => stream.url)[0];
    const audioUrl = audioStreams
      .filter(stream => stream.container === 'm4a' && stream.audioQuality === 'AUDIO_QUALITY_MEDIUM')
      .map(stream => stream.url)[0];
    const streamUrls = audioStreams
      .filter(stream => stream.container === 'webm' && stream.resolution)
      .map(stream => ({
        url: stream.url,
        resolution: stream.resolution,
      }));

    const templateData = {
      stream_url: streamUrl,
      highstreamUrl: highstreamUrl,
      audioUrl: audioUrl,
      videoId: videoId,
      channelId: videoInfo.authorId,
      channelName: videoInfo.author,
      channelImage: videoInfo.authorThumbnails?.[videoInfo.authorThumbnails.length - 1]?.url || '',
      videoTitle: videoInfo.title,
      videoDes: videoInfo.descriptionHtml,
      videoViews: videoInfo.viewCount,
      likeCount: videoInfo.likeCount,
      streamUrls: streamUrls
    };
    res.json(templateData);
  } catch (error) {
    res.status(500).json({ 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

function streamurlchange(url) {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.delete('host');
    return urlObj.toString();
  } catch (error) {
    console.error('URLが無効です:', url);
    return url;
  }
}
module.exports.handler = serverless(app);
