// Layr-Diktat: eigener Hilfsprozess für die Spracherkennung (NVIDIA Parakeet TDT 0.6B v3 über sherpa-onnx).
// Läuft getrennt vom Hauptprogramm, damit das Fenster beim Erkennen nicht hängt und ein Absturz hier Layr nicht mitreißt.
// Er bekommt nur Audiodaten (16 kHz, mono) und gibt Text zurück. Kein Netzwerk, keine Dateien außer dem Modell.
'use strict';
let rec = null, sherpa = null;
const port = process.parentPort;
const send = m => { try { port.postMessage(m); } catch (e) {} };
port.on('message', async ev => {
  const m = ev && ev.data; if (!m || typeof m !== 'object') return;
  try {
    if (m.t === 'probe') {
      sherpa = sherpa || require('sherpa-onnx-node');
      send({ key: m.key, t: 'probe', ok: true, version: String(sherpa.version || ''), ort: String(sherpa.onnxruntimeVersion || '') });
    } else if (m.t === 'load') {
      sherpa = sherpa || require('sherpa-onnx-node');
      const d = String(m.dir) + require('path').sep;
      rec = await sherpa.OfflineRecognizer.createAsync({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: { transducer: { encoder: d + 'encoder.int8.onnx', decoder: d + 'decoder.int8.onnx', joiner: d + 'joiner.int8.onnx' },
          tokens: d + 'tokens.txt', numThreads: Math.max(1, Math.min(8, m.threads | 0 || 2)), provider: 'cpu', debug: 0, modelType: 'nemo_transducer' },
      });
      send({ key: m.key, t: 'ready' });
    } else if (m.t === 'dec') {
      if (!rec) throw new Error('not loaded');
      const s = m.samples instanceof Float32Array ? m.samples : null;
      if (!s || s.length < 1600 || s.length > 16000 * 40) throw new Error('samples');
      const st = rec.createStream(); st.acceptWaveform({ samples: s, sampleRate: 16000 });
      const r = await rec.decodeAsync(st);
      send({ key: m.key, t: 'res', text: String((r && r.text) || '').trim() });
    }
  } catch (e) { send({ key: m.key, t: 'err', msg: String((e && e.message) || e).slice(0, 300) }); }
});
