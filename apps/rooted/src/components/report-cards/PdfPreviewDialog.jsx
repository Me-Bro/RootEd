import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog.jsx';

// Draws page 1 of a PDF onto a canvas, so a phone needs no PDF app to see it. The
// Android app's WebView cannot display a PDF, and it hands any blob: link to the
// OS, which has nothing to open it with. pdf.js is loaded here, not at startup,
// so only someone pressing Preview pays for it. The legacy build keeps older
// WebViews working.
async function drawFirstPage(data, canvas, cssWidth) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.min.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  // pdf.js takes ownership of the bytes it is given, so hand it a copy and the
  // same preview can be drawn again.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  try {
    const page = await doc.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / natural.width) * pixelRatio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  } finally {
    doc.destroy();
  }
}

// `data` is the PDF as an ArrayBuffer; null keeps the dialog closed.
export default function PdfPreviewDialog({ data, onClose, title }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!data) return undefined;
    let cancelled = false;
    // The dialog mounts its content a tick after `open` flips, so wait for the
    // canvas to exist before measuring it.
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setState('loading');
      drawFirstPage(data, canvas, canvas.parentElement.clientWidth || 600)
        .then(() => !cancelled && setState('ready'))
        .catch(() => !cancelled && setState('error'));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [data]);

  return (
    <Dialog open={Boolean(data)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-40 w-full">
          {state === 'loading' && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('reportCardSettings.previewing')}
            </p>
          )}
          {state === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              {t('reportCardSettings.previewFailed')}
            </p>
          )}
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={title}
            className={state === 'ready' ? 'h-auto w-full rounded border bg-white' : 'hidden'}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
