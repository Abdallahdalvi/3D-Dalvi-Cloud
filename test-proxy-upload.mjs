import fs from 'fs';
import { Blob } from 'buffer';

async function test() {
  const form = new FormData();
  const fileData = fs.readFileSync('package.json');
  const blob = new Blob([fileData], { type: 'application/json' });
  form.append('file', blob, 'package.json');

  try {
    const res = await fetch('http://localhost:3000/api/tripo/upload', {
      method: 'POST',
      body: form
    });
    console.log(res.status);
    console.log(await res.text());
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}
test();
