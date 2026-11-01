// What a new school still has to set up, in the order the data depends on itself.
// `staffTotal` is undefined when the staff module is off, which drops that step.
// `seats` is true for a study center, which has no terms, subjects or teachers to
// assign: those steps would stay open forever and keep the card on screen.
export function setupSteps({
  years,
  terms,
  classes,
  subjects,
  staffTotal,
  assignments,
  studentsTotal,
  seats = false,
}) {
  return [
    { key: 'years', done: years.length > 0, to: '/academic/years' },
    ...(seats ? [] : [{ key: 'terms', done: terms.length > 0, to: '/academic/years' }]),
    {
      key: 'classes',
      done: classes.some((c) => c.sections?.length > 0),
      to: '/academic/classes-sections',
    },
    ...(seats ? [] : [{ key: 'subjects', done: subjects.length > 0, to: '/academic/subjects' }]),
    ...(staffTotal === undefined ? [] : [{ key: 'staff', done: staffTotal > 0, to: '/staff' }]),
    ...(seats ? [] : [{ key: 'teaching', done: assignments.length > 0, to: '/academic/subjects' }]),
    { key: 'students', done: studentsTotal > 0, to: '/academic/students' },
  ];
}
