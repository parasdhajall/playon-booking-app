import React, { memo } from "react";
import { playChipSound } from "@/lib/soundEffects";

interface ChipItem {
  amount: number;
  label: string;
  image?: string;
  bgGradient?: string;
  borderColor?: string;
}

const CHIP_LIST: ChipItem[] = [
  { amount: 5, label: "5", image: "/app-assets/images/five_chips.svg" },
  { amount: 10, label: "10", image: "/app-assets/images/ten_chips.svg" },
  { amount: 50, label: "50", image: "/app-assets/images/fifty_chips.svg" },
  { amount: 100, label: "100", image: "/app-assets/images/hundred_chips.svg" },
  { amount: 500, label: "500", image: "/app-assets/images/five_hundred_chips.svg" },
  {
    amount: 1000,
    label: "1K",
    bgGradient: "from-amber-400 via-amber-500 to-amber-700",
    borderColor: "border-amber-300",
  },
];

interface ChipsSelectorProps {
  currentAmount?: number | string;
  onSelectAmount: (amt: number) => void;
  mode?: "set" | "add";
  className?: string;
}

export const ChipsSelector = memo(function ChipsSelector({
  currentAmount,
  onSelectAmount,
  mode = "set",
  className = "",
}: ChipsSelectorProps) {
  const currentNum = typeof currentAmount === "number" ? currentAmount : Number(currentAmount) || 0;

  const handleChipClick = (amt: number) => {
    playChipSound();
    if (mode === "add") {
      onSelectAmount((currentNum || 0) + amt);
    } else {
      onSelectAmount(amt);
    }
  };

  return (
    <div className={`flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5 ${className}`}>
      {CHIP_LIST.map((chip) => {
        const isSelected = mode === "set" && currentNum === chip.amount;
        return (
          <button
            key={chip.amount}
            type="button"
            onClick={() => handleChipClick(chip.amount)}
            className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-90 touch-manipulation focus:outline-none ${
              isSelected
                ? "ring-2 ring-gold ring-offset-2 ring-offset-background scale-110 shadow-lg"
                : "opacity-85 hover:opacity-100 hover:scale-105"
            }`}
            title={`₹${chip.amount} chip`}
          >
            {chip.image ? (
              <img
                src={chip.image}
                alt={`₹${chip.amount}`}
                className="h-full w-full object-contain drop-shadow"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br ${chip.bgGradient} border-2 ${chip.borderColor} shadow-inner text-slate-950 font-black text-xs font-mono drop-shadow`}
              >
                {chip.label}
              </div>
            )}
            {/* Tiny Amount Pill Badge */}
            <span
              className={`absolute -bottom-1 rounded-full px-1.5 py-0.2 text-[9px] font-black tracking-tight leading-none shadow transition-colors ${
                isSelected
                  ? "bg-gold text-slate-950"
                  : "bg-background/90 text-foreground border border-border/80 group-hover:bg-card"
              }`}
            >
              ₹{chip.label}
            </span>
          </button>
        );
      })}
    </div>
  );
});
