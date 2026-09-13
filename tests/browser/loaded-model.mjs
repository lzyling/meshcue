/* 0.8 removed the page's download control: a reviewer who wants a file asks the
   Agent for it in the conversation. The checks that used to click that control
   were never really about it — they assert that whichever version is named on
   screen, the bytes belonging to that version are the ones the service hands
   over. That is still worth proving, so they ask for the file directly.

   The request runs inside the page. Node's DNS cannot resolve the fixture
   hostname that only Chromium's host resolver knows, and the access cookie is
   the browser's, not the test runner's. */

export async function fetchLoadedModel(page) {
  const encoded = await page.evaluate(async () => {
    const file = window.__reviewDiagnostics().modelFilename;
    const res = await fetch(`/api/download/${file}`);
    if (!res.ok) throw new Error(`download refused: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    // Chunked: spreading a multi-megabyte array into apply() overflows the stack.
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(encoded, "base64");
}

export function loadedModelDisposition(page) {
  return page.evaluate(async () => {
    const file = window.__reviewDiagnostics().modelFilename;
    const res = await fetch(`/api/download/${file}`);
    return res.headers.get("content-disposition");
  });
}
