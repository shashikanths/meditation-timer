/**
 * Display Name Generator - Creates random two-word display names
 * Similar to Discord's approach with adjective + noun combinations
 */

const ADJECTIVES = [
  // Peaceful/Calm
  'Serene', 'Peaceful', 'Tranquil', 'Calm', 'Gentle', 'Quiet', 'Still', 'Soft',
  // Nature
  'Misty', 'Sunny', 'Starry', 'Moonlit', 'Golden', 'Silver', 'Crystal', 'Dewy',
  // Elements
  'Cosmic', 'Celestial', 'Luminous', 'Radiant', 'Glowing', 'Shimmering', 'Flowing',
  // Spiritual
  'Sacred', 'Divine', 'Blessed', 'Eternal', 'Ancient', 'Mystic', 'Zen', 'Mindful',
  // Colors
  'Azure', 'Violet', 'Amber', 'Jade', 'Coral', 'Ivory', 'Sapphire', 'Ruby',
  // Positive qualities
  'Wise', 'Kind', 'Noble', 'Brave', 'True', 'Pure', 'Free', 'Wild',
  // Weather/Sky
  'Cloudy', 'Rainy', 'Snowy', 'Breezy', 'Stormy', 'Dreamy', 'Hazy', 'Dusk',
  // Abstract
  'Silent', 'Hidden', 'Secret', 'Wandering', 'Drifting', 'Dancing', 'Singing'
];

const NOUNS = [
  // Animals
  'Lotus', 'Panda', 'Phoenix', 'Dragon', 'Tiger', 'Crane', 'Owl', 'Wolf',
  'Deer', 'Swan', 'Dove', 'Fox', 'Bear', 'Hawk', 'Eagle', 'Raven',
  // Nature
  'Mountain', 'River', 'Ocean', 'Forest', 'Garden', 'Meadow', 'Valley', 'Canyon',
  'Island', 'Shore', 'Creek', 'Grove', 'Glade', 'Pond', 'Lake', 'Spring',
  // Celestial
  'Moon', 'Star', 'Sun', 'Comet', 'Aurora', 'Eclipse', 'Galaxy', 'Nebula',
  // Plants
  'Willow', 'Oak', 'Maple', 'Pine', 'Cherry', 'Bamboo', 'Fern', 'Moss',
  'Rose', 'Lily', 'Orchid', 'Daisy', 'Iris', 'Tulip', 'Jasmine', 'Sage',
  // Elements
  'Wave', 'Flame', 'Storm', 'Wind', 'Rain', 'Snow', 'Cloud', 'Mist',
  // Abstract
  'Spirit', 'Soul', 'Dream', 'Echo', 'Shadow', 'Light', 'Dawn', 'Dusk',
  'Seeker', 'Wanderer', 'Dreamer', 'Voyager', 'Traveler', 'Monk', 'Sage'
];

/**
 * Generate a random display name (two words)
 */
export function generateDisplayName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective} ${noun}`;
}

/**
 * Check if a name looks like a generated display name
 */
export function isGeneratedName(name: string): boolean {
  const parts = name.split(' ');
  if (parts.length !== 2) return false;
  return ADJECTIVES.includes(parts[0]) && NOUNS.includes(parts[1]);
}
