"use client";

import React from "react";

interface CameraModalProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
  onCapture: () => void;
}

export default function CameraModal({ videoRef, onClose, onCapture }: CameraModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="relative bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full aspect-[4/3] object-cover bg-black"
        />
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-t border-white/10">
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={onCapture}
            className="w-14 h-14 rounded-full bg-white border-4 border-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center"
            title="Foto aufnehmen"
          >
            <span className="w-10 h-10 rounded-full bg-white border-2 border-gray-400 block" />
          </button>
          <div className="w-16" />
        </div>
      </div>
    </div>
  );
}
