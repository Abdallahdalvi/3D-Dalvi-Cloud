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
  type: 'image_to_model',
  model_version: 'invalid_model_version_test',
  file: { type: 'png', file_token: 'test' }
}));
req.end();
