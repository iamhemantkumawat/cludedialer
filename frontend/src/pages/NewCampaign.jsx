import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSipAccounts, getAudioFiles, uploadAudio, generateTTS, createCampaign } from '../api';

export default function NewCampaign() {
  const nav = useNavigate();

  const [form, setForm] = useState({
    name: '',
    sip_account_id: '',
    dtmf_digits: 1,
    concurrent_calls: 2,
  });

  const [audioMode,     setAudioMode]     = useState('upload');
  const [ttsText,       setTtsText]       = useState('');
  const [ttsLang,       setTtsLang]       = useState('en');
  const [audioFile,     setAudioFile]     = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [numbersRaw,    setNumbersRaw]    = useState('');
  const [sipAccounts,   setSipAccounts]   = useState([]);
  const [audioFiles,    setAudioFiles]    = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [ttsLoading,    setTtsLoading]    = useState(false);

  useEffect(() => {
    getSipAccounts().then(setSipAccounts);
    getAudioFiles().then(setAudioFiles);
  }, []);

  const parseCsv = (text) =>
    text.split(/[\n,;]+/)
      .map(n => n.replace(/[^+0-9]/g, '').trim())
      .filter(n => n.length >= 5);

  const handleCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setNumbersRaw(parseCsv(ev.target.result).join('\n'));
    reader.readAsText(file);
  };

  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) return;
    setTtsLoading(true); setError('');
    try {
      const result = await generateTTS({ text: ttsText, lang: ttsLang });
      setSelectedAudio({ fileId: result.fileId, asteriskPath: result.asteriskPath });
      setAudioFiles(prev => [{ filename: result.filename, fileId: result.fileId, asteriskPath: result.asteriskPath }, ...prev]);
    } catch (e) {
      setError('TTS failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setTtsLoading(false);
    }
  };

  const handleUploadAudio = async () => {
    if (!audioFile) return;
    setLoading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('audio', audioFile);
      const result = await uploadAudio(fd);
      setSelectedAudio({ fileId: result.fileId, asteriskPath: result.asteriskPath });
      setAudioFiles(prev => [{ filename: result.filename, fileId: result.fileId, asteriskPath: result.asteriskPath }, ...prev]);
    } catch (e) {
      setError('Upload failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    const numbers = parseCsv(numbersRaw);
    if (numbers.length === 0)  return setError('Add at least one phone number');
    if (!form.sip_account_id)  return setError('Select a SIP account');
    if (!selectedAudio)        return setError('Select or generate audio first');
    setLoading(true);
    try {
      const result = await createCampaign({
        ...form,
        audio_file: selectedAudio.fileId,
        audio_type: audioMode,
        tts_text: ttsText,
        numbers,
      });
      nav(`/campaigns/${result.id}`);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const numbers = parseCsv(numbersRaw);

  const audioModes = [
    { key: 'upload',   label: 'Upload File' },
    { key: 'tts',      label: 'TTS Generate' },
    { key: 'existing', label: 'Use Existing' },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">New Campaign</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Configure and launch a new dialing campaign</p>
        </div>
        <button onClick={() => nav(-1)} className="btn-ghost">Cancel</button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Campaign Info */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 text-xs">1</span>
            Campaign Info
          </h2>

          <div>
            <label className="label">Campaign Name</label>
            <input className="input" placeholder="e.g. April Promotion Wave 1" required
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div>
            <label className="label">SIP Account</label>
            {sipAccounts.length === 0 ? (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-sm text-orange-300">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                No SIP accounts.{' '}
                <a href="/sip" className="underline font-medium">Add one first →</a>
              </div>
            ) : (
              <select className="input" required
                value={form.sip_account_id}
                onChange={e => setForm(f => ({ ...f, sip_account_id: e.target.value }))}>
                <option value="">-- Select SIP Account --</option>
                {sipAccounts.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.username}@{s.domain})</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Concurrent Calls</label>
              <input type="number" min="1" max="50" className="input"
                value={form.concurrent_calls}
                onChange={e => setForm(f => ({ ...f, concurrent_calls: +e.target.value }))} />
              <p className="text-xs text-[#64748B] mt-1.5">Simultaneous outbound calls</p>
            </div>
            <div>
              <label className="label">DTMF Digits to Capture</label>
              <input type="number" min="1" max="4" className="input"
                value={form.dtmf_digits}
                onChange={e => setForm(f => ({ ...f, dtmf_digits: +e.target.value }))} />
              <p className="text-xs text-[#64748B] mt-1.5">How many keys to wait for</p>
            </div>
          </div>
        </div>

        {/* Audio */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 text-xs">2</span>
            Audio Message
          </h2>

          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
            {audioModes.map(m => (
              <button key={m.key} type="button"
                onClick={() => setAudioMode(m.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  audioMode === m.key
                    ? 'bg-red-600 text-white shadow'
                    : 'text-[#64748B] hover:text-white'
                }`}>
                {m.label}
              </button>
            ))}
          </div>

          {audioMode === 'upload' && (
            <div className="space-y-3">
              <label className="label">Audio File (WAV / MP3 / GSM)</label>
              <div className="flex gap-2">
                <input type="file" accept=".wav,.mp3,.gsm,.ogg" className="input flex-1 text-[#64748B]"
                  onChange={e => setAudioFile(e.target.files[0])} />
                <button type="button" disabled={!audioFile || loading}
                  onClick={handleUploadAudio} className="btn-primary whitespace-nowrap">
                  {loading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
              {selectedAudio && (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  Ready: {selectedAudio.fileId}
                </div>
              )}
            </div>
          )}

          {audioMode === 'tts' && (
            <div className="space-y-3">
              <label className="label">Message Text</label>
              <textarea rows={3} className="input resize-none"
                placeholder="Hello! Press 1 to speak to an agent, press 2 to unsubscribe."
                value={ttsText} onChange={e => setTtsText(e.target.value)} />
              <div className="flex gap-2 items-center">
                <select className="input w-32" value={ttsLang} onChange={e => setTtsLang(e.target.value)}>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="ar">Arabic</option>
                </select>
                <button type="button" disabled={!ttsText.trim() || ttsLoading}
                  onClick={handleGenerateTTS} className="btn-primary">
                  {ttsLoading ? 'Generating…' : 'Generate TTS'}
                </button>
              </div>
              {selectedAudio && (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  TTS ready: {selectedAudio.fileId}
                </div>
              )}
            </div>
          )}

          {audioMode === 'existing' && (
            <div className="space-y-2">
              <label className="label">Select from uploaded files</label>
              {audioFiles.length === 0 ? (
                <p className="text-sm text-[#64748B]">No audio files yet. Upload one first.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {audioFiles.map(f => (
                    <label key={f.fileId} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition ${
                      selectedAudio?.fileId === f.fileId
                        ? 'bg-red-500/10 border border-red-500/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}>
                      <input type="radio" name="audioFile" className="accent-red-500"
                        checked={selectedAudio?.fileId === f.fileId}
                        onChange={() => setSelectedAudio({ fileId: f.fileId, asteriskPath: f.asteriskPath })} />
                      <span className="text-sm text-[#1A1B2E]">{f.filename}</span>
                      <span className="text-xs text-[#64748B] ml-auto">
                        {f.size ? `${(f.size / 1024).toFixed(0)} KB` : ''}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Number List */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 text-xs">3</span>
            Number List
            {numbers.length > 0 && (
              <span className="ml-auto text-xs font-normal text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                {numbers.length} valid numbers
              </span>
            )}
          </h2>

          <div>
            <label className="label">Upload CSV / TXT</label>
            <input type="file" accept=".csv,.txt" className="input text-[#64748B]"
              onChange={handleCsvFile} />
            <p className="text-xs text-[#64748B] mt-1.5">One number per line or comma-separated</p>
          </div>

          <div>
            <label className="label">Or Paste Numbers</label>
            <textarea rows={6} className="input font-mono text-xs resize-none"
              placeholder={`+919876543210\n+918800001234\n+917788990011`}
              value={numbersRaw}
              onChange={e => setNumbersRaw(e.target.value)} />
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pb-4">
          <button type="submit"
            disabled={loading || !form.sip_account_id || numbers.length === 0 || !selectedAudio}
            className="btn-success text-base px-6 py-2.5">
            {loading ? 'Creating…' : 'Create Campaign'}
          </button>
          <button type="button" onClick={() => nav(-1)} className="btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
