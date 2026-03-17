import https from 'https';

https.get('https://raw.githubusercontent.com/VAST-AI-Research/tripo-python-sdk/master/examples/multiview_to_model.py', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data);
  });
});
