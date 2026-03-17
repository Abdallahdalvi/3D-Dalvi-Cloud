import https from 'https';

https.get('https://raw.githubusercontent.com/VAST-AI-Research/tripo-python-sdk/master/tripo3d/client.py', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    const funcIdx = lines.findIndex(l => l.includes('def _image_to_file_content'));
    if (funcIdx !== -1) {
      console.log(lines.slice(funcIdx, funcIdx + 30).join('\n'));
    } else {
      console.log("Not found");
    }
  });
});
