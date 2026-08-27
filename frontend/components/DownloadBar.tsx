"use client";

interface DownloadBarProps {
  onDownloadMarkdown: () => void;
  onDownloadPdf: () => void;
}

export default function DownloadBar({
  onDownloadMarkdown,
  onDownloadPdf,
}: DownloadBarProps) {
  return (
    <div className="download-bar">
      <button type="button" className="button" onClick={onDownloadMarkdown}>
        Download Markdown
      </button>
      <button type="button" className="button button-primary" onClick={onDownloadPdf}>
        Download PDF
      </button>
    </div>
  );
}
