import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { FAMILIES } from '../../../model/catalog';
import type { FamilyId } from '../../../model/types';
import { useEditor } from '../../../store';
import { IconButton, SegmentedControl, type SegmentedOption } from '../../kit';
import { useEditorUi } from '../editorUi';
import { FAMILY_ICONS } from '../familyMeta';

const NO_FAMILIES: FamilyId[] = [];

export interface FamilySwitcherProps {
  /** Show family names; otherwise icons with tooltips. */
  labels: boolean;
}

/** Centered device-family tabs plus the button that adds or removes families. */
export function FamilySwitcher({ labels }: FamilySwitcherProps) {
  const families = useEditor((s) => s.project?.families ?? NO_FAMILIES);
  const active = useEditor((s) => s.activeFamily);

  const options = useMemo<SegmentedOption<FamilyId>[]>(
    () =>
      families.map((id) => {
        const Icon = FAMILY_ICONS[id];
        const info = FAMILIES[id];
        return labels
          ? { value: id, icon: <Icon />, label: info.shortLabel, 'aria-label': info.label }
          : { value: id, icon: <Icon />, tooltip: info.label, 'aria-label': info.label };
      }),
    [families, labels],
  );

  return (
    <div className="flex items-center gap-1">
      {families.length > 0 && (
        <SegmentedControl<FamilyId>
          aria-label="Device family"
          value={active}
          onValueChange={(id) => useEditor.getState().setActiveFamily(id)}
          options={options}
        />
      )}
      <IconButton
        label="Device families"
        tooltip="Add or remove device families"
        tooltipSide="bottom"
        icon={<Plus />}
        onClick={() => useEditorUi.getState().openDialog('families')}
      />
    </div>
  );
}
