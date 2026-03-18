import { useEffect, useState } from 'react';
import { getAudioFiles, deleteAudioFile, uploadAudio, generateTTS } from '../api';

export default function AudioFiles() {
  const [files,      setFiles]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [ttsText,    setTtsText]    = useState('');
  const [ttsLang,    setTtsLang]    = useState('en');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [error,      setError]      = useState('');

  const load = () => getAudioFiles().then(setFiles).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('audio', file);
      await uploadAudio(fd);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTTS = async () => {
    if (!ttsText.trim()) return;
    setTtsLoading(true); setError('');
    try {
      await generateTTS({ text: ttsText, lang: ttsLang });
      setTtsText('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setTtsLoading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Delete this audio file?')) return;
    await deleteAudioFile(fileId);
    setFiles(f => f.filter(x => x.fileId !== fileId));
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Audio Files</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Upload or generate audio messages for your campaigns</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      {/* Upload */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white text-sm">Upload Audio</h2>
        <p className="text-xs text-[#64748B]">Supported: WAV, MP3, GSM, OGG &middot; Max 20MB. Auto-converts to 8kHz WAV if ffmpeg available.</p>
        <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed border-black/[0.07] rounded-xl p-8 cursor-pointer hover:border-red-500/40 hover:bg-red-500/5 transition ${uploading ? 'opacity-50 cursor-wait' : ''}`}>
          <input type="file" accept=".wav,.mp3,.gsm,.ogg" className="hidden" onChange={handleUpload} disabled={uploading} />
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
            {uploading ? (
              <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B8BAA" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            )}
          </div>
          <div className="text-center">
            <div className="text-sm text-white">{uploading ? 'Uploading…' : 'Click to upload audio file'}</div>
            <div className="text-xs text-[#64748B] mt-0.5">WAV, MP3, GSM, OGG</div>
          </div>
        </label>
      </div>

      {/* TTS */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white text-sm">Generate TTS</h2>
        <textarea rows={3} className="input resize-none"
          placeholder="Hello! Press 1 to speak with an agent. Press 2 to unsubscribe."
          value={ttsText} onChange={e => setTtsText(e.target.value)} />
        <div className="flex gap-2">
          <select className="input w-40" value={ttsLang} onChange={e => setTtsLang(e.target.value)}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ar">Arabic</option>
            <option value="pt">Portuguese</option>
          </select>
          <button onClick={handleTTS} disabled={!ttsText.trim() || ttsLoading} className="btn-primary">
            {ttsLoading ? 'Generating…' : 'Generate & Save'}
          </button>
        </div>
      </div>

      {/* Files List */}
      <div className="card">
        <h2 className="font-semibold text-white text-sm mb-4">
          Saved Files
          <span className="ml-2 text-[#64748B] font-normal">({files.length})</span>
        </h2>
        {loading ? (
          <div className="text-center py-8 text-[#64748B]">
            <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-10 text-[#64748B]">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            No audio files yet. Upload or generate one above.
          </div>
        ) : (
          <div className="divide-y divide-black/[0.05]">
            {files.map(f => (
              <div key={f.fileId} className="py-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-mono truncate">{f.filename}</div>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    {f.size ? `${(f.size / 1024).toFixed(1)} KB · ` : ''}
                    Asterisk: <span className="font-mono">{f.asteriskPath}</span>
                  </div>
                </div>
                <button onClick={() => handleDelete(f.fileId)} className="btn-ghost text-xs py-1.5 px-3 text-red-400 hover:text-red-300">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
