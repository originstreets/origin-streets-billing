import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImageUp, RefreshCw, SwitchCamera } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useT } from '../../i18n';

// A product photo: take it with the camera (the laptop's webcam, or the
// phone's back camera) or upload one from the device. Either way the app
// gets a File and shrinks it before saving.

const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export const PhotoPicker: React.FC<{
  preview: string;
  onPick: (file: File) => void;
  onRemove?: () => void;
  // compact: a small thumbnail with round camera / upload buttons (one per colour).
  compact?: boolean;
  label?: string;
}> = ({ preview, onPick, onRemove, compact, label }) => {
  const t = useT();
  const uploadRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const takePhoto = () => {
    // No live camera in this browser: the phone's own camera app instead.
    if (canUseCamera()) setCameraOpen(true);
    else captureRef.current?.click();
  };

  const fromInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
    e.target.value = '';
  };

  const inputs = (
    <>
      <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={fromInput} />
      <input ref={captureRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={fromInput} />
      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onUse={(file) => {
            onPick(file);
            setCameraOpen(false);
          }}
        />
      )}
    </>
  );

  if (compact) {
    const round = 'h-9 w-9 rounded-full flex items-center justify-center bg-os-paper ring-1 ring-inset ring-os-line hover:ring-os-ink transition-colors';
    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-14 bg-os-soft overflow-hidden shrink-0 flex items-center justify-center text-os-muted">
          {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Camera size={18} />}
        </div>
        <button type="button" onClick={takePhoto} className={round} aria-label={`${t('Take photo')}${label ? ` · ${label}` : ''}`} title={t('Take photo')}>
          <Camera size={16} />
        </button>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className={round}
          aria-label={`${t('Upload photo')}${label ? ` · ${label}` : ''}`}
          title={t('Upload photo')}
        >
          <ImageUp size={16} />
        </button>
        {preview && onRemove && (
          <button type="button" onClick={onRemove} className="text-sm font-semibold underline text-os-muted hover:text-status-red">
            {t('Remove')}
          </button>
        )}
        {inputs}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <span className="label">{label || t('Photo')}</span>
      <div className="aspect-[4/5] w-full bg-os-soft flex items-center justify-center overflow-hidden">
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-os-muted text-sm font-semibold p-3 text-center">
            <Camera size={28} />
            {t('No photo yet')}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="primary" size="sm" icon={<Camera size={16} />} onClick={takePhoto} fullWidth>
          {t('Take photo')}
        </Button>
        <Button type="button" variant="secondary" size="sm" icon={<ImageUp size={16} />} onClick={() => uploadRef.current?.click()} fullWidth>
          {t('Upload photo')}
        </Button>
        {preview && onRemove && (
          <button type="button" onClick={onRemove} className="text-sm font-semibold underline text-os-muted hover:text-status-red self-center">
            {t('Remove photo')}
          </button>
        )}
      </div>
      {inputs}
    </div>
  );
};

const CameraModal: React.FC<{ onClose: () => void; onUse: (file: File) => void }> = ({ onClose, onUse }) => {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameraCount, setCameraCount] = useState(0);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // (Re)start the camera whenever the facing side changes; always stop it
  // when the window closes, so the camera light goes off.
  useEffect(() => {
    let cancelled = false;
    setStarting(true);
    setError('');
    stop();
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 2000 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCameraCount(devices.filter((d) => d.kind === 'videoinput').length);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setError(
          name === 'NotAllowedError'
            ? t('The camera is not allowed. Allow it in the browser, or upload a photo instead.')
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? t('No camera found on this device. Upload a photo instead.')
              : t('The camera could not start. Upload a photo instead.')
        );
      })
      .finally(() => !cancelled && setStarting(false));
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, stop, t]);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) setShot({ url: URL.createObjectURL(blob), blob });
      },
      'image/jpeg',
      0.92
    );
  };

  const use = () => {
    if (!shot) return;
    stop();
    onUse(new File([shot.blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  };

  return (
    <Modal
      isOpen
      onClose={() => {
        stop();
        onClose();
      }}
      title={t('Take photo')}
      maxWidth="lg"
      footer={
        shot ? (
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => setShot(null)}>
              {t('Take again')}
            </Button>
            <Button variant="primary" onClick={use}>
              {t('Use this photo')}
            </Button>
          </>
        ) : (
          <>
            {cameraCount > 1 && (
              <Button variant="secondary" icon={<SwitchCamera size={16} />} onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>
                {t('Switch camera')}
              </Button>
            )}
            <Button variant="primary" icon={<Camera size={16} />} onClick={capture} disabled={starting || !!error}>
              {t('Take photo')}
            </Button>
          </>
        )
      }
    >
      {error ? (
        <div className="flex gap-3 p-4 bg-status-redBg text-status-red text-base font-semibold">
          <AlertTriangle size={20} className="shrink-0" />
          {error}
        </div>
      ) : (
        <div className="relative bg-os-ink aspect-[4/5] w-full overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${shot ? 'hidden' : ''} ${facing === 'user' ? '-scale-x-100' : ''}`}
          />
          {shot && <img src={shot.url} alt="" className="w-full h-full object-cover" />}
          {starting && !shot && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-base">{t('Starting the camera…')}</div>
          )}
        </div>
      )}
    </Modal>
  );
};
