// What a new school still has to set up, in the order the data depends on itself.
// `staffTotal` is undefined when the staff module is off, which drops that step.
// `seats` is true for a study center: it has its own four steps (shift, seats, plan,
// members, seat map, fee collection) because it has no terms, subjects or teachers to
// assign, and its academic year is created for it. `planCount` and `paymentCount` are
// undefined when the fee module is off. The seat map step is done once a member holds a seat.
export function setupSteps({
  years,
  terms,
  classes,
  subjects,
  staffTotal,
  assignments,
  studentsTotal,
  seats = false,
  seatCount = 0,
  planCount,
  allocationCount = 0,
  paymentCount,
}) {
  const hasShift = classes.some((c) => c.sections?.length > 0);
  if (seats) {
    return [
      { key: 'shifts', done: hasShift, to: '/academic/classes-sections' },
      { key: 'seats', done: seatCount > 0, to: '/academic/seats' },
      ...(planCount === undefined
        ? []
        : [{ key: 'plans', done: planCount > 0, to: '/fee/structures' }]),
      { key: 'members', done: studentsTotal > 0, to: '/academic/students' },
      { key: 'seatMap', done: allocationCount > 0, to: '/academic/seat-map' },
      ...(paymentCount === undefined
        ? []
        : [{ key: 'collection', done: paymentCount > 0, to: '/fee' }]),
    ];
  }
  return [
    { key: 'years', done: years.length > 0, to: '/academic/years' },
    { key: 'terms', done: terms.length > 0, to: '/academic/years' },
    { key: 'classes', done: hasShift, to: '/academic/classes-sections' },
    { key: 'subjects', done: subjects.length > 0, to: '/academic/subjects' },
    ...(staffTotal === undefined ? [] : [{ key: 'staff', done: staffTotal > 0, to: '/staff' }]),
    { key: 'teaching', done: assignments.length > 0, to: '/academic/subjects' },
    { key: 'students', done: studentsTotal > 0, to: '/academic/students' },
  ];
}
