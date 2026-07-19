import React, { useState } from "react";
import { useZxing } from "react-zxing";

interface Props {
  onDetected: (code: string) => void;
  active: boolean; // pause scanning once a code is found / a dialog is open
}

/**
 * Continuous camera barcode scanner. Note: getUserMedia (camera access)
 * requires a secure context — localhost works fine for dev, but testing on
 * your phone over your LAN IP (http://192.168.x.x:5173) will NOT get camera
 * permission. Use `npm run build && npx serve dist --ssl` locally with a
 * self-signed cert (mkcert), or just deploy to Vercel/Netlify for a real
 * HTTPS URL to test on your phone.
 */
export function BarcodeScanner({ onDetected, active }: Props) {
  const [lastError, setLastError] = useState<string | null>(null);

  const { ref } = useZxing({
    paused: !active,
    onDecodeResult(result) {
      onDetected(result.rawValue);
    },
    onError(err) {
      setLastError(err instanceof Error ? err.message : String(err));
    },
    constraints: {
      video: { facingMode: "environment" }, // rear camera
    },
  });

  return (
    <div className="relative w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-black">
      <video ref={ref as React.RefObject<HTMLVideoElement>} className="w-full aspect-[3/4] object-cover" />
      <div className="absolute inset-0 border-2 border-emerald-400/60 m-8 rounded-lg pointer-events-none" />
      {lastError && (
        <p className="absolute bottom-2 left-2 right-2 text-xs text-red-400 bg-black/60 rounded px-2 py-1">
          Camera error: {lastError}. Camera access needs HTTPS (or localhost).
        </p>
      )}
    </div>
  );
}
