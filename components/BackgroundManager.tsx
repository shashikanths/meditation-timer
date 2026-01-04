import React, { useState, useEffect } from 'react';
import { StorageManager, mediaCache } from '../utils/storage';
import { extractColors, applyColorPalette } from '../utils/colorExtractor';

interface BackgroundManagerProps {
  userId: string;
}

const IMAGE_PATHS: Record<string, string> = {
  'mountain-sunrise': '/media/images/predefined/mountain-sunrise.jpg',
  'ocean-sunset': '/media/images/predefined/ocean-sunset.jpg',
  'forest-mist': '/media/images/predefined/forest-mist.jpg'
};

export const BackgroundManager: React.FC<BackgroundManagerProps> = () => {
  const [bgUrl, setBgUrl] = useState<string>(IMAGE_PATHS['mountain-sunrise']);

  useEffect(() => {
    const loadBackground = async () => {
      const settings = StorageManager.getSettings();
      const selectedId = settings.selectedImageId;
      let imageUrl = IMAGE_PATHS['mountain-sunrise'];

      if (selectedId === 'custom') {
        const customImage = await mediaCache.getFile('image');
        if (customImage) {
          imageUrl = customImage.url;
        }
      } else if (selectedId && IMAGE_PATHS[selectedId]) {
        imageUrl = IMAGE_PATHS[selectedId];
      }

      setBgUrl(imageUrl);

      // Extract and apply colors from the background image
      const palette = await extractColors(imageUrl);
      applyColorPalette(palette);
    };

    loadBackground();
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-black">
      <img
        src={bgUrl}
        className="absolute inset-0 w-full h-full object-cover brightness-[0.3] transition-all duration-1000"
        alt="Meditation background"
        crossOrigin="anonymous"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
    </div>
  );
};
