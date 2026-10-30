import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cx } from './cx';

export interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect' | 'children'> {
  label: ReactNode;
  icon?: ReactNode;
  /** Quiet text or a badge after the label. */
  meta?: ReactNode;
  /** Row actions (visibility, lock, more); shown on hover, focus and selection. */
  trailing?: ReactNode;
  /** Keep the trailing actions visible (e.g. a layer that is hidden shows its eye-off icon). */
  trailingVisible?: boolean;
  selected?: boolean;
  /** Dimmed, for hidden layers. */
  muted?: boolean;
  disabled?: boolean;
  /** Drag handle slot at the start of the row; appears on hover. Spread your dnd listeners on it. */
  dragHandle?: ReactNode;
  /** Nesting level, 12 px each. */
  indent?: number;
  /** sm 28 px (layers), md 32 px (slides, files). */
  size?: 'sm' | 'md';
  onSelect?: (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => void;
  /** Enables renaming with double-click or F2; called with the trimmed new name. */
  onRename?: (name: string) => void;
  /** Text the rename field starts with (defaults to the label when it is a string). */
  renameValue?: string;
  /** Controlled rename mode, e.g. to start renaming from a menu item. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}

/** Row for layer and slide lists: icon, label, hover actions, selection, drag handle and inline rename. */
export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  {
    label,
    icon,
    meta,
    trailing,
    trailingVisible = false,
    selected = false,
    muted = false,
    disabled = false,
    dragHandle,
    indent = 0,
    size = 'sm',
    onSelect,
    onRename,
    renameValue,
    editing,
    onEditingChange,
    className,
    style,
    onClick,
    onDoubleClick,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const rowRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => rowRef.current as HTMLDivElement, []);
  const [innerEditing, setInnerEditing] = useState(false);
  const isEditing = !!onRename && (editing ?? innerEditing);
  const initial = renameValue ?? (typeof label === 'string' ? label : '');
  const [draft, setDraft] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter commits and unmounts the input, which can also fire blur: finish only once.
  const doneRef = useRef(false);

  const setEditingState = (next: boolean) => {
    if (editing === undefined) setInnerEditing(next);
    onEditingChange?.(next);
  };

  // A fresh draft each time editing starts, set while rendering so the input
  // mounts with it; a label change mid-edit must not wipe what is typed.
  const [wasEditing, setWasEditing] = useState(isEditing);
  if (wasEditing !== isEditing) {
    setWasEditing(isEditing);
    if (isEditing) setDraft(initial);
  }

  // Enter or Escape hands focus back to the row; a blur means the user went elsewhere.
  const restoreFocus = useRef(false);

  // Focus moves synchronously (no animation frame) so the first keystroke lands
  // in the field and a quick next action is never overtaken by a late focus.
  useLayoutEffect(() => {
    if (isEditing) {
      doneRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      const active = document.activeElement;
      if (!active || active === document.body || rowRef.current?.contains(active)) rowRef.current?.focus();
    }
  }, [isEditing]);

  const finish = (commit: boolean, viaKeyboard: boolean) => {
    if (!isEditing || doneRef.current) return;
    doneRef.current = true;
    restoreFocus.current = viaKeyboard;
    const name = draft.trim();
    setEditingState(false);
    if (commit && name && name !== initial) onRename?.(name);
  };

  const padStyle: CSSProperties = { paddingInlineStart: 6 + Math.max(0, Math.min(12, indent)) * 12, ...style };

  return (
    <div
      ref={rowRef}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-selected={selected ? '' : undefined}
      data-muted={muted ? '' : undefined}
      style={padStyle}
      onClick={(e) => {
        onClick?.(e);
        if (!disabled && !isEditing && !e.defaultPrevented) onSelect?.(e);
      }}
      onDoubleClick={(e) => {
        onDoubleClick?.(e);
        if (!disabled && onRename && !e.defaultPrevented && !(e.target as HTMLElement).closest('button')) setEditingState(true);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || disabled || isEditing || e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(e);
        } else if (e.key === 'F2' && onRename) {
          e.preventDefault();
          setEditingState(true);
        }
      }}
      className={cx(
        'group/row relative flex min-w-0 cursor-default items-center gap-1.5 rounded-sm pr-1 outline-none select-none',
        'text-xs text-text transition-colors duration-(--dur-fast) hover:bg-surface-2',
        'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus',
        size === 'sm' ? 'h-7' : 'h-8',
        selected && 'bg-accent-soft hover:bg-accent-soft',
        // text-3 drops under 4.5:1 on the hover and selection fills; text-2 keeps it.
        muted && (selected ? 'text-text-2' : 'text-text-3 hover:text-text-2'),
        disabled && 'pointer-events-none opacity-45',
        className,
      )}
      {...rest}
    >
      {dragHandle && (
        <span className="-ml-1 flex w-3 shrink-0 cursor-grab items-center justify-center text-text-3 opacity-0 transition-opacity duration-(--dur-fast) group-hover/row:opacity-100 active:cursor-grabbing [&_svg]:size-3">
          {dragHandle}
        </span>
      )}
      {icon && (
        <span className={cx('flex shrink-0 items-center [&_svg]:size-3.5', selected ? 'text-accent-fg' : muted ? 'text-text-3' : 'text-text-2')}>{icon}</span>
      )}
      {isEditing ? (
        <input
          ref={inputRef}
          dir="auto"
          value={draft}
          aria-label="Name"
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              finish(true, true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              finish(false, true);
            }
          }}
          onBlur={() => finish(true, false)}
          className="h-[22px] min-w-0 flex-1 rounded-xs border border-accent-line bg-surface px-1 text-xs text-text ring-2 ring-focus-soft outline-none light:bg-raised"
        />
      ) : (
        <span className={cx('min-w-0 flex-1 truncate', selected && 'font-medium')} dir="auto">
          {label}
        </span>
      )}
      {meta && !isEditing && (
        <span className={cx('shrink-0 text-2xs tabular-nums', selected ? 'text-text-2' : 'text-text-3 group-hover/row:text-text-2')}>{meta}</span>
      )}
      {trailing && !isEditing && (
        <span
          className={cx(
            'flex shrink-0 items-center gap-0.5 transition-opacity duration-(--dur-fast)',
            trailingVisible || selected ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100',
          )}
        >
          {trailing}
        </span>
      )}
    </div>
  );
});
