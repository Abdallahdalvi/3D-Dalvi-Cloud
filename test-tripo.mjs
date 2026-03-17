async function test() {
  try {
    const res = await fetch('https://api.tripo3d.ai/v2/openapi/task');
    console.log(res.status);
    console.log(await res.text());
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}
test();
