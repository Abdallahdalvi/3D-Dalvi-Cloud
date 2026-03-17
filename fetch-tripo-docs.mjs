import https from 'https';

https.get('https://platform.tripo3d.ai/docs/generation', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // The page is an SPA, so the content might be in JS files.
    // Let's just search duckduckgo for the exact text.
  });
});
