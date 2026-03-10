/**
 * 制作物グリッド (エリアB下半分)
 *
 * 2列 x 4行で7制作物を表示。
 */

import React from 'react';
import {
  Globe,
  Megaphone,
  FileText,
  ClipboardList,
  MessageCircle,
  NotebookPen,
  User,
  Code,
  Presentation,
} from 'lucide-react';
import { DeliverableCard } from './DeliverableCard';
import type { DeliverableType, DeliverableStatus, GenerationJob } from '../types/dashboard';
import type { LucideIcon } from 'lucide-react';

// ============================================================
// 制作物定義
// ============================================================

interface DeliverableEntry {
  readonly type: DeliverableType;
  readonly label: string;
  readonly icon: LucideIcon;
}

const DELIVERABLES: readonly DeliverableEntry[] = [
  { type: 'lp', label: 'LP', icon: Globe },
  { type: 'ad_creative', label: '広告', icon: Megaphone },
  { type: 'flyer', label: 'チラシ', icon: FileText },
  { type: 'hearing_form', label: 'フォーム', icon: ClipboardList },
  { type: 'line_design', label: 'LINE設計', icon: MessageCircle },
  { type: 'minutes', label: '議事録', icon: NotebookPen },
  { type: 'profile', label: 'プロフィール', icon: User },
  { type: 'system_proposal', label: 'システム提案', icon: Code },
  { type: 'proposal', label: '提案資料', icon: Presentation },
] as const;

// ============================================================
// Props
// ============================================================

interface DeliverableGridProps {
  readonly getDeliverableStatus: (type: DeliverableType) => DeliverableStatus;
  readonly getMissingFields: (type: DeliverableType) => readonly string[];
  readonly getJobForType: (type: DeliverableType) => GenerationJob | undefined;
  readonly onGenerate: (type: DeliverableType) => void;
  readonly onShare: (type: DeliverableType) => void;
}

// ============================================================
// コンポーネント
// ============================================================

export const DeliverableGrid: React.FC<DeliverableGridProps> = ({
  getDeliverableStatus,
  getMissingFields,
  getJobForType,
  onGenerate,
  onShare,
}) => {
  return (
    <section className="px-4 pt-4 pb-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        制作物
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {DELIVERABLES.map((item) => {
          const status = getDeliverableStatus(item.type);
          const missingFields = getMissingFields(item.type);
          const job = getJobForType(item.type);

          return (
            <DeliverableCard
              key={item.type}
              type={item.type}
              label={item.label}
              icon={item.icon}
              status={status}
              missingFields={missingFields}
              resultUrl={job?.result_url ?? null}
              errorMessage={job?.error ?? null}
              onGenerate={() => onGenerate(item.type)}
              onShare={() => onShare(item.type)}
            />
          );
        })}
      </div>
    </section>
  );
};
