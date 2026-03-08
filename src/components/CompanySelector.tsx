/**
 * 企業選択コンポーネント
 *
 * 検出された企業一覧を表示し、ユーザーに対象企業を選択させる。
 */

import React from 'react';
import { Building2, Users, Hash, Loader2 } from 'lucide-react';

export interface DetectedCompany {
  readonly name: string;
  readonly role: string;
  readonly description: string;
  readonly key_person: string;
  readonly key_numbers: readonly string[];
}

interface CompanySelectorProps {
  readonly companies: readonly DetectedCompany[];
  readonly isLoading: boolean;
  readonly onSelect: (company: DetectedCompany) => void;
}

const ROLE_COLORS: Record<string, string> = {
  'サービス提供者': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  '支援会社': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  '紹介者': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  '顧客候補': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'パートナー': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export const CompanySelector: React.FC<CompanySelectorProps> = ({
  companies,
  isLoading,
  onSelect,
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
        <p className="text-gray-400 text-sm">商談参加企業を分析中...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-gray-100 mb-2">
            対象企業を選択
          </h2>
          <p className="text-sm text-gray-400">
            どの企業の制作物を生成しますか？
          </p>
        </div>

        <div className="space-y-3">
          {companies.map((company, index) => {
            const roleStyle = ROLE_COLORS[company.role] || ROLE_COLORS['パートナー']!;

            return (
              <button
                key={`${company.name}-${index}`}
                type="button"
                className="w-full text-left p-5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.07] hover:border-blue-500/30 transition-all active:scale-[0.99] group"
                onClick={() => onSelect(company)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-500/20 transition-colors">
                    <Building2 className="w-5 h-5 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-bold text-gray-100 text-base">
                        {company.name}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${roleStyle}`}>
                        {company.role}
                      </span>
                    </div>

                    <p className="text-sm text-gray-400 mb-3 leading-relaxed">
                      {company.description}
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {company.key_person && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {company.key_person}
                        </span>
                      )}
                      {company.key_numbers.map((num, ni) => (
                        <span key={ni} className="flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5" />
                          {num}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-gray-600 group-hover:text-blue-400 transition-colors mt-3">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
