import https from 'https';

https.get('https://raw.githubusercontent.com/VAST-AI-Research/tripo-python-sdk/master/tripo3d/client_impl/aiohttp_client_impl.py', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data);
  });
});
