import { Link } from 'react-router-dom';
import { hasSeats } from '@rooted/shared/utils';
import { useAuth } from '../../contexts/useAuth.js';
import { studentLink } from '../../utils/studentLink.js';

/**
 * A learner's name on the Fees page, linked to their page when the viewer may open it.
 * `student` is the populated `studentId` of a fee row. At a study center the link lands
 * on the Billing tab (a walk-in or a viewer without fees access falls back to Overview);
 * the back link there returns to Fees.
 */
export default function StudentNameLink({ student }) {
  const { user } = useAuth();
  const name = `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim();
  const canOpen = (user?.permissions ?? []).includes('students:read');
  if (!student?._id || !canOpen) return name;

  const tab = hasSeats(user?.orgType) ? 'billing' : undefined;
  return (
    <Link className="hover:underline" {...studentLink(student._id, { from: 'fees', tab })}>
      {name}
    </Link>
  );
}
