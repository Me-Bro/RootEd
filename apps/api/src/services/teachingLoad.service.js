import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';
import { Class } from '../models/Class.js';
import { Section } from '../models/Section.js';
import { Subject } from '../models/Subject.js';
import { SubjectTeacher } from '../models/SubjectTeacher.js';
import { Timetable } from '../models/Timetable.js';
import { buildTeachingLoad } from '../utils/teachingLoad.js';

/**
 * What one teacher (a User id) covers in the active academic year. Assignments are
 * per year: one in any of the year's terms counts.
 */
export async function loadTeachingLoad({ tenantId, teacherId }) {
  const year = await AcademicYear.findOne({ tenantId, isActive: true }, '_id').lean();
  if (!year) return { yearId: null, items: [] };

  const terms = await Term.find({ tenantId, academicYearId: year._id }, '_id').lean();
  const [assignments, slots, classTeacherSections, sections, classes, subjects] = await Promise.all(
    [
      SubjectTeacher.find(
        { tenantId, teacherId, termId: { $in: terms.map((t) => t._id) } },
        'sectionId subjectId'
      ).lean(),
      Timetable.find(
        { tenantId, teacherId, academicYearId: year._id },
        'sectionId subjectId'
      ).lean(),
      Section.find({ tenantId, classTeacherId: teacherId }, '_id').lean(),
      Section.find({ tenantId }, 'classId name').lean(),
      Class.find({ tenantId }, 'name gradeLevel').lean(),
      Subject.find({ tenantId }, 'name').lean(),
    ]
  );

  return {
    yearId: String(year._id),
    items: buildTeachingLoad({
      assignments,
      slots,
      classTeacherSectionIds: classTeacherSections.map((s) => s._id),
      sections,
      classes,
      subjects,
    }),
  };
}
