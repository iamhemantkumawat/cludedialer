import { audioUrl } from "../app/utils";

interface AudioPreviewProps {
  fileName?: string | null;
  label?: string;
  compact?: boolean;
}

export function AudioPreview({ fileName, label = "Audio Preview", compact = false }: AudioPreviewProps) {
  if (!fileName) return null;

  return (
    <div className={`audio-preview${compact ? " audio-preview--compact" : ""}`}>
      <div className="audio-preview__meta">
        <span className="audio-preview__eyebrow">{label}</span>
        <strong>{fileName}</strong>
      </div>
      <audio controls preload="none" src={audioUrl(fileName)} className="audio-preview__player">
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}
