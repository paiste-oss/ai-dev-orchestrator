import React from "react";
import { ImageGalleryData } from "@/lib/chat-types";

export default function ImageGalleryCard({ data }: { data: ImageGalleryData }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {data.images.map((img, i) => (
        <div key={i} className="rounded-2xl overflow-hidden shadow-lg w-full">
          <a href={img.image_url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.image_url}
              alt={img.description}
              className="w-full max-h-[200px] object-cover hover:scale-105 transition-transform cursor-pointer"
            />
          </a>
          <div className="bg-gray-900 px-3 py-1.5">
            <p className="text-xs text-gray-500">
              Foto: <span className="text-gray-400">{img.photographer}</span>
              <span className="ml-1 text-gray-600">· {img.source}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
