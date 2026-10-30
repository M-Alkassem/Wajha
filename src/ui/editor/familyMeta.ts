/**
 * Icons and short labels for device families and device frames, shared by
 * the editor chrome (family tabs, layers, status bar) and the dialogs.
 *
 * iPhone and Android phone use two small custom glyphs drawn in lucide's
 * style: the iPhone shows its Dynamic Island, the Android phone a punch-hole
 * camera, so the two stay distinguishable when the family tabs collapse to
 * icons.
 */
import { AppWindow, Image, Laptop, RectangleHorizontal, Tablet, TabletSmartphone, createLucideIcon, type LucideIcon } from 'lucide-react';
import type { DeviceFrameId, FamilyId } from '../../model/types';

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

export const FAMILY_ICONS: Record<FamilyId, LucideIcon> = {
  iphone: IPhoneIcon,
  ipad: Tablet,
  'android-phone': AndroidPhoneIcon,
  'android-tablet': TabletSmartphone,
  mac: Laptop,
  'play-feature': RectangleHorizontal,
};

export const FRAME_ICONS: Record<DeviceFrameId, LucideIcon> = {
  iphone: IPhoneIcon,
  ipad: Tablet,
  'android-phone': AndroidPhoneIcon,
  'android-tablet': TabletSmartphone,
  macbook: Laptop,
  browser: AppWindow,
  none: Image,
};

/** Human names of device frames, as the layers list shows them. */
export const FRAME_LABELS: Record<DeviceFrameId, string> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  'android-phone': 'Android phone',
  'android-tablet': 'Android tablet',
  macbook: 'MacBook',
  browser: 'Browser window',
  none: 'Screenshot',
};
