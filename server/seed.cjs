const { db } = require('./db.cjs');

// Predefined media to seed
const predefinedMedia = {
  audio: [
    {
      filename: 'om-mantra.mp3',
      displayName: 'Om Mantra',
      filePath: '/media/audio/predefined/om-mantra.mp3'
    },
    {
      filename: 'meditation-bell-1min.mp3',
      displayName: 'Meditation Bell (1 min)',
      filePath: '/media/audio/predefined/meditation-bell-1min.mp3'
    }
  ],
  images: [
    {
      filename: 'mountain-sunrise.jpg',
      displayName: 'Mountain Sunrise',
      filePath: '/media/images/predefined/mountain-sunrise.jpg',
      url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1920&auto=format&fit=crop'
    },
    {
      filename: 'ocean-sunset.jpg',
      displayName: 'Ocean Sunset',
      filePath: '/media/images/predefined/ocean-sunset.jpg',
      url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1920&auto=format&fit=crop'
    },
    {
      filename: 'forest-mist.jpg',
      displayName: 'Misty Forest',
      filePath: '/media/images/predefined/forest-mist.jpg',
      url: 'https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1920&auto=format&fit=crop'
    }
  ]
};

const seedDatabase = async () => {
  console.log('🌱 Seeding database with predefined media...');

  try {
    // Clear existing predefined media
    db.prepare('DELETE FROM media_library WHERE is_predefined = TRUE').run();

    // Insert audio files
    for (const audio of predefinedMedia.audio) {
      db.prepare(`
        INSERT INTO media_library (type, filename, display_name, file_path, is_predefined)
        VALUES (?, ?, ?, ?, TRUE)
      `).run('audio', audio.filename, audio.displayName, audio.filePath);

      console.log(`✅ Added audio: ${audio.displayName}`);
    }

    // Insert image files
    for (const image of predefinedMedia.images) {
      db.prepare(`
        INSERT INTO media_library (type, filename, display_name, file_path, is_predefined)
        VALUES (?, ?, ?, ?, TRUE)
      `).run('image', image.filename, image.displayName, image.filePath);

      console.log(`✅ Added image: ${image.displayName}`);
    }

    console.log('\n✨ Database seeded successfully!');
    console.log('\n📝 Media files loaded from:');
    console.log('   - Audio: public/media/audio/predefined/');
    console.log('   - Images: public/media/images/predefined/');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run seed if called directly
if (require.main === module) {
  seedDatabase();
  process.exit(0);
}

module.exports = { seedDatabase, predefinedMedia };
