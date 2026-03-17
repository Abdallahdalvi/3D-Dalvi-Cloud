import https from 'https';

const req = https.request('https://api.tripo3d.ai/v2/openapi/task', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test',
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});

req.write(JSON.stringify({
  type: 'multiview_to_model',
  model_version: 'v3.1-20260211',
  files: [
    { type: 'png', file_token: 'test1' },
    { type: 'png', file_token: 'test2' },
    { type: 'png', file_token: 'test3' },
    { type: 'png', file_token: 'test4' }
  ]
}));
req.end();
