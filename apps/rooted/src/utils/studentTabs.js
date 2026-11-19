// The tabs of a study-center learner's page that a viewer may open, in order. Overview
// and History are for anyone who can open the profile; the others follow the
// permission of what they show.
export function availableTabs({ permissions, student }) {
  return [
    'overview',
    ...(permissions.includes('attendance:read') ? ['visits'] : []),
    // A walk-in buys a pass at the desk and has no plan or standing fees to show.
    ...(permissions.includes('fees:read') && student.kind !== 'walk_in' ? ['billing'] : []),
    'history',
  ];
}
