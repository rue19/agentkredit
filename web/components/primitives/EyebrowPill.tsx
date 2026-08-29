export function EyebrowPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-eyebrow inline-flex items-center rounded-full border border-hair py-[1.28em] pr-[2.15em] pl-[1.69em]">
      <span className="mr-[1.54em] block size-[0.62em] shrink-0 rounded-full bg-chalk" />
      <span className="leading-none font-medium tracking-[0.14em] text-chalk uppercase">
        {children}
      </span>
    </div>
  );
}
