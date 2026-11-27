import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { codeFromScan } from '../../utils/joinScan.js';

/**
 * Live camera preview that reads QR codes. Calls `onCode` with a formatted join code the
 * moment one is read, then closes. Anything that is not a join code is ignored.
 *
 * The scanner is its own component so it mounts (and starts the camera) only while the
 * dialog is open, and its state starts fresh every time.
 */
export default function QrScanDialog({
  open,
  onOpenChange,
  onCode,
  parse = codeFromScan,
  title,
  hint,
  notCodeHint,
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? t('org.scanTitle')}</DialogTitle>
          <DialogDescription>{hint ?? t('org.scanHint')}</DialogDescription>
        </DialogHeader>
        {open && (
          <Scanner
            onCode={onCode}
            onOpenChange={onOpenChange}
            parse={parse}
            notCodeHint={notCodeHint}
          />
        )}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Scanner({ onCode, onOpenChange, parse, notCodeHint }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [notCode, setNotCode] = useState(false);

  // The latest callbacks, so a parent re-render never restarts the camera.
  const handlers = useRef({ onCode, onOpenChange, parse });
  useEffect(() => {
    handlers.current = { onCode, onOpenChange, parse };
  });

  useEffect(() => {
    let stopped = false;
    let stream;
    let frame;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (err) {
        if (!stopped) {
          setError(err?.name === 'NotAllowedError' ? t('org.scanDenied') : t('org.scanNoCamera'));
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      // Native detector where it exists; jsQR (loaded on demand) everywhere else.
      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import('jsqr')).default;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      async function read() {
        if (video.readyState < 2) return null;
        if (detector) {
          const found = await detector.detect(video);
          return found[0]?.rawValue ?? null;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(image.data, image.width, image.height)?.data ?? null;
      }

      async function tick() {
        if (stopped) return;
        try {
          const text = await read();
          if (text) {
            const code = handlers.current.parse(text);
            if (code) {
              stopped = true;
              handlers.current.onCode(code);
              handlers.current.onOpenChange(false);
              return;
            }
            setNotCode(true);
          }
        } catch {
          // a bad frame is not fatal; try the next one
        }
        frame = requestAnimationFrame(tick);
      }
      tick();
    }
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [t]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        muted
        playsInline
        data-testid="qr-video"
        className="aspect-square w-full rounded-lg bg-black object-cover"
      />
      {notCode && (
        <p role="status" className="text-sm text-muted-foreground">
          {notCodeHint ?? t('org.scanNotCode')}
        </p>
      )}
    </div>
  );
}
