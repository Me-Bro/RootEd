// What to tell someone who has just added a student, shown on the new student's page.
// `notice` is what the create request came back with: the name, the login email if one
// was sent, and the reasons a login or fee assignment did not happen (the student is
// saved either way).
const BASE = 'academic.students';

/** `{ key, params, feeKey }`: the sentence to show, and an extra one when the fee could not be assigned. */
export function addedMessage(notice) {
  const { name, email, loginError, feeError } = notice;
  let key = `${BASE}.addedGeneric`;
  let params = { name };
  if (email) {
    key = `${BASE}.addedWithLogin`;
    params = { name, email };
  } else if (loginError) {
    key = `${BASE}.addedNoLogin`;
    params = { name, reason: loginError };
  }
  return { key, params, feeKey: feeError ? `${BASE}.feeNotAssigned` : null };
}

/** The notice to carry to the profile page from a create response, or null without one. */
export function noticeFromCreated(student) {
  if (!student?._id) return null;
  return {
    studentId: String(student._id),
    name: `${student.firstName} ${student.lastName}`,
    email: student.account?.email,
    loginError: student.loginError,
    feeError: student.feeError,
  };
}
