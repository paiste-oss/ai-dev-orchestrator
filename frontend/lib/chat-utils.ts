// Shared utility functions for the chat feature

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function extractVideoFrames(file: File, count = 4): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const frames: string[] = [];
      const timestamps = Array.from({ length: count }, (_, i) =>
        (duration / (count + 1)) * (i + 1)
      );
      let idx = 0;

      function captureNext() {
        if (idx >= timestamps.length) {
          URL.revokeObjectURL(url);
          resolve(frames);
          return;
        }
        video.currentTime = timestamps[idx];
      }

      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
        idx++;
        captureNext();
      };

      captureNext();
    };

    video.onerror = () => { URL.revokeObjectURL(url); resolve([]); };
  });
}
