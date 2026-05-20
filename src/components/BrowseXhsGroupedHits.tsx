"use client";

import { useState } from "react";
import type { BrowseTopic } from "@/lib/types";
import type { BrowseStoredHit } from "@/lib/browse-storage";
import { BrowseHitCard } from "@/components/BrowseHitCard";
import { isBrowseUiDemoHit } from "@/lib/browse-demo-preview";
import { groupBrowseHitsForXhsTopic } from "@/lib/browse-xhs-display";

type Props = {
  hits: BrowseStoredHit[];
  topic: BrowseTopic;
  topicId: string;
  busyUrl: string | null;
  onAddTodo: (hit: BrowseStoredHit) => Promise<void>;
  onAddDone: (hit: BrowseStoredHit) => Promise<void>;
};

export function BrowseXhsGroupedHits({ hits, topic, topicId, busyUrl, onAddTodo, onAddDone }: Props) {
  const groups = groupBrowseHitsForXhsTopic(hits, topic);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!groups.length) return null;

  return (
    <div className="browse-xhs-groups">
      {groups.map((g) => {
        const isCollapsed = collapsed[g.key] === true;
        return (
          <section key={g.key} className="browse-xhs-group">
            <button
              type="button"
              className="browse-xhs-group-head"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((prev) => ({ ...prev, [g.key]: !isCollapsed }))}
            >
              <span className="browse-xhs-group-chevron" aria-hidden>
                {isCollapsed ? "▸" : "▾"}
              </span>
              <span className="browse-xhs-group-title">{g.label}</span>
              <span className="browse-xhs-group-count muted-link">{g.items.length} 篇</span>
            </button>
            {!isCollapsed ? (
              <div className="browse-xhs-group-body">
                {g.items.map((h) => (
                  <BrowseHitCard
                    key={isBrowseUiDemoHit(h) ? "__browse_ui_demo__" : h.url}
                    hit={h}
                    topicId={topicId}
                    topicName={topic.name}
                    busy={busyUrl === h.url}
                    demo={isBrowseUiDemoHit(h)}
                    onAddTodo={() => onAddTodo(h)}
                    onAddDone={() => onAddDone(h)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
