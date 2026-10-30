import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.jsx';

const CARD_WIDTH = 720;
const CARD_HEIGHT = 480;
const MAX_ROWS = 8;

function drawCard(canvas, report, t) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  const defaulters = report.students.filter((s) => s.isDefaulter);
  const avg = report.classAveragePct;

  ctx.fillStyle = '#0f1115';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = '#e2e7ee';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.fillText(t('academic.attendanceReport.cardTitle'), 32, 52);

  ctx.fillStyle = '#8a93a3';
  ctx.font = '400 15px system-ui, sans-serif';
  const fromLabel = report.from ? new Date(report.from).toISOString().slice(0, 10) : '';
  const toLabel = report.to ? new Date(report.to).toISOString().slice(0, 10) : '';
  ctx.fillText(`${fromLabel} to ${toLabel}`, 32, 78);

  // Ring
  const cx = 100;
  const cy = 160;
  const r = 56;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#2a3040';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  if (avg !== null && avg !== undefined) {
    ctx.strokeStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (avg / 100) * Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(avg === null || avg === undefined ? '—' : `${avg}%`, cx, cy + 8);
  ctx.textAlign = 'left';

  ctx.fillStyle = defaulters.length > 0 ? '#f87171' : '#e2e7ee';
  ctx.font = '600 20px system-ui, sans-serif';
  const headline =
    defaulters.length === 0
      ? t('academic.attendanceReport.noneBelowThreshold', { pct: report.thresholdPct })
      : t('academic.attendanceReport.countBelowThreshold', {
          count: defaulters.length,
          pct: report.thresholdPct,
        });
  ctx.fillText(headline, 190, 150);

  ctx.fillStyle = '#8a93a3';
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillText(
    t('academic.attendanceReport.cardThresholdLine', {
      pct: report.thresholdPct,
      count: report.students.length,
    }),
    190,
    174
  );

  // Defaulter list
  let y = 250;
  ctx.font = '500 16px system-ui, sans-serif';
  const shown = defaulters.slice(0, MAX_ROWS);
  for (const s of shown) {
    ctx.fillStyle = '#e2e7ee';
    ctx.fillText(`${s.firstName} ${s.lastName}`, 32, y);
    ctx.fillStyle = '#f87171';
    ctx.textAlign = 'right';
    ctx.fillText(`${s.presentCount}/${s.totalCount} · ${s.pct}%`, CARD_WIDTH - 32, y);
    ctx.textAlign = 'left';
    y += 32;
  }
  if (defaulters.length > shown.length) {
    ctx.fillStyle = '#8a93a3';
    ctx.font = '400 14px system-ui, sans-serif';
    ctx.fillText(
      t('academic.attendanceReport.cardMoreCount', { count: defaulters.length - shown.length }),
      32,
      y
    );
  }

  ctx.fillStyle = '#6e7a8a';
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillText(t('academic.attendanceReport.cardFooter'), 32, CARD_HEIGHT - 20);

  return canvas;
}

/**
 * Renders the report summary to an offscreen canvas and shares it as an
 * image — a WhatsApp-friendly share card instead of a CSV nobody opens on a
 * phone. Falls back to a PNG download when the Web Share API (or file
 * sharing) isn't available.
 */
export default function ShareSummaryCard({ report }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    setBusy(true);
    try {
      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
      const canvas = drawCard(canvasRef.current, report, t);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(t('academic.attendanceReport.renderImageFailed'));

      const file = new File([blob], 'attendance-summary.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t('academic.attendanceReport.shareTitle'),
          text:
            report.classAveragePct === null
              ? t('academic.attendanceReport.title')
              : t('academic.attendanceReport.shareText', {
                  avg: report.classAveragePct,
                  count: report.students.filter((s) => s.isDefaulter).length,
                  pct: report.thresholdPct,
                }),
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'attendance-summary.png';
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('academic.attendanceReport.imageDownloaded'));
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast.error(t('academic.attendanceReport.shareImageFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className="w-full gap-1.5" onClick={handleShare} disabled={busy}>
      <Share2 size={14} />
      {busy
        ? t('academic.attendanceReport.preparing')
        : t('academic.attendanceReport.shareSummaryCard')}
    </Button>
  );
}
