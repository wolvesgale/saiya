const agencyColors = [
  'bg-indigo-500/70',
  'bg-emerald-500/70',
  'bg-amber-500/70',
  'bg-rose-500/70',
  'bg-sky-500/70',
  'bg-fuchsia-500/70',
  'bg-teal-500/70',
  'bg-lime-500/70',
];

export const getAgencyColor = (agencyId: string) => {
  let hash = 0;
  for (let i = 0; i < agencyId.length; i += 1) {
    hash = agencyId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % agencyColors.length;
  return agencyColors[index];
};
