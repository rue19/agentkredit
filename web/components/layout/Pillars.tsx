/*
  The three conceptual pillars. The numbering is not decoration: identity
  precedes reputation, which precedes spending authority, and that order is
  how the protocol actually works.
*/
const PILLARS = [
  { n: "01", title: "Identity", body: "Verifiable agent registration." },
  { n: "02", title: "Reputation", body: "Trust built through attestations." },
  { n: "03", title: "Authority", body: "Programmable spending limits on-chain." },
] as const;

export function Pillars() {
  return (
    <ol
      id="protocol"
      className="grid w-full grid-cols-1 gap-y-10 sm:grid-cols-3 sm:gap-x-(--pillar-gap) sm:gap-y-0 lg:max-w-[54%]"
    >
      {PILLARS.map((pillar) => (
        <li key={pillar.n}>
          <div className="flex items-center">
            <span className="text-pillar-num leading-none tabular-nums text-muted">
              {pillar.n}
            </span>
            <span
              aria-hidden="true"
              className="pillar-rule ml-[clamp(0.875rem,2.54vw,2.4375rem)] h-px flex-1"
            />
            <span
              aria-hidden="true"
              className="ml-[3px] size-[6px] shrink-0 rounded-full bg-chalk"
            />
          </div>

          <h2 className="text-pillar-title mt-[clamp(1rem,1.5vw,1.4375rem)] leading-none font-medium tracking-[0.06em] text-cream uppercase">
            {pillar.title}
          </h2>

          <p className="text-pillar-body mt-[clamp(0.75rem,1.24vw,1.1875rem)] max-w-[11.5em] text-faint">
            {pillar.body}
          </p>
        </li>
      ))}
    </ol>
  );
}
