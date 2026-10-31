/**
 * Icons and short labels for device families and device frames, shared by
 * the editor chrome (family tabs, layers, status bar) and the dialogs.
 *
 * iPhone and Android phone use two small custom glyphs drawn in lucide's
 * style: the iPhone shows its Dynamic Island, the Android phone a punch-hole
 * camera, so the two stay distinguishable when the family tabs collapse to
 * icons.
 */
import { AppWindow, Image, Laptop, RectangleHorizontal, Tablet, TabletSmartphone, Tv, Watch, createLucideIcon, type LucideIcon } from 'lucide-react';
import type { DeviceFrameId, FamilyId } from '../../model/types';

import { t } from '../../i18n';
/** Phone with a Dynamic Island. */
export const IPhoneIcon: LucideIcon = createLucideIcon('wajha-iphone', [
  ['rect', { width: '14', height: '20', x: '5', y: '2', rx: '3', key: 'body' }],
  ['path', { d: 'M10.5 5.5h3', key: 'island' }],
]);

/** Phone with a punch-hole camera. */
export const AndroidPhoneIcon: LucideIcon = createLucideIcon('wajha-android-phone', [
  ['rect', { width: '14', height: '20', x: '5', y: '2', rx: '2', key: 'body' }],
  ['path', { d: 'M12 5.5h.01', key: 'camera' }],
]);

/** iPhone on its side, Dynamic Island on the left. */
export const IPhoneLandscapeIcon: LucideIcon = createLucideIcon('wajha-iphone-landscape', [
  ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '3', key: 'body' }],
  ['path', { d: 'M5.5 10.5v3', key: 'island' }],
]);

/** Android phone on its side, camera on the left. */
export const AndroidLandscapeIcon: LucideIcon = createLucideIcon('wajha-android-landscape', [
  ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '2', key: 'body' }],
  ['path', { d: 'M5.5 12h.01', key: 'camera' }],
]);

/** iPad on its side. */
export const IPadLandscapeIcon: LucideIcon = createLucideIcon('wajha-ipad-landscape', [
  ['rect', { width: '20', height: '16', x: '2', y: '4', rx: '2', key: 'body' }],
  ['path', { d: 'M5 12h.01', key: 'camera' }],
]);

/** Apple Vision Pro: the visor seen from the front. */
export const VisionIcon: LucideIcon = createLucideIcon('wajha-vision', [
  ['path', { d: 'M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1a5 5 0 0 1-5 5h-1.2l-1.8-2-1.8 2H8a5 5 0 0 1-5-5z', key: 'visor' }],
]);

export const FAMILY_ICONS: Record<FamilyId, LucideIcon> = {
  iphone: IPhoneIcon,
  'iphone-landscape': IPhoneLandscapeIcon,
  ipad: Tablet,
  'ipad-landscape': IPadLandscapeIcon,
  'android-phone': AndroidPhoneIcon,
  'android-landscape': AndroidLandscapeIcon,
  'android-tablet': TabletSmartphone,
  mac: Laptop,
  watch: Watch,
  'apple-tv': Tv,
  vision: VisionIcon,
  'play-feature': RectangleHorizontal,
};

export const FRAME_ICONS: Record<DeviceFrameId, LucideIcon> = {
  iphone: IPhoneIcon,
  ipad: Tablet,
  'android-phone': AndroidPhoneIcon,
  'android-tablet': TabletSmartphone,
  macbook: Laptop,
  watch: Watch,
  tv: Tv,
  vision: VisionIcon,
  browser: AppWindow,
  none: Image,
};

/** Human names of device frames, as the layers list shows them. */
export const FRAME_LABELS: Record<DeviceFrameId, string> = {
  iphone: t('iPhone'),
  ipad: t('iPad'),
  'android-phone': t('Android phone'),
  'android-tablet': t('Android tablet'),
  macbook: t('MacBook'),
  watch: t('Apple Watch'),
  tv: t('TV'),
  vision: t('Vision Pro window'),
  browser: t('Browser window'),
  none: t('Screenshot'),
};
