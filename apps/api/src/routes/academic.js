import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { Queue } from 'bullmq';
import {
  markAttendanceSchema,
  attendanceQuerySchema,
  attendanceReportQuerySchema,
  saveGradesSchema,
  gradesQuerySchema,
  gradesReportQuerySchema,
  gradeLockSchema,
} from '@rooted/shared/schemas';
import { scoreToLetter } from '@rooted/shared/utils';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { redis } from '../config/redis.js';
import { withCache, invalidateCache } from '../utils/cache.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';
import { Class } from '../models/Class.js';
import { Section } from '../models/Section.js';
import { Subject } from '../models/Subject.js';
import { Student } from '../models/Student.js';
import { Timetable } from '../models/Timetable.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Grade } from '../models/Grade.js';
import { GradeLock } from '../models/GradeLock.js';
import { buildStudentFilter } from '../utils/studentFilter.js';
import { computeAttendanceStats } from '../utils/attendanceStats.js';
import { computeGradeStats } from '../utils/gradeStats.js';
import { auditLog } from '../services/audit.service.js';

const DEFAULTER_THRESHOLD_PCT = 75;
const DEFAULT_REPORT_RANGE_DAYS = 30;

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const reportCardQueue = new Queue('report-card', { connection: redis });

router.use(authenticate);

// ── Academic Years ────────────────────────────────────────────────────────────

router.post('/years', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, startDate, endDate } = req.body;
    const tenantId = req.tenant._id;

    await AcademicYear.updateMany({ tenantId }, { $set: { isActive: false } });

    const year = await AcademicYear.create({ tenantId, name, startDate, endDate, isActive: true });
    await invalidateCache(`years:${tenantId}`);
    res.status(201).json(year);
  } catch (err) {
    next(err);
  }
});

router.get('/years', requirePermission('students:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const years = await withCache(`years:${tenantId}`, 300, () =>
      AcademicYear.find({ tenantId }).sort({ startDate: -1 }).lean()
    );
    res.json(years);
  } catch (err) {
    next(err);
  }
});

router.get('/years/:id', requirePermission('students:read'), async (req, res, next) => {
  try {
    const year = await AcademicYear.findOne({
      _id: req.params.id,
      tenantId: req.tenant._id,
    }).lean();
    if (!year) return res.status(404).json({ error: 'Not found' });
    res.json(year);
  } catch (err) {
    next(err);
  }
});

router.patch('/years/:id/activate', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    await AcademicYear.updateMany({ tenantId }, { $set: { isActive: false } });
    const year = await AcademicYear.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { isActive: true } },
      { new: true }
    );
    if (!year) return res.status(404).json({ error: 'Not found' });
    await invalidateCache(`years:${tenantId}`);
    res.json(year);
  } catch (err) {
    next(err);
  }
});

// ── Terms ─────────────────────────────────────────────────────────────────────

router.post('/terms', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { academicYearId, name, startDate, endDate } = req.body;
    const term = await Term.create({
      tenantId: req.tenant._id,
      academicYearId,
      name,
      startDate,
      endDate,
    });
    res.status(201).json(term);
  } catch (err) {
    next(err);
  }
});

router.get('/terms', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.yearId) filter.academicYearId = req.query.yearId;
    const terms = await Term.find(filter).sort({ startDate: 1 }).lean();
    res.json(terms);
  } catch (err) {
    next(err);
  }
});

router.patch('/terms/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const term = await Term.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!term) return res.status(404).json({ error: 'Not found' });
    res.json(term);
  } catch (err) {
    next(err);
  }
});

// ── Classes ───────────────────────────────────────────────────────────────────

router.post('/classes', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, gradeLevel } = req.body;
    const cls = await Class.create({ tenantId: req.tenant._id, name, gradeLevel });
    res.status(201).json(cls);
  } catch (err) {
    next(err);
  }
});

router.get('/classes', requirePermission('students:read'), async (req, res, next) => {
  try {
    const classes = await Class.find({ tenantId: req.tenant._id }).sort({ gradeLevel: 1 }).lean();

    if (req.query.includeSections === 'true') {
      const sections = await Section.find({ tenantId: req.tenant._id }).lean();
      const sectionsByClass = {};
      for (const s of sections) {
        const key = s.classId.toString();
        if (!sectionsByClass[key]) sectionsByClass[key] = [];
        sectionsByClass[key].push(s);
      }
      const result = classes.map((c) => ({
        ...c,
        sections: sectionsByClass[c._id.toString()] || [],
      }));
      return res.json(result);
    }

    res.json(classes);
  } catch (err) {
    next(err);
  }
});

// ── Sections ──────────────────────────────────────────────────────────────────

router.post('/sections', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { classId, name, classTeacherId } = req.body;
    const section = await Section.create({
      tenantId: req.tenant._id,
      classId,
      name,
      classTeacherId,
    });
    res.status(201).json(section);
  } catch (err) {
    next(err);
  }
});

router.get('/sections', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.classId) filter.classId = req.query.classId;
    const sections = await Section.find(filter).sort({ name: 1 }).lean();
    res.json(sections);
  } catch (err) {
    next(err);
  }
});

router.patch('/sections/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const section = await Section.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json(section);
  } catch (err) {
    next(err);
  }
});

// ── Subjects ──────────────────────────────────────────────────────────────────

router.post('/subjects', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, code, classId, creditHours } = req.body;
    const subject = await Subject.create({
      tenantId: req.tenant._id,
      name,
      code,
      classId,
      creditHours,
    });
    res.status(201).json(subject);
  } catch (err) {
    next(err);
  }
});

router.get('/subjects', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.classId) filter.classId = req.query.classId;
    const subjects = await Subject.find(filter).sort({ name: 1 }).lean();
    res.json(subjects);
  } catch (err) {
    next(err);
  }
});

router.patch('/subjects/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!subject) return res.status(404).json({ error: 'Not found' });
    res.json(subject);
  } catch (err) {
    next(err);
  }
});

// ── Students ──────────────────────────────────────────────────────────────────

router.post('/students', requirePermission('students:write'), async (req, res, next) => {
  try {
    const { admissionNo, firstName, lastName, sectionId, dateOfBirth, gender, parentContacts } =
      req.body;
    const tenantId = req.tenant._id;

    const existing = await Student.findOne({ tenantId, admissionNo });
    if (existing) return res.status(409).json({ error: 'Admission number already exists' });

    const student = await Student.create({
      tenantId,
      admissionNo,
      firstName,
      lastName,
      sectionId,
      dateOfBirth,
      gender,
      parentContacts,
    });
    res.status(201).json(student);
  } catch (err) {
    next(err);
  }
});

router.get('/students', requirePermission('students:read'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const filter = buildStudentFilter(req.tenant._id, req.query);

    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort({ lastName: 1, firstName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    res.json({ students, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/students/:id', requirePermission('students:read'), async (req, res, next) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, tenantId: req.tenant._id }).lean();
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch (err) {
    next(err);
  }
});

router.patch('/students/:id', requirePermission('students:write'), async (req, res, next) => {
  try {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/students/import',
  requirePermission('students:write'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const records = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const tenantId = req.tenant._id;
      let created = 0;
      let skipped = 0;
      const errors = [];

      for (const row of records) {
        try {
          const {
            admissionNo,
            firstName,
            lastName,
            sectionId: sectionName,
            dateOfBirth,
            gender,
          } = row;

          if (!admissionNo || !firstName || !lastName) {
            errors.push({ row, reason: 'Missing required fields' });
            continue;
          }

          const existing = await Student.findOne({ tenantId, admissionNo });
          if (existing) {
            skipped++;
            continue;
          }

          let resolvedSectionId;
          if (sectionName) {
            const section = await Section.findOne({ tenantId, name: sectionName });
            if (section) resolvedSectionId = section._id;
          }

          await Student.create({
            tenantId,
            admissionNo,
            firstName,
            lastName,
            sectionId: resolvedSectionId,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            gender: gender || undefined,
          });
          created++;
        } catch (rowErr) {
          errors.push({ row, reason: rowErr.message });
        }
      }

      res.json({ created, skipped, errors });
    } catch (err) {
      next(err);
    }
  }
);

// ── Timetable ─────────────────────────────────────────────────────────────────

router.post('/timetable', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const {
      academicYearId,
      sectionId,
      subjectId,
      teacherId,
      dayOfWeek,
      periodNumber,
      startTime,
      endTime,
    } = req.body;
    const tenantId = req.tenant._id;

    const teacherConflict = await Timetable.findOne({
      tenantId,
      academicYearId,
      teacherId,
      dayOfWeek,
      periodNumber,
    });
    if (teacherConflict)
      return res.status(409).json({ error: 'Teacher already has a class at this time' });

    const sectionConflict = await Timetable.findOne({
      tenantId,
      academicYearId,
      sectionId,
      dayOfWeek,
      periodNumber,
    });
    if (sectionConflict)
      return res.status(409).json({ error: 'Section already has a class at this period' });

    const entry = await Timetable.create({
      tenantId,
      academicYearId,
      sectionId,
      subjectId,
      teacherId,
      dayOfWeek,
      periodNumber,
      startTime,
      endTime,
    });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

router.get('/timetable', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.sectionId) filter.sectionId = req.query.sectionId;
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    if (req.query.yearId) filter.academicYearId = req.query.yearId;

    const entries = await Timetable.find(filter)
      .populate('subjectId', 'name code')
      .populate('sectionId', 'name')
      .populate('teacherId', 'firstName lastName email')
      .sort({ dayOfWeek: 1, periodNumber: 1 })
      .lean();

    res.json(entries);
  } catch (err) {
    next(err);
  }
});

router.delete('/timetable/:id', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const entry = await Timetable.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenant._id,
    });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ── Attendance ────────────────────────────────────────────────────────────────

router.post(
  '/attendance',
  requirePermission('attendance:write'),
  validate(markAttendanceSchema),
  async (req, res, next) => {
    try {
      const { date, sectionId, subjectId, records } = req.body;
      const tenantId = req.tenant._id;
      const markedBy = req.user.sub;
      const normalizedSubjectId = subjectId ?? null;

      const ops = records.map(({ entityId, status, note }) => ({
        updateOne: {
          filter: {
            tenantId,
            date,
            entityType: 'student',
            entityId,
            subjectId: normalizedSubjectId,
          },
          update: {
            $set: {
              tenantId,
              date,
              entityType: 'student',
              entityId,
              sectionId,
              subjectId: normalizedSubjectId,
              status,
              markedBy,
              note,
            },
          },
          upsert: true,
        },
      }));

      await AttendanceRecord.bulkWrite(ops);
      res.json({ saved: ops.length });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/attendance', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    const query = attendanceQuerySchema.parse(req.query);
    const filter = { tenantId: req.tenant._id };
    if (query.sectionId) filter.sectionId = query.sectionId;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.subjectId) filter.subjectId = query.subjectId;
    if (query.date) filter.date = query.date;
    if (query.from || query.to) {
      filter.date = {};
      if (query.from) filter.date.$gte = query.from;
      if (query.to) filter.date.$lte = query.to;
    }

    const records = await AttendanceRecord.find(filter).sort({ date: -1 }).lean();
    res.json(records);
  } catch (err) {
    next(err);
  }
});

router.get('/attendance/report', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    const query = attendanceReportQuerySchema.parse(req.query);
    const tenantId = req.tenant._id;
    const to = query.to ?? new Date();
    const from =
      query.from ?? new Date(to.getTime() - DEFAULT_REPORT_RANGE_DAYS * 24 * 60 * 60 * 1000);

    const recordFilter = {
      tenantId,
      sectionId: query.sectionId,
      entityType: 'student',
      date: { $gte: from, $lte: to },
    };
    if (query.subjectId) recordFilter.subjectId = query.subjectId;

    const [students, records] = await Promise.all([
      Student.find({ tenantId, sectionId: query.sectionId, status: 'active' })
        .sort({ lastName: 1, firstName: 1 })
        .lean(),
      AttendanceRecord.find(recordFilter).lean(),
    ]);

    const { students: studentStats, classAveragePct } = computeAttendanceStats(
      students,
      records,
      DEFAULTER_THRESHOLD_PCT
    );

    res.json({
      from,
      to,
      thresholdPct: DEFAULTER_THRESHOLD_PCT,
      classAveragePct,
      students: studentStats,
    });
  } catch (err) {
    next(err);
  }
});

// ── Grades ────────────────────────────────────────────────────────────────────

function lockKey({ sectionId, subjectId, termId, assessmentType }) {
  return `${sectionId}:${subjectId}:${termId}:${assessmentType}`;
}

// Builds bulkWrite ops for a batch of already-validated grade rows, after
// checking every distinct {sectionId,subjectId,termId,assessmentType} scope
// touched by the batch against GradeLock — shared by the manual save route
// and the CSV import route so the lock-check/letterGrade-recompute logic
// isn't duplicated between them.
async function buildGradeUpsertOps(tenantId, gradedBy, rows) {
  const scopes = [...new Map(rows.map((r) => [lockKey(r), r])).values()];
  const locks = await GradeLock.find({
    tenantId,
    $or: scopes.map(({ sectionId, subjectId, termId, assessmentType }) => ({
      sectionId,
      subjectId,
      termId,
      assessmentType,
    })),
  }).lean();
  const lockedKeys = new Set(locks.map(lockKey));

  const lockedRows = rows.filter((r) => lockedKeys.has(lockKey(r)));
  if (lockedRows.length > 0) {
    return {
      error: 'Grades are locked for one or more selected scopes',
      lockedKeys: [...lockedKeys],
    };
  }

  const ops = rows.map((row) => ({
    updateOne: {
      filter: {
        tenantId,
        studentId: row.studentId,
        subjectId: row.subjectId,
        termId: row.termId,
        assessmentType: row.assessmentType,
      },
      update: {
        $set: {
          tenantId,
          studentId: row.studentId,
          sectionId: row.sectionId,
          subjectId: row.subjectId,
          termId: row.termId,
          academicYearId: row.academicYearId,
          assessmentType: row.assessmentType,
          score: row.score,
          letterGrade: scoreToLetter(row.score),
          weightage: row.weightage ?? 1,
          gradedBy,
          remarks: row.remarks,
        },
      },
      upsert: true,
    },
  }));

  return { ops };
}

router.post(
  '/grades',
  requirePermission('grades:write'),
  validate(saveGradesSchema),
  async (req, res, next) => {
    try {
      const { grades } = req.body;
      const tenantId = req.tenant._id;
      const gradedBy = req.user.sub;

      const { ops, error, lockedKeys } = await buildGradeUpsertOps(tenantId, gradedBy, grades);
      if (error) return res.status(409).json({ error, lockedKeys });

      await Grade.bulkWrite(ops);

      await auditLog({
        actorId: gradedBy,
        tenantId: tenantId.toString(),
        action: 'grades.save',
        target: { model: 'Grade', id: null },
        after: { count: ops.length },
        ip: req.ip,
      });

      res.json({ saved: ops.length });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/grades', requirePermission('grades:read'), async (req, res, next) => {
  try {
    const query = gradesQuerySchema.parse(req.query);
    const filter = { tenantId: req.tenant._id };
    if (query.studentId) filter.studentId = query.studentId;
    if (query.sectionId) filter.sectionId = query.sectionId;
    if (query.subjectId) filter.subjectId = query.subjectId;
    if (query.termId) filter.termId = query.termId;
    if (query.assessmentType) filter.assessmentType = query.assessmentType;

    const grades = await Grade.find(filter)
      .populate('studentId', 'firstName lastName admissionNo')
      .populate('subjectId', 'name code')
      .lean();

    res.json(grades);
  } catch (err) {
    next(err);
  }
});

router.get('/grades/report', requirePermission('grades:read'), async (req, res, next) => {
  try {
    const { sectionId, subjectId, termId, assessmentType } = gradesReportQuerySchema.parse(
      req.query
    );
    const tenantId = req.tenant._id;

    const [students, grades] = await Promise.all([
      Student.find({ tenantId, sectionId }).lean(),
      Grade.find({
        tenantId,
        sectionId,
        subjectId,
        termId,
        ...(assessmentType ? { assessmentType } : {}),
      }).lean(),
    ]);

    res.json(computeGradeStats(students, grades));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/grades/import',
  requirePermission('grades:write'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const { sectionId, subjectId, termId, academicYearId, assessmentType } = req.body;
      if (!sectionId || !subjectId || !termId || !academicYearId) {
        return res
          .status(400)
          .json({ error: 'sectionId, subjectId, termId, academicYearId required' });
      }

      const records = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const tenantId = req.tenant._id;
      const gradedBy = req.user.sub;
      const errors = [];
      const rows = [];

      for (const row of records) {
        try {
          const { admissionNo, score, remarks } = row;
          if (!admissionNo || score === undefined || score === '') {
            errors.push({ row, reason: 'Missing admissionNo or score' });
            continue;
          }

          const student = await Student.findOne({ tenantId, admissionNo });
          if (!student) {
            errors.push({ row, reason: 'Unknown admissionNo' });
            continue;
          }

          const parsed = saveGradesSchema.shape.grades.element.parse({
            studentId: student._id.toString(),
            sectionId,
            subjectId,
            termId,
            academicYearId,
            assessmentType: assessmentType || 'final',
            score,
            remarks: remarks || undefined,
          });
          rows.push(parsed);
        } catch (rowErr) {
          errors.push({ row, reason: rowErr.message });
        }
      }

      let saved = 0;
      if (rows.length > 0) {
        const { ops, error, lockedKeys } = await buildGradeUpsertOps(tenantId, gradedBy, rows);
        if (error) return res.status(409).json({ error, lockedKeys });
        await Grade.bulkWrite(ops);
        saved = ops.length;
      }

      await auditLog({
        actorId: gradedBy,
        tenantId: tenantId.toString(),
        action: 'grades.import',
        target: { model: 'Grade', id: null },
        after: { saved, errors: errors.length },
        ip: req.ip,
      });

      res.json({ saved, errors });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/grades/lock', requirePermission('grades:read'), async (req, res, next) => {
  try {
    const { sectionId, subjectId, termId, assessmentType } = gradeLockSchema.parse(req.query);
    const lock = await GradeLock.findOne({
      tenantId: req.tenant._id,
      sectionId,
      subjectId,
      termId,
      assessmentType,
    }).lean();

    res.json({ locked: Boolean(lock), lock: lock ?? null });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/grades/lock',
  requirePermission('grades:publish'),
  validate(gradeLockSchema),
  async (req, res, next) => {
    try {
      const { sectionId, subjectId, termId, assessmentType } = req.body;
      const tenantId = req.tenant._id;

      const lock = await GradeLock.findOneAndUpdate(
        { tenantId, sectionId, subjectId, termId, assessmentType },
        { $setOnInsert: { publishedAt: new Date(), publishedBy: req.user.sub } },
        { upsert: true, new: true }
      );

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'grades.lock',
        target: { model: 'GradeLock', id: lock._id },
        ip: req.ip,
      });

      res.json(lock);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/grades/unlock',
  requirePermission('grades:publish'),
  validate(gradeLockSchema),
  async (req, res, next) => {
    try {
      const { sectionId, subjectId, termId, assessmentType } = req.body;
      const tenantId = req.tenant._id;

      await GradeLock.deleteOne({ tenantId, sectionId, subjectId, termId, assessmentType });

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'grades.unlock',
        target: { model: 'GradeLock', id: null },
        after: { sectionId, subjectId, termId, assessmentType },
        ip: req.ip,
      });

      res.json({ unlocked: true });
    } catch (err) {
      next(err);
    }
  }
);

// ── Report Card ───────────────────────────────────────────────────────────────

router.post('/report-card/generate', requirePermission('grades:read'), async (req, res, next) => {
  try {
    const { termId, sectionId } = req.body;
    const job = await reportCardQueue.add('generate', {
      tenantId: req.tenant._id.toString(),
      termId,
      sectionId,
      requestedBy: req.user.sub,
    });
    res.json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/report-card/status/:jobId',
  requirePermission('grades:read'),
  async (req, res, next) => {
    try {
      const job = await reportCardQueue.getJob(req.params.jobId);
      if (!job || job.data?.tenantId !== req.tenant._id.toString()) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const state = await job.getState();
      const result = job.returnvalue;

      res.json({ jobId: job.id, state, result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
