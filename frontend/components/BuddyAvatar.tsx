"use client";

/**
 * BuddyAvatar
 * -----------
 * Zeigt einen Ready Player Me 3D-Avatar im Chat.
 * Verwendet @readyplayerme/visage — beinhaltet automatisch eine Idle-Animation.
 *
 * Muss via dynamic import mit { ssr: false } eingebunden werden (Three.js).
 */

import { Avatar } from "@readyplayerme/visage";

interface Props {
  avatarUrl: string;
  /** Höhe des Canvas in px (Default 320) */
  height?: number;
  /** Kameradistanz (Default 2.6) */
  cameraDistance?: number;
}

export default function BuddyAvatar({ avatarUrl, height = 320, cameraDistance = 2.6 }: Props) {
  return (
    <div style={{ height, width: "100%" }} className="rounded-2xl overflow-hidden bg-gray-900">
      <Avatar
        modelSrc={avatarUrl}
        cameraInitialDistance={cameraDistance}
        cameraTarget={1.6}
        headMovement
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
