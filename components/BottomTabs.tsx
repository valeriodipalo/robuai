"use client";

export type Tab = "new" | "matches" | "voice";

// Fixed bottom navigation. Hidden during onboarding / loading by the parent.
export default function BottomTabs({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "new", icon: "＋", label: "New" },
    { id: "matches", icon: "⌂", label: "Matches" },
    { id: "voice", icon: "◎", label: "Voice" },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="glass w-full max-w-[430px] border-t border-white/[.08] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2.5">
        <div className="flex gap-1.5">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-[12px] py-2 text-[11px] transition ${
                  on ? "bg-white/[.06] text-[#f4eef0]" : "text-faint"
                }`}
              >
                <span className="text-[15px]">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
