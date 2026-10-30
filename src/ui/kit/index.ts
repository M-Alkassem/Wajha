/**
 * Wajha UI kit: design-system components with no app state.
 *
 * Value components share one change protocol: `onChange` fires for every
 * live update (each drag move, each keystroke that commits) and `onCommit`
 * fires once when the interaction that produced them ends (pointer up,
 * Enter, blur, a discrete click). To make a drag one undo step, open a
 * history gesture on the first onChange and close it on onCommit (or use
 * the explicit onScrubStart / onScrubEnd of NumberField and Slider).
 *
 * Mount <TooltipProvider> once near the root; tooltips also work without it.
 * Call trackInputModality() once at startup, so focus rings and tooltips
 * follow the last input instead of lingering after mouse clicks, and a
 * dialog opened by a click gives focus back to what was clicked.
 */

export { cx, type ClassValue, type ControlSize } from './cx';

export { Button, type ButtonProps, type ButtonVariant } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';
export { Tooltip, TooltipProvider, TOOLTIP_DELAY, type TooltipProps, type TooltipProviderProps } from './Tooltip';
export { Kbd, type KbdProps } from './Kbd';
export { Input, Textarea, FIELD_SHELL, type InputProps, type TextareaProps } from './Input';
export { NumberField, type NumberFieldProps } from './NumberField';
export { Slider, type SliderProps } from './Slider';
export { Select, type SelectGroup, type SelectOption, type SelectProps } from './Select';
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './SegmentedControl';
export { Switch, type SwitchProps } from './Switch';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { ColorField, ColorChip, ColorPickerPanel, type ColorFieldProps, type ColorPickerPanelProps } from './ColorField';
export { FillEditor, type FillEditorProps } from './FillEditor';
export { Tabs, TabsContent, TabsList, TabsTrigger, type TabsListProps, type TabsVariant } from './Tabs';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  type DialogContentProps,
  type DialogFooterProps,
  type DialogSize,
} from './Dialog';
export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger, type PopoverContentProps } from './Popover';
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type ContextMenuCheckboxItemProps,
  type ContextMenuItemProps,
  type ContextMenuRadioItemProps,
  type ContextMenuSubTriggerProps,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuItemProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuSubTriggerProps,
} from './Menu';
export { Toaster, type ToasterPosition, type ToasterProps } from './Toaster';
export {
  DEFAULT_TOAST_DURATION,
  MAX_VISIBLE_TOASTS,
  toastDuration,
  type ToastAction,
  type ToastData,
  type ToastKind,
} from './toast';
export { isToastTarget, useModalOpen } from './layers';
export { isKeyboardNavigation, markNotNavigation, pointerModality, trackInputModality, type InputModality } from './modality';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export {
  Badge,
  Card,
  Divider,
  ProgressBar,
  Skeleton,
  type BadgeProps,
  type BadgeVariant,
  type CardProps,
  type DividerProps,
  type ProgressBarProps,
  type SkeletonProps,
} from './Surfaces';
export { Spinner, type SpinnerProps } from './Spinner';
export { Section, type SectionProps } from './Section';
export { Field, type FieldProps } from './Field';
export { useFieldControl, type FieldControlProps } from './fieldContext';
export { ScrollArea, type ScrollAreaProps } from './ScrollArea';
export { ListRow, type ListRowProps } from './ListRow';

export {
  ariaKeyShortcuts,
  formatShortcut,
  isMacPlatform,
  matchShortcut,
  parseShortcut,
  platformIsMac,
  shortcutLabel,
  shortcutText,
  type ParsedShortcut,
  type ShortcutEventLike,
  type ShortcutInput,
} from './keys';
export {
  addRecentColor,
  alphaToPercent,
  colorsEqual,
  getRecentColors,
  isHexColor,
  normalizeHex,
  parseCssColor,
  splitAlpha,
  withAlpha,
} from './color';
export {
  FILL_TYPES,
  FILL_TYPE_LABEL,
  convertFill,
  describeFill,
  fillToCss,
  type FillType,
} from './fill';
export { evaluateExpression, formatNumber, parseNumberInput } from './number';
