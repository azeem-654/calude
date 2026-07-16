export type Platform = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'youtube';
export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5' | '3:2';
export type ElementType = 'text' | 'image' | 'shape' | 'sticker';
export type ShapeType = 'rect' | 'circle' | 'triangle' | 'star' | 'diamond' | 'arrow' | 'line' | 'rounded-rect' | 'heart' | 'hexagon';

export type TextEffect = 'none' | 'shadow' | 'lift' | 'neon' | 'echo';

export interface TextElement {
  kind: 'text';
  text: string;
  /** Canva-style text effect preset (rendered live and in PNG export). */
  effect?: TextEffect;
  fontSize: number;
  fontFamily: string;
  color: string;
  fontWeight: 'normal' | 'bold' | '300' | '500' | '600' | '700' | '800' | '900';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  textDecoration: 'none' | 'underline' | 'line-through';
  textShadow?: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  uppercase?: boolean;
}

export interface ImageElement {
  kind: 'image';
  src: string;
  objectFit: 'cover' | 'contain' | 'fill';
  opacity: number;
  borderRadius: number;
  border?: string;
  filter?: string;
}

export interface ShapeElement {
  kind: 'shape';
  shapeType: ShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface StickerElement {
  kind: 'sticker';
  emoji: string;
  fontSize: number;
}

export type ElementData = TextElement | ImageElement | ShapeElement | StickerElement;

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  data: ElementData;
}

export interface CanvasBackground {
  type: 'color' | 'gradient' | 'image';
  color: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
  imageUrl?: string;
  imageFit: 'cover' | 'contain' | 'fill';
}

export interface DesignPost {
  id: string;
  name: string;
  platform: Platform;
  aspectRatio: AspectRatio;
  canvasWidth: number;
  canvasHeight: number;
  background: CanvasBackground;
  elements: CanvasElement[];
  status: 'draft' | 'published' | 'scheduled';
  thumbnail?: string;
  tags: string[];
  aiPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandKit {
  colors: string[];
  fonts: string[];
  logoUrl?: string;
  companyName?: string;
  tagline?: string;
}

export interface PlatformPreset {
  id: Platform;
  label: string;
  icon: string;
  ratios: { label: string; ratio: AspectRatio; width: number; height: number }[];
  primaryColor: string;
}

export interface DesignTemplate {
  id: string;
  name: string;
  category: string;
  platform: Platform | 'all';
  aspectRatio: AspectRatio;
  canvasWidth: number;
  canvasHeight: number;
  background: CanvasBackground;
  elements: Omit<CanvasElement, 'id'>[];
  thumbnail: string;
  tags: string[];
}

export interface HistoryEntry {
  elements: CanvasElement[];
  background: CanvasBackground;
}
