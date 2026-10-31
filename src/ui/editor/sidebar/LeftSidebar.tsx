import { selectActiveLayout, useEditor, type LeftTab } from '../../../store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../kit';
import { LayersPanel } from './LayersPanel';
import { SlidesPanel } from './SlidesPanel';

import { t } from '../../../i18n';
function Count({ value }: { value: number }) {
  return <span className="text-2xs font-medium text-text-3 tabular-nums">{value}</span>;
}

/** Left sidebar: the slides of the project and the layers of the active slide. */
export function LeftSidebar() {
  const tab = useEditor((s) => s.leftTab);
  const slides = useEditor((s) => s.project?.slides.length ?? 0);
  const layers = useEditor((s) => selectActiveLayout(s)?.elements.length ?? 0);

  return (
    <aside aria-label={t('Slides and layers')} className="flex h-full w-(--sidebar-w) shrink-0 flex-col border-e border-line bg-panel">
      <Tabs value={tab} onValueChange={(v) => useEditor.getState().setLeftTab(v as LeftTab)} className="min-h-0 flex-1">
        <TabsList className="px-3">
          <TabsTrigger value="slides">
            {t('Slides')} <Count value={slides} />
          </TabsTrigger>
          <TabsTrigger value="layers">
            {t('Layers')} <Count value={layers} />
          </TabsTrigger>
        </TabsList>
        {/* The panels hold their own focusable rows, so the panels themselves are no extra tab stop. */}
        <TabsContent value="slides" tabIndex={-1} className="flex flex-col">
          <SlidesPanel />
        </TabsContent>
        <TabsContent value="layers" tabIndex={-1} className="flex flex-col">
          <LayersPanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
