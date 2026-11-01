// "First Last" for a person row, or `fallback` when there is no row (a deleted
// learner, an unknown id) so a message never reads "undefined undefined".
export const fullName = (person, fallback = 'another learner') =>
  person ? `${person.firstName} ${person.lastName}`.trim() : fallback;
