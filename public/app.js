const $ = id => document.getElementById(id);
const source = $('source');
const preview = $('preview');
const context = preview.getContext('2d');
const crop = document.createElement('canvas');
const cropContext = crop.getContext('2d', { willReadFrequently: true });
const assembler = new CaptionAssembler();

let stream = null;
let region = null;
let dragStart = null;
let worker = null;
let capturing = false;
let scanPromise = null;
let sessionId = localStorage.getItem('captionCollectorSession');
let savedLines = 0;
let lastRaw = '';

function status(message) { $('status').textContent = message; }
function regionLabel() {
  $('region').textContent = region
    ? `Caption area: ${Math.round(region.w)} × ${Math.round(region.h)} pixels`
    : 'Drag over the caption area in the preview';
}
function updateButtons() {
  $('start').disabled = !stream || !region || capturing;
  $('stop').disabled = !capturing;
  $('download').disabled = !sessionId;
  $('raw').disabled = !sessionId;
  $('copy').disabled = !sessionId;
}
function paint() {
  if (stream && source.readyState >= 2) {
    context.drawImage(source, 0, 0, preview.width, preview.height);
    if (region) {
      context.fillStyle = 'rgba(18, 34, 43, .45)';
      context.fillRect(0, 0, preview.width, region.y);
      context.fillRect(0, region.y, region.x, region.h);
      context.fillRect(region.x + region.w, region.y, preview.width - region.x - region.w, region.h);
      context.fillRect(0, region.y + region.h, preview.width, preview.height - region.y - region.h);
      context.strokeStyle = '#77d9c9';
      context.lineWidth = Math.max(2, preview.width / 400);
      context.strokeRect(region.x, region.y, region.w, region.h);
    }
  }
  requestAnimationFrame(paint);
}
requestAnimationFrame(paint);

function point(event) {
  const bounds = preview.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(preview.width, (event.clientX - bounds.left) * preview.width / bounds.width)),
    y: Math.max(0, Math.min(preview.height, (event.clientY - bounds.top) * preview.height / bounds.height)),
  };
}
preview.addEventListener('pointerdown', event => {
  if (!stream) return;
  dragStart = point(event);
  preview.setPointerCapture(event.pointerId);
});
preview.addEventListener('pointermove', event => {
  if (!dragStart) return;
  const end = point(event);
  region = {
    x: Math.min(dragStart.x, end.x), y: Math.min(dragStart.y, end.y),
    w: Math.abs(end.x - dragStart.x), h: Math.abs(end.y - dragStart.y),
  };
  regionLabel();
});
preview.addEventListener('pointerup', () => {
  dragStart = null;
  if (region && (region.w < 20 || region.h < 15)) region = null;
  regionLabel();
  updateButtons();
});

async function api(path, payload) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Save failed');
  return data;
}
async function append(text, raw = false) {
  await api('/api/append', { id: sessionId, text, raw, at: new Date().toISOString() });
  if (!raw) {
    savedLines++;
    $('count').textContent = `${savedLines} lines`;
    const transcript = $('transcript');
    transcript.textContent += `\n${text}`;
    transcript.scrollTop = transcript.scrollHeight;
  }
}
async function saveFinished(lines) {
  for (const line of lines) await append(line);
}

function captureCrop() {
  const scale = 2;
  crop.width = Math.round(region.w * scale);
  crop.height = Math.round(region.h * scale);
  cropContext.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, crop.width, crop.height);
  const pixels = cropContext.getImageData(0, 0, crop.width, crop.height);
  let total = 0;
  for (let i = 0; i < pixels.data.length; i += 4) {
    total += .299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2];
  }
  const invert = total / (pixels.data.length / 4) < 115;
  for (let i = 0; i < pixels.data.length; i += 4) {
    let grey = .299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2];
    if (invert) grey = 255 - grey;
    grey = Math.max(0, Math.min(255, (grey - 128) * 1.45 + 128));
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grey;
  }
  cropContext.putImageData(pixels, 0, 0);
  return crop;
}

async function scan() {
  if (!capturing) return;
  try {
    const image = captureCrop();
    const result = await worker.recognize(image);
    const text = result.data.text.trim();
    if (!text) lastRaw = '';
    if (text && text !== lastRaw) {
      lastRaw = text;
      await append(text.replace(/\s*\n\s*/g, ' | '), true);
    }
    await saveFinished(assembler.observe(text));
    if (capturing) status(document.hidden
      ? 'Keep this page visible; hidden tabs may scan slowly'
      : `Reading captions · ${savedLines} saved lines`);
  } catch (error) {
    status(`Capture error: ${error.message}`);
  }
  if (capturing) setTimeout(() => { scanPromise = scan(); }, 2200);
}

$('choose').addEventListener('click', async () => {
  try {
    if (capturing) await stop();
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    source.srcObject = stream;
    await source.play();
    if (!source.videoWidth) await new Promise(resolve => source.addEventListener('loadedmetadata', resolve, { once: true }));
    preview.width = source.videoWidth;
    preview.height = source.videoHeight;
    region = {
      x: preview.width * .05,
      y: preview.height * .66,
      w: preview.width * .9,
      h: preview.height * .3,
    };
    stream.getVideoTracks()[0].addEventListener('ended', () => { stop(); stream = null; updateButtons(); });
    regionLabel();
    status('Window selected · lower caption area ready');
    updateButtons();
  } catch (error) {
    status(`Window selection failed: ${error.message}`);
  }
});

$('start').addEventListener('click', async () => {
  try {
    status('Loading OCR model…');
    if (!worker) {
      worker = await Tesseract.createWorker('eng', 1, {
        workerPath: '/vendor/worker.min.js',
        corePath: '/vendor/core',
        langPath: '/vendor/lang',
        workerBlobURL: false,
      });
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    }
    const created = await api('/api/session', {});
    sessionId = created.id;
    localStorage.setItem('captionCollectorSession', sessionId);
    savedLines = 0;
    lastRaw = '';
    assembler.pending = [];
    assembler.recent = [];
    $('count').textContent = '0 lines';
    $('transcript').textContent = '';
    capturing = true;
    updateButtons();
    status('Reading captions');
    scanPromise = scan();
  } catch (error) {
    status(`Could not start: ${error.message}`);
  }
});

async function stop() {
  if (!capturing) return;
  capturing = false;
  updateButtons();
  if (scanPromise) await scanPromise;
  try {
    await saveFinished(assembler.flush());
    status(`Saved ${savedLines} lines`);
  } catch (error) {
    status(`Save failed: ${error.message}`);
  }
}
$('stop').addEventListener('click', stop);

async function download(raw) {
  const response = await fetch(`/api/transcript?id=${encodeURIComponent(sessionId)}${raw ? '&raw=1' : ''}`);
  if (!response.ok) throw new Error('Transcript unavailable');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `meeting-${sessionId}${raw ? '-raw' : ''}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
$('download').addEventListener('click', () => download(false).catch(error => status(error.message)));
$('raw').addEventListener('click', () => download(true).catch(error => status(error.message)));
$('copy').addEventListener('click', async () => {
  try {
    const response = await fetch(`/api/transcript?id=${encodeURIComponent(sessionId)}`);
    const transcript = await response.text();
    await navigator.clipboard.writeText(`Summarize this meeting. Cover the main topics, explanations, decisions, questions, and follow-up actions. Do not invent missing content. Note any gaps in coverage.\n\n${transcript}`);
    status('Summary request copied');
  } catch (error) { status(`Copy failed: ${error.message}`); }
});

if (sessionId) {
  fetch(`/api/transcript?id=${encodeURIComponent(sessionId)}`).then(response => {
    if (!response.ok) throw new Error('Previous session unavailable');
    return response.text();
  }).then(text => {
    $('transcript').textContent = text;
    savedLines = Math.max(0, text.trim().split('\n').length - 2);
    $('count').textContent = `${savedLines} lines in previous session`;
    updateButtons();
  }).catch(() => { sessionId = null; localStorage.removeItem('captionCollectorSession'); });
}
updateButtons();
document.addEventListener('visibilitychange', () => {
  if (capturing && document.hidden) status('Keep this page visible; hidden tabs may scan slowly');
  else if (capturing) status(`Reading captions · ${savedLines} saved lines`);
});
