import https from 'https';

https.get('https://api.github.com/repos/VAST-AI-Research/tripo-python-sdk/git/trees/master?recursive=1', { headers: { 'User-Agent': 'node.js' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data);
  });
});
