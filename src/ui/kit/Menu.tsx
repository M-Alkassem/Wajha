/**
 * DropdownMenu and ContextMenu with one shared look: popover surface, 28 px
 * items with an icon slot, right-aligned shortcuts, danger items, checkbox
 * and radio items, labels, separators and submenus.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ContextMenu as ContextPrimitive, DropdownMenu as DropdownPrimitive } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import { cx } from './cx';
import { Kbd } from './Kbd';
import type { ShortcutInput } from './keys';

const CONTENT =
  'kit-pop z-50 min-w-[208px] overflow-x-hidden overflow-y-auto rounded-lg border border-line bg-popover p-1 text-text shadow-lg outline-none ' +
  'max-h-[min(var(--menu-available-height,100vh),560px)]';

/* The highlighted row is surface-3 in dark, where surface-2 all but vanishes
   on the popover surface, and surface-2 in light. Any text-3 inside it
   (shortcuts, icons, a caller's secondary label) turns text-2, which keeps
   4.5:1 there; text-3 would drop to about 4:1. */
const ITEM_BASE =
  'group/item relative flex h-7 cursor-default items-center gap-2 rounded-[5px] px-2 text-ui outline-none select-none ' +
  'data-[highlighted]:[&_.text-text-3]:text-text-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

const ITEM = `${ITEM_BASE} data-[highlighted]:bg-surface-3 light:data-[highlighted]:bg-surface-2`;

/** Destructive action: red text on a red highlight (one or the other background, never both). */
const DANGER_ITEM = `${ITEM_BASE} text-danger data-[highlighted]:bg-danger-soft`;

const ICON_SLOT_BASE = 'flex size-4 shrink-0 items-center justify-center [&_svg]:size-4';
const ICON_SLOT = `${ICON_SLOT_BASE} text-text-3 group-data-[highlighted]/item:text-text-2`;
const DANGER_ICON_SLOT = `${ICON_SLOT_BASE} text-danger`;

interface ItemExtras {
  icon?: ReactNode;
  shortcut?: ShortcutInput;
  /** Destructive action: red text, red highlight. */
  danger?: boolean;
  /** Indent to line up with items that have icons. */
  inset?: boolean;
}

function ItemBody({ icon, shortcut, inset, danger, children }: ItemExtras & { children?: ReactNode }) {
  return (
    <>
      {icon ? (
        <span className={danger ? DANGER_ICON_SLOT : ICON_SLOT}>{icon}</span>
      ) : inset ? (
        <span className="size-4 shrink-0" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <Kbd keys={shortcut} tone="plain" className="ml-6 shrink-0" />}
    </>
  );
}

/* Dropdown menu ---------------------------------------------------------------- */

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;
export const DropdownMenuSub = DropdownPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup;

export const DropdownMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(
  function DropdownMenuContent({ className, sideOffset = 6, collisionPadding = 8, ...rest }, ref) {
    return (
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          className={cx(CONTENT, 'origin-(--radix-dropdown-menu-content-transform-origin) [--menu-available-height:var(--radix-dropdown-menu-content-available-height)]', className)}
          {...rest}
        />
      </DropdownPrimitive.Portal>
    );
  },
);

export type DropdownMenuItemProps = ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & ItemExtras;

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(function DropdownMenuItem(
  { icon, shortcut, danger, inset, className, children, ...rest },
  ref,
) {
  return (
    <DropdownPrimitive.Item ref={ref} className={cx(danger ? DANGER_ITEM : ITEM, className)} {...rest}>
      <ItemBody icon={icon} shortcut={shortcut} inset={inset} danger={danger}>
        {children}
      </ItemBody>
    </DropdownPrimitive.Item>
  );
});

export type DropdownMenuCheckboxItemProps = ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem> & Omit<ItemExtras, 'icon' | 'danger' | 'inset'>;

export const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, DropdownMenuCheckboxItemProps>(function DropdownMenuCheckboxItem(
  { shortcut, className, children, ...rest },
  ref,
) {
  return (
    <DropdownPrimitive.CheckboxItem ref={ref} className={cx(ITEM, className)} {...rest}>
      <span className={ICON_SLOT}>
        <DropdownPrimitive.ItemIndicator>
          <Check className="text-accent-fg" strokeWidth={2.5} />
        </DropdownPrimitive.ItemIndicator>
      </span>
      <ItemBody shortcut={shortcut}>{children}</ItemBody>
    </DropdownPrimitive.CheckboxItem>
  );
});

export type DropdownMenuRadioItemProps = ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem> & Omit<ItemExtras, 'icon' | 'danger' | 'inset'>;

export const DropdownMenuRadioItem = forwardRef<HTMLDivElement, DropdownMenuRadioItemProps>(function DropdownMenuRadioItem(
  { shortcut, className, children, ...rest },
  ref,
) {
  return (
    <DropdownPrimitive.RadioItem ref={ref} className={cx(ITEM, className)} {...rest}>
      <span className={ICON_SLOT}>
        <DropdownPrimitive.ItemIndicator>
          <span className="block size-1.5 rounded-full bg-accent-fg" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      <ItemBody shortcut={shortcut}>{children}</ItemBody>
    </DropdownPrimitive.RadioItem>
  );
});

export const DropdownMenuLabel = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>>(function DropdownMenuLabel(
  { className, ...rest },
  ref,
) {
  return <DropdownPrimitive.Label ref={ref} className={cx('px-2 pt-1.5 pb-1 text-2xs font-medium text-text-3', className)} {...rest} />;
});

export const DropdownMenuSeparator = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>>(
  function DropdownMenuSeparator({ className, ...rest }, ref) {
    return <DropdownPrimitive.Separator ref={ref} className={cx('-mx-1 my-1 h-px bg-line', className)} {...rest} />;
  },
);

export type DropdownMenuSubTriggerProps = ComponentPropsWithoutRef<typeof DropdownPrimitive.SubTrigger> & Pick<ItemExtras, 'icon' | 'inset'>;

export const DropdownMenuSubTrigger = forwardRef<HTMLDivElement, DropdownMenuSubTriggerProps>(function DropdownMenuSubTrigger(
  { icon, inset, className, children, ...rest },
  ref,
) {
  return (
    <DropdownPrimitive.SubTrigger
      ref={ref}
      className={cx(ITEM, 'data-[state=open]:bg-surface-3 data-[state=open]:[&_.text-text-3]:text-text-2 light:data-[state=open]:bg-surface-2', className)}
      {...rest}
    >
      <ItemBody icon={icon} inset={inset}>
        {children}
      </ItemBody>
      <ChevronRight className="size-3.5 shrink-0 text-text-3" />
    </DropdownPrimitive.SubTrigger>
  );
});

export const DropdownMenuSubContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DropdownPrimitive.SubContent>>(
  function DropdownMenuSubContent({ className, sideOffset = 4, collisionPadding = 8, ...rest }, ref) {
    return (
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.SubContent
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          className={cx(CONTENT, 'origin-(--radix-dropdown-menu-content-transform-origin) [--menu-available-height:var(--radix-dropdown-menu-content-available-height)]', className)}
          {...rest}
        />
      </DropdownPrimitive.Portal>
    );
  },
);

/* Context menu ------------------------------------------------------------------ */

export const ContextMenu = ContextPrimitive.Root;
export const ContextMenuTrigger = ContextPrimitive.Trigger;
export const ContextMenuGroup = ContextPrimitive.Group;
export const ContextMenuSub = ContextPrimitive.Sub;
export const ContextMenuRadioGroup = ContextPrimitive.RadioGroup;

export const ContextMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ContextPrimitive.Content>>(
  function ContextMenuContent({ className, collisionPadding = 8, ...rest }, ref) {
    return (
      <ContextPrimitive.Portal>
        <ContextPrimitive.Content
          ref={ref}
          collisionPadding={collisionPadding}
          className={cx(CONTENT, 'origin-(--radix-context-menu-content-transform-origin) [--menu-available-height:var(--radix-context-menu-content-available-height)]', className)}
          {...rest}
        />
      </ContextPrimitive.Portal>
    );
  },
);

export type ContextMenuItemProps = ComponentPropsWithoutRef<typeof ContextPrimitive.Item> & ItemExtras;

export const ContextMenuItem = forwardRef<HTMLDivElement, ContextMenuItemProps>(function ContextMenuItem(
  { icon, shortcut, danger, inset, className, children, ...rest },
  ref,
) {
  return (
    <ContextPrimitive.Item ref={ref} className={cx(danger ? DANGER_ITEM : ITEM, className)} {...rest}>
      <ItemBody icon={icon} shortcut={shortcut} inset={inset} danger={danger}>
        {children}
      </ItemBody>
    </ContextPrimitive.Item>
  );
});

export type ContextMenuCheckboxItemProps = ComponentPropsWithoutRef<typeof ContextPrimitive.CheckboxItem> & Omit<ItemExtras, 'icon' | 'danger' | 'inset'>;

export const ContextMenuCheckboxItem = forwardRef<HTMLDivElement, ContextMenuCheckboxItemProps>(function ContextMenuCheckboxItem(
  { shortcut, className, children, ...rest },
  ref,
) {
  return (
    <ContextPrimitive.CheckboxItem ref={ref} className={cx(ITEM, className)} {...rest}>
      <span className={ICON_SLOT}>
        <ContextPrimitive.ItemIndicator>
          <Check className="text-accent-fg" strokeWidth={2.5} />
        </ContextPrimitive.ItemIndicator>
      </span>
      <ItemBody shortcut={shortcut}>{children}</ItemBody>
    </ContextPrimitive.CheckboxItem>
  );
});

export type ContextMenuRadioItemProps = ComponentPropsWithoutRef<typeof ContextPrimitive.RadioItem> & Omit<ItemExtras, 'icon' | 'danger' | 'inset'>;

export const ContextMenuRadioItem = forwardRef<HTMLDivElement, ContextMenuRadioItemProps>(function ContextMenuRadioItem(
  { shortcut, className, children, ...rest },
  ref,
) {
  return (
    <ContextPrimitive.RadioItem ref={ref} className={cx(ITEM, className)} {...rest}>
      <span className={ICON_SLOT}>
        <ContextPrimitive.ItemIndicator>
          <span className="block size-1.5 rounded-full bg-accent-fg" />
        </ContextPrimitive.ItemIndicator>
      </span>
      <ItemBody shortcut={shortcut}>{children}</ItemBody>
    </ContextPrimitive.RadioItem>
  );
});

export const ContextMenuLabel = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ContextPrimitive.Label>>(function ContextMenuLabel(
  { className, ...rest },
  ref,
) {
  return <ContextPrimitive.Label ref={ref} className={cx('px-2 pt-1.5 pb-1 text-2xs font-medium text-text-3', className)} {...rest} />;
});

export const ContextMenuSeparator = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ContextPrimitive.Separator>>(
  function ContextMenuSeparator({ className, ...rest }, ref) {
    return <ContextPrimitive.Separator ref={ref} className={cx('-mx-1 my-1 h-px bg-line', className)} {...rest} />;
  },
);

export type ContextMenuSubTriggerProps = ComponentPropsWithoutRef<typeof ContextPrimitive.SubTrigger> & Pick<ItemExtras, 'icon' | 'inset'>;

export const ContextMenuSubTrigger = forwardRef<HTMLDivElement, ContextMenuSubTriggerProps>(function ContextMenuSubTrigger(
  { icon, inset, className, children, ...rest },
  ref,
) {
  return (
    <ContextPrimitive.SubTrigger
      ref={ref}
      className={cx(ITEM, 'data-[state=open]:bg-surface-3 data-[state=open]:[&_.text-text-3]:text-text-2 light:data-[state=open]:bg-surface-2', className)}
      {...rest}
    >
      <ItemBody icon={icon} inset={inset}>
        {children}
      </ItemBody>
      <ChevronRight className="size-3.5 shrink-0 text-text-3" />
    </ContextPrimitive.SubTrigger>
  );
});

export const ContextMenuSubContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof ContextPrimitive.SubContent>>(
  function ContextMenuSubContent({ className, sideOffset = 4, collisionPadding = 8, ...rest }, ref) {
    return (
      <ContextPrimitive.Portal>
        <ContextPrimitive.SubContent
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          className={cx(CONTENT, 'origin-(--radix-context-menu-content-transform-origin) [--menu-available-height:var(--radix-context-menu-content-available-height)]', className)}
          {...rest}
        />
      </ContextPrimitive.Portal>
    );
  },
);
